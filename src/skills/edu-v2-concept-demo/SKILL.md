---
name: edu-v2-concept-demo
description: Specify what the student does in a concept - controls, readouts, runs, predict, break, states and layers - from the plan, arc and cast. Writes the demo spec, no HTML.
max_output_tokens: 10000
---
# edu-v2-concept-demo

Design the student's interaction as a spec. `edu-v2-concept-break-build` says what is true (relationship, misconceptions, Doors, Check content). This step says what the student does. `edu-v2-content-presentation` builds it into the page.

## 1. Inputs
`<concept_plan>`, `<story_arc>`, `<cast_scene>`, the `<track>` and the `<colour_map>`.

## 2. Rules that hold for every demo
- Hands-on must be minds-on: every control is tied to a Notice question. A control with no question is removed.
- The model is honest. A flat floor stays flat. A simplification is shown as a simplification.
- No idea from a later chapter.
- The equation appears in the Explorer layer only.
- Foundation has at most three controls, ideally one main control.
- A control that is unavailable for a non-physical reason is hidden, not greyed out. Grey out only when the physics says it cannot move.

## 3. The stages the student acts in
**Predict.** Prompt in the character's words (use the cast names). Pictured choice at every level. Builder adds a number. Explorer adds confidence and a reason. Locked after commit.
**Play.** One control first. Three to five runs. Earlier runs are remembered and named by condition. List `runs_to_try` with the direction of the result.
**Notice.** One question per observation, asked before any new word is given. Each prompt names the control it is about.
**Name.** The one-sentence relationship. The equation is Explorer-only.
**Break.** One control or condition that exposes the failing assumption. Give the boundary as a value inside that control's range (`boundary_value`). The student finds it, you do not announce it.
Transfer and Check content come from the concept plan. Say which demo state each one uses.

## 4. Controls and readouts
For each control: `id`, `label`, `unit`, `range`, `step`, `layer`, `quantity` (a colour-map id, if it is a quantity). Controls for Builder and Explorer go in reserved slots and are revealed additively. Never remove or move a control once shown.
Readouts: what, unit, which colour from the colour map. One graph, axes labelled with units, earlier runs dashed.

## 5. Layers
| Layer | Student sees |
|---|---|
| Foundation | Pictured choices, one main control, no formula |
| Builder | Numbers, ratios, tables, graph readings |
| Explorer | The equation, calculated answers with units |

## 6. Demo states
Give each stage one state, with ids exactly `hook`, `predict`, `play`, `notice`, `name`, `break`, `transfer`, `check`. For each state: which controls are enabled, what is highlighted, what the graph shows. A state never clears the student's runs, prediction or answers.

## 7. Events
List the events each action emits, using the platform names: `predict`, `predict-compare`, `play`, `notice`, `break-control`, `break-flag`, `break-assumption`, `break-boundary`, `transfer`, `check`, `hint`, `deeper`.

## 8. Check before you reply
1. Every control has a Notice prompt.
2. Every state id is listed once and used by a stage.
3. Break has a boundary the model can reach inside the control range.
4. Nothing in Foundation needs a formula.

## 9. Output
Reply with only this JSON object inside `<demo_spec>` tags. No text outside the tags, no ``` fences.

<demo_spec>
{
  "concept": "",
  "model": "the formula or rules the figure computes, in plain JavaScript-like terms",
  "controls": [{"id": "", "label": "", "unit": "", "range": [0, 0], "step": 0, "layer": "foundation|builder|explorer", "quantity": ""}],
  "readouts": [{"id": "", "label": "", "unit": "", "colour": "--q-<id>", "layer": "foundation|builder|explorer"}],
  "graph": {"x": "", "y": "", "units": "x unit, y unit"},
  "predict": {"prompt": "", "options": [""], "tiers": {"builder": "number", "explorer": "confidence+reason"}},
  "runs_to_try": [{"label": "", "set": {}, "expect": "direction"}],
  "notice_prompts": [{"control": "", "prompt": ""}],
  "break": {"control": "", "boundary_value": 0, "boundary": "", "assumption": ""},
  "states": [{"id": "hook", "controls_enabled": [""], "highlight": "", "graph": ""}],
  "transfer_state": "transfer",
  "check_state": "check",
  "layers": {"foundation": "", "builder": "", "explorer": ""},
  "events": [""]
}
</demo_spec>
