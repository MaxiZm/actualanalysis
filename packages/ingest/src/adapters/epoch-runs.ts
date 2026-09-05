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
        ...(/_promax$/i.test(modelVersion) ? {
          aci_fit_eligible: false,
          aci_exclusion_reason: "Native promax / pro, max is distinct from ordinary max; no verified matching registered system configuration is available.",
        } : {}),
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

/** Native SimpleQA accuracy runs. The anti-abstention protocol and task revision
 * are part of condition identity; never merge these into an unspecified/F1 row.
 * Registry integration is intentionally separate from this parser.
 */
export function parseEpochSimpleQaRuns(text: string, sourceUrl = EPOCH_RUNS_URL): RawBenchmarkResult[] {
  const latest = new Map<string, { startedAt: string; record: RawBenchmarkResult }>();
  const supportedVersions = new Set(["1.0.0", "1.2.0"]);
  for (const row of parseCsv(text)) {
    const version = row["task version"]?.trim();
    const model = row.Model?.trim();
    const modelVersion = row.id_model_version?.trim() || row.model?.trim();
    const runId = row.id_runs?.trim();
    const startedAt = row.started_at?.trim();
    const score = numberAt(row, ["mean_score"]);
    const se = numberAt(row, ["stderr"]);
    if (row.task !== "SimpleQA Verified" || row.original_task_name !== "SimpleQA Verified (anti-abstention)"
      || !version || !supportedVersions.has(version) || !model || !modelVersion || !runId || !startedAt
      || row.Status !== "Success" || score === undefined || score < 0 || score > 1 || se === undefined || se < 0) continue;
    const effort = /_(none|minimal|low|medium|high|xhigh|max)$/i.exec(modelVersion)?.[1]?.toLowerCase();
    const record = benchmarkResult({
      model,
      benchmark: `SimpleQA Verified (Epoch native task ${version})`,
      benchmark_id: `simpleqa-verified-epoch-anti-abstention-v${version.replaceAll(".", "-")}`,
      benchmark_version: `epoch-anti-abstention-${version}`,
      source_id: "epoch",
      evaluation_run_id: runId,
      lineage_id: `epoch:${runId}`,
      protocol_id: `epoch-simpleqa-anti-abstention-v${version.replaceAll(".", "-")}`,
      host_source: "epoch",
      provenance: "independent",
      origin_provenance: "independent",
      score,
      score_unit: "fraction",
      ...(se > 0 ? { se, uncertainty_type: "se" as const, uncertainty_value: se, uncertainty_unit: "item" as const } : {}),
      ...(effort ? { effort_tier: effort } : {}),
      harness: "Epoch SimpleQA Verified native accuracy scorer",
      harness_class: "common",
      tool_policy: "none",
      observed_on: startedAt.slice(0, 10),
      source_url: sourceUrl,
      metadata_incomplete: true,
      config: {
        epoch_model_version: modelVersion,
        statistic: "mean_accuracy",
        prompt_protocol: "native task revision; current source label anti-abstention",
        task_version: version,
        ...(effort ? { reasoning_effort: effort } : {}),
      },
      metadata: {
        epoch_run_id: runId,
        source_model_name: row["Display name"] || model,
        original_task_name: row.original_task_name,
        started_at: startedAt,
        log_viewer: row["log viewer"] || null,
        reported_standard_error: se,
        metric_identity: "fraction correct; incorrect and abstained responses score zero, not Google F1",
        nominal_dataset_size: 1000,
        evaluated_question_count_provided: false,
        exact_production_judge_revision_verified: false,
        exact_historical_prompt_verified: false,
        selection: "latest completed run per exact configuration and native task revision",
      },
    });
    const key = `${modelVersion}\0${version}`;
    if (!latest.has(key) || startedAt > latest.get(key)!.startedAt) latest.set(key, { startedAt, record });
  }
  return [...latest.values()].map(({ record }) => record);
}

/** Display-only native GPQA accuracy. ECI's chance-adjusted projection cannot
 * be relabelled as raw accuracy. Preserve native task revisions/configurations
 * and reported SE; do not manufacture item counts from averaged runs.
 */
export function parseEpochGpqaRuns(text: string, sourceUrl = EPOCH_RUNS_URL): RawBenchmarkResult[] {
  const latest = new Map<string, { startedAt: string; record: RawBenchmarkResult }>();
  for (const row of parseCsv(text)) {
    const version = row["task version"]?.trim();
    const model = row.Model?.trim() || row.model?.trim();
    const modelVersion = row.id_model_version?.trim();
    const runId = row.id_runs?.trim(), startedAt = row.started_at?.trim();
    const score = numberAt(row, ["mean_score"]), se = numberAt(row, ["stderr"]);
    if (row.task !== "GPQA diamond" || row.original_task_name !== "GPQA diamond"
      || row.Status !== "Success" || !version || !/^1\.0\.(?:[0-9]|10|11)$/.test(version)
      || !model || !modelVersion || !runId || !startedAt || score === undefined || score < 0 || score > 1
      || se === undefined || se < 0) continue;
    const effort = /_(none|minimal|low|medium|high|xhigh|max)$/i.exec(modelVersion)?.[1]?.toLowerCase();
    const record = benchmarkResult({
      model, benchmark: "GPQA Diamond", benchmark_id: "gpqa-diamond", benchmark_version: "diamond-198",
      source_id: "epoch", evaluation_run_id: runId, lineage_id: `epoch:${runId}`,
      host_source: "epoch", origin_provenance: "independent", provenance: "independent",
      score, score_unit: "fraction", ...(se > 0 ? { se, uncertainty_type: "se" as const, uncertainty_value: se, uncertainty_unit: "item" as const } : {}),
      ...(effort ? { effort_tier: effort } : {}),
      harness: `Epoch GPQA Diamond task ${version}`, harness_class: "common", tool_policy: "none",
      observed_on: startedAt.slice(0, 10), source_url: sourceUrl, metadata_incomplete: true,
      config: { epoch_model_version: modelVersion, task_version: version, statistic: "mean_accuracy",
        ...(effort ? { reasoning_effort: effort } : {}), aci_fit_eligible: false,
        aci_exclusion_reason: "Display-only native GPQA accuracy; benchmark remains watchlist and native task revisions/repeated sampling are not admitted as one fitted condition." },
      metadata: { epoch_run_id: runId, source_model_name: row["Display name"] || model,
        native_model_release_date: row["Version release date"] || null, started_at: startedAt,
        log_viewer: row["log viewer"] || null, reported_standard_error: se,
        metric_identity: "raw native mean accuracy, not ECI chance-normalized performance",
        exact_native_task_version: version, evaluated_question_count_provided: false,
        selection: "latest completed run per exact model configuration and native task revision" },
    });
    const key = `${modelVersion}\0${version}`;
    if (!latest.has(key) || startedAt > latest.get(key)!.startedAt) latest.set(key, { startedAt, record });
  }
  return [...latest.values()].map(({ record }) => record);
}
