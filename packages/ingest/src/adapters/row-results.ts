import type { Provenance, ScoreUnit } from "@actualanalysis/shared";
import type { AdapterContext, RawBenchmarkResult } from "../types.js";
import { flattenRow, numberAt, stringAt, valueAt, type TabularRow } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, percentAwareScore } from "./helpers.js";

export interface RowResultOptions {
  benchmark: string;
  benchmarkId?: string;
  sourceId: string;
  sourceUrl: string;
  provenance: Provenance;
  modelColumns?: string[];
  scoreColumns?: string[];
  scoreUnit?: ScoreUnit;
  rowFilter?: (row: TabularRow) => boolean;
}

export interface MetricEstimate {
  estimate: number;
  /** Unlabelled value following a ± marker; callers must decide its semantics. */
  uncertainty?: number;
}

/** Parses leaderboard cells such as `72.7% ±2.7%` without guessing what ± means. */
export function parseMetricEstimate(value: unknown): MetricEstimate | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? { estimate: value } : undefined;
  if (typeof value !== "string") return undefined;
  const number = "[-+]?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)";
  const match = new RegExp(`^\\s*\\$?(${number})\\s*%?(?:\\s*(?:±|\\+/-)\\s*\\$?(${number})\\s*%?)?`).exec(value);
  if (!match?.[1]) return undefined;
  const estimate = Number(match[1].replace(/,/g, ""));
  const uncertainty = match[2] === undefined ? undefined : Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(estimate) || (uncertainty !== undefined && !Number.isFinite(uncertainty))) return undefined;
  return { estimate, ...(uncertainty !== undefined ? { uncertainty } : {}) };
}

export function metricEstimateAt(row: TabularRow, candidates: readonly string[]): MetricEstimate | undefined {
  return parseMetricEstimate(valueAt(row, candidates));
}

function validDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ? candidate : fallback;
}

export function rowsToBenchmarkResults(rows: readonly TabularRow[], context: AdapterContext, options: RowResultOptions): RawBenchmarkResult[] {
  const records: RawBenchmarkResult[] = [];
  for (const originalRow of rows) {
    if (options.rowFilter && !options.rowFilter(originalRow)) continue;
    const row = flattenRow(originalRow);
    const model = stringAt(row, options.modelColumns ?? ["model", "model_name", "name", "system", "metadata.model_display.label"]);
    const scoreColumns = options.scoreColumns ?? ["score", "performance", "accuracy", "pass_rate", "resolved_rate", "metrics.score", "metrics.accuracy"];
    const rawScore = valueAt(row, scoreColumns);
    const metric = parseMetricEstimate(rawScore);
    if (!model || !metric) continue;
    const scaled = options.scoreUnit ? { score: metric.estimate, score_unit: options.scoreUnit } : percentAwareScore(metric.estimate, rawScore);
    const se = numberAt(row, ["se", "standard_error", "stderr"]);
    const nItems = numberAt(row, ["n_items", "sample_size", "total", "count"]);
    records.push(benchmarkResult({
      model,
      benchmark: options.benchmark,
      ...(options.benchmarkId ? { benchmark_id: options.benchmarkId } : {}),
      source_id: options.sourceId,
      score: scaled.score,
      score_unit: scaled.score_unit,
      observed_on: validDate(stringAt(row, ["observed_on", "leaderboard_publish_date", "date", "updated_at"]), dateOnly(context.now())),
      source_url: options.sourceUrl,
      provenance: options.provenance,
      ...(se !== undefined && se >= 0 ? { se } : {}),
      ...(nItems !== undefined && Number.isInteger(nItems) && nItems > 0 ? { n_items: nItems } : {}),
      metadata: {
        rank: numberAt(row, ["rank"]) ?? null,
        organization: stringAt(row, ["organization", "org"]) ?? null,
      },
    }));
  }
  return records;
}
