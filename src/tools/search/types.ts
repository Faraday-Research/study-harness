/**
 * A "search backend" is the outside service that actually searches the web
 * (Tavily, Brave, Bing...). The web_search tool doesn't care which one it is.
 * To switch services, write a new backend. The tool doesn't change.
 */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface SearchOptions {
  maxResults: number;
  /** Ask the service to search only these websites */
  domains: string[];
  /** Stop waiting after this many milliseconds */
  timeoutMs: number;
}

export interface SearchBackend {
  readonly name: string;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
