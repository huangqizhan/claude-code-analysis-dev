// Test: skill router
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { evaluateSkillRouting, formatSkillRouteAnalysis, routeInputToSkillPrompt } from '../src/skills/router.js';

describe('routeInputToSkillPrompt', () => {
  it('routes explain-like input to the explain skill prompt', () => {
    const prompt = routeInputToSkillPrompt('explain render(<App />);');
    assert.ok(prompt?.includes('Explain this code clearly and concisely'), 'should use explain skill prompt');
  });

  it('routes test-like input to the write-tests skill prompt', () => {
    const prompt = routeInputToSkillPrompt('Write tests for this module');
    assert.ok(prompt?.includes('Write focused tests for'), 'should use write-tests skill prompt');
  });

  it('routes refactor-like input to the refactor skill prompt', () => {
    const prompt = routeInputToSkillPrompt('Refactor this code');
    assert.ok(prompt?.includes('Draft a minimal refactor plan for'), 'should use refactor skill prompt');
  });

  it('returns null for slash commands', () => {
    const prompt = routeInputToSkillPrompt('/skill explain-code src/index.tsx');
    assert.strictEqual(prompt, null);
  });

  it('returns null for non-matching input', () => {
    const prompt = routeInputToSkillPrompt('hello there');
    assert.strictEqual(prompt, null);
  });

  it('returns null for blank input', () => {
    const prompt = routeInputToSkillPrompt('   ');
    assert.strictEqual(prompt, null);
  });
});

describe('evaluateSkillRouting', () => {
  it('returns a scored decision with candidates for explain-like input', () => {
    const decision = evaluateSkillRouting('explain render(<App />);');
    assert.strictEqual(decision.routed, true);
    assert.ok(decision.selected, 'should select a skill');
    assert.strictEqual(decision.selected?.skill.name, 'explain-code');
    assert.ok(decision.score > 0, 'should assign a score');
    assert.ok(decision.confidence > 0, 'should assign confidence');
    assert.ok(decision.candidates.length > 0, 'should include candidates');
    assert.ok(decision.reason.length > 0, 'should include reason');
  });

  it('produces a readable route analysis', () => {
    const analysis = formatSkillRouteAnalysis(evaluateSkillRouting('Write tests for this module'));
    assert.ok(analysis.includes('Selected: /write-tests'), 'should mention the selected skill');
    assert.ok(analysis.includes('Top candidates:'), 'should list candidates');
  });

  it('refuses ambiguous or weak matches', () => {
    const decision = evaluateSkillRouting('please help me with code');
    assert.strictEqual(decision.routed, false);
    assert.ok(decision.reason.length > 0, 'should explain fallback');
  });
});
