import { describe, expect, it } from "vitest";
import { checkCustomHtml, checkLessonCode } from "../src/interactive/checkLesson.js";

const messages = (code: string) => checkLessonCode(code).map((p) => `${p.severity}: ${p.message}`);

describe("checkLessonCode", () => {
  it("passes a clean lesson, and ignores words in comments and text", () => {
    expect(
      checkLessonCode(`{
        // fetch( and import( in a comment are fine
        setup(stage, api) { api.svg("rect", { fill: api.color("scene-plant") }, api.svg("svg", {}, stage)); },
        update(v) { return { explanation: "Roots fetch water; it's important. Plants import nothing. #1 fact" }; },
      }`),
    ).toEqual([]);
  });

  it.each([
    ["fetch('/x')", "uses fetch()"],
    ["new XMLHttpRequest()", "opens a network connection"],
    ["import('x')", "uses import"],
    ["eval('1')", "uses eval()"],
    ["new Function('return 1')", "Function()"],
    ["stage.innerHTML = s", "innerHTML"],
    ["localStorage.setItem('a', 1)", "stores data"],
    ["window.parent.x", "reaches outside"],
    ["alert('hi')", "pop-ups"],
    ["document.body.appendChild(x)", "outside the stage"],
    ["setTimeout('go()', 1)", "code as text"],
  ])("flags %s", (code, expected) => {
    const found = messages(`{ setup(stage) { ${code}; } }`);
    expect(found.some((m) => m.startsWith("error:") && m.includes(expected))).toBe(true);
  });

  it("flags URLs, HTML in text, and colours not from the brand", () => {
    const found = messages(`{ a: "https://example.com", b: "<script>", c: "#ff0000", d: "rgb(1,2,3)", e: "white", f: "scene-wood", g: "illustration-wood" }`);
    expect(found).toEqual([
      "error: The code contains a link or URL. Lessons can't link anywhere; remove it.",
      "error: The code contains HTML tags in text. Build elements with api.svg or document.createElement instead.",
      'error: The code writes the colour "#ff0000" itself. Use api.color() with a brand colour name instead.',
      'error: The code writes the colour "rgb(1,2,3)" itself. Use api.color() with a brand colour name instead.',
      'warning: The code uses the colour name "white". Use api.color() with a brand colour name instead.',
      expect.stringMatching(/^error: "scene-wood" is not a colour name/),
    ]);
  });

  it("rejects a steps control (lessons are one live scene)", () => {
    const found = messages(`{ controls: [{ type: "steps", id: "stage", label: "Stage", steps: [{ label: "A" }, { label: "B" }] }] }`);
    expect(found[0]).toMatch(/^error: The lesson uses a "steps" control/);
    expect(messages(`{ update() { return { explanation: "It happens in steps" }; } }`)).toEqual([]); // the word alone is fine
  });

  it("limits the size", () => {
    expect(messages(`{ a: "${"x".repeat(61_000)}" }`)[0]).toMatch(/too long/);
  });
});

describe("checkCustomHtml", () => {
  it("passes a clean page using the brand's variables", () => {
    expect(
      checkCustomHtml(`<style>body { color: var(--color-text); font-family: var(--font-body) }</style>
        <svg xmlns="http://www.w3.org/2000/svg"><text>&#8211;</text></svg>
        <button id="b">Go</button><script>b.addEventListener("click", () => {});</script>`),
    ).toEqual([]);
  });

  it("flags files, links, own colours and fonts, and pages with nothing to do", () => {
    const found = checkCustomHtml(`<link rel="stylesheet" href="x.css"><img src="a.png"><a href="#">x</a>
      <style>p { color: #123456; font-family: Arial; background: url(x.png) }</style><p>Static</p>
      <script>fetch("/x")</script>`).map((p) => p.message);
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringContaining("<link>"),
        expect.stringContaining("images, frames or media"),
        expect.stringContaining("links or forms"),
        expect.stringContaining("url() in CSS"),
        expect.stringContaining("nothing the student can interact with"),
        expect.stringContaining("uses fetch()"),
        expect.stringContaining("writes colours itself (e.g. #123456)"),
        expect.stringContaining("sets fonts itself"),
      ]),
    );
  });
});
