---
name: edu-v2-content-presentation
description: Assemble the concept page - book column with inline sim figures (default) or split view, predict/check, summary and exercises - from every earlier edu-v2 output.
max_output_tokens: 32000
---
# edu-v2-content-presentation

Assemble the final page for one concept: a book-like reading column with commit-then-check moments inside the text. Plain words first, a picture or metaphor before the formula, short blocks.

## 1. Inputs
`<concept_plan>`, `<story_arc>`, `<cast_scene>`, `<demo_spec>`, `<copy>` (Foundation copy), `<stories>` (Builder and Explorer chapter stories), `<colour_map>`, `<artifact>` (the ARTIFACT declaration values) and `<track>`. The page contract and drawing rules are in `edu-v2-layout-and-drawing`, and the look (fonts, colours, spacing, components) is in `edu-v2-material-design` (both below). Voice is `edu-v2-story-and-scene`.

- Use the copy and stories word for word. Do not rewrite them. `*term*` in the copy becomes `<em>term</em>`.
- The pictures are already drawn. Write a placeholder on its own line where each goes, and the harness puts the drawn SVG there. Do not draw the scene, the hero or the Door pictures yourself.
  - `<!--HERO-->` where the hero picture goes (the harness wraps it in `figure.hero`).
  - `<!--SCENE-->` where the Meet section's scene picture goes (wrapped in `figure.scene`).
  - `<!--DOOR:door-1-->` at the top of each Door's card, with that door's id from the plan.
- Build the figure's model from the demo spec, honestly. All figures are views of one shared state.

## 2. Layout
- **Book (default).** One wide, left-aligned column that uses the frame's width (widths in `edu-v2-material-design` section 3). Sims are `figure.sim` inline in the text, numbered "Fig. 1.1".
- **Split (toggle in the header, 900 px and up).** Demo pane 55 percent, sticky under the header. Text 45 percent. Switching moves the same figure nodes (comment placeholders mark their home), so no state is copied or lost.
- **Phone split (below 900 px).** Demo sticky on top, at most 52vh, a "Hide demo" handle, two-column compact controls, no caption, shorter canvas. The text scrolls underneath.
- Header: course title (hidden under 600 px), level tabs, Book/Split, and an 8-segment progress bar that fills when a stage is passed, not when scrolled.
- 16 px gutters with safe-area `max()`, 44 px touch targets, no horizontal scroll.

## 2a. Look
Style every part of the page as `edu-v2-material-design` says: its tokens, type, spacing between sections and sub-sections, and components. This skill says what goes on the page and in what order, not how it looks.

The parts named below that skill styles: the title block (chapter number, h1, epigraph, hero), stage heads ("Step N of 8" tag and the stage name as h2), sub-section tags ("1 · Foundation", "2 · Builder", "3 · Explorer"), `figure.sim`, quantity terms `span.q.<id>[data-q]`, Predict and Check tiles with their button and verdict line (**Yes.** or **Not yet.**), run controls, layers and their "+ Go deeper" openers, Doors cards, the story player, "what stuck" and exercises.

Behaviour that goes with those parts:
- Figure inner layout: graph and runs on the left, the controls in one column on the right, never below the graph. Each control is label, value, then slider. The run button sits at the bottom of that column.
- Quantity terms: hover or tap highlights the same quantity in the figure.
- Predict and Check: tiles, one button ("Lock my guess", "Check"), then the verdict followed by the why, or a nudge back to the figure. Lock tiles after a right answer.
- The figure is always live: its controls, run button and readouts work from page load, before any guess, at every level. Never put `disabled` on a figure control and never disable one until a guess is made (the student would see a dead figure). The guess only gates the comparison: after a guess is locked, each run shows "You guessed … / You saw …". Without a guess, runs still work, and one `--notyet` line under the figure invites one ("Make a guess in step 2 to compare it with your runs.").
- Run controls: "Clear runs" appears only after the first run. Earlier runs stay on the graph as faint dashed lines.
- Stage sub-sections: every stage with layers is three sub-sections in fixed order (Foundation, Builder, Explorer). Foundation is always shown. Builder and Explorer are layers that open in that order, each below the one before. Anything that closes a stage and is not a tier (Where you stand, Back to the three things) comes after the three sub-sections.
- Doors: one card per door, each with its picture placeholder, a label and a status "not yet" or "linked".
- Exercises: an answer area and hints as `details`.

## 3. Page order
1. Header: course title, level tabs, Book/Split, progress.
2. Chapter number and h1 (the copy's title), epigraph, `<!--HERO-->`.
3. Meet: cast, place, `<!--SCENE-->`.
4. Doors, part 1.
5. Eight stages as `section.stage` blocks, each with `data-stage` (hook, predict, play, notice, name, break, transfer, check) and `data-demo-state` (the demo spec state id), each split into the three ordered sub-sections above. In Book layout the sim figure sits in Play; Builder figures sit inside their layer.
6. Check, then Back to the three things.
7. Summary, then a "what stuck" list (secure / shaky / gap, computed from the student's answers by the platform's gap-status rules), then exercises, then a right-aligned "Next: … ▸" link.

## 3a. Story chapters, handoffs and editable words
- **Foundation story.** The hook story and the eight beats, from the copy.
- **Builder chapter story.** At the top of the first Builder layer (the Predict stage), under a mono tag "Builder · chapter 2", before any Builder control.
- **Explorer chapter story.** At the top of the first Explorer layer, under the tag "Explorer · chapter 3".
- **Handoffs.** `toBuilder` closes the Foundation check, `toExplorer` closes the Builder check layer.
- Chapter stories show a few lines at a time in a story player ("Next line" button; all lines stay in the DOM).
- The page header shows only the chapter title. No build notes, no pipeline or skill names and no status text appear on the page.
- Every word from the copy and stories is an element with a `data-path` attribute that names its place in the copy (for example `stages.hook.lines.0`, `stories.builder.lines.0`, `summary`). Never use `data-path` on controls, numbers or readouts.

## 4. Text style
- Say the idea in plain words first. Name it after.
- Metaphor or picture before formula.
- Short blocks, medium sentences.
- The text column is the narration of the eight stages. It carries no notes about the page itself and no explainer side notes. Keep only the note that invites a guess before comparing.

## 5. Linking text to the demo
Use IntersectionObserver (root margin about -45% / -50%). When a stage enters view, call `setDemoState(id)` for its `data-demo-state`. This flags the relevant controls with the demo-state highlight and prepares highlights. It never resets the student's runs, prediction or answers. It works the same in Book and Split. The level tab follows the scroll. Quantity terms in the text light up their quantity in the figure.

## 6. Layers
Foundation is always shown. A "Go deeper" button in the text opens the next tier below. Layers add text below and reveal controls in reserved slots. Nothing above or already placed moves, changes or disappears. Question lists are built once with all tiers in the DOM and deeper tiers closed.

## 7. Summary and exercises
- Summary: the copy's summary. Show the secure, shaky, gap result as "what stuck", with no score or timer.
- Exercises: from the plan. Each has a problem, a place to answer, and hints that start collapsed. At Explorer the first hint asks "What have you tried so far?".

## 8. Script
- One inline `<script>` (no modules, no imports). Start it with the ARTIFACT declaration from `<artifact>`.
- `window.__events = window.__events || []`; `emit(type, data)` pushes `{t, chapter, artifact, track, level, type, ...data}` and calls `parent.postMessage` inside try/catch.
- Every `localStorage` use is inside try/catch.
- The script must parse and must not throw on load.

## 9. Check before you reply
- The page passes the checks in `edu-v2-material-design` section 6 (Poppins only, tokens only, spacing between sections and sub-sections, components as described). Quantity colours match between text and figure.
- Each stage reads Foundation, Builder, Explorer in order. Equations only inside Explorer layers.
- The three chapter stories pick up from each other, use the same two characters and end in their handoffs.

## 10. Output
Reply with only the page inside `<page>` tags: a `<title>`, the meta tag, `<link>` and `<style>` tags, the body content and one `<script>`. No doctype, html, head or body tags. No text outside the tags, no ``` fences.
