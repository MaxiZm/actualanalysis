import { parse } from "yaml";
import type { AdapterContext, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchText } from "../lib/http.js";
import { isRow, type TabularRow } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, sourceUrl } from "./helpers.js";

export const METR_RESULTS_URL = "https://metr.org/assets/benchmark_results_1_1.yaml";

function metrModelName(modelId: string): string {
  const base = modelId.replace(/_inspect$/, "");
  const reorderedClaude = /^claude_(\d+)(?:_(\d+))?_(opus|sonnet)$/.exec(base);
  if (reorderedClaude) {
    const [, major, minor, tier] = reorderedClaude;
    const version = minor ? `${major}.${minor}` : major;
    return `Claude ${tier === "opus" ? "Opus" : "Sonnet"} ${version}`;
  }
  return base.replaceAll("_", "-");
}

function modelRows(payload: unknown): TabularRow[] {
  if (Array.isArray(payload)) return payload.filter(isRow);
  if (!isRow(payload)) return [];
  if (Array.isArray(payload.results)) return payload.results.filter(isRow);
  if (isRow(payload.results)) return Object.entries(payload.results).flatMap(([modelId, row]) =>
    isRow(row) ? [{ model_id: modelId, ...row }] : []
  );
  return [];
}

function estimate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isRow(value)) {
    const candidate = value.estimate ?? value.value ?? value.mean;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

interface HorizonEstimate {
  estimate: number;
  ciLow?: number;
  ciHigh?: number;
}

function horizonEstimate(value: unknown): HorizonEstimate | undefined {
  const point = estimate(value);
  if (point === undefined) return undefined;
  if (!isRow(value)) return { estimate: point };
  const ciLow = estimate(value.ci_low ?? value.ciLow);
  const ciHigh = estimate(value.ci_high ?? value.ciHigh);
  return {
    estimate: point,
    ...(ciLow !== undefined ? { ciLow } : {}),
    ...(ciHigh !== undefined ? { ciHigh } : {}),
  };
}

/** Approximate an original-scale SE from METR's asymmetric 95% CI in log2 space. */
function standardErrorFromLogCi(metric: HorizonEstimate): number | undefined {
  if (!(metric.estimate > 0) || !(metric.ciLow && metric.ciLow > 0) || !(metric.ciHigh && metric.ciHigh > metric.ciLow)) {
    return undefined;
  }
  const log2HalfWidth = (Math.log2(metric.ciHigh) - Math.log2(metric.ciLow)) / 2;
  const log2Se = log2HalfWidth / 1.96;
  return metric.estimate * Math.LN2 * log2Se;
}

export class MetrAdapter implements IngestAdapter {
  readonly id = "metr";
  readonly failSoft = true;

  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_METR_URL", METR_RESULTS_URL);
    const payload = parse(await fetchText(context, url)) as unknown;
    const root = isRow(payload) ? payload : {};
    const payloadBenchmarkName = typeof root.benchmark_name === "string" ? root.benchmark_name : undefined;
    const longTasksVersion = typeof root.long_tasks_version === "string" ? root.long_tasks_version : undefined;
    const rows = modelRows(payload);
    const records: RawResult[] = [];

    for (const row of rows) {
      const rawModelId = typeof row.model_id === "string" ? row.model_id : typeof row.model === "string" ? row.model : undefined;
      const metrics = isRow(row.metrics) ? row.metrics : {};
      const horizon = horizonEstimate(row.p50_horizon_length ?? row.p50_horizon ?? row.time_horizon ?? metrics.p50_horizon_length);
      if (!rawModelId || !horizon || horizon.estimate <= 0) continue;
      const model = metrModelName(rawModelId);
      const se = standardErrorFromLogCi(horizon);
      const benchmarkVersion = typeof row.benchmark_name === "string" ? row.benchmark_name : payloadBenchmarkName;
      const scaffolds = Array.isArray(row.scaffolds)
        ? row.scaffolds.filter((item): item is string => typeof item === "string")
        : [];
      const unit = typeof row.horizon_unit === "string" && row.horizon_unit.toLowerCase().startsWith("hour") ? "hours" : "minutes";
      records.push(benchmarkResult({
        model,
        benchmark: "METR Time Horizon 1.1",
        benchmark_id: "metr-time-horizon-1.1",
        source_id: "metr",
        score: horizon.estimate,
        score_unit: unit,
        ...(benchmarkVersion ? { benchmark_version: benchmarkVersion } : {}),
        ...(se !== undefined ? { se } : {}),
        ...(horizon.ciLow !== undefined && horizon.ciHigh !== undefined
          ? { uncertainty_type: "ci95", uncertainty_value: [horizon.ciLow, horizon.ciHigh] as [number, number], uncertainty_unit: "source" as const }
          : {}),
        observed_on: dateOnly(context.now()),
        source_url: url,
        provenance: "independent",
        config: { quantile: "p50" },
        metadata: {
          benchmark_name: typeof row.benchmark_name === "string" ? row.benchmark_name : null,
          metr_model_id: rawModelId,
          model_release_date: typeof row.release_date === "string" ? row.release_date.slice(0, 10) : null,
          is_sota: typeof metrics.is_sota === "boolean" ? metrics.is_sota : null,
          reported_ci95_low: horizon.ciLow ?? null,
          reported_ci95_high: horizon.ciHigh ?? null,
          uncertainty_method: se === undefined
            ? null
            : "SE approximated from the symmetric 95% CI half-width in log2(minutes), then delta-method converted to minutes",
          long_tasks_version: longTasksVersion ?? null,
          scaffolds,
        },
      }));
    }
    return output(this.id, context, records, rows.length > 0 && records.length === 0
      ? [{ code: "parse_failed", message: "METR YAML contained no p50 horizon estimates", url }]
      : []);
  }
}
