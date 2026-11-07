import { createEngine, type Engine, type EngineEvent } from "./engine.js";
import { createProvider, type ProviderOptions } from "./providers/registry.js";
import { createResearchPipeline, type ResearchInput, type ResearchOptions, type ResearchResult } from "./research.js";
import {
  createSimulationPipeline,
  type InteractiveTheme,
  type LessonCheck,
  type LessonTester,
  type SimulationInput,
  type SimulationOptions,
  type SimulationResult,
} from "./simulation.js";
import { buildSystemPrompt, collectTools, type Skill } from "./skill.js";
import { builtinSkills } from "./skills/index.js";
import type { Provider, StopReason, Usage } from "./types.js";

/** Everything the integrating app is allowed to configure. */
export interface HarnessConfig {
  /** "provider:model", e.g. "openai:gpt-5", "anthropic:claude-opus-5-5", or just "anthropic". */
  model: string;
  /** The user's API key. Omit to let the provider SDK read its env var. */
  apiKey?: string;
  /** Optional custom endpoint (e.g. an OpenAI-compatible server). */
  baseURL?: string;
  /** Max model calls per message. Default 20. */
  maxTurns?: number;
  /** Names of built-in skills to enable. Default: all of them. */
  skills?: string[];
  /**
   * A different model for building interactive lessons (simulate, and generate's second stage),
   * e.g. a stronger designer than the research model. Default: the main model.
   */
  simulation?: { model: string; apiKey?: string; baseURL?: string };
}

/** Settings that can change while the app runs; conversations are kept. */
export type HarnessUpdate = Partial<Pick<HarnessConfig, "model" | "apiKey" | "baseURL">>;

export type HarnessEvent = EngineEvent;

export interface SendOptions {
  /** Live progress for this message (tool calls, text, done). */
  onEvent?: (event: HarnessEvent) => void;
  /** Abort from outside; harness.cancel(sessionId) does the same. */
  signal?: AbortSignal;
}

export interface SendResult {
  text: string;
  stopReason: StopReason | "max_turns";
  usage: Usage;
}

export interface SkillInfo {
  name: string;
  description: string;
}

/** The two parts of a generate() run */
export type GenerateStage = "research" | "simulation";

/** Progress for generate(): each engine event tagged with its stage, plus a marker when a stage starts. */
export type GenerateEvent = { stage: GenerateStage } & (EngineEvent | { type: "stage_start" });

export interface GenerateOptions {
  onEvent?: (event: GenerateEvent) => void;
  /** Stops whichever stage is running */
  signal?: AbortSignal;
  /** Brand theme for the interactive's HTML */
  theme?: InteractiveTheme;
  /** The app's browser self-test for the interactive (see LessonTester) */
  testLesson?: LessonTester;
  /** Called after each interactive reply is checked */
  onCheck?: (check: LessonCheck) => void;
}

export interface GenerateResult {
  research: ResearchResult;
  /**
   * "skipped" when research didn't produce a report (nothing to build on).
   * "error" when the interactive failed after research succeeded (the report is still good);
   * `cancelled` is true when it was stopped on purpose.
   */
  simulation: SimulationResult | { status: "skipped" } | { status: "error"; message: string; cancelled: boolean };
}

export interface Harness {
  /** Run one user message through the pipeline for a conversation. */
  send(sessionId: string, message: string, options?: SendOptions): Promise<SendResult>;
  /**
   * Research a science or maths topic on trusted websites (the topic-research
   * skill). Each call is independent; there's no history between calls.
   * Web search finds its own key: TAVILY_API_KEY from the environment, or else
   * from the harness's .env file. The app doesn't pass it.
   */
  research(input: ResearchInput, options?: ResearchOptions): Promise<ResearchResult>;
  /**
   * Build an interactive lesson from a research report (the interactive-simulation skill), around
   * a real-life example from the report. No web search; each call is independent.
   */
  simulate(input: SimulationInput, options?: SimulationOptions): Promise<SimulationResult>;
  /**
   * Research a topic, then build an interactive lesson from the report: research() then
   * simulate() in one run. A finished report is never thrown away: if the interactive fails,
   * the research result is still returned.
   */
  generate(input: ResearchInput, options?: GenerateOptions): Promise<GenerateResult>;
  /** Stop the in-flight run for a session. Returns false if nothing was running. */
  cancel(sessionId: string): boolean;
  /** Forget a conversation. */
  reset(sessionId: string): void;
  /** Change model / key / endpoint. Applies to all sessions, history is kept. */
  configure(update: HarnessUpdate): void;
  /** The provider and model currently in use. */
  info(): { provider: string; model: string; maxTurns: number };
  /** Skills enabled in this harness. */
  skills(): SkillInfo[];
}

/** Thrown when a session already has a message in progress. */
export class HarnessBusyError extends Error {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" is already processing a message`);
    this.name = "HarnessBusyError";
  }
}

const BASE_PROMPT = `You are a helpful assistant embedded in an application.
Use the tools available to you when they help answer accurately. Be concise.`;

interface Session {
  engine: Engine;
  running: AbortController | null;
}

/**
 * The harness pipeline — the only entry point an app uses.
 *
 * For each message: check the session is free → run the engine with the
 * harness's skills → on failure, roll back the incomplete turn so the
 * conversation stays valid → return the result.
 */
export function createHarness(config: HarnessConfig): Harness {
  // ---- 1. Resolve and validate configuration once, up front ----
  const maxTurns = config.maxTurns ?? 20;
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new Error(`maxTurns must be a whole number of 1 or more (got ${config.maxTurns})`);
  }
  const skills = selectSkills(config.skills);
  const system = buildSystemPrompt(BASE_PROMPT, skills);
  const tools = collectTools(skills);

  let connection: ProviderOptions & { model: string } = {
    model: config.model,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  };
  let provider: Provider = createProvider(connection.model, connection);

  const sessions = new Map<string, Session>();
  const research = createResearchPipeline({ getProvider: () => provider, maxTurns });
  // Interactive lessons may use their own model; otherwise the main one (and follow configure()).
  const simulationProvider = config.simulation
    ? createProvider(config.simulation.model, { apiKey: config.simulation.apiKey, baseURL: config.simulation.baseURL })
    : null;
  const simulate = createSimulationPipeline({ getProvider: () => simulationProvider ?? provider });

  async function generate(input: ResearchInput, options: GenerateOptions = {}): Promise<GenerateResult> {
    const { signal, theme, testLesson, onCheck } = options;
    const emit = options.onEvent ?? (() => {});
    const tag = (stage: GenerateStage) => (event: EngineEvent) => emit({ ...event, stage });

    emit({ type: "stage_start", stage: "research" });
    const researched = await research(input, { onEvent: tag("research"), ...(signal ? { signal } : {}) });
    if (researched.status !== "ok") return { research: researched, simulation: { status: "skipped" } };

    emit({ type: "stage_start", stage: "simulation" });
    try {
      const simulation = await simulate(
        { topic: input.topic, ...(input.description ? { description: input.description } : {}), report: researched.report },
        {
          onEvent: tag("simulation"),
          ...(signal ? { signal } : {}),
          ...(theme ? { theme } : {}),
          ...(testLesson ? { testLesson } : {}),
          ...(onCheck ? { onCheck } : {}),
        },
      );
      return { research: researched, simulation };
    } catch (err) {
      // Keep the finished research; report the interactive's failure alongside it.
      const message = err instanceof Error ? err.message : String(err);
      return { research: researched, simulation: { status: "error", message, cancelled: signal?.aborted ?? false } };
    }
  }

  function getSession(sessionId: string): Session {
    let session = sessions.get(sessionId);
    if (!session) {
      session = { engine: createEngine({ provider, tools, system, maxTurns }), running: null };
      sessions.set(sessionId, session);
    }
    return session;
  }

  // ---- 2. The per-message pipeline ----
  async function send(sessionId: string, message: string, options: SendOptions = {}): Promise<SendResult> {
    if (!message.trim()) throw new Error("Message is empty");

    const session = getSession(sessionId);
    if (session.running) throw new HarnessBusyError(sessionId);

    const controller = new AbortController();
    const onOuterAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onOuterAbort, { once: true });
    session.running = controller;

    const { messages } = session.engine;
    const checkpoint = messages.length;
    try {
      session.engine.provider = provider; // pick up any configure() since last run
      const result = await session.engine.run(message, {
        signal: controller.signal,
        onEvent: options.onEvent,
      });
      return { text: result.text, stopReason: result.stopReason, usage: result.usage };
    } catch (err) {
      // Error or cancel mid-turn: drop this turn's partial messages (e.g. a tool
      // call with no result) so the next message starts from a valid history.
      messages.length = checkpoint;
      throw err;
    } finally {
      session.running = null;
      options.signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  return {
    send,
    research,
    simulate,
    generate,

    cancel(sessionId) {
      const running = sessions.get(sessionId)?.running;
      if (!running) return false;
      running.abort(new Error("Cancelled"));
      return true;
    },

    reset(sessionId) {
      sessions.get(sessionId)?.running?.abort(new Error("Session reset"));
      sessions.delete(sessionId);
    },

    configure(update) {
      const next = { ...connection, ...update };
      // Build first so a bad model/key leaves the current setup untouched.
      const nextProvider = createProvider(next.model, next);
      connection = next;
      provider = nextProvider;
    },

    info() {
      return { provider: provider.name, model: provider.model, maxTurns };
    },

    skills() {
      return skills.map(({ name, description }) => ({ name, description }));
    },
  };
}

function selectSkills(names: string[] | undefined): Skill[] {
  if (!names) return builtinSkills;
  return names.map((name) => {
    const skill = builtinSkills.find((s) => s.name === name);
    if (!skill) {
      const known = builtinSkills.map((s) => s.name).join(", ");
      throw new Error(`Unknown skill "${name}". Available: ${known}`);
    }
    return skill;
  });
}
