import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  listMemories,
  readMemory,
  searchMemories,
  writeMemory,
} from '../src/memory/index.js';

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mini-claude-memory-'));
}

describe('memory store', () => {
  it('writes and reads memory entries', () => {
    const rootDir = createTempRoot();
    const entry = writeMemory(
      {
        name: 'Claude Learning Goal',
        description: 'Systematic Claude Code study plan',
        type: 'user',
        content: 'Focus on agent design and iteration.',
      },
      { rootDir },
    );

    const loaded = readMemory('Claude Learning Goal', { rootDir });
    assert.ok(loaded, 'should read saved memory');
    assert.deepStrictEqual(loaded, entry);
  });

  it('lists and searches memories', () => {
    const rootDir = createTempRoot();
    writeMemory(
      {
        name: 'Agent Focus',
        description: 'Study agent loops',
        type: 'feedback',
        content: 'Keep the work centered on agent orchestration.',
      },
      { rootDir },
    );
    writeMemory(
      {
        name: 'Bridge Notes',
        description: 'External integrations',
        type: 'reference',
        content: 'MCP and bridges come later.',
      },
      { rootDir },
    );

    const memories = listMemories({ rootDir });
    assert.strictEqual(memories.length, 2);
    assert.deepStrictEqual(
      memories.map((entry) => entry.name).sort(),
      ['Agent Focus', 'Bridge Notes'],
    );

    const results = searchMemories('agent', { rootDir });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'Agent Focus');
  });
});
