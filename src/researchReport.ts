/**
 * Turns the topic-research skill's JSON reply into a ResearchReport.
 *
 * The reply comes from a model, so nothing about it is trusted: it may be wrapped in ``` fences or
 * have text around it, fields may be missing or the wrong type, and lists may hold junk. Everything
 * is coerced to the expected shape here, so apps (and the interactive-simulation skill, which
 * builds on the report) never have to check it again.
 */

/** Ids like "S1" pointing into ResearchReport.sources */
type SourceIds = { sources: string[] };

/**
 * The topic-research skill's JSON answer, cleaned up: every list is present (maybe empty) and
 * items missing their main text are dropped, so the window can show it without more checks.
 */
export interface ResearchReport {
  topic: string;
  /** What the research focused on because of the description, or "general" */
  focus: string;
  summary: string;
  facts: ({ id: string; text: string } & SourceIds)[];
  processSteps: ({ order: number; text: string } & SourceIds)[];
  formulas: ({ id: string; formula: string; symbols: { symbol: string; meaning: string; unit: string }[] } & SourceIds)[];
  quantities: ({ id: string; name: string; unit: string; min: number | null; max: number | null } & SourceIds)[];
  realWorldUses: ({ id: string; title: string; description: string } & SourceIds)[];
  everydayExamples: ({ id: string; situation: string; connection: string } & SourceIds)[];
  misconceptions: ({ wrongIdea: string; correctIdea: string } & SourceIds)[];
  /** Things the research looked for but couldn't find */
  gaps: string[];
  sources: { id: string; title: string; url: string }[];
}

type Raw = Record<string, unknown>;

const MAX_TEXT = 5000;
const MAX_ITEMS = 50;

const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "");

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, MAX_ITEMS) : [];

/** Maps each object in a list with `pick`; items it rejects (returns null for) are dropped. */
function items<T>(value: unknown, pick: (item: Raw) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value.slice(0, MAX_ITEMS)) {
    const picked = isObject(item) ? pick(item) : null;
    if (picked) out.push(picked);
  }
  return out;
}

/** Only web links, so a source can never open a file: or javascript: URL. */
function webUrl(value: unknown): string {
  const raw = text(value);
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

/** The JSON object in the reply, ignoring ``` fences or text around it. */
function extractJson(reply: string): unknown {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** The report in the model's reply, or null if there is no usable one (no JSON, or no summary). */
export function parseResearchReport(reply: string): ResearchReport | null {
  const raw = extractJson(reply);
  if (!isObject(raw) || !text(raw.summary)) return null;
  const withSources = (item: Raw) => ({ sources: strings(item.sources) });

  return {
    topic: text(raw.topic),
    focus: text(raw.focus),
    summary: text(raw.summary),
    facts: items(raw.facts, (f) => (text(f.text) ? { id: text(f.id), text: text(f.text), ...withSources(f) } : null)),
    processSteps: items(raw.process_steps, (s) =>
      text(s.text) ? { order: num(s.order) ?? 0, text: text(s.text), ...withSources(s) } : null,
    ).sort((a, b) => a.order - b.order),
    formulas: items(raw.formulas, (f) =>
      text(f.formula)
        ? {
            id: text(f.id),
            formula: text(f.formula),
            symbols: items(f.symbols, (s) =>
              text(s.symbol) ? { symbol: text(s.symbol), meaning: text(s.meaning), unit: text(s.unit) } : null,
            ),
            ...withSources(f),
          }
        : null,
    ),
    quantities: items(raw.quantities, (q) =>
      text(q.name)
        ? {
            id: text(q.id),
            name: text(q.name),
            unit: text(q.unit),
            min: num(q.typical_min),
            max: num(q.typical_max),
            ...withSources(q),
          }
        : null,
    ),
    realWorldUses: items(raw.real_world_uses, (u) =>
      text(u.title) || text(u.description)
        ? { id: text(u.id), title: text(u.title), description: text(u.description), ...withSources(u) }
        : null,
    ),
    everydayExamples: items(raw.everyday_examples, (e) =>
      text(e.situation)
        ? { id: text(e.id), situation: text(e.situation), connection: text(e.connection), ...withSources(e) }
        : null,
    ),
    misconceptions: items(raw.misconceptions, (m) =>
      text(m.wrong_idea) && text(m.correct_idea)
        ? { wrongIdea: text(m.wrong_idea), correctIdea: text(m.correct_idea), ...withSources(m) }
        : null,
    ),
    gaps: strings(raw.gaps),
    sources: items(raw.sources, (s) => {
      const url = webUrl(s.url);
      return text(s.id) && url ? { id: text(s.id), title: text(s.title) || url, url } : null;
    }),
  };
}
