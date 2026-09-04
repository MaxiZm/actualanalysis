import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { ResultFileSchema, ResultSchema, type Result } from "@actualanalysis/shared";
import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { benchmarkResult } from "./helpers.js";

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name)).map((entry) => path.join(directory, entry.name)).sort();
}

function parseResults(value: unknown): Result[] {
  if (Array.isArray(value)) return ResultSchema.array().parse(value);
  if (value && typeof value === "object" && "results" in value) return ResultFileSchema.parse(value).results;
  return [ResultSchema.parse(value)];
}

export class ManualAdapter implements IngestAdapter {
  readonly id = "manual";
  readonly failSoft = false;

  async ingest(context: AdapterContext) {
    const directory = path.join(context.dataDir, "manual", "results");
    const records: RawResult[] = [];
    const warnings: AdapterWarning[] = [];
    for (const filename of await files(directory)) {
      const document = parse(await readFile(filename, "utf8")) as unknown;
      let skippedReviewOnly = 0;
      for (const result of parseResults(document)) {
        if (result.sample_only) {
          skippedReviewOnly += 1;
          continue;
        }
        records.push(benchmarkResult({
          model: result.model_id,
          model_id: result.model_id,
          benchmark: result.benchmark_id,
          benchmark_id: result.benchmark_id,
          source_id: result.source_id,
          score: result.score,
          score_unit: result.score_unit,
          observed_on: result.observed_on,
          source_url: result.url,
          provenance: result.provenance,
          ...(result.system_id !== undefined ? { system_id: result.system_id } : {}),
          ...(result.benchmark_version !== undefined ? { benchmark_version: result.benchmark_version } : {}),
          ...(result.grader_version !== undefined ? { grader_version: result.grader_version } : {}),
          ...(result.evaluation_run_id !== undefined ? { evaluation_run_id: result.evaluation_run_id } : {}),
          ...(result.lineage_id !== undefined ? { lineage_id: result.lineage_id } : {}),
          ...(result.origin_provenance !== undefined ? { origin_provenance: result.origin_provenance } : {}),
          ...(result.host_source !== undefined ? { host_source: result.host_source } : {}),
          config: result.config,
          ...(result.se !== undefined ? { se: result.se } : {}),
          ...(result.n_items !== undefined ? { n_items: result.n_items } : {}),
          ...(result.k_trials !== undefined ? { k_trials: result.k_trials } : {}),
          ...(result.x_correct !== undefined ? { x_correct: result.x_correct } : {}),
          ...(result.per_task_counts !== undefined ? { per_task_counts: result.per_task_counts } : {}),
          ...(result.uncertainty_type !== undefined ? { uncertainty_type: result.uncertainty_type } : {}),
          ...(result.uncertainty_value !== undefined ? { uncertainty_value: result.uncertainty_value } : {}),
          ...(result.uncertainty_unit !== undefined ? { uncertainty_unit: result.uncertainty_unit } : {}),
          ...(result.n_runs !== undefined ? { n_runs: result.n_runs } : {}),
          ...(result.run_values !== undefined ? { run_values: result.run_values } : {}),
          ...(result.cost_per_task !== undefined ? { cost_per_task: result.cost_per_task } : {}),
          ...(result.latency_s !== undefined ? { latency_s: result.latency_s } : {}),
          ...(result.harness !== undefined ? { harness: result.harness } : {}),
          ...(result.harness_class !== undefined ? { harness_class: result.harness_class } : {}),
          ...(result.effort_tier !== undefined ? { effort_tier: result.effort_tier } : {}),
          ...(result.tool_policy !== undefined ? { tool_policy: result.tool_policy } : {}),
          metadata: {
            manual_file: path.relative(context.dataDir, filename),
            sample_only: result.sample_only,
            notes: result.notes ?? null,
          },
        }));
      }
      if (skippedReviewOnly > 0) {
        warnings.push({
          code: "partial",
          message: `Skipped ${skippedReviewOnly} review-only result${skippedReviewOnly === 1 ? "" : "s"} in ${path.relative(context.dataDir, filename)}`,
        });
      }
    }
    return output(this.id, context, records, warnings);
  }
}
