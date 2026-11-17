import { configDefaults, defineConfig } from "vitest/config";
import { hasExtractor } from "./scripts/hasExtractor.mjs";

// The lessons tests need doc-extraction-util (an optional peer); without it they're skipped.
const lessons = hasExtractor();
if (!lessons) console.warn("doc-extraction-util not installed: skipping test/lessons.test.ts.");

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ...(lessons ? [] : ["test/lessons.test.ts"])],
  },
});
