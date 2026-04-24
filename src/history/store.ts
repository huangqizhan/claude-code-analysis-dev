import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HistoryMessage, HistoryStoreOptions, SessionHistory, SessionMeta } from './types.js';

const HISTORY_DIR = '.claude/history';
const SESSIONS_DIR = 'sessions';
const CURRENT_SESSION_FILE = 'current.json';

type CurrentSessionRecord = {
  sessionId: string;
  updatedAt: string;
};

function getProjectRoot(rootDir?: string): string {
  return path.resolve(rootDir ?? process.cwd());
}

function getHistoryRoot(rootDir?: string): string {
  return path.join(getProjectRoot(rootDir), HISTORY_DIR);
}

function getSessionsRoot(rootDir?: string): string {
  return path.join(getHistoryRoot(rootDir), SESSIONS_DIR);
}

function getSessionFilePath(sessionId: string, rootDir?: string): string {
  return path.join(getSessionsRoot(rootDir), `${sessionId}.json`);
}

function getCurrentSessionPath(rootDir?: string): string {
  return path.join(getHistoryRoot(rootDir), CURRENT_SESSION_FILE);
}

function ensureHistoryDirs(rootDir?: string): void {
  fs.mkdirSync(getSessionsRoot(rootDir), { recursive: true });
}

function now(): string {
  return new Date().toISOString();
}

function createSessionId(): string {
  return `session-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

function readSessionFile(sessionId: string, rootDir?: string): SessionHistory | null {
  const filePath = getSessionFilePath(sessionId, rootDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    return null;
  }

  const parsed = JSON.parse(raw) as SessionHistory;
  return {
    meta: parsed.meta,
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
  };
}

function writeSessionFile(session: SessionHistory, rootDir?: string): void {
  ensureHistoryDirs(rootDir);
  fs.writeFileSync(getSessionFilePath(session.meta.id, rootDir), `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

function writeCurrentSession(session: SessionHistory, rootDir?: string): void {
  ensureHistoryDirs(rootDir);
  const current: CurrentSessionRecord = {
    sessionId: session.meta.id,
    updatedAt: session.meta.updatedAt,
  };
  fs.writeFileSync(getCurrentSessionPath(rootDir), `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

function buildSession(messages: HistoryMessage[], id = createSessionId(), createdAt = now()): SessionHistory {
  return {
    meta: {
      id,
      createdAt,
      updatedAt: createdAt,
      messageCount: messages.length,
    },
    messages: [...messages],
  };
}

function saveSession(session: SessionHistory, rootDir?: string): SessionHistory {
  const normalized: SessionHistory = {
    meta: {
      ...session.meta,
      messageCount: session.messages.length,
      updatedAt: now(),
    },
    messages: [...session.messages],
  };
  writeSessionFile(normalized, rootDir);
  writeCurrentSession(normalized, rootDir);
  return normalized;
}

export function createSession(options: HistoryStoreOptions & { messages?: HistoryMessage[] } = {}): SessionHistory {
  const session = buildSession(options.messages ?? []);
  return saveSession(session, options.rootDir);
}

export function loadSession(sessionId: string, options: HistoryStoreOptions = {}): SessionHistory | null {
  return readSessionFile(sessionId, options.rootDir);
}

export function appendMessages(
  sessionId: string,
  messages: HistoryMessage[],
  options: HistoryStoreOptions = {},
): SessionHistory | null {
  const session = readSessionFile(sessionId, options.rootDir);
  if (!session) {
    return null;
  }

  session.messages.push(...messages);
  return saveSession(session, options.rootDir);
}

export function listSessions(options: HistoryStoreOptions = {}): SessionMeta[] {
  const rootDir = options.rootDir;
  const sessionsRoot = getSessionsRoot(rootDir);
  if (!fs.existsSync(sessionsRoot)) {
    return [];
  }

  return fs
    .readdirSync(sessionsRoot)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => readSessionFile(fileName.slice(0, -5), rootDir))
    .filter((session): session is SessionHistory => session !== null)
    .map((session) => session.meta)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadCurrentSession(options: HistoryStoreOptions = {}): SessionHistory | null {
  const currentPath = getCurrentSessionPath(options.rootDir);
  if (!fs.existsSync(currentPath)) {
    return null;
  }

  const raw = fs.readFileSync(currentPath, 'utf8');
  if (!raw.trim()) {
    return null;
  }

  const current = JSON.parse(raw) as CurrentSessionRecord;
  if (!current.sessionId) {
    return null;
  }

  return loadSession(current.sessionId, options);
}

export function createOrLoadCurrentSession(
  options: HistoryStoreOptions & { messages?: HistoryMessage[] } = {},
): SessionHistory {
  const existing = loadCurrentSession(options);
  if (existing) {
    return existing;
  }
  return createSession(options);
}
