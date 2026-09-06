import type { AdapterContext, AdapterWarning, IngestAdapter, RawBenchmarkResult, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchText } from "../lib/http.js";
import { isRow } from "../lib/tabular.js";
import { benchmarkResult, dateOnly } from "./helpers.js";

export const DEEPSWE_V1_URL = "https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json";
export const DEEPSWE_V1_1_URL = "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json";

const DISCRETE_EFFORT = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

interface DeepSweFeed {
  url: string;
  env: string;
  benchmark: string;
  benchmarkId: string;
  version: "1" | "1.1";
}

const FEEDS: readonly DeepSweFeed[] = [
  {
    url: DEEPSWE_V1_URL,
    env: "ACTUALANALYSIS_DEEPSWE_V1_URL",
    benchmark: "DeepSWE",
    benchmarkId: "deepswe",
    version: "1",
  },
  {
    url: DEEPSWE_V1_1_URL,
    env: "ACTUALANALYSIS_DEEPSWE_V1_1_URL",
    benchmark: "DeepSWE v1.1",
    benchmarkId: "deepswe-1.1",
    version: "1.1",
  },
];

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function reportedEffort(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const effort = value.trim().toLowerCase();
  return DISCRETE_EFFORT.has(effort) ? effort : undefined;
}

export function parseDeepSweLive(
  payload: unknown,
  context: AdapterContext,
  feed: Pick<DeepSweFeed, "url" | "benchmark" | "benchmarkId" | "version">,
): { records: RawBenchmarkResult[]; warnings: AdapterWarning[] } {
  if (!isRow(payload) || !Array.isArray(payload.rows)) {
    return { records: [], warnings: [{ code: "parse_failed", message: `DeepSWE v${feed.version} live table is missing a rows array`, url: feed.url }] };
  }
  const generatedOn = typeof payload.generated_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(payload.generated_at)
    ? payload.generated_at.slice(0, 10)
    : dateOnly(context.now());
  const datasetTasks = positiveInt(payload.n_tasks_in_set);
  const records: RawBenchmarkResult[] = [];
  const warnings: AdapterWarning[] = [];

  for (const entry of payload.rows) {
    if (!isRow(entry)) continue;
    const model = typeof entry.model === "string" ? entry.model.trim() : "";
    const config = typeof entry.config === "string" ? entry.config.trim() : "";
    const score = finiteNumber(entry.pass_at_1);
    if (!model || !config || score === undefined) continue;
    if (score < 0 || score > 1) {
      warnings.push({ code: "partial", message: `Skipped DeepSWE v${feed.version} ${config}: pass_at_1 is outside [0, 1]`, url: feed.url });
      continue;
    }
    const effort = reportedEffort(entry.reasoning_effort);
    const ciLow = finiteNumber(entry.ci_lo);
    const ciHigh = finiteNumber(entry.ci_hi);
    const ciHalf = finiteNumber(entry.ci_half);
    const nRuns = positiveInt(entry.n_runs);
    const nItems = positiveInt(entry.n_tasks_attempted);
    const cost = finiteNumber(entry.mean_cost_usd);
    const latency = finiteNumber(entry.mean_duration_seconds);
    const harness = typeof entry.harness === "string" && entry.harness.trim() ? entry.harness.trim() : "mini-swe-agent";
    const ciMethod = typeof entry.ci_method === "string" ? entry.ci_method : "";
    const wald = /wald|binomial/i.test(ciMethod);
    const se = ciHalf !== undefined && ciHalf >= 0 ? ciHalf / 1.96 : undefined;
    const unit = wald ? "item" as const : "run" as const;
    const interval = ciLow !== undefined && ciHigh !== undefined && ciHigh >= ciLow
      ? { uncertainty_type: "ci95" as const, uncertainty_value: [ciLow, ciHigh] as [number, number], uncertainty_unit: unit }
      : se !== undefined
        ? { uncertainty_type: "se" as const, uncertainty_value: se, uncertainty_unit: unit }
        : {};
    const runId = config;
    records.push(benchmarkResult({
      model,
      benchmark: feed.benchmark,
      benchmark_id: feed.benchmarkId,
      benchmark_version: feed.version,
      source_id: "datacurve",
      evaluation_run_id: runId,
      lineage_id: `deepswe:v${feed.version}:${runId}`,
      host_source: "datacurve",
      provenance: "independent",
      origin_provenance: "independent",
      metadata_incomplete: true,
      score,
      score_unit: "fraction",
      ...(se !== undefined ? { se } : {}),
      ...interval,
      ...(nItems ? { n_items: nItems } : {}),
      ...(nRuns ? { n_runs: nRuns } : {}),
      ...(cost !== undefined && cost >= 0 ? { cost_per_task: cost } : {}),
      ...(latency !== undefined && latency >= 0 ? { latency_s: latency } : {}),
      ...(effort ? { effort_tier: effort } : {}),
      harness,
      harness_class: harness === "mini-swe-agent" ? "common" : "unknown",
      observed_on: generatedOn,
      source_url: feed.url,
      config: {
        source_configuration: config,
        dataset_version: feed.version,
        statistic: "pass_at_1",
        ...(effort ? { reasoning_effort: effort } : {}),
      },
      metadata: {
        source_model: model,
        source_config: config,
        dataset_tasks: datasetTasks ?? null,
        reported_n_passed: positiveInt(entry.n_passed) ?? null,
        reported_scored_attempts: positiveInt(entry.n_attempted) ?? null,
        reported_tasks_attempted: nItems ?? null,
        pass_at_4: finiteNumber(entry.pass_at_4) ?? null,
        ci_method: ciMethod || null,
        unit_definition: typeof payload.unit === "string" ? payload.unit : null,
        generated_at: typeof payload.generated_at === "string" ? payload.generated_at : null,
        notes: "Native pass@1 over scored attempts. Provider/verifier/network errors are excluded upstream. Nominal 113-task set size is not an observed binomial denominator. Missing reasoning_effort is left missing; config names ending in _default are not an effort setting.",
      },
    }));
  }

  if (payload.rows.length > 0 && records.length === 0) {
    warnings.push({ code: "parse_failed", message: `DeepSWE v${feed.version} rows contained no usable pass_at_1 configurations`, url: feed.url });
  }
  return { records, warnings };
}

/** Datacurve DeepSWE live tables. v1 and v1.1 remain separate conditions. */
export class DatacurveAdapter implements IngestAdapter {
  readonly id = "datacurve";
  readonly failSoft = true;

  constructor(private readonly urls: { v1?: string; v11?: string } = {}) {}

  async ingest(context: AdapterContext) {
    const records: RawResult[] = [];
    const warnings: AdapterWarning[] = [];
    await Promise.all(FEEDS.map(async (feed) => {
      const url = (feed.version === "1" ? this.urls.v1 : this.urls.v11)
        ?? context.env[feed.env]
        ?? feed.url;
      try {
        const parsed = parseDeepSweLive(JSON.parse(await fetchText(context, url)) as unknown, context, { ...feed, url });
        records.push(...parsed.records);
        warnings.push(...parsed.warnings);
      } catch (error) {
        warnings.push({ code: "fetch_failed", message: error instanceof Error ? error.message : String(error), url });
      }
    }));
    return output(this.id, context, records, warnings);
  }
}
