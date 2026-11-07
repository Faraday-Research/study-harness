/**
 * The search backend the harness uses. The app using the harness never
 * handles the search key; the harness finds it itself, in this order:
 *
 *   1. the TAVILY_API_KEY environment variable (wins if set)
 *   2. TAVILY_API_KEY in the harness's own .env file (study-harness/.env)
 *
 * The key is looked up each time a backend is created (once per research
 * run), not at import time. So the harness still starts, and chat still works,
 * without a key, and editing .env takes effect without restarting the app.
 *
 * Only TAVILY_API_KEY is read from the file; nothing is added to process.env,
 * so the app's own environment is left alone.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createTavilyBackend } from "./tavily.js";
import type { SearchBackend } from "./types.js";

/**
 * The harness's .env file. This module is at src/tools/search/ (or
 * dist/tools/search/ once built), so the harness folder is three levels up.
 */
export const HARNESS_ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));

export function createSearchBackend(
  env: NodeJS.ProcessEnv = process.env,
  envFile: string = HARNESS_ENV_FILE,
): SearchBackend {
  const key = env.TAVILY_API_KEY?.trim() || readKeyFromFile(envFile);
  if (!key) {
    throw new Error(
      `Web search isn't set up: set TAVILY_API_KEY in the environment or in the harness .env file (${envFile}).`,
    );
  }
  return createTavilyBackend(key);
}

/** TAVILY_API_KEY from a .env file, or undefined if the file or key is missing. */
function readKeyFromFile(path: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return undefined; // no .env file: fine, the environment may provide the key
  }
  return parseEnv(text).TAVILY_API_KEY?.trim() || undefined;
}
