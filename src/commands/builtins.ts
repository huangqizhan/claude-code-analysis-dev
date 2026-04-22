import type { CommandHandler } from './types.js';
import { listSkills, buildSkillPrompt, evaluateSkillRouting, formatSkillRouteAnalysis } from '../skills/index.js';

/**
 * Built-in slash commands
 */
export const builtins: Record<string, CommandHandler> = {
  /**
   * /help - show available commands
   */
  help: () => ({
    kind: 'append_assistant',
    text: 'Commands: /help, /clear, /exit, /skills, /skills route <text>, /skill <name> [args...]. Tools: file_read, grep. Model: qwen3.5-plus. q exits on empty input.',
  }),

  /**
   * /clear - reset conversation history
   */
  clear: () => ({
    kind: 'reset_messages',
  }),

  /**
   * /exit - quit the application
   */
  exit: () => ({
    kind: 'exit',
  }),

  /**
   * /skills - list available skills
   */
  skills: (_ctx, args) => {
    if (args[0] === 'route') {
      const input = args.slice(1).join(' ').trim();
      if (!input) {
        return {
          kind: 'append_assistant',
          text: 'Usage: /skills route <text>',
        };
      }

      return {
        kind: 'append_assistant',
        text: formatSkillRouteAnalysis(evaluateSkillRouting(input)),
      };
    }

    return {
      kind: 'append_assistant',
      text: listSkills()
        .map((skill) => {
          const metadataParts: string[] = [];
          if (skill.aliases?.length) {
            metadataParts.push(`aliases=${skill.aliases.join(', ')}`);
          }
          if (skill.tags?.length) {
            metadataParts.push(`tags=${skill.tags.join(', ')}`);
          }
          if (skill.routePriority !== undefined) {
            metadataParts.push(`priority=${skill.routePriority}`);
          }

          const metadata = metadataParts.length > 0 ? ` (${metadataParts.join('; ')})` : '';
          return `/${skill.name} [${skill.source}] - ${skill.description}${skill.usage ? ` (${skill.usage})` : ''}${metadata}`;
        })
        .join('\n') || 'No skills available.',
    };
  },

  /**
   * /skill <name> [args...] - build a prompt from a skill
   */
  skill: (_ctx, args) => {
    const [name, ...skillArgs] = args;
    if (!name) {
      return {
        kind: 'append_assistant',
        text: 'Usage: /skill <name> [args...]',
      };
    }

    const prompt = buildSkillPrompt(name, skillArgs);
    if (!prompt) {
      return {
        kind: 'append_assistant',
        text: `Unknown skill: ${name}. Type /skills to list available skills.`,
      };
    }

    return {
      kind: 'submit_prompt',
      text: prompt,
    };
  },
};
