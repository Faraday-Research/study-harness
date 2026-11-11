# study-harness

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
