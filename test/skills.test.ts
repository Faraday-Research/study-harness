import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, collectTools } from "../src/skill.js";
import { toToolSpec } from "../src/tool.js";
import { builtinSkillPath, loadSkillFile, parseSkill, resolveSkill } from "../src/skills/loader.js";
import { createWebSearchTool } from "../src/tools/webSearch.js";
import { echoTool, fixtureSkillPath } from "./fixtures/skills.js";

const fakeBackend = { name: "fake", search: async () => [] };

describe("topic-research skill", () => {
  const definition = loadSkillFile(builtinSkillPath("topic-research"));

  it("loads its header", () => {
    expect(definition.name).toBe("topic-research");
    expect(definition.description).toBe(
      "Research a science or maths topic on trusted websites and return checkable facts, each linked to its sources.",
    );
    expect(definition.tools).toEqual(["web_search"]);
    expect(definition.maxOutputTokens).toBe(32000);
  });

  it("loads its instructions in full", () => {
    expect(definition.instructions.startsWith("ROLE\nYou are a careful research assistant.")).toBe(true);
    expect(definition.instructions).toContain("no ``` fences.");
    expect(definition.instructions).toContain('"focus": "what you focused on because of the user description, or \\"general\\""');
    expect(definition.instructions).toContain("WRITING FOR STUDENTS");
    expect(definition.instructions.endsWith('in photosynthesis."')).toBe(true); // the last example
    expect(definition.instructions).not.toContain("max_output_tokens"); // header isn't in the instructions
  });

  it("asks for everyday examples as well as real-world uses", () => {
    expect(definition.instructions).toContain('"real_world_uses": [');
    expect(definition.instructions).toContain('"everyday_examples": [');
    expect(definition.instructions).toContain("- everyday_examples: 2 to 4");
  });

  it("gets only the web_search tool, even when other tools exist", () => {
    const webSearch = createWebSearchTool({ backend: fakeBackend });
    const skill = resolveSkill(definition, [echoTool, webSearch.tool]);
    expect(skill.tools.map((t) => t.name)).toEqual(["web_search"]);
    expect(skill.tools[0]).toBe(webSearch.tool); // the same per-run instance
    expect(collectTools([skill]).map(toToolSpec)).toEqual([
      expect.objectContaining({ name: "web_search", inputSchema: expect.objectContaining({ required: ["query"] }) }),
    ]);
  });

  it("fails if web_search isn't available", () => {
    expect(() => resolveSkill(definition, [echoTool])).toThrow(/uses tool "web_search", which isn't available/);
  });

  it("goes into the system prompt as its own section", () => {
    const skill = resolveSkill(definition, [createWebSearchTool({ backend: fakeBackend }).tool]);
    const prompt = buildSystemPrompt("Base.", [skill]);
    expect(prompt).toContain("## Skill: topic-research\nROLE\nYou are a careful research assistant.");
  });
});

describe("skill loader", () => {
  const header = (lines: string) => `---\n${lines}\n---\nDo the thing.\n`;

  it("loads a fixture skill from disk", () => {
    expect(loadSkillFile(fixtureSkillPath("echo"))).toEqual({
      name: "echo",
      description: "Test-only skill that repeats text back.",
      tools: ["echo"],
      instructions: "Use the echo tool to repeat text back to the user.",
    });
  });

  it("accepts tools as a comma-separated list or a YAML list, or none", () => {
    expect(parseSkill(header("name: a\ndescription: d\ntools: x, y")).tools).toEqual(["x", "y"]);
    expect(parseSkill(header("name: a\ndescription: d\ntools:\n  - x\n  - y")).tools).toEqual(["x", "y"]);
    expect(parseSkill(header("name: a\ndescription: d")).tools).toEqual([]);
  });

  it("rejects a file without a header", () => {
    expect(() => parseSkill("Just instructions.")).toThrow(/must start with a header/);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseSkill(header("name: [unclosed"))).toThrow(/not valid YAML/);
  });

  it("rejects missing, misspelled or bad header fields", () => {
    expect(() => parseSkill(header("name: a"))).toThrow(/description/);
    expect(() => parseSkill(header("name: a\ndescription: d\ntool: x"))).toThrow(/tool/);
    expect(() => parseSkill(header("name: a\ndescription: d\nmax_output_tokens: -5"))).toThrow(/max_output_tokens/);
    expect(() => parseSkill(header("name: My Skill\ndescription: d"))).toThrow(/lowercase/);
  });

  it("rejects a tool listed twice", () => {
    expect(() => parseSkill(header("name: a\ndescription: d\ntools: x, x"))).toThrow(/listed twice/);
  });

  it("rejects a skill with no instructions", () => {
    expect(() => parseSkill("---\nname: a\ndescription: d\n---\n\n")).toThrow(/no instructions/);
  });

  it("requires the name to match the folder", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "skills-")), "wrong-folder");
    mkdirSync(dir);
    writeFileSync(join(dir, "SKILL.md"), header("name: right-name\ndescription: d"));
    expect(() => loadSkillFile(join(dir, "SKILL.md"))).toThrow(/must match its folder name "wrong-folder"/);
  });
});
