import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Message, Provider, ProviderRequest, ProviderResponse, StopReason, ToolCall } from "../types.js";

export interface AnthropicProviderOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Server-side refusal fallback: if a safety classifier declines, the API
   * retries on a fallback model. On by default for models that support it.
   */
  fallbacks?: boolean;
}

const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function createAnthropicProvider(opts: AnthropicProviderOptions = {}): Provider {
  const name = "anthropic";
  const model = opts.model ?? "claude-opus-5-5";
  // Created once and reused for every request.
  // With no apiKey, the SDK resolves ANTHROPIC_API_KEY / `ant auth login` profiles.
  const client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  const useFallbacks = (opts.fallbacks ?? true) && FALLBACK_MODELS.has(model);

  async function generate(req: ProviderRequest): Promise<ProviderResponse> {
    const res = await client.beta.messages.create(
      {
        model,
        max_tokens: req.maxTokens ?? opts.maxTokens ?? 16000,
        ...(req.system ? { system: req.system } : {}),
        messages: toAnthropicMessages(req.messages, name),
        ...(req.tools.length
          ? {
              tools: req.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
              })),
            }
          : {}),
        ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
        ...(useFallbacks ? { fallbacks: "default" as const, betas: [FALLBACK_BETA] } : {}),
      },
      { signal: req.signal },
    );

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }

    return {
      // Keep the full native content (incl. thinking blocks) for faithful replay.
      message: { role: "assistant", text, toolCalls, raw: { provider: name, content: res.content } },
      stopReason: mapStop(res.stop_reason),
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }

  return { name, model, generate };
}

function mapStop(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

function toAnthropicMessages(messages: Message[], self: string): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  // Consecutive user-side content (tool results then a new prompt) is merged into one turn.
  const pushUser = (blocks: BetaContentBlockParam[]) => {
    const last = out.at(-1);
    if (last?.role === "user" && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role: "user", content: blocks });
  };

  for (const m of messages) {
    if (m.role === "user") {
      pushUser([{ type: "text", text: m.content }]);
    } else if (m.role === "tool") {
      pushUser(
        m.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.toolCallId,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      );
    } else if (m.raw?.provider === self) {
      out.push({ role: "assistant", content: m.raw.content as BetaContentBlockParam[] });
    } else {
      // Written by another provider: rebuild from the neutral form.
      const content: BetaContentBlockParam[] = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const c of m.toolCalls) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.input ?? {} });
      out.push({ role: "assistant", content });
    }
  }
  return out;
}
