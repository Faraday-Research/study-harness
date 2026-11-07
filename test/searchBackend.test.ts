import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSearchBackend, HARNESS_ENV_FILE } from "../src/tools/search/index.js";

/** A temporary .env file with the given contents. */
function envFile(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "harness-env-")), ".env");
  writeFileSync(path, contents);
  return path;
}
const noFile = join(tmpdir(), "does-not-exist", ".env");

describe("createSearchBackend", () => {
  it("uses the key from the TAVILY_API_KEY environment variable", () => {
    expect(createSearchBackend({ TAVILY_API_KEY: "tvly-env" }, noFile).name).toBe("tavily");
  });

  it("falls back to TAVILY_API_KEY in the harness .env file", () => {
    const file = envFile('OPENAI_API_KEY=sk-x\n# comment\nTAVILY_API_KEY="tvly-file"\n');
    expect(createSearchBackend({}, file).name).toBe("tavily");
  });

  it("gives a clear error when neither has the key", () => {
    expect(() => createSearchBackend({}, noFile)).toThrow(/set TAVILY_API_KEY in the environment or in the harness \.env/);
    expect(() => createSearchBackend({ TAVILY_API_KEY: "  " }, envFile("TAVILY_API_KEY=\n"))).toThrow(
      /set TAVILY_API_KEY/,
    );
    expect(() => createSearchBackend({}, envFile("OTHER=1\n"))).toThrow(/set TAVILY_API_KEY/);
  });

  it("doesn't change process.env", () => {
    const before = process.env.TAVILY_API_KEY;
    createSearchBackend({}, envFile("TAVILY_API_KEY=tvly-file\n"));
    expect(process.env.TAVILY_API_KEY).toBe(before);
  });

  it("points at the .env in the harness folder", () => {
    expect(HARNESS_ENV_FILE).toBe(join(process.cwd(), ".env"));
  });
});
