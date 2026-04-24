import Anthropic from '@anthropic-ai/sdk';
import { appendLogRecord, getDefaultLogPath } from './log.js';
import { createDefaultToolRegistry, type ToolRegistry } from './tools/index.js';
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
  | { kind: 'tool_execution'; toolName: string; toolUseId: string; input: unknown; result: { content: string; isError?: boolean } }
  | { kind: 'assistant_final'; text: string }
  | { kind: 'turn_error'; error: unknown };

type SubmitMessageOptions = {
  model?: string;
  maxTokens?: number;
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  configPath?: string;
  toolRegistry?: ToolRegistry;
  maxToolLoops?: number;
  enableTools?: boolean;
  logPath?: string;
  llmLogPath?: string;
  emit?: (event: TurnEvent) => void;
};

export async function* submitMessage(history: ChatMessage[], options?: SubmitMessageOptions): AsyncGenerator<string> {
  const logPath = options?.logPath?.trim() || options?.llmLogPath?.trim() || getDefaultLogPath();
  const toolRegistry = options?.toolRegistry ?? createDefaultToolRegistry();
  const runtimeConfig = readRuntimeConfig(options?.configPath);
  const { apiKey, authToken } = resolveAuth({ apiKey: options?.apiKey, authToken: options?.authToken }, runtimeConfig);
  const baseURL = normalizeCredential(options?.baseURL);

  if (!apiKey && !authToken) {
    throw new Error('Missing auth credentials. Set MINI_CLAUDE_AUTH_TOKEN env var or anthropicAuthToken in config.');
  }

  const authClientConfigs = buildAuthClientConfigs(apiKey, authToken);
  const systemPrompt = history.find((message) => message.role === 'system')?.text;
  const tools = options?.enableTools ?? true ? toolRegistry.getToolDefinitionsForApi() : [];

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
    model: options?.model ?? DEFAULT_MODEL,
    maxTokens: options?.maxTokens ?? 2048,
    baseURL,
    maxToolLoops: options?.maxToolLoops ?? DEFAULT_MAX_TOOL_LOOPS,
    enableTools: options?.enableTools ?? true,
    logPath,
    tools,
    systemPrompt,
    requestMessage,
    executeTool: (name, input) => toolRegistry.executeTool(name, input),
    emit: options?.emit ?? (() => {}),
  });
}

