/**
 * Loads skills written as Markdown files.
 *
 * Each skill is a folder with a SKILL.md: a YAML header between --- lines,
 * then the instructions. Example:
 *
 *   ---
 *   name: topic-research          (must match the folder name)
 *   description: One line about what the skill does.
 *   tools: web_search             (one name, a comma-separated list, or a YAML list)
 *   max_output_tokens: 8000       (optional)
 *   ---
 *   The instructions, used word for word...
 *
 * A skill names its tools; resolveSkill() swaps the names for the real tool
 * objects. A skill gets only the tools it names, nothing else.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Skill } from "../skill.js";
import type { Tool } from "../tool.js";

/** A skill as written in its SKILL.md, before its tools are attached. */
export interface SkillDefinition {
  name: string;
  description: string;
  /** Names of the tools this skill may use. */
  tools: string[];
  maxOutputTokens?: number;
  instructions: string;
}

/** Folder holding the built-in skills (one sub-folder per skill). */
export const BUILTIN_SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

/** Path to a built-in skill's SKILL.md. */
export function builtinSkillPath(name: string): string {
  return join(BUILTIN_SKILLS_DIR, name, "SKILL.md");
}

const headerSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase letters, numbers and hyphens"),
  description: z.string().trim().min(1),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
  max_output_tokens: z.number().int().positive().optional(),
});

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)([\s\S]*)$/;

/** Parses SKILL.md text. `source` is only used in error messages. */
export function parseSkill(text: string, source = "SKILL.md"): SkillDefinition {
  const match = FRONT_MATTER.exec(text);
  if (!match) throw new Error(`${source}: must start with a header between --- lines`);

  let raw: unknown;
  try {
    raw = parseYaml(match[1]!);
  } catch (err) {
    throw new Error(`${source}: header is not valid YAML (${err instanceof Error ? err.message : String(err)})`);
  }

  const parsed = headerSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new Error(`${source}: bad header\n${z.prettifyError(parsed.error)}`);
  const header = parsed.data;

  const tools =
    typeof header.tools === "string"
      ? header.tools.split(",").map((t) => t.trim()).filter(Boolean)
      : (header.tools ?? []).map((t) => t.trim());
  const duplicate = tools.find((t, i) => tools.indexOf(t) !== i);
  if (duplicate) throw new Error(`${source}: tool "${duplicate}" is listed twice`);

  const instructions = match[2]!.trim();
  if (!instructions) throw new Error(`${source}: has no instructions after the header`);

  return {
    name: header.name,
    description: header.description,
    tools,
    ...(header.max_output_tokens !== undefined ? { maxOutputTokens: header.max_output_tokens } : {}),
    instructions,
  };
}

/** Reads and parses a SKILL.md file. Its `name` must match its folder name. */
export function loadSkillFile(path: string): SkillDefinition {
  const skill = parseSkill(readFileSync(path, "utf8"), path);
  const folder = basename(dirname(path));
  if (skill.name !== folder) {
    throw new Error(`${path}: name "${skill.name}" must match its folder name "${folder}"`);
  }
  return skill;
}

/**
 * Attaches the real tools to a skill. Only the tools the skill names are
 * attached; naming a tool that isn't in `available` is an error.
 */
export function resolveSkill(definition: SkillDefinition, available: Tool[]): Skill {
  const tools = definition.tools.map((name) => {
    const tool = available.find((t) => t.name === name);
    if (!tool) {
      const known = available.map((t) => t.name).join(", ") || "none";
      throw new Error(`Skill "${definition.name}" uses tool "${name}", which isn't available. Available: ${known}`);
    }
    return tool;
  });
  return { ...definition, tools };
}
