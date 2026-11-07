import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace the built-in skills with the test-only "echo" and "clock" skills.
vi.mock("../src/skills/index.js", async () => {
  const { loadFixtureSkills } = await import("./fixtures/skills.js");
  return { builtinSkills: loadFixtureSkills() };
});

import { createHarness, HarnessBusyError, type HarnessEvent } from "../src/index.js";
import { registerProvider, type ProviderOptions } from "../src/providers/registry.js";
import type { ProviderRequest, ProviderResponse, ToolCall } from "../src/types.js";

// A scripted fake provider, registered under "mock" so createHarness can use it.
type Step = { text?: string; toolCalls?: ToolCall[]; fail?: Error; wait?: boolean };
let script: Step[] = [];
let requests: ProviderRequest[] = [];
let created: Array<{ model: string | undefined; options: ProviderOptions }> = [];

registerProvider("mock", (model, options) => {
  created.push({ model, options });
  return {
    name: "mock",
    model: model ?? "mock-default",
    async generate(req): Promise<ProviderResponse> {
      requests.push({ ...req, messages: [...req.messages] });
      const step = script.shift() ?? { text: "ok" };
      if (step.wait) {
        // Hang until aborted, like a slow network call.
        await new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(req.signal!.reason)));
      }
      if (step.fail) throw step.fail;
      const toolCalls = step.toolCalls ?? [];
      return {
        message: { role: "assistant", text: step.text ?? "", toolCalls },
        stopReason: toolCalls.length ? "tool_use" : "end_turn",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
  };
});

beforeEach(() => {
  script = [];
  requests = [];
  created = [];
});

describe("createHarness", () => {
  it("passes model and api key to the provider", () => {
    const h = createHarness({ model: "mock:m1", apiKey: "sk-test" });
    expect(created[0]).toEqual({ model: "m1", options: { model: "mock:m1", apiKey: "sk-test", baseURL: undefined } });
    expect(h.info()).toEqual({ provider: "mock", model: "m1", maxTurns: 20 });
  });

  it("builds the system prompt and tools from enabled skills", async () => {
    const h = createHarness({ model: "mock" });
    expect(h.skills().map((s) => s.name)).toEqual(["echo", "clock"]);
    await h.send("s", "hi");
    expect(requests[0]!.system).toContain("## Skill: echo");
    expect(requests[0]!.system).toContain("## Skill: clock");
    expect(requests[0]!.tools.map((t) => t.name).sort()).toEqual(["clock", "echo"]);
  });

  it("enables only the requested skills", async () => {
    const h = createHarness({ model: "mock", skills: ["echo"] });
    await h.send("s", "hi");
    expect(requests[0]!.tools.map((t) => t.name)).toEqual(["echo"]);
    expect(requests[0]!.system).not.toContain("Skill: clock");
  });

  it("rejects bad config up front", () => {
    expect(() => createHarness({ model: "mock", skills: ["nope"] })).toThrow(/Unknown skill "nope"/);
    expect(() => createHarness({ model: "mock", maxTurns: 0 })).toThrow(/maxTurns/);
    expect(() => createHarness({ model: "nope" })).toThrow(/Unknown provider/);
  });

  it("runs skill tools and streams events per send", async () => {
    script = [{ toolCalls: [{ id: "1", name: "echo", input: { text: "84" } }] }, { text: "84" }];
    const events: HarnessEvent[] = [];
    const res = await createHarness({ model: "mock" }).send("s", "12*7?", { onEvent: (e) => events.push(e) });
    expect(res.text).toBe("84");
    expect(events.find((e) => e.type === "tool_end")).toMatchObject({ result: { content: "84" } });
  });

  it("keeps sessions separate", async () => {
    const h = createHarness({ model: "mock" });
    await h.send("a", "first");
    await h.send("b", "other");
    await h.send("a", "second");
    expect(requests[2]!.messages.filter((m) => m.role === "user").map((m) => m.role === "user" && m.content)).toEqual([
      "first",
      "second",
    ]);
  });

  it("rejects a second send while one is running, and cancel stops it", async () => {
    script = [{ wait: true }];
    const h = createHarness({ model: "mock" });
    const first = h.send("s", "slow");
    await expect(h.send("s", "again")).rejects.toBeInstanceOf(HarnessBusyError);
    expect(h.cancel("s")).toBe(true);
    await expect(first).rejects.toThrow("Cancelled");
    expect(h.cancel("s")).toBe(false);
  });

  it("rolls back a failed turn so history stays valid", async () => {
    script = [
      { toolCalls: [{ id: "1", name: "echo", input: { text: "2" } }] },
      { fail: new Error("network down") },
    ];
    const h = createHarness({ model: "mock" });
    await expect(h.send("s", "1+1")).rejects.toThrow("network down");
    await h.send("s", "hello again");
    // The failed turn (user msg, tool call, tool result) is gone.
    expect(requests.at(-1)!.messages).toEqual([{ role: "user", content: "hello again" }]);
  });

  it("configure switches model for existing sessions and keeps history", async () => {
    const h = createHarness({ model: "mock:m1", apiKey: "k1" });
    await h.send("s", "first");
    h.configure({ model: "mock:m2" });
    expect(created.at(-1)!.options.apiKey).toBe("k1"); // unchanged settings carry over
    await h.send("s", "second");
    expect(h.info().model).toBe("m2");
    expect(requests.at(-1)!.messages).toHaveLength(3);
  });

  it("configure with a bad model keeps the current one", () => {
    const h = createHarness({ model: "mock:m1" });
    expect(() => h.configure({ model: "nope" })).toThrow();
    expect(h.info().model).toBe("m1");
  });

  it("reset forgets a conversation", async () => {
    const h = createHarness({ model: "mock" });
    await h.send("s", "first");
    h.reset("s");
    await h.send("s", "fresh");
    expect(requests.at(-1)!.messages).toHaveLength(1);
  });
});
