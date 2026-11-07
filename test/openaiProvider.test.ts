import { describe, expect, it } from "vitest";
import { createOpenAIProvider } from "../src/providers/openai.js";
import type { Message, ToolSpec } from "../src/types.js";

/** A fake OpenAI API: records each request and answers with the next queued reply. */
function fakeApi(replies: Array<{ status?: number; body: unknown }>) {
  const requests: Array<{ url: string; body: any }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const reply = replies.shift();
    if (!reply) throw new Error("No more fake replies");
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

const response = (output: unknown[], extra: Record<string, unknown> = {}) => ({
  id: "resp_1",
  object: "response",
  status: "completed",
  output,
  usage: { input_tokens: 10, output_tokens: 20, output_tokens_details: { reasoning_tokens: 7 } },
  ...extra,
});

const reasoning = { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "secret-thoughts" };
const searchCall = { type: "function_call", id: "fc_1", call_id: "call_1", name: "web_search", arguments: '{"query":"photosynthesis"}', status: "completed" };
const answer = { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Done.", annotations: [] }] };

const tools: ToolSpec[] = [
  { name: "web_search", description: "Search", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
];

describe("OpenAI provider (Responses API)", () => {
  it("sends tools, instructions and no-storage settings to /responses", async () => {
    const api = fakeApi([{ body: response([reasoning, searchCall]) }]);
    const provider = createOpenAIProvider({ model: "gpt-5.6-luna", apiKey: "k", fetch: api.fetch });

    const res = await provider.generate({ system: "Be careful", messages: [{ role: "user", content: "Hi" }], tools, maxTokens: 500 });

    const { url, body } = api.requests[0]!;
    expect(url).toMatch(/\/responses$/);
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      instructions: "Be careful",
      store: false,
      include: ["reasoning.encrypted_content"],
      max_output_tokens: 500,
      input: [{ role: "user", content: "Hi" }],
      tools: [{ type: "function", name: "web_search", description: "Search", strict: false }],
    });
    expect(body).not.toHaveProperty("reasoning_effort");

    expect(res.stopReason).toBe("tool_use");
    expect(res.message.toolCalls).toEqual([{ id: "call_1", name: "web_search", input: { query: "photosynthesis" } }]);
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 20, reasoningTokens: 7 });
  });

  it("sends its own earlier reply back unchanged (reasoning included), then the tool result", async () => {
    const api = fakeApi([{ body: response([reasoning, searchCall]) }, { body: response([answer]) }]);
    const provider = createOpenAIProvider({ apiKey: "k", fetch: api.fetch });

    const messages: Message[] = [{ role: "user", content: "Research it" }];
    const first = await provider.generate({ messages, tools });
    messages.push(first.message, { role: "tool", results: [{ toolCallId: "call_1", name: "web_search", content: '{"results":[]}' }] });
    const second = await provider.generate({ messages, tools });

    expect(api.requests[1]!.body.input).toEqual([
      { role: "user", content: "Research it" },
      reasoning,
      searchCall,
      { type: "function_call_output", call_id: "call_1", output: '{"results":[]}' },
    ]);
    expect(second.message.text).toBe("Done.");
    expect(second.stopReason).toBe("end_turn");
  });

  it("rebuilds replies written by another provider", async () => {
    const api = fakeApi([{ body: response([answer]) }]);
    const provider = createOpenAIProvider({ apiKey: "k", fetch: api.fetch });

    await provider.generate({
      tools,
      messages: [
        { role: "user", content: "Q" },
        { role: "assistant", text: "Let me look.", toolCalls: [{ id: "toolu_1", name: "web_search", input: { query: "x" } }], raw: { provider: "anthropic", content: [] } },
        { role: "tool", results: [{ toolCallId: "toolu_1", name: "web_search", content: "r" }] },
      ],
    });

    expect(api.requests[0]!.body.input).toEqual([
      { role: "user", content: "Q" },
      { role: "assistant", content: "Let me look." },
      { type: "function_call", call_id: "toolu_1", name: "web_search", arguments: '{"query":"x"}' },
      { type: "function_call_output", call_id: "toolu_1", output: "r" },
    ]);
  });

  it("maps incomplete and refused replies", async () => {
    const api = fakeApi([
      { body: response([], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }) },
      { body: response([], { status: "incomplete", incomplete_details: { reason: "content_filter" } }) },
      { body: response([{ ...answer, content: [{ type: "refusal", refusal: "No." }] }]) },
    ]);
    const provider = createOpenAIProvider({ apiKey: "k", fetch: api.fetch });
    const ask = () => provider.generate({ messages: [{ role: "user", content: "Q" }], tools: [] });

    expect((await ask()).stopReason).toBe("max_tokens");
    expect((await ask()).stopReason).toBe("refusal");
    expect((await ask()).stopReason).toBe("refusal");
  });

  it("stops asking for encrypted reasoning when the model doesn't support it", async () => {
    const api = fakeApi([
      { status: 400, body: { error: { message: "Encrypted content is not supported with this model.", type: "invalid_request_error" } } },
      { body: response([answer]) },
      { body: response([answer]) },
    ]);
    const provider = createOpenAIProvider({ model: "gpt-4.1", apiKey: "k", fetch: api.fetch });
    const ask = () => provider.generate({ messages: [{ role: "user", content: "Q" }], tools: [] });

    expect((await ask()).message.text).toBe("Done.");
    expect((await ask()).message.text).toBe("Done.");
    expect(api.requests.map((r) => "include" in r.body)).toEqual([true, false, false]);
  });

  it("still uses Chat Completions for OpenAI-compatible servers (baseURL set)", async () => {
    const api = fakeApi([
      { body: { id: "c1", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Hi" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } } },
    ]);
    const provider = createOpenAIProvider({ apiKey: "k", baseURL: "http://localhost:11434/v1", fetch: api.fetch });

    const res = await provider.generate({ messages: [{ role: "user", content: "Q" }], tools: [] });
    expect(api.requests[0]!.url).toMatch(/\/chat\/completions$/);
    expect(res.message.text).toBe("Hi");
  });
});
