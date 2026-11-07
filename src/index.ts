/**
 * Public API of the harness. Apps only get the pipeline (createHarness) and
 * its types — the engine, providers, tools and skills stay internal.
 */
export {
  createHarness,
  HarnessBusyError,
  type Harness,
  type HarnessConfig,
  type HarnessUpdate,
  type HarnessEvent,
  type SendOptions,
  type SendResult,
  type SkillInfo,
  type GenerateEvent,
  type GenerateOptions,
  type GenerateResult,
  type GenerateStage,
} from "./harness.js";
export type { ResearchInput, ResearchOptions, ResearchResult } from "./research.js";
export type { ResearchReport } from "./researchReport.js";
export type {
  InteractiveTheme,
  LessonCheck,
  LessonMode,
  LessonTester,
  SimulationInput,
  SimulationOptions,
  SimulationResult,
} from "./simulation.js";
export {
  buildCustomHtml,
  buildInteractiveHtml,
  type BuildCustomOptions,
  type BuildInteractiveOptions,
  type ExampleKind,
} from "./interactive/buildHtml.js";
export { checkCustomHtml, checkLessonCode, LESSON_COLORS, type LessonProblem, type ProblemSeverity } from "./interactive/checkLesson.js";
export { listProviders } from "./providers/registry.js";
export type { StopReason, Usage, ToolCall, ToolResult } from "./types.js";
