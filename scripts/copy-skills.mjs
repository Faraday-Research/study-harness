// tsc only outputs .js files. Copy the non-TypeScript files the built harness needs into dist/:
// each skill's SKILL.md, and the interactive lesson frame (HTML, CSS and its engine script).
import { cpSync, statSync } from "node:fs";

cpSync("src/skills", "dist/skills", {
  recursive: true,
  // SKILL.md files, and worked examples (example-lesson.js) that the skills include
  filter: (path) => statSync(path).isDirectory() || path.endsWith(".md") || path.endsWith("example-lesson.js"),
});
cpSync("src/interactive/frame", "dist/interactive/frame", { recursive: true });
