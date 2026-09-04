import { blendedPrice, type ModelRecord } from "./data";
import {
  resolveDisplayLimits,
  type OpenRouterDisplayOverlay,
} from "./openrouter-display";

/** First-party list values checked 2026-09-04; standard processing, <=272k input. */
export const VENDOR_DISPLAY: Record<
  string,
  {
    input: number;
    output: number;
    contextWindow: number;
    maxOutput: number;
    sourceUrl: string;
  }
> = {
  "gpt-6-astra": {
    input: 10,
    output: 50,
    contextWindow: 1050000,
    maxOutput: 128000,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-astra",
  },
  "gemini-3.8-flash": {
    input: 0.75,
    output: 3.75,
    contextWindow: 1048576,
    maxOutput: 65536,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash",
  },
};
export function displayPrice(
  model: ModelRecord,
  basis: "blended" | "input" | "output",
  overlay?: OpenRouterDisplayOverlay | null,
): number | null {
  const live = overlay?.matches[model.id];
  const vendor = VENDOR_DISPLAY[model.id];
  const input =
    live?.inputPerMillion ?? vendor?.input ?? model.pricing[0]?.inputPerMillion;
  const output =
    live?.outputPerMillion ??
    vendor?.output ??
    model.pricing[0]?.outputPerMillion;
  return basis === "input"
    ? (input ?? null)
    : basis === "output"
      ? (output ?? null)
      : input != null && output != null
        ? (input * 3 + output) / 4
        : blendedPrice(model);
}
export function displayModels(
  models: ModelRecord[],
  overlay?: OpenRouterDisplayOverlay | null,
): ModelRecord[] {
  return models.map((model) => {
    const limits = resolveDisplayLimits({
      vendorOverride: VENDOR_DISPLAY[model.id] ?? null,
      openRouter: overlay?.matches[model.id] ?? null,
      snapshot: {
        contextWindow: model.contextWindow,
        maxOutput: model.maxOutput,
      },
    });
    return {
      ...model,
      contextWindow: limits.contextWindow,
      maxOutput: limits.maxOutput,
    };
  });
}
