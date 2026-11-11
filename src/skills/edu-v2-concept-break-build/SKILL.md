---
name: edu-v2-concept-break-build
description: Plan one concept for a learn-by-doing artifact from the concept brief - relationship, misconceptions, Doors, Check, eight-stage spine, layers, colour map. Writes the concept plan.
tools: calculate
max_output_tokens: 24000
---
# edu-v2-concept-break-build

Turn one concept into a ten-minute, learn-by-doing plan (Adaptive Teaching Framework v2.3 base). This step fixes what is true: the relationship, the misconceptions, the Doors and the Check content. What the student does with the controls is specified by `edu-v2-concept-demo`. Story is `edu-v2-story-arc`.

## 0. Start from the brief
You receive `<concept_brief>` from `edu-v2-concept-research`, the `<track>`, and optionally `<chapter>` (an existing colour map and misconception ids already used in the chapter). Do not invent misconceptions or applications that the brief does not hold. A misconception marked `unverified` or `from-memory` stays flagged in the plan: copy its status into `source_status`.

## 1. Break the concept down
1. **Position.** Course, chapter, artifact number. List what comes earlier and what is reserved for later chapters. Never use a later idea.
2. **One concept.** One idea per artifact, about 10 minutes (8 to 12). If it needs two relationships, plan only the first.
3. **The relationship (stage 5).** One plain sentence. Every Check and Doors question may use only this.
4. **Variables and units.** Name each quantity, its unit and the range the artifact allows. Give each quantity an `id` (lowercase, one word) and a colour in `colour_map`, muted to sit with black ink on white, with a lighter value for dark mode. Keep any colour already in `<chapter>`.
5. **Model and honest limits.** The simple model the student uses, and the assumption that fails in Break, with the boundary value or condition.
6. **Misconceptions.** Three or four wrong ideas, ids F1, F2, F3 (or a letter that fits the concept, like D1, D2, D3 for demand), unique in the chapter. Each gets a probe question and a wrong answer that maps to it, and `brief_id` names the brief misconception it comes from.
7. **Doors.** Two or three distinct real-world uses from different domains where the relationship holds. Each says what changes, what responds, a one-line result, and a picture spec (a before and an after picture with a count of a visible thing; the two counts differ). Check that each can be asked with only the stage 5 relationship.

## 2. The eight-stage spine
| Stage | Job | Output |
|---|---|---|
| 1 Hook | Doors, then a surprise from the story | A stored guess about the link |
| 2 Predict | A guess before play | Pictured choice (Builder adds a number, Explorer adds confidence and reason) |
| 3 Play | One control, a few runs, the student's own data | Earlier runs remembered and named |
| 4 Notice | The student says what they saw, before any word is given | One question per observation |
| 5 Name | The word and the relationship | One sentence. The equation is Explorer-only |
| 6 Break | Find the assumption that fails | The boundary where the idea stops being true |
| 7 Transfer | Same idea, new domain | One question per tier |
| 8 Check | Probes mapped to misconceptions, then back to the Doors | Status: secure, shaky or gap |

Budgets: Hook 1.5 minutes, Play 2, Check 1.5. The rest share the remainder; the total is 8 to 12 minutes.

## 3. The three layers
Write Foundation once. Add Builder and Explorer as layers on top, not as copies.
- **Foundation.** Pictured or chosen answers, positive wording, unlimited attempts, a visual hint after two wrong tries. No formulas.
- **Builder.** Ratios, tables and proportional language. Graph readings. Three attempts, then the explanation is shown. A hint button after two wrong tries.
- **Explorer.** The equation (Explorer layer only) and calculated answers with units. Feedback gives direction only ("Too large"). A hint asks "What have you tried so far?" first.
- Numeric answers at Explorer: keep each wrong answer (distractor) more than twice the tolerance away from the right one.

## 4. The Check and the Doors
- Foundation questions first. "Go deeper" opens Builder, then Explorer, one tier at a time.
- One probe per misconception (at least one Check item per misconception, across the tiers). A wrong answer is mapped to its misconception id.
- Status per concept: **secure** (right quickly), **shaky** (needed hints or several tries), **gap** (exhausted attempts or repeated the same wrong idea).
- Back to the Doors: one question per door, per tier, with a two-line explanation. Give one `link_statement` that holds for all the doors. Report Doors next to the status, not inside it.

## 5. Verify the content
1. Run every number with the calculate tool: each answer, tolerance and distractor.
2. The Check uses only the stage 5 relationship.
3. No later-chapter idea appears.
4. Read it as a student: is there a word before its picture?
5. Events are planned for guesses, answers, hints, doors and status.

## 6. Output
Reply with only this JSON object inside `<concept_plan>` tags. No text outside the tags, no ``` fences. Foundation and Builder Check items use `options` and `answer`; Explorer items may use `numeric` instead.

<concept_plan>
{
  "position": {"course": "", "chapter": "", "n": 1},
  "earlier": [""],
  "reserved_for_later": [""],
  "relationship": "one plain sentence",
  "variables": [{"id": "", "name": "", "unit": "", "min": 0, "max": 0}],
  "colour_map": [{"id": "", "light": "#000000", "dark": "#ffffff"}],
  "model": {"simple_model": "", "assumptions": [""], "fails_in_break": "", "boundary": ""},
  "equation": "the Explorer-only equation",
  "misconceptions": [{"id": "F1", "brief_id": "M1", "wrong_idea": "", "probe": "", "wrong_answer": "", "source_status": "verified|single-source|unverified|from-memory"}],
  "doors": [{"id": "door-1", "domain": "", "changes": "", "responds": "", "result": "one line", "picture": {"before": {"count": 1, "description": ""}, "after": {"count": 3, "description": ""}}}],
  "spine": [{"stage": 1, "name": "Hook", "job": "", "output": "", "minutes": 1.5}],
  "notice": [""],
  "break_questions": [""],
  "transfer": {"foundation": "", "builder": "", "explorer": ""},
  "check": {
    "foundation": [{"id": "f-1", "probe_for": "F1", "question": "", "options": [""], "answer": "", "wrong_answers": [{"answer": "", "misconception": "F1"}]}],
    "builder": [],
    "explorer": [{"id": "e-1", "probe_for": "F2", "question": "", "numeric": {"answer": 0, "unit": "", "tolerance": 0, "distractors": [0]}, "wrong_answers": [{"answer": "", "misconception": "F2"}]}]
  },
  "doors_check": {
    "foundation": [{"door": "door-1", "question": "", "answer": "", "explanation": "two lines"}],
    "builder": [],
    "explorer": []
  },
  "link_statement": "one sentence that holds for every door",
  "exercises": [{"id": "x-1", "tier": "foundation|builder|explorer", "problem": "", "answer": "", "hints": [""], "probe": "F1"}],
  "events": ["predict", "check", "hint", "door", "concept-status"]
}
</concept_plan>
