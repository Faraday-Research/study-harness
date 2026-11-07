/**
 * Builds an interactive lesson's HTML file: the frame (frame/) with a lesson's code put in.
 *
 * The frame is the same for every lesson: page layout, controls, readouts, theme and the engine
 * that runs it all. The lesson code is the topic-specific part (scene, controls, formula,
 * explanation); see the comment at the top of frame/engine.js for its shape.
 *
 * The brand theme and fonts are passed in as CSS text, because they belong to the app using the
 * harness (I-Learn compiles them from its tokens.scss); the harness has no brand of its own.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface BuildInteractiveOptions {
  /** The lesson as a JavaScript expression: an object literal `{ title, controls, setup, update, … }` */
  lessonCode: string;
  /** Page title (shown in the browser tab when the file is opened on its own) */
  title: string;
  /** The brand's design tokens as CSS (`:root { --color-primary: … }` with light and dark) */
  themeCss?: string;
  /** @font-face rules for the brand fonts, with data: URLs (the page can't load files) */
  fontsCss?: string;
  /**
   * Add the self-test (frame/selftest.js): the page then exercises the lesson and reports problems
   * in window.__LESSON_TEST_RESULT__. Only for testing pages in a sandboxed browser, never for students.
   */
  selfTest?: boolean;
  /**
   * What the lesson is built on; the frame labels the subtitle with it ("Everyday example: …").
   * Omit when unknown (no label).
   */
  exampleKind?: ExampleKind;
}

/** An everyday example (E1…) or a real-world use (R1…) from the research report */
export type ExampleKind = "everyday" | "real-world";

export interface BuildCustomOptions extends Omit<BuildInteractiveOptions, "lessonCode"> {
  /** A whole page written by the model (the custom escape hatch) */
  html: string;
}

const FRAME_DIR = fileURLToPath(new URL("./frame/", import.meta.url));

let frame: { html: string; css: string; engine: string; selftest: string; customBridge: string } | null = null;

/** The frame's files, read once. */
function frameFiles() {
  frame ??= {
    html: readFileSync(FRAME_DIR + "frame.html", "utf8"),
    css: readFileSync(FRAME_DIR + "frame.css", "utf8"),
    engine: readFileSync(FRAME_DIR + "engine.js", "utf8"),
    selftest: readFileSync(FRAME_DIR + "selftest.js", "utf8"),
    customBridge: readFileSync(FRAME_DIR + "custom-bridge.js", "utf8"),
  };
  return frame;
}

/** Keeps code from ending its <script> early ("</script>" or "<!--" inside a string). */
const safeScript = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** Keeps CSS from ending its <style> early. */
const safeStyle = (css: string) => css.replace(/<\/(style)/gi, "<\\/$1");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The finished, self-contained HTML page. */
export function buildInteractiveHtml(options: BuildInteractiveOptions): string {
  const files = frameFiles();
  const parts: Record<string, string> = {
    "{{TITLE}}": escapeHtml(options.title),
    "/*{{FONTS_CSS}}*/": safeStyle(options.fontsCss ?? ""),
    "/*{{THEME_CSS}}*/": safeStyle(options.themeCss ?? ""),
    "/*{{FRAME_CSS}}*/": safeStyle(files.css),
    "/*{{CONTEXT_JSON}}*/ null": safeScript(JSON.stringify({ exampleKind: options.exampleKind ?? null })),
    "/*{{LESSON_JS}}*/ undefined": `(\n${safeScript(options.lessonCode.trim())}\n)`,
    "/*{{ENGINE_JS}}*/": options.selfTest
      ? `window.__LESSON_SELFTEST__ = true;\n${safeScript(files.engine)}\n</script>\n    <script>\n${safeScript(files.selftest)}`
      : safeScript(files.engine),
  };
  // One pass with a function replacer, so "$" in the inserted code is never treated specially
  // and inserted text is never searched for placeholders again.
  const pattern = new RegExp(Object.keys(parts).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return files.html.replace(pattern, (match) => parts[match]!);
}

/** The same security policy as the frame: nothing may load from the network. */
const CSP =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:" />`;

/**
 * A custom lesson page (written whole by the model), made safe and on-brand: the security policy,
 * the brand fonts and theme, and the bridge (theme, height, error reporting) go at the start of
 * <head>, so they apply before anything the page does.
 */
export function buildCustomHtml(options: BuildCustomOptions): string {
  const files = frameFiles();
  const head = [
    `<meta charset="utf-8" />`,
    CSP,
    `<title>${escapeHtml(options.title)}</title>`,
    `<style>\n${safeStyle(options.fontsCss ?? "")}\n</style>`,
    `<style>\n${safeStyle(options.themeCss ?? "")}\n</style>`,
    `<script>\n${options.selfTest ? "window.__LESSON_SELFTEST__ = true;\n" : ""}${safeScript(files.customBridge)}\n</script>`,
  ].join("\n");

  // Drop the page's own doctype/html/head wrappers and title; keep its styles, body and scripts.
  const page = options.html
    .replace(/<!doctype[^>]*>/i, "")
    .replace(/<\/?html\b[^>]*>/gi, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/<\/?head\b[^>]*>/gi, "");
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(page);
  const beforeBody = bodyMatch ? page.slice(0, bodyMatch.index) : "";
  const body = bodyMatch ? bodyMatch[1]! : page;
  const selftest = options.selfTest ? `\n<script>\n${safeScript(files.selftest)}\n</script>` : "";

  return `<!doctype html>\n<html lang="en">\n<head>\n${head}\n${beforeBody.trim()}\n</head>\n<body>\n${body.trim()}${selftest}\n</body>\n</html>\n`;
}
