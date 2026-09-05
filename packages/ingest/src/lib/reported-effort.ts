import type { Model } from "@actualanalysis/shared";
import type { RawBenchmarkResult } from "../types.js";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, " ");
}

/** Source-scoped explicit label parsing; never infer an unsuffixed model's default. */
export function arenaNamedEffort(record: RawBenchmarkResult, model: Model | undefined): string | undefined {
  if (record.source_id !== "lmarena"
    || record.source_url !== "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
    || record.benchmark_id !== "lmarena-text-style-controlled"
    || !model) return undefined;
  const label = normalized(record.model);
  const prefix = `${normalized(model.id)} `;
  if (!label.startsWith(prefix)) return undefined;
  const suffix = label.slice(prefix.length);
  return model.effort_tier_order?.find((tier) => normalized(tier) === suffix);
}
