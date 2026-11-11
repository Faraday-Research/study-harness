---
name: edu-v2-layout-and-drawing
description: Page contract, level layers, SVG scenes and canvas graphs of an edu-v2 artifact, in book (inline figures) or split-pane layout. Draws the scene SVG; its contract and drawing rules also guide page assembly.
max_output_tokens: 12000
---
# edu-v2-layout-and-drawing

The page contract, the layers and the pictures for one learn-by-doing artifact (Adaptive Teaching Framework v2.3 base). Words are `edu-v2-story-and-scene`. Content is `edu-v2-concept-break-build`. Page assembly is `edu-v2-content-presentation`.

When you are asked to draw the scene (`<task>scene</task>`), you receive `<cast_scene>` (its `scene_svg_brief` and place) and `<colour_map>`. Reply with only one inline SVG inside `<scene_svg>` tags, following section 4. No text outside the tags, no ``` fences.

## 1. Page skeleton
Two variants on one page, switched by `.fp[data-layout="book|split"]` and a Book/Split toggle in the level bar. Book is the default. State is shared, so switching loses nothing.

**Book (inline figures).** One serif column, `max-width: 35em` (Eloquent Lab design), chapter title, table of contents. The simulation appears as `figure.sim` inside the text with a numbered caption. All figures are views of one shared state. Top to bottom:
1. Sticky header: course title, level tabs, progress bar. A one-line level note sits under it.
2. `main.book`: chapter number, h1, hero figure, epigraph.
3. Meet section: cast, place, one scene picture.
4. Doors, part 1: three picture cards from different domains, plus a guess.
5. Eight stages, each `section.stage[data-stage]` with a numbered chip and "Step N of 8" (Hook is "Step 1 of 8 · part 2"): Hook, Predict, Play, Notice, Name, Break, Transfer, Check.
6. Check ends with "Back to the three things" (Doors), summary (secure / shaky / gap), then a link to the next artifact.

**Split pane.** Same order and content. Left: one sticky demo. Right: text blocks with `data-demo-state`. Under 900 px the demo is sticky at the top and collapsible.

No meta notes. No "this page takes ten minutes" asides, no explainer notes under widgets. Keep only notes that explain a lock (for example "Make your guess in step 2 first").

## 2. Levels are layers, not modes
- Tabs read "1 · Foundation", "2 · Builder", "3 · Explorer". The tab follows the scroll position (scroll-spy). A tab click scrolls to the nearest open part of that level.
- Foundation is always visible. Builder and Explorer content is a `.layer` block with `data-tier="builder|explorer"`, closed by default, with a "New at Builder" tag when open.
- A "Go deeper: Builder" button sits before the first layer of that tier in each stage. Explorer's button appears after Builder opens.
- Question lists (Notice, Check, Doors) are built once with all three tiers in the DOM. Deeper tiers stay closed. The button for the next tier appears after the tier above is finished.
- Never re-render or reorder anything above. A new layer only adds below. In the split pane, new controls are revealed in reserved slots on the left and never move or remove existing ones.
- Give every item a unique id of tier plus id. Keep answer state by that id.
- Equations live only in an Explorer layer (`data-equation`). That includes the equation line inside any figure: hide it below Explorer.
- A figure shows only the controls and readouts of the current tier.
- Predict is one widget: pictured choice at all levels, Builder adds a number, Explorer adds confidence and a reason. Locked after commit.

## 3. Artifact page contract
- No doctype, html, head or body tags. A `<title>` of two to four words. `<meta name="claude:viewport-fit-sides">`.
- Colour tokens on `:root`, dark overrides in a `@media (prefers-color-scheme: dark)` block guarded by `:root:not([data-theme="light"])`, and again in `:root[data-theme="dark"]`. Explicit body background.
- Fonts from Google Fonts only. Scripts only from approved CDNs (cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com), or none.
- Global `[hidden]{display:none!important}`.
- `localStorage` only inside try/catch. The page must work without it.
- Phone width first: 16px gutter, no horizontal scroll, 44px touch targets.
- Emit events (events array plus postMessage). They must work with no listener.

## 4. Drawing rules
**SVG scenes**
- One viewBox per scene (hero 640x170, scene 640x260). Colours only from tokens, as `var(--token)` in `fill`/`stroke` (or `currentColor`).
- Labels never overlap. Put labels beside objects, 14px, muted (`var(--muted)`). Redraw if two labels touch.
- Give each SVG `role="img"` and an `aria-label` that says what is in it.
- One self-contained SVG: no `<image>`, no external `href`, no `<script>`, no `<foreignObject>`, no `@import`, no `url(http…)`.
- Door cards: viewBox 120x76, one simple picture, no text inside the picture.

**Canvas graphs**
- Use a HiDPI helper `setup(canvas, cssHeight)`.
- Quote the font family. Canvas labels, ticks and readouts use `'11px "PT Mono", ui-monospace, monospace'`; any prose drawn on a canvas uses `Georgia, serif`.
- Colour a quantity's arrow, mark and axis title with its `--q-<id>` token so it matches the word in the text. Frame figures only with `--sand` hairlines, never cards or shadows.
- Read colours from CSS tokens at draw time. Redraw on resize and on theme change (MutationObserver on `data-theme`, plus the media query).
- Always label axes with units. One idea per graph. Do not stack three graphs.
- Remember earlier runs: draw them dashed and named by condition. Stagger the labels (`i % 3 * 13`) so they do not collide.
- Keep the physics or the model honest. Show a simplification as a simplification (for example a flat floor), not as a hidden change.
