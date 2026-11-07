import type { Tool } from "./tool.js";

/**
 * A skill bundles what the model needs for one capability: instructions on
 * how to behave, and the tools it may call. Skills live inside the harness;
 * the integrating app can only choose which built-in skills are enabled.
 */
export interface Skill {
  /** Unique id, used in HarnessConfig.skills to enable it. */
  name: string;
  /** One line, shown to the app via harness.skills(). */
  description: string;
  /** Added to the system prompt when the skill is enabled. */
  instructions: string;
  tools: Tool[];
  /** Output token limit for runs of this skill. Not applied yet. */
  maxOutputTokens?: number;
}

export function defineSkill(skill: Skill): Skill {
  return skill;
}

/** Base prompt plus one section per enabled skill. */
export function buildSystemPrompt(base: string, skills: Skill[]): string {
  if (skills.length === 0) return base;
  const sections = skills.map((s) => `## Skill: ${s.name}\n${s.instructions.trim()}`);
  return [base.trim(), "# Skills", ...sections].join("\n\n");
}

/** All tools from the given skills; tool names must be unique across skills. */
export function collectTools(skills: Skill[]): Tool[] {
  const owner = new Map<string, string>();
  const tools: Tool[] = [];
  for (const skill of skills) {
    for (const tool of skill.tools) {
      const existing = owner.get(tool.name);
      if (existing) {
        throw new Error(`Tool "${tool.name}" is defined by both skills "${existing}" and "${skill.name}"`);
      }
      owner.set(tool.name, skill.name);
      tools.push(tool);
    }
  }
  return tools;
}
