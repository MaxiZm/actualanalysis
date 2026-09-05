import type { Model } from "@actualanalysis/shared";
import type { RawBenchmarkResult } from "../types.js";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, "");
}

/** Source-scoped explicit label parsing; never infer an unsuffixed model's default. */
export function arenaNamedEffort(record: RawBenchmarkResult, model: Model | undefined): string | undefined {
  if (record.source_id !== "lmarena"
    || record.source_url !== "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
    || record.benchmark_id !== "lmarena-text-style-controlled"
    || !model) return undefined;
  const label = normalized(record.model);
  // Punctuation differs between source names and model IDs (4-8 vs 4.8,
  // or '(xHigh)'). Require an exact base + documented tier, not a suffix guess.
  for (const base of [model.id, model.name]) {
    const prefix = normalized(base);
    if (!label.startsWith(prefix)) continue;
    const suffix = label.slice(prefix.length);
    const tier = model.effort_tier_order?.find((candidate) => normalized(candidate) === suffix);
    if (tier) return tier;
  }
  return undefined;
}
