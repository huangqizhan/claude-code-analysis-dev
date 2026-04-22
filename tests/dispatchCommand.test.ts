// Test: Command dispatcher
import { describe, it } from 'node:test';
import { dispatchCommand } from '../src/commands/dispatcher.js';
import assert from 'node:assert';

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

  it('handles /clear command', () => {
    const result = dispatchCommand('/clear', ctx);
    assert.strictEqual(result.kind, 'reset_messages');
  });

  it('handles /exit command', () => {
    const result = dispatchCommand('/exit', ctx);
    assert.strictEqual(result.kind, 'exit');
  });

  it('lists skills with /skills', () => {
    const result = dispatchCommand('/skills', ctx);
    assert.strictEqual(result.kind, 'append_assistant');
    if (result.kind === 'append_assistant') {
      assert.ok(result.text.includes('[builtin]'), 'should label builtin skills');
      assert.ok(result.text.includes('[file]'), 'should label file skills');
      assert.ok(result.text.includes('aliases='), 'should show routing metadata');
    }
  });

  it('dry-runs routing with /skills route', () => {
    const result = dispatchCommand('/skills route Write tests for this module', ctx);
    assert.strictEqual(result.kind, 'append_assistant');
    if (result.kind === 'append_assistant') {
      assert.ok(result.text.includes('Selected: /write-tests'), 'should include selected skill');
      assert.ok(result.text.includes('Top candidates:'), 'should include candidate summary');
    }
  });

  it('shows usage for /skills route without text', () => {
    const result = dispatchCommand('/skills route', ctx);
    assert.strictEqual(result.kind, 'append_assistant');
    if (result.kind === 'append_assistant') {
      assert.ok(result.text.includes('Usage: /skills route <text>'), 'should show usage');
    }
  });

  it('builds a skill prompt with /skill', () => {
    const result = dispatchCommand('/skill explain-code src/index.tsx', ctx);
    assert.strictEqual(result.kind, 'submit_prompt');
    if (result.kind === 'submit_prompt') {
      assert.ok(result.text.includes('Explain this code clearly and concisely'), 'should build skill prompt');
      assert.ok(result.text.includes('src/index.tsx'), 'should include target path');
    }
  });

  it('returns usage for /skill without a name', () => {
    const result = dispatchCommand('/skill', ctx);
    assert.strictEqual(result.kind, 'append_assistant');
    if (result.kind === 'append_assistant') {
      assert.ok(result.text.includes('Usage: /skill <name> [args...]'), 'should show usage');
    }
  });

  it('returns error for unknown skill', () => {
    const result = dispatchCommand('/skill unknown', ctx);
    assert.strictEqual(result.kind, 'append_assistant');
    if (result.kind === 'append_assistant') {
      assert.ok(result.text.includes('Unknown skill'), 'should mention unknown skill');
    }
  });

  it('returns error for unknown command', () => {
    const result = dispatchCommand('/unknown_cmd', ctx);
    assert.strictEqual(result.kind, 'append_assistant');
    if (result.kind === 'append_assistant') {
      assert.ok(result.text.includes('Unknown command'), 'should mention unknown command');
    }
  });
});
