/*
 * The interactive lesson engine. Runs inside the lesson's HTML page.
 *
 * It reads the lesson (window.__LESSON__, the topic-specific part written by the AI), then:
 *   - builds the header, the stage, the controls panel, the readouts, the explanation and Reset
 *   - checks what students type, and keeps sliders and number boxes in sync
 *   - calls lesson.setup(stage, api) once, and lesson.update(values, api) whenever a value changes
 *   - follows the app's theme (light/dark) and reduced-motion setting, and reports its height
 *
 * The lesson shape:
 *   {
 *     title, subtitle?,                       // e.g. "Greenhouse growth", "Real-life example: greenhouses"
 *     controls?: [ slider | number | toggle | choice ],
 *     outputs?: [ { id, label, unit?, decimals? } ],
 *     setup?(stage, api),                     // draw the scene, add stage interactions (click, drag…)
 *     update?(values, api) -> { outputs?: { [id]: number | { value, status?, note? } }, explanation? },
 *     reset?(api),                            // clear stage-only state when Reset is pressed
 *   }
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BRAND_COLORS = [
    'primary', 'primary-hover', 'on-primary', 'background', 'surface', 'surface-raised', 'border',
    'text', 'text-muted', 'success', 'warning', 'danger', 'on-danger',
  ];
  var SCENE_COLORS = [
    'sky', 'night', 'ground', 'soil', 'water', 'plant', 'sun', 'air', 'sugar', 'heat', 'cool',
    'metal', 'wall', 'clay',
  ];
  var ILLUSTRATION_COLORS = ['skin', 'skin-deep', 'hair', 'wood', 'accent'];
  var TEXT_SIZES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'];
  var SPACES = [1, 2, 3, 4, 6, 8, 12];
  var STATUS_SYMBOLS = { good: '✓', warning: '!', bad: '✕' };
  var STATUS_WORDS = { good: 'good', warning: 'borderline', bad: 'problem' };

  // What went wrong while running, for the self-test (selftest.js) to report.
  var diag = (window.__LESSON_DIAG__ = { errors: [], unknownColors: [] });
  // Errors in the lesson's own handlers (clicks, drags, timers) aren't caught by the engine.
  window.addEventListener('error', function (event) {
    diag.errors.push(String(event.message || event.error || 'Unknown error'));
  });

  var EXAMPLE_LABELS = { everyday: 'Everyday example: ', 'real-world': 'Real-world example: ' };

  var app = document.getElementById('app');
  var rootEl = document.documentElement;
  var lesson = window.__LESSON__;
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  var values = {};
  var defaults = {};
  var controlViews = {}; // id -> { set(value) } to show a value in the control
  var readoutViews = {}; // id -> { el, value, note }
  var liveOutputs = {}; // ids of outputs the lesson sets itself (api.setOutputs), e.g. counters
  var lastOutputs = {}; // id -> the last number shown (for the self-test)
  var themeListeners = [];
  var termViews = {}; // equation chip id -> element
  var explanationEl, errorEl, stageEl;

  // ---------------------------------------------------------------- helpers

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var key in attrs || {}) {
      var v = attrs[key];
      if (v === undefined || v === null || v === false) continue;
      if (key === 'text') node.textContent = v;
      else if (key === 'className') node.className = v;
      else node.setAttribute(key, v === true ? '' : String(v));
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function cssVar(name) {
    return getComputedStyle(rootEl).getPropertyValue(name).trim();
  }

  function safeId(id) {
    return 'c-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /** Decimal places of a step like 0.05 -> 2, so number boxes show tidy values */
  function stepDecimals(step) {
    var s = String(step || 1);
    return s.indexOf('.') === -1 ? 0 : s.length - s.indexOf('.') - 1;
  }

  function formatNumber(n, decimals) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals === undefined ? 2 : decimals }).format(n);
  }

  /** What a student typed -> a number, or null. Accepts "9.8", " 1200 ", "9,8". */
  function parseNumber(text) {
    var s = String(text).trim().replace(/[\s_]/g, '');
    if (s.indexOf(',') !== -1 && s.indexOf('.') === -1 && s.split(',').length === 2) s = s.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function isDark() {
    return getComputedStyle(rootEl).colorScheme === 'dark';
  }

  function showError(err) {
    console.error(err);
    diag.errors.push(String((err && err.message) || err));
    if (errorEl) {
      errorEl.textContent = 'This interactive ran into a problem. Try Reset, or rebuild it.';
      errorEl.hidden = false;
    }
  }

  // ---------------------------------------------------------------- the API lessons use

  var api = {
    /** A brand colour for the current theme, e.g. color('primary'), color('scene-sky'), color('illustration-skin') */
    color: function (name) {
      var n = String(name);
      var token = null;
      if (n.indexOf('scene-') === 0 && SCENE_COLORS.indexOf(n.slice(6)) !== -1) token = '--' + n;
      else if (n.indexOf('illustration-') === 0 && ILLUSTRATION_COLORS.indexOf(n.slice(13)) !== -1) token = '--' + n;
      else if (BRAND_COLORS.indexOf(n) !== -1) token = '--color-' + n;
      if (!token) {
        if (diag.unknownColors.indexOf(n) === -1) diag.unknownColors.push(n);
        console.warn('Unknown colour "' + n + '"; using the text colour.');
        token = '--color-text';
      }
      return cssVar(token);
    },
    /**
     * Blends two brand colours by name: mix('scene-sun', 'scene-plant', 0.7) is mostly plant.
     * `t` goes from 0 (the first colour) to 1 (the second). For changes like a leaf turning yellow.
     */
    mix: function (a, b, t) {
      var parse = function (value) {
        var hex = String(value).replace('#', '');
        if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
        return [0, 2, 4].map(function (i) { return parseInt(hex.slice(i, i + 2), 16) || 0; });
      };
      var from = parse(api.color(a));
      var to = parse(api.color(b));
      var k = Math.max(0, Math.min(1, Number(t) || 0));
      return 'rgb(' + from.map(function (v, i) { return Math.round(v + (to[i] - v) * k); }).join(',') + ')';
    },
    /** A brand font stack: font('body' | 'heading' | 'mono') */
    font: function (name) {
      return cssVar('--font-' + (name === 'heading' || name === 'mono' ? name : 'body'));
    },
    /** A brand text size in pixels (for canvas/SVG): text('xs' … '3xl') */
    text: function (size) {
      var token = TEXT_SIZES.indexOf(size) !== -1 ? size : 'base';
      return parseFloat(cssVar('--text-' + token)) * parseFloat(getComputedStyle(rootEl).fontSize);
    },
    /** A brand spacing in pixels: space(1 | 2 | 3 | 4 | 6 | 8 | 12) */
    space: function (n) {
      var step = SPACES.indexOf(n) !== -1 ? n : 4;
      return parseFloat(cssVar('--space-' + step)) * parseFloat(getComputedStyle(rootEl).fontSize);
    },
    /** True when the student prefers less motion: draw the end state instead of animating */
    get reducedMotion() {
      return motionQuery.matches;
    },
    /** 'light' or 'dark' */
    get theme() {
      return isDark() ? 'dark' : 'light';
    },
    /** Calls `callback` after the theme changes (redraw with the new colours). Returns a function to stop. */
    onThemeChange: function (callback) {
      themeListeners.push(callback);
      return function () {
        themeListeners = themeListeners.filter(function (c) {
          return c !== callback;
        });
      };
    },
    /** Creates an SVG element: svg('circle', { cx: 10, cy: 10, r: 5, fill: api.color('scene-sun') }, parent) */
    svg: function (tag, attrs, parent) {
      var node = document.createElementNS(SVG_NS, tag);
      for (var key in attrs || {}) {
        if (key === 'text') node.textContent = attrs[key];
        else if (attrs[key] !== undefined && attrs[key] !== null) node.setAttribute(key, String(attrs[key]));
      }
      if (parent) parent.appendChild(node);
      return node;
    },
    /**
     * Runs callback(dtSeconds, timeMs) every frame until it returns false or stop() is called.
     * With reduced motion it runs once (dt = 0): draw the final state then.
     */
    animate: function (callback) {
      if (motionQuery.matches) {
        callback(0, 0);
        return function () {};
      }
      var id = 0;
      var last = null;
      function loop(t) {
        var dt = last === null ? 0 : (t - last) / 1000;
        last = t;
        var keepGoing;
        try {
          keepGoing = callback(dt, t);
        } catch (err) {
          showError(err);
          return;
        }
        if (keepGoing !== false) id = requestAnimationFrame(loop);
      }
      id = requestAnimationFrame(loop);
      return function () {
        cancelAnimationFrame(id);
      };
    },
    /** The current control values */
    values: function () {
      return Object.assign({}, values);
    },
    /** Sets a control's value from the stage (e.g. dragging an object), then updates everything */
    set: function (id, value) {
      if (!(id in values)) return;
      values[id] = value;
      if (controlViews[id]) controlViews[id].set(value);
      run();
    },
    /**
     * Shows output values from outside update(), e.g. a counter that builds up in an animation:
     * api.setOutputs({ sugar: 12.4 }). Outputs set this way keep their value when update() runs
     * without them.
     */
    setOutputs: function (outputs) {
      for (var id in outputs || {}) {
        liveOutputs[id] = true;
        showOutput(id, outputs[id]);
      }
    },
    /** Runs update() again, e.g. after the stage changed its own state */
    refresh: function () {
      run();
    },
  };

  // ---------------------------------------------------------------- controls

  /** The CSS value for a control's or output's colour name (a scene or brand colour), or null */
  function accentValue(name) {
    if (!name) return null;
    if (SCENE_COLORS.indexOf(name) !== -1) return 'var(--scene-' + name + ')';
    if (BRAND_COLORS.indexOf(name) !== -1) return 'var(--color-' + name + ')';
    if (diag.unknownColors.indexOf(name) === -1) diag.unknownColors.push(name);
    return null;
  }

  /** style="--c: …" for a colour-coded control or output */
  function accentStyle(name) {
    var value = accentValue(name);
    return value ? '--c: ' + value : undefined;
  }

  /** A control's value in friendly words: its `labels` entry (e.g. 0 -> "night"), else number + unit */
  function friendly(c, v) {
    if (c.labels && Object.prototype.hasOwnProperty.call(c.labels, String(v))) return String(c.labels[String(v)]);
    return formatNumber(Number(v), stepDecimals(c.step)) + (c.unit ? ' ' + c.unit : '');
  }

  /** The control's name with its icon (an emoji, decorative) */
  function labelContent(c) {
    return [c.icon ? el('span', { className: 'control-icon', 'aria-hidden': 'true', text: String(c.icon).slice(0, 4) }) : null, document.createTextNode(c.label)];
  }

  function numberBox(control, inputId, labelText, onCommit) {
    var errorId = inputId + '-error';
    var input = el('input', {
      className: 'number-input',
      id: inputId,
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': labelText,
      'aria-describedby': errorId,
    });
    var box = el('span', { className: 'number-box' }, [input, control.unit ? el('span', { className: 'unit', text: control.unit, 'aria-hidden': 'true' }) : null]);
    var error = el('p', { className: 'field-error', id: errorId, hidden: true });
    var decimals = stepDecimals(control.step);

    function setError(message) {
      error.textContent = message || '';
      error.hidden = !message;
      box.classList.toggle('invalid', !!message);
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    function show(value) {
      input.value = String(Number(value.toFixed(Math.max(decimals, 0))));
      setError(null);
    }

    function commit() {
      var n = parseNumber(input.value);
      if (n === null) return setError('Enter a number.');
      if (n < control.min || n > control.max) {
        return setError(
          'Enter a value from ' + formatNumber(control.min, 6) + ' to ' + formatNumber(control.max, 6) + (control.unit ? ' ' + control.unit : '') + '.',
        );
      }
      setError(null);
      onCommit(n);
    }

    input.addEventListener('change', commit);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      }
    });
    return { box: box, error: error, show: show };
  }

  function buildSlider(c) {
    var id = safeId(c.id);
    var range = el('input', {
      className: 'slider',
      id: id,
      type: 'range',
      min: c.min,
      max: c.max,
      step: c.step || 'any',
      'aria-valuetext': undefined,
    });
    var label = el('label', { className: 'control-label', for: id }, labelContent(c));
    var valueText = el('span', { className: 'control-value', 'aria-hidden': 'true' });
    var nb = numberBox(c, id + '-number', c.label + (c.unit ? ' (' + c.unit + ')' : '') + ', exact value', function (n) {
      range.value = String(n);
      update(n);
    });

    function describe(v) {
      range.setAttribute('aria-valuetext', friendly(c, v));
      valueText.textContent = friendly(c, v);
    }
    function update(v) {
      values[c.id] = v;
      describe(v);
      run();
    }
    range.addEventListener('input', function () {
      var v = Number(range.value);
      nb.show(v);
      update(v);
    });

    controlViews[c.id] = {
      set: function (v) {
        range.value = String(v);
        nb.show(Number(v));
        describe(Number(v));
      },
    };
    return el('div', { className: 'control', style: accentStyle(c.color) }, [
      el('div', { className: 'control-head' }, [label, valueText]),
      el('div', { className: 'slider-row' }, [range, nb.box]),
      nb.error,
      help(c),
    ]);
  }

  function buildNumber(c) {
    var id = safeId(c.id);
    var label = el('label', { className: 'control-label', for: id }, labelContent(c));
    var nb = numberBox(c, id, c.label + (c.unit ? ' (' + c.unit + ')' : ''), function (n) {
      values[c.id] = n;
      run();
    });
    nb.box.querySelector('input').removeAttribute('aria-label'); // the <label> names it
    controlViews[c.id] = { set: function (v) { nb.show(Number(v)); } };
    return el('div', { className: 'control', style: accentStyle(c.color) }, [label, el('div', {}, [nb.box]), nb.error, help(c)]);
  }

  function buildToggle(c) {
    var button = el('button', { className: 'switch', type: 'button', role: 'switch', id: safeId(c.id), 'aria-checked': 'false' }, [
      el('span', { className: 'switch-track', 'aria-hidden': 'true' }, [el('span', { className: 'switch-thumb' })]),
      el('span', {}, labelContent(c)),
    ]);
    button.addEventListener('click', function () {
      values[c.id] = !values[c.id];
      button.setAttribute('aria-checked', String(values[c.id]));
      run();
    });
    controlViews[c.id] = { set: function (v) { button.setAttribute('aria-checked', String(!!v)); } };
    return el('div', { className: 'control', style: accentStyle(c.color) }, [button, help(c)]);
  }

  function buildChoice(c) {
    var name = safeId(c.id);
    var inputs = [];
    var options = c.options.map(function (option, i) {
      var input = el('input', { className: 'option-input', type: 'radio', name: name, id: name + '-' + i, value: String(i) });
      input.addEventListener('change', function () {
        if (!input.checked) return;
        values[c.id] = option.value;
        run();
      });
      inputs.push(input);
      return el('label', { className: 'option', for: name + '-' + i }, [input, el('span', { text: option.label })]);
    });
    controlViews[c.id] = {
      set: function (v) {
        c.options.forEach(function (option, i) {
          inputs[i].checked = option.value === v;
        });
      },
    };
    return el('fieldset', { className: 'control', style: accentStyle(c.color) }, [
      el('legend', { className: 'control-label' }, labelContent(c)),
      el('div', { className: 'options' }, options),
      help(c),
    ]);
  }

  function help(c) {
    return c.help ? el('p', { className: 'control-help', text: c.help }) : null;
  }

  var BUILDERS = { slider: buildSlider, number: buildNumber, toggle: buildToggle, choice: buildChoice };

  /** The starting value of a control, from its definition */
  function initialValue(c) {
    if (c.type === 'toggle') return !!c.value;
    if (c.type === 'choice') return c.value !== undefined ? c.value : c.options[0].value;
    return c.value;
  }

  /** Problems with a control's definition, so a broken lesson fails clearly instead of oddly */
  function checkControl(c) {
    if (!c || typeof c.id !== 'string' || !c.id) return 'a control has no id';
    if (!BUILDERS[c.type]) return 'control "' + c.id + '" has an unknown type "' + c.type + '"';
    if (typeof c.label !== 'string' || !c.label) return 'control "' + c.id + '" has no label';
    if (c.type === 'slider' || c.type === 'number') {
      if (!(typeof c.min === 'number' && typeof c.max === 'number' && c.min < c.max)) return 'control "' + c.id + '" needs min < max';
      if (!(typeof c.value === 'number' && c.value >= c.min && c.value <= c.max)) return 'control "' + c.id + '" needs a value between min and max';
    }
    if (c.type === 'choice' && !(Array.isArray(c.options) && c.options.length >= 2)) return 'control "' + c.id + '" needs at least 2 options';
    return null;
  }

  // ---------------------------------------------------------------- readouts + running the lesson

  function buildReadout(o) {
    var meter = o.display === 'meter';
    var value = el('span', { className: 'readout-value', text: '—' });
    var note = el('span', { className: 'readout-note' });
    var fill = meter ? el('i', { className: 'meter-fill' }) : null;
    var node = el('div', { className: 'readout' + (meter ? ' readout-meter' : ''), style: accentStyle(o.color) }, [
      el('dt', {}, [o.icon ? el('span', { className: 'control-icon', 'aria-hidden': 'true', text: String(o.icon).slice(0, 4) }) : null, document.createTextNode(o.label)]),
      el('dd', {}, [value, o.unit ? el('span', { className: 'unit', text: o.unit }) : null, note]),
      meter ? el('dd', { className: 'meter-row', 'aria-hidden': 'true' }, [el('span', { className: 'meter' }, [fill])]) : null,
    ]);
    var max = typeof o.max === 'number' && o.max > 0 ? o.max : 100;
    readoutViews[o.id] = { el: node, value: value, note: note, decimals: o.decimals, fill: fill, max: max };
    return node;
  }

  function showOutput(id, result) {
    var view = readoutViews[id];
    if (!view) return;
    var data = typeof result === 'object' && result !== null ? result : { value: result };
    lastOutputs[id] = data.value;
    view.value.textContent = formatNumber(data.value, view.decimals);
    if (view.fill) {
      var share = typeof data.value === 'number' && isFinite(data.value) ? Math.max(0, Math.min(1, data.value / view.max)) : 0;
      view.fill.style.width = (share * 100).toFixed(1) + '%';
    }
    var status = STATUS_SYMBOLS[data.status] ? data.status : null;
    if (status) view.el.setAttribute('data-status', status);
    else view.el.removeAttribute('data-status');
    view.note.textContent = '';
    if (data.note) view.note.textContent = data.note;
    else if (status) {
      view.note.appendChild(el('span', { 'aria-hidden': 'true', text: STATUS_SYMBOLS[status] }));
      view.note.appendChild(el('span', { className: 'visually-hidden', text: STATUS_WORDS[status] }));
    }
  }

  function run() {
    if (typeof lesson.update !== 'function') return;
    var result;
    try {
      result = lesson.update(Object.assign({}, values), api) || {};
    } catch (err) {
      showError(err);
      return;
    }
    errorEl.hidden = true;
    var outputs = result.outputs || {};
    for (var id in readoutViews) {
      if (id in outputs || !liveOutputs[id]) showOutput(id, outputs[id]);
    }
    showExplanation(result.explanation);
    var strengths = result.equation || {};
    for (var termId in termViews) {
      var f = typeof strengths[termId] === 'number' && isFinite(strengths[termId]) ? Math.max(0, Math.min(1, strengths[termId])) : 1;
      termViews[termId].style.setProperty('--f', String(f));
    }
  }

  /** The explanation: a sentence, or { lead: 'Slowed down by water.', text: '…', tone: 'good' | 'warning' | 'bad' } */
  function showExplanation(explanation) {
    explanationEl.textContent = '';
    explanationEl.removeAttribute('data-tone');
    if (typeof explanation === 'string') {
      explanationEl.textContent = explanation;
      return;
    }
    if (!explanation || typeof explanation !== 'object') return;
    if (explanation.lead) explanationEl.appendChild(el('b', { text: String(explanation.lead) }));
    if (explanation.lead && explanation.text) explanationEl.appendChild(document.createTextNode(' '));
    if (explanation.text) explanationEl.appendChild(document.createTextNode(String(explanation.text)));
    if (STATUS_SYMBOLS[explanation.tone]) explanationEl.setAttribute('data-tone', explanation.tone);
  }

  /** "What's happening": chips joined by + and arrows, e.g. carbon dioxide + water → sugar + oxygen */
  function buildEquation(eq) {
    if (!eq || !Array.isArray(eq.terms) || !eq.terms.length) return null;
    var titleId = 'equation-title';
    var parts = eq.terms.map(function (term) {
      if (term === '+' || term === '=') return el('span', { className: 'eq-sign', 'aria-hidden': 'true', text: term });
      if (typeof term === 'string') return el('span', { className: 'eq-sign', text: term });
      if (term && term.arrow) {
        return el('span', { className: 'eq-arrow' }, [
          el('span', { text: term.above || '' }),
          el('span', { className: 'eq-arrow-sign', 'aria-hidden': 'true', text: '→' }),
          el('span', { text: term.below || '' }),
        ]);
      }
      if (!term || !term.label) return null;
      var chip = el('span', { className: 'eq-chip', style: accentStyle(term.color) }, [document.createTextNode(String(term.label))]);
      if (term.id) termViews[term.id] = chip;
      return chip;
    });
    return el('section', { className: 'equation card', 'aria-labelledby': titleId }, [
      el('h2', { className: 'section-title', id: titleId, text: eq.title || "What's happening" }),
      el('p', { className: 'eq' }, parts),
      eq.note ? el('p', { className: 'section-note', text: eq.note }) : null,
    ]);
  }

  /** "Try this": a few challenges to explore with the controls */
  function buildTryThis(items) {
    if (!Array.isArray(items) || !items.length) return null;
    return el('section', { className: 'try', 'aria-labelledby': 'try-title' }, [
      el('h2', { className: 'section-title', id: 'try-title', text: 'Try this' }),
      el('ul', {}, items.slice(0, 5).map(function (item) {
        return el('li', { text: String(item) });
      })),
    ]);
  }

  function reset() {
    for (var id in defaults) {
      values[id] = defaults[id];
      if (controlViews[id]) controlViews[id].set(defaults[id]);
    }
    try {
      if (typeof lesson.reset === 'function') lesson.reset(api);
    } catch (err) {
      showError(err);
    }
    run();
  }

  // ---------------------------------------------------------------- theme, motion, height

  function notifyTheme() {
    // Wait a frame so the new colours are applied before lessons read them.
    requestAnimationFrame(function () {
      themeListeners.slice().forEach(function (callback) {
        try {
          callback(api.theme);
        } catch (err) {
          showError(err);
        }
      });
    });
  }

  function watchTheme() {
    darkQuery.addEventListener('change', notifyTheme);
    new MutationObserver(notifyTheme).observe(rootEl, { attributes: true, attributeFilter: ['data-theme'] });
    // The app sends its theme: { type: 'ilearn:theme', theme: 'light' | 'dark' | 'system' }
    window.addEventListener('message', function (event) {
      if (event.source !== window.parent || !event.data || event.data.type !== 'ilearn:theme') return;
      var theme = event.data.theme;
      if (theme === 'light' || theme === 'dark') rootEl.setAttribute('data-theme', theme);
      else rootEl.removeAttribute('data-theme');
    });
  }

  function reportHeight() {
    if (window.parent === window) return;
    var send = function () {
      // The content's own height (the root's scrollHeight is never less than the frame, so it can't shrink).
      window.parent.postMessage({ type: 'ilearn:height', height: Math.ceil(document.body.getBoundingClientRect().height) }, '*');
    };
    new ResizeObserver(send).observe(document.body);
    send();
  }

  /**
   * The subtitle with a label saying what kind of example the lesson is built on
   * ("Everyday example: …"), written by the frame so it's always the same. Any label the lesson
   * wrote itself is replaced, never doubled.
   */
  function subtitleText() {
    var text = typeof lesson.subtitle === 'string' ? lesson.subtitle.trim() : '';
    var context = window.__LESSON_CONTEXT__ || {};
    var label = EXAMPLE_LABELS[context.exampleKind];
    if (!label || !text) return text;
    text = text.replace(/^(real[\s-]?life|everyday|real[\s-]?world)\s+example\s*[:\-–—]\s*/i, '');
    return label + text.charAt(0).toUpperCase() + text.slice(1);
  }

  // ---------------------------------------------------------------- start

  function start() {
    errorEl = el('p', { className: 'lesson-error', role: 'alert', hidden: true });

    if (!lesson || typeof lesson !== 'object') {
      app.appendChild(el('main', { className: 'lesson' }, [errorEl]));
      showError(new Error('The lesson code is missing or could not be read.'));
      return;
    }
    var controls = Array.isArray(lesson.controls) ? lesson.controls : [];
    var outputs = Array.isArray(lesson.outputs) ? lesson.outputs : [];
    var problem = null;
    controls.forEach(function (c) {
      problem = problem || checkControl(c);
    });
    if (problem) {
      app.appendChild(el('main', { className: 'lesson' }, [errorEl]));
      showError(new Error('Lesson problem: ' + problem));
      return;
    }

    controls.forEach(function (c) {
      defaults[c.id] = initialValue(c);
      values[c.id] = defaults[c.id];
    });

    stageEl = el('div', { className: 'stage' });
    explanationEl = el('p', { className: 'explanation', 'aria-live': 'polite' });
    var resetButton = el('button', { className: 'button button-secondary', type: 'button', text: 'Reset' });
    resetButton.addEventListener('click', reset);

    // Scene on the left; one panel on the right with the controls, then the results and Reset.
    var panel = el('aside', { className: 'panel card', 'aria-label': 'Controls and results' }, [
      controls.length ? el('div', { className: 'controls' }, controls.map(function (c) { return BUILDERS[c.type](c); })) : null,
      el('section', { className: 'results' + (controls.length ? '' : ' results-only'), 'aria-label': 'Results' }, [
        outputs.length ? el('dl', { className: 'readouts' }, outputs.map(buildReadout)) : null,
        explanationEl,
      ]),
      el('div', { className: 'lesson-actions' }, [resetButton]),
    ]);

    app.appendChild(
      el('main', { className: 'lesson' }, [
        el('header', { className: 'lesson-header' }, [
          el('h1', { className: 'lesson-title', text: lesson.title || 'Interactive' }),
          subtitleText() ? el('p', { className: 'lesson-subtitle', text: subtitleText() }) : null,
          lesson.intro ? el('p', { className: 'lesson-intro', text: String(lesson.intro) }) : null,
        ]),
        el('div', { className: 'lesson-body' }, [el('section', { className: 'stage-card', 'aria-label': 'Scene' }, [stageEl]), panel]),
        buildEquation(lesson.equation),
        buildTryThis(lesson.tryThis),
        errorEl,
      ]),
    );

    controls.forEach(function (c) {
      controlViews[c.id].set(values[c.id]);
    });
    watchTheme();
    try {
      if (typeof lesson.setup === 'function') lesson.setup(stageEl, api);
    } catch (err) {
      showError(err);
      return;
    }
    run();
    reportHeight();
    // Lets the self-test drive the lesson (only in pages built for testing).
    if (window.__LESSON_SELFTEST__) {
      window.__LESSON_ENGINE__ = {
        lesson: lesson,
        stage: stageEl,
        api: api,
        defaults: defaults,
        /** The last number shown for each output */
        outputs: function () {
          return Object.assign({}, lastOutputs);
        },
      };
    }
  }

  start();
})();
