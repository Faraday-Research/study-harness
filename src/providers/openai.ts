import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Message, Provider, ProviderRequest, ProviderResponse, StopReason, ToolCall } from "../types.js";
import { createOpenAIResponsesProvider } from "./openaiResponses.js";

export interface OpenAIProviderOptions {
  model?: string;
  apiKey?: string;
  /**
   * Point at any OpenAI-compatible endpoint (Groq, Together, OpenRouter,
   * Ollama at http://localhost:11434/v1, ...).
   */
  baseURL?: string;
  maxTokens?: number;
  /** Name reported by this provider; lets compatible endpoints register under their own id. */
  name?: string;
  /**
   * Which OpenAI API to call:
   * - "responses" (default for OpenAI itself): needed by newer reasoning models to use tools
   * - "chat" (default when `baseURL` is set): Chat Completions, which OpenAI-compatible servers implement
   */
  api?: "responses" | "chat";
  /** Custom fetch, e.g. to fake the API in tests. */
  fetch?: typeof fetch;
}

/** OpenAI models, through the Responses API or Chat Completions (see `api`). */
export function createOpenAIProvider(opts: OpenAIProviderOptions = {}): Provider {
  const api = opts.api ?? (opts.baseURL ? "chat" : "responses");
  return api === "responses" ? createOpenAIResponsesProvider(opts) : createChatCompletionsProvider(opts);
}

/** Uses Chat Completions, the API most OpenAI-compatible servers implement. */
function createChatCompletionsProvider(opts: OpenAIProviderOptions): Provider {
  const name = opts.name ?? "openai";
  const model = opts.model ?? "gpt-5";
  // Created once and reused for every request.
  // With no apiKey/baseURL, the SDK reads OPENAI_API_KEY / OPENAI_BASE_URL.
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL, ...(opts.fetch ? { fetch: opts.fetch } : {}) });

  async function generate(req: ProviderRequest): Promise<ProviderResponse> {
    const messages: ChatCompletionMessageParam[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push(...toOpenAIMessages(req.messages));

    const res = await client.chat.completions.create(
      {
        model,
        messages,
        ...((req.maxTokens ?? opts.maxTokens) ? { max_completion_tokens: req.maxTokens ?? opts.maxTokens } : {}),
        ...(req.tools.length
          ? {
              tools: req.tools.map((t) => ({
                type: "function" as const,
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
              })),
            }
          : {}),
      },
      { signal: req.signal },
    );

    const choice = res.choices[0];
    if (!choice) throw new Error("OpenAI returned no choices");

    const toolCalls: ToolCall[] = [];
    for (const tc of choice.message.tool_calls ?? []) {
      if (tc.type !== "function") continue;
      toolCalls.push({ id: tc.id, name: tc.function.name, input: safeJson(tc.function.arguments) });
    }

    // Reasoning models (GPT-5, o-series) think before answering; those tokens
    // count toward the output limit, so report them separately.
    const reasoningTokens = res.usage?.completion_tokens_details?.reasoning_tokens;
    return {
      message: { role: "assistant", text: choice.message.content ?? "", toolCalls },
      stopReason: mapStop(choice.finish_reason, toolCalls.length > 0),
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
        ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
      },
    };
  }

  return { name, model, generate };
}

/** Unparseable arguments become `undefined`, which fails tool schema validation. */
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function mapStop(reason: string | null, hasTools: boolean): StopReason {
  switch (reason) {
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "stop":
      // Some compatible servers report "stop" even when tool calls are present.
      return hasTools ? "tool_use" : "end_turn";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "tool") {
      for (const r of m.results) out.push({ role: "tool", tool_call_id: r.toolCallId, content: r.content });
    } else {
      out.push({
        role: "assistant",
        content: m.text || null,
        ...(m.toolCalls.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
              })),
            }
          : {}),
      });
    }
  }
  return out;
}
