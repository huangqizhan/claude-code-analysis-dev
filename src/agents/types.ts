export type AgentTask = {
  id: string;
  goal: string;
  input: string;
};

export type AgentResult = {
  taskId: string;
  output: string;
  done: boolean;
};

export type AgentRuntimeOptions = {
  runTask: (task: AgentTask) => Promise<AgentResult>;
};

export type AgentRunRequest = {
  goal: string;
  input: string;
};
