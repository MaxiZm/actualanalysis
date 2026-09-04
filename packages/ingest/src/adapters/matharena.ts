import type { AdapterContext, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractHtmlRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { stringAt } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, parseTabularPayload, sourceUrl } from "./helpers.js";
import { metricEstimateAt } from "./row-results.js";

export const MATHARENA_URL = "https://matharena.ai/";

function modelIdentity(value: string): { model: string; evaluationProfile?: string } {
  const suffix = /\s+\((think(?:ing)?|none|minimal|low|medium|high|xhigh|max)\)$/i.exec(value.trim());
  if (!suffix?.[1]) return { model: value.trim() };
  return {
    model: value.slice(0, suffix.index).trim(),
    evaluationProfile: suffix[1],
  };
}

export class MathArenaAdapter implements IngestAdapter {
  readonly id = "matharena";
  readonly failSoft = true;

  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_MATHARENA_URL", MATHARENA_URL);
    const text = await fetchText(context, url);
    const rows = /<html|<!doctype/i.test(text) ? extractHtmlRows(text) : parseTabularPayload(text, url);
    const records: RawResult[] = [];

    for (const row of rows) {
      const rawModel = stringAt(row, ["Model", "model_name"]);
      const performance = metricEstimateAt(row, ["Expected performance", "expected_performance", "score"]);
      if (!rawModel || !performance) continue;
      const identity = modelIdentity(rawModel);
      const expectedCost = metricEstimateAt(row, ["Expected cost", "expected_cost", "cost"]);
      records.push(benchmarkResult({
        model: identity.model,
        benchmark: "MathArena composite",
        benchmark_id: "matharena-composite",
        source_id: "matharena",
        score: performance.estimate,
        score_unit: "percent",
        // The page labels ± as a symmetric 95% parametric-bootstrap CI.
        ...(performance.uncertainty !== undefined ? { se: performance.uncertainty / 1.96 } : {}),
        ...(identity.evaluationProfile ? { effort_tier: identity.evaluationProfile } : {}),
        n_runs: 4,
        ...(expectedCost && expectedCost.estimate >= 0 ? { cost_per_task: expectedCost.estimate } : {}),
        config: {
          aggregate: "non-deprecated competitions",
          evaluation_profile: identity.evaluationProfile ?? null,
        },
        harness: "MathArena expected-performance IRT",
        observed_on: dateOnly(context.now()),
        source_url: url,
        provenance: "independent",
        metadata: {
          provider: stringAt(row, ["Provider", "organization"]) ?? null,
          reported_model_name: rawModel,
          model_release_date: stringAt(row, ["Release date"])?.slice(0, 10) ?? null,
          reported_ci95_half_width: performance.uncertainty ?? null,
          uncertainty_method: "symmetric parametric bootstrap CI with full IRT refits",
        },
      }));
    }

    return output(this.id, context, records, rows.length > 0 && records.length === 0
      ? [{ code: "parse_failed", message: "MathArena page exposed no recognizable expected-performance rows", url }]
      : []);
  }
}
