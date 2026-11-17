/**
 * Stand-in types for doc-extraction-util, used only when it isn't installed (see scripts/build.mjs
 * and tsconfig.stub.json). Everything is `any`: the harness still compiles in full, and only the
 * lessons code needs the real package, which harness.lessons() loads on first use.
 *
 * Install doc-extraction-util to build against its real types. Names here match what
 * src/lessons.ts imports from "doc-extraction-util", "/layout" and "/lessons".
 */
export declare const extractDocument: any;
export declare const MistralOcr: any;
export declare const MarkdownLayoutAdapter: any;
export declare const toLayoutGraph: any;
export declare const LessonPlanner: any;
export declare const parseJsonAnswer: any;
export declare const PlanAnswerError: any;
export declare const SKILL_ID: any;
export declare const toCypher: any;
export declare const toPropertyGraph: any;

export type ExtractResult = any;
export type LayoutDocument = any;
export type AskStep = any;
export type LessonPlan = any;
export type PlannerOptions = any;
export type PlanProgress = any;
export type PlanTask = any;
export type PropertyGraph = any;
export type PropertyValue = any;
export type SkillId = any;
export type SkillVersion = any;
