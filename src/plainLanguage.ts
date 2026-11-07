/**
 * Checks that the student-facing parts of a research report are simple:
 *   - summary: at most 3 short sentences; no abbreviations or chemical formulas; a technical word
 *     only when it's explained in the same sentence
 *   - everyday examples: no technical words at all, short sentences
 * (Facts, steps and formulas are for the teacher and aren't checked.)
 *
 * It's a heuristic, so it catches the clear cases (ATP, NADPH, CO2, "chloroplast", "reactant",
 * process names like "evaporation", long sentences). Whether an ordinary-looking word is too hard
 * is left to the skill's instructions.
 *
 * Each problem is written as an instruction for the model, which gets one chance to fix them.
 */
import type { ResearchReport } from "./researchReport.js";

const MAX_SUMMARY_SENTENCES = 3;
const MAX_SENTENCE_WORDS = 25;

/** Short capitalised words that are everyday, not jargon */
const EVERYDAY_CAPS = new Set(["TV", "UK", "US", "USA", "OK", "AM", "PM", "PE"]);

/** Words or parts of words that are science jargon for a young student */
const JARGON =
  /\b(\w*(plast|plasm|phyll|cyte|lysis|genesis)\w*|mitochondri\w*|organelles?|molecules?|molecular|atoms?|atomic|reactants?|enzymes?|pigments?|photons?|electrons?|protons?|neutrons?|ions|isotopes?|glucose|nucleus|nuclei|cellulose|stomata|xylem|phloem|kinetic|denominators?|numerators?|equivalent|evaporat\w*|condens\w*|precipitation|transpir\w*|respiration|infiltration|sublimat\w*|vapou?r|photosynthe\w*)\b/gi;

/** Explains a word in the same sentence: "called X", "X, which…", "X (…)", "X means…", "X — …" */
const EXPLAINED = /\b(called|known as|which|that is|means|meaning)\b|[(—–]|,\s+(a|an|the)\s/i;

const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const wordCount = (sentence: string) => sentence.split(/\s+/).filter(Boolean).length;

/** Abbreviations (ATP, NADPH) and chemical formulas (CO2, H2O, C6H12O6, CO₂) in a text */
function abbreviations(text: string): string[] {
  const found = new Set<string>();
  for (const [word] of text.matchAll(/\b[A-Z][A-Z0-9]+\b|\b(?:[A-Z][a-z]?\d+)+[A-Za-z0-9]*\b|\b\w*[₀-₉]\w*/g)) {
    if (!EVERYDAY_CAPS.has(word)) found.add(word);
  }
  return [...found];
}

/** Words the report itself uses as names of processes, e.g. "evaporation", "transpiration" */
function processNames(report: ResearchReport, topic: string): Set<string> {
  const topicWords = topicWordsOf(topic);
  const teacherText = [
    ...report.processSteps.map((s) => s.text),
    ...report.facts.map((f) => f.text),
  ].join(" ");
  const names = new Set<string>();
  for (const [word] of teacherText.toLowerCase().matchAll(/\b[a-z]{8,}(?:ation|tion|sis)\b/g)) {
    if (!topicWords.has(stem(word))) names.add(word);
  }
  return names;
}

/** "denominators" and "denominator" count as the same word */
const stem = (word: string) => word.toLowerCase().replace(/s$/, "");

/** Words of the topic itself (stemmed); naming the topic is fine */
const topicWordsOf = (topic: string) => new Set((topic.toLowerCase().match(/[a-z]+/g) ?? []).map(stem));

/** Technical words in a text: jargon, plus the report's own process names (not words from the topic) */
function technicalWords(text: string, processes: Set<string>, topicWords: Set<string>): string[] {
  const found = new Set<string>();
  for (const [word] of text.matchAll(JARGON)) {
    if (!topicWords.has(stem(word))) found.add(word.toLowerCase());
  }
  for (const [word] of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    if (processes.has(word)) found.add(word);
  }
  return [...found];
}

/** Problems with the summary and everyday examples, as instructions to fix them. Empty when clean. */
export function checkPlainLanguage(report: ResearchReport, topic: string): string[] {
  const problems: string[] = [];
  const topicWords = topicWordsOf(topic);
  const processes = processNames(report, topic);

  // Summary: short, main idea only, technical words explained where they're used.
  const summarySentences = sentencesOf(report.summary);
  if (summarySentences.length > MAX_SUMMARY_SENTENCES) {
    problems.push(`Summary: it has ${summarySentences.length} sentences. Keep only the main idea in at most ${MAX_SUMMARY_SENTENCES} short sentences.`);
  }
  for (const sentence of summarySentences) {
    if (wordCount(sentence) > MAX_SENTENCE_WORDS) {
      problems.push(`Summary: this sentence is too long; split or shorten it: "${sentence}"`);
    }
    for (const abbr of abbreviations(sentence)) {
      problems.push(`Summary: "${abbr}" is an abbreviation or chemical formula. Say it in everyday words, or leave it out.`);
    }
    if (!EXPLAINED.test(sentence)) {
      for (const word of technicalWords(sentence, processes, topicWords)) {
        problems.push(`Summary: "${word}" is a technical word and isn't explained. Explain it in plain words in the same sentence, or leave it out.`);
      }
    }
  }

  // Everyday examples: what the student sees, in everyday words only.
  for (const example of report.everydayExamples) {
    for (const [part, text] of [["situation", example.situation], ["connection", example.connection]] as const) {
      const where = `Everyday example ${example.id || ""} (${part})`.replace("  ", " ");
      for (const abbr of abbreviations(text)) {
        problems.push(`${where}: "${abbr}" is an abbreviation or chemical formula. Use only everyday words.`);
      }
      for (const word of technicalWords(text, processes, topicWords)) {
        problems.push(`${where}: "${word}" is a technical word. Describe what the student sees, in everyday words only.`);
      }
      for (const sentence of sentencesOf(text)) {
        if (wordCount(sentence) > MAX_SENTENCE_WORDS) problems.push(`${where}: this sentence is too long: "${sentence}"`);
      }
    }
  }
  return [...new Set(problems)];
}

/** The message asking the model to rewrite just the student-facing parts. */
export function simplifyRequest(problems: string[]): string {
  return (
    "The summary and everyday examples must be simple for students (see WRITING FOR STUDENTS). " +
    `Please fix these problems:\n\n<problems>\n${problems.map((p) => `- ${p}`).join("\n")}\n</problems>\n\n` +
    "Don't search again. Keep the same facts, example ids and source ids; change only the wording. " +
    'Reply with ONLY this JSON, no other text: {"summary": "...", "everyday_examples": [ every example, ' +
    'each with "id", "situation", "connection" and "sources" ]}'
  );
}
