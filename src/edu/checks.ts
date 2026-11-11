/**
 * Checks for every edu-v2 step's output: the "checks between steps" of the pipeline, in code.
 *
 * Each check returns problems. An "error" means the output can't be built on: the step is asked
 * to fix it once, and if it still has errors the pipeline stops there. A "warning" is sent back
 * in the same fix request but never stops the run.
 */
import { Script } from "node:vm";
import { z } from "zod";

export type EduProblemSeverity = "error" | "warning";
export interface EduProblem {
  severity: EduProblemSeverity;
  message: string;
}

const err = (message: string): EduProblem => ({ severity: "error", message });
const warn = (message: string): EduProblem => ({ severity: "warning", message });

export const STAGE_IDS = ["hook", "predict", "play", "notice", "name", "break", "transfer", "check"] as const;
const STAGE_NAMES = ["Hook", "Predict", "Play", "Notice", "Name", "Break", "Transfer", "Check"];
const TIERS = ["foundation", "builder", "explorer"] as const;

/** The character-scene name pool. Any of these in the story arc means it named someone. */
export const NAME_POOL = [
  "Anita", "Asha", "Divya", "Farah", "Geeta", "Kavya", "Leela", "Meera", "Neha", "Nisha", "Pooja", "Priya", "Rekha", "Sana", "Usha", "Mary",
  "Anil", "Arjun", "Ajay", "Farhan", "Gopal", "Harish", "Joseph", "Manoj", "Mohan", "Naveen", "Ravi", "Ramesh", "Salim", "Sunil", "Suresh", "Tarun",
  "Alice", "Clara", "Emma", "Grace", "Hana", "Lena", "Lucy", "Maria", "Mei", "Nina", "Sara",
  "Ben", "Bob", "Carl", "David", "Hugo", "Ivan", "Ken", "Leo", "Mark", "Omar", "Paul", "Tom",
  "Kiran", "Sam",
];

const PLATFORM_EVENTS = new Set([
  "predict", "predict-compare", "play", "notice", "break-control", "break-flag", "break-assumption", "break-boundary",
  "break-calc", "transfer", "check", "hint", "door-guess", "door", "doors-status", "deeper", "level", "concept-status", "reflection",
]);

// ---------------------------------------------------------------------
// Reading replies
// ---------------------------------------------------------------------

/** Text between the first <tag> and the last </tag>, or null. */
export function between(text: string, tag: string): string | null {
  const start = text.indexOf(`<${tag}>`);
  const end = text.lastIndexOf(`</${tag}>`);
  return start === -1 || end < start ? null : text.slice(start + tag.length + 2, end).trim();
}

export function stripFences(text: string): string {
  return text.replace(/^```[a-z]*\s*\n/i, "").replace(/\n```\s*$/, "").trim();
}

/** Parses the JSON inside <tag>…</tag>. */
export function readJson(text: string, tag: string): { value: unknown } | { error: string } {
  const inner = between(text, tag);
  if (inner === null) return { error: `The reply has no <${tag}> block. Reply with the JSON inside <${tag}>…</${tag}>.` };
  const body = stripFences(inner);
  try {
    return { value: JSON.parse(body) };
  } catch (e) {
    return { error: `The <${tag}> block is not valid JSON (${e instanceof Error ? e.message : String(e)}).` };
  }
}

function schemaProblems(schema: z.ZodType, value: unknown, what: string): EduProblem[] {
  const parsed = schema.safeParse(value);
  return parsed.success ? [] : [err(`The ${what} is missing parts or has the wrong shape:\n${z.prettifyError(parsed.error)}`)];
}

// ---------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const nonEmpty = z.string().trim().min(1);
const strList = z.array(z.string());

/** Every string inside a JSON value, with its path (e.g. "stages.hook.lines.0"). */
function strings(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, path ? `${path}.${i}` : String(i)));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** Braces, key names or stage labels in student-facing text. */
function markupProblems(value: unknown, what: string): EduProblem[] {
  const out: EduProblem[] = [];
  for (const { path, text } of strings(value)) {
    if (/[{}]/.test(text)) out.push(err(`${what} ${path} shows braces: "${text.slice(0, 80)}". Lines are plain text.`));
    else if (/\b(who|say|says|speaker|words|lines)\s*:/i.test(text)) {
      out.push(err(`${what} ${path} shows a key name: "${text.slice(0, 80)}". Speech is a speaker plus their words, as separate fields.`));
    }
  }
  return out;
}

function lineLengthProblems(lines: { path: string; text: string }[], what: string): EduProblem[] {
  const long = lines.filter((l) => wordCount(l.text) >= 12);
  if (long.length === 0) return [];
  const list = long.slice(0, 6).map((l) => `${l.path} (${wordCount(l.text)} words)`).join(", ");
  return [warn(`${what}: lines must stay under 12 words. Shorten ${list}${long.length > 6 ? ` and ${long.length - 6} more` : ""}.`)];
}

function normaliseUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

// ---------------------------------------------------------------------
// Step 1: concept brief
// ---------------------------------------------------------------------

const MISCONCEPTION_STATUS = ["verified", "single-source", "unverified", "from-memory"] as const;

export const conceptBriefSchema = z.object({
  concept: nonEmpty,
  track: z.enum(["hs", "ug"]),
  domain: z.string().optional(),
  position: z.object({ course: z.string(), chapter: z.string(), n: z.number() }).partial().optional(),
  relationship: nonEmpty,
  variables: z.array(z.object({ name: nonEmpty, unit: z.string(), min: z.number(), max: z.number() })).min(1),
  model: z.object({ assumptions: strList, breaks_at: nonEmpty }),
  misconceptions: z.array(
    z.object({ id: nonEmpty, wrong_idea: nonEmpty, source: z.string(), status: z.enum(MISCONCEPTION_STATUS) }),
  ),
  applications: z.array(z.object({ domain: nonEmpty, line: nonEmpty, source: z.string() })),
  prerequisites: strList,
  reserved_for_later: strList,
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  open_gaps: strList,
});
export type ConceptBrief = z.infer<typeof conceptBriefSchema>;

/** `searchedUrls`: every URL web_search returned this run (null when the brief was resumed). */
export function checkBrief(value: unknown, searchedUrls: Set<string> | null): EduProblem[] {
  const shape = schemaProblems(conceptBriefSchema, value, "concept brief");
  if (shape.length) return shape;
  const brief = value as ConceptBrief;
  const out: EduProblem[] = [];
  const searched = searchedUrls ? new Set([...searchedUrls].map(normaliseUrl)) : null;
  const gaps = brief.open_gaps.join(" ");

  if (brief.misconceptions.length < 3) out.push(err(`Only ${brief.misconceptions.length} misconceptions; at least 3 are needed.`));
  for (const m of brief.misconceptions) {
    const hasSource = m.source.trim() !== "";
    if ((m.status === "verified" || m.status === "single-source") && !hasSource) {
      out.push(err(`Misconception ${m.id} is marked ${m.status} but has no source. Give its URL or mark it unverified.`));
    }
    if (hasSource && searched && !searched.has(normaliseUrl(m.source))) {
      out.push(err(`Misconception ${m.id} cites ${m.source}, which no search returned. Cite a URL from your search results, or mark it from-memory with no source.`));
    }
    if ((m.status === "unverified" || m.status === "from-memory") && !gaps.includes(m.id)) {
      out.push(warn(`Misconception ${m.id} is ${m.status}; list it in open_gaps by its id.`));
    }
  }

  if (brief.applications.length < 3) out.push(err(`Only ${brief.applications.length} applications; at least 3 are needed.`));
  const domains = new Set(brief.applications.map((a) => a.domain.trim().toLowerCase()));
  if (brief.applications.length >= 3 && domains.size < 3) out.push(err("The applications must come from three different domains."));
  brief.applications.forEach((a, i) => {
    if (!a.source.trim()) out.push(err(`Application ${i + 1} (${a.domain}) has no source.`));
    else if (searched && !searched.has(normaliseUrl(a.source))) {
      out.push(err(`Application ${i + 1} (${a.domain}) cites ${a.source}, which no search returned.`));
    }
  });

  const breaksAt = brief.model.breaks_at.trim();
  if (/^(in )?(real life|the real world|reality)\.?$/i.test(breaksAt) || wordCount(breaksAt) < 3) {
    out.push(err(`model.breaks_at ("${breaksAt}") must name a value or a condition, not just "in real life".`));
  }
  if ((brief.relationship.match(/[.!?](\s|$)/g) ?? []).length > 1) {
    out.push(warn("The relationship should be one plain sentence."));
  }
  for (const v of brief.variables) {
    if (v.min > v.max) out.push(err(`Variable ${v.name} has min ${v.min} above max ${v.max}.`));
  }
  return out;
}

// ---------------------------------------------------------------------
// Step 2: concept plan
// ---------------------------------------------------------------------

const choiceItem = z.object({
  id: nonEmpty,
  probe_for: nonEmpty,
  question: nonEmpty,
  options: strList.optional(),
  answer: z.union([z.string(), z.number()]).optional(),
  numeric: z
    .object({ answer: z.number(), unit: z.string(), tolerance: z.number(), distractors: z.array(z.number()) })
    .optional(),
  wrong_answers: z.array(z.object({ answer: z.union([z.string(), z.number()]), misconception: nonEmpty })).optional(),
});
const doorCheck = z.object({ door: nonEmpty, question: nonEmpty, answer: z.union([z.string(), z.number()]), explanation: z.string() });
const hex = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "a hex colour like #3a6ea5");

export const conceptPlanSchema = z.object({
  position: z.object({ course: z.string(), chapter: z.string(), n: z.number() }).partial().optional(),
  earlier: strList.optional(),
  reserved_for_later: strList.optional(),
  relationship: nonEmpty,
  variables: z.array(z.object({ id: nonEmpty, name: nonEmpty, unit: z.string(), min: z.number(), max: z.number() })).min(1),
  colour_map: z.array(z.object({ id: nonEmpty, light: hex, dark: hex })),
  model: z.object({ simple_model: nonEmpty, assumptions: strList, fails_in_break: nonEmpty, boundary: nonEmpty }),
  equation: z.string(),
  misconceptions: z.array(
    z.object({
      id: nonEmpty,
      brief_id: z.string().optional(),
      wrong_idea: nonEmpty,
      probe: nonEmpty,
      wrong_answer: nonEmpty,
      source_status: z.enum(MISCONCEPTION_STATUS),
    }),
  ),
  doors: z.array(
    z.object({
      id: nonEmpty,
      domain: nonEmpty,
      changes: nonEmpty,
      responds: nonEmpty,
      result: nonEmpty,
      picture: z.object({
        before: z.object({ count: z.number(), description: nonEmpty }),
        after: z.object({ count: z.number(), description: nonEmpty }),
      }),
    }),
  ),
  spine: z.array(z.object({ stage: z.number(), name: nonEmpty, job: z.string(), output: z.string(), minutes: z.number() })),
  notice: strList,
  break_questions: strList,
  transfer: z.object({ foundation: z.string(), builder: z.string(), explorer: z.string() }),
  check: z.object({ foundation: z.array(choiceItem), builder: z.array(choiceItem), explorer: z.array(choiceItem) }),
  doors_check: z.object({ foundation: z.array(doorCheck), builder: z.array(doorCheck), explorer: z.array(doorCheck) }),
  link_statement: nonEmpty,
  exercises: z.array(
    z.object({ id: nonEmpty, tier: z.enum(TIERS), problem: nonEmpty, answer: z.union([z.string(), z.number()]), hints: strList, probe: z.string().optional() }),
  ),
  events: strList,
});
export type ConceptPlan = z.infer<typeof conceptPlanSchema>;

export function checkPlan(value: unknown, brief: ConceptBrief | undefined): EduProblem[] {
  const shape = schemaProblems(conceptPlanSchema, value, "concept plan");
  if (shape.length) return shape;
  const plan = value as ConceptPlan;
  const out: EduProblem[] = [];

  // Misconceptions
  const ids = plan.misconceptions.map((m) => m.id);
  if (ids.length < 3 || ids.length > 4) out.push(err(`The plan has ${ids.length} misconceptions; it needs three or four.`));
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) out.push(err(`Misconception id ${dup} is used twice; ids are unique in the chapter.`));
  const known = new Set(ids);
  for (const m of plan.misconceptions) {
    const from = brief?.misconceptions.find((b) => b.id === m.brief_id);
    if (brief && !from) out.push(warn(`Misconception ${m.id} names brief_id "${m.brief_id ?? ""}", which isn't in the brief. Use only the brief's misconceptions.`));
    if (from && (from.status === "unverified" || from.status === "from-memory") && m.source_status !== from.status) {
      out.push(err(`Misconception ${m.id} comes from brief ${from.id}, which is ${from.status}; it stays flagged (source_status "${from.status}").`));
    }
  }

  // Doors
  if (plan.doors.length < 2 || plan.doors.length > 3) out.push(err(`The plan has ${plan.doors.length} doors; it needs two or three.`));
  const doorDomains = new Set(plan.doors.map((d) => d.domain.trim().toLowerCase()));
  if (doorDomains.size < plan.doors.length) out.push(err("Each door must come from a different domain."));
  for (const d of plan.doors) {
    if (d.picture.before.count === d.picture.after.count) {
      out.push(err(`Door ${d.id}: the before and after counts in the picture are both ${d.picture.before.count}; they must differ.`));
    }
  }
  const doorIds = new Set(plan.doors.map((d) => d.id));

  // Spine
  const names = plan.spine.map((s) => s.name.trim().toLowerCase());
  if (names.join(",") !== STAGE_NAMES.map((n) => n.toLowerCase()).join(",")) {
    out.push(err(`The spine must be the eight stages in order: ${STAGE_NAMES.join(", ")}.`));
  }
  const minutes = plan.spine.reduce((t, s) => t + s.minutes, 0);
  if (minutes < 8 || minutes > 12) out.push(warn(`The spine adds up to ${minutes} minutes; an artifact is 8 to 12.`));

  // Check
  const items = TIERS.flatMap((tier) => plan.check[tier].map((item) => ({ tier, item })));
  for (const tier of TIERS) if (plan.check[tier].length === 0) out.push(err(`The Check has no ${tier} items.`));
  for (const id of ids) {
    if (!items.some(({ item }) => item.probe_for === id)) out.push(err(`Misconception ${id} has no Check probe (probe_for "${id}").`));
  }
  for (const { tier, item } of items) {
    if (!known.has(item.probe_for)) out.push(err(`Check item ${item.id} probes "${item.probe_for}", which isn't a misconception id.`));
    for (const w of item.wrong_answers ?? []) {
      if (!known.has(w.misconception)) out.push(err(`Check item ${item.id} maps a wrong answer to "${w.misconception}", which isn't a misconception id.`));
    }
    if (item.numeric) {
      const { answer, tolerance, distractors } = item.numeric;
      if (!(tolerance > 0)) out.push(err(`Check item ${item.id}: the tolerance must be above 0.`));
      for (const d of distractors) {
        if (Math.abs(d - answer) <= 2 * tolerance) {
          out.push(err(`Check item ${item.id}: distractor ${d} is within twice the tolerance (${tolerance}) of the answer ${answer}. Recompute it with calculate.`));
        }
      }
    } else if (!item.options?.length || item.answer === undefined) {
      out.push(err(`Check item ${item.id} (${tier}) needs options and an answer, or a numeric answer.`));
    } else if (!item.options.map(String).includes(String(item.answer))) {
      out.push(err(`Check item ${item.id}: its answer "${item.answer}" isn't one of its options.`));
    }
  }
  for (const tier of TIERS) {
    for (const q of plan.doors_check[tier]) {
      if (!doorIds.has(q.door)) out.push(err(`A ${tier} Doors question names door "${q.door}", which isn't in doors.`));
    }
    const missing = plan.doors.filter((d) => !plan.doors_check[tier].some((q) => q.door === d.id));
    if (missing.length) out.push(warn(`Back to the Doors needs one ${tier} question per door; missing ${missing.map((d) => d.id).join(", ")}.`));
  }

  // Colours
  const colours = new Set(plan.colour_map.map((c) => c.id));
  for (const v of plan.variables) if (!colours.has(v.id)) out.push(err(`Variable ${v.id} has no colour in colour_map.`));
  if (!plan.equation.trim()) out.push(warn("Give the Explorer-only equation in equation."));
  return out;
}

// ---------------------------------------------------------------------
// Step 3: story arc
// ---------------------------------------------------------------------

const ARC_LABELS = [
  "Premise", "Want", "Surprise", "1 Hook", "2 Predict", "3 Play", "4 Notice", "5 Name", "6 Break", "7 Transfer", "8 Check",
  "Payoff", "Builder chapter", "Explorer chapter", "Roles needed", "Place needs",
];

/** The value after each "Label:" line of the arc. */
export function arcFields(arc: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of arc.split(/\r?\n/)) {
    const m = /^\s*[-*]?\s*([A-Za-z0-9 ]+?)\s*:\s*(.*)$/.exec(line);
    if (m) fields.set(m[1]!.trim().toLowerCase(), m[2]!.trim());
  }
  return fields;
}

export function checkArc(arc: string): EduProblem[] {
  const out: EduProblem[] = [];
  const fields = arcFields(arc);
  for (const label of ARC_LABELS) {
    const value = fields.get(label.toLowerCase());
    if (value === undefined) out.push(err(`The arc is missing the "${label}:" line.`));
    else if (!value) out.push(err(`The arc's "${label}:" line is empty.`));
  }
  for (const label of ["Builder chapter", "Explorer chapter"]) {
    const value = fields.get(label.toLowerCase()) ?? "";
    if (value && !(/problem/i.test(value) && /turn/i.test(value))) out.push(err(`"${label}:" must give a problem and a turn.`));
  }
  const named = NAME_POOL.filter((name) => new RegExp(`\\b${name}\\b`).test(arc));
  if (named.length) out.push(err(`The arc names people (${named.join(", ")}). Use roles only: the main character, the guide.`));
  for (const label of ARC_LABELS.slice(3, 11)) {
    const value = fields.get(label.toLowerCase()) ?? "";
    if (wordCount(value) > 60) out.push(warn(`Beat "${label}" is long; keep each beat to one or two lines.`));
  }
  return out;
}

// ---------------------------------------------------------------------
// Step 4: cast and scene
// ---------------------------------------------------------------------

export const castSceneSchema = z.object({
  main: z.object({ name: nonEmpty, gender: z.string().optional(), age: z.number(), hobby: nonEmpty, job: nonEmpty }),
  guide: z.object({ name: nonEmpty, gender: z.string().optional(), manner: nonEmpty }),
  others: z.array(z.object({ role: nonEmpty, name: nonEmpty })).optional(),
  place: z.object({ name: nonEmpty, things: strList }),
  intro_lines: strList.min(1),
  scene_svg_brief: z.object({
    viewBox: z.string(),
    objects: z.array(z.object({ name: nonEmpty, pos: z.string(), label: nonEmpty, label_pos: z.string().optional(), colour_token: z.string() })).min(1),
    aria_label: nonEmpty,
  }),
});
export type CastScene = z.infer<typeof castSceneSchema>;

export function castNames(cast: CastScene): string[] {
  return [cast.main.name, cast.guide.name, ...(cast.others ?? []).map((o) => o.name)];
}

export function checkCast(value: unknown, arc: string | undefined, usedNames: string[] = []): EduProblem[] {
  const shape = schemaProblems(castSceneSchema, value, "cast and scene");
  if (shape.length) return shape;
  const cast = value as CastScene;
  const out: EduProblem[] = [];
  const used = new Set(usedNames.map((n) => n.toLowerCase()));

  for (const name of castNames(cast)) {
    if (!/^[A-Z][a-z]{2,5}$/.test(name)) out.push(err(`"${name}" must be a plain given name of 3 to 6 letters, no surname.`));
    else if (!NAME_POOL.includes(name)) out.push(warn(`"${name}" is not in the name pool; check it passes every naming rule.`));
    if (used.has(name.toLowerCase())) out.push(err(`"${name}" is already used in this course.`));
  }
  if (cast.main.name[0]?.toUpperCase() === cast.guide.name[0]?.toUpperCase()) {
    out.push(err(`The main character (${cast.main.name}) and the guide (${cast.guide.name}) must start with different letters.`));
  }
  const all = castNames(cast).map((n) => n.toLowerCase());
  if (new Set(all).size !== all.length) out.push(err("Two people in the cast share a name."));

  if (arc) {
    const roles = (arcFields(arc).get("roles needed") ?? "").toLowerCase();
    if (/\bother\b/.test(roles) && !(cast.others ?? []).length) out.push(err("The arc needs an 'other' role; give them a name in others."));
    const arcText = arc.toLowerCase();
    for (const thing of cast.place.things) {
      const words = thing.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
      if (words.length && !words.some((w) => arcText.includes(w.replace(/s$/, "")))) {
        out.push(warn(`Place thing "${thing}" doesn't appear in any beat of the arc. Every thing must be used in a beat.`));
      }
    }
  }
  if (cast.place.things.length < 3 || cast.place.things.length > 4) out.push(err(`The place has ${cast.place.things.length} things; it needs three or four.`));
  out.push(...markupProblems(cast.intro_lines, "Intro line"));
  out.push(...lineLengthProblems(cast.intro_lines.map((text, i) => ({ path: `intro_lines.${i}`, text })), "Intro lines"));
  if (cast.scene_svg_brief.viewBox.replace(/\s+/g, " ").trim() !== "0 0 640 260") out.push(warn("The scene viewBox is 0 0 640 260."));
  return out;
}

// ---------------------------------------------------------------------
// Step 5: scene SVG
// ---------------------------------------------------------------------

/** Reads the SVG from a reply: the <scene_svg> block, or a bare <svg> if the tags were left out. */
export function readSvg(text: string): string | null {
  const inner = between(text, "scene_svg") ?? text;
  const body = stripFences(inner);
  const start = body.search(/<svg\b/i);
  const end = body.toLowerCase().lastIndexOf("</svg>");
  return start === -1 || end < start ? null : body.slice(start, end + 6);
}

export function checkSvg(svg: string): EduProblem[] {
  const out: EduProblem[] = [];
  if ((svg.match(/<svg\b/gi) ?? []).length !== 1) out.push(err("The scene must be one single SVG (no nested <svg>)."));
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  if (!/\brole\s*=\s*["']img["']/i.test(open)) out.push(err('The <svg> needs role="img".'));
  if (!/\baria-label\s*=\s*["'][^"']{8,}["']/i.test(open)) out.push(err("The <svg> needs an aria-label that says what is in it."));
  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(open)?.[1]?.replace(/\s+/g, " ").trim();
  if (!viewBox) out.push(err('The <svg> needs viewBox="0 0 640 260".'));
  else if (viewBox !== "0 0 640 260") out.push(warn(`The scene viewBox is "${viewBox}"; use "0 0 640 260".`));
  const forbidden: [RegExp, string][] = [
    [/<script\b/i, "a <script>"],
    [/<image\b/i, "an <image> (external picture)"],
    [/<foreignObject\b/i, "a <foreignObject>"],
    [/\bhref\s*=\s*["'](https?:|\/\/)/i, "an external href"],
    [/url\(\s*["']?(https?:|\/\/)/i, "an external url()"],
    [/@import/i, "an @import"],
    [/\son[a-z]+\s*=/i, "an event handler attribute"],
  ];
  for (const [re, what] of forbidden) if (re.test(svg)) out.push(err(`The scene contains ${what}; it must be self-contained.`));
  if (/(fill|stroke)\s*[:=]\s*["']?#[0-9a-f]{3,8}\b/i.test(svg)) out.push(warn("Use colour tokens (var(--ink), var(--q-…)) instead of hex colours in the scene."));
  return out;
}

// ---------------------------------------------------------------------
// Step 6: demo spec
// ---------------------------------------------------------------------

export const demoSpecSchema = z.object({
  concept: z.string(),
  model: z.string().optional(),
  controls: z
    .array(
      z.object({
        id: nonEmpty,
        label: nonEmpty,
        unit: z.string(),
        range: z.tuple([z.number(), z.number()]),
        step: z.number(),
        layer: z.enum(TIERS),
        quantity: z.string().optional(),
      }),
    )
    .min(1),
  readouts: z.array(z.object({ id: nonEmpty, label: z.string().optional(), unit: z.string(), colour: z.string(), layer: z.string().optional() })),
  graph: z.object({ x: nonEmpty, y: nonEmpty, units: z.string() }),
  predict: z.object({ prompt: nonEmpty, options: strList.min(2), tiers: z.record(z.string(), z.string()).optional() }),
  runs_to_try: z.array(z.object({ label: nonEmpty, set: z.record(z.string(), z.unknown()), expect: nonEmpty })),
  notice_prompts: z.array(z.object({ control: nonEmpty, prompt: nonEmpty })),
  break: z.object({ control: nonEmpty, boundary_value: z.number(), boundary: nonEmpty, assumption: nonEmpty }),
  states: z.array(z.object({ id: nonEmpty, controls_enabled: strList, highlight: z.string(), graph: z.string().optional() })),
  transfer_state: z.string().optional(),
  check_state: z.string().optional(),
  layers: z.object({ foundation: z.string(), builder: z.string(), explorer: z.string() }),
  events: strList,
});
export type DemoSpec = z.infer<typeof demoSpecSchema>;

export function checkDemo(value: unknown, plan: ConceptPlan | undefined): EduProblem[] {
  const shape = schemaProblems(demoSpecSchema, value, "demo spec");
  if (shape.length) return shape;
  const demo = value as DemoSpec;
  const out: EduProblem[] = [];
  const controls = new Map(demo.controls.map((c) => [c.id, c]));

  if (controls.size !== demo.controls.length) out.push(err("Two controls share an id."));
  const foundation = demo.controls.filter((c) => c.layer === "foundation");
  if (foundation.length === 0) out.push(err("Foundation needs one main control."));
  if (foundation.length > 3) out.push(err(`Foundation has ${foundation.length} controls; at most three.`));
  for (const c of demo.controls) {
    if (!(c.range[0] < c.range[1])) out.push(err(`Control ${c.id}: its range must go from low to high.`));
    if (!(c.step > 0)) out.push(err(`Control ${c.id}: its step must be above 0.`));
    if (!demo.notice_prompts.some((n) => n.control === c.id)) {
      out.push(err(`Control ${c.id} has no Notice prompt. Tie it to a question or remove it.`));
    }
  }
  for (const n of demo.notice_prompts) if (!controls.has(n.control)) out.push(warn(`A Notice prompt names control "${n.control}", which doesn't exist.`));

  const stateIds = demo.states.map((s) => s.id);
  for (const id of STAGE_IDS) {
    const count = stateIds.filter((s) => s === id).length;
    if (count !== 1) out.push(err(`State "${id}" must be listed exactly once (found ${count}).`));
  }
  for (const id of stateIds) if (!(STAGE_IDS as readonly string[]).includes(id)) out.push(err(`State "${id}" isn't a stage id (${STAGE_IDS.join(", ")}).`));
  for (const s of demo.states) {
    for (const c of s.controls_enabled) if (!controls.has(c)) out.push(err(`State ${s.id} enables "${c}", which isn't a control.`));
  }

  const breakControl = controls.get(demo.break.control);
  if (!breakControl) out.push(err(`Break uses control "${demo.break.control}", which isn't a control.`));
  else {
    const [lo, hi] = breakControl.range;
    if (demo.break.boundary_value < lo || demo.break.boundary_value > hi) {
      out.push(err(`The Break boundary (${demo.break.boundary_value}) is outside control ${breakControl.id}'s range ${lo} to ${hi}; the student can't reach it.`));
    }
  }
  if (/[=×÷]|\bequation\b|\bformula\b/i.test(demo.layers.foundation)) out.push(warn("Nothing in Foundation may need a formula."));
  const unknownEvents = demo.events.filter((e) => !PLATFORM_EVENTS.has(e));
  if (unknownEvents.length) out.push(warn(`Use the platform event names; unknown: ${unknownEvents.join(", ")}.`));
  if (plan) {
    const colours = new Set(plan.colour_map.map((c) => c.id));
    for (const c of demo.controls) {
      if (c.quantity && !colours.has(c.quantity)) out.push(warn(`Control ${c.id} uses quantity "${c.quantity}", which has no colour in the colour map.`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Step 7: Foundation copy, and step 8: chapter stories
// ---------------------------------------------------------------------

const speech = z.object({ speaker: nonEmpty, words: nonEmpty });
const block = z.object({ lines: strList, says: z.array(speech).optional() });

export const copySchema = z.object({
  title: nonEmpty,
  epigraph: z.object({ words: nonEmpty, speaker: nonEmpty }),
  meet: block,
  doors: z.object({ lines: strList, cards: z.array(z.object({ door: nonEmpty, line: nonEmpty })), question: nonEmpty }),
  stages: z.object(Object.fromEntries(STAGE_IDS.map((id) => [id, block])) as Record<(typeof STAGE_IDS)[number], typeof block>),
  back_to_doors: z.object({ lines: strList }),
  summary: nonEmpty,
  toBuilder: nonEmpty,
});
export type EduCopy = z.infer<typeof copySchema>;

function speakerProblems(says: { path: string; speaker: string }[], names: string[], what: string): EduProblem[] {
  const allowed = new Set(names.map((n) => n.toLowerCase()));
  return says
    .filter((s) => !allowed.has(s.speaker.trim().toLowerCase()))
    .map((s) => err(`${what} ${s.path}: speaker "${s.speaker}" isn't in the cast (${names.join(", ")}).`));
}

export function checkCopy(value: unknown, cast: CastScene | undefined, plan: ConceptPlan | undefined): EduProblem[] {
  const shape = schemaProblems(copySchema, value, "Foundation copy");
  if (shape.length) return shape;
  const copy = value as EduCopy;
  const out: EduProblem[] = [];

  const titleWords = wordCount(copy.title);
  if (titleWords < 2 || titleWords > 4) out.push(err(`The title "${copy.title}" must be two to four words.`));
  out.push(...markupProblems(copy, "Copy"));

  const narration = [
    ...copy.meet.lines.map((text, i) => ({ path: `meet.lines.${i}`, text })),
    ...copy.doors.lines.map((text, i) => ({ path: `doors.lines.${i}`, text })),
    ...STAGE_IDS.flatMap((id) => copy.stages[id].lines.map((text, i) => ({ path: `stages.${id}.lines.${i}`, text }))),
    ...copy.back_to_doors.lines.map((text, i) => ({ path: `back_to_doors.lines.${i}`, text })),
  ];
  out.push(...lineLengthProblems(narration, "Foundation narration"));
  for (const id of STAGE_IDS) if (copy.stages[id].lines.length === 0) out.push(err(`Stage ${id} has no narration lines.`));

  if (cast) {
    const says = [
      { path: "epigraph", speaker: copy.epigraph.speaker },
      ...(copy.meet.says ?? []).map((s, i) => ({ path: `meet.says.${i}`, speaker: s.speaker })),
      ...STAGE_IDS.flatMap((id) => (copy.stages[id].says ?? []).map((s, i) => ({ path: `stages.${id}.says.${i}`, speaker: s.speaker }))),
    ];
    out.push(...speakerProblems(says, castNames(cast), "Copy"));
    const guideBreaks = (copy.stages.break.says ?? []).some((s) => s.speaker.toLowerCase() === cast.guide.name.toLowerCase());
    if (!guideBreaks) out.push(warn(`In Break, the guide (${cast.guide.name}) says "Now try to break it."`));
  }
  if (plan) {
    for (const d of plan.doors) {
      if (!copy.doors.cards.some((c) => c.door === d.id)) out.push(err(`The Doors need a card line for ${d.id}.`));
    }
  }
  return out;
}

export const storiesSchema = z.object({
  builder: z.object({ title: nonEmpty, lines: strList.min(2), says: z.array(speech).optional() }),
  explorer: z.object({ title: nonEmpty, lines: strList.min(2), says: z.array(speech).optional() }),
  toExplorer: nonEmpty,
});
export type EduStories = z.infer<typeof storiesSchema>;

export function checkStories(value: unknown, cast: CastScene | undefined, copy: EduCopy | undefined): EduProblem[] {
  const shape = schemaProblems(storiesSchema, value, "chapter stories");
  if (shape.length) return shape;
  const stories = value as EduStories;
  const out: EduProblem[] = [...markupProblems(stories, "Stories")];
  const foundationLines = new Set(copy ? strings(copy).map((s) => s.text.trim().toLowerCase()) : []);

  for (const tier of ["builder", "explorer"] as const) {
    const chapter = stories[tier];
    out.push(...lineLengthProblems(chapter.lines.map((text, i) => ({ path: `${tier}.lines.${i}`, text })), `${tier} chapter`));
    if (cast) {
      const text = strings(chapter).map((s) => s.text).join(" ");
      for (const name of [cast.main.name, cast.guide.name]) {
        if (!new RegExp(`\\b${name}\\b`, "i").test(text)) out.push(err(`The ${tier} chapter must name ${name}; same cast as Foundation.`));
      }
      out.push(...speakerProblems((chapter.says ?? []).map((s, i) => ({ path: `${tier}.says.${i}`, speaker: s.speaker })), castNames(cast), "Stories"));
    }
    const repeated = chapter.lines.filter((l) => foundationLines.has(l.trim().toLowerCase()));
    if (repeated.length) out.push(warn(`The ${tier} chapter repeats Foundation lines ("${repeated[0]}"); it must not retell the Foundation story.`));
  }
  return out;
}

// ---------------------------------------------------------------------
// Step 9: the page
// ---------------------------------------------------------------------

const APPROVED_SCRIPT_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com"];
const APPROVED_STYLE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
export const SCENE_PLACEHOLDER = "<!--SCENE-->";

export function readPage(text: string): string | null {
  const inner = between(text, "page");
  if (inner === null) return null;
  return stripFences(inner);
}

function host(url: string): string | null {
  try {
    return new URL(url, "https://invalid.local/").hostname;
  } catch {
    return null;
  }
}

export function checkPage(page: string, copy: EduCopy | undefined): EduProblem[] {
  const out: EduProblem[] = [];
  if (/<!doctype/i.test(page) || /<\/?(html|head|body)\b/i.test(page)) out.push(err("No doctype, html, head or body tags; the page is a fragment."));

  const title = /<title>([\s\S]*?)<\/title>/i.exec(page)?.[1]?.trim();
  if (!title) out.push(err("The page needs a <title>."));
  else if (wordCount(title) < 2 || wordCount(title) > 4) out.push(err(`The <title> "${title}" must be two to four words.`));
  if (!/claude:viewport-fit-sides/.test(page)) out.push(warn('Add <meta name="claude:viewport-fit-sides">.'));

  if (!/:root\s*\{[^}]*--paper/i.test(page) || !/--sand\s*:/i.test(page)) out.push(err("Define the Eloquent Lab colour tokens (--paper, --ink, --sand, …) on :root."));
  if (!/prefers-color-scheme\s*:\s*dark/i.test(page)) out.push(err("Add the dark overrides in a @media (prefers-color-scheme: dark) block."));
  if (!/\[data-theme=["']?dark["']?\]/i.test(page)) out.push(warn('Repeat the dark overrides under :root[data-theme="dark"].'));
  if (!/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/i.test(page)) out.push(err("Add the global rule [hidden]{display:none!important}."));
  if (!/Georgia/.test(page) || !/Cinzel/.test(page) || !/PT Mono/.test(page)) out.push(warn("Use the Eloquent Lab type: Georgia body, Cinzel headings, PT Mono numbers."));

  const scenes = page.split(SCENE_PLACEHOLDER).length - 1;
  if (scenes !== 1) out.push(err(`Write ${SCENE_PLACEHOLDER} exactly once, where the Meet scene picture goes (found ${scenes}).`));
  for (const id of STAGE_IDS) {
    if (!new RegExp(`data-stage=["']${id}["']`).test(page)) out.push(err(`Stage ${id} is missing: add section.stage[data-stage="${id}"].`));
  }
  if (!/data-demo-state=/.test(page)) out.push(warn("Give each stage a data-demo-state for the demo link."));
  for (const tier of ["builder", "explorer"]) {
    if (!new RegExp(`data-tier=["']${tier}["']`).test(page)) out.push(err(`The ${tier} layers are missing (.layer[data-tier="${tier}"]).`));
  }
  if (!/data-path=/.test(page)) out.push(warn("Give the copy's words data-path attributes."));
  if (!/figure[^>]*class=["'][^"']*\bsim\b/.test(page)) out.push(err("The page needs at least one figure.sim inside the text."));
  if (/edu-v2|SKILL\.md|concept[-_]brief|demo[-_]spec/i.test(page.replace(/<script\b[\s\S]*?<\/script>/gi, ""))) {
    out.push(err("No build notes or pipeline names may appear on the page."));
  }

  const scripts = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length === 0) out.push(err("The page needs its inline <script>."));
  for (const [, attrs, code] of scripts) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs!)?.[1];
    if (src) {
      const h = host(src);
      if (!h || !APPROVED_SCRIPT_HOSTS.includes(h)) out.push(err(`Script ${src} isn't from an approved CDN (${APPROVED_SCRIPT_HOSTS.join(", ")}).`));
      continue;
    }
    if (/\btype\s*=\s*["']module["']/i.test(attrs!)) out.push(err("Use a classic inline script, not a module."));
    try {
      new Script(code!, { filename: "page.js" });
    } catch (e) {
      out.push(err(`The page script has a syntax error: ${e instanceof Error ? e.message : String(e)}`));
    }
  }
  for (const [, href] of page.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const h = host(href!);
    if (h && h !== "invalid.local" && !APPROVED_STYLE_HOSTS.includes(h)) out.push(err(`Stylesheet ${href} isn't from Google Fonts.`));
  }
  const code = scripts.map((s) => s[2]).join("\n");
  if (/localStorage/.test(code) && !/\btry\s*\{/.test(code)) out.push(err("Use localStorage only inside try/catch."));
  if (!/ARTIFACT\s*=/.test(code)) out.push(warn("Start the script with the ARTIFACT declaration."));
  if (!/__events/.test(code)) out.push(warn("Emit events into window.__events (and postMessage)."));
  if (copy && title && !page.includes(copy.title)) out.push(warn(`Use the copy's title "${copy.title}" as the h1.`));
  return out;
}
