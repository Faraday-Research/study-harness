import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, LessonsTaskError, type LessonsCache, type LessonsEvent } from "../src/index.js";
import { registerProvider } from "../src/providers/registry.js";
import type { ProviderRequest, ProviderResponse, ToolCall } from "../src/types.js";

// ── a small textbook, as page-marked markdown ────────────────────────────────────

const P = (tag: string) => `${tag} ` + "Light travels in straight lines and bounces off shiny surfaces. ".repeat(4).trim();
const page = (n: number, ...blocks: string[]) => [`<!--- Page ${n} --->`, ...blocks].join("\n\n");
/** {{start:Title}} marks where the fake model starts a topic. */
const BOOK = [
  page(1, "# Light", "## Reflection of light", P("{{start:Reflection of light}} a"), P("b")),
  page(2, P("c"), P("d")),
  page(3, "## Spherical mirrors", P("{{start:Spherical mirrors}} e"), P("f")),
  page(4, P("g"), P("h")),
].join("\n\n");

// ── a fake model that answers each task by reading its material ──────────────────

const NEW_UNITS = "New units";

function answerFor(material: string): unknown {
  if (material.includes(NEW_UNITS)) {
    const fresh = material.slice(material.indexOf(NEW_UNITS));
    // Each unit: its [u001 · p.1 · text] line, then its text up to the next unit.
    const units = [...fresh.matchAll(/^\[(u\d+) · [^\]]+\]\n([\s\S]*?)(?=^\[u\d+ · |$(?![\s\S]))/gm)].map((m) => ({ id: m[1]!, text: m[2]! }));
    return {
      units: units.map((u) => ({ unit: u.id, role: "concept", idea: "light" })),
      starts: units.flatMap((u) => {
        const title = /\{\{start:([^}]+)\}\}/.exec(u.text)?.[1];
        return title ? [{ unit: u.id, kind: "teaching", title, description: `About ${title}.`, objective: `Students can explain ${title}.` }] : [];
      }),
    };
  }
  const topics = [...material.matchAll(/^(T\d+) · p\./gm)].map((m) => m[1]!);
  if (material.includes("Topics, in order")) {
    return {
      topics: topics.map((topic) => ({ topic, theme: "Light" })),
      lessons: [{ firstTopic: topics[0], title: "Reflection and mirrors", description: "How light reflects.", objective: "By the end, students can use mirrors." }],
    };
  }
  return {
    topics: topics.map((topic, i) =>
      i === 0 ? { topic, introduces: ["reflection"], needs: [] } : { topic, introduces: ["focal length"], needs: ["reflection"] },
    ),
  };
}

type Reply = "answer" | "text" | "bad" | "transient";
let replies: Reply[] = [];
let requests: ProviderRequest[] = [];
registerProvider("lessons-mock", (model) => ({
  name: "lessons-mock",
  model: model ?? "default",
  async generate(req): Promise<ProviderResponse> {
    requests.push({ ...req, messages: [...req.messages] });
    const first = req.messages[0];
    const material = first?.role === "user" ? first.content : "";
    const reply = replies.shift() ?? "answer";
    if (reply === "transient") throw Object.assign(new Error("overloaded"), { status: 529 });
    if (reply === "text") {
      return { message: { role: "assistant", text: "```json\n" + JSON.stringify(answerFor(material)) + "\n```", toolCalls: [] }, stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1 } };
    }
    const toolCalls: ToolCall[] = [{ id: `c${requests.length}`, name: "submit_answer", input: reply === "bad" ? { nothing: true } : answerFor(material) }];
    return { message: { role: "assistant", text: "", toolCalls }, stopReason: "tool_use", usage: { inputTokens: 1, outputTokens: 1 } };
  },
}));

function memoryCache(): LessonsCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return { store, get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) };
}

const input = { source: { markdown: BOOK }, book: { id: "light", title: "Light" } };

beforeEach(() => {
  replies = [];
  requests = [];
});

describe("harness.lessons", () => {
  it("runs every task on the model with its skill and a submit_answer tool, then builds the graph", async () => {
    const res = await createHarness({ model: "lessons-mock" }).lessons(input);

    expect(res.plan.topics.map((t) => t.title)).toEqual(["Reflection of light", "Spherical mirrors"]);
    expect(res.plan.lessons).toHaveLength(1);
    expect(res.plan.prerequisites?.topics).toEqual([{ from: "T2", to: "T1", because: ["reflection"] }]);
    expect(res.plan.skills.every((s) => String(s.version).startsWith("study-harness-"))).toBe(true);
    expect(res.cypher).toContain("REQUIRES");
    expect(res.tasks).toEqual({ asked: requests.length, cached: 0 });

    for (const req of requests) {
      expect(req.tools.map((t) => t.name)).toEqual(["submit_answer"]);
      expect(req.system).toContain("submit_answer");
    }
    expect(requests[0]!.system).toContain("# Finding topics");
    expect(requests.at(-1)!.system).toContain("# Finding prerequisites");
  });

  it("replays cached answers without calling the model", async () => {
    const cache = memoryCache();
    const harness = createHarness({ model: "lessons-mock" });
    const first = await harness.lessons(input, { cache });
    const asked = requests.length;

    const second = await harness.lessons(input, { cache });
    expect(requests.length).toBe(asked);
    expect(second.tasks).toEqual({ asked: 0, cached: first.tasks.asked });
    expect(second.cypher).toBe(first.cypher);
  });

  it("keys the cache by model: another model asks again", async () => {
    const cache = memoryCache();
    await createHarness({ model: "lessons-mock:a" }).lessons(input, { cache });
    const asked = requests.length;
    await createHarness({ model: "lessons-mock:b" }).lessons(input, { cache });
    expect(requests.length).toBe(asked * 2);
  });

  it("sends an unreadable answer back as a tool error and accepts the fix", async () => {
    replies = ["bad", "answer"];
    const events: LessonsEvent[] = [];
    const res = await createHarness({ model: "lessons-mock" }).lessons(input, { onEvent: (e) => events.push(e) });

    expect(res.plan.topics).toHaveLength(2);
    const fix = requests[1]!.messages;
    expect(fix).toHaveLength(3);
    expect(fix[2]).toMatchObject({ role: "tool", results: [{ isError: true }] });
    expect(events.some((e) => e.type === "task_retry" && e.reason === "unusable")).toBe(true);
  });

  it("accepts a JSON answer given as text", async () => {
    replies = ["text"];
    const res = await createHarness({ model: "lessons-mock" }).lessons(input);
    expect(res.plan.topics).toHaveLength(2);
  });

  it("retries a transient error, and gives up after the answer attempts", async () => {
    replies = ["transient"];
    const ok = await createHarness({ model: "lessons-mock" }).lessons(input, { transientRetries: 1 });
    expect(ok.plan.topics).toHaveLength(2);

    replies = ["bad", "bad"];
    await expect(createHarness({ model: "lessons-mock" }).lessons(input, { answerAttempts: 2 })).rejects.toBeInstanceOf(LessonsTaskError);
  });

  it("skips the prerequisite task when it is turned off", async () => {
    const res = await createHarness({ model: "lessons-mock" }).lessons(input, { planner: { prerequisites: false } });
    expect(res.plan.prerequisites).toBeNull();
    expect(requests.every((r) => !r.system?.includes("# Finding prerequisites"))).toBe(true);
  });
});
