import { z } from "zod";
import type { ToolSpec } from "./types.js";

export interface ToolContext {
  signal?: AbortSignal;
}

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(input: z.infer<S>, ctx: ToolContext): Promise<unknown> | unknown;
}

/** Define a tool with a Zod schema; input is validated before `run` is called. */
export function defineTool<S extends z.ZodType>(tool: Tool<S>): Tool<S> {
  return tool;
}

export function toToolSpec(tool: Tool): ToolSpec {
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  return { name: tool.name, description: tool.description, inputSchema };
}
