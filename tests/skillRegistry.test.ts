// Test: skill registry
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildSkillPrompt, listSkills } from '../src/skills/index.js';
import { loadFileSkillDefinitions } from '../src/skills/loader.js';
import { renderSkillTemplate } from '../src/skills/template.js';

describe('skill registry', () => {
  it('lists default skills', () => {
    const skills = listSkills();
    assert.ok(skills.length >= 5, 'should expose builtin and file skills');
    assert.ok(skills.some((skill) => skill.name === 'explain-code'), 'should include explain-code');
    assert.ok(skills.some((skill) => skill.source === 'file'), 'should include file-based skills');
  });

  it('builds prompt for explain-code', () => {
    const prompt = buildSkillPrompt('explain-code', ['src/index.tsx']);
    assert.ok(prompt?.includes('src/index.tsx'), 'should include target');
    assert.ok(prompt?.includes('Explain this code clearly and concisely'), 'should use explain template');
  });

  it('builds prompt for file skill', () => {
    const prompt = buildSkillPrompt('file-explain', ['src/query.ts']);
    assert.ok(prompt?.includes('src/query.ts'), 'should render template args');
  });

  it('renders templates with args and target', () => {
    assert.strictEqual(renderSkillTemplate('Hello {{args}}', ['world']), 'Hello world');
    assert.strictEqual(renderSkillTemplate('Target: {{target}}', ['src/app.ts']), 'Target: src/app.ts');
  });

  it('returns null for unknown skill', () => {
    const prompt = buildSkillPrompt('unknown', []);
    assert.strictEqual(prompt, null);
  });
});

describe('skill loader', () => {
  let tempDir: string;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-claude-skills-'));
    await fs.writeFile(
      path.join(tempDir, 'alpha.md'),
      [
        '---',
        'name: alpha',
        'description: Alpha skill',
        'usage: /skill alpha',
        'aliases: first, starter',
        'tags: testing, routing',
        'triggers: write tests, explain alpha',
        'examples: Alpha example, Another alpha example',
        'routePriority: 7',
        '---',
        '',
        'Alpha {{args}}',
      ].join('\n'),
      'utf8'
    );
    await fs.writeFile(
      path.join(tempDir, 'beta.md'),
      [
        '---',
        'name: beta',
        'description: Beta skill',
        '---',
        '',
        'Beta {{target}}',
      ].join('\n'),
      'utf8'
    );
  });

  after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads markdown skill files', () => {
    const skills = loadFileSkillDefinitions(tempDir);
    assert.strictEqual(skills.length, 2);
    assert.deepStrictEqual(skills.map((skill) => skill.name), ['alpha', 'beta']);
    assert.deepStrictEqual(skills[0].aliases, ['first', 'starter']);
    assert.deepStrictEqual(skills[0].tags, ['testing', 'routing']);
    assert.deepStrictEqual(skills[0].triggers, ['write tests', 'explain alpha']);
    assert.deepStrictEqual(skills[0].examples, ['Alpha example', 'Another alpha example']);
    assert.strictEqual(skills[0].routePriority, 7);
  });

  it('rejects duplicate skill names', async () => {
    await fs.writeFile(
      path.join(tempDir, 'gamma.md'),
      [
        '---',
        'name: alpha',
        'description: Duplicate alpha',
        '---',
        '',
        'Duplicate',
      ].join('\n'),
      'utf8'
    );

    assert.throws(() => loadFileSkillDefinitions(tempDir), /Duplicate skill name: alpha/);
  });
});
