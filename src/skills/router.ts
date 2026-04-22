import { listSkills } from './registry.js';
import type { SkillDefinition, SkillRouteCandidate, SkillRouteDecision } from './types.js';

const ROUTE_MIN_SCORE = 4;
const ROUTE_MIN_GAP = 1.25;
const ROUTE_CANDIDATE_LIMIT = 3;
const PHRASE_MATCH_SCORE = 6;
const ALIAS_MATCH_SCORE = 3;
const NAME_MATCH_SCORE = 2;
const TAG_MATCH_SCORE = 1.5;
const DESCRIPTION_MATCH_SCORE = 0.35;
const EXAMPLE_MATCH_SCORE = 2.5;
const PRIORITY_WEIGHT = 0.25;
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'module',
  'of',
  'on',
  'or',
  'please',
  'the',
  'this',
  'that',
  'to',
  'what',
  'with',
  'code',
  'file',
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function collectTokens(values: string[] | undefined): string[] {
  const tokens: string[] = [];
  for (const value of values ?? []) {
    tokens.push(...tokenize(value));
  }
  return unique(tokens);
}

function addPhraseMatch(
  score: { value: number },
  reasons: string[],
  input: string,
  phrases: string[] | undefined,
  amount: number,
  label: string,
): void {
  for (const phrase of unique((phrases ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0))) {
    const normalizedPhrase = normalizeText(phrase);
    if (!normalizedPhrase) {
      continue;
    }

    if (input.includes(normalizedPhrase)) {
      score.value += amount;
      reasons.push(`${label}: "${phrase}"`);
    }
  }
}

function addTokenMatch(
  score: { value: number },
  reasons: string[],
  inputTokens: Set<string>,
  tokens: string[],
  amountPerToken: number,
  label: string,
): void {
  const matches = unique(tokens).filter((token) => inputTokens.has(token));
  if (matches.length === 0) {
    return;
  }

  score.value += matches.length * amountPerToken;
  reasons.push(`${label}: ${matches.join(', ')}`);
}

function scoreSkill(input: string, skill: SkillDefinition): SkillRouteCandidate {
  const normalizedInput = normalizeText(input);
  const inputTokens = new Set(tokenize(input));
  const score = { value: 0 };
  const reasons: string[] = [];

  if (typeof skill.routePriority === 'number' && skill.routePriority > 0) {
    score.value += skill.routePriority * PRIORITY_WEIGHT;
    reasons.push(`priority: ${skill.routePriority}`);
  }

  addPhraseMatch(score, reasons, normalizedInput, skill.triggers, PHRASE_MATCH_SCORE, 'trigger');
  addPhraseMatch(score, reasons, normalizedInput, skill.aliases, ALIAS_MATCH_SCORE, 'alias');

  addTokenMatch(score, reasons, inputTokens, tokenize(skill.name), NAME_MATCH_SCORE, 'name');
  addTokenMatch(score, reasons, inputTokens, collectTokens(skill.aliases), ALIAS_MATCH_SCORE / 2, 'alias tokens');
  addTokenMatch(score, reasons, inputTokens, collectTokens(skill.tags), TAG_MATCH_SCORE, 'tag');
  addTokenMatch(score, reasons, inputTokens, tokenize(skill.description), DESCRIPTION_MATCH_SCORE, 'description');

  for (const example of unique((skill.examples ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0))) {
    const normalizedExample = normalizeText(example);
    if (!normalizedExample) {
      continue;
    }

    if (normalizedInput.includes(normalizedExample)) {
      score.value += EXAMPLE_MATCH_SCORE + 1;
      reasons.push(`example: "${example}"`);
      continue;
    }

    const exampleTokens = tokenize(example);
    const matches = unique(exampleTokens.filter((token) => inputTokens.has(token)));
    const coverage = exampleTokens.length === 0 ? 0 : matches.length / exampleTokens.length;
    if (matches.length >= 2 && coverage >= 0.4) {
      score.value += EXAMPLE_MATCH_SCORE * coverage;
      reasons.push(`example tokens: ${matches.join(', ')}`);
    }
  }

  return {
    skill,
    score: score.value,
    reasons,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatCandidate(candidate: SkillRouteCandidate, index: number): string {
  const score = candidate.score.toFixed(1);
  const reasons = candidate.reasons.length > 0 ? ` — ${candidate.reasons.join('; ')}` : '';
  return `${index + 1}. /${candidate.skill.name} (${score})${reasons}`;
}

function buildRouteReason(selected: SkillRouteCandidate, second: SkillRouteCandidate | undefined): string {
  const reason = selected.reasons.length > 0 ? selected.reasons.join('; ') : 'score cleared the route threshold';
  if (!second) {
    return reason;
  }

  return `${reason}; ahead of /${second.skill.name} by ${(selected.score - second.score).toFixed(1)}`;
}

function buildRejectionReason(best: SkillRouteCandidate | undefined, second: SkillRouteCandidate | undefined): string {
  if (!best) {
    return 'No skill candidates were available.';
  }

  if (best.score < ROUTE_MIN_SCORE) {
    return `Best score ${best.score.toFixed(1)} is below the ${ROUTE_MIN_SCORE.toFixed(1)} route threshold.`;
  }

  if (second && best.score - second.score < ROUTE_MIN_GAP) {
    return `Top matches are too close: /${best.skill.name} (${best.score.toFixed(1)}) vs /${second.skill.name} (${second.score.toFixed(1)}).`;
  }

  return `No confident route found for /${best.skill.name}.`;
}

export function evaluateSkillRouting(input: string): SkillRouteDecision {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      input,
      normalizedInput: '',
      routed: false,
      score: 0,
      confidence: 0,
      reason: 'Blank input cannot be routed.',
      candidates: [],
      selected: null,
    };
  }

  if (trimmed.startsWith('/')) {
    return {
      input,
      normalizedInput: normalizeText(trimmed),
      routed: false,
      score: 0,
      confidence: 0,
      reason: 'Slash commands are handled separately.',
      candidates: [],
      selected: null,
    };
  }

  const normalizedInput = normalizeText(trimmed);
  const scoredCandidates = listSkills().map((skill) => scoreSkill(trimmed, skill));
  const rankedCandidates = scoredCandidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (typeof right.skill.routePriority === 'number' && typeof left.skill.routePriority === 'number' && right.skill.routePriority !== left.skill.routePriority) {
      return right.skill.routePriority - left.skill.routePriority;
    }

    return left.skill.name.localeCompare(right.skill.name);
  });

  const selected = rankedCandidates[0];
  const second = rankedCandidates[1];
  const topCandidates = rankedCandidates.slice(0, ROUTE_CANDIDATE_LIMIT);
  const confidence = selected
    ? clamp((selected.score / 10) * 0.65 + ((selected.score - (second?.score ?? 0)) / 5) * 0.35, 0, 1)
    : 0;

  if (!selected) {
    return {
      input,
      normalizedInput,
      routed: false,
      score: 0,
      confidence: 0,
      reason: 'No skills were available to route to.',
      candidates: [],
      selected: null,
    };
  }

  if (selected.score < ROUTE_MIN_SCORE || (second && selected.score - second.score < ROUTE_MIN_GAP)) {
    return {
      input,
      normalizedInput,
      routed: false,
      score: selected.score,
      confidence,
      reason: buildRejectionReason(selected, second),
      candidates: topCandidates,
      selected: null,
    };
  }

  return {
    input,
    normalizedInput,
    routed: true,
    score: selected.score,
    confidence,
    reason: buildRouteReason(selected, second),
    candidates: topCandidates,
    selected,
    prompt: selected.skill.buildPrompt([input]),
  };
}

export function routeInputToSkillPrompt(input: string): string | null {
  const route = evaluateSkillRouting(input);
  return route.routed ? route.prompt ?? null : null;
}

export function formatSkillRouteAnalysis(route: SkillRouteDecision): string {
  const lines: string[] = [`Input: ${route.input.trim() || '(blank)'}`];

  if (route.routed && route.selected) {
    lines.push(
      `Selected: /${route.selected.skill.name} (score ${route.score.toFixed(1)}, confidence ${route.confidence.toFixed(2)})`,
    );
    lines.push(`Reason: ${route.reason}`);
  } else {
    lines.push(`No route: ${route.reason}`);
  }

  if (route.candidates.length === 0) {
    lines.push('Top candidates: none');
    return lines.join('\n');
  }

  lines.push('Top candidates:');
  route.candidates.forEach((candidate, index) => {
    lines.push(`  ${formatCandidate(candidate, index)}`);
  });

  return lines.join('\n');
}
