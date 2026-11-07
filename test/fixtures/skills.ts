/**
 * Test-only skills, loaded from test/fixtures/skills/<name>/SKILL.md with the
 * real loader, plus the fake tools they use. Never shipped with the app.
 */
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineTool } from "../../src/tool.js";
import { loadSkillFile, resolveSkill } from "../../src/skills/loader.js";

export const echoTool = defineTool({
  name: "echo",
  description: "Repeat the given text.",
  schema: z.object({ text: z.string() }),
  run: ({ text }) => text,
});

export const clockTool = defineTool({
  name: "clock",
  description: "Get a fixed time.",
  schema: z.object({}),
  run: () => "12:00",
});

export const fixtureTools = [echoTool, clockTool];

export function fixtureSkillPath(name: string): string {
  return fileURLToPath(new URL(`./skills/${name}/SKILL.md`, import.meta.url));
}

export function loadFixtureSkills() {
  return ["echo", "clock"].map((name) => resolveSkill(loadSkillFile(fixtureSkillPath(name)), fixtureTools));
}
