import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, type GenerateEvent } from "../src/index.js";
import { registerProvider } from "../src/providers/registry.js";
import type { ResearchReport } from "../src/researchReport.js";
import { exampleKindOf, exampleProblems, parseReply } from "../src/simulation.js";
import type { LessonProblem } from "../src/interactive/checkLesson.js";
import type { ProviderRequest, ProviderResponse, StopReason, ToolCall } from "../src/types.js";

vi.mock("../src/tools/search/index.js", () => ({
  createSearchBackend: () => ({
    name: "fake",
    search: async () => [{ title: "Britannica", url: "https://www.britannica.com/science/photosynthesis", content: "Plants make glucose." }],
  }),
}));

type Step = { text?: string; toolCalls?: ToolCall[]; stopReason?: StopReason; error?: Error };
let script: Step[] = [];
let requests: ProviderRequest[] = [];
registerProvider("mock-sim", (model) => ({
  name: "mock-sim",
  model: model ?? "default",
  async generate(req): Promise<ProviderResponse> {
    requests.push({ ...req, messages: [...req.messages] });
    const step = script.shift() ?? { text: "" };
    if (step.error) throw step.error;
    const toolCalls = step.toolCalls ?? [];
    return {
      message: { role: "assistant", text: step.text ?? "", toolCalls },
      stopReason: step.stopReason ?? (toolCalls.length ? "tool_use" : "end_turn"),
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  },
}));

const report: ResearchReport = {
  topic: "Photosynthesis", focus: "general", summary: "Plants make food from light.",
  facts: [], processSteps: [], formulas: [], quantities: [],
  realWorldUses: [{ id: "R1", title: "Greenhouses", description: "Farmers add CO2.", sources: ["S1"] }],
  everydayExamples: [{ id: "E1", situation: "Grass under a tarp", connection: "No light, no growth.", sources: ["S1"] }],
  misconceptions: [], gaps: [],
  sources: [{ id: "S1", title: "Britannica", url: "https://www.britannica.com/science/photosynthesis" }],
};
const reportJson = JSON.stringify({ ...report, real_world_uses: report.realWorldUses, everyday_examples: report.everydayExamples });

const lesson = `{
  title: "Greenhouse growth",
  controls: [{ type: "slider", id: "light", label: "Light", min: 0, max: 10, step: 1, value: 5 }],
  update(v) { return { explanation: "Light is " + v.light + ". </script> stays inside the string" }; },
}`;
const reply = (code = lesson, id = "E1") => `<example_id>${id}</example_id>\n<lesson>\n${code}\n</lesson>`;

beforeEach(() => {
  script = [];
  requests = [];
});

describe("parseReply", () => {
  it("reads the example id and the lesson code, tolerating fences", () => {
    expect(parseReply(reply())).toEqual({ exampleId: "E1", mode: "frame", source: lesson });
    expect(parseReply(`<lesson>\n\`\`\`js\n${lesson}\n\`\`\`\n</lesson>`)).toEqual({ exampleId: null, mode: "frame", source: lesson });
  });

  it("rejects missing tags, non-objects and syntax errors (without running the code)", () => {
    expect(parseReply("{ title: 'x' }")).toEqual({ error: "The interactive came back without its lesson code." });
    expect(parseReply("<lesson>alert(1)</lesson>")).toEqual({ error: "The interactive's lesson code isn't an object." });
    const broken = parseReply("<lesson>{ update(v) { return { </lesson>");
    expect("error" in broken && broken.error).toMatch(/^The interactive's code has a mistake/);
    (globalThis as { ran?: boolean }).ran = false;
    parseReply("<lesson>{ x: (globalThis.ran = true) }</lesson>");
    expect((globalThis as { ran?: boolean }).ran).toBe(false); // compiled, never executed
  });
});

describe("harness.simulate", () => {
  it("runs the interactive-simulation skill with no tools, on the report, and builds the page", async () => {
    script = [{ text: reply() }];
    const res = await createHarness({ model: "mock-sim" }).simulate(
      { topic: " Photosynthesis ", description: "for farmers", report, exampleId: "E1" },
      { theme: { themeCss: ":root{--color-primary:#465940}" } },
    );
    const req = requests[0]!;
    expect(req.system!.startsWith("ROLE\nYou design and code small interactive lessons")).toBe(true);
    expect(req.tools).toEqual([]);
    expect(req.maxTokens).toBe(32000);
    const message = (req.messages[0] as { content: string }).content;
    expect(message).toContain("<topic>\nPhotosynthesis\n</topic>");
    expect(message).toContain("<user_description>\nfor farmers\n</user_description>");
    expect(message).toContain('"summary": "Plants make food from light."');
    expect(message).toContain("<example>\nE1\n</example>");

    expect(res).toMatchObject({ status: "ok", mode: "frame", exampleId: "E1", source: lesson, warnings: [], attempts: 1 });
    if (res.status !== "ok") return;
    expect(res.html).toContain("--color-primary:#465940");
    expect(res.html).toContain("Content-Security-Policy");
    expect(res.html).toContain("<\\/script> stays inside the string"); // can't end the <script> early
    expect(res.html).not.toMatch(/\{\{[A-Z_]+\}\}/); // every placeholder filled
    expect(res.html).toContain('window.__LESSON_CONTEXT__ = {"exampleKind":"everyday"};'); // built on E1
  });

  it("drops an example id that isn't in the report", async () => {
    script = [{ text: reply(lesson, "R9") }];
    const res = await createHarness({ model: "mock-sim" }).simulate({ topic: "x", report });
    expect(res).toMatchObject({ status: "ok", exampleId: null });
  });

  it("handles NOT_INTERACTIVE, unusable replies (after one fix) and early stops", async () => {
    const h = createHarness({ model: "mock-sim" });
    script = [{ text: " NOT_INTERACTIVE " }, { text: "Sure! Here is a lesson." }, { text: "Still no tags." }, { text: "<lesson>{", stopReason: "max_tokens" }];
    expect((await h.simulate({ topic: "x", report })).status).toBe("not_interactive");
    expect(await h.simulate({ topic: "x", report })).toMatchObject({
      status: "invalid",
      message: "The interactive came back without its lesson code.",
      problems: [{ severity: "error", message: "The interactive came back without its lesson code." }],
    });
    expect(await h.simulate({ topic: "x", report })).toMatchObject({ status: "incomplete", stopReason: "max_tokens" });
  });

  it("needs a topic and a report", async () => {
    const h = createHarness({ model: "mock-sim" });
    await expect(h.simulate({ topic: " ", report })).rejects.toThrow("Topic is empty");
    await expect(h.simulate({ topic: "x", report: { ...report, summary: "" } })).rejects.toThrow(/research report is needed/);
  });
});

describe("harness.generate", () => {
  it("researches, then builds the interactive from the cleaned report, tagging progress by stage", async () => {
    script = [{ toolCalls: [{ id: "s1", name: "web_search", input: { query: "photosynthesis" } }] }, { text: reportJson }, { text: reply() }];
    const events: GenerateEvent[] = [];
    const res = await createHarness({ model: "mock-sim" }).generate({ topic: "Photosynthesis", description: "farmers" }, { onEvent: (e) => events.push(e) });

    expect(res.research).toMatchObject({ status: "ok", searches: 1 });
    expect(res.simulation).toMatchObject({ status: "ok", exampleId: "E1" });
    // The simulation saw the cleaned report, not the raw reply, and the teacher's description.
    const simMessage = (requests[2]!.messages[0] as { content: string }).content;
    expect(simMessage).toContain('"realWorldUses"');
    expect(simMessage).toContain("<user_description>\nfarmers\n</user_description>");

    expect(events.filter((e) => e.type === "stage_start").map((e) => e.stage)).toEqual(["research", "simulation"]);
    expect(events.find((e) => e.type === "tool_start")?.stage).toBe("research");
    expect(events.at(-1)).toMatchObject({ stage: "simulation", type: "done" });
  });

  it("skips the interactive when research doesn't give a report", async () => {
    script = [{ text: "NOT_SCIENCE" }];
    const res = await createHarness({ model: "mock-sim" }).generate({ topic: "Poetry" });
    expect(res).toEqual({ research: expect.objectContaining({ status: "not_science" }), simulation: { status: "skipped" } });
    expect(requests).toHaveLength(1);
  });

  it("keeps the research when building the interactive fails", async () => {
    script = [{ text: reportJson }, { error: new Error("Provider is down") }];
    const res = await createHarness({ model: "mock-sim" }).generate({ topic: "Photosynthesis" });
    expect(res.research.status).toBe("ok");
    expect(res.simulation).toEqual({ status: "error", message: "Provider is down", cancelled: false });
  });
});

describe("checks and the fix", () => {
  const badLesson = `{ title: "Bad", setup(stage, api) { stage.innerHTML = "<b>x</b>"; api.color("scene-wood"); }, update() { return { explanation: "ok" }; } }`;

  it("sends problems back once, in the same conversation, and uses the fixed lesson", async () => {
    script = [{ text: reply(badLesson) }, { text: reply() }];
    const checks: Array<{ attempt: number; problems: LessonProblem[] }> = [];
    const res = await createHarness({ model: "mock-sim" }).simulate({ topic: "x", report }, { onCheck: (c) => checks.push(c) });

    expect(res).toMatchObject({ status: "ok", source: lesson, attempts: 2, warnings: [] });
    expect(res.status === "ok" && res.usage).toEqual({ inputTokens: 20, outputTokens: 10 }); // both replies counted
    expect(checks.map((c) => c.problems.length)).toEqual([2, 0]);
    // The fix request continues the conversation and lists the problems.
    const second = requests[1]!.messages;
    expect(second).toHaveLength(3);
    const fix = (second[2] as { content: string }).content;
    expect(fix).toContain("<problems>");
    expect(fix).toContain('[error] The code writes HTML strings with innerHTML');
    expect(fix).toContain('[error] "scene-wood" is not a colour name.');
  });

  it("runs the app's browser test only on statically clean lessons, with a self-test page", async () => {
    const pages: string[] = [];
    const testLesson = async (html: string): Promise<LessonProblem[]> => {
      pages.push(html);
      return pages.length === 1 ? [{ severity: "warning", message: 'The labels "A" and "B" overlap at the start.' }] : [];
    };
    script = [{ text: reply(badLesson) }, { text: reply() }, { text: reply() }];
    const h = createHarness({ model: "mock-sim" });
    const first = await h.simulate({ topic: "x", report }, { testLesson });
    expect(first).toMatchObject({ status: "ok", attempts: 2 });
    expect(pages).toHaveLength(1); // the bad lesson was never run
    expect(pages[0]).toContain("window.__LESSON_SELFTEST__ = true;");
    if (first.status === "ok") {
      // The student page has no self-test.
      expect(first.html).not.toContain("window.__LESSON_SELFTEST__ = true;");
      expect(first.html).not.toContain("Lesson self-test.");
    }

    // A clean run straight away: tested once, no fix needed.
    const second = await h.simulate({ topic: "x", report }, { testLesson });
    expect(second).toMatchObject({ status: "ok", attempts: 1, warnings: [] });
    expect(pages).toHaveLength(2);
  });

  it("keeps the better lesson: warnings left after the fix are reported, a worse fix is ignored", async () => {
    const overlap: LessonProblem = { severity: "warning", message: "Labels overlap." };
    script = [{ text: reply() }, { text: reply(badLesson) }];
    const res = await createHarness({ model: "mock-sim" }).simulate({ topic: "x", report }, { testLesson: async () => [overlap] });
    expect(res).toMatchObject({ status: "ok", source: lesson, attempts: 1, warnings: [overlap] });
  });

  it("goes on with the static checks if the browser test itself fails", async () => {
    script = [{ text: reply() }];
    const res = await createHarness({ model: "mock-sim" }).simulate(
      { topic: "x", report },
      { testLesson: async () => { throw new Error("window crashed"); } },
    );
    expect(res).toMatchObject({ status: "ok", attempts: 1, warnings: [] });
  });

  it("accepts a custom page, made safe and on-brand", async () => {
    const page = `<!doctype html><html><head><meta http-equiv="refresh" content="0"><title>Mine</title><style>body{color:var(--color-text)}</style></head>
      <body><input type="range" id="r"><script>r.addEventListener("input", () => {});</script></body></html>`;
    const withMeta = `<example_id>E1</example_id>\n<custom_html>\n${page}\n</custom_html>`;
    script = [{ text: withMeta }, { text: withMeta }]; // the "fix" repeats the mistake
    const res = await createHarness({ model: "mock-sim" }).simulate(
      { topic: "Lever", report },
      { theme: { themeCss: ":root{--color-text:#232b20}" } },
    );
    // The page's own <meta http-equiv> is a static error; the fix didn't remove it, so it's invalid.
    expect(res).toMatchObject({ status: "invalid" });
    expect(res.status === "invalid" && res.problems[0]!.message).toMatch(/http-equiv/);

    script = [{ text: `<custom_html>${page.replace(/<meta[^>]*>/, "")}</custom_html>` }];
    const ok = await createHarness({ model: "mock-sim" }).simulate({ topic: "Lever", report }, { theme: { themeCss: ":root{--color-text:#232b20}" } });
    expect(ok).toMatchObject({ status: "ok", mode: "custom" });
    if (ok.status !== "ok") return;
    expect(ok.html).toMatch(/^<!doctype html>/);
    expect(ok.html.indexOf("Content-Security-Policy")).toBeLessThan(ok.html.indexOf("<input")); // policy comes first
    expect(ok.html).toContain(":root{--color-text:#232b20}");
    expect(ok.html).toContain("data-lesson-mode");
    expect(ok.html).toContain("<title>Lever</title>");
    expect(ok.html).not.toContain("<title>Mine</title>");
  });
});

describe("building around an everyday example", () => {
  it("asks for an everyday example when the lesson uses a real-world use", () => {
    expect(exampleProblems("R1", { topic: "x", report })).toEqual([
      { severity: "warning", message: 'The lesson is built on real-world use R1. Build it around an everyday example instead: E1 ("Grass under a tarp") is the most familiar.' },
    ]);
    expect(exampleProblems("E1", { topic: "x", report })).toEqual([]);
    expect(exampleProblems(null, { topic: "x", report })[0]!.message).toMatch(/^Give the id of the everyday example/);
  });

  it("follows the teacher's choice, even a real-world use", () => {
    expect(exampleProblems("R1", { topic: "x", report, exampleId: "R1" })).toEqual([]);
    expect(exampleProblems("E1", { topic: "x", report, exampleId: "R1" })[0]!.message).toMatch(/^The teacher chose example R1/);
  });

  it("allows a real-world use when there are no everyday examples", () => {
    expect(exampleProblems("R1", { topic: "x", report: { ...report, everydayExamples: [] } })).toEqual([]);
  });

  it("sends a lesson built on a real-world use back once, and uses the everyday one", async () => {
    script = [{ text: reply(lesson, "R1") }, { text: reply(lesson, "E1") }];
    const res = await createHarness({ model: "mock-sim" }).simulate({ topic: "x", report });
    expect(res).toMatchObject({ status: "ok", exampleId: "E1", attempts: 2, warnings: [] });
    expect((requests[1]!.messages.at(-1) as { content: string }).content).toContain("Build it around an everyday example instead");
  });
});

describe("exampleKindOf", () => {
  it("tells everyday examples from real-world uses", () => {
    expect(exampleKindOf("E1", report)).toBe("everyday");
    expect(exampleKindOf("R1", report)).toBe("real-world");
    expect(exampleKindOf("R9", report)).toBeNull();
    expect(exampleKindOf(null, report)).toBeNull();
  });
});
