/*
 * Added to custom lesson pages (the "custom" escape hatch, written whole by the model).
 * Gives them what the frame gives normal lessons: follows the app's theme, reports the page height
 * to the app, and records errors for the self-test.
 */
(function () {
  'use strict';
  var rootEl = document.documentElement;
  rootEl.setAttribute('data-lesson-mode', 'custom');

  var diag = (window.__LESSON_DIAG__ = { errors: [], unknownColors: [] });
  window.addEventListener('error', function (event) {
    diag.errors.push(String(event.message || event.error || 'Unknown error'));
  });

  // The app sends its theme: { type: 'ilearn:theme', theme: 'light' | 'dark' | 'system' }
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data || event.data.type !== 'ilearn:theme') return;
    var theme = event.data.theme;
    if (theme === 'light' || theme === 'dark') rootEl.setAttribute('data-theme', theme);
    else rootEl.removeAttribute('data-theme');
  });

  if (window.parent !== window) {
    var send = function () {
      // The content's own height (the root's scrollHeight is never less than the frame, so it can't shrink).
      window.parent.postMessage({ type: 'ilearn:height', height: Math.ceil(document.body.getBoundingClientRect().height) }, '*');
    };
    window.addEventListener('DOMContentLoaded', function () {
      new ResizeObserver(send).observe(document.body);
      send();
    });
  }
})();
