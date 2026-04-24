import assert from 'node:assert';
import { describe, it } from 'node:test';
import { runAgent } from '../src/agents/runtime.js';

describe('agent runtime', () => {
  it('builds a task and delegates to the runner', async () => {
    const result = await runAgent(
      { goal: 'summarize code', input: 'src/index.tsx' },
      {
        runTask: async (task) => ({
          taskId: task.id,
          output: `${task.goal}: ${task.input}`,
          done: true,
        }),
      },
    );

    assert.ok(result.taskId.startsWith('agent-'));
    assert.strictEqual(result.output, 'summarize code: src/index.tsx');
    assert.strictEqual(result.done, true);
  });

});
