/**
 * Tests for the web_search tool. No AI and no real search service:
 * a fake backend returns whatever each test needs.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { createWebSearchTool } from "../src/tools/webSearch.js";
import type { SearchBackend, SearchOptions, SearchResult } from "../src/tools/search/types.js";

/** A fake search service. Records what it was asked, returns what we tell it to. */
function fakeBackend(results: SearchResult[] | (() => never)) {
  const queries: string[] = [];
  const backend: SearchBackend = {
    name: "fake",
    async search(query: string, _options: SearchOptions) {
      queries.push(query);
      if (typeof results === "function") return results();
      return results;
    },
  };
  return { backend, queries };
}

const result = (url: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  title: "Photosynthesis",
  url,
  content: "Plants use light energy to make glucose.",
  ...extra,
});

test("1. a normal search returns results and records the URLs", async () => {
  const { backend } = fakeBackend([result("https://www.britannica.com/science/photosynthesis")]);
  const ws = createWebSearchTool({ backend });

  const out = JSON.parse(await ws.tool.run({ query: "photosynthesis" }));

  assert.equal(out.query, "photosynthesis");
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].url, "https://www.britannica.com/science/photosynthesis");
  assert.deepEqual([...ws.returnedUrls()], ["https://www.britannica.com/science/photosynthesis"]);
  assert.equal(ws.callCount(), 1);
});

test("2. bad input from the AI returns an error message, not a crash", async () => {
  const { backend, queries } = fakeBackend([]);
  const ws = createWebSearchTool({ backend });

  assert.match(await ws.tool.run({ query: "" }), /must not be empty/);
  assert.match(await ws.tool.run({ query: "   " }), /must not be empty/);
  assert.match(await ws.tool.run({ query: 123 }), /must be text/);
  assert.match(await ws.tool.run({}), /must be text/);
  assert.match(await ws.tool.run("photosynthesis"), /send your search as/);
  assert.match(await ws.tool.run(null), /send your search as/);

  assert.equal(queries.length, 0, "the search service was never called");
  assert.equal(ws.callCount(), 0, "bad inputs don't use up searches");
});

test("3. long queries are cut down, and hidden characters removed", async () => {
  const { backend, queries } = fakeBackend([result("https://www.britannica.com/a")]);
  const ws = createWebSearchTool({ backend });

  await ws.tool.run({ query: "a".repeat(500) });
  await ws.tool.run({ query: "Calvin\u0000 cycle\n\nsteps" });

  assert.equal(queries[0]!.length, 200);
  assert.equal(queries[1], "Calvin cycle steps");
});

test("4. results from untrusted or fake websites are removed", async () => {
  const { backend } = fakeBackend([
    result("https://en.wikipedia.org/wiki/Photosynthesis"), // trusted subdomain
    result("https://randomblog.com/photosynthesis"), // not trusted
    result("https://fakewikipedia.org/photosynthesis"), // look-alike name
    result("https://wikipedia.org.evil.com/page"), // trusted name hidden in another site
    result("http://www.britannica.com/science/photosynthesis"), // not https
    result("not a url"), // broken
  ]);
  const ws = createWebSearchTool({ backend });

  const out = JSON.parse(await ws.tool.run({ query: "photosynthesis" }));

  assert.deepEqual(
    out.results.map((r: SearchResult) => r.url),
    ["https://en.wikipedia.org/wiki/Photosynthesis"],
  );
});

test("5. duplicate results are removed and results are trimmed", async () => {
  const { backend } = fakeBackend([
    result("https://www.britannica.com/a", { content: "x".repeat(5000) }),
    result("https://www.britannica.com/a#section-2"), // same page
    result("https://www.britannica.com/b", { title: "<b>Bold</b>   title", content: "<p>Some   text</p>" }),
  ]);
  const ws = createWebSearchTool({ backend, maxCharsPerResult: 100 });

  const out = JSON.parse(await ws.tool.run({ query: "test" }));

  assert.equal(out.results.length, 2);
  assert.equal(out.results[0].content.length, 100);
  assert.equal(out.results[1].title, "Bold title");
  assert.equal(out.results[1].content, "Some text");
});

test("6. no more than maxResults results are returned", async () => {
  const many = Array.from({ length: 20 }, (_, i) => result(`https://www.britannica.com/page-${i}`));
  const ws = createWebSearchTool({ backend: fakeBackend(many).backend, maxResults: 6 });

  const out = JSON.parse(await ws.tool.run({ query: "test" }));
  assert.equal(out.results.length, 6);
});

test("7. no trusted results gives a helpful message", async () => {
  const ws = createWebSearchTool({ backend: fakeBackend([result("https://randomblog.com/x")]).backend });
  assert.match(await ws.tool.run({ query: "test" }), /No results found on trusted websites/);
  assert.equal(ws.returnedUrls().size, 0);
});

test("8. a failing search service gives a message, and never leaks details", async () => {
  const ws = createWebSearchTool({
    backend: fakeBackend(() => {
      throw new Error("401 Unauthorized: key tvly-SECRET123456789 is invalid");
    }).backend,
  });

  const out = await ws.tool.run({ query: "test" });
  assert.match(out, /search service is unavailable/);
  assert.doesNotMatch(out, /SECRET|401|tvly/);
});

test("9. a slow search service gives a timeout message", async () => {
  const slow: SearchBackend = {
    name: "slow",
    search: () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      return Promise.reject(err);
    },
  };
  const ws = createWebSearchTool({ backend: slow });
  assert.match(await ws.tool.run({ query: "test" }), /took too long/);
});

test("10. the search limit per run is enforced", async () => {
  const { backend, queries } = fakeBackend([result("https://www.britannica.com/a")]);
  const ws = createWebSearchTool({ backend, maxCallsPerRun: 3 });

  for (let i = 0; i < 3; i++) await ws.tool.run({ query: `query ${i}` });
  const fourth = await ws.tool.run({ query: "one too many" });

  assert.match(fourth, /search limit reached/);
  assert.equal(queries.length, 3, "the 4th search never reached the service");
});

test("11. each run gets its own memory (two users don't mix)", async () => {
  const runA = createWebSearchTool({ backend: fakeBackend([result("https://www.britannica.com/a")]).backend });
  const runB = createWebSearchTool({ backend: fakeBackend([result("https://www.britannica.com/b")]).backend });

  await runA.tool.run({ query: "a" });
  await runB.tool.run({ query: "b" });

  assert.deepEqual([...runA.returnedUrls()], ["https://www.britannica.com/a"]);
  assert.deepEqual([...runB.returnedUrls()], ["https://www.britannica.com/b"]);
});

test("12. only trusted domains are sent to the search service", async () => {
  let sentDomains: string[] = [];
  const spy: SearchBackend = {
    name: "spy",
    async search(_q, options) {
      sentDomains = options.domains;
      return [];
    },
  };
  await createWebSearchTool({ backend: spy, trustedDomains: ["nasa.gov", "OpenStax.org"] }).tool.run({ query: "x" });
  assert.deepEqual(sentDomains, ["nasa.gov", "openstax.org"]);
});
