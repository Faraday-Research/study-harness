---
name: edu-v2-material-design
description: The look of an edu-v2 concept page and its pictures in The Mentor's design system - Poppins type, teal and neutral colour tokens (light and dark), spacing between sections and sub-sections, and how each component looks. Given as a reference to the scene and page steps.
---
# edu-v2-material-design

How the concept page and its pictures look. This skill owns appearance only: fonts, colours, spacing and how each part is styled. What is on the page and in what order is `edu-v2-content-presentation`. The page contract, layers and drawing geometry are `edu-v2-layout-and-drawing`. When those skills name a part (a figure, a tile, a layer), style it as described here.

The page lives inside The Mentor app, so it uses the app's design system: clean, flat and light. A near-white page, white cards with 1px borders and 8px corners, one teal colour for actions, and Poppins for every word. No shadows. Depth comes from borders, spacing and the pale teal tint.

## 1. Tokens
Put these on `:root`, with the dark values in a `@media (prefers-color-scheme: dark)` block guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. Use only these tokens in the CSS, the SVGs and the canvas. Never write a raw hex colour, px font size or font name anywhere else.

**Colours** (light / dark)
| Token | Light | Dark | Use for |
|---|---|---|---|
| `--color-primary` | #0c817b | #3fb8b0 | Buttons, links, active tab, progress, eyebrow tags, layer rule, focus ring |
| `--color-primary-hover` | #0a6b66 | #5cc8c1 | Hover on primary |
| `--color-on-primary` | #ffffff | #0f1716 | Text on primary |
| `--color-primary-subtle` | #e3f5f2 | #15302e | Selected tile, open layer background tint, demo-state highlight |
| `--color-border-selected` | #b8deda | #2a5a56 | Outline of a selected tile |
| `--color-background` | #fafafa | #121414 | Page background and sticky header |
| `--color-surface` | #ffffff | #1b1e1e | Cards: figures, Doors, exercises, story player |
| `--color-surface-muted` | #f8f8f8 | #202424 | Tiles, inputs, answer areas |
| `--color-border` | #ebebeb | #2c3130 | Card outlines, dividers between sections, graph grid |
| `--color-border-strong` | #bebebe | #4a504f | Inputs, slider tracks |
| `--color-text` | #242424 | #f2f2f2 | Headings and reading text |
| `--color-text-secondary` | #505050 | #c4c4c4 | Tabs, captions |
| `--color-text-supporting` | #5b6470 | #a9b1bc | Epigraph, hints, labels in pictures, axis ticks |
| `--color-text-muted` | #a1a1a1 | #8a8a8a | Metadata only (chapter number, "not yet" status). Never for reading text |
| `--color-success` | #2f7a4a | #6fbf85 | "Yes." verdicts, "linked", "secure" |
| `--color-warning` | #9a6412 | #e0b05a | "Not yet." verdicts, "shaky" |
| `--color-lesson-purple` | #6d27d9 | #9a6bf0 | The Explorer layer rule and tag |
| `--color-lesson-blue` | #3b6fe1 | #7fa3f0 | The Builder layer rule and tag |

Quantity colours `--q-<id>` come from the colour map, light and dark, and are defined on `:root` with the rest.

**Illustration palette** (light / dark). Only for the pictures (scene, hero, Doors), never for the interface. Define these on `:root` with the rest; the pictures use them as `var(--illus-…)`. People keep the same colours in dark mode; the surroundings get darker.
| Token | Light | Dark | Use for |
|---|---|---|---|
| `--illus-skin-1` … `--illus-skin-5` | #f8d7bd, #e8b48c, #c98a5e, #9a6240, #66402a | same | Skin tones, light to deep. Pick one per person, with variety across the cast |
| `--illus-skin-shade` | rgba(120,60,30,0.18) | same | Shade on skin (neck, under the hair, inner arm) |
| `--illus-hair-1` … `--illus-hair-4` | #231c1a, #4a3324, #8a5a35, #b8b2ab | same | Black, dark brown, light brown, grey |
| `--illus-cloth-1` … `--illus-cloth-6` | #0c817b, #3b6fe1, #6d27d9, #e2725b, #e9b949, #2f3e5c | #2a9a93, #5a86e8, #8752e0, #e0806b, #e6c065, #3d4e70 | Clothes, bags, signature items |
| `--illus-sky` | #e4f3f2 | #1d2d30 | Sky and far background |
| `--illus-far` | #cfe5df | #233832 | Far hills, far buildings |
| `--illus-wall` | #f1e6d6 | #3a332b | Walls, building fronts |
| `--illus-ground` | #e8dcc6 | #352f27 | Floors, paths, ground |
| `--illus-grass` | #b7d79a | #34502f | Grass |
| `--illus-leaf` / `--illus-leaf-dark` | #79b46e / #4d8a55 | #3f6e45 / #2d5133 | Trees and plants |
| `--illus-wood` / `--illus-wood-dark` | #c38f5c / #8f6038 | #8a6440 / #5f4229 | Wood: tables, stalls, carts, doors |
| `--illus-metal` | #b9c3ca | #5d676e | Metal, tools, vehicles |
| `--illus-water` | #8fcbe0 | #2f5d6e | Water, glass |
| `--illus-white` | #ffffff | #e9ecec | Eye whites, paper, highlights on objects |
| `--illus-line` | #2a2523 | #151312 | Pupils, eyebrows, mouths and small details only, never full outlines |
| `--illus-shade` | rgba(36,36,36,0.12) | rgba(0,0,0,0.28) | Shade shapes and the soft ground shadow under people and objects |
| `--illus-light` | rgba(255,255,255,0.45) | rgba(255,255,255,0.10) | Highlight shapes |
The UI tokens (`--color-primary`, `--color-primary-subtle`) and the quantity colours `--q-<id>` may also be used in a picture, for the thing the concept is about.

**Type**
- `--font-body: 'Poppins', system-ui, -apple-system, sans-serif`. Poppins for everything: reading text, headings, buttons, numbers, equations, canvas labels. No other font family, no serif and no monospace.
- The app supplies Poppins (weights 400, 500 and 600). Do not add `<link>` tags or `@font-face` for fonts. The lesson frame blocks font downloads.
- Weights: 400 for reading text, 500 for labels and meta, 600 for headings, buttons, tags and numbers. Never 700. No italics: Poppins italic isn't available, so style `em` as `font-style: normal; font-weight: 600`.
- Letter spacing 0. Numbers, readouts and equations use `font-variant-numeric: tabular-nums` and always show their unit.

| Size token | Size / line height | Use for |
|---|---|---|
| `--text-xs` | 12px / 16px | Eyebrow tags ("Step 3 of 8", "1 · Foundation"), captions, statuses, axis ticks |
| `--text-sm` | 14px / 18px | Buttons, control labels, readouts, hints, labels in pictures |
| `--text-base` | 16px / 28px | Reading text (the 28px line height is for long-form reading) |
| `--text-lg` | 20px / 24px | h3: sub-section and part headings |
| `--text-xl` | 24px / 32px | h2: stage names and main part headings (Meet, Doors, Summary, Exercises) |
| `--text-2xl` | 32px / 40px | h1: the chapter title |

Headings use `text-wrap: balance`. Reading text stays 16px on phones.

**Spacing:** `--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-6` 24px · `--space-8` 32px · `--space-12` 48px. Use only these.

**Shape:** `--radius-sm` 4px (buttons, inputs) · `--radius-md` 8px (cards, tiles) · `--radius-full` (pills, progress segments, avatars). Borders 1px. No `box-shadow` anywhere on the page. (Shade shapes drawn inside the illustrations are part of the picture and are fine.)

## 2. Spacing between sections and sub-sections
Spacing is what shows the reader how the page is built. The bigger the step in the page's structure, the bigger the gap. Every part starts with its own heading or tag, so the reader always sees where a new part begins.

| Between | Gap | And |
|---|---|---|
| Main parts of the page (title block, Meet, Doors, each stage, Check, Summary, Exercises) | `--space-12` (48px) | Every stage after the first gets a 1px `--color-border` top border, with `--space-12` padding above its head |
| A part's eyebrow tag and its heading | `--space-2` | |
| A heading and the content under it | `--space-6` | |
| Sub-sections inside a stage (Foundation, Builder, Explorer) | `--space-8` | Each starts with its tag ("1 · Foundation") |
| Paragraphs | `--space-4` | |
| Text and a figure, tile group, card or story player | `--space-6` above and below | |
| Items in a group (tiles, Doors cards, controls, exercises) | `--space-3` to `--space-4` | Use a grid or flex `gap`, not margins on each item |
| Inside a card | `--space-4` padding | `--space-6` on screens 768px and wider |
| The closing parts of a stage (Where you stand, Back to the three things) | `--space-8` after the last sub-section | |

Rules:
- Never put two blocks right against each other. Every block has a gap from the scale above, and the gap between blocks is never less than `--space-2`.
- Gaps grow with the structure: within a group < between paragraphs < between sub-sections < between stages and main parts. Never use a bigger gap inside a sub-section than between sub-sections.
- Set vertical rhythm with `gap` on flex or grid parents, or `margin-block-start` on the following block. Don't use both on the same element, and don't rely on collapsing margins.
- The same kind of gap is the same size everywhere on the page.
- On phones (under 640px), the 48px gaps become `--space-8` and the 32px gaps become `--space-6`. Smaller gaps stay the same.

## 3. Page frame
- Body: `--color-background`, `--color-text`, `--font-body`, 16/28, weight 400.
- Page container: the page sits in a wide frame inside the app, next to its sidebar, so use the frame's width. `main.book` fills the frame up to `max-width: 75rem` (1200px), with `--space-8` (32px) side padding (`--space-4` under 640px, with safe-area `max()`) and padding-block `--space-8` then `--space-12`. It is not centred in a narrow column, and the content is left-aligned.
- Line length: only running text is capped. Paragraphs, lists, the epigraph, story lines and verdict lines get `max-width: 46rem` (about 75 characters per line), left-aligned at the container's edge. Headings may run up to the container width.
- Full width: sim figures, the Doors row, tile groups, the story player, exercise cards and the summary's "what stuck" list use the whole container width. Pictures (the hero and the Meet scene) are capped at `46rem` so they don't grow too tall.
- Don't leave a wide empty band on either side: on a 1300px frame, cards and figures should reach both side paddings.
- Sticky header: `--color-background` with a 1px `--color-border` bottom edge, `--space-3` vertical padding. Course title 14px weight 600. Level tabs are pills: 14px weight 600, `--color-text-secondary`; the active tab is `--color-primary-subtle` fill with `--color-primary` text. The Book/Split toggle uses the same pill style.
- Progress: 8 segments, 4px tall, `--radius-full`, `--space-1` apart. Empty segments are `--color-border` and passed ones are `--color-primary`.
- Split view: the demo pane is a `--color-surface` card. The text pane keeps the same type, spacing and line-length cap as the book.

## 4. Components
- **Title block.** The chapter number "Chapter N · Artifact M" as a 12px weight-500 `--color-text-muted` tag, then the h1. The epigraph is `--color-text-supporting` with a 2px `--color-border` left rule and `--space-4` left padding. Its source sits on its own line, 14px, after an em dash.
- **Hero picture** (`figure.hero`, filled in by the harness). A card with 1px `--color-border`, `--radius-md`, `overflow: hidden` and no padding, so the illustration runs to the card's edges. At most `46rem` wide. The SVG is `display: block; width: 100%; height: auto`.
- **Eyebrow tags.** "Step N of 8" and part tags: 12px weight 600 `--color-primary`. Sub-section tags ("1 · Foundation", "2 · Builder", "3 · Explorer"): 12px weight 600 `--color-text-supporting`, with a 6px dot in the tier's colour (Foundation `--color-primary`, Builder `--color-lesson-blue`, Explorer `--color-lesson-purple`).
- **Sim figure** (`figure.sim`). A `--color-surface` card: 1px `--color-border`, `--radius-md`, `--space-4` padding, no shadow. Graph and runs on the left. The graph takes the remaining width. The controls sit in one column on the right (200 to 260px wide on wide frames, 128px on phones), never below the graph, with `--space-4` between controls. Each control is a label (14px weight 500), its value (14px weight 600, tabular, with the unit), then the slider. Slider track `--color-border-strong`, thumb and filled part `--color-primary`. The run button is at the bottom of the column. Caption below the card: "**Fig. 1.1**" in weight 600, then the caption text, 12px `--color-text-secondary`, `--space-2` above.
- **Readouts.** 14px weight 600 tabular, in the quantity's colour, with the unit in `--color-text-supporting`.
- **Demo-state highlight.** Controls flagged by `setDemoState` get a 1px dashed `--color-primary` outline, offset 4px, `--radius-sm`.
- **Quantity terms** (`span.q.<id>[data-q]`). The quantity's colour, weight 500, 1.5px dotted underline in the same colour. Hover or tap highlights the same quantity in the figure. Use that colour for the quantity in controls, readouts and graph axes too.
- **Buttons.** Primary ("Lock my guess", "Check", "Run", "Next line"): `--color-primary` fill, `--color-on-primary` text, 14px weight 600, 8px by 16px padding, `--radius-sm`, at least 44px tall on touch screens, `--color-primary-hover` on hover. Secondary ("Clear runs", "Hide demo"): transparent, 1px `--color-border-strong`, `--color-text` text, same size. Disabled: `--color-border` fill and border, `--color-border-strong` text.
- **Layer opener** ("+ Go deeper: Builder"). An outlined pill: transparent, 1px border and text in the tier's colour, 14px weight 600, `--radius-full`, 8px by 16px padding.
- **Layers** (`.layer[data-tier]`). A 2px left rule in the tier's colour (Builder `--color-lesson-blue`, Explorer `--color-lesson-purple`), `--space-4` left padding, `--space-8` above. When open, a "New at Builder" tag in the tier's colour sits at the top.
- **Predict and Check tiles.** `--color-surface-muted` fill, 1px `--color-border`, `--radius-md`, min height 56px, `--space-3` padding, `--space-3` gap between tiles, text or a small line picture. Hover: `--color-border-strong` border. Selected: `--color-primary-subtle` fill and `--color-border-selected` border. Locked tiles keep their look at reduced opacity (0.6), except the chosen one.
- **Verdict line.** After the button, `--space-4` above: a 3px left rule and `--space-3` left padding. "**Yes.**" in weight 600 `--color-success` (and a `--color-success` rule), or "**Not yet.**" in weight 600 `--color-warning` (and a `--color-warning` rule), then the why or a nudge back to the figure in `--color-text`. Never `--color-danger`, red, crosses, points, streaks or timers.
- **Runs on the graph.** The current run is a solid 2px line in its quantity colour. Earlier runs are 1.5px dashed lines in the same colour at 50 percent opacity. "Clear runs" appears only after the first run.
- **Doors.** Three `--color-surface` cards in a row across the full container width (`grid-template-columns: repeat(3, 1fr)`; one column on phones), `--space-4` gap, `--space-4` padding. Each card starts with its picture (the Door's placeholder, filled in by the harness) running to the card's top and side edges, `--radius-md` on its top corners, then the label (14px weight 600) and a 12px status: "not yet" in `--color-text-muted` or "linked" in `--color-success`.
- **Meet.** Cast introductions as a list with `--space-4` between people. Each name is weight 600. The scene picture (`figure.scene`, filled in by the harness) is a card like the hero, at most `46rem` wide.
- **Story player.** A `--color-surface` card with its tag ("Builder · chapter 2") at the top, lines as paragraphs `--space-3` apart, and the "Next line" button right-aligned at the bottom, `--space-4` above.
- **Summary and "what stuck".** The summary is plain reading text. "What stuck" is a list of rows with a 12px weight-600 pill: "secure" (`--color-success` text on `--color-surface-muted`), "shaky" (`--color-warning`), "gap" (`--color-text-supporting`). No scores.
- **Exercises.** Each exercise is a `--color-surface` card, `--space-4` apart. The answer area is a `--color-surface-muted` input with a 1px `--color-border-strong` border and `--radius-sm`. Hints are `details` with a ▸ marker, the summary 14px weight 600 `--color-primary`, and the body 14px `--color-text-supporting`.
- **Next link.** Right-aligned, 14px weight 600 `--color-primary`, "Next: … ▸".
- **Links.** `--color-primary`, underline on hover.
- **Focus.** Every interactive element has a visible focus ring: `outline: 2px solid var(--color-primary); outline-offset: 2px`.
- **Motion.** 120ms for hover and 200ms for opening a layer. Turn them off under `prefers-reduced-motion`.

## 5. Pictures
**Illustration style (scene, hero and Door pictures)**
Flat vector illustration, like a well-made modern learning app or picture book: filled shapes in soft, warm colours, layered to give depth. Pictures should feel crafted and alive, never like a diagram, clip art or a sketch.

- **Filled shapes, not outlines.** Every object is built from filled shapes in the illustration palette. No stroke outlines around shapes. `--illus-line` is only for small details (pupils, eyebrows, mouths, seams, window frames), at 1 to 2px.
- **Three tones per object.** A base colour, a shade shape (`--illus-shade`, on the side away from the light, which comes from the top left) and a small highlight (`--illus-light`) where useful. A soft ellipse of `--illus-shade` grounds every person and standing object.
- **Depth in layers, drawn back to front.** Background: sky (`--illus-sky`, a gentle `linearGradient` is allowed here only) and far shapes (`--illus-far`: hills, rooftops, trees as simple silhouettes). Middle ground: the place and its things. Foreground: the characters and the one thing the story is about. Things further away are smaller, paler and less detailed.
- **Composition.** A clear focal point on the main character and the key thing. Place them on a third (around x 210 or x 430 in the scene), facing into the picture. Leave some calm space. A ground line around 75 to 80 percent of the height. Nothing floats: everything stands on the ground or hangs from something.
- **People.** Build each person from shapes in their own `<g>` (`<g id="kavya">`):
  - Proportions: about 6 heads tall for teenagers and 7 for adults. In the scene a standing person is about 150 to 180 units tall.
  - Head: a rounded face shape, ears, hair as its own shape with a clear style (fringe, parting, bun, curls) and a darker underside, a neck with `--illus-skin-shade`.
  - Face: eyes as small `--illus-line` ellipses with a tiny `--illus-white` glint, eyebrows that match the expression, a small nose hint, and a mouth that shows the expression from the brief (smile, open in surprise, pressed in thought).
  - Body: clothes with a collar, sleeves and a hem in an `--illus-cloth-…` colour, plus the person's signature item from their appearance. Arms bent at the elbow in the brief's pose, rounded hands, legs and shoes. Pose them doing something: pointing, holding, leaning, reaching.
  - Each person has a different silhouette, skin tone, hair and clothing colour. Draw people with warmth and respect: no caricature, no stereotype props.
- **Props and place.** Every thing from the brief gets real detail: a stall with an awning (stripes), a counter, goods on it and a price board; a bus with windows, wheels and doors. Three to eight shapes per object, with shade and highlight.
- **Detail budget.** About 80 to 200 shapes for the scene, 50 to 150 for the hero and 15 to 50 for each Door picture. Use `<defs>` with `<use href="#…">` for repeated things (people in a queue, seats, trees), changing their colours or sizes so they don't look copied.
- **Avoid.** Stick figures. Faceless heads or dots for faces. Plain labelled rectangles standing in for objects. Outline-only drawings. Everything at the same size on one line. Empty white backgrounds. Text inside the picture other than the labels below.
- **Labels** (scene only). Name the cast and the three or four place things, nothing else. A label is a small pill: a `rect` with `rx="10"`, `fill="var(--color-surface)"`, 1px `stroke="var(--color-border)"`, holding 12px `font-family="Poppins, sans-serif"`, weight 500, `fill="var(--color-text)"` text, beside the thing (a short `--color-text-supporting` leader line if it can't sit right next to it). Labels never cover a face or overlap each other. The hero and the Door pictures have no text at all.
- **Door pictures.** A before panel and an after panel side by side, with a small arrow between them, each showing the plan's visible count of things (for example six riders on a bus, then two). Same viewpoint and setting in both panels, so only the count and what changes differ. Simple background (sky or wall plus ground).
- **Hero.** A wide opening picture of the place with the main character in it, mid-action, as the hero brief describes. It sets the mood of the story. No labels.
- Colours only as `var(--token)` from section 1. No hex colours in a picture.

**Canvas graphs**
- Read every colour from the CSS tokens at draw time, and redraw on theme change.
- Fonts: `'500 12px Poppins, system-ui, sans-serif'` for ticks, labels and readouts, and `'600 12px Poppins, system-ui, sans-serif'` for axis titles.
- Axes and ticks in `--color-text-supporting`, grid lines in `--color-border`, a quantity's line, arrow, mark and axis title in its `--q-<id>`.
- Leave `--space-2` of padding inside the plot area so marks and labels never touch the edge.

## 6. Check before you reply
- Poppins is the only font, and the page has no font `<link>` or `@font-face`.
- Every colour, size, gap and radius is a token. No hex colours outside the `:root` token blocks, and no shadows.
- Teal (`--color-primary`) is used only on interactive things, tags, progress and the focus ring, never as a large background.
- Main parts and stages are 48px apart with a divider between stages, sub-sections are 32px apart, and no two blocks touch.
- The container uses the frame's width (up to 1200px) and is left-aligned. Only running text is capped at 46rem.
- Figures, Doors, exercises and the story player are bordered cards at full container width. Tiles and buttons match section 4.
- The `--illus-…` palette is defined on `:root` in light and dark, so the drawn pictures get their colours.
- Quantity colours match between text, controls, readouts and the graph.
