import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createSession, loadCurrentSession } from '../src/history/index.js';
import { QueryEngine } from '../src/runtime/QueryEngine.js';
import { createAppStateStore } from '../src/state/AppStateStore.js';

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mini-claude-engine-'));
}

describe('QueryEngine', () => {
  // it('streams prompts and persists the turn', async () => {
  //   const rootDir = createTempRoot();
  //   const initialMessages = [
  //     { role: 'system', text: 'system prompt' },
  //     { role: 'assistant', text: 'welcome' },
  //   ] as const;
  //   const session = createSession({ rootDir, messages: [...initialMessages] });
  //   const store = createAppStateStore(session);
  //   const engine = new QueryEngine({
  //     store,
  //     exit: () => {},
  //     initialMessages: [...initialMessages],
  //     rootDir,
  //     submitMessageImpl: async function* () {
  //       yield 'hello';
  //       yield ' world';
  //     },
  //     dispatchCommandImpl: () => ({ kind: 'not_command' }),
  //     evaluateSkillRoutingImpl: (input) => ({
  //       input,
  //       normalizedInput: input.trim(),
  //       routed: false,
  //       score: 0,
  //       confidence: 0,
  //       reason: 'fallback',
  //       candidates: [],
  //       selected: null,
  //     }),
  //     formatSkillRouteAnalysisImpl: () => 'fallback',
  //     logDebugImpl: () => {},
  //   });

  //   await engine.submitInput('  how are you?  ');

  //   const snapshot = store.getSnapshot();
  //   assert.strictEqual(snapshot.isStreaming, false);
  //   assert.strictEqual(snapshot.inputBuffer, '');
  //   assert.strictEqual(snapshot.messages.at(-1)?.text, 'hello world');

  //   const loaded = loadCurrentSession({ rootDir });
  //   assert.ok(loaded, 'should persist the updated session');
  //   assert.strictEqual(loaded?.messages.at(-1)?.text, 'hello world');
  // });

  it('resets the conversation for clear commands', async () => {
    const rootDir = createTempRoot();
    const initialMessages = [
      { role: 'system', text: 'system prompt' },
      { role: 'assistant', text: 'welcome' },
    ] as const;
    const session = createSession({ rootDir, messages: [...initialMessages] });
    const store = createAppStateStore(session);
    const engine = new QueryEngine({
      store,
      exit: () => {},
      initialMessages: [...initialMessages],
      rootDir,
      submitMessageImpl: async function* () {},
      dispatchCommandImpl: () => ({ kind: 'reset_messages' }),
      evaluateSkillRoutingImpl: (input) => ({
        input,
        normalizedInput: input.trim(),
        routed: false,
        score: 0,
        confidence: 0,
        reason: 'fallback',
        candidates: [],
        selected: null,
      }),
      formatSkillRouteAnalysisImpl: () => 'fallback',
      logDebugImpl: () => {},
    });

    await engine.submitInput('/clear');

    const snapshot = store.getSnapshot();
    assert.notStrictEqual(snapshot.session.meta.id, session.meta.id);
    assert.deepStrictEqual(snapshot.messages, [...initialMessages]);
    assert.strictEqual(snapshot.inputBuffer, '');
    assert.strictEqual(snapshot.isStreaming, false);
  });
});
