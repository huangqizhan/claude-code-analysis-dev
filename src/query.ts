import Anthropic from '@anthropic-ai/sdk';
import { appendLogRecord, getDefaultLogPath } from './log.js';
import { createDefaultToolRegistry, createToolRegistryFromSources, type ToolRegistry, type McpToolSource } from './tools/index.js';
import { createToolExecutionController } from './tools/controller.js';
import { createAnthropicClient, buildAuthClientConfigs, isUnauthorizedError, normalizeCredential, readRuntimeConfig, resolveAuth } from './querylib/auth.js';
import { jsonSafeClone, serializeError } from './querylib/engine.js';
import { runTurnLoop } from './querylib/turnLoop.js';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export const DEFAULT_MODEL = 'qwen3.5-plus';
const DEFAULT_MAX_TOOL_LOOPS = 6;

export type TurnEvent =
  | { kind: 'assistant_delta'; text: string }
  | { kind: 'tool_calls'; toolUses: Anthropic.ToolUseBlock[] }
  | { kind: 'tool_policy_checked'; toolName: string; toolUseId: string; input: unknown; allowed: boolean }
  | { kind: 'tool_execution_started'; toolName: string; toolUseId: string; input: unknown }
  | { kind: 'tool_execution'; toolName: string; toolUseId: string; input: unknown; result: { content: string; isError?: boolean } }
  | { kind: 'tool_execution_finished'; toolName: string; toolUseId: string; input: unknown; result: { content: string; isError?: boolean } }
  | { kind: 'tool_execution_denied'; toolName: string; toolUseId: string; input: unknown; result: { content: string; isError?: boolean } }
  | { kind: 'tool_execution_failed'; toolName: string; toolUseId: string; input: unknown; result: { content: string; isError?: boolean } }
  | { kind: 'assistant_final'; text: string }
  | { kind: 'turn_error'; error: unknown };


export type RuntimeEvent =
  | { kind: 'assistant_delta'; text: string }
  | { kind: 'tool_calls'; toolUses: Anthropic.ToolUseBlock[] }
  | { kind: 'tool_execution'; toolName: string; toolUseId: string; input: unknown; result: { content: string; isError?: boolean } }
  | { kind: 'assistant_final'; text: string }
  | { kind: 'turn_error'; error: unknown }
  | { kind: 'input_received'; input: string; trimmed: string }
  | {
      kind: 'command_result';
      input: string;
      result: 'append_assistant' | 'submit_prompt' | 'reset_messages' | 'exit' | 'not_command';
    }
  | { kind: 'skill_route_evaluated'; input: string; routed: boolean; prompt: string | null }
  | { kind: 'prompt_submitted'; prompt: string; source: 'raw' | 'command' | 'skill' }
  | { kind: 'turn_started'; prompt: string }
  | { kind: 'turn_finished'; prompt: string; assistantText: string }
  | { kind: 'turn_failed'; prompt: string; error: string }
  | { kind: 'assistant_reply_appended'; userText: string; assistantText: string }
  | { kind: 'conversation_reset'; sessionId: string }
  | { kind: 'conversation_ignored'; input: string; reason: 'empty' | 'streaming' };

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export type RuntimeEventBus = {
  publish: (event: RuntimeEvent) => void;
  subscribe: (listener: RuntimeEventListener) => () => void;
};

export function createRuntimeEventBus(): RuntimeEventBus {
  const listeners = new Set<RuntimeEventListener>();

  return {
    publish: (event) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type SubmitMessageOptions = {
  model?: string;
  maxTokens?: number;
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  configPath?: string;
  toolRegistry?: ToolRegistry;
  mcpToolSources?: McpToolSource[];
  maxToolLoops?: number;
  enableTools?: boolean;
  logPath?: string;
  llmLogPath?: string;
  emit?: (event: TurnEvent) => void;
};

export async function* submitMessage(history: ChatMessage[], options?: SubmitMessageOptions): AsyncGenerator<string> {
  const logPath = options?.logPath?.trim() || options?.llmLogPath?.trim() || getDefaultLogPath();
  const toolRegistry =
    options?.toolRegistry ??
    (options?.mcpToolSources ? await createToolRegistryFromSources(options.mcpToolSources) : createDefaultToolRegistry());
  const runtimeConfig = readRuntimeConfig(options?.configPath);
  const { apiKey, authToken } = resolveAuth({ apiKey: options?.apiKey, authToken: options?.authToken }, runtimeConfig);
  const baseURL = normalizeCredential(options?.baseURL) ?? runtimeConfig.anthropicBaseUrl;
  const model = options?.model ?? runtimeConfig.model ?? DEFAULT_MODEL;

  if (!apiKey && !authToken) {
    throw new Error('Missing auth credentials. Set MINI_CLAUDE_AUTH_TOKEN env var or anthropicAuthToken in config.');
  }

  const authClientConfigs = buildAuthClientConfigs(apiKey, authToken);
  const systemPrompt = history.find((message) => message.role === 'system')?.text;
  const emit = options?.emit ?? (() => {});
  const toolController = createToolExecutionController(toolRegistry, emit);
  const tools = options?.enableTools ?? true ? toolController.getToolDefinitionsForApi() : [];

  const requestMessage = async (
    loop: number,
    payload: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> => {
    let lastError: unknown;
    let authAttempt = 0;

    for (const authConfig of authClientConfigs) {
      authAttempt += 1;
      const client = createAnthropicClient(authConfig, baseURL);

      appendLogRecord(
        {
          kind: 'request',
          loop,
          authAttempt,
          authMode: authConfig.apiKey ? 'x-api-key' : 'bearer',
          payload: jsonSafeClone(payload),
        },
        logPath,
      );

      try {
        const response = await client.messages.create(payload);
        appendLogRecord(
          {
            kind: 'response',
            loop,
            authAttempt,
            message: jsonSafeClone(response),
          },
          logPath,
        );
        return response;
      } catch (error) {
        appendLogRecord(
          {
            kind: 'request_error',
            loop,
            authAttempt,
            error: serializeError(error),
          },
          logPath,
        );

        if (!isUnauthorizedError(error)) {
          throw error;
        }

        lastError = error;
      }
    }

    appendLogRecord(
      {
        kind: 'session_error',
        loop,
        message: 'All auth attempts failed',
        error: lastError !== undefined ? serializeError(lastError) : null,
      },
      logPath,
    );
    throw lastError;
  };

  yield* runTurnLoop({
    history,
    model,
    maxTokens: options?.maxTokens ?? 2048,
    baseURL,
    maxToolLoops: options?.maxToolLoops ?? DEFAULT_MAX_TOOL_LOOPS,
    enableTools: options?.enableTools ?? true,
    logPath,
    tools,
    systemPrompt,
    requestMessage,
    executeTool: (context) => toolController.executeTool(context),
    emit,
  });
}

