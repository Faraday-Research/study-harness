/**
 * The web_search tool.
 *
 * Use createWebSearchTool() to make a NEW tool for each skill run. Each one
 * keeps its own list of every URL it returned, so after the skill finishes,
 * your code can check that every source the AI cites really came from a search.
 */
import { z } from "zod";
import type { Tool } from "../tool.js";
import type { SearchBackend, SearchResult } from "./search/types.js";

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

/** The only websites results may come from. */
export const DEFAULT_TRUSTED_DOMAINS = [
  "wikipedia.org",
  "britannica.com",
  "khanacademy.org",
  "openstax.org",
  "nasa.gov",
  "nih.gov",
  "nature.com",
  "sciencedirect.com",
  "mathworld.wolfram.com",
  "bbc.co.uk",
];

export interface WebSearchSettings {
  backend: SearchBackend;
  trustedDomains?: string[];
  maxResults?: number; // results per search
  maxCharsPerResult?: number; // text kept from each result
  maxQueryLength?: number;
  maxCallsPerRun?: number; // searches allowed in one skill run
  timeoutMs?: number;
}

/**
 * A harness Tool whose run() also accepts any input and always returns text.
 * The engine validates input against `schema` first; run() checks it again itself.
 */
export type WebSearchTool = Tool & { run(args: unknown): Promise<string> };

/** What createWebSearchTool() gives back. */
export interface WebSearchToolInstance {
  tool: WebSearchTool;
  /** Every URL this tool returned to the AI during this run. */
  returnedUrls: () => Set<string>;
  /** How many searches were run. */
  callCount: () => number;
}

// ---------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------

export function createWebSearchTool(settings: WebSearchSettings): WebSearchToolInstance {
  const trustedDomains = (settings.trustedDomains ?? DEFAULT_TRUSTED_DOMAINS).map((d) => d.toLowerCase());
  const maxResults = settings.maxResults ?? 6;
  const maxChars = settings.maxCharsPerResult ?? 1500;
  const maxQueryLength = settings.maxQueryLength ?? 200;
  const maxCalls = settings.maxCallsPerRun ?? 6;
  const timeoutMs = settings.timeoutMs ?? 30_000;

  // This run's memory
  const returnedUrls = new Set<string>();
  let calls = 0;

  const tool: WebSearchTool = {
    // ---- HALF 1: what the AI sees ----
    name: "web_search",
    description:
      "Searches trusted educational and scientific websites (such as Britannica, Khan Academy, " +
      "OpenStax, NASA and Wikipedia). Use it to find facts, numbers, formulas and real-world " +
      "uses for your research. Use short, specific queries, and run a separate search for each " +
      `part of the topic. You can search at most ${maxCalls} times. Returns up to ${maxResults} ` +
      "results as JSON, each with a title, url and text extract. Only cite URLs that appear in these results.",
    schema: z.object({
      query: z
        .string()
        .describe("A short search query, e.g. 'Calvin cycle steps' or 'projectile motion range formula'"),
    }),

    // ---- HALF 2: what the harness runs ----
    async run(args: unknown): Promise<string> {
      // GUARDRAIL 1: limit searches per run
      if (calls >= maxCalls) {
        return `Error: search limit reached (${maxCalls} searches). Write your answer using the results you already have.`;
      }

      // GUARDRAIL 2: check the input the AI sent
      const query = cleanQuery(args, maxQueryLength);
      if (typeof query !== "string") return query.error;

      calls++;

      // Do the search (GUARDRAIL 3: errors become messages, never crashes)
      let raw: SearchResult[];
      try {
        raw = await settings.backend.search(query, { maxResults, domains: trustedDomains, timeoutMs });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return timedOut
          ? "Error: the search took too long. Try a shorter or different query."
          : "Error: the search service is unavailable right now. Try again, or continue with the results you have.";
      }

      // GUARDRAIL 4: clean the results, and keep only trusted websites
      // (we check again ourselves; we don't fully trust the search service)
      const results = cleanResults(raw, trustedDomains, maxResults, maxChars);
      if (results.length === 0) {
        return "No results found on trusted websites. Try a different or more general query.";
      }

      // Remember every URL we gave the AI
      for (const r of results) returnedUrls.add(r.url);

      return JSON.stringify({ query, results });
    },
  };

  return {
    tool,
    returnedUrls: () => new Set(returnedUrls),
    callCount: () => calls,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Checks and tidies the AI's arguments. Returns the query, or an error message. */
function cleanQuery(args: unknown, maxLength: number): string | { error: string } {
  if (typeof args !== "object" || args === null) {
    return { error: 'Error: send your search as { "query": "..." }.' };
  }
  const value = (args as Record<string, unknown>).query;
  if (typeof value !== "string") {
    return { error: 'Error: "query" must be text.' };
  }
  const query = value
    .replace(/[\u0000-\u001f\u007f]/g, " ") // remove hidden control characters
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  if (!query) return { error: 'Error: "query" must not be empty.' };
  return query;
}

/** Keeps only safe, trusted, unique results, trimmed to size. */
function cleanResults(raw: SearchResult[], trustedDomains: string[], maxResults: number, maxChars: number): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];

  for (const r of raw) {
    const url = normaliseUrl(r.url);
    if (!url || !isTrusted(url, trustedDomains) || seen.has(url)) continue;
    seen.add(url);

    out.push({
      title: tidyText(r.title).slice(0, 200) || url,
      url,
      content: tidyText(r.content).slice(0, maxChars),
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

/** Only https links, with tracking fragments removed. Returns null if invalid. */
function normaliseUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** True if the URL is on a trusted domain or one of its subdomains. */
export function isTrusted(url: string, trustedDomains: string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  // "en.wikipedia.org" matches "wikipedia.org"; "fakewikipedia.org" does not
  return trustedDomains.some((d) => host === d || host.endsWith("." + d));
}

/** Removes leftover HTML tags and extra spaces from text. */
function tidyText(text: string): string {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
