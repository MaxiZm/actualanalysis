import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { EPOCH_RUNS_URL, isEpochFrontierMathTask, parseEpochFrontierMathRuns } from "./epoch-runs.js";
import { fetchText } from "../lib/http.js";
import { numberAt, stringAt, valueAt } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, parseTabularPayload, percentAwareScore, sourceUrl } from "./helpers.js";

export const EPOCH_ECI_URL = "https://epoch.ai/data/eci_benchmarks.csv";

// ECI's export converts this duration metric onto a 0–1 fitting scale. The
// dedicated METR adapter supplies the underlying minutes and uncertainty.
const ECI_PREPROCESSED_NON_ACCURACY = new Set(["METR Time Horizons"]);

// Epoch's CritPt hub currently sources the public scores from the leaderboard
// hosted by Artificial Analysis. The project policy forbids ingesting AA
// benchmark scores, even through a mirror, so keep these rows outside the
// evidence graph until an independent allowed source is available.
const ECI_RESTRICTED_ORIGIN_BENCHMARKS = new Set(["CritPt"]);
const EPOCH_RUN_BENCHMARKS = /frontiermath|simpleqa|gpqa/i;

function isKnownVersionMismatch(benchmark: string, originSource: string | undefined): boolean {
  return benchmark === "Terminal Bench"
    && originSource !== undefined
    && /(?:terminal[- ]bench[^\n]*(?:\/2\.0|\bv2\b)|(?:\/2\.0|\bv2\b)[^\n]*terminal[- ]bench)/i.test(originSource);
}

export class EpochAdapter implements IngestAdapter {
  readonly id = "epoch";
  readonly failSoft = true;

  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_EPOCH_URL", EPOCH_ECI_URL);
    const text = await fetchText(context, url);
    const rows = parseTabularPayload(text, url);
    const records: RawResult[] = [];
    // Default production ingestion replaces the lossy ECI FrontierMath aggregate
    // with its original run, which retains the exact revision and effort tier.
    // Explicit custom feeds remain self-contained for offline fixture ingestion.
    let runsFetchWarning: AdapterWarning | undefined;
    if (url === EPOCH_ECI_URL) {
      try {
        const runsUrl = context.env.ACTUALANALYSIS_EPOCH_RUNS_URL ?? EPOCH_RUNS_URL;
        records.push(...parseEpochFrontierMathRuns(await fetchText(context, runsUrl), runsUrl));
      } catch (error) {
        runsFetchWarning = { code: "fetch_failed", message: `Epoch run-level FrontierMath data unavailable: ${String(error)}`, url: EPOCH_RUNS_URL };
      }
    }
    let skippedPreprocessedMetrics = 0;
    let skippedRestrictedOrigin = 0;
    let skippedVersionMismatches = 0;

    for (const row of rows) {
      const model = stringAt(row, ["model", "Model", "model_name", "model_id"]);
      const benchmark = stringAt(row, ["benchmark", "benchmark_name", "benchmark_id"]);
      const rawScore = valueAt(row, ["performance", "score", "value"]);
      const score = numberAt(row, ["performance", "score", "value"]);
      if (!model || !benchmark || score === undefined) continue;
      // Never silently fall back to ECI's best-over-configurations aggregate for
      // a benchmark with a declared run-level source. A fetch failure is visible.
      if (url === EPOCH_ECI_URL && isEpochFrontierMathTask(benchmark)) continue;
      if (ECI_PREPROCESSED_NON_ACCURACY.has(benchmark)) {
        skippedPreprocessedMetrics += 1;
        continue;
      }
      if (ECI_RESTRICTED_ORIGIN_BENCHMARKS.has(benchmark)) {
        skippedRestrictedOrigin += 1;
        continue;
      }
      const originSource = stringAt(row, ["source"]);
      // Epoch's current generic `Terminal Bench` series points at the v2
      // leaderboard. The registry intentionally models v4 as a distinct
      // benchmark, so these rows must never resolve through its broad alias.
      if (isKnownVersionMismatch(benchmark, originSource)) {
        skippedVersionMismatches += 1;
        continue;
      }
      const scaled = percentAwareScore(score, rawScore);
      const se = numberAt(row, ["standard_error", "se"]);
      const nItems = numberAt(row, ["n_items", "n", "sample_size"]);
      records.push(benchmarkResult({
        model,
        benchmark,
        source_id: "epoch",
        score: scaled.score,
        score_unit: scaled.score_unit,
        observed_on: stringAt(row, ["observed_on", "updated_at"])?.slice(0, 10) ?? dateOnly(context.now()),
        source_url: url,
        provenance: EPOCH_RUN_BENCHMARKS.test(benchmark) ? "independent" : "mirror",
        ...(se !== undefined && se >= 0 ? { se } : {}),
        ...(nItems !== undefined && Number.isInteger(nItems) && nItems > 0 ? { n_items: nItems } : {}),
        metadata: {
          epoch_model_id: stringAt(row, ["model_id"]) ?? null,
          epoch_benchmark_id: stringAt(row, ["benchmark_id"]) ?? null,
          model_release_date: stringAt(row, ["date", "model_release_date"])?.slice(0, 10) ?? null,
          benchmark_release_date: stringAt(row, ["benchmark_release_date"])?.slice(0, 10) ?? null,
          origin_source: originSource ?? null,
        },
      }));
    }

    const warnings: AdapterWarning[] = skippedPreprocessedMetrics > 0
      ? [{
          code: "partial" as const,
          message: `Skipped ${skippedPreprocessedMetrics} ECI-preprocessed non-accuracy rows; use their metric-specific source adapters`,
          url,
        }]
      : [];
    if (runsFetchWarning) warnings.push(runsFetchWarning);
    if (skippedRestrictedOrigin > 0) warnings.push({
      code: "partial",
      message: `Skipped ${skippedRestrictedOrigin} rows whose benchmark scores originate from Artificial Analysis`,
      url,
    });
    if (skippedVersionMismatches > 0) warnings.push({
      code: "partial",
      message: `Skipped ${skippedVersionMismatches} rows whose upstream benchmark version does not match the registry benchmark version`,
      url,
    });
    if (
      rows.length > 0
      && records.length === 0
      && skippedPreprocessedMetrics + skippedRestrictedOrigin + skippedVersionMismatches !== rows.length
    ) {
      warnings.push({ code: "parse_failed", message: "Epoch payload had rows but none contained model, benchmark, and performance", url });
    }
    return output(this.id, context, records, warnings);
  }
}
