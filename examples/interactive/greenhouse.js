// Sample lesson (hand-written stand-in for AI output): photosynthesis in a greenhouse.
// Uses slider, number, toggle and choice controls, readouts with status, and a stage interaction
// (click the lamp to switch it). Numbers are illustrative, not research-backed.
{
  title: "Greenhouse growth",
  subtitle: "Real-life example: farmers control light and CO₂ in greenhouses to grow crops faster",

  controls: [
    { type: "slider", id: "light", label: "Sunlight", unit: "µmol/m²/s", min: 0, max: 1500, step: 50, value: 600 },
    { type: "slider", id: "co2", label: "CO₂ in the air", unit: "ppm", min: 200, max: 1200, step: 50, value: 400,
      help: "Outside air has about 420 ppm. Greenhouses often add more." },
    { type: "number", id: "area", label: "Growing area", unit: "m²", min: 1, max: 10000, step: 1, value: 100 },
    { type: "toggle", id: "lamp", label: "Grow lamp on", value: false },
    { type: "choice", id: "crop", label: "Crop", value: "tomato",
      options: [ { value: "tomato", label: "Tomato" }, { value: "lettuce", label: "Lettuce" }, { value: "wheat", label: "Wheat" } ] },
  ],

  outputs: [
    { id: "rate", label: "Growth rate", unit: "g/m²/day", decimals: 1 },
    { id: "harvest", label: "Whole area per week", unit: "kg", decimals: 1 },
  ],

  setup(stage, api) {
    const s = api.svg;
    const svg = s("svg", { viewBox: "0 0 400 260", role: "img", "aria-label": "A greenhouse with a growing plant" }, stage);
    this.parts = {
      sky: s("rect", { width: 400, height: 260 }, svg),
      sun: s("circle", { cx: 345, cy: 50, r: 26 }, svg),
      ground: s("rect", { y: 205, width: 400, height: 55 }, svg),
      house: s("path", { d: "M70 205 V105 L170 55 L270 105 V205", fill: "none", "stroke-width": 4, "stroke-linejoin": "round" }, svg),
      pot: s("rect", { x: 140, y: 175, width: 60, height: 30, rx: 4 }, svg),
      stem: s("rect", { x: 167, width: 6, rx: 3 }, svg),
      leaves: s("g", {}, svg),
      lamp: s("g", { style: "cursor:pointer", tabindex: 0, role: "button", "aria-label": "Grow lamp" }, svg),
      label: s("text", { x: 200, y: 245, "text-anchor": "middle" }, svg),
    };
    s("rect", { x: 205, y: 75, width: 40, height: 10, rx: 3 }, this.parts.lamp);
    this.parts.glow = s("path", { d: "M210 85 L190 150 H260 L240 85 Z" }, this.parts.lamp);
    const toggleLamp = () => api.set("lamp", !api.values().lamp);
    this.parts.lamp.addEventListener("click", toggleLamp);
    this.parts.lamp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLamp(); } });
    api.onThemeChange(() => this.draw(api));
  },

  // Light and CO₂ each limit growth; the crop sets the top speed.
  model(v) {
    const maxRate = { tomato: 30, lettuce: 18, wheat: 24 }[v.crop];
    const light = v.light + (v.lamp ? 300 : 0);
    const lightFactor = light / (light + 400);
    const co2Factor = v.co2 / (v.co2 + 350);
    const rate = maxRate * lightFactor * co2Factor * 1.9;
    return { light, rate, lightFactor, co2Factor };
  },

  update(v, api) {
    this.v = v;
    const m = this.model(v);
    this.m = m;
    this.draw(api);
    const status = m.rate >= 12 ? "good" : m.rate >= 5 ? "warning" : "bad";
    const note = { good: "Fast", warning: "Slow", bad: "Barely growing" }[status];
    const limit = m.lightFactor < m.co2Factor ? "light" : "CO₂";
    const explanation =
      m.light === 0
        ? "No light at all: the leaves can't make any glucose, so the plant doesn't grow."
        : `Growth is limited mostly by ${limit}. Raising ${limit} helps most; raising the other helps less.`;
    return {
      outputs: {
        rate: { value: m.rate, status, note },
        harvest: (m.rate * v.area * 7) / 1000,
      },
      explanation,
    };
  },

  draw(api) {
    const p = this.parts, v = this.v, m = this.m;
    if (!p || !v) return;
    const c = api.color;
    p.sky.setAttribute("fill", c("scene-sky"));
    p.sun.setAttribute("fill", c("scene-sun"));
    p.sun.setAttribute("opacity", 0.25 + 0.75 * Math.min(1, v.light / 1500));
    p.ground.setAttribute("fill", c("scene-ground"));
    p.house.setAttribute("stroke", c("scene-metal"));
    p.pot.setAttribute("fill", c("illustration-wood"));
    const height = 20 + m.rate * 3.2;
    p.stem.setAttribute("y", 175 - height);
    p.stem.setAttribute("height", height);
    p.stem.setAttribute("fill", c("scene-plant"));
    p.leaves.replaceChildren();
    for (let i = 0; i < 1 + Math.floor(height / 22); i++) {
      const y = 170 - i * 20;
      api.svg("ellipse", { cx: i % 2 ? 186 : 154, cy: y, rx: 15, ry: 7, fill: c("scene-plant") }, p.leaves);
    }
    p.lamp.firstChild.setAttribute("fill", c("scene-metal"));
    p.glow.setAttribute("fill", c("scene-sun"));
    p.glow.setAttribute("opacity", v.lamp ? 0.45 : 0);
    p.label.textContent = v.crop[0].toUpperCase() + v.crop.slice(1);
    p.label.setAttribute("fill", c("text"));
    p.label.setAttribute("font-family", api.font("body"));
    p.label.setAttribute("font-size", api.text("sm"));
  },
}
