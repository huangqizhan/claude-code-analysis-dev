import fs from 'node:fs';
import path from 'node:path';
import type { MemoryEntry, MemoryStoreOptions, MemorySummary, MemoryType } from './types.js';

const MEMORY_DIR = '.claude/memory';
const MEMORY_INDEX = 'MEMORY.md';
const VALID_MEMORY_TYPES = new Set<MemoryType>(['user', 'feedback', 'project', 'reference']);

function getProjectRoot(rootDir?: string): string {
  return path.resolve(rootDir ?? process.cwd());
}

function getMemoryDir(rootDir?: string): string {
  return path.join(getProjectRoot(rootDir), MEMORY_DIR);
}

function ensureMemoryDir(rootDir?: string): void {
  fs.mkdirSync(getMemoryDir(rootDir), { recursive: true });
}

function normalizeFileStem(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'memory';
}

function getMemoryPath(name: string, rootDir?: string): string {
  return path.join(getMemoryDir(rootDir), `${normalizeFileStem(name)}.md`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseFrontmatterAndBody(source: string): { frontmatter: string; body: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Missing frontmatter.');
  }

  return {
    frontmatter: match[1],
    body: match[2],
  };
}

function parseFrontmatterValue(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid frontmatter line: ${trimmed}`);
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (!key) {
      throw new Error(`Invalid frontmatter line: ${trimmed}`);
    }
    result[key] = value;
  }

  return result;
}

function readMemoryFile(filePath: string): MemoryEntry | null {
  if (path.basename(filePath) === MEMORY_INDEX) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const { frontmatter, body } = parseFrontmatterAndBody(raw);
  const meta = parseFrontmatterValue(frontmatter);
  if (!isRecord(meta)) {
    throw new Error(`Invalid memory file shape: ${path.basename(filePath)}`);
  }

  const { name, description, type } = meta;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(`Missing memory name in: ${path.basename(filePath)}`);
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new Error(`Missing memory description in: ${path.basename(filePath)}`);
  }
  if (typeof type !== 'string' || !VALID_MEMORY_TYPES.has(type as MemoryType)) {
    throw new Error(`Invalid memory type in: ${path.basename(filePath)}`);
  }

  return {
    name: name.trim(),
    description: description.trim(),
    type: type as MemoryType,
    content: body.trim(),
  };
}

function writeMemoryFile(entry: MemoryEntry, rootDir?: string): void {
  ensureMemoryDir(rootDir);
  const filePath = getMemoryPath(entry.name, rootDir);
  const content = [
    '---',
    `name: ${entry.name}`,
    `description: ${entry.description}`,
    `type: ${entry.type}`,
    '---',
    '',
    `${entry.content.trim()}\n`,
  ].join('\n');

  fs.writeFileSync(filePath, content, 'utf8');
}

function listMemoryFiles(rootDir?: string): string[] {
  const memoryDir = getMemoryDir(rootDir);
  if (!fs.existsSync(memoryDir)) {
    return [];
  }

  return fs
    .readdirSync(memoryDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== MEMORY_INDEX)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => path.join(memoryDir, entry.name));
}

export function writeMemory(entry: MemoryEntry, options: MemoryStoreOptions = {}): MemoryEntry {
  writeMemoryFile(entry, options.rootDir);
  return entry;
}

export function readMemory(name: string, options: MemoryStoreOptions = {}): MemoryEntry | null {
  const target = normalizeFileStem(name);
  const memoryFiles = listMemoryFiles(options.rootDir);

  for (const filePath of memoryFiles) {
    if (path.basename(filePath, '.md') !== target) {
      continue;
    }

    return readMemoryFile(filePath);
  }

  return null;
}

export function listMemories(options: MemoryStoreOptions = {}): MemorySummary[] {
  return listMemoryFiles(options.rootDir)
    .map((filePath) => readMemoryFile(filePath))
    .filter((entry): entry is MemoryEntry => entry !== null)
    .map((entry) => ({
      fileName: `${normalizeFileStem(entry.name)}.md`,
      name: entry.name,
      description: entry.description,
      type: entry.type,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function searchMemories(query: string, options: MemoryStoreOptions = {}): MemoryEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }

  return listMemoryFiles(options.rootDir)
    .map((filePath) => readMemoryFile(filePath))
    .filter((entry): entry is MemoryEntry => entry !== null)
    .filter((entry) => {
      const haystack = `${entry.name}\n${entry.description}\n${entry.type}\n${entry.content}`.toLowerCase();
      return haystack.includes(needle);
    });
}
