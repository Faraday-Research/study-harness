import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness } from "../src/index.js";
import { registerProvider } from "../src/providers/registry.js";
import type { SearchBackend } from "../src/tools/search/types.js";
import type { ProviderRequest, ProviderResponse, StopReason, ToolCall } from "../src/types.js";

// A fake search service instead of Tavily (no key, no network).
let searchQueries: string[] = [];
let searchSetupError: Error | null = null;
vi.mock("../src/tools/search/index.js", () => ({
  createSearchBackend: (): SearchBackend => {
    if (searchSetupError) throw searchSetupError;
    return {
      name: "fake",
      async search(query) {
        searchQueries.push(query);
        return [
          { title: "Photosynthesis", url: "https://www.britannica.com/science/photosynthesis", content: "Plants make glucose." },
          { title: "Spam", url: "https://randomblog.com/x", content: "untrusted" },
        ];
      },
    };
  },
}));

// A scripted fake model.
type Step = { text?: string; toolCalls?: ToolCall[]; stopReason?: StopReason; reasoning?: number };
let script: Step[] = [];
let requests: ProviderRequest[] = [];
const created: string[] = [];
registerProvider("mock", (model) => {
  created.push(model ?? "default");
  return {
    name: "mock",
    model: model ?? "default",
    async generate(req): Promise<ProviderResponse> {
      requests.push({ ...req, messages: [...req.messages] });
      const step = script.shift() ?? { text: "{}" };
      const toolCalls = step.toolCalls ?? [];
      return {
        message: { role: "assistant", text: step.text ?? "", toolCalls },
        stopReason: step.stopReason ?? (toolCalls.length ? "tool_use" : "end_turn"),
        usage: {
          inputTokens: 10,
          outputTokens: 5 + (step.reasoning ?? 0),
          ...(step.reasoning !== undefined ? { reasoningTokens: step.reasoning } : {}),
        },
      };
    },
  };
});

const search = (id: string, query: string): ToolCall => ({ id, name: "web_search", input: { query } });

beforeEach(() => {
  script = [];
  requests = [];
  searchQueries = [];
  searchSetupError = null;
});

describe("harness.research", () => {
  it("runs the topic-research skill with only web_search and its own limits", async () => {
    await createHarness({ model: "mock" }).research({ topic: " Photosynthesis ", description: "how farmers use it" });
    const req = requests[0]!;
    expect(req.system!.startsWith("ROLE\nYou are a careful research assistant.")).toBe(true);
    expect(req.system).not.toContain("helpful assistant embedded"); // not the chat prompt
    expect(req.tools.map((t) => t.name)).toEqual(["web_search"]);
    expect(req.maxTokens).toBe(32000);
    expect(req.messages).toEqual([
      {
        role: "user",
        content: "<topic>\nPhotosynthesis\n</topic>\n\n<user_description>\nhow farmers use it\n</user_description>",
      },
    ]);
  });

  it("leaves out the description tag when there's no description", async () => {
    await createHarness({ model: "mock" }).research({ topic: "Gravity", description: "  " });
    expect(requests[0]!.messages[0]).toEqual({ role: "user", content: "<topic>\nGravity\n</topic>" });
  });

  it("runs searches and returns the cleaned report with the URLs web_search returned", async () => {
    const reply = '```json\n{"topic":"Photosynthesis","summary":"Plants make their own food.","facts":[{"id":"F1","text":"Uses light","sources":["S1"]},"junk"],"sources":[{"id":"S1","title":"Britannica","url":"https://www.britannica.com/science/photosynthesis"}]}\n```';
    script = [{ toolCalls: [search("1", "photosynthesis overview"), search("2", "photosynthesis uses")] }, { text: reply }];
    const res = await createHarness({ model: "mock" }).research({ topic: "Photosynthesis" });
    expect(res).toMatchObject({
      status: "ok",
      text: reply,
      searchedUrls: ["https://www.britannica.com/science/photosynthesis"], // untrusted one filtered out
      searches: 2,
      usage: { inputTokens: 20, outputTokens: 10 },
    });
    expect(res.status === "ok" && res.report).toMatchObject({
      topic: "Photosynthesis",
      summary: "Plants make their own food.",
      facts: [{ id: "F1", text: "Uses light", sources: ["S1"] }], // junk item dropped
      realWorldUses: [],
      sources: [{ id: "S1", title: "Britannica", url: "https://www.britannica.com/science/photosynthesis" }],
    });
    expect(searchQueries).toEqual(["photosynthesis overview", "photosynthesis uses"]);
  });

  it("asks once to reword a summary and everyday examples full of jargon, and keeps the simpler version", async () => {
    const hard = JSON.stringify({
      topic: "Photosynthesis", summary: "Photosynthesis makes ATP and NADPH in chloroplasts.",
      everyday_examples: [{ id: "E1", situation: "You water a plant.", connection: "Water is a reactant.", sources: ["S1"] }],
      sources: [{ id: "S1", title: "Britannica", url: "https://www.britannica.com/science/photosynthesis" }],
    });
    const simple = JSON.stringify({
      summary: "Plants make their own food from sunlight, water and air.",
      everyday_examples: [{ id: "E1", situation: "You water a plant.", connection: "The plant needs water to make its food.", sources: ["S9"] }],
    });
    script = [{ text: hard }, { text: simple }];
    const res = await createHarness({ model: "mock" }).research({ topic: "Photosynthesis" });

    expect(requests).toHaveLength(2);
    const ask = requests[1]!.messages.at(-1) as { content: string };
    expect(ask.content).toContain('"ATP" is an abbreviation');
    expect(ask.content).toContain('"reactant" is a technical word');
    expect(res.status === "ok" && res.report).toMatchObject({
      summary: "Plants make their own food from sunlight, water and air.",
      everydayExamples: [{ id: "E1", connection: "The plant needs water to make its food.", sources: ["S1"] }], // sources kept
      sources: [{ id: "S1" }],
    });
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  it("keeps the original if the rewording isn't usable", async () => {
    const hard = JSON.stringify({ topic: "x", summary: "It makes ATP." });
    script = [{ text: hard }, { text: "Sorry, I can't." }];
    const res = await createHarness({ model: "mock" }).research({ topic: "x" });
    expect(res.status === "ok" && res.report.summary).toBe("It makes ATP.");
  });

  it("says so when the reply isn't a usable report", async () => {
    script = [{ text: "Here is what I found: photosynthesis is great." }];
    const res = await createHarness({ model: "mock" }).research({ topic: "Photosynthesis" });
    expect(res).toMatchObject({ status: "invalid", text: "Here is what I found: photosynthesis is great." });
    expect(res.status === "invalid" && res.message).toMatch(/couldn't be read/);
  });

  it("gives every run its own URL list and search count", async () => {
    const h = createHarness({ model: "mock" });
    script = [{ toolCalls: [search("1", "a")] }, { text: "{}" }];
    expect((await h.research({ topic: "A" })).searches).toBe(1);
    script = [{ text: "{}" }];
    const second = await h.research({ topic: "B" });
    expect(second.searches).toBe(0);
    expect(second.searchedUrls).toEqual([]);
    expect(requests.at(-1)!.messages).toHaveLength(1); // no history from the first run
  });

  it("reports NOT_SCIENCE as not_science", async () => {
    script = [{ text: "NOT_SCIENCE" }];
    const res = await createHarness({ model: "mock" }).research({ topic: "Football transfers" });
    expect(res.status).toBe("not_science");
    expect(res.searches).toBe(0);
  });

  it("reports a cut-off reply as incomplete", async () => {
    script = [{ text: '{"topic": "Photo', stopReason: "max_tokens" }];
    const res = await createHarness({ model: "mock" }).research({ topic: "Photosynthesis" });
    expect(res).toMatchObject({ status: "incomplete", stopReason: "max_tokens", text: '{"topic": "Photo' });
    expect(res.status === "incomplete" && res.message).toBe(
      "The model used its whole output limit (32000 tokens) before finishing its answer.",
    );
  });

  it("adds up reasoning tokens and mentions them when the limit is hit", async () => {
    script = [
      { toolCalls: [search("1", "photosynthesis")], reasoning: 300 },
      { text: "", stopReason: "max_tokens", reasoning: 7995 },
    ];
    const res = await createHarness({ model: "mock" }).research({ topic: "Photosynthesis" });
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 8305, reasoningTokens: 8295 });
    expect(res.status === "incomplete" && res.message).toBe(
      "The model used its whole output limit (32000 tokens) before finishing its answer. " +
        "This run used 8295 of its 8305 output tokens on hidden reasoning.",
    );
  });

  it("leaves out reasoning tokens when the provider doesn't report them", async () => {
    const res = await createHarness({ model: "mock" }).research({ topic: "Gravity" });
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("explains other early stops", async () => {
    script = [{ text: "", stopReason: "refusal" }];
    const res = await createHarness({ model: "mock" }).research({ topic: "Gravity" });
    expect(res.status === "incomplete" && res.message).toBe("The model declined to research this topic.");
  });

  it("uses the model set with configure()", async () => {
    const h = createHarness({ model: "mock:m1" });
    h.configure({ model: "mock:m2" });
    await h.research({ topic: "Gravity" });
    expect(created.at(-1)).toBe("m2");
  });

  it("rejects an empty topic, and a missing search key, before calling the model", async () => {
    const h = createHarness({ model: "mock" });
    await expect(h.research({ topic: "   " })).rejects.toThrow("Topic is empty");
    searchSetupError = new Error("Web search isn't set up");
    await expect(h.research({ topic: "Gravity" })).rejects.toThrow("Web search isn't set up");
    expect(requests).toHaveLength(0);
  });

  it("can be cancelled", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Cancelled"));
    await expect(createHarness({ model: "mock" }).research({ topic: "Gravity" }, { signal: controller.signal })).rejects.toThrow(
      "Cancelled",
    );
  });

  it("keeps research out of chat", async () => {
    const h = createHarness({ model: "mock" });
    await h.send("s", "hi");
    expect(requests[0]!.tools).toEqual([]); // chat has no web_search
    expect(h.skills()).toEqual([]);
  });
});
