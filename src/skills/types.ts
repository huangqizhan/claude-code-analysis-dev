export type SkillSource = 'builtin' | 'file';

export type SkillMetadata = {
  aliases?: string[];
  tags?: string[];
  triggers?: string[];
  examples?: string[];
  routePriority?: number;
};

export type SkillDefinition = SkillMetadata & {
  name: string;
  description: string;
  usage?: string;
  source: SkillSource;
  buildPrompt: (args: string[]) => string;
};

export type SkillFileDefinition = SkillMetadata & {
  name: string;
  description: string;
  usage?: string;
  promptTemplate: string;
};

export type SkillRouteCandidate = {
  skill: SkillDefinition;
  score: number;
  reasons: string[];
};

export type SkillRouteDecision = {
  input: string;
  normalizedInput: string;
  routed: boolean;
  score: number;
  confidence: number;
  reason: string;
  candidates: SkillRouteCandidate[];
  selected: SkillRouteCandidate | null;
  prompt?: string;
};
