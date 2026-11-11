/**
 * The edu-v2 pipeline (edu-v2-adapt-teach-platform): builds one learn-by-doing concept page from
 * a topic by running the edu-v2 skills in order, each reading what the earlier ones produced.
 *
 *   research → plan → arc → cast → scene → demo → copy → stories → page
 *
 * Every step is its own fresh engine whose system prompt is the platform rules plus that step's
 * skill. Its reply is read and checked in code (edu/checks.ts). If a check finds problems, the
 * problems go back once in the same conversation; if errors remain, the run stops at that step
 * and nothing is built on a bad output. A transient error (connection, rate limit, overload)
 * retries the step up to twice. A stopped run can be resumed: pass the outputs already made.
 *
 * The standalone widget step (edu-v2-interactive-sim) is not part of this pipeline: the page
 * step builds its figures directly from the demo spec, as the Explainer app does.
 */
import { createEngine, type EngineEvent } from "./engine.js";
import {
  checkArc,
  checkBrief,
  checkCast,
  checkCopy,
  checkDemo,
  checkPage,
  checkPlan,
  checkStories,
  checkSvg,
  between,
  readJson,
  readPage,
  readSvg,
  SCENE_PLACEHOLDER,
  stripFences,
  type CastScene,
  type ConceptBrief,
  type ConceptPlan,
  type DemoSpec,
  type EduCopy,
  type EduProblem,
  type EduStories,
} from "./edu/checks.js";
import { builtinSkillPath, loadSkillFile, resolveSkill, type SkillDefinition } from "./skills/loader.js";
import type { Tool } from "./tool.js";
import { createCalculateTool } from "./tools/calculate.js";
import { createSearchBackend } from "./tools/search/index.js";
import { createWebSearchTool, DEFAULT_TRUSTED_DOMAINS, type WebSearchToolInstance } from "./tools/webSearch.js";
import type { Provider, StopReason, Usage } from "./types.js";

export type { EduProblem } from "./edu/checks.js";

export const EDU_PIPELINE_NAME = "edu-v2-adapt-teach-platform";

export type EduTrack = "hs" | "ug";

export interface EduInput {
  /** The concept, e.g. "Law of demand". */
  topic: string;
  /** Audience: high school (default) or undergraduate. */
  track?: EduTrack;
  /** Where the artifact sits, e.g. { course: "How Markets Work", chapter: "Demand", n: 1 }. */
  position?: { course?: string; chapter?: string; n?: number };
  /** science, engineering or economics. The research step decides if it's missing. */
  domain?: string;
  /** The teacher's note (information only). */
  note?: string;
  /** What the chapter already holds, so this artifact doesn't clash with it. */
  chapter?: {
    runningCase?: string;
    usedNames?: string[];
    usedPlaces?: string[];
  };
}

/** Each step's output, in pipeline order. JSON steps hold the parsed object. */
export interface EduOutputs {
  brief?: ConceptBrief;
  plan?: ConceptPlan;
  arc?: string;
  cast?: CastScene;
  scene?: string;
  demo?: DemoSpec;
  copy?: EduCopy;
  stories?: EduStories;
  /** The page as the model wrote it, with the scene placeholder. */
  page?: string;
  /** The finished page fragment: the page with the scene SVG put in. */
  html?: string;
}

export type EduStepId = "research" | "plan" | "arc" | "cast" | "scene" | "demo" | "copy" | "stories" | "page";

/** The steps in order: the skill each runs and the file its output is saved as. */
export const EDU_STEPS: readonly { id: EduStepId; skill: string; file: string; output: keyof EduOutputs }[] = [
  { id: "research", skill: "edu-v2-concept-research", file: "concept-brief.json", output: "brief" },
  { id: "plan", skill: "edu-v2-concept-break-build", file: "concept-plan.json", output: "plan" },
  { id: "arc", skill: "edu-v2-story-arc", file: "story-arc.md", output: "arc" },
  { id: "cast", skill: "edu-v2-character-scene", file: "cast-scene.json", output: "cast" },
  { id: "scene", skill: "edu-v2-layout-and-drawing", file: "scene.svg", output: "scene" },
  { id: "demo", skill: "edu-v2-concept-demo", file: "demo-spec.json", output: "demo" },
  { id: "copy", skill: "edu-v2-story-and-scene", file: "copy.json", output: "copy" },
  { id: "stories", skill: "edu-v2-story-and-scene", file: "stories.json", output: "stories" },
  { id: "page", skill: "edu-v2-content-presentation", file: "page.html", output: "page" },
];

export interface EduStepRecord {
  step: EduStepId;
  skill: string;
  file: string;
  /** "resumed": taken from an earlier run's outputs, not run again. */
  status: "ok" | "failed" | "incomplete" | "resumed";
  /** Replies it took (1, or 2 after a fix). 0 when resumed. */
  attempts: number;
  /** Problems left in the kept output (warnings), or the errors that stopped the run. */
  problems: EduProblem[];
  usage: Usage;
}

export type EduEvent =
  | { type: "step_start"; step: EduStepId; skill: string }
  | { type: "step_resumed"; step: EduStepId }
  | { type: "step_check"; step: EduStepId; attempt: number; problems: EduProblem[] }
  | { type: "step_retry"; step: EduStepId; retry: number; message: string }
  | { type: "step_done"; step: EduStepId; record: EduStepRecord }
  | ({ step: EduStepId } & EngineEvent);

export interface EduOptions {
  onEvent?: (event: EduEvent) => void;
  signal?: AbortSignal;
  /** Outputs from an earlier run: those steps are kept and not run again. */
  resume?: EduOutputs;
  /** Called after each step with everything made so far (e.g. to save files as you go). */
  onStepDone?: (record: EduStepRecord, outputs: EduOutputs) => void | Promise<void>;
}

export interface EduResult {
  /** "ok": every step passed. "failed": a step's output still had errors after its fix. "incomplete": a step stopped early. */
  status: "ok" | "failed" | "incomplete";
  outputs: EduOutputs;
  steps: EduStepRecord[];
  /** The step that stopped the run, and why, in plain words. */
  failedStep?: EduStepId;
  message?: string;
  /** Every URL web_search returned in the research step. */
  searchedUrls: string[];
  usage: Usage;
}

export interface EduPipelineOptions {
  /** The provider for the planning and writing steps; called per step so configure() applies. */
  getProvider: () => Provider;
  /** The provider for the drawing steps (scene, page). Default: getProvider. */
  getDesignProvider?: () => Provider;
  maxTurns: number;
  /** Retries of a step after a transient error. Default 2. */
  transientRetries?: number;
}

/** Websites the research step may cite: the harness's trusted list plus education research. */
export const EDU_TRUSTED_DOMAINS = [
  ...DEFAULT_TRUSTED_DOMAINS,
  "edu",
  "ac.uk",
  "ac.in",
  "eric.ed.gov",
  "physics.info",
  "hyperphysics.phy-astr.gsu.edu",
  "physicsclassroom.com",
  "aapt.org",
  "aip.org",
  "iop.org",
  "rsc.org",
  "ncert.nic.in",
  "nist.gov",
  "noaa.gov",
  "usgs.gov",
  "economicshelp.org",
  "imf.org",
  "worldbank.org",
  "oecd.org",
  "federalreserve.gov",
  "bankofengland.co.uk",
  "core-econ.org",
  "springer.com",
  "wiley.com",
  "tandfonline.com",
  "jstor.org",
  "arxiv.org",
  "plos.org",
  "ncbi.nlm.nih.gov",
];

const MAX_ATTEMPTS = 2;

/** What a step needs: the run so far. */
interface Ctx {
  input: EduInput & { track: EduTrack };
  outputs: EduOutputs;
  /** The research step's search tool (null until it runs, or when the brief was resumed). */
  webSearch: WebSearchToolInstance | null;
}

interface StepDef {
  id: EduStepId;
  /** Other skills appended to the system prompt as reference. */
  refs?: string[];
  design?: boolean;
  tools?: (ctx: Ctx) => Tool[];
  message: (ctx: Ctx) => string;
  /** Reads the reply into the output value, or says why it can't. */
  read: (text: string) => { value: unknown } | { error: string };
  check: (value: unknown, ctx: Ctx) => EduProblem[];
}

const tag = (name: string, body: unknown) =>
  `<${name}>\n${typeof body === "string" ? body : JSON.stringify(body, null, 1)}\n</${name}>`;
const join = (...parts: (string | false | 0 | undefined)[]) => parts.filter(Boolean).join("\n\n");
const colourMap = (ctx: Ctx) => ctx.outputs.plan?.colour_map ?? [];

const STEPS: Record<EduStepId, StepDef> = {
  research: {
    id: "research",
    tools: (ctx) => {
      // Fresh per run (and per retry): its URL list and search count must not carry over.
      ctx.webSearch = createWebSearchTool({ backend: createSearchBackend(), trustedDomains: EDU_TRUSTED_DOMAINS, maxCallsPerRun: 10 });
      return [ctx.webSearch.tool, createCalculateTool()];
    },
    message: ({ input }) =>
      join(
        tag("concept", input.topic),
        tag("track", input.track),
        input.position && tag("position", input.position),
        input.domain && tag("domain", input.domain),
        input.note && tag("note", input.note),
      ),
    read: (text) => readJson(text, "concept_brief"),
    check: (value, ctx) => checkBrief(value, ctx.webSearch?.returnedUrls() ?? null),
  },
  plan: {
    id: "plan",
    tools: () => [createCalculateTool()],
    message: ({ input, outputs }) =>
      join(
        tag("concept_brief", outputs.brief),
        tag("track", input.track),
        input.chapter && tag("chapter", input.chapter),
      ),
    read: (text) => readJson(text, "concept_plan"),
    check: (value, ctx) => checkPlan(value, ctx.outputs.brief),
  },
  arc: {
    id: "arc",
    message: ({ input, outputs }) =>
      join(tag("concept_plan", outputs.plan), tag("track", input.track), input.chapter?.runningCase && tag("running_case", input.chapter.runningCase)),
    read: (text) => {
      const arc = between(text, "story_arc");
      return arc ? { value: stripFences(arc) } : { error: "The reply has no <story_arc> block." };
    },
    check: (value) => checkArc(value as string),
  },
  cast: {
    id: "cast",
    message: (ctx) =>
      join(
        tag("story_arc", ctx.outputs.arc),
        tag("track", ctx.input.track),
        tag("colour_map", colourMap(ctx)),
        ctx.input.chapter?.usedNames?.length && tag("used_names", ctx.input.chapter.usedNames.join(", ")),
        ctx.input.chapter?.usedPlaces?.length && tag("used_places", ctx.input.chapter.usedPlaces.join("; ")),
      ),
    read: (text) => readJson(text, "cast_scene"),
    check: (value, ctx) => checkCast(value, ctx.outputs.arc, ctx.input.chapter?.usedNames),
  },
  scene: {
    id: "scene",
    design: true,
    message: (ctx) => join(tag("task", "scene"), tag("cast_scene", ctx.outputs.cast), tag("colour_map", colourMap(ctx))),
    read: (text) => {
      const svg = readSvg(text);
      return svg ? { value: svg } : { error: "The reply has no <svg> inside <scene_svg>." };
    },
    check: (value) => checkSvg(value as string),
  },
  demo: {
    id: "demo",
    message: (ctx) =>
      join(
        tag("concept_plan", ctx.outputs.plan),
        tag("story_arc", ctx.outputs.arc),
        tag("cast_scene", ctx.outputs.cast),
        tag("track", ctx.input.track),
        tag("colour_map", colourMap(ctx)),
      ),
    read: (text) => readJson(text, "demo_spec"),
    check: (value, ctx) => checkDemo(value, ctx.outputs.plan),
  },
  copy: {
    id: "copy",
    message: (ctx) =>
      join(
        tag("task", "foundation-copy"),
        tag("concept_plan", ctx.outputs.plan),
        tag("story_arc", ctx.outputs.arc),
        tag("cast_scene", ctx.outputs.cast),
        tag("demo_spec", ctx.outputs.demo),
        tag("track", ctx.input.track),
      ),
    read: (text) => readJson(text, "copy"),
    check: (value, ctx) => checkCopy(value, ctx.outputs.cast, ctx.outputs.plan),
  },
  stories: {
    id: "stories",
    message: (ctx) =>
      join(
        tag("task", "chapter-stories"),
        tag("concept_plan", ctx.outputs.plan),
        tag("story_arc", ctx.outputs.arc),
        tag("cast_scene", ctx.outputs.cast),
        tag("copy", ctx.outputs.copy),
        tag("track", ctx.input.track),
      ),
    read: (text) => readJson(text, "stories"),
    check: (value, ctx) => checkStories(value, ctx.outputs.cast, ctx.outputs.copy),
  },
  page: {
    id: "page",
    design: true,
    refs: ["edu-v2-layout-and-drawing"],
    message: (ctx) =>
      join(
        tag("concept_plan", ctx.outputs.plan),
        tag("story_arc", ctx.outputs.arc),
        tag("cast_scene", ctx.outputs.cast),
        tag("demo_spec", ctx.outputs.demo),
        tag("copy", ctx.outputs.copy),
        tag("stories", ctx.outputs.stories),
        tag("colour_map", colourMap(ctx)),
        tag("artifact", artifactDeclaration(ctx.input)),
        tag("track", ctx.input.track),
      ),
    read: (text) => {
      const page = readPage(text);
      return page ? { value: page } : { error: "The reply has no <page> block." };
    },
    check: (value, ctx) => checkPage(value as string, ctx.outputs.copy),
  },
};

export function slugify(text: string, fallback = "concept"): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || fallback;
}

/** The values of the page's `var ARTIFACT = {…}` declaration. */
export function artifactDeclaration(input: EduInput): { id: string; chapter: string; track: EduTrack; core: string } {
  return {
    id: `${slugify(input.topic)}-${input.position?.n ?? 1}`,
    chapter: slugify(input.position?.chapter ?? "", "chapter"),
    track: input.track ?? "hs",
    core: "1.0.0",
  };
}

export function createEduPipeline({ getProvider, getDesignProvider, maxTurns, transientRetries = 2 }: EduPipelineOptions) {
  // Read every skill once, so a missing or broken SKILL.md fails when the harness is created.
  const platform = loadSkillFile(builtinSkillPath(EDU_PIPELINE_NAME));
  const skills = new Map<string, SkillDefinition>();
  for (const name of new Set(EDU_STEPS.map((s) => s.skill))) skills.set(name, loadSkillFile(builtinSkillPath(name)));

  return async function edu(input: EduInput, options: EduOptions = {}): Promise<EduResult> {
    const topic = input.topic?.trim();
    if (!topic) throw new Error("Topic is empty");
    const track: EduTrack = input.track ?? "hs";
    if (track !== "hs" && track !== "ug") throw new Error(`Track must be "hs" or "ug" (got "${String(track)}")`);

    const emit = options.onEvent ?? (() => {});
    const ctx: Ctx = { input: { ...input, topic, track }, outputs: {}, webSearch: null };
    const steps: EduStepRecord[] = [];
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const finish = (status: EduResult["status"], extra: Partial<EduResult> = {}): EduResult => ({
      status,
      outputs: ctx.outputs,
      steps,
      searchedUrls: ctx.webSearch ? [...ctx.webSearch.returnedUrls()] : [],
      usage,
      ...extra,
    });

    for (const meta of EDU_STEPS) {
      options.signal?.throwIfAborted();
      const resumed = options.resume?.[meta.output];
      if (resumed !== undefined) {
        (ctx.outputs as Record<string, unknown>)[meta.output] = resumed;
        const record: EduStepRecord = { step: meta.id, skill: meta.skill, file: meta.file, status: "resumed", attempts: 0, problems: [], usage: zero() };
        steps.push(record);
        emit({ type: "step_resumed", step: meta.id });
        if (meta.id === "page") ctx.outputs.html = assemble(resumed as string, ctx.outputs.scene);
        await options.onStepDone?.(record, ctx.outputs);
        continue;
      }

      emit({ type: "step_start", step: meta.id, skill: meta.skill });
      const def = STEPS[meta.id];
      let outcome: StepOutcome;
      for (let retry = 0; ; retry++) {
        try {
          outcome = await runStep(def, meta.skill, ctx, options, emit);
          break;
        } catch (e) {
          if (options.signal?.aborted || retry >= transientRetries || !isTransient(e)) throw e;
          emit({ type: "step_retry", step: meta.id, retry: retry + 1, message: e instanceof Error ? e.message : String(e) });
        }
      }

      addUsage(usage, outcome.usage);
      const record: EduStepRecord = {
        step: meta.id,
        skill: meta.skill,
        file: meta.file,
        status: outcome.status,
        attempts: outcome.attempts,
        problems: outcome.problems,
        usage: outcome.usage,
      };
      steps.push(record);
      if (outcome.status === "ok") {
        (ctx.outputs as Record<string, unknown>)[meta.output] = outcome.value;
        if (meta.id === "page") ctx.outputs.html = assemble(outcome.value as string, ctx.outputs.scene);
      }
      emit({ type: "step_done", step: meta.id, record });
      await options.onStepDone?.(record, ctx.outputs);
      if (outcome.status !== "ok") return finish(outcome.status, { failedStep: meta.id, message: outcome.message });
    }
    return finish("ok");
  };

  type StepOutcome =
    | { status: "ok"; value: unknown; attempts: number; problems: EduProblem[]; usage: Usage }
    | { status: "failed" | "incomplete"; message: string; attempts: number; problems: EduProblem[]; usage: Usage };

  async function runStep(def: StepDef, skillName: string, ctx: Ctx, options: EduOptions, emit: (e: EduEvent) => void): Promise<StepOutcome> {
    const tools = def.tools?.(ctx) ?? [];
    const skill = resolveSkill(skills.get(skillName)!, tools);
    const refs = (def.refs ?? []).map((name) => `# Reference: ${name}\n\n${(skills.get(name) ?? loadSkillFile(builtinSkillPath(name))).instructions}`);
    const engine = createEngine({
      provider: def.design && getDesignProvider ? getDesignProvider() : getProvider(),
      tools: skill.tools,
      system: [platform.instructions, skill.instructions, ...refs].join("\n\n---\n\n"),
      maxTurns: tools.length ? maxTurns : 1,
      ...(skill.maxOutputTokens !== undefined ? { maxTokens: skill.maxOutputTokens } : {}),
    });
    const usage = zero();
    const runOptions = {
      onEvent: (e: EngineEvent) => emit({ ...e, step: def.id }),
      ...(options.signal ? { signal: options.signal } : {}),
    };

    let best: { value: unknown; problems: EduProblem[]; attempt: number } | null = null;
    let lastErrors: EduProblem[] = [];
    let message = def.message(ctx);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await engine.run(message, runOptions);
      addUsage(usage, result.usage);
      if (result.stopReason !== "end_turn") {
        if (best) break; // a cut-off fix: keep the earlier usable output
        return { status: "incomplete", message: incompleteMessage(def.id, result.stopReason, skill.maxOutputTokens, maxTurns), attempts: attempt, problems: [], usage };
      }

      const read = def.read(result.text);
      const problems = "error" in read ? [{ severity: "error" as const, message: read.error }] : def.check(read.value, ctx);
      emit({ type: "step_check", step: def.id, attempt, problems });
      const errors = problems.filter((p) => p.severity === "error");
      if ("value" in read && errors.length === 0 && (!best || problems.length < best.problems.length)) {
        best = { value: read.value, problems, attempt };
      }
      lastErrors = errors;
      if (problems.length === 0) break;
      message = fixRequest(problems);
    }

    if (best) return { status: "ok", value: best.value, attempts: best.attempt, problems: best.problems, usage };
    const summary = lastErrors.length === 1 ? lastErrors[0]!.message : `${lastErrors.length} problems remained after one fix.`;
    return { status: "failed", message: `Step "${def.id}" failed its checks: ${summary}`, attempts: MAX_ATTEMPTS, problems: lastErrors, usage };
  }
}

/** The page with the scene SVG put where the model left the placeholder. */
export function assemble(page: string, scene: string | undefined): string {
  return scene ? page.replace(SCENE_PLACEHOLDER, `<figure class="scene">${scene}</figure>`) : page;
}

/** Connection drops, rate limits and overloads: worth running the step again. */
export function isTransient(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "AbortError") return false;
  const status = (e as { status?: unknown }).status;
  if (typeof status === "number") return status === 408 || status === 409 || status === 429 || status >= 500;
  return /APIConnection|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|fetch failed|network|timed? ?out|overloaded/i.test(
    `${e.name} ${e.message}`,
  );
}

function fixRequest(problems: EduProblem[]): string {
  const list = problems.map((p) => `- [${p.severity}] ${p.message}`).join("\n");
  return (
    `We checked your output. Please fix these problems:\n\n<problems>\n${list}\n</problems>\n\n` +
    "Errors must be fixed; warnings should be. Change only what's needed, keep everything that works, " +
    "and reply again with the complete output in the same format (the same tags, the whole thing)."
  );
}

function incompleteMessage(step: EduStepId, stopReason: StopReason | "max_turns", outputLimit: number | undefined, maxTurns: number): string {
  switch (stopReason) {
    case "max_tokens":
      return `Step "${step}" used its whole output limit${outputLimit !== undefined ? ` (${outputLimit} tokens)` : ""} before finishing.`;
    case "refusal":
      return `The model declined step "${step}".`;
    case "max_turns":
      return `Step "${step}" didn't finish within ${maxTurns} model calls.`;
    default:
      return `Step "${step}" stopped unexpectedly (${stopReason}).`;
  }
}

const zero = (): Usage => ({ inputTokens: 0, outputTokens: 0 });

function addUsage(total: Usage, add: Usage) {
  total.inputTokens += add.inputTokens;
  total.outputTokens += add.outputTokens;
  if (add.reasoningTokens !== undefined) total.reasoningTokens = (total.reasoningTokens ?? 0) + add.reasoningTokens;
}

// ---------------------------------------------------------------------
// Saving and resuming
// ---------------------------------------------------------------------

/** Each output as file contents, keyed by its file name (only the outputs that exist). */
export function eduFiles(outputs: EduOutputs): Record<string, string> {
  const files: Record<string, string> = {};
  for (const step of EDU_STEPS) {
    const value = outputs[step.output];
    if (value === undefined) continue;
    files[step.file] = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  if (outputs.html) {
    files["index.html"] =
      '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' +
      `${outputs.html}\n</body>\n</html>\n`;
  }
  return files;
}

/** Outputs read back from saved files (the reverse of eduFiles). Unreadable files are skipped. */
export function readEduOutputs(files: Record<string, string | undefined>): EduOutputs {
  const outputs: Record<string, unknown> = {};
  for (const step of EDU_STEPS) {
    const text = files[step.file];
    if (text === undefined) continue;
    if (step.file.endsWith(".json")) {
      try {
        outputs[step.output] = JSON.parse(text);
      } catch {
        continue;
      }
    } else {
      outputs[step.output] = text;
    }
  }
  return outputs as EduOutputs;
}
