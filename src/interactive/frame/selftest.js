/*
 * Lesson self-test. Only included in pages built for testing (buildInteractiveHtml with selfTest),
 * which apps load in a sandboxed, hidden browser window before saving a lesson.
 *
 * It runs the lesson for real: every control at its limits, every option, every clickable part of
 * the drawing, and the motion at low and high settings. It reports:
 *   errors   - the lesson fails to start or throws, a readout isn't a real number, an unknown colour,
 *              or (custom pages) nothing to interact with
 *   warnings - drawing labels that overlap, are cut off, are hidden behind shapes, or are sentences;
 *              a missing explanation; an output that only copies a slider; motion in the drawing that
 *              stays the same when the result changes (e.g. bubbles that ignore the light level)
 *
 * Result: window.__LESSON_TEST_RESULT__ = [{ severity, message }], also posted to the parent page as
 * { type: 'ilearn:selftest', problems }, and <html data-selftest="done"> when finished.
 */
(function () {
  'use strict';

  var problems = [];
  var diag = window.__LESSON_DIAG__ || { errors: [], unknownColors: [] };
  var errorsSeen = 0;

  var reported = {};
  /** Adds a problem once: `key` names the issue regardless of when it happened. */
  function add(severity, message, key) {
    key = key || message;
    if (reported[key]) return;
    reported[key] = true;
    problems.push({ severity: severity, message: message });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function frame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        setTimeout(resolve, 0);
      });
    });
  }

  function show(value) {
    return typeof value === 'string' ? '"' + value + '"' : String(value);
  }

  /** New errors since the last check */
  function checkErrors(when) {
    while (errorsSeen < diag.errors.length) {
      add('error', 'The code throws an error ' + when + ': ' + diag.errors[errorsSeen]);
      errorsSeen++;
    }
  }

  function checkReadouts(when) {
    Array.prototype.forEach.call(document.querySelectorAll('.readout'), function (readout) {
      var value = readout.querySelector('.readout-value');
      var label = readout.querySelector('dt');
      if (value && (value.textContent === '—' || /NaN|Infinity/.test(value.textContent))) {
        var name = label ? label.textContent : '?';
        add('error', 'The output "' + name + '" is not a real number ' + when + '. update() must return a finite number for every output, every time.', 'nan:' + name);
      }
    });
  }

  /** Total opacity of an SVG element and its parents */
  function opacityOf(el) {
    var total = 1;
    for (var node = el; node && node.nodeType === 1; node = node.parentNode) {
      var style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return 0;
      total *= parseFloat(style.opacity || '1');
      if (node.tagName && node.tagName.toLowerCase() === 'svg') break;
    }
    return total;
  }

  function overlapArea(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /** Label layout in every drawing: overlaps, cut off, hidden behind shapes, sentences */
  function checkLayout(when) {
    Array.prototype.forEach.call(document.querySelectorAll('.stage svg, body > svg, main svg'), function (svg) {
      if (svg.parentNode && svg.parentNode.closest && svg.parentNode.closest('svg')) return; // nested
      var box = svg.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      var labels = Array.prototype.filter
        .call(svg.querySelectorAll('text'), function (t) {
          return t.textContent.trim() && opacityOf(t) > 0.1;
        })
        .map(function (t) {
          return { el: t, text: t.textContent.trim().replace(/\s+/g, ' '), rect: t.getBoundingClientRect() };
        })
        .filter(function (l) {
          return l.rect.width > 0 && l.rect.height > 0;
        });

      labels.forEach(function (l, i) {
        var short = l.text.length > 40 ? l.text.slice(0, 40) + '…' : l.text;
        if (l.text.split(' ').length > 5 || l.text.length > 40) {
          add('warning', 'The drawing has a sentence as a label ("' + short + '") ' + when + '. Keep labels to 3 words; put sentences in the explanation.', 'long:' + l.text);
        }
        var r = l.rect;
        if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) {
          add('warning', 'The label "' + short + '" is cut off at the edge of the drawing ' + when + '. Move it inside the viewBox with a margin.', 'cut:' + l.text);
        }
        for (var j = i + 1; j < labels.length; j++) {
          var o = labels[j];
          var smaller = Math.min(r.width * r.height, o.rect.width * o.rect.height);
          if (overlapArea(r, o.rect) > 0.15 * smaller) {
            add('warning', 'The labels "' + short + '" and "' + o.text.slice(0, 40) + '" overlap ' + when + '. Give each label its own space.', 'overlap:' + l.text + '|' + o.text);
          }
        }
        // Hidden behind a shape drawn later: the middle of the label isn't the label itself.
        var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && hit !== l.el && !l.el.contains(hit) && svg.contains(hit) && hit.tagName.toLowerCase() !== 'svg' && opacityOf(hit) > 0.5) {
          var hitIsLabel = hit.closest && hit.closest('text');
          if (!hitIsLabel) {
            add('warning', 'The label "' + short + '" is hidden behind another shape ' + when + '. Draw labels after shapes, beside their object.', 'hidden:' + l.text);
          }
        }
      });
    });
  }

  function checkExplanation(when) {
    var explanation = document.querySelector('.explanation');
    if (explanation && !explanation.textContent.trim()) {
      add('warning', 'There is no explanation ' + when + '. update() should always return an explanation of what is happening.', 'explanation');
    }
  }

  /** Values to try for a control: its limits, every option */
  function valuesToTry(c, current) {
    if (c.type === 'slider' || c.type === 'number') return [c.min, c.max];
    if (c.type === 'toggle') return [!current];
    if (c.type === 'choice') return (c.options || []).map(function (o) { return o.value; });
    return [];
  }

  // ---- Behaviour: results that only copy a control, and motion that ignores the result ----

  var SHAPES = 'circle, ellipse, rect, path, polygon, polyline, line, text, use';
  var SETTLE_MS = 900;
  var MEASURE_MS = 700;

  /** The main result: the first meter, else the first output (null if there are none) */
  function mainOutputId(engine) {
    var outputs = Array.isArray(engine.lesson.outputs) ? engine.lesson.outputs : [];
    var meter = outputs.filter(function (o) { return o && o.display === 'meter'; })[0];
    var main = meter || outputs[0];
    return main && main.id ? main.id : null;
  }

  function outputLabel(engine, id) {
    var o = (engine.lesson.outputs || []).filter(function (x) { return x && x.id === id; })[0];
    return o && o.label ? o.label : id;
  }

  /**
   * How much the drawing moves over `ms`: the distance each shape travels (weighted by how visible
   * it is), plus fading, plus new shapes appearing. Frame-by-frame, so speed and number both count.
   */
  function motionOver(stage, ms) {
    return new Promise(function (resolve) {
      var previous = null;
      var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
      var activity = 0;
      var end = performance.now() + ms;
      function snapshot() {
        var map = new Map();
        var shapes = stage.querySelectorAll(SHAPES);
        for (var i = 0; i < shapes.length && i < 400; i++) {
          var r = shapes[i].getBoundingClientRect();
          if (!r.width && !r.height) continue;
          map.set(shapes[i], { x: r.left + r.width / 2, y: r.top + r.height / 2, o: opacityOf(shapes[i]) });
        }
        return map;
      }
      function step() {
        var current = snapshot();
        current.forEach(function (p, el) {
          var q = previous && previous.get(el);
          if (q) activity += Math.hypot(p.x - q.x, p.y - q.y) * Math.max(p.o, q.o) + Math.abs(p.o - q.o) * 10;
          else if (previous && seen && !seen.has(el)) activity += 5 * p.o;
          if (seen) seen.add(el);
        });
        previous = current;
        if (performance.now() < end) requestAnimationFrame(step);
        else resolve(activity);
      }
      requestAnimationFrame(step);
    });
  }

  /** Outputs that only repeat a slider's value, from what each try showed */
  function checkCopies(engine, c, samples) {
    if (samples.length < 2) return;
    var outputs = Array.isArray(engine.lesson.outputs) ? engine.lesson.outputs : [];
    outputs.forEach(function (o) {
      if (!o || !o.id) return;
      var copies = samples.every(function (sample) {
        var v = sample.outputs[o.id];
        return typeof v === 'number' && Math.abs(v - sample.value) < 1e-9;
      });
      if (copies) {
        add(
          'warning',
          'The output "' + (o.label || o.id) + '" only repeats the "' + c.label + '" slider. Show a result your model calculates instead ' +
            '(for example how fast something happens, or how much is made); the slider already shows its own value.',
          'copy:' + o.id,
        );
      }
    });
  }

  /** For each slider: does the motion in the drawing change when the main result changes? */
  async function checkMotion(engine) {
    var api = engine.api;
    var mainId = mainOutputId(engine);
    if (!mainId) return;
    var controls = Array.isArray(engine.lesson.controls) ? engine.lesson.controls : [];
    for (var i = 0; i < controls.length; i++) {
      var c = controls[i];
      if (c.type !== 'slider' && c.type !== 'number') continue;
      var start = api.values()[c.id];
      var low = c.min + 0.2 * (c.max - c.min);
      var high = c.max;

      // Start each setting from a clear scene (the lesson's reset() removes particles left from the
      // previous setting, which can live for seconds), let it get going, then measure.
      api.set(c.id, low);
      clearScene(engine);
      await wait(SETTLE_MS);
      var resultLow = engine.outputs()[mainId];
      var motionLow = await motionOver(engine.stage, MEASURE_MS);
      api.set(c.id, high);
      clearScene(engine);
      await wait(SETTLE_MS);
      var resultHigh = engine.outputs()[mainId];
      var motionHigh = await motionOver(engine.stage, MEASURE_MS);
      api.set(c.id, start);
      await frame();
      checkErrors('while measuring the motion');

      if (typeof resultLow !== 'number' || typeof resultHigh !== 'number') continue;
      var biggestMotion = Math.max(motionLow, motionHigh);
      if (biggestMotion < 1) break; // the drawing doesn't move at all: nothing to compare for any slider
      var resultChange = Math.abs(resultHigh - resultLow) / Math.max(Math.abs(resultHigh), Math.abs(resultLow), 1e-9);
      var motionChange = Math.abs(motionHigh - motionLow) / biggestMotion;
      if (resultChange > 0.3 && motionChange < 0.15) {
        add(
          'warning',
          'The moving things in the drawing don\'t follow "' + c.label + '": "' + outputLabel(engine, mainId) + '" changes from ' +
            formatValue(resultLow) + ' to ' + formatValue(resultHigh) + ', but the motion is the same at both settings. ' +
            'Make the number and speed of moving things follow the result every frame (few and slow when it is low, many and fast when high, none at 0).',
          'motion:' + c.id,
        );
      }
    }
  }

  /** Runs the lesson's own reset() (stage-only state: particles, counters), if it has one */
  function clearScene(engine) {
    if (typeof engine.lesson.reset !== 'function') return;
    try {
      engine.lesson.reset(engine.api);
    } catch (err) {
      diag.errors.push(String((err && err.message) || err));
    }
  }

  function formatValue(n) {
    return String(Math.round(n * 10) / 10);
  }

  function clickables(root) {
    return Array.prototype.slice.call(root.querySelectorAll('[role="button"], [tabindex="0"]'), 0, 12);
  }

  function press(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  async function testFrameLesson(engine) {
    var api = engine.api;
    checkErrors('when the lesson starts');
    checkReadouts('when the lesson starts');
    checkExplanation('when the lesson starts');
    checkLayout('at the start');

    var controls = Array.isArray(engine.lesson.controls) ? engine.lesson.controls : [];
    for (var i = 0; i < controls.length; i++) {
      var c = controls[i];
      var start = api.values()[c.id];
      var tries = valuesToTry(c, start);
      var samples = [{ value: start, outputs: engine.outputs() }];
      for (var k = 0; k < tries.length; k++) {
        api.set(c.id, tries[k]);
        await frame();
        samples.push({ value: tries[k], outputs: engine.outputs() });
        var when = 'when "' + c.label + '" is ' + show(tries[k]);
        checkErrors(when);
        checkReadouts(when);
        checkExplanation(when);
        if (c.type === 'choice') checkLayout(when);
      }
      api.set(c.id, start);
      await frame();
      if (c.type === 'slider' || c.type === 'number') checkCopies(engine, c, samples);
    }

    await checkMotion(engine);

    var parts = clickables(engine.stage);
    for (var p = 0; p < parts.length; p++) {
      var name = parts[p].getAttribute('aria-label') || (parts[p].textContent || '').trim().slice(0, 30) || 'a part';
      press(parts[p]);
      await frame();
      checkErrors('after clicking "' + name + '" in the drawing');
      checkReadouts('after clicking "' + name + '" in the drawing');
    }
    if (parts.length) checkLayout('after clicking parts of the drawing');

    var reset = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
      return b.textContent === 'Reset';
    });
    if (reset) {
      reset.click();
      await frame();
      checkErrors('after Reset');
    }
  }

  async function testCustomPage() {
    checkErrors('when the page loads');
    var interactive = document.querySelectorAll('input, button, select, textarea, [role="button"], [tabindex="0"]');
    if (!interactive.length) add('error', 'The page has nothing the student can interact with.');
    checkLayout('at the start');
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input[type="range"], input[type="number"]'), 0, 6);
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var original = input.value;
      var limits = [input.min || '0', input.max || '100'];
      for (var k = 0; k < limits.length; k++) {
        input.value = limits[k];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await frame();
        checkErrors('when an input is set to ' + limits[k]);
      }
      input.value = original;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'), 0, 12);
    for (var b = 0; b < buttons.length; b++) {
      press(buttons[b]);
      await frame();
      checkErrors('after pressing "' + (buttons[b].textContent || '').trim().slice(0, 30) + '"');
    }
  }

  function finish() {
    diag.unknownColors.forEach(function (name) {
      add('error', '"' + name + '" is not a colour name. Use only the names listed for api.color().');
    });
    window.__LESSON_TEST_RESULT__ = problems;
    try {
      if (window.parent !== window) window.parent.postMessage({ type: 'ilearn:selftest', problems: problems }, '*');
    } catch (err) {
      /* no parent to tell */
    }
    document.documentElement.setAttribute('data-selftest', 'done');
  }

  async function run() {
    await frame();
    await frame();
    var engine = window.__LESSON_ENGINE__;
    if (document.documentElement.getAttribute('data-lesson-mode') === 'custom') {
      await testCustomPage();
    } else if (!engine) {
      add('error', 'The lesson failed to start' + (diag.errors[0] ? ': ' + diag.errors[0] : '.'));
      errorsSeen = diag.errors.length;
    } else {
      await testFrameLesson(engine);
    }
    finish();
  }

  run().catch(function (err) {
    add('error', 'The self-test could not finish: ' + ((err && err.message) || err));
    finish();
  });
})();
