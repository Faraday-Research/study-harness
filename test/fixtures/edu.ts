/** Valid outputs for every edu-v2 step (law of demand, high school), as the model would reply. */

export const URL_A = "https://www.britannica.com/topic/law-of-demand";
export const URL_B = "https://www.khanacademy.org/economics/demand";
export const URL_C = "https://openstax.org/books/principles-economics/demand";

export const brief = {
  concept: "Law of demand",
  track: "hs",
  domain: "economics",
  position: { course: "How Markets Work", chapter: "Demand", n: 1 },
  relationship: "When the price of a thing goes up, people buy less of it, if nothing else changes.",
  variables: [
    { name: "price", unit: "rupees", min: 5, max: 50 },
    { name: "quantity", unit: "plates per hour", min: 0, max: 60 },
  ],
  model: { assumptions: ["income, tastes and other prices stay the same"], breaks_at: "when income or the price of a substitute changes, the whole curve shifts" },
  misconceptions: [
    { id: "M1", wrong_idea: "A price change shifts the demand curve.", source: URL_C, status: "verified" },
    { id: "M2", wrong_idea: "Higher price means higher demand because it looks better.", source: URL_B, status: "single-source" },
    { id: "M3", wrong_idea: "Demand and quantity demanded are the same thing.", source: "", status: "from-memory" },
  ],
  applications: [
    { domain: "food", line: "Street food stalls sell more when they cut prices.", source: URL_A },
    { domain: "transport", line: "Fewer people ride when bus fares rise.", source: URL_B },
    { domain: "cinema", line: "Cheap Tuesday tickets fill the seats.", source: URL_C },
  ],
  prerequisites: ["reading a graph"],
  reserved_for_later: ["elasticity", "supply"],
  sources: [{ title: "Law of demand", url: URL_A }],
  open_gaps: ["M3 is from memory"],
};

export const plan = {
  position: { course: "How Markets Work", chapter: "Demand", n: 1 },
  earlier: [],
  reserved_for_later: ["supply", "elasticity"],
  relationship: brief.relationship,
  variables: [
    { id: "price", name: "price", unit: "rupees", min: 5, max: 50 },
    { id: "qty", name: "quantity", unit: "plates per hour", min: 0, max: 60 },
  ],
  colour_map: [
    { id: "price", light: "#8a4b2a", dark: "#d79a76" },
    { id: "qty", light: "#2f5f8a", dark: "#8fb7dc" },
  ],
  model: { simple_model: "qty = 60 - price", assumptions: ["income fixed"], fails_in_break: "income changes", boundary: "a rise in income shifts the curve" },
  equation: "Q = a - bP",
  misconceptions: [
    { id: "D1", brief_id: "M1", wrong_idea: "price shifts the curve", probe: "Does a price cut move the curve?", wrong_answer: "yes", source_status: "verified" },
    { id: "D2", brief_id: "M2", wrong_idea: "dearer sells more", probe: "Price up: more or fewer plates?", wrong_answer: "more", source_status: "single-source" },
    { id: "D3", brief_id: "M3", wrong_idea: "demand = quantity demanded", probe: "Is demand one number?", wrong_answer: "yes", source_status: "from-memory" },
  ],
  doors: [
    { id: "door-1", domain: "transport", changes: "fare", responds: "riders", result: "fare up, fewer riders", picture: { before: { count: 6, description: "full bus" }, after: { count: 2, description: "near-empty bus" } } },
    { id: "door-2", domain: "cinema", changes: "ticket price", responds: "seats filled", result: "cheap day, full hall", picture: { before: { count: 2, description: "few seats" }, after: { count: 8, description: "full hall" } } },
    { id: "door-3", domain: "fuel", changes: "petrol price", responds: "litres bought", result: "price up, smaller fill", picture: { before: { count: 4, description: "four cans" }, after: { count: 1, description: "one can" } } },
  ],
  spine: [
    { stage: 1, name: "Hook", job: "", output: "", minutes: 1.5 },
    { stage: 2, name: "Predict", job: "", output: "", minutes: 1 },
    { stage: 3, name: "Play", job: "", output: "", minutes: 2 },
    { stage: 4, name: "Notice", job: "", output: "", minutes: 1 },
    { stage: 5, name: "Name", job: "", output: "", minutes: 1 },
    { stage: 6, name: "Break", job: "", output: "", minutes: 1.5 },
    { stage: 7, name: "Transfer", job: "", output: "", minutes: 1 },
    { stage: 8, name: "Check", job: "", output: "", minutes: 1.5 },
  ],
  notice: ["What happened to the queue when you raised the price?"],
  break_questions: ["What else changed?"],
  transfer: { foundation: "bus fares", builder: "cinema", explorer: "fuel" },
  check: {
    foundation: [{ id: "f-1", probe_for: "D2", question: "Price up?", options: ["more", "fewer"], answer: "fewer", wrong_answers: [{ answer: "more", misconception: "D2" }] }],
    builder: [{ id: "b-1", probe_for: "D1", question: "Curve moves?", options: ["yes", "no"], answer: "no", wrong_answers: [{ answer: "yes", misconception: "D1" }] }],
    explorer: [
      { id: "e-1", probe_for: "D3", question: "Plates at 20?", numeric: { answer: 40, unit: "plates per hour", tolerance: 1, distractors: [30, 50] }, wrong_answers: [{ answer: "60", misconception: "D3" }] },
    ],
  },
  doors_check: {
    foundation: plan3("f"),
    builder: plan3("b"),
    explorer: plan3("e"),
  },
  link_statement: "Price up, people buy less.",
  exercises: [{ id: "x-1", tier: "foundation", problem: "Price doubles. More or fewer?", answer: "fewer", hints: ["Look at the queue."], probe: "D2" }],
  events: ["predict", "check", "hint", "door", "concept-status"],
};

function plan3(tier: string) {
  return ["door-1", "door-2", "door-3"].map((door) => ({ door, question: `${tier} ${door}?`, answer: "less", explanation: "Price up. Fewer buy." }));
}

export const arc = `# Law of demand story arc
Premise: The main character runs a snack stall at a school fair.
Want: Sell every plate before the fair closes.
Surprise: The stall with the better snacks has the shortest queue.
Beats:
1 Hook: The queue next door is long; the better stall is quiet.
2 Predict: The main character guesses what a price cut will do.
3 Play: The main character changes the price board and watches the queue.
4 Notice: The main character asks what you saw.
5 Name: The guide gives the word after the runs.
6 Break: A holiday bonus day: the queue grows at the same price.
7 Transfer: A bus fare board at the depot.
8 Check: The main character picks the price that sells out.
Payoff: The stall sells out, but some buyers paid less than they would have.
Loose end: How much would each price really sell?
Builder chapter: problem: guess the plates sold at each price / turn: the runs fill a table
Explorer chapter: problem: a rule for every price / turn: the line through the runs gives Q = a - bP
Roles needed: main, guide
Place needs: price board, queue, snack plates, cash tin`;

export const cast = {
  main: { name: "Kavya", gender: "female", age: 15, hobby: "cricket", job: "runs the class snack stall", appearance: "skin-3, black plait, teal kurta, a cricket cap" },
  guide: { name: "Mohan", gender: "male", manner: "asks questions, hands over the chalk", appearance: "skin-4, grey hair, navy shirt, glasses" },
  others: [],
  place: { name: "a school fair", things: ["price board", "queue", "snack plates", "cash tin"] },
  intro_lines: ["This is Kavya. She runs the snack stall.", "Mohan teaches maths. He loves a good puzzle."],
  scene_svg_brief: {
    viewBox: "0 0 640 260",
    composition: "Kavya behind the stall on the left third, the queue leading the eye to her.",
    background: ["pale sky", "school building", "bunting"],
    characters: [
      { name: "Kavya", pos: "210,230", pose: "points at the price board", expression: "puzzled" },
      { name: "Mohan", pos: "470,230", pose: "holds a piece of chalk", expression: "smiling" },
    ],
    objects: [{ name: "stall", pos: "100,80 200x120", details: "striped awning, jars", label: "snack stall", label_pos: "100,70", colour_token: "--illus-wood" }],
    aria_label: "A snack stall at a school fair with a price board and a queue",
  },
  hero_brief: { description: "The school fair seen wide, Kavya at her stall as the queue thins.", aria_label: "Kavya at her snack stall at a busy school fair" },
};

/** A picture with enough filled shapes to pass the "detailed illustration" check. */
const picture = (viewBox: string, label: string, shapes: number) =>
  `<svg viewBox="${viewBox}" role="img" aria-label="${label}">` +
  Array.from({ length: shapes }, (_, i) => `<rect x="${i}" y="${i}" width="10" height="10" fill="var(--illus-wood)"/>`).join("") +
  "</svg>";

export const scene = picture("0 0 640 260", "A snack stall at a school fair with a price board and a queue", 80);
export const hero = picture("0 0 640 200", "Kavya at her snack stall at a busy school fair", 50);
export const doorPictures = Object.fromEntries(
  ["door-1", "door-2", "door-3"].map((id) => [id, picture("0 0 240 150", `Before and after for ${id}`, 20)]),
);

export const demo = {
  concept: "Law of demand",
  model: "qty = max(0, 60 - price)",
  controls: [
    { id: "price", label: "Price", unit: "rupees", range: [5, 50], step: 5, layer: "foundation", quantity: "price" },
    { id: "income", label: "Fair-day bonus", unit: "rupees", range: [0, 100], step: 10, layer: "explorer" },
  ],
  readouts: [{ id: "qty", label: "Plates sold", unit: "plates per hour", colour: "--q-qty" }],
  graph: { x: "price", y: "quantity", units: "rupees, plates per hour" },
  predict: { prompt: "Kavya asks: price down, longer queue?", options: ["longer", "shorter", "same"] },
  runs_to_try: [{ label: "cheap", set: { price: 10 }, expect: "more plates" }],
  notice_prompts: [
    { control: "price", prompt: "What happened to the queue when the price went up?" },
    { control: "income", prompt: "What changed when the bonus came, at the same price?" },
  ],
  break: { control: "income", boundary_value: 50, boundary: "at a 50 rupee bonus the queue grows at every price", assumption: "income fixed" },
  states: ["hook", "predict", "play", "notice", "name", "break", "transfer", "check"].map((id) => ({ id, controls_enabled: ["price"], highlight: "" })),
  transfer_state: "transfer",
  check_state: "check",
  layers: { foundation: "pictured queue", builder: "a table of runs", explorer: "the line through the runs" },
  events: ["predict", "play", "notice", "break-boundary", "check"],
};

const stage = (line: string) => ({ lines: [line], says: [] as { speaker: string; words: string }[] });

export const copy = {
  title: "The Quiet Stall",
  epigraph: { words: "Cheaper is not always worse.", speaker: "Mohan" },
  meet: { lines: ["This is Kavya. She runs the snack stall."], says: [{ speaker: "Mohan", words: "Shall we find out why?" }] },
  doors: {
    lines: ["Here are three things."],
    cards: [
      { door: "door-1", line: "A bus at the depot." },
      { door: "door-2", line: "A cinema on Tuesday." },
      { door: "door-3", line: "A queue at the pump." },
    ],
    question: "What do you think these three have in common?",
  },
  stages: {
    hook: stage("The better stall has the shorter queue."),
    predict: stage("Guesses are free."),
    play: stage("Move the price board and watch."),
    notice: stage("Before any new words, tell me what you saw."),
    name: stage("Economists call this the *law of demand*."),
    break: { lines: ["Now it is bonus day."], says: [{ speaker: "Mohan", words: "Now try to break it." }] },
    transfer: stage("Look at the bus fare board."),
    check: stage("Just to see what stuck. No timer, no score."),
  },
  back_to_doors: { lines: ["Back to the three things."] },
  summary: "Price up, fewer plates sold.",
  toBuilder: "Kavya wants numbers now. Go deeper.",
};

export const stories = {
  builder: { title: "Counting plates", lines: ["Kavya writes each price on the board.", "Mohan hands her a notebook."], says: [] },
  explorer: { title: "One rule", lines: ["Kavya sees a straight line.", "Mohan asks for a rule for any price."], says: [] },
  toExplorer: "Kavya wants one rule. Go deeper.",
};

export const page = `<title>The Quiet Stall</title>
<meta name="claude:viewport-fit-sides">
<style>
:root{--font-body:"Poppins",system-ui,sans-serif;--color-primary:#0c817b;--color-text:#242424;--color-background:#fafafa;--illus-skin-1:#f8d7bd;--illus-wood:#c38f5c;--illus-shade:rgba(36,36,36,0.12)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--color-primary:#3fb8b0;--color-text:#f2f2f2;--color-background:#121414}}
:root[data-theme="dark"]{--color-background:#121414}
[hidden]{display:none!important}
body{background:var(--color-background);color:var(--color-text);font-family:var(--font-body)}
</style>
<main class="book"><h1>The Quiet Stall</h1>
<!--HERO-->
<section class="meet"><p data-path="meet.lines.0">This is Kavya. She runs the snack stall.</p>
<!--SCENE-->
</section>
<section class="doors">${["door-1", "door-2", "door-3"].map((id) => `<div class="door"><!--DOOR:${id}--></div>`).join("")}</section>
${["hook", "predict", "play", "notice", "name", "break", "transfer", "check"]
  .map((id) => `<section class="stage" data-stage="${id}" data-demo-state="${id}"><div class="layer" data-tier="builder" hidden></div><div class="layer" data-tier="explorer" hidden></div></section>`)
  .join("\n")}
<figure class="sim"><canvas></canvas><figcaption><b>Fig. 1.1</b></figcaption></figure>
</main>
<script>
var ARTIFACT = { id: 'law-of-demand-1', chapter: 'demand', track: 'hs', core: '1.0.0' };
window.__events = window.__events || [];
function emit(type, data) { window.__events.push(Object.assign({ type: type }, data)); try { parent.postMessage({ type: type }, '*'); } catch (e) {} }
try { localStorage.getItem('x'); } catch (e) {}
</script>`;

export const replies: Record<string, string> = {
  research: `<concept_brief>${JSON.stringify(brief)}</concept_brief>`,
  plan: `<concept_plan>${JSON.stringify(plan)}</concept_plan>`,
  arc: `<story_arc>\n${arc}\n</story_arc>`,
  cast: `<cast_scene>${JSON.stringify(cast)}</cast_scene>`,
  scene:
    `<scene_svg>${scene}</scene_svg>\n<hero_svg>${hero}</hero_svg>\n` +
    Object.entries(doorPictures)
      .map(([id, svg]) => `<door_svg id="${id}">${svg}</door_svg>`)
      .join("\n"),
  demo: `<demo_spec>${JSON.stringify(demo)}</demo_spec>`,
  copy: `<copy>${JSON.stringify(copy)}</copy>`,
  stories: `<stories>${JSON.stringify(stories)}</stories>`,
  page: `<page>\n${page}\n</page>`,
};
