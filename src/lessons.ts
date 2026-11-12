/**
 * The lessons pipeline: a textbook PDF turned into lessons made of topics, with prerequisites,
 * using doc-extraction-util (deps/doc-extraction-util) for everything except the model calls.
 *
 *   OCR (Mistral) → layout graph → LessonPlanner tasks → plan → property graph → Cypher
 *
 * Who does what:
 * - doc-extraction-util (code): OCR, the layout graph, reading units and windows, the material and
 *   answer schema of every task, holding answers to the skills, page math, and turning the concepts
 *   named per topic into REQUIRES links. It never calls a model and never reads the environment.
 * - this file: runs each task the planner hands out on the harness's provider, with that task's
 *   skill (src/skills/find-topics, group-lessons, find-prerequisites) as the system prompt and a
 *   single `submit_answer` tool whose input schema is the task's schema. Tasks run strictly one
 *   after another: each window carries state into the next.
 *
 * Retries:
 * - a connection drop, rate limit or overload retries the same model call (isTransient, backoff);
 * - an answer the planner can't read (PlanAnswerError), no answer, or a cut-off answer is asked
 *   again, with the problem sent back, up to `answerAttempts` times in all.
 *
 * Caching (optional, `cache`): every accepted answer is stored under a hash of
 * (instructions, material, schema, model). Replaying a book through a fresh planner then rebuilds
 * the same plan without model calls, and adding prerequisites to an earlier run only asks the new
 * tasks. The OCR result is cached too, by a hash of the PDF bytes.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractDocument, MistralOcr, type ExtractResult } from "doc-extraction-util";
import { MarkdownLayoutAdapter, toLayoutGraph, type LayoutDocument } from "doc-extraction-util/layout";
import {
  LessonPlanner,
  parseJsonAnswer,
  PlanAnswerError,
  SKILL_ID,
  toCypher,
  toPropertyGraph,
  type AskStep,
  type LessonPlan,
  type PlannerOptions,
  type PlanProgress,
  type PlanTask,
  type PropertyGraph,
  type PropertyValue,
  type SkillId,
  type SkillVersion,
} from "doc-extraction-util/lessons";
import { isTransient } from "./eduPipeline.js";
import { builtinSkillPath, loadSkillFile, type SkillDefinition } from "./skills/loader.js";
import type { Message, Provider, ProviderResponse, ToolSpec, Usage } from "./types.js";

export type { LessonPlan, PlanProgress, PropertyGraph } from "doc-extraction-util/lessons";

// ---- Input, options, events, result ----

/** Where the book comes from. */
export type LessonsSource =
  /** A PDF, read with Mistral OCR. The key is passed in; nothing reads the environment. */
  | { pdf: Uint8Array; mistralApiKey: string; maxPages?: number }
  /** Markdown that already has `<!--- Page N --->` markers (e.g. an earlier OCR). */
  | { markdown: string };

export interface LessonsInput {
  source: LessonsSource;
  book: {
    /** Prefixes every graph id ("<id>:T3"), so many books can share one graph. */
    id: string;
    /** Shown to the AI and set on the Book node. */
    title?: string;
    /** Extra Book node properties (file name, …). */
    properties?: Record<string, PropertyValue>;
  };
}

/** Somewhere to keep answers and OCR results between runs. Values are plain JSON. */
export interface LessonsCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

/** Planner settings the app may change (lesson sizes, prerequisites on/off, …). */
export type LessonsPlannerOptions = Omit<PlannerOptions, "title" | "skills" | "onProgress">;

export interface LessonsOptions {
  signal?: AbortSignal;
  onEvent?: (event: LessonsEvent) => void;
  /** Answer and OCR cache. Without one, every run asks the model again. */
  cache?: LessonsCache;
  planner?: LessonsPlannerOptions;
  /** Output token limit per task. Default 16000: answers are a few thousand tokens. */
  maxTokens?: number;
  /** Tries per task for answers that can't be used (unreadable, missing, cut off). Default 3. */
  answerAttempts?: number;
  /** Retries of one model call after a connection error, rate limit or overload. Default 2. */
  transientRetries?: number;
}

export type LessonsEvent =
  | { type: "ocr_start"; cached: boolean }
  | { type: "ocr_done"; pages: number; failedRanges: number }
  | { type: "progress"; progress: PlanProgress }
  /** `part`: which of the step's tasks this is (e.g. topic window 2 of 5), when the step has several */
  | { type: "task_start"; step: AskStep; label: string; cached: boolean; part?: { index: number; total: number } }
  | { type: "task_retry"; step: AskStep; reason: "transient" | "unusable"; attempt: number; message: string }
  | { type: "task_done"; step: AskStep; label: string; cached: boolean; ms: number };

export interface LessonsResult {
  plan: LessonPlan;
  /** Neo4j-shaped: Book, Lesson, Topic, Concept, Chunk, Page nodes and their relationships. */
  graph: PropertyGraph;
  /** Idempotent Cypher for `graph` (safe to run twice). */
  cypher: string;
  /** The layout graph the plan was cut from (its node ids are the ones in topic spans). */
  layout: LayoutDocument;
  /** Model calls made and answers replayed from the cache. */
  tasks: { asked: number; cached: number };
  usage: Usage;
}

/** Thrown when a task still has no usable answer after every attempt. */
export class LessonsTaskError extends Error {
  constructor(
    readonly step: AskStep,
    message: string,
  ) {
    super(message);
    this.name = "LessonsTaskError";
  }
}

// ---- The pipeline ----

const ANSWER_TOOL = "submit_answer";
const SUBMIT_NOTE = `When you have worked through the steps, call the \`${ANSWER_TOOL}\` tool once, with your whole answer as its input.`;
const SKILL_IDS = Object.values(SKILL_ID) as SkillId[];
const DEFAULT_MAX_TOKENS = 16000;
const BACKOFF_MS = 2000;

/** The app's copies of the skills, with the system prompt each task is sent with. */
interface LessonSkill {
  definition: SkillDefinition;
  system: string;
}

export interface LessonsPipelineOptions {
  getProvider: () => Provider;
  /** Read the skills from somewhere else (tests). Default: the harness's built-in skill folders. */
  loadSkill?: (id: SkillId) => SkillDefinition;
}

export function createLessonsPipeline({ getProvider, loadSkill }: LessonsPipelineOptions) {
  const skills = new Map<SkillId, LessonSkill>();
  for (const id of SKILL_IDS) {
    const definition = loadSkill ? loadSkill(id) : loadSkillFile(builtinSkillPath(id));
    skills.set(id, { definition, system: `${definition.instructions}\n\n${SUBMIT_NOTE}` });
  }
  /** Recorded on every plan, so it says which copy of each method made it. */
  const versions: SkillVersion[] = SKILL_IDS.map((id) => ({
    id,
    version: `study-harness-${String(skills.get(id)!.definition.metadata?.version ?? "0")}`,
  }));

  return async function lessons(input: LessonsInput, options: LessonsOptions = {}): Promise<LessonsResult> {
    const { signal, cache } = options;
    const emit = options.onEvent ?? (() => {});
    const provider = getProvider(); // one model for the whole book: windows build on each other
    const model = `${provider.name}:${provider.model}`;
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const tasks = { asked: 0, cached: 0 };

    const { layout, ocrWarnings } = await readBook(input.source, { cache, signal, emit });
    const planner = new LessonPlanner(layout, {
      ...options.planner,
      ...(input.book.title ? { title: input.book.title } : {}),
      skills: versions,
      onProgress: (progress) => emit({ type: "progress", progress }),
    });

    const runner: TaskRunner = {
      provider,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      answerAttempts: options.answerAttempts ?? 3,
      transientRetries: options.transientRetries ?? 2,
      usage,
      emit,
      ...(signal ? { signal } : {}),
    };

    for (let task = planner.next(); task; task = planner.next()) {
      signal?.throwIfAborted();
      const skill = skills.get(task.skill)!;
      const label = taskLabel(task);
      const part = taskPart(task);
      const key = answerKey(skill.system, task, model);

      // A cached answer is replayed through the planner like a fresh one. If it no longer
      // reads (it shouldn't: the key covers the skill and schema), the model is asked instead.
      const hit = cache ? await cache.get(key) : undefined;
      if (hit !== undefined) {
        try {
          emit({ type: "task_start", step: task.step, label, cached: true, ...(part ? { part } : {}) });
          planner.answer(hit);
          tasks.cached++;
          emit({ type: "task_done", step: task.step, label, cached: true, ms: 0 });
          continue;
        } catch (e) {
          if (!(e instanceof PlanAnswerError)) throw e;
        }
      }

      emit({ type: "task_start", step: task.step, label, cached: false, ...(part ? { part } : {}) });
      const started = Date.now();
      const answer = await runTask(runner, skill.system, task, planner);
      tasks.asked++;
      await cache?.set(key, answer);
      emit({ type: "task_done", step: task.step, label, cached: false, ms: Date.now() - started });
    }

    const plan = planner.finish();
    plan.warnings.unshift(...ocrWarnings);
    const graph = toPropertyGraph(plan, layout, {
      id: input.book.id,
      title: input.book.title ?? input.book.id,
      ...(input.book.properties ? { properties: input.book.properties } : {}),
    });
    return { plan, graph, cypher: toCypher(graph), layout, tasks, usage };
  };
}

// ---- One task ----

interface TaskRunner {
  provider: Provider;
  maxTokens: number;
  answerAttempts: number;
  transientRetries: number;
  usage: Usage;
  signal?: AbortSignal;
  emit: (event: LessonsEvent) => void;
}

/**
 * Asks the model for one task's answer and hands it to the planner. Returns the accepted answer
 * (to cache). An unusable answer goes back to the model with what was wrong, in the same
 * conversation; a cut-off one is asked again from the start.
 */
async function runTask(runner: TaskRunner, system: string, task: PlanTask, planner: LessonPlanner): Promise<unknown> {
  const tool: ToolSpec = {
    name: ANSWER_TOOL,
    description: "Submit your answer to this task. Call it exactly once, with the complete answer.",
    inputSchema: task.schema,
  };
  const fresh = (): Message[] => [{ role: "user", content: task.material }];
  let messages = fresh();
  let problem = "";

  for (let attempt = 1; attempt <= runner.answerAttempts; attempt++) {
    if (attempt > 1) runner.emit({ type: "task_retry", step: task.step, reason: "unusable", attempt, message: problem });
    const started = Date.now();
    const res = await generate(runner, task.step, { system, messages, tools: [tool], maxTokens: runner.maxTokens });
    const ms = Date.now() - started;

    if (res.stopReason === "refusal") throw new LessonsTaskError(task.step, `The model declined the ${task.step} task.`);
    if (res.stopReason === "max_tokens") {
      // A cut-off tool call can't be continued: start the task over.
      problem = `The answer used the whole output limit (${runner.maxTokens} tokens) and was cut off.`;
      messages = fresh();
      continue;
    }

    const call = res.message.toolCalls.find((c) => c.name === ANSWER_TOOL);
    // Models that answer in text instead of calling the tool still count, if the text is JSON.
    const answer = call ? call.input : readText(res.message.text);
    if (answer === undefined || answer === null) {
      problem = call
        ? `The \`${ANSWER_TOOL}\` input was not valid JSON.`
        : `No answer was given: call the \`${ANSWER_TOOL}\` tool with your answer.`;
    } else {
      try {
        planner.answer(answer, { ms });
        return answer;
      } catch (e) {
        if (!(e instanceof PlanAnswerError)) throw e;
        problem = e.message;
      }
    }

    // Send the problem back so the model can fix its answer.
    const fix = `${problem}\nFix it and call \`${ANSWER_TOOL}\` again with the complete, corrected answer.`;
    messages = [...messages, res.message];
    if (call) {
      // Every other tool call in that turn needs a result too.
      messages.push({
        role: "tool",
        results: res.message.toolCalls.map((c) => ({ toolCallId: c.id, name: c.name, content: c === call ? fix : "Ignored.", isError: true })),
      });
    } else {
      messages.push({ role: "user", content: fix });
    }
  }

  throw new LessonsTaskError(task.step, `The ${taskLabel(task)} task got no usable answer in ${runner.answerAttempts} tries: ${problem}`);
}

/** One model call, retried after a connection drop, rate limit or overload. */
async function generate(
  runner: TaskRunner,
  step: AskStep,
  request: { system: string; messages: Message[]; tools: ToolSpec[]; maxTokens: number },
): Promise<ProviderResponse> {
  for (let retry = 0; ; retry++) {
    try {
      const res = await runner.provider.generate({ ...request, ...(runner.signal ? { signal: runner.signal } : {}) });
      runner.usage.inputTokens += res.usage.inputTokens;
      runner.usage.outputTokens += res.usage.outputTokens;
      if (res.usage.reasoningTokens !== undefined) {
        runner.usage.reasoningTokens = (runner.usage.reasoningTokens ?? 0) + res.usage.reasoningTokens;
      }
      return res;
    } catch (e) {
      if (runner.signal?.aborted || retry >= runner.transientRetries || !isTransient(e)) throw e;
      runner.emit({ type: "task_retry", step, reason: "transient", attempt: retry + 2, message: e instanceof Error ? e.message : String(e) });
      await sleep(BACKOFF_MS * 2 ** retry, runner.signal);
    }
  }
}

// ---- Reading the book ----

async function readBook(
  source: LessonsSource,
  ctx: { cache?: LessonsCache | undefined; signal?: AbortSignal | undefined; emit: (event: LessonsEvent) => void },
): Promise<{ layout: LayoutDocument; ocrWarnings: string[] }> {
  // trackPageStarts: exact pages for paragraphs inside long sections.
  const adapter = new MarkdownLayoutAdapter({ trackPageStarts: true });
  if ("markdown" in source) return { layout: adapter.adapt(source.markdown), ocrWarnings: [] };

  const key = `ocr-${sha256(source.pdf)}-${source.maxPages ?? "all"}`;
  const cached = (await ctx.cache?.get(key)) as ExtractResult | undefined;
  ctx.emit({ type: "ocr_start", cached: cached !== undefined });
  const result =
    cached ??
    (await extractDocument(source.pdf, {
      ocr: new MistralOcr({ apiKey: source.mistralApiKey }),
      ...(source.maxPages ? { maxPages: source.maxPages } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    }));

  const failed = result.ocr.ranges.filter((r) => r.error);
  ctx.emit({ type: "ocr_done", pages: result.processedPages, failedRanges: failed.length });
  // Only a complete read is kept, so the next run tries the missing pages again.
  if (!cached && failed.length === 0) await ctx.cache?.set(key, result);

  const ocrWarnings = failed.map((r) => `OCR could not read pages ${r.from}–${r.to}: ${r.error}`);
  if (result.truncated) ocrWarnings.push(`Only the first ${result.processedPages} of ${result.totalPages} pages were read.`);
  return { layout: toLayoutGraph({ pages: result.pages, parts: result.parts }, { adapter }), ocrWarnings };
}

// ---- Cache, saving, helpers ----

/** The cache key of a task's answer: a hash of what the answer depends on. */
export function answerKey(instructions: string, task: Pick<PlanTask, "material" | "schema">, model: string): string {
  return sha256(JSON.stringify([instructions, task.material, task.schema, model]));
}

/** A cache that keeps one JSON file per key in a folder. */
export function fileCache(dir: string): LessonsCache {
  const file = (key: string) => join(dir, `${key.replace(/[^\w.-]/g, "_")}.json`);
  return {
    async get(key) {
      try {
        return JSON.parse(await readFile(file(key), "utf8")) as unknown;
      } catch {
        return undefined; // missing or unreadable: treat as not cached
      }
    },
    async set(key, value) {
      await mkdir(dir, { recursive: true });
      await writeFile(file(key), JSON.stringify(value));
    },
  };
}

/** The files saveLessons writes, by name. */
export const LESSONS_FILES = {
  plan: "plan.json",
  graph: "graph.json",
  cypher: "book.cypher",
  layout: "layout.json",
} as const;

/** Writes the plan, the property graph, the Cypher and the layout graph into `dir`. */
export async function saveLessons(dir: string, result: LessonsResult): Promise<Record<keyof typeof LESSONS_FILES, string>> {
  await mkdir(dir, { recursive: true });
  const paths = {
    plan: join(dir, LESSONS_FILES.plan),
    graph: join(dir, LESSONS_FILES.graph),
    cypher: join(dir, LESSONS_FILES.cypher),
    layout: join(dir, LESSONS_FILES.layout),
  };
  await Promise.all([
    writeFile(paths.plan, JSON.stringify(result.plan, null, 2)),
    writeFile(paths.graph, JSON.stringify(result.graph, null, 2)),
    writeFile(paths.cypher, result.cypher),
    writeFile(paths.layout, JSON.stringify(result.layout)),
  ]);
  return paths;
}

function taskLabel(task: PlanTask): string {
  switch (task.step) {
    case "topics":
      return `topics ${task.window}/${task.windows}`;
    case "splitTopic":
      return `split "${task.topic}" ${task.index}/${task.total}`;
    case "lessons":
      return `lessons${task.attempt > 1 ? ` (attempt ${task.attempt})` : ""}`;
    case "prerequisites":
      return `prerequisites ${task.window}/${task.windows}`;
  }
}

function taskPart(task: PlanTask): { index: number; total: number } | null {
  switch (task.step) {
    case "topics":
    case "prerequisites":
      return { index: task.window, total: task.windows };
    case "splitTopic":
      return { index: task.index, total: task.total };
    case "lessons":
      return null;
  }
}

/** The JSON in a text answer, or undefined when there is none. */
function readText(text: string): unknown {
  try {
    return parseJsonAnswer(text);
  } catch {
    return undefined;
  }
}

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
