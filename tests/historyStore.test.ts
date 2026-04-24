import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createSession, createOrLoadCurrentSession, loadCurrentSession } from '../src/history/index.js';

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mini-claude-history-'));
}

describe('history store', () => {
  it('creates current session when none exists', () => {
    const rootDir = createTempRoot();
    const session = createOrLoadCurrentSession({
      rootDir,
      messages: [{ role: 'assistant', text: 'hello' }],
    });

    const loaded = loadCurrentSession({ rootDir });
    assert.ok(loaded, 'should persist current session');
    assert.strictEqual(loaded?.meta.id, session.meta.id);
    assert.strictEqual(loaded?.messages.length, 1);
  });

  it('loads the current session from disk', () => {
    const rootDir = createTempRoot();
    const created = createSession({
      rootDir,
      messages: [{ role: 'assistant', text: 'hello' }],
    });

    const loaded = loadCurrentSession({ rootDir });
    assert.ok(loaded, 'should load current session');
    assert.strictEqual(loaded?.meta.id, created.meta.id);
    assert.deepStrictEqual(loaded?.messages, created.messages);
  });
});
