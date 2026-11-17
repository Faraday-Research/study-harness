// tsc, with or without doc-extraction-util (the optional peer that only lessons needs).
//
// Installed: a normal build against its real types.
// Not installed: the same build with its imports pointed at stubs (tsconfig.stub.json), so the
// harness still builds and runs; only harness.lessons() and "study-harness/lessons" need the real
// package at run time. Type errors in src/lessons.ts are expected then (it can't be checked
// without the real types) and are left out; an error in any other file still fails the build.
//
// Extra arguments go to tsc (e.g. --noEmit for `npm run typecheck`).
import { spawnSync } from "node:child_process";
import { hasExtractor } from "./hasExtractor.mjs";

const args = process.argv.slice(2);
const opts = { shell: process.platform === "win32" };

if (hasExtractor()) {
  process.exit(spawnSync("tsc", ["-p", "tsconfig.json", ...args], { ...opts, stdio: "inherit" }).status ?? 1);
}

const LESSONS = "src/lessons.ts";
const run = spawnSync("tsc", ["-p", "tsconfig.stub.json", "--pretty", "false", ...args], { ...opts, encoding: "utf8" });
if (run.error) throw run.error;

// One diagnostic is a "file(line,col): error …" line plus any indented lines after it.
const diagnostics = [];
for (const line of `${run.stdout}${run.stderr}`.split("\n")) {
  if (/^\s/.test(line) && diagnostics.length) diagnostics[diagnostics.length - 1] += `\n${line}`;
  else if (line.trim()) diagnostics.push(line);
}
const skipped = diagnostics.filter((d) => d.startsWith(`${LESSONS}(`));
const errors = diagnostics.filter((d) => !d.startsWith(`${LESSONS}(`));

console.warn(
  `doc-extraction-util not installed: built against stub types` +
    (skipped.length ? ` (${skipped.length} type error(s) in ${LESSONS} not checked).` : "."),
);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
