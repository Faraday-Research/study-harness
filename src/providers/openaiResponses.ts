import OpenAI from "openai";
import type { ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import type { Message, Provider, ProviderRequest, ProviderResponse, StopReason, ToolCall } from "../types.js";
import type { OpenAIProviderOptions } from "./openai.js";

/**
 * OpenAI's Responses API (/v1/responses), used for OpenAI's own models.
 *
 * Newer reasoning models (e.g. gpt-5.6-luna) only allow function tools
 * together with reasoning on this API, not on Chat Completions.
 *
 * Nothing is stored on OpenAI's side (`store: false`). Instead, each reply's
 * output items, including the model's encrypted reasoning, are kept in the
 * message's `raw` field and sent back unchanged on the next turn, so the model
 * keeps its train of thought across tool calls.
 */
export function createOpenAIResponsesProvider(opts: OpenAIProviderOptions = {}): Provider {
  const name = opts.name ?? "openai";
  const model = opts.model ?? "gpt-5";
  // With no apiKey/baseURL, the SDK reads OPENAI_API_KEY / OPENAI_BASE_URL.
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL, ...(opts.fetch ? { fetch: opts.fetch } : {}) });

  // Models without reasoning reject the request for encrypted reasoning. The
  // first time that happens, stop asking (they have no reasoning to replay).
  let askForReasoning = true;

  async function generate(req: ProviderRequest): Promise<ProviderResponse> {
    const body = {
      model,
      input: toInput(req.messages, name),
      store: false,
      ...(req.system ? { instructions: req.system } : {}),
      ...((req.maxTokens ?? opts.maxTokens) ? { max_output_tokens: req.maxTokens ?? opts.maxTokens } : {}),
      ...(req.tools.length
        ? {
            tools: req.tools.map((t) => ({
              type: "function" as const,
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
              strict: false, // our schemas aren't written for strict mode; the engine validates input itself
            })),
          }
        : {}),
    };

    let res: OpenAI.Responses.Response;
    try {
      res = await client.responses.create(
        { ...body, ...(askForReasoning ? { include: ["reasoning.encrypted_content" as const] } : {}) },
        { signal: req.signal },
      );
    } catch (err) {
      if (!askForReasoning || !isEncryptedReasoningUnsupported(err)) throw err;
      askForReasoning = false;
      res = await client.responses.create(body, { signal: req.signal });
    }

    let text = "";
    let refused = false;
    const toolCalls: ToolCall[] = [];
    for (const item of res.output) {
      if (item.type === "message") {
        for (const part of item.content) {
          if (part.type === "output_text") text += part.text;
          else if (part.type === "refusal") refused = true;
        }
      } else if (item.type === "function_call") {
        toolCalls.push({ id: item.call_id, name: item.name, input: safeJson(item.arguments) });
      }
    }

    const reasoningTokens = res.usage?.output_tokens_details?.reasoning_tokens;
    return {
      message: { role: "assistant", text, toolCalls, raw: { provider: name, content: res.output } },
      stopReason: mapStop(res, refused, toolCalls.length > 0),
      usage: {
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
        ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
      },
    };
  }

  return { name, model, generate };
}

function isEncryptedReasoningUnsupported(err: unknown): boolean {
  return err instanceof OpenAI.APIError && err.status === 400 && /encrypted/i.test(err.message);
}

function mapStop(res: OpenAI.Responses.Response, refused: boolean, hasTools: boolean): StopReason {
  if (res.status === "incomplete") {
    const reason = res.incomplete_details?.reason;
    if (reason === "max_output_tokens") return "max_tokens";
    if (reason === "content_filter") return "refusal";
    return "other";
  }
  if (refused) return "refusal";
  if (hasTools) return "tool_use";
  return res.status === "completed" ? "end_turn" : "other";
}

/** Unparseable arguments become `undefined`, which fails tool schema validation. */
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Harness messages → Responses API input items. */
function toInput(messages: Message[], self: string): ResponseInputItem[] {
  const input: ResponseInputItem[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      input.push({ role: "user", content: m.content });
    } else if (m.role === "tool") {
      for (const r of m.results) input.push({ type: "function_call_output", call_id: r.toolCallId, output: r.content });
    } else if (m.raw?.provider === self) {
      // Our own earlier reply: send its items back exactly (reasoning, text, tool calls).
      input.push(...(m.raw.content as ResponseOutputItem[] as ResponseInputItem[]));
    } else {
      // Written by another provider: rebuild from the neutral form.
      if (m.text) input.push({ role: "assistant", content: m.text });
      for (const c of m.toolCalls) {
        input.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.input ?? {}) });
      }
    }
  }
  return input;
}
