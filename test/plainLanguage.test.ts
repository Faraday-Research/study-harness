import { describe, expect, it } from "vitest";
import { checkPlainLanguage } from "../src/plainLanguage.js";
import type { ResearchReport } from "../src/researchReport.js";

const report = (summary: string, examples: Array<[string, string]> = [], steps: string[] = []): ResearchReport => ({
  topic: "x", focus: "general", summary,
  facts: [], processSteps: steps.map((text, i) => ({ order: i + 1, text, sources: [] })),
  formulas: [], quantities: [], realWorldUses: [], misconceptions: [], gaps: [], sources: [],
  everydayExamples: examples.map(([situation, connection], i) => ({ id: `E${i + 1}`, situation, connection, sources: [] })),
});

describe("checkPlainLanguage", () => {
  it("passes a simple summary and everyday examples", () => {
    const r = report(
      "Plants make their own food from sunlight, water and air. The green colour in leaves, called chlorophyll, catches the sunlight. As they do this, plants give out the oxygen we breathe.",
      [["You lift a pot that sat on the grass for a week. The grass under it is pale yellow.", "Without sunlight, the grass can't make its food, so it loses its green colour."]],
      ["Light-dependent reactions happen in the chloroplasts.", "Carbon fixation makes sugar."],
    );
    expect(checkPlainLanguage(r, "How plants make food from sunlight")).toEqual([]);
  });

  it("flags abbreviations, formulas, unexplained jargon and long summaries", () => {
    const r = report(
      "Photosynthesis makes ATP and NADPH in chloroplasts. It uses CO2 and H2O. Plants grow. Oxygen is released.",
      [["A puddle gets smaller in the sun.", "The water turns into vapour through evaporation, a reactant leaves."]],
    );
    const problems = checkPlainLanguage(r, "photosynthesis");
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Summary: it has 4 sentences/),
        'Summary: "ATP" is an abbreviation or chemical formula. Say it in everyday words, or leave it out.',
        expect.stringContaining('"NADPH"'),
        expect.stringContaining('"CO2"'),
        expect.stringContaining('"H2O"'),
        expect.stringContaining('Summary: "chloroplasts" is a technical word'),
        expect.stringContaining('Everyday example E1 (connection): "vapour"'),
        expect.stringContaining('"evaporation"'),
        expect.stringContaining('"reactant"'),
      ]),
    );
    expect(problems.some((p) => p.includes('"photosynthesis"'))).toBe(false); // the topic's own name is fine
  });

  it("allows an explained technical word in the summary, but not in examples", () => {
    const r = report("Mitochondria, the parts that release energy, keep the cell going.", [["You run fast.", "Your mitochondria work harder."]]);
    expect(checkPlainLanguage(r, "cells")).toEqual([
      'Everyday example E1 (connection): "mitochondria" is a technical word. Describe what the student sees, in everyday words only.',
    ]);
  });

  it("treats the report's own process names as technical, but not the topic's words", () => {
    const r = report("Water moves around the Earth.", [["Clothes dry on a line.", "Transpiration happens."]], ["Transpiration moves water from plants into the air."]);
    expect(checkPlainLanguage(r, "the water cycle")).toEqual([expect.stringContaining('"transpiration"')]);
    expect(checkPlainLanguage(report("We add fractions with different denominators by finding a common one.", []), "adding fractions with different denominators")).toEqual([]);
  });
});
