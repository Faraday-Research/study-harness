---
name: find-prerequisites
description: "Name the concepts each topic of a textbook introduces and needs, so code can work out which topics and lessons have to come first."
metadata:
  title: "Finding prerequisites"
  version: "1"
  used-by: prerequisites
---

# Finding prerequisites

You read a textbook's topics, in order, and name the **concepts** each one introduces and the concepts it needs. Code then links every topic to the earlier topics it can't be followed without. You never link topics yourself: your job is to name the concepts well and consistently.

## What a concept is

A concept is one idea a student learns and uses again later: a term, a quantity, a law, a process or a skill, such as "focal length", "laws of reflection" or "balancing a chemical equation". Name it as a short noun phrase of 1 to 5 words, in lower case, in the book's own terms.

A concept is not:

- a whole topic or its title (too big);
- an example, an activity, a figure or a page (not something to learn);
- everyday knowledge every student has, unless the book teaches it.

## What you are given

- The book's title, when known.
- Sometimes, "Concepts named so far": the concepts earlier topics introduced, from earlier parts of the book.
- The topics, in book order. Each has its id, pages, lesson and theme, then its title and description, its objective, and the ideas found in its text.

## The process

Go topic by topic, in order, and follow these three steps for each.

### Step 1: What the topic introduces

List up to 6 concepts the topic teaches **for the first time**: the ones its objective and ideas are about. If an earlier topic already introduced a concept and this topic only uses or extends it, don't list it again.

### Step 2: What the topic needs

List up to 6 concepts a student must **already understand** to follow this topic: the ones it builds on, not the ones it only mentions in passing. A concept the topic introduces itself is never one of its needs. A need can come from an earlier topic in this book, or from earlier grades.

### Step 3: Reuse the names

When a need was introduced by an earlier topic, in this list or under "Concepts named so far", write it **exactly** as it was named there. Give each concept one name throughout.

## Consistency rules

- Decide from the topic's objective, description and ideas, not from its position in the book.
- Fewer, sharper needs are better than many loose ones. When in doubt, leave a need out.
- Answer for every topic you are given, in order, and never invent a topic id.

## Your answer

Answer with one JSON object:

- `topics`: one entry per topic, in order: `{ "topic": "T4", "introduces": ["mirror formula", "magnification", "sign convention"], "needs": ["focal length", "real image"] }` (Steps 1 to 3). Lists may be empty.
