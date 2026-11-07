/**
 * Try the web_search tool against the real search service.
 *
 *   npm run try-search -- "photosynthesis"
 *
 * Reads TAVILY_API_KEY from the environment (npm run try-search loads .env).
 * This shows exactly what the AI will receive when it calls the tool.
 */
import { toToolSpec } from "../src/tool.js";
import { createWebSearchTool } from "../src/tools/webSearch.js";
import { createSearchBackend } from "../src/tools/search/index.js";

let backend;
try {
  backend = createSearchBackend(); // reads TAVILY_API_KEY, same as the harness
} catch (err) {
  console.error((err as Error).message, "Free key at tavily.com.");
  process.exit(1);
}

const query = process.argv.slice(2).join(" ") || "photosynthesis";
const ws = createWebSearchTool({ backend });

console.log("What the AI sees about this tool:\n");
console.log(JSON.stringify(toToolSpec(ws.tool), null, 2));

console.log(`\nRunning: web_search({ query: "${query}" })\n`);
const output = await ws.tool.run({ query });

console.log("What the AI receives back:\n");
try {
  console.log(JSON.stringify(JSON.parse(output), null, 2));
} catch {
  console.log(output); // an error or "no results" message
}

console.log("\nURLs recorded for source checking:", [...ws.returnedUrls()]);
