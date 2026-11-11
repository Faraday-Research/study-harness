import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, eduFiles, readEduOutputs } from "../src/index.js";
import { checkArc, checkDemo, checkPlan, checkSvg, type ConceptPlan } from "../src/edu/checks.js";
import { isTransient } from "../src/eduPipeline.js";
import { registerProvider } from "../src/providers/registry.js";
import { loadSkillFile, builtinSkillPath } from "../src/skills/loader.js";
import { createCalculateTool, evaluate } from "../src/tools/calculate.js";
import type { ProviderRequest, ProviderResponse, StopReason, ToolCall } from "../src/types.js";
import * as fx from "./fixtures/edu.js";

// A fake search service that returns the URLs the fixture brief cites.
vi.mock("../src/tools/search/index.js", () => ({
  createSearchBackend: () => ({
    name: "fake",
    async search() {
      return [fx.URL_A, fx.URL_B, fx.URL_C].map((url) => ({ title: "t", url, content: "c" }));
    },
  }),
}));

// A scripted fake model: each step is one reply, or a thrown error.
type Step = { text?: string; toolCalls?: ToolCall[]; stopReason?: StopReason; throws?: Error };
let script: Step[] = [];
let requests: ProviderRequest[] = [];
registerProvider("mock", (model) => ({
  name: "mock",
  model: model ?? "default",
  async generate(req): Promise<ProviderResponse> {
    requests.push({ ...req, messages: [...req.messages] });
    const step = script.shift() ?? { text: "" };
    if (step.throws) throw step.throws;
    const toolCalls = step.toolCalls ?? [];
    return {
      message: { role: "assistant", text: step.text ?? "", toolCalls },
      stopReason: step.stopReason ?? (toolCalls.length ? "tool_use" : "end_turn"),
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  },
}));

const ORDER = ["research", "plan", "arc", "cast", "scene", "demo", "copy", "stories", "page"] as const;
const happyPath = (): Step[] => [
  { toolCalls: [{ id: "s1", name: "web_search", input: { query: "law of demand" } }] },
  ...ORDER.map((step) => ({ text: fx.replies[step] })),
];

beforeEach(() => {
  script = [];
  requests = [];
});

describe("harness.edu (edu-v2-adapt-teach-platform)", () => {
  it("runs every step in order, each with the platform rules and its own skill", async () => {
    script = happyPath();
    const done: string[] = [];
    const res = await createHarness({ model: "mock" }).edu(
      { topic: "Law of demand", position: { course: "How Markets Work", chapter: "Demand", n: 1 } },
      { onStepDone: (r) => void done.push(`${r.step}:${r.status}`) },
    );

    expect(res.status).toBe("ok");
    expect(done).toEqual(ORDER.map((s) => `${s}:ok`));
    expect(res.searchedUrls).toHaveLength(3);
    // Each step's system prompt is the platform rules plus that step's skill.
    const systems = requests.map((r) => r.system!);
    expect(systems.every((s) => s.startsWith("# Adaptive Teaching Framework"))).toBe(true);
    expect(systems[0]).toContain("# edu-v2-concept-research");
    expect(systems.at(-1)).toContain("# edu-v2-content-presentation");
    expect(systems.at(-1)).toContain("# Reference: edu-v2-layout-and-drawing");
    // Only research and plan get tools.
    expect(requests[0]!.tools.map((t) => t.name)).toEqual(["web_search", "calculate"]);
    expect(requests[2]!.tools.map((t) => t.name)).toEqual(["calculate"]);
    expect(requests[3]!.tools).toEqual([]);
    // Later steps read earlier outputs.
    const pageMessage = requests.at(-1)!.messages[0] as { content: string };
    expect(pageMessage.content).toContain("<stories>");
    expect(pageMessage.content).toContain('"id": "law-of-demand-1"');
    // The scene goes where the page left its placeholder.
    expect(res.outputs.html).toContain('<figure class="scene"><svg');
    expect(res.outputs.html).not.toContain("<!--SCENE-->");
  });

  it("sends problems back once, and keeps the fixed output", async () => {
    const named = fx.replies.arc!.replace("The main character runs", "Kavya runs");
    script = happyPath();
    script.splice(3, 1, { text: named }, { text: fx.replies.arc });
    const res = await createHarness({ model: "mock" }).edu({ topic: "Law of demand" });
    expect(res.status).toBe("ok");
    const arcStep = res.steps.find((s) => s.step === "arc")!;
    expect(arcStep.attempts).toBe(2);
    const fix = requests.find((r) => (r.messages.at(-1) as { content?: string }).content?.includes("We checked your output"));
    expect((fix!.messages.at(-1) as { content: string }).content).toContain("names people (Kavya)");
  });

  it("stops at a step that still fails after its fix, and builds nothing on it", async () => {
    const bad = fx.replies.arc!.replace("The main character runs", "Kavya runs");
    script = happyPath().slice(0, 3);
    script.push({ text: bad }, { text: bad });
    const res = await createHarness({ model: "mock" }).edu({ topic: "Law of demand" });
    expect(res.status).toBe("failed");
    expect(res.failedStep).toBe("arc");
    expect(res.outputs.arc).toBeUndefined();
    expect(res.outputs.cast).toBeUndefined();
    expect(requests).toHaveLength(5);
  });

  it("resumes from saved outputs, running only the missing steps", async () => {
    const saved = readEduOutputs(eduFiles({ brief: fx.brief as never, plan: fx.plan as never, arc: fx.arc }));
    script = ORDER.slice(3).map((step) => ({ text: fx.replies[step] }));
    const res = await createHarness({ model: "mock" }).edu({ topic: "Law of demand" }, { resume: saved });
    expect(res.status).toBe("ok");
    expect(res.steps.slice(0, 3).map((s) => s.status)).toEqual(["resumed", "resumed", "resumed"]);
    expect(requests).toHaveLength(6);
  });

  it("retries a step after a transient error", async () => {
    const overloaded = Object.assign(new Error("Overloaded"), { status: 529 });
    script = [{ throws: overloaded }, ...happyPath()];
    const retries: number[] = [];
    const res = await createHarness({ model: "mock" }).edu(
      { topic: "Law of demand" },
      { onEvent: (e) => void (e.type === "step_retry" && retries.push(e.retry)) },
    );
    expect(res.status).toBe("ok");
    expect(retries).toEqual([1]);
  });

  it("rejects an empty topic or an unknown track", async () => {
    const harness = createHarness({ model: "mock" });
    await expect(harness.edu({ topic: " " })).rejects.toThrow(/Topic is empty/);
    await expect(harness.edu({ topic: "x", track: "phd" as never })).rejects.toThrow(/Track must be/);
  });
});

describe("edu-v2 skills", () => {
  it("all load, with the tools they name", () => {
    const tools = {
      "edu-v2-concept-research": ["web_search", "calculate"],
      "edu-v2-concept-break-build": ["calculate"],
      "edu-v2-story-arc": [],
      "edu-v2-character-scene": [],
      "edu-v2-layout-and-drawing": [],
      "edu-v2-concept-demo": [],
      "edu-v2-story-and-scene": [],
      "edu-v2-content-presentation": [],
      "edu-v2-adapt-teach-platform": [],
    };
    for (const [name, expected] of Object.entries(tools)) {
      expect(loadSkillFile(builtinSkillPath(name)).tools).toEqual(expected);
    }
  });
});

describe("edu-v2 checks", () => {
  it("catches Explorer distractors within twice the tolerance", () => {
    const plan = structuredClone(fx.plan) as unknown as ConceptPlan;
    plan.check.explorer[0]!.numeric!.distractors = [41.5];
    expect(checkPlan(plan, fx.brief as never).map((p) => p.message).join()).toMatch(/within twice the tolerance/);
  });

  it("catches doors whose before and after counts are the same", () => {
    const plan = structuredClone(fx.plan) as unknown as ConceptPlan;
    plan.doors[0]!.picture.after.count = 6;
    expect(checkPlan(plan, fx.brief as never).some((p) => /counts in the picture/.test(p.message))).toBe(true);
  });

  it("passes the fixture arc and rejects a missing beat", () => {
    expect(checkArc(fx.arc)).toEqual([]);
    expect(checkArc(fx.arc.replace(/^6 Break:.*$/m, "")).map((p) => p.message)).toContain('The arc is missing the "6 Break:" line.');
  });

  it("rejects an SVG that loads anything from outside", () => {
    const bad = fx.scene.replace("</svg>", '<image href="https://x.test/a.png"/></svg>');
    expect(checkSvg(bad).some((p) => p.severity === "error" && /external/.test(p.message))).toBe(true);
  });

  it("needs the Break boundary inside the control's range", () => {
    const demo = { ...fx.demo, break: { ...fx.demo.break, boundary_value: 500 } };
    expect(checkDemo(demo, fx.plan as never).some((p) => /can't reach it/.test(p.message))).toBe(true);
  });

  it("tells connection and overload errors from real failures", () => {
    expect(isTransient(Object.assign(new Error("x"), { status: 503 }))).toBe(true);
    expect(isTransient(new Error("fetch failed"))).toBe(true);
    expect(isTransient(Object.assign(new Error("bad request"), { status: 400 }))).toBe(false);
  });
});

describe("calculate tool", () => {
  it("evaluates arithmetic without eval", () => {
    expect(evaluate("2 + 3 * 4")).toBe(14);
    expect(evaluate("-2^2")).toBe(-4);
    expect(evaluate("2^3^2")).toBe(512);
    expect(evaluate("round(sqrt(2), 3)")).toBe(1.414);
    expect(evaluate("max(1, 7, 3) - abs(-2)")).toBe(5);
    expect(() => evaluate("process.exit()")).toThrow();
    expect(() => evaluate("1 / 0")).toThrow(/finite/);
  });

  it("returns a result or an error for each expression", async () => {
    const out = JSON.parse(String(await createCalculateTool().run({ expressions: ["0.4 * 9.81", "x + 1"] }, {})));
    expect(out.results[0]).toEqual({ expression: "0.4 * 9.81", value: 3.924 });
    expect(out.results[1].error).toMatch(/unknown name "x"/);
  });
});
