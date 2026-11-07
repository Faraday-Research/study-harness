/**
 * The research pipeline: runs the topic-research skill for one topic.
 *
 * Unlike chat, every run starts fresh: a new engine (no history), a new
 * web_search tool (its own URL list and search limit), and the skill's own
 * instructions as the whole system prompt.
 *
 *   input → fresh web_search → topic-research skill → engine loop → cleaned report
 *
 * The model's JSON reply is cleaned up by parseResearchReport (researchReport.ts) before it's
 * returned, so apps, and the interactive-simulation skill that builds on it, get a checked report.
 *
 * The student-facing parts (summary, everyday examples) are then checked for plain language
 * (plainLanguage.ts). If they use jargon, the model gets one request to reword just those parts,
 * in the same conversation and without searching again; the simpler version is kept.
 */
import { createEngine, type EngineEvent } from "./engine.js";
import { checkPlainLanguage, simplifyRequest } from "./plainLanguage.js";
import { parseResearchReport, type ResearchReport } from "./researchReport.js";
import { builtinSkillPath, loadSkillFile, resolveSkill } from "./skills/loader.js";
import { createSearchBackend } from "./tools/search/index.js";
import { createWebSearchTool } from "./tools/webSearch.js";
import type { Provider, StopReason, Usage } from "./types.js";

export interface ResearchInput {
  /** The topic to research, e.g. "Photosynthesis". */
  topic: string;
  /** Optional note from the user, e.g. "for 12-year-olds, how farmers use it". */
  description?: string;
}

export interface ResearchOptions {
  /** Live progress for this run (searches, results, done). */
  onEvent?: (event: EngineEvent) => void;
  /** Abort the run from outside. */
  signal?: AbortSignal;
}

/** Shared by every result. */
interface ResearchRun {
  /** Every URL web_search returned in this run, for checking cited sources. */
  searchedUrls: string[];
  /** How many searches ran. */
  searches: number;
  usage: Usage;
}

export type ResearchResult =
  /** The model finished. `report` is its JSON reply, cleaned and checked; `text` is the raw reply. */
  | (ResearchRun & { status: "ok"; report: ResearchReport; text: string })
  /** The model finished, but its reply isn't a usable report (no JSON, or no summary). */
  | (ResearchRun & { status: "invalid"; text: string; message: string })
  /** The model replied NOT_SCIENCE: the topic isn't science or maths. */
  | (ResearchRun & { status: "not_science" })
  /** The model stopped early (output limit, refusal, too many turns). */
  | (ResearchRun & {
      status: "incomplete";
      stopReason: StopReason | "max_turns";
      /** Whatever the model wrote before it stopped (may be empty or cut off). */
      text: string;
      /** Why it stopped, in plain words, ready to show the user. */
      message: string;
    });

export interface ResearchPipelineOptions {
  /** Returns the provider to use; called per run so configure() changes apply. */
  getProvider: () => Provider;
  maxTurns: number;
}

const SKILL_NAME = "topic-research";

export function createResearchPipeline({ getProvider, maxTurns }: ResearchPipelineOptions) {
  // Read once, so a missing or broken SKILL.md fails when the harness is created.
  const definition = loadSkillFile(builtinSkillPath(SKILL_NAME));

  return async function research(input: ResearchInput, options: ResearchOptions = {}): Promise<ResearchResult> {
    const topic = input.topic?.trim();
    if (!topic) throw new Error("Topic is empty");

    // Fresh per run: the URL list and search count must not carry over.
    const webSearch = createWebSearchTool({ backend: createSearchBackend() });
    const skill = resolveSkill(definition, [webSearch.tool]);

    const engine = createEngine({
      provider: getProvider(),
      tools: skill.tools,
      system: skill.instructions,
      maxTurns,
      ...(skill.maxOutputTokens !== undefined ? { maxTokens: skill.maxOutputTokens } : {}),
    });

    const result = await engine.run(buildMessage(topic, input.description), options);
    const run: ResearchRun = {
      searchedUrls: [...webSearch.returnedUrls()],
      searches: webSearch.callCount(),
      usage: { ...result.usage },
    };

    if (result.stopReason !== "end_turn") {
      const message = incompleteMessage(result.stopReason, result.usage, skill.maxOutputTokens, maxTurns);
      return { ...run, status: "incomplete", stopReason: result.stopReason, text: result.text, message };
    }
    if (result.text.trim() === "NOT_SCIENCE") return { ...run, status: "not_science" };
    const parsed = parseResearchReport(result.text);
    if (!parsed) {
      return { ...run, status: "invalid", text: result.text, message: "The research came back in a form that couldn't be read. Try again." };
    }

    let report = parsed;
    const problems = checkPlainLanguage(report, topic);
    if (problems.length > 0) {
      const fix = await engine.run(simplifyRequest(problems), options);
      addUsage(run.usage, fix.usage);
      run.searches = webSearch.callCount();
      if (fix.stopReason === "end_turn") {
        const reworded = applyRewording(report, fix.text);
        if (reworded && checkPlainLanguage(reworded, topic).length < problems.length) report = reworded;
      }
    }
    return { ...run, status: "ok", report, text: result.text };
  };
}

/** The report with the model's reworded summary and everyday examples, or null if the reply isn't usable. */
function applyRewording(report: ResearchReport, reply: string): ResearchReport | null {
  const reworded = parseResearchReport(reply); // reads "summary" and "everyday_examples" like a full report
  if (!reworded) return null;
  // Keep only examples the report already had (same id), with their known sources.
  const known = new Map(report.everydayExamples.map((e) => [e.id, e]));
  const examples = reworded.everydayExamples
    .filter((e) => known.has(e.id))
    .map((e) => ({ ...e, sources: known.get(e.id)!.sources }));
  return {
    ...report,
    summary: reworded.summary,
    everydayExamples: examples.length === report.everydayExamples.length ? examples : report.everydayExamples,
  };
}

function addUsage(total: Usage, add: Usage) {
  total.inputTokens += add.inputTokens;
  total.outputTokens += add.outputTokens;
  if (add.reasoningTokens !== undefined) total.reasoningTokens = (total.reasoningTokens ?? 0) + add.reasoningTokens;
}

/** Why a run stopped early, in plain words. */
function incompleteMessage(
  stopReason: StopReason | "max_turns",
  usage: Usage,
  outputLimit: number | undefined,
  maxTurns: number,
): string {
  switch (stopReason) {
    case "max_tokens": {
      const limit = outputLimit !== undefined ? ` (${outputLimit} tokens)` : "";
      const reasoning =
        usage.reasoningTokens !== undefined
          ? ` This run used ${usage.reasoningTokens} of its ${usage.outputTokens} output tokens on hidden reasoning.`
          : "";
      return `The model used its whole output limit${limit} before finishing its answer.${reasoning}`;
    }
    case "refusal":
      return "The model declined to research this topic.";
    case "max_turns":
      return `The model didn't finish within ${maxTurns} steps.`;
    default:
      return `The model stopped unexpectedly (${stopReason}).`;
  }
}

/** The user message, in the tags the skill's instructions expect. */
function buildMessage(topic: string, description: string | undefined): string {
  const parts = [`<topic>\n${topic}\n</topic>`];
  const note = description?.trim();
  if (note) parts.push(`<user_description>\n${note}\n</user_description>`);
  return parts.join("\n\n");
}
