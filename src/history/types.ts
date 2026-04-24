export type HistoryRole = 'user' | 'assistant' | 'system';

export type HistoryMessage = {
  role: HistoryRole;
  text: string;
};

export type SessionMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type SessionHistory = {
  meta: SessionMeta;
  messages: HistoryMessage[];
};

export type HistoryStoreOptions = {
  rootDir?: string;
};
