import fs from 'node:fs';
import path from 'node:path';
import type { SkillFileDefinition } from './types.js';

const DEFAULT_SKILLS_DIR = path.resolve(process.cwd(), '.claude/skills');

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

function parseListField(raw: string | undefined): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const values = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return values.length > 0 ? values : undefined;
}

function parseNumberField(raw: string | undefined, fieldName: string, filePath: string): number | undefined {
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldName} in: ${path.basename(filePath)}`);
  }

  return parsed;
}

function readSkillFile(filePath: string): SkillFileDefinition {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatterAndBody(raw);
  const meta = parseFrontmatterValue(frontmatter);

  if (!isRecord(meta)) {
    throw new Error(`Invalid skill file shape: ${path.basename(filePath)}`);
  }

  const { name, description, usage, aliases, tags, triggers, examples, routePriority } = meta;
  const promptTemplate = body.trim();
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(`Missing skill name in: ${path.basename(filePath)}`);
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new Error(`Missing skill description in: ${path.basename(filePath)}`);
  }
  if (promptTemplate.length === 0) {
    throw new Error(`Missing skill promptTemplate in: ${path.basename(filePath)}`);
  }
  if (usage !== undefined && typeof usage !== 'string') {
    throw new Error(`Invalid skill usage in: ${path.basename(filePath)}`);
  }
  if (aliases !== undefined && typeof aliases !== 'string') {
    throw new Error(`Invalid skill aliases in: ${path.basename(filePath)}`);
  }
  if (tags !== undefined && typeof tags !== 'string') {
    throw new Error(`Invalid skill tags in: ${path.basename(filePath)}`);
  }
  if (triggers !== undefined && typeof triggers !== 'string') {
    throw new Error(`Invalid skill triggers in: ${path.basename(filePath)}`);
  }
  if (examples !== undefined && typeof examples !== 'string') {
    throw new Error(`Invalid skill examples in: ${path.basename(filePath)}`);
  }
  if (routePriority !== undefined && typeof routePriority !== 'string') {
    throw new Error(`Invalid skill routePriority in: ${path.basename(filePath)}`);
  }

  return {
    name: name.trim(),
    description: description.trim(),
    usage: typeof usage === 'string' && usage.trim().length > 0 ? usage.trim() : undefined,
    aliases: parseListField(typeof aliases === 'string' ? aliases : undefined),
    tags: parseListField(typeof tags === 'string' ? tags : undefined),
    triggers: parseListField(typeof triggers === 'string' ? triggers : undefined),
    examples: parseListField(typeof examples === 'string' ? examples : undefined),
    routePriority: parseNumberField(typeof routePriority === 'string' ? routePriority : undefined, 'routePriority', filePath),
    promptTemplate,
  };
}

export function loadFileSkillDefinitions(skillsDir: string = DEFAULT_SKILLS_DIR): SkillFileDefinition[] {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const entries = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const skills: SkillFileDefinition[] = [];
  const names = new Set<string>();

  for (const entry of entries) {
    const filePath = path.join(skillsDir, entry.name);
    const skill = readSkillFile(filePath);
    if (names.has(skill.name)) {
      throw new Error(`Duplicate skill name: ${skill.name}`);
    }
    names.add(skill.name);
    skills.push(skill);
  }

  return skills;
}
