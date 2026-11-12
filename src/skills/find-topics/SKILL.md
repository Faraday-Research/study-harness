---
name: find-topics
description: "Split a school textbook into topics: label every reading unit's role and idea, then start a topic only where a new learning objective begins."
metadata:
  title: "Finding topics"
  version: "2"
  used-by: topics, splitTopic
---

# Finding topics in a textbook

You split a school textbook into **topics**, reading it in order, one window of units at a time. Every publisher cuts its chapters differently. Your job is to find the topics in the text itself, the same way every time, by following the steps below.

## What a topic is

A topic is **one learning objective**: one idea a teacher would teach in a single class, which a student could sum up in one sentence, such as "Students can explain why light bends when it enters water". In most textbooks a topic is 1 to 4 pages of teaching text together with its examples, activities and questions.

A topic is not:

- a whole chapter, or a section that holds several ideas (too big);
- a single definition, example, activity, figure or box (too small);
- the publisher's heading structure. Headings are hints, never the rule.

## What you are given

- The book's title, when known.
- The open topic: the topic still running from the previous window, or a note that this is the start of the book.
- A guide line saying how many pages the new units span and how many starts to expect.
- "Already read" units, for context only.
- "New units": the ones you label and mark starts among. Each starts with a line such as `[u012 · p.164 · text]`: its id, its page and its kind (text, table or figure).

## The process

Follow these four steps, in order, for every window.

### Step 1: Label every new unit

Give each unit under "New units" exactly one **role**:

| role | the unit … |
|---|---|
| concept | introduces or explains an idea: a definition, explanation, law, process or comparison |
| example | works through an example or a solved problem |
| activity | is an activity, experiment, project or "try this" |
| box | is a side box: "Do you know?", "More to know", a note, a short biography or fun fact |
| questions | is questions, exercises, a summary or "What you have learnt" |
| figure | is a figure or its caption |
| table | is a table |
| matter | is front or back matter: contents, preface, foreword, acknowledgements, index, glossary, answer key |

Then write its **idea**: what it teaches or supports, in at most 6 words, in the book's own terms. Units that carry on the same idea get exactly the same idea text.

### Step 2: Decide where topics start

A new topic starts at a unit only when all three hold:

1. its role is concept;
2. its idea is a new learning objective, not a detail, case, step or type within the open topic's idea;
3. what came before it is enough to stand as a topic on its own (about half a page or more), or it is the first unit of the book.

Never start a topic at an example, activity, box, questions, figure or table unit. They belong to the topic they sit in. Questions and summaries at the end of a chapter stay with the topic just before them.

Start a segment of kind "skip" at the first matter unit of a run of matter, and a "teaching" topic again at the first concept unit after it.

If the open topic simply carries on through all the new units, start nothing.

### Step 3: Check the size

- **Too big.** If the open topic has run past about 4 pages and a clearly new idea begins, start the new topic there.
- **Too small.** A paragraph that only adds a detail to the idea before it is not a topic. Do not start one there.
- **Headings.** A new section heading often marks a new topic, but a heading for a sub-detail (a step, a case, a type) does not. Never copy the book's chapter or unit cuts.
- **Guide line.** Use the guide line's expected number of starts as a sanity check, not a quota.

### Step 4: Name each new topic

- **title**: 2 to 6 words, a noun phrase a teacher would write on the board, in the book's own terms, such as "Refraction through a glass slab". No numbers, no "Chapter", no "Introduction to".
- **description**: one or two plain sentences a student would understand, starting with a verb: "Explains …", "Shows …", "Compares …".
- **objective**: one sentence, "Students can …", that a short quiz could test.

## Consistency rules

- Decide from the roles and ideas you wrote in Step 1, not from the writing style.
- When in doubt between starting a topic and carrying one on, carry it on.
- Never go back. Topics only start at new units, in order.

## Your answer

Answer with one JSON object, filling its fields in this order:

- `units`: one entry per new unit, in order: `{ "unit": "u012", "role": "concept", "idea": "refraction through glass" }` (Step 1).
- `starts`: one entry per new topic or skip segment, in order: `{ "unit": "u014", "kind": "teaching", "title": "…", "description": "…", "objective": "Students can …" }` (Steps 2 to 4). An empty list when the open topic carries on.

When you are asked to split one topic that came out too long, apply the same four steps to its units as one window, and include a start at its first unit.
