import { toToolSpec, type Tool } from "./tool.js";
import type { Message, Provider, StopReason, ToolCall, ToolResult, Usage } from "./types.js";

export type EngineEvent =
  | { type: "turn_start"; turn: number }
  | { type: "assistant"; text: string; toolCalls: ToolCall[] }
  | { type: "tool_start"; call: ToolCall }
  | { type: "tool_end"; result: ToolResult }
  | { type: "done"; stopReason: StopReason | "max_turns"; usage: Usage };

export interface EngineOptions {
  provider: Provider;
  tools?: Tool[];
  system?: string;
  /** Upper bound on model calls per `run`. Default 20. */
  maxTurns?: number;
  /** Output token limit for each model call. Default: the provider's own. */
  maxTokens?: number;
  /**
   * Called before each tool runs. Return false to deny; the model receives
   * an error result instead. Useful for human-in-the-loop approval.
   */
  approve?: (call: ToolCall) => boolean | Promise<boolean>;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Progress events for this run only (each caller gets its own). */
  onEvent?: (event: EngineEvent) => void;
}

export interface RunResult {
  text: string;
  stopReason: StopReason | "max_turns";
  usage: Usage;
  messages: Message[];
}

/** What `createEngine` returns. */
export interface Engine {
  /** The conversation so far. Grows with every `run`. */
  messages: Message[];
  /** The model backend. Assign a new one to switch providers mid-conversation. */
  provider: Provider;
  /** Send a user message and loop until the model gives a final answer. */
  run(input: string, options?: RunOptions): Promise<RunResult>;
}

/**
 * The agent loop: call the model, run requested tools, feed results back,
 * repeat until the model stops asking for tools.
 *
 * State (history, provider) lives in the returned object and in this
 * function's local variables, which the inner functions keep alive (a closure).
 *
 * History is append-only — earlier messages are never rewritten — which keeps
 * provider prompt caches valid and is required by some providers' thinking.
 */
export function createEngine(opts: EngineOptions): Engine {
  const tools = new Map((opts.tools ?? []).map((t) => [t.name, t]));
  const toolSpecs = [...tools.values()].map(toToolSpec);
  const maxTurns = opts.maxTurns ?? 20;

  const engine: Engine = {
    messages: [],
    provider: opts.provider,
    run,
  };
  return engine;

  async function run(input: string, { signal, onEvent }: RunOptions = {}): Promise<RunResult> {
    const { messages } = engine;
    const emit = onEvent ?? (() => {});
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let text = "";

    messages.push({ role: "user", content: input });

    for (let turn = 1; turn <= maxTurns; turn++) {
      signal?.throwIfAborted();
      emit({ type: "turn_start", turn });

      // Read engine.provider on every turn so a swap takes effect immediately.
      const res = await engine.provider.generate({
        system: opts.system,
        messages,
        tools: toolSpecs,
        ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
        signal,
      });
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      if (res.usage.reasoningTokens !== undefined) {
        usage.reasoningTokens = (usage.reasoningTokens ?? 0) + res.usage.reasoningTokens;
      }
      messages.push(res.message);
      if (res.message.text) text = res.message.text;
      emit({ type: "assistant", text: res.message.text, toolCalls: res.message.toolCalls });

      // Never run tools from a truncated or refused turn: inputs may be partial.
      if (res.stopReason !== "tool_use" || res.message.toolCalls.length === 0) {
        emit({ type: "done", stopReason: res.stopReason, usage });
        return { text, stopReason: res.stopReason, usage, messages };
      }

      // Run all calls concurrently; return every result in ONE tool message.
      const results = await Promise.all(
        res.message.toolCalls.map(async (call) => {
          emit({ type: "tool_start", call });
          const result = await executeTool(call, signal);
          emit({ type: "tool_end", result });
          return result;
        }),
      );
      messages.push({ role: "tool", results });
    }

    emit({ type: "done", stopReason: "max_turns", usage });
    return { text, stopReason: "max_turns", usage, messages };
  }

  async function executeTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    const base = { toolCallId: call.id, name: call.name };
    const tool = tools.get(call.name);
    if (!tool) return { ...base, content: `Unknown tool: ${call.name}`, isError: true };

    const parsed = tool.schema.safeParse(call.input);
    if (!parsed.success) {
      return { ...base, content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    if (opts.approve && !(await opts.approve(call))) {
      return { ...base, content: "The user declined this tool call.", isError: true };
    }
    try {
      const out = await tool.run(parsed.data, { signal });
      return { ...base, content: typeof out === "string" ? out : JSON.stringify(out) };
    } catch (err) {
      return { ...base, content: `Tool error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }
}
