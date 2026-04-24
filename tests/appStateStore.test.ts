import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createSession } from '../src/history/index.js';
import { createAppStateStore } from '../src/state/AppStateStore.js';

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mini-claude-state-'));
}

describe('AppStateStore', () => {
  it('hydrates sessions and resets transient state', () => {
    const rootDir = createTempRoot();
    const initialSession = createSession({
      rootDir,
      messages: [{ role: 'assistant', text: 'hello' }],
    });
    const store = createAppStateStore(initialSession);

    store.setInputBuffer('draft');
    store.setIsStreaming(true);
    store.setLastError('boom');

    const nextSession = createSession({
      rootDir,
      messages: [{ role: 'assistant', text: 'fresh' }],
    });
    store.hydrateSession(nextSession);

    const snapshot = store.getSnapshot();
    assert.strictEqual(snapshot.session.meta.id, nextSession.meta.id);
    assert.deepStrictEqual(snapshot.messages, nextSession.messages);
    assert.strictEqual(snapshot.inputBuffer, '');
    assert.strictEqual(snapshot.isStreaming, false);
    assert.strictEqual(snapshot.lastError, null);
  });

  it('updates messages without changing the current session', () => {
    const rootDir = createTempRoot();
    const session = createSession({
      rootDir,
      messages: [{ role: 'assistant', text: 'hello' }],
    });
    const store = createAppStateStore(session);
    const messages = [
      { role: 'assistant', text: 'hello' },
      { role: 'user', text: 'next' },
    ] as const;

    store.setMessages([...messages]);

    const snapshot = store.getSnapshot();
    assert.strictEqual(snapshot.session.meta.id, session.meta.id);
    assert.deepStrictEqual(snapshot.messages, messages);
  });
});
