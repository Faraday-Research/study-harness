{
  title: "The plant on your windowsill is cooking",
  subtitle: "A houseplant grows on a sunny windowsill.",
  intro: "Plants make their own food from sunlight, water and the air. Move the sliders and watch what the plant can make.",

  controls: [
    { type: "slider", id: "light", label: "Sunlight", icon: "☀️", color: "sun", min: 0, max: 100, step: 1, value: 80, unit: "%",
      labels: { "0": "night" }, help: "Open or close the blinds. All the way left is night." },
    { type: "slider", id: "water", label: "Water in the soil", icon: "💧", color: "water", min: 0, max: 100, step: 1, value: 70, unit: "%",
      help: "The roots pull water up the stem to the leaves." },
    { type: "slider", id: "air", label: "Carbon dioxide in the air", icon: "💨", color: "air", min: 0, max: 100, step: 1, value: 60, unit: "%",
      help: "Leaves take it in through tiny holes. It's the gas you breathe out." },
  ],

  outputs: [
    { id: "speed", label: "Food-making speed", display: "meter", max: 100, unit: "%", color: "plant", decimals: 0 },
    { id: "sugar", label: "Sugar made", icon: "🍬", unit: "g", color: "sugar", decimals: 1 },
    { id: "oxygen", label: "Oxygen bubbles", icon: "🫧", color: "plant", decimals: 0 },
  ],

  equation: {
    title: "What's happening inside the leaf",
    terms: [
      { id: "air", label: "carbon dioxide", color: "air" }, "+",
      { id: "water", label: "water", color: "water" },
      { arrow: true, above: "sunlight", below: "green leaves" },
      { id: "sugar", label: "sugar", color: "sugar" }, "+",
      { id: "oxygen", label: "oxygen", color: "plant" },
    ],
    note: "The green colour in the leaves catches the light. The plant keeps the sugar as food and lets the oxygen out for you to breathe.",
  },

  tryThis: [
    "Slide the sunlight to night. What happens to the oxygen bubbles?",
    "Give the plant lots of light but almost no water. Does more sun help?",
    "Set everything high, then lower just one slider. The lowest one always sets the speed.",
  ],

  setup(stage, api) {
    const s = api.svg;
    this.api = api;
    this.sugar = 0;
    this.oxygen = 0;
    this.particles = [];
    this.leafTips = [];
    const svg = s("svg", { viewBox: "0 0 400 330", role: "img", "aria-label": "A potted plant on a windowsill in front of a window" }, stage);

    // Window: night sky behind the day sky; the day sky fades out as the light goes down.
    const clip = s("clipPath", { id: "win" }, s("defs", {}, svg));
    s("rect", { x: 70, y: 24, width: 260, height: 190, rx: 4 }, clip);
    const windowG = s("g", { "clip-path": "url(#win)" }, svg);
    this.room = s("rect", { x: 0, y: 0, width: 400, height: 330 }, svg);
    svg.insertBefore(this.room, windowG);
    this.night = s("rect", { x: 70, y: 24, width: 260, height: 190 }, windowG);
    this.stars = s("g", {}, windowG);
    for (const [cx, cy, r] of [[110, 50, 1.5], [150, 80, 1.2], [200, 44, 1.6], [240, 120, 1.2], [300, 150, 1.4], [120, 140, 1.1]]) {
      s("circle", { cx, cy, r }, this.stars);
    }
    this.moon = s("circle", { cx: 270, cy: 70, r: 16 }, windowG);
    this.day = s("rect", { x: 70, y: 24, width: 260, height: 190 }, windowG);
    this.glow = s("circle", { cx: 270, cy: 70, r: 46 }, windowG);
    this.sun = s("circle", { cx: 270, cy: 70, r: 24 }, windowG);
    this.slats = [];
    for (let i = 0; i < 10; i++) this.slats.push(s("rect", { x: 70, y: 24 + i * 19, width: 260, "stroke-width": 1 }, windowG));
    this.frame = s("rect", { x: 70, y: 24, width: 260, height: 190, rx: 4, fill: "none", "stroke-width": 8 }, svg);
    this.bar = s("line", { x1: 200, y1: 24, x2: 200, y2: 214, "stroke-width": 6 }, svg);
    this.beam = s("polygon", { points: "150,214 330,214 300,300 120,300" }, svg);

    // Sill, particles, plant, pot (drawn in this order so the pot sits in front of the stem).
    this.sill = s("rect", { x: 40, y: 250, width: 320, height: 16, rx: 3 }, svg);
    this.sillFront = s("rect", { x: 52, y: 266, width: 296, height: 64, opacity: 0.45 }, svg);
    this.particleLayer = s("g", {}, svg);
    this.stem = s("path", { fill: "none", "stroke-width": 6, "stroke-linecap": "round" }, svg);
    this.leaves = [0.35, 0.5, 0.65, 0.8, 0.95].map((t, i) => ({
      t, side: i % 2 ? 1 : -1, size: [1, 1.05, 0.95, 0.85, 0.7][i],
      el: s("path", { d: "M0 0 C 14 -16, 46 -14, 58 0 C 46 12, 14 14, 0 0 Z" }, svg),
    }));
    this.pot = s("path", { d: "M160 200 L240 200 L230 252 L170 252 Z" }, svg);
    this.rim = s("rect", { x: 154, y: 194, width: 92, height: 14, rx: 3 }, svg);
    this.soil = s("ellipse", { cx: 200, cy: 196, rx: 40, ry: 4 }, svg);

    // Air drifting in and oxygen bubbles rising, both as fast as the plant makes food (none at night).
    let toAir = 0;
    let toBubble = 0;
    api.animate((dt) => {
      const v = this.v;
      if (!v) return true;
      const speed = Math.min(v.light, v.water, v.air) / 100;
      this.sugar += speed * dt * 0.6;
      toBubble += speed * dt * 3;
      toAir += speed * dt * 2.2; // the leaves take in air only as fast as they use it
      while (toBubble >= 1) { toBubble -= 1; this.oxygen += 1; if (!api.reducedMotion) this.spawn("oxygen"); }
      while (toAir >= 1) { toAir -= 1; if (!api.reducedMotion) this.spawn("air"); }
      this.moveParticles(dt);
      api.setOutputs({ sugar: this.sugar, oxygen: this.oxygen });
      return true;
    });
    api.onThemeChange(() => this.draw());
  },

  // Where the stem is at t (0 = soil, 1 = top); `droop` (0 to 1) bends the top over when it's dry.
  stemPoint(t, droop) {
    const cx = 200 + droop * 30, cy = 120, x1 = 200 + droop * 70, y1 = 60 + droop * 60, u = 1 - t;
    return { x: u * u * 200 + 2 * u * t * cx + t * t * x1, y: u * u * 196 + 2 * u * t * cy + t * t * y1, cx, cy, x1, y1 };
  },

  update(v, api) {
    this.v = v;
    this.draw();
    const speed = Math.min(v.light, v.water, v.air);
    let explanation;
    if (v.light === 0) {
      explanation = { lead: "It's night.", text: "No light means no food-making, even with plenty of water and air.", tone: "bad" };
    } else if (speed >= 70) {
      explanation = { lead: "Working well!", text: "The plant has enough of everything and is making sugar fast.", tone: "good" };
    } else {
      const [name] = [["sunlight", v.light], ["water", v.water], ["carbon dioxide", v.air]].sort((a, b) => a[1] - b[1])[0];
      const tip = { sunlight: "Open the blinds to let more light in.", water: "The soil is dry. Give the plant a drink.", "carbon dioxide": "The air is low on carbon dioxide. Let in some fresh air." }[name];
      explanation = { lead: "Slowed down by " + name + ".", text: tip + " Raising the other sliders won't help until you fix this one.", tone: "warning" };
    }
    return {
      outputs: { speed, sugar: this.sugar, oxygen: this.oxygen },
      explanation,
      equation: { air: v.air / 100, water: v.water / 100, sugar: speed / 100, oxygen: speed / 100 },
    };
  },

  draw() {
    const api = this.api, v = this.v, c = api.color;
    if (!v) return;
    const light = v.light / 100;
    this.room.setAttribute("fill", c("scene-wall"));
    this.night.setAttribute("fill", c("scene-night"));
    this.stars.setAttribute("fill", c("surface-raised"));
    this.stars.setAttribute("opacity", Math.max(0, 1 - light * 4));
    this.moon.setAttribute("fill", c("surface-raised"));
    this.moon.setAttribute("opacity", Math.max(0, 1 - light * 4));
    this.day.setAttribute("fill", c("scene-sky"));
    this.day.setAttribute("opacity", Math.min(1, light * 1.6));
    this.sun.setAttribute("fill", c("scene-sun"));
    this.sun.setAttribute("opacity", Math.min(1, light * 1.6));
    this.glow.setAttribute("fill", c("scene-sun"));
    this.glow.setAttribute("opacity", 0.35 * light);
    const closed = v.light === 0 ? 0 : 1 - light; // the blinds close as the light goes down
    this.slats.forEach((slat) => {
      slat.setAttribute("height", Math.max(0, 19 * closed));
      slat.setAttribute("fill", c("surface-raised"));
      slat.setAttribute("stroke", c("border"));
    });
    this.frame.setAttribute("stroke", c("surface-raised"));
    this.bar.setAttribute("stroke", c("surface-raised"));
    this.beam.setAttribute("fill", c("scene-sun"));
    this.beam.setAttribute("opacity", 0.25 * light);
    this.sill.setAttribute("fill", c("illustration-wood"));
    this.sillFront.setAttribute("fill", c("illustration-wood"));
    this.pot.setAttribute("fill", c("scene-clay"));
    this.rim.setAttribute("fill", c("scene-clay"));
    this.soil.setAttribute("fill", api.mix("scene-ground", "scene-soil", v.water / 100)); // wet soil is darker

    // A thirsty plant droops and turns yellow.
    const droop = Math.max(0, (40 - v.water) / 40);
    const health = Math.min(1, v.water / 40);
    const top = this.stemPoint(1, droop);
    const green = api.mix("scene-sun", "scene-plant", health);
    this.stem.setAttribute("d", `M200 196 Q ${top.cx} ${top.cy} ${top.x1} ${top.y1}`);
    this.stem.setAttribute("stroke", green);
    this.leafTips = this.leaves.map((leaf) => {
      const p = this.stemPoint(leaf.t * 0.98, droop);
      const angle = leaf.side < 0 ? 205 - droop * 70 : -25 + droop * 70;
      const scale = leaf.size * (0.85 + health * 0.15);
      leaf.el.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${angle}) scale(${scale})`);
      leaf.el.setAttribute("fill", green);
      const rad = (angle * Math.PI) / 180;
      return { x: p.x + Math.cos(rad) * 30 * scale, y: p.y + Math.sin(rad) * 30 * scale };
    });
  },

  // A dot of air drifting into a leaf, or an oxygen bubble rising from one.
  spawn(kind) {
    const api = this.api, c = api.color;
    if (!this.leafTips.length) return;
    const tip = this.leafTips[Math.floor(Math.random() * this.leafTips.length)];
    const color = kind === "air" ? c("scene-air") : c("scene-plant");
    const g = api.svg("g", {}, this.particleLayer);
    api.svg("circle", { r: kind === "air" ? 5 : 7, fill: color, "fill-opacity": 0.25, stroke: color, "stroke-width": 1.5 }, g);
    this.particles.push(
      kind === "air"
        ? { g, kind, x: 90 + Math.random() * 220, y: 40 + Math.random() * 150, tx: tip.x, ty: tip.y, life: 0, max: 2.6 }
        : { g, kind, x: tip.x, y: tip.y, vx: (Math.random() - 0.5) * 10, vy: -26 - Math.random() * 12, life: 0, max: 3.2 },
    );
  },

  moveParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const k = p.life / p.max;
      let x, y, opacity;
      if (p.kind === "oxygen") {
        p.x += p.vx * dt; p.y += p.vy * dt; x = p.x; y = p.y; opacity = 1 - k;
      } else {
        const e = k * k;
        x = p.x + (p.tx - p.x) * e; y = p.y + (p.ty - p.y) * e;
        opacity = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.8) / 0.2);
      }
      p.g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      p.g.setAttribute("opacity", Math.max(0, opacity).toFixed(2));
      if (k >= 1) { p.g.remove(); this.particles.splice(i, 1); }
    }
  },

  reset() {
    this.sugar = 0;
    this.oxygen = 0;
    this.particles.forEach((p) => p.g.remove());
    this.particles = [];
  },
}
