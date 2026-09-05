import type { AdapterContext, AdapterWarning, IngestAdapter, RawBenchmarkResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchText } from "../lib/http.js";
import { benchmarkResult, dateOnly, sourceUrl } from "./helpers.js";

export const OSWORLD_RESULTS_URL = "https://osworld-v2.xlang.ai/static/data/leaderboard/official-results.json";
const conditions: Record<string, string> = {
  "v2026.06.24:full": "osworld-2.0-2026.06.24-full",
  "v2026.08.08:full": "osworld-2.0",
  "v2026.08.08:offline": "osworld-2.0-2026.08.08-offline",
};
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function parseOsworldResults(payload: unknown, context: AdapterContext, url = OSWORLD_RESULTS_URL): { records: RawBenchmarkResult[]; warnings: AdapterWarning[] } {
  const data = object(payload);
  const records: RawBenchmarkResult[] = [];
  let unregisteredConditions = 0;
  if (!data || !Array.isArray(data.results)) return { records, warnings: [{ code: "parse_failed", message: "OSWorld official results array is missing", url }] };
  for (const entry of data.results) {
    const row = object(entry);
    if (!row || row.official !== true || typeof row.model !== "string" || typeof row.binaryAccuracy !== "number" || !Number.isFinite(row.binaryAccuracy)) continue;
    // Result defaults describe old rows. The UI's selected/current release does not.
    const release = row.releaseVersion ?? data.defaultResultReleaseVersion;
    const scope = row.datasetScope ?? data.defaultResultDatasetScope;
    const benchmarkId = typeof release === "string" && typeof scope === "string" ? conditions[`${release}:${scope}`] : undefined;
    if (!benchmarkId) { unregisteredConditions += 1; continue; }
    const effort = typeof row.reasoning === "string" && row.reasoning.trim() ? row.reasoning.trim() : undefined;
    const tool = typeof row.toolSetting === "string" ? row.toolSetting : undefined;
    const steps = typeof row.stepBudget === "number" ? row.stepBudget : undefined;
    const nominalCount = scope === "full" && typeof data.datasetSize === "number" && Number.isInteger(data.datasetSize) && data.datasetSize > 0 ? data.datasetSize : scope === "offline" && release === "v2026.08.08" ? 82 : undefined;
    // The official leaderboard footnote pins these August averages. Task counts
    // describe the nominal suite, not an observed per-run binomial denominator.
    const runs = release === "v2026.08.08" ? row.model === "Claude Opus 5" ? 7 : row.model === "GPT-5.6 Sol" ? 2 : undefined : undefined;
    const observed = typeof data.updatedAt === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(data.updatedAt) ? data.updatedAt : dateOnly(context.now());
    const runId = `${release}:${scope}:${row.model}:${effort ?? "unknown"}:${tool ?? "unknown"}:${steps ?? "unknown"}`;
    records.push(benchmarkResult({
      model: row.model,
      benchmark: "OSWorld 2.0",
      benchmark_id: benchmarkId,
      benchmark_version: `osworld-v2-${String(release).slice(1)}`,
      ...(release === "v2026.08.08" ? { grader_version: "v2026.08.08 release plus osworld-v2-2026.08.08 manifest" } : {}),
      source_id: "osworld",
      score: row.binaryAccuracy,
      score_unit: "percent",
      ...(runs ? { n_runs: runs } : {}),
      ...(effort ? { effort_tier: effort } : {}),
      harness: "OSWorld-V2",
      harness_class: "common",
      tool_policy: "osworld-v2-computer-use",
      evaluation_run_id: runId,
      lineage_id: `osworld:${runId}`,
      metadata_incomplete: true,
      config: {
        release_version: String(release), dataset_scope: String(scope), scoring: "binaryAccuracy",
        aci_fit_eligible: false,
        aci_exclusion_reason: "OSWorld publishes an aggregate completion rate without per-run task denominators or uncertainty; nominal suite size is not an observed binomial count.",
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(tool ? { tool_setting: tool } : {}),
        ...(steps === undefined ? {} : { step_budget: steps }),
      },
      observed_on: observed,
      source_url: url,
      provenance: "independent",
      origin_provenance: "independent",
      metadata: {
        nominal_task_count: nominalCount ?? null,
        aggregate_count_compatible: false,
        repeat_policy_source: runs ? "https://osworld-v2.xlang.ai/static/js/leaderboard.js?v=leaderboard-gpt56-cost-v1" : null,
        nominal_task_count_source: scope === "offline" ? "https://osworld-v2.xlang.ai/static/js/leaderboard.js?v=leaderboard-gpt56-cost-v1" : url,
        reported_partial_score: typeof row.partialScore === "number" ? row.partialScore : null,
        estimated_evaluation_cost_usd: typeof row.estimatedCostUsd === "number" ? row.estimatedCostUsd : null,
        notes: "Official binary completion; partial reward remains metadata. Version/scope use source result defaults. Source footnotes identify 82 nominal offline tasks and August averages of seven Claude Opus 5 runs or two GPT-5.6 Sol runs. No per-run denominator, failures policy or run SEM is reported; nominal task counts are descriptive only.",
      },
    }));
  }
  return { records, warnings: unregisteredConditions ? [{ code: "partial", message: `${unregisteredConditions} OSWorld rows have missing or unregistered release/subset conditions and were not relabeled as the current benchmark.`, url }] : [] };
}

export class OsworldAdapter implements IngestAdapter {
  readonly id = "osworld";
  readonly failSoft = true;
  constructor(private readonly url?: string) {}
  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_OSWORLD_URL", OSWORLD_RESULTS_URL);
    const parsed = parseOsworldResults(JSON.parse(await fetchText(context, url)) as unknown, context, url);
    return output(this.id, context, parsed.records, parsed.warnings);
  }
}
