import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { runTurnLoop } from '../src/querylib/turnLoop.js';
import type { TurnEvent } from '../src/query.js';

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mini-claude-turn-'));
}

function makeTextResponse(text: string): Anthropic.Message {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: 'text', text, citations: [] }],
  } as Anthropic.Message;
}

function makeToolResponse(): Anthropic.Message {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [
      { type: 'text', text: 'use tool', citations: [] },
      { type: 'tool_use', id: 'tool-1', name: 'echo', input: { value: 'hi' } },
    ],
  } as Anthropic.Message;
}

describe('runTurnLoop', () => {
  it('streams text and finalizes without tool calls', async () => {
    const rootDir = createTempRoot();
    const events: TurnEvent[] = [];
    const requestCalls: Array<{ loop: number; payload: Anthropic.MessageCreateParamsNonStreaming }> = [];
    const history = [
      { role: 'system', text: 'system prompt' },
      { role: 'user', text: 'hello' },
    ] as const;

    const chunks: string[] = [];
    for await (const chunk of runTurnLoop({
      history: [...history],
      model: 'test-model',
      maxTokens: 32,
      maxToolLoops: 2,
      enableTools: true,
      logPath: path.join(rootDir, 'turn.log'),
      tools: [],
      requestMessage: async (loop, payload) => {
        requestCalls.push({ loop, payload });
        return makeTextResponse('hello world');
      },
      executeTool: async () => {
        throw new Error('should not be called');
      },
      emit: (event) => {
        events.push(event);
      },
    })) {
      chunks.push(chunk);
    }

    assert.deepStrictEqual(chunks, ['hello world']);
    assert.strictEqual(requestCalls.length, 1);
    assert.strictEqual(requestCalls[0]?.loop, 0);
    assert.deepStrictEqual(requestCalls[0]?.payload.messages, [{ role: 'user', content: 'hello' }]);
    assert.deepStrictEqual(events, [
      { kind: 'assistant_delta', text: 'hello world' },
      { kind: 'assistant_final', text: 'hello world' },
    ]);
  });

  it('runs tool calls and re-requests the model', async () => {
    const rootDir = createTempRoot();
    const events: TurnEvent[] = [];
    const requestCalls: Array<{ loop: number; payload: Anthropic.MessageCreateParamsNonStreaming }> = [];
    const toolCalls: Array<{ name: string; input: unknown }> = [];

    const chunks: string[] = [];
    for await (const chunk of runTurnLoop({
      history: [{ role: 'user', text: 'plan' }],
      model: 'test-model',
      maxTokens: 32,
      maxToolLoops: 2,
      enableTools: true,
      logPath: path.join(rootDir, 'turn.log'),
      tools: [
        {
          name: 'echo',
          description: 'Echo input',
          input_schema: { type: 'object', properties: {}, additionalProperties: true },
        },
      ],
      requestMessage: async (loop, payload) => {
        requestCalls.push({ loop, payload });
        if (loop === 0) {
          return makeToolResponse();
        }
        return makeTextResponse('done');
      },
      executeTool: async (name, input) => {
        toolCalls.push({ name, input });
        return { content: 'tool-ok' };
      },
      emit: (event) => {
        events.push(event);
      },
    })) {
      chunks.push(chunk);
    }

    assert.deepStrictEqual(chunks, ['use tool', 'done']);
    assert.strictEqual(requestCalls.length, 2);
    assert.strictEqual(requestCalls[0]?.loop, 0);
    assert.strictEqual(requestCalls[1]?.loop, 1);
    assert.deepStrictEqual(toolCalls, [{ name: 'echo', input: { value: 'hi' } }]);
    assert.deepStrictEqual(events, [
      { kind: 'assistant_delta', text: 'use tool' },
      { kind: 'tool_calls', toolUses: [{ type: 'tool_use', id: 'tool-1', name: 'echo', input: { value: 'hi' } }] },
      {
        kind: 'tool_execution',
        toolName: 'echo',
        toolUseId: 'tool-1',
        input: { value: 'hi' },
        result: { content: 'tool-ok' },
      },
      { kind: 'assistant_delta', text: 'done' },
      { kind: 'assistant_final', text: 'done' },
    ]);
  });
});
