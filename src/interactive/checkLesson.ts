/**
 * Static checks for AI-written lesson code and custom lesson pages.
 *
 * These read the code as text and never run it. (Running AI-written code is only safe in a real
 * browser sandbox: see frame/selftest.js, which apps run in a sandboxed page.)
 *
 * Each problem is an "error" (the lesson must not be used: unsafe, broken or off-brand in a
 * definite way) or a "warning" (worth one retry to fix, but the lesson is still usable).
 */

export type ProblemSeverity = "error" | "warning";

export interface LessonProblem {
  severity: ProblemSeverity;
  /** Plain words, written so the model can fix it (it is sent back on a retry) */
  message: string;
}

/** Colour names lessons may pass to api.color() (must match frame/engine.js) */
export const LESSON_COLORS = [
  "primary", "primary-hover", "on-primary", "background", "surface", "surface-raised", "border",
  "text", "text-muted", "success", "warning", "danger", "on-danger",
  "scene-sky", "scene-night", "scene-ground", "scene-soil", "scene-water", "scene-plant", "scene-sun", "scene-air",
  "scene-sugar", "scene-heat", "scene-cool", "scene-metal", "scene-wall", "scene-clay",
  "illustration-skin", "illustration-skin-deep", "illustration-hair", "illustration-wood", "illustration-accent",
];

const MAX_LESSON_BYTES = 60_000;
const MAX_CUSTOM_BYTES = 80_000;

/** CSS colour keywords a lesson might write by hand instead of using api.color() */
const NAMED_COLORS = new Set([
  "white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "brown", "gray", "grey",
  "cyan", "magenta", "lime", "navy", "teal", "olive", "maroon", "silver", "gold", "beige", "ivory",
  "skyblue", "lightblue", "darkblue", "lightgreen", "darkgreen", "lightgray", "lightgrey", "darkgray", "darkgrey",
]);

/** Things lesson code must never do: network, loading code, leaving the stage, storage, pop-ups */
const FORBIDDEN_CODE: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/, "uses fetch() (lessons can't use the network)"],
  [/\b(XMLHttpRequest|WebSocket|EventSource)\b/, "opens a network connection (lessons can't use the network)"],
  [/\bsendBeacon\b/, "uses navigator.sendBeacon (lessons can't use the network)"],
  [/\bimport\s*\(|^\s*import[\s{*]/m, "uses import (lessons can't load other code)"],
  [/\brequire\s*\(/, "uses require() (lessons can't load other code)"],
  [/\beval\s*\(/, "uses eval()"],
  [/\bFunction\s*\(/, "builds code from text with Function()"],
  [/\.\s*(innerHTML|outerHTML)\s*=|\binsertAdjacentHTML\b/, "writes HTML strings with innerHTML (build elements with api.svg or document.createElement)"],
  [/\bdocument\s*\.\s*write/, "uses document.write"],
  [/\b(localStorage|sessionStorage|indexedDB)\b|\bdocument\s*\.\s*cookie\b/, "stores data in the browser (lessons can't store anything)"],
  [/\bwindow\s*\.\s*(open|parent|top|opener)\b|\bpostMessage\s*\(/, "reaches outside the lesson page (window.open, parent, postMessage)"],
  [/\b(alert|confirm|prompt)\s*\(/, "uses alert/confirm/prompt pop-ups"],
  [/\bdocument\s*\.\s*(body|head|documentElement)\b/, "changes the page outside the stage (only draw inside `stage`)"],
  [/\bsetTimeout\s*\(\s*["'`]|\bsetInterval\s*\(\s*["'`]/, "passes code as text to setTimeout/setInterval"],
];

/**
 * Lessons are one live scene: no "steps" control (Back / Next through stages). A process is shown
 * all at once, driven by sliders. (The frame no longer has a steps control.)
 */
const STEPS_CONTROL = /\btype\s*:\s*["'`]steps["'`]/;

interface Scanned {
  /** The code without comments or string contents (so words inside text don't count as code) */
  codeOnly: string;
  /** Every string and template literal's contents */
  strings: string[];
}

/**
 * Splits JavaScript into code, comments and strings, well enough for these checks. Regex literals
 * aren't recognised; a quote inside one could confuse the split, which only affects these checks.
 */
function scan(source: string): Scanned {
  let codeOnly = "";
  const strings: string[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      codeOnly += " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let content = "";
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\") {
          content += source.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (c !== "`" && source[j] === "\n") break; // unterminated: stop at the line end
        content += source[j];
        j++;
      }
      strings.push(content);
      codeOnly += c + " ".repeat(Math.min(content.length, 1)) + c;
      i = j + 1;
      continue;
    }
    codeOnly += c;
    i++;
  }
  return { codeOnly, strings };
}

/** Problems with hand-written colours in strings */
function colourProblems(strings: string[]): LessonProblem[] {
  const problems: LessonProblem[] = [];
  const add = (severity: ProblemSeverity, message: string) => {
    if (!problems.some((p) => p.message === message)) problems.push({ severity, message });
  };
  for (const raw of strings) {
    const s = raw.trim();
    const lower = s.toLowerCase();
    if (/^#[0-9a-f]{3,8}$/i.test(s) || /(^|[^a-z-])(rgb|hsl)a?\s*\(/i.test(s)) {
      add("error", `The code writes the colour "${s.slice(0, 40)}" itself. Use api.color() with a brand colour name instead.`);
    } else if (NAMED_COLORS.has(lower)) {
      add("warning", `The code uses the colour name "${s}". Use api.color() with a brand colour name instead.`);
    } else if (/^(scene|illustration)-[a-z-]+$/.test(s) && !LESSON_COLORS.includes(s)) {
      add("error", `"${s}" is not a colour name. Use only these with api.color(): ${LESSON_COLORS.join(", ")}.`);
    }
  }
  return problems;
}

/** Static checks on a lesson's code (the object literal put into the frame). */
export function checkLessonCode(lessonCode: string): LessonProblem[] {
  const problems: LessonProblem[] = [];
  const bytes = Buffer.byteLength(lessonCode, "utf8");
  if (bytes > MAX_LESSON_BYTES) {
    problems.push({ severity: "error", message: `The lesson code is too long (${Math.round(bytes / 1024)} KB; the limit is ${MAX_LESSON_BYTES / 1000} KB). Simplify it.` });
  }

  if (STEPS_CONTROL.test(lessonCode)) {
    problems.push({
      severity: "error",
      message:
        'The lesson uses a "steps" control. Don\'t split it into steps: show the whole process in one live scene, ' +
        "with sliders that change it and everything happening at once.",
    });
  }

  const { codeOnly, strings } = scan(lessonCode);
  for (const [pattern, what] of FORBIDDEN_CODE) {
    if (pattern.test(codeOnly)) problems.push({ severity: "error", message: `The code ${what}. Remove it.` });
  }
  if (/\b(https?:|javascript:|data:)\/?\/?/i.test(strings.join("\n"))) {
    problems.push({ severity: "error", message: "The code contains a link or URL. Lessons can't link anywhere; remove it." });
  }
  if (/<\s*(script|iframe|a|img|link|object|embed)\b/i.test(strings.join("\n"))) {
    problems.push({ severity: "error", message: "The code contains HTML tags in text. Build elements with api.svg or document.createElement instead." });
  }
  // A colour name built at run time can't be checked here; the browser self-test checks the names used.
  problems.push(...colourProblems(strings));
  return problems;
}

/** Static checks on a whole custom lesson page (the "custom" escape hatch). */
export function checkCustomHtml(html: string): LessonProblem[] {
  const problems: LessonProblem[] = [];
  const add = (message: string, severity: ProblemSeverity = "error") => problems.push({ severity, message });
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > MAX_CUSTOM_BYTES) add(`The page is too long (${Math.round(bytes / 1024)} KB; the limit is ${MAX_CUSTOM_BYTES / 1000} KB). Simplify it.`);

  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) add("The page loads a script file. Put all code inline.");
  if (/<link\b/i.test(html)) add("The page uses <link>. Put all styles inline; fonts and brand styles are added for you.");
  if (/@import\b/i.test(html)) add("The page uses @import. Put all styles inline.");
  if (/<(img|iframe|frame|object|embed|video|audio|source|track)\b/i.test(html)) add("The page uses images, frames or media elements. Draw with inline SVG instead.");
  if (/<a\b[^>]*\bhref/i.test(html) || /<form\b/i.test(html)) add("The page has links or forms. Lessons can't link anywhere.");
  if (/https?:\/\/|javascript:/i.test(html.replace(/xmlns(:\w+)?="http:\/\/www\.w3\.org\/[^"]*"/g, ""))) add("The page contains a URL. Lessons can't use the network or link anywhere.");
  if (/url\s*\(\s*["']?(?!#)/i.test(html)) add("The page uses url() in CSS. Lessons can't load files.");
  if (/<meta\b[^>]*http-equiv/i.test(html)) add("The page sets its own <meta http-equiv>. Remove it; security settings are added for you.");
  if (!/<(input|button|select|textarea)\b|addEventListener\s*\(|\bon(click|input|change|keydown|pointerdown)\s*=/i.test(html)) {
    add("The page has nothing the student can interact with.");
  }

  // Scripts get the same checks as lesson code; styles must use the brand's CSS variables.
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  for (const script of scripts) {
    for (const p of checkLessonCode(script)) {
      if (!problems.some((q) => q.message === p.message)) problems.push(p);
    }
  }
  const outsideScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const hex = outsideScripts.match(/(?<!&)#[0-9a-fA-F]{3,8}\b(?=[^<>]*[;"'}\s])/);
  if (hex || /\b(rgb|hsl)a?\s*\(/i.test(outsideScripts)) {
    add(`The page writes colours itself${hex ? ` (e.g. ${hex[0]})` : ""}. Use the brand's CSS variables, e.g. var(--color-primary) or var(--scene-sky).`);
  }
  if (/font-family\s*:\s*(?!\s*var\()/i.test(outsideScripts)) {
    add("The page sets fonts itself. Use var(--font-body), var(--font-heading) or var(--font-mono).", "warning");
  }
  return problems;
}
