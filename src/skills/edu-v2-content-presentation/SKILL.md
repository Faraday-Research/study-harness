---
name: edu-v2-content-presentation
description: Assemble the concept page in the Eloquent Lab design - book column with inline sim figures (default) or split view, predict/check, summary and exercises - from every earlier edu-v2 output.
max_output_tokens: 32000
---
# edu-v2-content-presentation

Assemble the final page for one concept in the **Eloquent Lab** design: Eloquent JavaScript's book typography and structure, with Brilliant's commit-then-check moments inside the prose. Plain words first, a picture or metaphor before the formula, short blocks.

## 1. Inputs
`<concept_plan>`, `<story_arc>`, `<cast_scene>`, `<demo_spec>`, `<copy>` (Foundation copy), `<stories>` (Builder and Explorer chapter stories), `<colour_map>`, `<artifact>` (the ARTIFACT declaration values) and `<track>`. The page contract and drawing rules are in `edu-v2-layout-and-drawing` (below). Voice is `edu-v2-story-and-scene`.

- Use the copy and stories word for word. Do not rewrite them. `*term*` in the copy becomes `<em>term</em>`.
- The scene picture is already drawn. Where the Meet section's scene picture goes, write exactly `<!--SCENE-->` on its own line; the harness puts the SVG there. Do not draw the scene yourself.
- Build the figure's model from the demo spec, honestly. All figures are views of one shared state.

## 2. Layout
- **Book (default).** One column, `max-width: 35em`, centred, padding-block 2em 5em. Sims are `figure.sim` inline in the text, numbered "Fig. 1.1". At 1150 px and up a figure may extend 3em past each side, except inside a layer.
- **Split (toggle in the header, 900 px and up).** Demo pane 55 percent, sticky under the header. Text 45 percent at 18 px, max 32em. Switching moves the same figure nodes (comment placeholders mark their home), so no state is copied or lost.
- **Phone split (below 900 px).** Demo sticky on top, at most 52vh, a "Hide demo" handle, two-column compact controls, no caption, shorter canvas. The text scrolls underneath.
- Header: course title (hidden under 600 px), level tabs, Book/Split, and an 8-segment progress bar that fills when a stage is passed, not when scrolled.
- 16 px gutters with safe-area `max()`, 44 px touch targets, no horizontal scroll.

## 2a. Design system (Eloquent Lab)
**Type**
- Reading text: `Georgia, 'Nimbus Roman No9 L', 'Century Schoolbook L', serif`, 20px, line-height 1.45; 18px under 600 px. Never sans for running text.
- Headings h1 to h3 only: Cinzel 700, letter-spacing 2px, sizes 130 / 115 / 100 percent, `text-wrap: balance`. Never Cinzel on buttons, labels or under 16 px.
- Numbers, readouts, equations, stage tags: PT Mono, tabular figures, units always shown.
- Load Cinzel 700 and PT Mono from Google Fonts (`<link>` to fonts.googleapis.com) with the fallbacks above.

**Colour tokens** (light / dark)
`--paper #fff / #161718`, `--ink #000 / #e8e6e1`, `--ink-2 #333 / #c9c7c2`, `--muted #6b6b6b / #9b9b98`, `--faint #aaa / #66686a`, `--rule #e3e3e3 / #2c2e30`, `--link #467 / #8fb7c5`, `--sand #4ab / #4fb9c9` (the only interface colour), `--sand-ink #24808f / #6cc6d3`, `--solution #156 / #86bccb`, `--tile #f5f7f7 / #1d1f21`, `--ok #1a7f4b / #4cc285`, `--notyet #a85f0a / #e2a24c`. Quantity colours `--q-<id>` come from the colour map, light and dark.

**Book furniture**
- Chapter number above the h1: 60 percent, `--faint`, "Chapter N · Artifact M". Nav ◂ ● ▸ top right, 80 percent, `--faint`.
- Epigraph: the copy's epigraph, 85 percent, `--ink-2`, indented 3em, curly quotes by CSS, em-dash footer with an italic `cite`.
- Hero: ink-line SVG (viewBox 640x170, currentColor strokes, solid fills only as accents) in a circle with `4px double var(--muted)`, max 75 percent wide.
- Paragraph ¶ on hover at the right margin, desktop only.

**Components**
- Sim figure: no card, no shadow, no radius. Only a 1px `--sand` hairline above and below, caption `<b>Fig. 1.1</b>` in small caps.
- Figure inner layout: graph and runs on the left, the controls stacked vertically in one column on the right (about 130 to 200 px wide, 128 px on phones), never below the graph. Each control is label, value, then slider. The run button sits at the bottom of that column.
- Stage head: PT Mono 13px tag "Step N of 8" in `--faint`, then Cinzel h2 with the stage name.
- Quantity term `span.q.<id>[data-q]`: quantity colour, 1.5px dotted underline. Hover or tap highlights the same quantity in the figure. Use the same colour for that quantity in controls, readouts and graph axes.
- Predict and Check: tiles (min 56 px, `--tile` fill, radius 10, text or a small line picture), one black pill button ("Lock my guess", "Check"), then a verdict line with a 3px left rule: **Yes.** in `--ok` or **Not yet.** in `--notyet`, followed by the why, or a nudge back to the figure. Lock tiles after a right answer. Never red, crosses, points, streaks or timers.
- Lock note: one `--notyet` line under the figure ("Make your guess in step 2 first.").
- Run controls: "Clear runs" appears only after the first run. Earlier runs stay as faint dashed marks.
- Stage sub-sections: every stage with layers is three sub-sections in fixed order, each with a mono tag: "1 · Foundation", "2 · Builder", "3 · Explorer". Foundation is always shown. Builder and Explorer are layers (2px `--sand` left rule) that open in that order, each below the one before. Anything that closes a stage and is not a tier (Where you stand, Back to the three things) comes after the three sub-sections. Opener: outlined `--sand` pill "+ Go deeper: Builder".
- Doors: three `--tile` cards, 120×76 line picture drawn from the plan's picture spec (no text inside the picture), label, mono status "not yet" or "linked" (`--ok`).
- Exercises: answer area between two `--sand` hairlines; hints are `details` with a ▸ marker, body in `--solution`.

## 3. Page order
1. Header: course title, level tabs, Book/Split, progress.
2. Chapter number and h1 (the copy's title), epigraph, hero figure.
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
- The text column is the narration of the eight stages. It carries no notes about the page itself and no explainer side notes. Keep only a note that explains a lock.

## 5. Linking text to the demo
Use IntersectionObserver (root margin about -45% / -50%). When a stage enters view, call `setDemoState(id)` for its `data-demo-state`. This flags the relevant controls with a dashed `--sand` outline and prepares highlights. It never resets the student's runs, prediction or answers. It works the same in Book and Split. The level tab follows the scroll. Quantity terms in the text light up their quantity in the figure.

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
- Georgia body, Cinzel only on headings, teal (`--sand`) only on interactive things, no cards or shadows around sims, quantity colours match between text and figure.
- Each stage reads Foundation, Builder, Explorer in order. Equations only inside Explorer layers.
- The three chapter stories pick up from each other, use the same two characters and end in their handoffs.

## 10. Output
Reply with only the page inside `<page>` tags: a `<title>`, the meta tag, `<link>` and `<style>` tags, the body content and one `<script>`. No doctype, html, head or body tags. No text outside the tags, no ``` fences.
