import { randomUUID } from 'node:crypto';
import type { AgentResult, AgentRunRequest, AgentRuntimeOptions, AgentTask } from './types.js';

export async function runAgent(
  request: AgentRunRequest,
  options: AgentRuntimeOptions,
): Promise<AgentResult> {
  const task: AgentTask = {
    id: `agent-${randomUUID().slice(0, 8)}`,
    goal: request.goal,
    input: request.input,
  };

  return options.runTask(task);
}
