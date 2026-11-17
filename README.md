# study-harness

## Lessons from a textbook (`/lessons`)

**Optional.** Lessons need the `doc-extraction-util` package, an optional peer dependency. The rest of
the harness installs, builds, tests and runs without it. Without it, `harness.lessons()`, `/lessons` and
`study-harness/lessons` say it's missing, the build compiles lessons against stub types
(`stubs/`), and `test/lessons.test.ts` is skipped. With it (in this package's `node_modules`, or in the
`node_modules` of an app that has the harness in `deps/`), lessons are built, typed and tested in full.

Cuts a textbook into lessons made of topics, with prerequisites, using `doc-extraction-util`. The
library does the OCR, layout graph, page math and
prerequisite linking; the harness answers its AI tasks one at a time on the main model, each with
its skill (`src/skills/find-topics`, `group-lessons`, `find-prerequisites`, copied from the
library and ours to edit) and a single `submit_answer` tool whose schema is the task's.

| Step | Who |
|---|---|
| OCR (Mistral), layout graph, reading units, windows | code (library) |
| find topics, per ~10 pages · split topics over 6 pages (rare) | AI (`find-topics`) |
| snap/fold topics, page ranges | code (library) |
| group topics into lessons | AI (`group-lessons`) |
| name concepts each topic introduces / needs, per 80 topics | AI (`find-prerequisites`) |
| link needs to earlier topics (REQUIRES), drop implied links, roll up to lessons, graph, Cypher | code (library) |

```
/lessons books/jesc105.pdf | Life Processes        (needs MISTRAL_API_KEY in .env)
/lessons book.md | Light | --no-prerequisites       (markdown with <!--- Page N ---> markers)
```

From code: `harness.lessons({ source: { pdf, mistralApiKey }, book: { id, title } }, { cache: fileCache(dir) })`,
then `saveLessons(outDir, result)` (both from `study-harness/lessons`) writes `plan.json`, `graph.json`, `book.cypher` and `layout.json`.
Answers are cached by a hash of (instructions, material, schema, model), and OCR by a hash of the PDF,
so re-running a book is free. Unusable answers are sent back to the model to fix (3 tries in all);
connection errors, rate limits and overloads retry the call. Editing a skill is fine as long as the
answer keeps its schema; a `needs` entry must reuse the exact name the earlier topic gave the concept.

## edu-v2 pipeline (`/edu-v2-adapt-teach-platform`)

Builds one learn-by-doing concept page from a topic by running the edu-v2 skills in order
(`src/skills/edu-v2-*`). Each step is checked in code (`src/edu/checks.ts`) before the next one
starts. A failed check gets one fix. If the step still fails, the run stops there.

| Step | Skill | Tools | Writes |
|---|---|---|---|
| research | edu-v2-concept-research | web_search, calculate | concept-brief.json |
| plan | edu-v2-concept-break-build | calculate | concept-plan.json |
| arc | edu-v2-story-arc | | story-arc.md |
| cast | edu-v2-character-scene | | cast-scene.json |
| scene | edu-v2-layout-and-drawing | | scene.svg |
| demo | edu-v2-concept-demo | | demo-spec.json |
| copy | edu-v2-story-and-scene | | copy.json |
| stories | edu-v2-story-and-scene | | stories.json |
| page | edu-v2-content-presentation | | page.html, index.html |

Every step also gets the platform rules (`edu-v2-adapt-teach-platform`).

```
/edu-v2-adapt-teach-platform Law of demand | hs | How Markets Work > Demand > 1
/edu-v2-adapt-teach-platform --resume out/edu-v2/law-of-demand
```

Files go to `out/edu-v2/<topic>/` as each step finishes, with a `run-log.md`. From code, call
`harness.edu({ topic, track, position })`. Pass `{ resume: readEduOutputs(files) }` to continue a run.

## Topic thumbnail (`harness.thumbnail`)

Draws the image on the right of a topic's banner with the `mentor-thumbnail-generator` skill
(`src/skills/mentor-thumbnail-generator`, copied from the Claude skill of the same name): one
transparent 320x240 SVG, a teal glow and a simple line diagram of the topic. One model call, on the
design model when `simulation` is set. The reply is checked in code (`checkThumbnail` in
`src/thumbnail.ts`: viewBox, the two glow gradients, size, and no scripts, event handlers, external
links, embedded images, filters or styles); a failed check gets one fix.

```ts
const result = await harness.thumbnail({ topic: "Mitosis", subject: "Biology", description: "…" });
if (result.status === "ok") use(result.svg);
```

The SVG is model output: show it as an `<img>` (e.g. a `data:` URL), never inline in the page.
