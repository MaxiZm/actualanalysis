import type { RawBenchmarkResult } from "../types.js";
import { numberAt, parseCsv } from "../lib/tabular.js";
import { benchmarkResult } from "./helpers.js";

export const EPOCH_RUNS_URL = "https://epoch.ai/data/benchmarks.csv";

const FRONTIERMATH_TASKS: Record<string, { id: string; version: string }> = {
  "FrontierMath-Tiers-1-3-v2-Private": { id: "frontiermath-v2-tiers-1-3", version: "v2-tiers-1-3" },
  "FrontierMath-Tier-4-v2-Private": { id: "frontiermath-v2-tier-4", version: "v2-tier-4" },
};

export function isEpochFrontierMathTask(task: string): boolean {
  return task in FRONTIERMATH_TASKS;
}

/** Use the original evaluation, not ECI's model-level best-score projection.
 * Run IDs, standard errors and effort settings are needed to compare like with
 * like. Keep the latest completed run for each exact model configuration/task;
 * choosing the maximum observed score would introduce winner's bias.
 */
export function parseEpochFrontierMathRuns(text: string, sourceUrl = EPOCH_RUNS_URL): RawBenchmarkResult[] {
  const latest = new Map<string, { startedAt: string; record: RawBenchmarkResult }>();
  for (const row of parseCsv(text)) {
    const definition = FRONTIERMATH_TASKS[row.task ?? ""];
    const model = row.Model?.trim();
    const modelVersion = row.id_model_version?.trim() || row.model?.trim();
    const runId = row.id_runs?.trim();
    const startedAt = row.started_at?.trim();
    const score = numberAt(row, ["mean_score"]);
    const se = numberAt(row, ["stderr"]);
    if (!definition || !model || !modelVersion || !runId || !startedAt
      || row.Status !== "Success" || row["task version"] !== "2.0.0"
      || score === undefined || score < 0 || score > 1 || se === undefined || se < 0) continue;
    const effort = /_(none|minimal|low|medium|high|xhigh|max)$/i.exec(modelVersion)?.[1]?.toLowerCase();
    const record = benchmarkResult({
      model,
      benchmark: row.task!,
      benchmark_id: definition.id,
      benchmark_version: definition.version,
      grader_version: "2.0.0",
      source_id: "epoch",
      evaluation_run_id: runId,
      lineage_id: `epoch:${runId}`,
      protocol_id: "epoch-frontiermath-v2",
      host_source: "epoch",
      provenance: "independent",
      origin_provenance: "independent",
      score,
      score_unit: "fraction",
      ...(se > 0 ? { se, uncertainty_type: "se" as const, uncertainty_value: se, uncertainty_unit: "item" as const } : {}),
      ...(effort ? { effort_tier: effort } : {}),
      harness: "Epoch FrontierMath Python and submit_answer harness",
      harness_class: "common",
      tool_policy: "python-submit-answer",
      observed_on: startedAt.slice(0, 10),
      source_url: sourceUrl,
      config: {
        epoch_model_version: modelVersion,
        statistic: "mean_accuracy",
        dataset: "private",
        task_version: "2.0.0",
        ...(effort ? { reasoning_effort: effort } : {}),
      },
      metadata: {
        epoch_run_id: runId,
        source_model_name: row["Display name"] || model,
        started_at: startedAt,
        log_viewer: row["log viewer"] || null,
        reported_standard_error: se,
        selection: "latest completed run per exact configuration and benchmark revision",
      },
    });
    const key = `${modelVersion}\0${definition.id}`;
    if (!latest.has(key) || startedAt > latest.get(key)!.startedAt) latest.set(key, { startedAt, record });
  }
  return [...latest.values()].map(({ record }) => record);
}
