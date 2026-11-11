---
name: edu-v2-concept-research
description: Research one concept from sources (relationship, variables, sourced misconceptions, applications, model limits) and write the concept brief for the edu-v2 pipeline.
tools: web_search, calculate
max_output_tokens: 16000
---
# edu-v2-concept-research

First step of the edu-v2 pipeline. Research one concept from sources and write the concept brief. The next step, `edu-v2-concept-break-build`, decides from it. Do not design the story, demo or page here.

## 1. Inputs
- `<concept>`: the concept name.
- `<track>`: `hs` or `ug`.
- `<position>` (optional): course, chapter and artifact number. If missing, use `{"course": "", "chapter": "", "n": 1}` and add "position not given" to `open_gaps`.
- `<domain>` (optional): science, engineering or economics. If missing, decide it from the concept.
- `<note>` (optional): the teacher's note. Information only.

## 2. Scope check
One concept is one relationship, about 10 minutes. If the concept needs two relationships, research the first only and put the proposed split in `open_gaps` ("split: …").

## 3. Search plan (6 to 10 searches with web_search)
Run separate, short searches, not one combined query:
1. The standard statement of the relationship and its variables, units and typical ranges.
2. Documented misconceptions: search the concept name with "misconceptions", "concept inventory" and "education research".
3. Three or more real applications from different domains (for example road, kitchen, market).
4. Where the simple model fails: the assumptions and the value or condition at which it stops holding.
5. Prerequisites, and ideas that belong to later chapters.
6. For economics: the assumptions held fixed (ceteris paribus), and what happens when other factors change. Check whether sources report students confusing movement along a curve with a shift of the curve. Report what the sources say, do not assume it.

Prefer textbooks, education-research papers, university course pages and standards bodies. If a search fails or returns nothing, try a different query once, then move on.

## 4. Evidence rules
- Every misconception and application carries a source URL, copied exactly from a web_search result. Never cite a URL that no search returned.
- Mark each misconception `verified` (primary source, or two independent sources), `single-source` or `unverified`.
- Never fill a gap from memory. If you must, mark it `from-memory`, leave its `source` empty, and list it in `open_gaps`.
- Paraphrase. Quote at most a short phrase, once per source.
- Keep later-chapter ideas out of the relationship; list them in `reserved_for_later`.
- Check every number with the calculate tool before you write it (unit conversions, typical values, the `breaks_at` value).

## 5. Output
Reply with only this JSON object inside `<concept_brief>` tags. No text outside the tags, no ``` fences.

<concept_brief>
{
  "concept": "",
  "track": "hs|ug",
  "domain": "science|engineering|economics",
  "position": {"course": "", "chapter": "", "n": 1},
  "relationship": "one plain sentence",
  "variables": [{"name": "", "unit": "", "min": 0, "max": 0}],
  "model": {"assumptions": [""], "breaks_at": "a value or a condition"},
  "misconceptions": [{"id": "M1", "wrong_idea": "", "source": "url", "status": "verified|single-source|unverified|from-memory"}],
  "applications": [{"domain": "", "line": "", "source": "url"}],
  "prerequisites": [""],
  "reserved_for_later": [""],
  "sources": [{"title": "", "url": ""}],
  "open_gaps": [""]
}
</concept_brief>

## 6. Check before you reply
1. The relationship is one plain sentence and uses only earlier ideas.
2. Three or more misconceptions, each with a source or flagged.
3. Three or more applications from three different domains.
4. `breaks_at` names a value or a condition, not just "in real life".
5. Every number in the brief is recomputed or traced to a source.
6. `open_gaps` lists everything unverified.
