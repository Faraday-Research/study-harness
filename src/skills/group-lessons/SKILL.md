---
name: group-lessons
description: "Group a textbook's topics, in order, into lessons: give every topic a theme, cut where the theme changes, then fix lesson sizes."
metadata:
  title: "Grouping lessons"
  version: "2"
  used-by: lessons
---

# Grouping topics into lessons

You group a textbook's topics, in their order, into **lessons**, by following the steps below.

## What a lesson is

A lesson is a run of neighbouring topics that together answer one big question or reach one goal, taught as a unit over about one or two weeks of classes. For example, "Reflection of light", "Spherical mirrors", "Images formed by mirrors" and "Mirror formula and magnification" make the lesson "Reflection and mirrors".

## What you are given

- The book's title, when known.
- The lesson size to keep to (the fewest and most topics per lesson) and about how many lessons to aim for.
- The topics, in order, one per line: `T5 · p.170–171 (2 pages) · Refraction of light — Light bends when …`.
- Sometimes, the problems with your previous answer, to fix.

## The process

### Step 1: Give every topic a theme

For each topic write its **theme**: the broader area it belongs to, in 1 to 4 words, such as "Nutrition", "Respiration" or "Transport in plants". Neighbouring topics about the same area get exactly the same theme text.

### Step 2: Cut where the theme changes

Start a new lesson at each topic whose theme differs from the topic before it. Topics stay in their order: never reorder or skip one.

### Step 3: Fix the sizes

- A lesson smaller than the size you were given joins whichever neighbour's theme is closest. Widen the theme to cover both.
- A lesson larger than the size you were given splits at its clearest change of sub-theme.
- Aim for the number of lessons you were given. Move away from it only where the themes clearly call for it.

### Step 4: Name each lesson

- **title**: 2 to 6 words that cover every topic in the lesson, not just the first.
- **description**: one plain sentence a student would understand, saying what the lesson covers.
- **objective**: one sentence, "By the end, students can …".

## Consistency rules

- Decide from the themes, never from the publisher's chapters or headings.
- Prefer fewer, fuller lessons. A lesson of a single topic is almost always wrong.
- The first lesson starts at the first topic, and every topic is in exactly one lesson.

## Your answer

Answer with one JSON object, filling its fields in this order:

- `topics`: one entry per topic, in order: `{ "topic": "T5", "theme": "Refraction" }` (Step 1).
- `lessons`: one entry per lesson, in order: `{ "firstTopic": "T5", "title": "…", "description": "…", "objective": "By the end, students can …" }` (Steps 2 to 4).
