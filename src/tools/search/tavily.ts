/**
 * Search backend for Tavily (tavily.com).
 * The API key belongs to your service and comes from server settings
 * (the TAVILY_API_KEY environment variable), never from the AI or the user.
 */
import type { SearchBackend, SearchOptions, SearchResult } from "./types.js";

export function createTavilyBackend(apiKey: string): SearchBackend {
  if (!apiKey) throw new Error("TavilyBackend needs an API key.");

  async function search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        max_results: options.maxResults,
        search_depth: "advanced",
        include_domains: options.domains,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!res.ok) throw new Error(`Search service returned status ${res.status}.`);

    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    return (data.results ?? []).map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      content: String(r.content ?? ""),
    }));
  }

  return { name: "tavily", search };
}
