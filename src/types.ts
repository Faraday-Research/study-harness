/**
 * Provider-neutral types. The engine only ever speaks these; each provider
 * adapter translates to/from its own wire format.
 */

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments. Providers must JSON.parse — never pass raw strings. */
  input: unknown;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      text: string;
      toolCalls: ToolCall[];
      /**
       * The provider's native content, kept so a provider can round-trip it
       * unchanged (e.g. Anthropic thinking blocks must be passed back as-is).
       * Only used when the same provider reads the history back.
       */
      raw?: { provider: string; content: unknown };
    }
  | { role: "tool"; results: ToolResult[] };

/** JSON-Schema description of a tool, as sent to the model. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type StopReason =
  | "end_turn" // model finished
  | "tool_use" // model wants tools run
  | "max_tokens" // output truncated
  | "refusal" // provider safety stop
  | "other";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /**
   * Output tokens spent on hidden reasoning (already included in outputTokens).
   * Only set when the provider reports it, e.g. OpenAI reasoning models like GPT-5.
   */
  reasoningTokens?: number;
}

export interface ProviderResponse {
  message: Extract<Message, { role: "assistant" }>;
  stopReason: StopReason;
  usage: Usage;
}

export interface ProviderRequest {
  system?: string;
  messages: Message[];
  tools: ToolSpec[];
  /** Output token limit for this request; overrides the provider's default. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface Provider {
  /** Stable id, e.g. "openai" or "anthropic". */
  readonly name: string;
  readonly model: string;
  generate(req: ProviderRequest): Promise<ProviderResponse>;
}
