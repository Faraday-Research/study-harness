#!/usr/bin/env node
/**
 * Terminal app built on the public harness API — the same way an Electron
 * (or any) app integrates: createHarness(config) → harness.send(...) / harness.research(...).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import {
  createHarness,
  listProviders,
  type Harness,
  type HarnessConfig,
  type HarnessEvent,
  type InteractiveTheme,
  type LessonCheck,
  type ResearchReport,
  type SimulationResult,
  type Usage,
} from "./index.js";

const SESSION = "cli";

/**
 * Configuration is resolved here, at the edge of the app.
 * Precedence: command-line flag > environment variable (.env) > default.
 */
const { values: flags } = parseArgs({
  options: {
    model: { type: "string", short: "m" },
    "max-turns": { type: "string" },
    skills: { type: "string" },
    // Brand CSS for interactive lessons (I-Learn: ../dist-theme/*.css, made by `npm run build:theme`)
    theme: { type: "string" },
    fonts: { type: "string" },
  },
});

function loadConfig(): HarnessConfig {
  const values = flags;
  const skills = values.skills ?? process.env.HARNESS_SKILLS;

  return {
    model: values.model ?? process.env.HARNESS_MODEL ?? "anthropic",
    maxTurns: parsePositiveInt(values["max-turns"] ?? process.env.HARNESS_MAX_TURNS, "max turns", 20),
    // API key: left undefined so the provider SDK reads OPENAI_API_KEY / ANTHROPIC_API_KEY.
    // An Electron app would pass the user's stored key here instead.
    ...(skills ? { skills: skills.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
  };
}

/** Env vars and flags are always strings: parse and reject bad values loudly. */
function parsePositiveInt(raw: string | undefined, label: string, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid ${label}: "${raw}" (expected a whole number of 1 or more)`);
  }
  return n;
}

function printEvent(e: HarnessEvent) {
  if (e.type === "tool_start") console.log(dim(`  → ${e.call.name}(${JSON.stringify(e.call.input)})`));
  if (e.type === "tool_end") console.log(dim(`  ← ${e.result.isError ? "error: " : ""}${e.result.content}`));
  if (e.type === "assistant" && e.text) console.log(`\n${e.text}\n`);
  if (e.type === "done") {
    const note = e.stopReason === "end_turn" ? "" : ` · stopped: ${e.stopReason}`;
    console.log(dim(`${formatUsage(e.usage)}${note}`));
  }
}

/** e.g. "[15263 in / 12360 out, of which 9100 reasoning]" */
function formatUsage(usage: Usage): string {
  const reasoning = usage.reasoningTokens !== undefined ? `, of which ${usage.reasoningTokens} reasoning` : "";
  return `[${usage.inputTokens} in / ${usage.outputTokens} out${reasoning}]`;
}

/** Research progress: just the searches and how many results came back. */
function printResearchEvent(e: HarnessEvent) {
  if (e.type === "tool_start") console.log(dim(`  → searching: ${JSON.stringify(e.call.input)}`));
  if (e.type === "tool_end") {
    let summary = e.result.content.slice(0, 160); // an error or "no results" message
    try {
      summary = `${JSON.parse(e.result.content).results.length} results`;
    } catch {}
    console.log(dim(`  ← ${summary}`));
  }
}

/** `/research <topic> | <optional description>` */
async function runResearch(args: string, signal: AbortSignal) {
  const [topic = "", ...rest] = args.split("|");
  const description = rest.join("|").trim() || undefined;
  const res = await harness.research({ topic, description }, { onEvent: printResearchEvent, signal });

  if (res.status === "not_science") console.log("\nNot a science or maths topic.\n");
  else if (res.text.trim()) console.log(`\n${res.text}\n`);
  if (res.status === "invalid") console.log(`\n${res.message}\n`);
  if (res.status === "incomplete") {
    if (!res.text.trim()) console.log("\n(no answer)");
    console.log(`\nStopped early: ${res.message}\n`);
  }
  console.log(dim(`searches: ${res.searches} · URLs returned: ${res.searchedUrls.length}`));
  for (const url of res.searchedUrls) console.log(dim(`  ${url}`));
  console.log(dim(formatUsage(res.usage)));
}

// ---- Interactive lessons: /generate and /simulate ----

/** Brand CSS from --theme / --fonts, read once. Lessons still work without it, unstyled. */
function loadTheme(): InteractiveTheme {
  const read = (file: string | undefined) => {
    if (!file) return undefined;
    try {
      return readFileSync(resolve(file), "utf8");
    } catch {
      console.error(dim(`couldn't read ${file}; lessons will be unstyled`));
      return undefined;
    }
  };
  const themeCss = read(flags.theme);
  const fontsCss = read(flags.fonts);
  return { ...(themeCss ? { themeCss } : {}), ...(fontsCss ? { fontsCss } : {}) };
}

/** The last researched topic, so /simulate can rebuild the lesson without searching again. */
let lastResearch: { topic: string; description?: string; report: ResearchReport } | null = null;

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lesson";

/** Saves a finished lesson to out/<topic>.html, or explains why there isn't one. */
function reportSimulation(sim: SimulationResult, topic: string) {
  if (sim.status === "ok") {
    mkdirSync("out", { recursive: true });
    const file = join("out", `${slug(topic)}.html`);
    writeFileSync(file, sim.html);
    console.log(`\ninteractive: ${resolve(file)}`);
    const fixed = sim.attempts > 1 ? " · fixed after checks" : "";
    console.log(dim(`built on example: ${sim.exampleId ?? "(none named)"} · ${sim.mode === "custom" ? "custom page" : "frame lesson"} · ${Math.round(sim.source.length / 1024)} KB${fixed} · ${formatUsage(sim.usage)}`));
    for (const w of sim.warnings) console.log(dim(`  warning: ${w.message}`));
  } else if (sim.status === "not_interactive") {
    console.log("\nThis topic doesn't suit an interactive.");
  } else {
    console.log(`\nCouldn't build the interactive: ${sim.message}`);
    if (sim.status === "invalid") for (const p of sim.problems) console.log(dim(`  [${p.severity}] ${p.message}`));
    else if (sim.text.trim()) console.log(dim(sim.text.slice(0, 600)));
  }
}

/** Shows each round of checks. (The CLI has no browser, so only the static checks run here.) */
function printCheck({ attempt, problems }: LessonCheck) {
  if (!problems.length) return console.log(dim(`checks passed${attempt > 1 ? " after the fix" : ""}`));
  console.log(dim(`checks found ${problems.length} problem${problems.length === 1 ? "" : "s"}${attempt === 1 ? "; asking for a fix…" : ""}`));
  for (const p of problems) console.log(dim(`  [${p.severity}] ${p.message}`));
}

/** `/generate <topic> | <optional description>`: research, then the interactive, in one run. */
async function runGenerate(args: string, signal: AbortSignal) {
  const [topic = "", ...rest] = args.split("|");
  const description = rest.join("|").trim() || undefined;
  const res = await harness.generate(
    { topic, ...(description ? { description } : {}) },
    {
      signal,
      theme: loadTheme(),
      onCheck: printCheck,
      onEvent: (e) => {
        if (e.type === "stage_start") console.log(dim(e.stage === "research" ? "researching…" : "building the interactive…"));
        else if (e.stage === "research") printResearchEvent(e);
      },
    },
  );

  const r = res.research;
  if (r.status === "not_science") return console.log("\nNot a science or maths topic.\n");
  if (r.status !== "ok") return console.log(`\nResearch didn't finish: ${r.message}\n`);
  lastResearch = { topic: topic.trim(), ...(description ? { description } : {}), report: r.report };
  mkdirSync("out", { recursive: true });
  const reportFile = join("out", `${slug(topic)}.report.json`);
  writeFileSync(reportFile, JSON.stringify(lastResearch, null, 2));
  console.log(dim(`report saved: ${resolve(reportFile)} (rebuild with /simulate; load later with /load <file>)`));
  console.log(dim(`research: ${r.searches} searches · ${r.report.sources.length} sources · ${formatUsage(r.usage)}`));
  console.log(`\n${r.report.summary}`);

  const sim = res.simulation;
  if (sim.status === "skipped") return;
  if (sim.status === "error") return console.log(`\nCouldn't build the interactive: ${sim.message}`);
  reportSimulation(sim, topic);
}

/** `/load <file>`: use a saved report (from /generate) for /simulate, without researching again. */
function runLoad(args: string) {
  const file = args.trim();
  if (!file) return console.log("Usage: /load out/<topic>.report.json");
  try {
    const saved = JSON.parse(readFileSync(resolve(file), "utf8")) as NonNullable<typeof lastResearch>;
    if (!saved?.topic || !saved.report?.summary) throw new Error("not a saved report");
    lastResearch = saved;
    console.log(dim(`loaded "${saved.topic}" (${saved.report.sources.length} sources). Now /simulate [example id].`));
  } catch (err) {
    console.log(`Couldn't load ${file}: ${(err as Error).message}`);
  }
}

/** `/simulate [example id]`: rebuild the interactive from the last research (no searching). */
async function runSimulate(args: string, signal: AbortSignal) {
  if (!lastResearch) return console.log("Run /generate first, so there's research to build on.");
  const exampleId = args.trim() || undefined;
  console.log(dim(`building the interactive for "${lastResearch.topic}"${exampleId ? ` around ${exampleId}` : ""}…`));
  const sim = await harness.simulate({ ...lastResearch, ...(exampleId ? { exampleId } : {}) }, { signal, theme: loadTheme(), onCheck: printCheck });
  reportSimulation(sim, lastResearch.topic);
}

function dim(s: string) {
  return `\x1b[2m${s}\x1b[0m`;
}

let harness: Harness;
try {
  harness = createHarness(loadConfig());
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  process.exit(1);
}

const { provider, model, maxTurns } = harness.info();
console.log(dim(`provider: ${provider} · model: ${model} · max turns: ${maxTurns}`));
console.log(dim(`skills: ${harness.skills().map((s) => s.name).join(", ") || "none"}`));
console.log(dim(`commands: /research <topic> [| description]  /generate <topic> [| description]  /simulate [example id]`));
console.log(dim(`          /load <saved report>  /model <provider[:model]>  /skills  /reset  /exit`));
console.log(dim(`Ctrl+C stops a reply`));
console.log(dim(`providers: ${listProviders().join(", ")}`));

const rl = createInterface({ input: process.stdin, output: process.stdout });
let closed = false;
/** Stops whatever is running (a chat reply or a research run); null when idle. */
let stop: (() => void) | null = null;
rl.on("close", () => (closed = true));
// Ctrl+C while the model is working cancels the reply; otherwise it quits.
rl.on("SIGINT", () => (stop ? stop() : rl.close()));
rl.setPrompt("> ");
rl.prompt();

for await (const raw of rl) {
  const line = raw.trim();
  if (line === "/exit") break;

  if (line.startsWith("/model ")) {
    try {
      harness.configure({ model: line.slice(7).trim() }); // conversation is kept
      const now = harness.info();
      console.log(dim(`switched to ${now.provider}:${now.model}`));
    } catch (err) {
      console.error((err as Error).message);
    }
  } else if (line.startsWith("/load")) {
    runLoad(line.slice("/load".length));
  } else if (line === "/skills") {
    for (const s of harness.skills()) console.log(`  ${s.name} — ${s.description}`);
  } else if (line === "/reset") {
    harness.reset(SESSION);
    console.log(dim("conversation cleared"));
  } else if (/^\/(research|generate|simulate)(\s|$)/.test(line)) {
    const [command] = line.split(/\s/, 1) as [string];
    const run = command === "/research" ? runResearch : command === "/generate" ? runGenerate : runSimulate;
    const controller = new AbortController();
    stop = () => controller.abort(new Error("Cancelled"));
    try {
      await run(line.slice(command.length), controller.signal);
    } catch (err) {
      console.error(`error: ${(err as Error).message}`);
    } finally {
      stop = null;
    }
  } else if (line) {
    stop = () => harness.cancel(SESSION);
    try {
      await harness.send(SESSION, line, { onEvent: printEvent });
    } catch (err) {
      console.error(`error: ${(err as Error).message}`);
    } finally {
      stop = null;
    }
  }
  if (!closed) rl.prompt();
}
rl.close();
