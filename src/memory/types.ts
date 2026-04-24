export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export type MemoryEntry = {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
};
// 从 MemoryEntry 复用字段类型（上游类型变更可自动同步），并通过 & 额外扩展 fileName 字段。
export type MemorySummary = Pick<MemoryEntry, 'name' | 'description' | 'type'> & {
  fileName: string;
};

export type MemoryStoreOptions = {
  rootDir?: string;
};
