/**
 * The simulation pipeline: runs the interactive-simulation skill on a research report and turns
 * its reply into a checked interactive lesson.
 *
 *   topic + description + cleaned report → interactive-simulation skill (no tools)
 *     → reply: <example_id>…</example_id> and <lesson>{ … }</lesson>   (a lesson for our frame)
 *              or <custom_html>…</custom_html>                         (a whole page, rarely)
 *              or NOT_INTERACTIVE
 *     → checks: syntax, static checks (checkLesson.ts), and the app's browser self-test if given
 *     → problems? send them back once and let the model fix them (same conversation)
 *     → lesson put into the frame (or the custom page made safe) → HTML
 *
 * Like research, every run starts fresh: new engine, no history, the skill's instructions as the
 * whole system prompt. It never searches the web; the report is its only source.
 *
 * Lesson code is never run here. (Node's vm module is not a security boundary.) Running it is the
 * job of `testLesson`, which apps implement with a sandboxed browser page.
 */
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { createEngine, type EngineEvent } from "./engine.js";
import { buildCustomHtml, buildInteractiveHtml, type ExampleKind } from "./interactive/buildHtml.js";
import { checkCustomHtml, checkLessonCode, type LessonProblem } from "./interactive/checkLesson.js";
import type { ResearchReport } from "./researchReport.js";
import { builtinSkillPath, loadSkillFile, resolveSkill } from "./skills/loader.js";
import type { Provider, StopReason, Usage } from "./types.js";

export interface SimulationInput {
  /** What the topic is, e.g. "How plants make food from sunlight" */
  topic: string;
  /** Optional note from the teacher, e.g. "for 12-year-olds, how farmers use it" */
  description?: string;
  /** The cleaned research report (from harness.research) the lesson is built on */
  report: ResearchReport;
  /** Build on this real-world use or everyday example (e.g. "R1"); otherwise the model picks */
  exampleId?: string;
}

/** The app's brand, as CSS, put into the lesson's HTML (the harness has no brand of its own). */
export interface InteractiveTheme {
  /** Design tokens (`:root { --color-primary: … }`, light and dark) */
  themeCss?: string;
  /** @font-face rules with data: URLs */
  fontsCss?: string;
}

/**
 * Runs a lesson for real and reports problems. Gets a page built with the self-test
 * (frame/selftest.js); load it in a sandboxed browser page and return window.__LESSON_TEST_RESULT__
 * once <html data-selftest="done">. Never run lesson pages with access to the app.
 */
export type LessonTester = (selfTestHtml: string) => Promise<LessonProblem[]>;

/** One round of checks on a reply */
export interface LessonCheck {
  /** 1 for the first reply, 2 for the fixed one */
  attempt: number;
  problems: LessonProblem[];
}

export interface SimulationOptions {
  /** Live progress for this run */
  onEvent?: (event: EngineEvent) => void;
  signal?: AbortSignal;
  /** Brand theme for the returned `html`; without it the page is unstyled */
  theme?: InteractiveTheme;
  /** The app's browser self-test (see LessonTester). Without it, only the static checks run. */
  testLesson?: LessonTester;
  /** Called after each reply is checked, e.g. to show "Fixing 2 problems…" */
  onCheck?: (check: LessonCheck) => void;
}

export type LessonMode = "frame" | "custom";

export type SimulationResult =
  /**
   * A lesson was made and passed the checks (possibly with warnings left after one fix).
   * `source` is what the model wrote: the lesson code (mode "frame") or the whole page ("custom").
   * Keep it: the page can be rebuilt from it (e.g. with a newer theme). `html` is the finished page.
   */
  | {
      status: "ok";
      mode: LessonMode;
      exampleId: string | null;
      source: string;
      html: string;
      /** Problems that remained but don't stop the lesson from working (e.g. overlapping labels) */
      warnings: LessonProblem[];
      /** How many replies it took (1, or 2 after a fix) */
      attempts: number;
      usage: Usage;
    }
  /** The model replied NOT_INTERACTIVE: nothing in the topic can be made interactive. */
  | { status: "not_interactive"; usage: Usage }
  /** No usable lesson, even after a fix. `problems` lists what's wrong; `message` sums it up. */
  | { status: "invalid"; text: string; message: string; problems: LessonProblem[]; usage: Usage }
  /** The model stopped early (output limit, refusal). */
  | { status: "incomplete"; stopReason: StopReason | "max_turns"; text: string; message: string; usage: Usage };

export interface SimulationPipelineOptions {
  /** Returns the provider to use; called per run so configure() changes apply. */
  getProvider: () => Provider;
}

const SKILL_NAME = "interactive-simulation";
/** The first reply, plus one fix */
const MAX_ATTEMPTS = 2;

interface ParsedLesson {
  exampleId: string | null;
  mode: LessonMode;
  source: string;
}

interface Evaluated {
  parsed: ParsedLesson | null;
  problems: LessonProblem[];
}

export function createSimulationPipeline({ getProvider }: SimulationPipelineOptions) {
  // Read once, so a missing or broken SKILL.md fails when the harness is created.
  const definition = loadSkillFile(builtinSkillPath(SKILL_NAME));
  // The worked example (a whole lesson that shows the quality we expect) is kept in its own file,
  // so it's also a real lesson that can be previewed and checked, and is added to the instructions.
  const example = readFileSync(builtinSkillPath(SKILL_NAME).replace(/SKILL\.md$/, "example-lesson.js"), "utf8").trim();
  const skill = resolveSkill(
    {
      ...definition,
      instructions:
        `${definition.instructions}\n\nWORKED EXAMPLE\n` +
        `Everyday example E1 "A houseplant grows on a sunny windowsill", topic photosynthesis. The <lesson>:\n\n${example}`,
    },
    [],
  );

  return async function simulate(input: SimulationInput, options: SimulationOptions = {}): Promise<SimulationResult> {
    const topic = input.topic?.trim();
    if (!topic) throw new Error("Topic is empty");
    if (!input.report?.summary) throw new Error("A research report is needed to build an interactive lesson");

    const engine = createEngine({
      provider: getProvider(),
      tools: [],
      system: skill.instructions,
      maxTurns: 1, // no tools, so each run is one reply
      ...(skill.maxOutputTokens !== undefined ? { maxTokens: skill.maxOutputTokens } : {}),
    });
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const runOptions = {
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };

    /** The best lesson so far that has no errors (only warnings, or nothing) */
    let best: { parsed: ParsedLesson; warnings: LessonProblem[]; attempt: number } | null = null;
    let last: { text: string; problems: LessonProblem[] } = { text: "", problems: [] };
    let message = buildMessage(topic, input);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await engine.run(message, runOptions);
      addUsage(usage, result.usage);

      if (result.stopReason !== "end_turn") {
        if (best) break; // a cut-off fix: keep the earlier, usable lesson
        const why = incompleteMessage(result.stopReason, skill.maxOutputTokens);
        return { status: "incomplete", stopReason: result.stopReason, text: result.text, message: why, usage };
      }
      if (result.text.trim() === "NOT_INTERACTIVE") {
        if (best) break;
        return { status: "not_interactive", usage };
      }

      const { parsed, problems } = await evaluate(result.text, topic, input, options);
      options.onCheck?.({ attempt, problems });
      last = { text: result.text, problems };
      const hasErrors = problems.some((p) => p.severity === "error");
      if (parsed && !hasErrors && (!best || problems.length < best.warnings.length)) {
        best = { parsed, warnings: problems, attempt };
      }
      if (problems.length === 0) break;
      message = fixRequest(problems);
    }

    if (!best) {
      const errors = last.problems.filter((p) => p.severity === "error");
      const summary = errors.length === 1 ? errors[0]!.message : `The interactive had ${errors.length} problems that couldn't be fixed.`;
      return { status: "invalid", text: last.text, message: summary, problems: last.problems, usage };
    }

    const { parsed, warnings, attempt } = best;
    return {
      status: "ok",
      mode: parsed.mode,
      exampleId: knownExampleId(parsed.exampleId, input.report),
      source: parsed.source,
      html: buildPage(parsed, topic, input.report, options.theme, false),
      warnings,
      attempts: attempt,
      usage,
    };
  };
}

/** Checks one reply: can it be read, the example it's built on, the static checks, and the browser self-test. */
async function evaluate(text: string, topic: string, input: SimulationInput, options: SimulationOptions): Promise<Evaluated> {
  const parsed = parseReply(text);
  if ("error" in parsed) return { parsed: null, problems: [{ severity: "error", message: parsed.error }] };

  const problems = [
    ...exampleProblems(parsed.exampleId, input),
    ...(parsed.mode === "frame" ? checkLessonCode(parsed.source) : checkCustomHtml(parsed.source)),
  ];
  // Only run it in the browser when it's safe-looking and complete; static errors already need a fix.
  if (options.testLesson && !problems.some((p) => p.severity === "error")) {
    try {
      problems.push(...(await options.testLesson(buildPage(parsed, topic, input.report, options.theme, true))));
    } catch {
      // The tester itself failed (not the lesson): go on with the static checks only.
    }
  }
  return { parsed, problems };
}

function buildPage(
  parsed: ParsedLesson,
  title: string,
  report: ResearchReport,
  theme: InteractiveTheme | undefined,
  selfTest: boolean,
): string {
  const exampleKind = exampleKindOf(parsed.exampleId, report);
  return parsed.mode === "frame"
    ? buildInteractiveHtml({ lessonCode: parsed.source, title, ...theme, selfTest, ...(exampleKind ? { exampleKind } : {}) })
    : buildCustomHtml({ html: parsed.source, title, ...theme, selfTest });
}

/** The message sent back when a reply has problems. */
function fixRequest(problems: LessonProblem[]): string {
  const list = problems.map((p) => `- [${p.severity}] ${p.message}`).join("\n");
  return (
    `We checked your lesson by running it. Please fix these problems:\n\n<problems>\n${list}\n</problems>\n\n` +
    "Errors must be fixed; warnings should be. Change only what's needed, keep everything that works, " +
    "and reply again with the complete lesson in the same output format (all tags, the whole code)."
  );
}

function addUsage(total: Usage, add: Usage) {
  total.inputTokens += add.inputTokens;
  total.outputTokens += add.outputTokens;
  if (add.reasoningTokens !== undefined) total.reasoningTokens = (total.reasoningTokens ?? 0) + add.reasoningTokens;
}

/** The user message, in the tags the skill's instructions expect. */
function buildMessage(topic: string, input: SimulationInput): string {
  const parts = [`<topic>\n${topic}\n</topic>`];
  const note = input.description?.trim();
  if (note) parts.push(`<user_description>\n${note}\n</user_description>`);
  parts.push(`<research_report>\n${JSON.stringify(input.report, null, 1)}\n</research_report>`);
  const example = input.exampleId?.trim();
  if (example) parts.push(`<example>\n${example}\n</example>`);
  return parts.join("\n\n");
}

/** Text between the first <tag> and the last </tag>, or null. */
function between(text: string, tag: string): string | null {
  const start = text.indexOf(`<${tag}>`);
  const end = text.lastIndexOf(`</${tag}>`);
  return start === -1 || end < start ? null : text.slice(start + tag.length + 2, end).trim();
}

/** Compiles JavaScript without running it; returns the syntax error, if any. */
function syntaxError(code: string, filename: string): string | null {
  try {
    new Script(code, { filename });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Reads the example id and the lesson (frame code or custom page) from a reply. Never runs code. */
export function parseReply(text: string): ParsedLesson | { error: string } {
  const exampleId = /<example_id>\s*([^<\s]+)\s*<\/example_id>/.exec(text)?.[1] ?? null;

  const custom = between(text, "custom_html");
  if (custom !== null) {
    const page = custom.replace(/^```[a-z]*\s*\n/i, "").replace(/\n```\s*$/, "").trim();
    if (!/<(body|script|svg|div|main|input|button)\b/i.test(page)) return { error: "The custom page is empty or isn't HTML." };
    for (const [, script] of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      const error = syntaxError(script!, "custom.js");
      if (error) return { error: `The custom page's code has a mistake: ${error}` };
    }
    return { exampleId, mode: "custom", source: page };
  }

  const lesson = between(text, "lesson");
  if (lesson === null) return { error: "The interactive came back without its lesson code." };
  // Tolerate ``` fences around the code, though the skill asks for none.
  const source = lesson.replace(/^```[a-z]*\s*\n/i, "").replace(/\n```\s*$/, "").trim();
  if (!source.startsWith("{")) return { error: "The interactive's lesson code isn't an object." };
  // The same wrapping the page uses, so a syntax error is caught here.
  const error = syntaxError(`(\n${source}\n)`, "lesson.js");
  if (error) return { error: `The interactive's code has a mistake: ${error}` };
  return { exampleId, mode: "frame", source };
}

/**
 * Lessons are built around an everyday example (the easiest way in for a student), unless the
 * teacher chose a specific example or the report has none.
 */
export function exampleProblems(exampleId: string | null, input: SimulationInput): LessonProblem[] {
  const { report } = input;
  const chosen = input.exampleId?.trim();
  if (chosen) {
    return exampleId === chosen
      ? []
      : [{ severity: "warning", message: `The teacher chose example ${chosen}. Build the lesson around it, and give ${chosen} in <example_id>.` }];
  }
  const everyday = report.everydayExamples;
  if (everyday.length === 0) return [];
  const first = everyday[0]!;
  const suggestion = `${first.id} ("${first.situation.slice(0, 80)}") is the most familiar`;
  if (!exampleId) {
    return [{ severity: "warning", message: `Give the id of the everyday example the lesson is built on in <example_id>. ${suggestion}.` }];
  }
  if (report.realWorldUses.some((use) => use.id === exampleId) && !everyday.some((e) => e.id === exampleId)) {
    return [{ severity: "warning", message: `The lesson is built on real-world use ${exampleId}. Build it around an everyday example instead: ${suggestion}.` }];
  }
  return [];
}

/** Whether an example id is one of the report's everyday examples or real-world uses (null if neither). */
export function exampleKindOf(exampleId: string | null, report: ResearchReport): ExampleKind | null {
  if (!exampleId) return null;
  if (report.everydayExamples.some((e) => e.id === exampleId)) return "everyday";
  if (report.realWorldUses.some((u) => u.id === exampleId)) return "real-world";
  return null;
}

/** The example id, if it's one of the report's real-world uses or everyday examples. */
function knownExampleId(id: string | null, report: ResearchReport): string | null {
  if (!id) return null;
  const known = [...report.realWorldUses, ...report.everydayExamples].some((item) => item.id === id);
  return known ? id : null;
}

function incompleteMessage(stopReason: StopReason | "max_turns", outputLimit: number | undefined): string {
  switch (stopReason) {
    case "max_tokens":
      return `The model used its whole output limit${outputLimit !== undefined ? ` (${outputLimit} tokens)` : ""} before finishing the interactive.`;
    case "refusal":
      return "The model declined to build this interactive.";
    case "max_turns":
      return "The model didn't finish the interactive.";
    default:
      return `The model stopped unexpectedly (${stopReason}).`;
  }
}
