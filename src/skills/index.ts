import type { Skill } from "../skill.js";

/**
 * Skills the harness enables. Skills are written as Markdown, one folder per
 * skill (e.g. ./topic-research/SKILL.md), and loaded with ./loader.ts.
 *
 * Empty for now: topic-research exists but isn't wired into the harness yet.
 */
export const builtinSkills: Skill[] = [];
