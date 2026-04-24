import assert from 'node:assert';
import { describe, it } from 'node:test';
import { dispatchCommand } from '../src/commands/dispatcher.js';

describe('dispatchCommand', () => {
  const ctx = { exit: () => {} };

  it('returns not_command for non-slash input', () => {
    const result = dispatchCommand('hello', ctx);
    assert.strictEqual(result.kind, 'not_command');
  });

  it('handles /help command', () => {
    const result = dispatchCommand('/help', ctx);
    assert.strictEqual(result.kind, 'append_assistant');
    if (result.kind === 'append_assistant') {
      assert.ok(result.text.toLowerCase().includes('command'), 'should mention commands');
      assert.ok(result.text.includes('/skills'), 'should mention skills command');
      assert.ok(result.text.includes('/skills route <text>'), 'should mention skills route command');
    }
  });
});
