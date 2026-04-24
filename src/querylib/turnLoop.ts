import Anthropic from '@anthropic-ai/sdk';
import { appendLogRecord } from '../log.js';
import type { ChatMessage, TurnEvent } from '../query.js';
import { buildApiMessages, getTextBlocks, getToolUseBlocks, jsonSafeClone } from './engine.js';

export type TurnToolResult = {
  content: string;
  isError?: boolean;
};

export type RunTurnLoopDeps = {
  history: ChatMessage[];
  model: string;
  maxTokens: number;
  maxToolLoops: number;
  enableTools: boolean;
  logPath: string;
  tools: Anthropic.Tool[];
  systemPrompt?: string;
  baseURL?: string;
  requestMessage: (loop: number, payload: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  executeTool: (name: string, input: unknown) => Promise<TurnToolResult>;
  emit: (event: TurnEvent) => void;
};

export async function* runTurnLoop(deps: RunTurnLoopDeps): AsyncGenerator<string> {
  const apiMessages = buildApiMessages(deps.history);

  appendLogRecord(
    {
      kind: 'session_start',
      model: deps.model,
      baseURL: deps.baseURL ?? null,
      maxTokens: deps.maxTokens,
      enableTools: deps.enableTools,
      history: jsonSafeClone(deps.history),
    },
    deps.logPath,
  );

  try {
    for (let loop = 0; loop <= deps.maxToolLoops; loop += 1) {
      const requestPayload: Anthropic.MessageCreateParamsNonStreaming = {
        model: deps.model,
        max_tokens: deps.maxTokens,
        messages: apiMessages,
        ...(deps.systemPrompt ? { system: deps.systemPrompt } : {}),
        ...(deps.enableTools && deps.tools.length > 0 ? { tools: deps.tools } : {}),
      };

      const response = await deps.requestMessage(loop, requestPayload);

      const text = getTextBlocks(response.content);
      if (text.length > 0) {
        deps.emit({ kind: 'assistant_delta', text });
        yield text;
      }

      const toolUses = getToolUseBlocks(response.content);
      if (toolUses.length === 0) {
        appendLogRecord({ kind: 'session_end', loop, reason: 'no_tool_calls' }, deps.logPath);
        deps.emit({ kind: 'assistant_final', text });
        return;
      }

      deps.emit({ kind: 'tool_calls', toolUses });
      appendLogRecord(
        {
          kind: 'tool_calls',
          loop,
          toolUses: jsonSafeClone(toolUses),
        },
        deps.logPath,
      );

      apiMessages.push({
        role: 'assistant',
        content: response.content,
      });

      const toolResults = [] as Anthropic.ToolResultBlockParam[];
      for (const toolUse of toolUses) {
        const result = await deps.executeTool(toolUse.name, toolUse.input);
        deps.emit({
          kind: 'tool_execution',
          toolName: toolUse.name,
          toolUseId: toolUse.id,
          input: toolUse.input,
          result,
        });
        appendLogRecord(
          {
            kind: 'tool_execution',
            loop,
            toolName: toolUse.name,
            toolUseId: toolUse.id,
            input: jsonSafeClone(toolUse.input),
            result: jsonSafeClone(result),
          },
          deps.logPath,
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
        deps.logPath,
      );

      apiMessages.push({
        role: 'user',
        content: toolResults,
      });
    }

    appendLogRecord(
      {
        kind: 'session_error',
        reason: 'tool_loop_limit',
        maxToolLoops: deps.maxToolLoops,
      },
      deps.logPath,
    );
    throw new Error(`Tool loop exceeded maximum iterations (${deps.maxToolLoops}).`);
  } catch (error) {
    deps.emit({ kind: 'turn_error', error });
    throw error;
  }
}
