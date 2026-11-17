---
name: edu-v2-layout-and-drawing
description: Page contract, level layers, SVG scenes and canvas graphs of an edu-v2 artifact, in book (inline figures) or split-pane layout. Draws every picture on the page (Meet scene, hero, Door pictures) as flat illustrations; its contract and drawing rules also guide page assembly.
max_output_tokens: 32000
---
# edu-v2-layout-and-drawing

The page contract, the layers and the pictures for one learn-by-doing artifact (Adaptive Teaching Framework v2.3 base). How everything looks (fonts, colours, spacing, components, picture styling) is `edu-v2-material-design`, given below as a reference. Words are `edu-v2-story-and-scene`. Content is `edu-v2-concept-break-build`. Page assembly is `edu-v2-content-presentation`.

When you are asked to draw the pictures (`<task>pictures</task>`), you receive `<cast_scene>` (the cast with their appearance, the place, `scene_svg_brief` and `hero_brief`), `<doors>` (the plan's Doors with their picture specs) and `<colour_map>`. Draw every picture on the page, following section 4 here and the illustration style in `edu-v2-material-design` section 5. Take your time over each one: these pictures are what makes the page feel alive.

Reply with only these blocks, in this order. No text outside them, no ``` fences.
```
<scene_svg><svg viewBox="0 0 640 260" …>…</svg></scene_svg>
<hero_svg><svg viewBox="0 0 640 200" …>…</svg></hero_svg>
<door_svg id="door-1"><svg viewBox="0 0 240 150" …>…</svg></door_svg>
```
One `<door_svg>` per door in `<doors>`, with that door's id. The same people look the same in the scene and the hero.

## 1. Page skeleton
Two variants on one page, switched by `.fp[data-layout="book|split"]` and a Book/Split toggle in the level bar. Book is the default. State is shared, so switching loses nothing.

**Book (inline figures).** One wide, left-aligned column (widths in `edu-v2-material-design`), chapter title, table of contents. The simulation appears as `figure.sim` inside the text with a numbered caption. All figures are views of one shared state. Top to bottom:
1. Sticky header: course title, level tabs, progress bar. A one-line level note sits under it.
2. `main.book`: chapter number, h1, hero figure, epigraph.
3. Meet section: cast, place, one scene picture.
4. Doors, part 1: three picture cards from different domains, plus a guess.
5. Eight stages, each `section.stage[data-stage]` with a numbered chip and "Step N of 8" (Hook is "Step 1 of 8 · part 2"): Hook, Predict, Play, Notice, Name, Break, Transfer, Check.
6. Check ends with "Back to the three things" (Doors), summary (secure / shaky / gap), then a link to the next artifact.

**Split pane.** Same order and content. Left: one sticky demo. Right: text blocks with `data-demo-state`. Under 900 px the demo is sticky at the top and collapsible.

No meta notes. No "this page takes ten minutes" asides, no explainer notes under widgets. Keep only the note that invites a guess before comparing (for example "Make a guess in step 2 to compare it with your runs").

## 2. Levels are layers, not modes
- Tabs read "1 · Foundation", "2 · Builder", "3 · Explorer". The tab follows the scroll position (scroll-spy). A tab click scrolls to the nearest open part of that level.
- Foundation is always visible. Builder and Explorer content is a `.layer` block with `data-tier="builder|explorer"`, closed by default, with a "New at Builder" tag when open.
- A "Go deeper: Builder" button sits before the first layer of that tier in each stage. Explorer's button appears after Builder opens.
- Question lists (Notice, Check, Doors) are built once with all three tiers in the DOM. Deeper tiers stay closed. The button for the next tier appears after the tier above is finished.
- Never re-render or reorder anything above. A new layer only adds below. In the split pane, new controls are revealed in reserved slots on the left and never move or remove existing ones.
- Give every item a unique id of tier plus id. Keep answer state by that id.
- Equations live only in an Explorer layer (`data-equation`). That includes the equation line inside any figure: hide it below Explorer.
- A figure shows only the controls and readouts of the current tier.
- Predict is one widget: pictured choice at all levels, Builder adds a number, Explorer adds confidence and a reason. The guess is locked after commit.
- The figure is always live. Every control, run button and readout works from the moment the page loads, at every level, with or without a guess. Never render a figure control `disabled` and never disable it until a guess is made. The guess only gates the comparison.

## 3. Artifact page contract
- No doctype, html, head or body tags. A `<title>` of two to four words. `<meta name="claude:viewport-fit-sides">`.
- Colour tokens on `:root`, dark overrides in a `@media (prefers-color-scheme: dark)` block guarded by `:root:not([data-theme="light"])`, and again in `:root[data-theme="dark"]`. Explicit body background. The tokens and values are in `edu-v2-material-design`.
- No font links or `@font-face`: the app supplies the font. Scripts only from approved CDNs (cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com), or none.
- Global `[hidden]{display:none!important}`.
- `localStorage` only inside try/catch. The page must work without it.
- Phone width first: 16px gutter, no horizontal scroll, 44px touch targets.
- Emit events (events array plus postMessage). They must work with no listener.

## 4. Drawing rules
**SVG scenes**
- One viewBox per picture: scene `0 0 640 260`, hero `0 0 640 200`, Door `0 0 240 150`. Give the `<svg>` `width="100%"` and no fixed height. Colours only from tokens, as `var(--token)` in `fill`/`stroke`/`stop-color`.
- Labels (scene only) never overlap each other or a face. Style them as `edu-v2-material-design` section 5 says. Redraw if two labels touch.
- Ids inside a picture start with the picture's name (`scene-kavya`, `hero-stall`, `door-1-bus`), so the pictures on one page never share an id.
- Give each SVG `role="img"` and an `aria-label` that says what is in it.
- One self-contained SVG: no `<image>`, no external `href`, no `<script>`, no `<foreignObject>`, no `@import`, no `url(http…)`.
- Door pictures: a before panel and an after panel from the door's picture spec, the two counts clearly visible, no text inside the picture.

**Canvas graphs**
- Use a HiDPI helper `setup(canvas, cssHeight)`.
- Canvas fonts and colours are in `edu-v2-material-design` section 5.
- Colour a quantity's arrow, mark and axis title with its `--q-<id>` token so it matches the word in the text.
- Read colours from CSS tokens at draw time. Redraw on resize and on theme change (MutationObserver on `data-theme`, plus the media query).
- Always label axes with units. One idea per graph. Do not stack three graphs.
- Remember earlier runs: draw them dashed and named by condition. Stagger the labels (`i % 3 * 13`) so they do not collide.
- Keep the physics or the model honest. Show a simplification as a simplification (for example a flat floor), not as a hidden change.
