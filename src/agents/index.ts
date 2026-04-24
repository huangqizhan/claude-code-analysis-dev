import type { AgentRunRequest, AgentRuntimeOptions } from './types.js';
import { runAgent } from './runtime.js';

export async function runSimpleAgent(request: AgentRunRequest, options: AgentRuntimeOptions) {
  return runAgent(request, options);
}
