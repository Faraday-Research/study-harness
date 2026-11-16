/**
 * Topic thumbnail: one transparent SVG (teal glow + a simple line diagram of the topic), drawn by
 * the mentor-thumbnail-generator skill. The app shows it on the right of the topic's banner.
 *
 * One model call, no tools. The reply is checked in code (checkThumbnail); if it fails, the model
 * gets one chance to fix the listed problems. The SVG is untrusted model output: the checks refuse
 * anything that could run code or load something from outside (scripts, event handlers, external
 * links, embedded images, styles), and the app shows it only as an <img>, which never runs scripts.
 */
import { builtinSkillPath, loadSkillFile } from "./skills/loader.js";
import type { Message, Provider, Usage } from "./types.js";

export const THUMBNAIL_SKILL = "mentor-thumbnail-generator";

/** Largest SVG accepted, in characters (the skill aims for about 4 KB). */
export const MAX_THUMBNAIL_CHARS = 12_000;

export interface ThumbnailInput {
  /** e.g. "Mitosis" */
  topic: string;
  /** e.g. "Biology" */
  subject?: string;
  /** A line or two about the topic, to pick the right picture. */
  description?: string;
}

export interface ThumbnailOptions {
  signal?: AbortSignal;
}

export type ThumbnailResult =
  | { status: "ok"; svg: string; usage: Usage }
  | {
      status: "invalid";
      /** Why the last reply was refused, one line per problem. */
      problems: string[];
      /** In plain words, ready to show the user. */
      message: string;
      usage: Usage;
    };

export interface ThumbnailPipelineOptions {
  /** Returns the provider to use; called per run so configure() changes apply. */
  getProvider: () => Provider;
}

/** Things an SVG shown in the app must never contain, with the instruction to fix each. */
const FORBIDDEN: [RegExp, string][] = [
  [/<script\b/i, "Remove the <script> element."],
  [/<foreignObject\b/i, "Remove the <foreignObject> element."],
  [/<image\b/i, "Remove the <image> element; draw everything with vector shapes."],
  [/<filter\b/i, "Remove the <filter> element (no blur or shadow filters)."],
  [/<style\b/i, "Remove the <style> element; use attributes on the shapes instead."],
  [/<!(DOCTYPE|ENTITY)\b/i, "Remove the DOCTYPE / ENTITY declaration."],
  [/\son[a-z]+\s*=/i, "Remove event-handler attributes (onload, onclick, …)."],
  [/javascript:/i, 'Remove "javascript:" links.'],
  [/(?:href|src)\s*=\s*["']\s*(?!#)/i, "Remove links to anything outside the SVG (only #id references are allowed)."],
  [/url\(\s*["']?\s*(?!#)/i, "Use only url(#id) references to the SVG's own gradients."],
  [/@import\b/i, "Remove @import."],
];

/** The <svg>…</svg> in a reply (code fences and any text around it dropped), or null. */
export function extractSvg(reply: string): string | null {
  const start = reply.indexOf("<svg");
  const end = reply.lastIndexOf("</svg>");
  if (start === -1 || end < start) return null;
  return reply.slice(start, end + "</svg>".length).trim();
}

/** Problems with a thumbnail SVG, as instructions to fix them. Empty when it's usable. */
export function checkThumbnail(svg: string): string[] {
  const problems: string[] = [];
  if (!/^<svg\b[^>]*\bviewBox\s*=\s*["']0 0 320 240["']/.test(svg)) {
    problems.push('The root <svg> must have viewBox="0 0 320 240".');
  }
  if ((svg.match(/<svg\b/g) ?? []).length !== 1) problems.push("Use exactly one <svg> element; don't nest SVGs.");
  if (!/id\s*=\s*["']glow["']/.test(svg) || !/id\s*=\s*["']core["']/.test(svg)) {
    problems.push('Keep the two glow gradients ("glow" and "core") and their rects exactly as in the template.');
  }
  if (svg.length > MAX_THUMBNAIL_CHARS) {
    problems.push(`The SVG is ${svg.length} characters; keep it under ${MAX_THUMBNAIL_CHARS} (simplify the diagram).`);
  }
  for (const [pattern, fix] of FORBIDDEN) {
    if (pattern.test(svg)) problems.push(fix);
  }
  return problems;
}

function buildMessage({ topic, subject, description }: ThumbnailInput): string {
  return [
    `subject: ${subject?.trim() || "(not given)"}`,
    `topic: ${topic.trim()}`,
    ...(description?.trim() ? [`description: ${description.trim()}`] : []),
    "",
    "Reply with the SVG only.",
  ].join("\n");
}

const fixRequest = (problems: string[]) =>
  "That SVG can't be used yet. Fix these problems and reply with the whole corrected SVG only:\n\n" +
  problems.map((p) => `- ${p}`).join("\n");

const addUsage = (total: Usage, more: Usage) => {
  total.inputTokens += more.inputTokens;
  total.outputTokens += more.outputTokens;
  if (more.reasoningTokens !== undefined) total.reasoningTokens = (total.reasoningTokens ?? 0) + more.reasoningTokens;
};

export function createThumbnailPipeline({ getProvider }: ThumbnailPipelineOptions) {
  // Read once, so a missing or broken SKILL.md fails when the harness is created.
  const skill = loadSkillFile(builtinSkillPath(THUMBNAIL_SKILL));

  return async function thumbnail(input: ThumbnailInput, options: ThumbnailOptions = {}): Promise<ThumbnailResult> {
    if (!input.topic?.trim()) throw new Error("Topic is empty");

    const provider = getProvider();
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const messages: Message[] = [{ role: "user", content: buildMessage(input) }];
    let problems: string[] = [];

    // First reply, then at most one fix.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await provider.generate({
        system: skill.instructions,
        messages,
        tools: [],
        ...(skill.maxOutputTokens !== undefined ? { maxTokens: skill.maxOutputTokens } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      addUsage(usage, res.usage);

      const svg = extractSvg(res.message.text);
      problems =
        res.stopReason === "max_tokens"
          ? ["The reply was cut off. Make the SVG shorter."]
          : svg
            ? checkThumbnail(svg)
            : ["Reply with one <svg> element and nothing else."];
      if (svg && problems.length === 0) return { status: "ok", svg, usage };

      messages.push(res.message, { role: "user", content: fixRequest(problems) });
    }

    return { status: "invalid", problems, message: "The thumbnail couldn't be drawn. Try again.", usage };
  };
}
