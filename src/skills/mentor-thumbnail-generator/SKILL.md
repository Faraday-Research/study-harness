---
name: mentor-thumbnail-generator
description: "Generate a topic thumbnail as a single transparent SVG: a teal glow and a simple line diagram of the topic. Use when asked to create a thumbnail or cover image for a topic or material."
max_output_tokens: 16000
metadata: { source: "Claude skill mentor-thumbnail-generator", copied: "2026-11-16" }
---

# Thumbnail generator

You make the thumbnail image that sits on the right of the title section of a topic or material. The app already draws the card, its dark background, the title and the subject label. You make **only the image**: a clean line diagram that explains the topic at a glance, with a soft teal glow behind it. Every image must look like it came from the same hand.

Output: **one self-contained SVG**, nothing else (no commentary, no markdown fence unless asked).

## Inputs
- `subject` (e.g. Economics)
- `topic` (e.g. The Law of Demand)
- `description` (optional, a line or two about the topic)

Use them only to decide what to draw. Never write the subject or topic name inside the image, and never write any product, company or brand name.

## Canvas
- `viewBox="0 0 320 240"`, `width="320" height="240"` (4:3). The app scales it.
- **Transparent background.** Do not draw a background rectangle, card, border, rounded corners or shadow. The only things behind the diagram are the two glow gradients below.
- **Safe zone for the diagram: x 40 to 280, y 20 to 225.** Aim for the diagram to fill about 200 by 190 units, centred on **(160, 120)**, which is also the glow centre. Nothing may touch the edges.
- The glow fades to fully transparent before it reaches any edge, so the image never shows a hard edge on the app's card.

## Palette (teal only)
The primary colour is **#0C817B**. The image is designed for a dark card, so build every colour as a variation of this teal.

| Token | Hex | Use |
|---|---|---|
| primary | #0C817B | Glow, soft fills (at 18 to 35% opacity) |
| bright | #22A89F | Arrows, secondary strokes, small solid shapes |
| line | #6FD3CB | Main strokes (curves, outlines) |
| tint | #A8E6E1 | Highlighted outlines |
| pale | #D9F5F2 | Labels inside the diagram |
| white | #FFFFFF | The single key point of the diagram |
| axis | #4E6361 | Axes, ground lines |
| axis-dim | #3A4E4C | Hatching, minor guides |
| label | #8FA9A6 | Axis letters |

Contrast comes from lightness steps of teal, not from new hues. Use one non-teal accent only if the topic truly cannot be read without it (for example two competing series, or a warning). If you do, use at most one accent (amber #F5A524), on one small element, never for fills. Default to no accent.

## Required structure (always, in this order)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240" role="img" aria-label="SHORT DESCRIPTION OF THE DIAGRAM">
<defs>
<radialGradient id="glow" cx="160" cy="120" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0C817B" stop-opacity=".55"/><stop offset=".4" stop-color="#0C817B" stop-opacity=".24"/><stop offset=".8" stop-color="#0C817B" stop-opacity="0"/></radialGradient>
<radialGradient id="core" cx="160" cy="120" r="85" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22A89F" stop-opacity=".26"/><stop offset="1" stop-color="#22A89F" stop-opacity="0"/></radialGradient>
</defs>
<rect width="320" height="240" fill="url(#glow)"/>
<rect width="320" height="240" fill="url(#core)"/>
<!-- DIAGRAM GOES HERE -->
</svg>
```
Copy the `<defs>` and the two glow rects exactly. The glow is part of the vector (gradients, not CSS and not filters), so it survives export. Never change its position, radius, stops or opacity. These two rects are the only full-canvas shapes allowed.

## Drawing the diagram
Think: what is the one picture a teacher would sketch on a board for this topic? Draw that, simply.

1. **One idea only.** One central shape or curve plus at most 2 supporting elements. If you need more than about 12 shapes, simplify.
2. **Line-art style.** Outlines with stroke-width 2.5 to 4.5, `stroke-linecap="round"`, `stroke-linejoin="round"`. Closed shapes get a soft fill: primary teal at fill-opacity .18 to .35.
3. **Hierarchy through lightness.**
   - Background structure (axes, ground): axis / axis-dim, stroke 1.8 to 2.
   - Main subject (curve, shape): line #6FD3CB, stroke 3 to 4.5.
   - Emphasis (highlighted side, arrow, key region): bright #22A89F or tint #A8E6E1.
   - The key point (intersection, answer, focus): solid white circle r=8, with a ring r=15 in line colour at stroke-opacity .4.
4. **Guides** (projection lines, helper lines): stroke-dasharray `4 5`, stroke-width 1.8, in bright. A ghost duplicate of the main curve (stroke-opacity .3, `stroke-dasharray="2 7"`) can add depth.
5. **Labels:** at most 3 to 4 tiny labels, 1 to 3 characters (P, Q, F, m, a², c², 1789, Na⁺). Font `Poppins,system-ui,sans-serif`, size 13 to 20, weight 500 to 600, in label or pale colour. No sentences, no words, no topic or subject names.
6. **Subject-appropriate motifs** (examples): economics = axes and curves; maths = geometric figures and symbols; physics = objects with arrows; chemistry = circles for atoms with charge labels; history = a landmark or a date; geography = terrain, sun, cloud or water waves. Pick the motif from the topic, not from the subject alone.
7. **Never include:** a background or card, the title, the subject label, any wordmark, product name or brand name, photos, raster images (`<image>`), gradients other than the two glow gradients, drop shadows, blur filters, scripts, external fonts or URLs, emojis, people or faces, logos, or real brand marks.
8. Keep it under about 4 KB. Use absolute coordinates, no transforms unless needed.

## Example 1: Economics, The Law of Demand
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240" role="img" aria-label="Demand curve sloping down">
<defs>
<radialGradient id="glow" cx="160" cy="120" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0C817B" stop-opacity=".55"/><stop offset=".4" stop-color="#0C817B" stop-opacity=".24"/><stop offset=".8" stop-color="#0C817B" stop-opacity="0"/></radialGradient>
<radialGradient id="core" cx="160" cy="120" r="85" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22A89F" stop-opacity=".26"/><stop offset="1" stop-color="#22A89F" stop-opacity="0"/></radialGradient>
</defs>
<rect width="320" height="240" fill="url(#glow)"/>
<rect width="320" height="240" fill="url(#core)"/>
<path d="M74 27V197H256" fill="none" stroke="#4E6361" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M104 67C116 137 164 177 244 185" fill="none" stroke="#6FD3CB" stroke-opacity=".3" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/>
<path d="M89 47C104 127 154 172 244 182" fill="none" stroke="#6FD3CB" stroke-width="4.5" stroke-linecap="round"/>
<path d="M74 126H124V197" fill="none" stroke="#22A89F" stroke-width="1.8" stroke-dasharray="4 5"/>
<circle cx="124" cy="126" r="8" fill="#FFFFFF"/><circle cx="124" cy="126" r="15" fill="none" stroke="#6FD3CB" stroke-opacity=".4" stroke-width="2"/>
<text x="60" y="37" font-family="Poppins,system-ui,sans-serif" font-size="13" font-weight="500" fill="#8FA9A6" text-anchor="middle">P</text><text x="250" y="215" font-family="Poppins,system-ui,sans-serif" font-size="13" font-weight="500" fill="#8FA9A6" text-anchor="middle">Q</text>
</svg>
```

## Example 2: Mathematics, Pythagoras Theorem
Same header (`<defs>` and the two glow rects), then:
```svg
<g fill="#0C817B" fill-opacity=".2" stroke="#6FD3CB" stroke-width="2.5" stroke-linejoin="round">
<path d="M134 147H206V219H134Z"/><path d="M134 93H80V147H134Z"/><path d="M134 93L206 147L260 75L188 21Z"/></g>
<path d="M134 93L206 147H134Z" fill="#22A89F" fill-opacity=".5" stroke="#A8E6E1" stroke-width="3" stroke-linejoin="round"/>
<path d="M146 147V135H134" fill="none" stroke="#FFFFFF" stroke-width="2"/>
<text x="107" y="125" font-family="Poppins,system-ui,sans-serif" font-size="17" font-weight="500" fill="#D9F5F2" text-anchor="middle">a²</text><text x="170" y="189" font-family="Poppins,system-ui,sans-serif" font-size="17" font-weight="500" fill="#D9F5F2" text-anchor="middle">b²</text><text x="224" y="53" font-family="Poppins,system-ui,sans-serif" font-size="17" font-weight="500" fill="#D9F5F2" text-anchor="middle">c²</text>
```

## Example 3: Physics, Newton's Second Law
Same header, then:
```svg
<path d="M66 167H256" stroke="#4E6361" stroke-width="2" stroke-linecap="round"/>
<path d="M70 167l-8 10M94 167l-8 10M118 167l-8 10M142 167l-8 10M166 167l-8 10M190 167l-8 10M214 167l-8 10M238 167l-8 10" stroke="#3A4E4C" stroke-width="1.8" stroke-linecap="round"/>
<path d="M66 115h22M62 135h30M66 155h22" stroke="#6FD3CB" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
<rect x="100" y="101" width="72" height="66" rx="8" fill="#0C817B" fill-opacity=".35" stroke="#6FD3CB" stroke-width="3"/>
<text x="136" y="143" font-family="Poppins,system-ui,sans-serif" font-size="20" font-weight="600" fill="#FFFFFF" text-anchor="middle">m</text>
<path d="M176 134H240" stroke="#22A89F" stroke-width="5" stroke-linecap="round"/><path d="M234 121L256 134L234 147Z" fill="#22A89F"/>
<text x="214" y="117" font-family="Poppins,system-ui,sans-serif" font-size="18" font-weight="600" fill="#A8E6E1" text-anchor="middle">F</text>
```

## Final checklist (run silently before answering)
1. The SVG starts with `<svg`, has `viewBox="0 0 320 240"`, and the only full-canvas shapes are the two glow rects, copied exactly. No background rect.
2. The diagram is centred near (160, 120) and stays inside x 40 to 280, y 20 to 225.
3. No title, subject, topic name, wordmark, product name or brand name anywhere in the image.
4. Only palette colours. At most one non-teal accent, and only if required.
5. Exactly one white key point. No other white fills.
6. 12 shapes or fewer, 4 labels or fewer, each label 1 to 3 characters.
7. No `<image>`, `<script>`, `<filter>`, external URL, emoji, or extra gradients.
8. Valid XML (all tags closed, `&` written as `&amp;`).
9. The diagram would still be understood if the labels were removed.