// Builds the sample lessons in examples/interactive/ into HTML files in out/, to open in a browser.
//
//   npm run preview:interactive
//
// The brand theme and fonts come from the app (--theme / --fonts: CSS files; I-Learn makes them
// with `npm run build:theme`). Without them the page still works, just unstyled.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildInteractiveHtml } from "../src/interactive/buildHtml.js";

const { values } = parseArgs({ options: { theme: { type: "string" }, fonts: { type: "string" } } });
const read = (file: string | undefined, what: string) => {
  if (!file) return undefined;
  try {
    return readFileSync(resolve(file), "utf8");
  } catch {
    console.warn(`Couldn't read the ${what} file ${file}; building without it.`);
    return undefined;
  }
};
const themeCss = read(values.theme, "theme");
const fontsCss = read(values.fonts, "fonts");

const examples = "examples/interactive";
mkdirSync("out", { recursive: true });
for (const file of readdirSync(examples).filter((f) => f.endsWith(".js"))) {
  const name = basename(file, ".js");
  const html = buildInteractiveHtml({ lessonCode: readFileSync(join(examples, file), "utf8"), title: name, themeCss, fontsCss });
  writeFileSync(join("out", `${name}.html`), html);
  console.log(`out/${name}.html (${Math.round(html.length / 1024)} KB)`);
}
