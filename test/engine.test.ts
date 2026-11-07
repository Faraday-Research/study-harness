import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEngine, type EngineEvent } from "../src/engine.js";
import { defineTool } from "../src/tool.js";
import type { Provider, ProviderRequest, ProviderResponse } from "../src/types.js";

/** Replays scripted responses and records each request it received. */
function mockProvider(script: Array<Partial<ProviderResponse["message"]> & { stop?: ProviderResponse["stopReason"] }>) {
  const requests: ProviderRequest[] = [];
  const provider: Provider = {
    name: "mock",
    model: "mock-1",
    async generate(req) {
      requests.push({ ...req, messages: [...req.messages] });
      const step = script.shift();
      if (!step) throw new Error("script exhausted");
      const toolCalls = step.toolCalls ?? [];
      return {
        message: { role: "assistant", text: step.text ?? "", toolCalls },
        stopReason: step.stop ?? (toolCalls.length ? "tool_use" : "end_turn"),
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
  };
  return { provider, requests };
}

const add = defineTool({
  name: "add",
  description: "add",
  schema: z.object({ a: z.number(), b: z.number() }),
  run: ({ a, b }) => a + b,
});

describe("Engine", () => {
  it("returns text when no tools are requested", async () => {
    const { provider } = mockProvider([{ text: "hi" }]);
    const res = await createEngine({ provider }).run("hello");
    expect(res.text).toBe("hi");
    expect(res.stopReason).toBe("end_turn");
  });

  it("runs tools, batches results in one message, and loops", async () => {
    const { provider, requests } = mockProvider([
      {
        toolCalls: [
          { id: "1", name: "add", input: { a: 1, b: 2 } },
          { id: "2", name: "add", input: { a: 3, b: 4 } },
        ],
      },
      { text: "3 and 7" },
    ]);
    const res = await createEngine({ provider, tools: [add] }).run("go");
    expect(res.text).toBe("3 and 7");
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(requests[0]!.tools[0]!.inputSchema).toMatchObject({ type: "object", required: ["a", "b"] });
    expect(requests[1]!.messages.at(-1)).toEqual({
      role: "tool",
      results: [
        { toolCallId: "1", name: "add", content: "3" },
        { toolCallId: "2", name: "add", content: "7" },
      ],
    });
  });

  it("reports invalid input, unknown tools, and thrown errors as error results", async () => {
    const boom = defineTool({ name: "boom", description: "", schema: z.object({}), run: () => { throw new Error("bad"); } });
    const { provider, requests } = mockProvider([
      {
        toolCalls: [
          { id: "1", name: "add", input: { a: "x" } },
          { id: "2", name: "nope", input: {} },
          { id: "3", name: "boom", input: {} },
          { id: "4", name: "add", input: undefined }, // unparseable JSON from provider
        ],
      },
      { text: "ok" },
    ]);
    await createEngine({ provider, tools: [add, boom] }).run("go");
    const msg = requests[1]!.messages.at(-1);
    expect(msg?.role).toBe("tool");
    if (msg?.role !== "tool") return;
    expect(msg.results.every((r) => r.isError)).toBe(true);
    expect(msg.results[2]!.content).toBe("Tool error: bad");
  });

  it("does not run tools on a truncated turn", async () => {
    let ran = false;
    const spy = defineTool({ name: "spy", description: "", schema: z.object({}), run: () => { ran = true; } });
    const { provider } = mockProvider([{ toolCalls: [{ id: "1", name: "spy", input: {} }], stop: "max_tokens" }]);
    const res = await createEngine({ provider, tools: [spy] }).run("go");
    expect(ran).toBe(false);
    expect(res.stopReason).toBe("max_tokens");
  });

  it("honors approve() and maxTurns", async () => {
    const call = { id: "1", name: "add", input: { a: 1, b: 1 } };
    const { provider, requests } = mockProvider([{ toolCalls: [call] }, { toolCalls: [call] }]);
    const events: EngineEvent[] = [];
    const res = await createEngine({ provider, tools: [add], maxTurns: 2, approve: () => false }).run("go", { onEvent: (e) => events.push(e) });
    expect(res.stopReason).toBe("max_turns");
    const last = requests[1]!.messages.at(-1);
    expect(last?.role === "tool" && last.results[0]!.content).toBe("The user declined this tool call.");
    expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "max_turns" });
  });

  it("keeps history across runs and allows swapping providers", async () => {
    const a = mockProvider([{ text: "one" }]);
    const b = mockProvider([{ text: "two" }]);
    const engine = createEngine({ provider: a.provider });
    await engine.run("first");
    engine.provider = b.provider;
    await engine.run("second");
    expect(b.requests[0]!.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});
