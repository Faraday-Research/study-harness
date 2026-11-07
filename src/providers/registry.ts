import type { Provider } from "../types.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";

/** Connection settings passed through to the provider's SDK client. */
export interface ProviderOptions {
  /** Omit to let the SDK read its env var (OPENAI_API_KEY / ANTHROPIC_API_KEY). */
  apiKey?: string;
  baseURL?: string;
}

/** Builds a provider for a model id (undefined = the provider's default model). */
export type ProviderFactory = (model: string | undefined, options: ProviderOptions) => Provider;

const factories = new Map<string, ProviderFactory>([
  ["anthropic", (model, o) => createAnthropicProvider({ ...o, model })],
  ["openai", (model, o) => createOpenAIProvider({ ...o, model })],
]);

/** Register a new provider, or an OpenAI-compatible endpoint under its own name. */
export function registerProvider(name: string, factory: ProviderFactory): void {
  factories.set(name, factory);
}

export function listProviders(): string[] {
  return [...factories.keys()];
}

/**
 * Resolve a "provider:model" spec, e.g. "anthropic:claude-opus-5-5",
 * "openai:gpt-5", or just "anthropic" for the provider default.
 */
export function createProvider(spec: string, options: ProviderOptions = {}): Provider {
  const i = spec.indexOf(":");
  const name = i === -1 ? spec : spec.slice(0, i);
  const model = i === -1 ? undefined : spec.slice(i + 1) || undefined;
  const factory = factories.get(name);
  if (!factory) throw new Error(`Unknown provider "${name}". Known: ${listProviders().join(", ")}`);
  return factory(model, options);
}
