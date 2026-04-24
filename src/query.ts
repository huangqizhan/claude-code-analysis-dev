// V3 refactored query layer - backward compatible entry point
// Imports from new internal modules: auth.ts, engine.ts (in querylib/)

import Anthropic from '@anthropic-ai/sdk';
import { appendLogRecord, getDefaultLogPath } from './log.js';
import { createDefaultToolRegistry, type ToolRegistry } from './tools/index.js';
import {
  resolveAuth,
  readRuntimeConfig,
  buildAuthClientConfigs,
  createAnthropicClient,
  isUnauthorizedError,
  type RuntimeConfig,
  normalizeCredential,
} from './querylib/auth.js';
import {
  serializeError,
  jsonSafeClone,
  buildApiMessages,
  getTextBlocks,
  getToolUseBlocks,
} from './querylib/engine.js';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export const DEFAULT_MODEL = 'qwen3.5-plus';
const DEFAULT_MAX_TOOL_LOOPS = 6;

export async function* submitMessage(
  history: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    apiKey?: string;
    authToken?: string;
    baseURL?: string;
    configPath?: string;
    toolRegistry?: ToolRegistry;
    maxToolLoops?: number;
    enableTools?: boolean;
    /** Override log file (default: MINI_CLAUDE_LOG or MINI_CLAUDE_LLM_LOG or /tmp/mini-claude-cli.log) */
    logPath?: string;
    /** @deprecated use logPath */
    llmLogPath?: string;
  },
): AsyncGenerator<string> {
  const logPath =
    options?.logPath?.trim() || options?.llmLogPath?.trim() || getDefaultLogPath();
  const runtimeConfig = readRuntimeConfig(options?.configPath);

  // Resolve auth with new priority: options > env > config
  const { apiKey, authToken } = resolveAuth(
    { apiKey: options?.apiKey, authToken: options?.authToken },
    runtimeConfig,
  );
  const baseURL = normalizeCredential(options?.baseURL ?? runtimeConfig.anthropicBaseUrl);
  const model = options?.model ?? runtimeConfig.model ?? DEFAULT_MODEL;

  if (!apiKey && !authToken) {
    throw new Error(
      'Missing auth credentials. Set MINI_CLAUDE_AUTH_TOKEN env var or anthropicAuthToken in config.',
    );
  }

  const maxTokens = options?.maxTokens ?? 2048;
  const maxToolLoops = options?.maxToolLoops ?? DEFAULT_MAX_TOOL_LOOPS;
  const enableTools = options?.enableTools ?? true;
  const toolRegistry = options?.toolRegistry ?? createDefaultToolRegistry();

  const systemPrompt = history.find((message) => message.role === 'system')?.text;
  const tools = enableTools ? toolRegistry.getToolDefinitionsForApi() : [];
  const apiMessages = buildApiMessages(history);

  const authClientConfigs = buildAuthClientConfigs(apiKey, authToken);

  appendLogRecord(
    {
      kind: 'session_start',
      model,
      baseURL: baseURL ?? null,
      maxTokens,
      enableTools,
      history: jsonSafeClone(history),
    },
    logPath,
  );

  for (let loop = 0; loop <= maxToolLoops; loop += 1) {
    const requestPayload: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      messages: apiMessages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(tools.length > 0 ? { tools } : {}),
    };

    let response: Anthropic.Message | undefined;
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
          payload: jsonSafeClone(requestPayload),
        },
        logPath,
      );

      try {
        response = await client.messages.create(requestPayload);
        appendLogRecord(
          {
            kind: 'response',
            loop,
            authAttempt,
            message: jsonSafeClone(response),
          },
          logPath,
        );
        break;
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

    if (!response) {
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
    }

    const text = getTextBlocks(response.content);
    if (text.length > 0) {
      yield text;
    }

    const toolUses = getToolUseBlocks(response.content);
    if (toolUses.length === 0) {
      appendLogRecord({ kind: 'session_end', loop, reason: 'no_tool_calls' }, logPath);
      return;
    }

    appendLogRecord(
      {
        kind: 'tool_calls',
        loop,
        toolUses: jsonSafeClone(toolUses),
      },
      logPath,
    );

    apiMessages.push({
      role: 'assistant',
      content: response.content,
    });

    const toolResults = [] as Anthropic.ToolResultBlockParam[];
    for (const toolUse of toolUses) {
      const result = await toolRegistry.executeTool(toolUse.name, toolUse.input);
      appendLogRecord(
        {
          kind: 'tool_execution',
          loop,
          toolName: toolUse.name,
          toolUseId: toolUse.id,
          input: jsonSafeClone(toolUse.input),
          result: jsonSafeClone(result),
        },
        logPath,
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      });
    }

    appendLogRecord(
      {
        kind: 'tool_results_message',
        loop,
        toolResults: jsonSafeClone(toolResults),
      },
      logPath,
    );

    apiMessages.push({
      role: 'user',
      content: toolResults,
    });
  }

  appendLogRecord(
    { kind: 'session_error', reason: 'tool_loop_limit', maxToolLoops },
    logPath,
  );
  throw new Error(`Tool loop exceeded maximum iterations (${maxToolLoops}).`);
}
