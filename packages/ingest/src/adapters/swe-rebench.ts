import type { AdapterContext, IngestAdapter, RawBenchmarkResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractHtmlRows, extractNextFlightArrayRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { stringAt, type TabularRow } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, parseTabularPayload, sourceUrl } from "./helpers.js";
import { rowsToBenchmarkResults } from "./row-results.js";

export const SWE_REBENCH_LEADERBOARD_URL = "https://swe-rebench.com/leaderboard";
/** One common source task cohort, not a per-model widest or highest-scoring window. */
export const SWE_REBENCH_TASK_WINDOW = {
  key: "1778803200000:1782864000000",
  start: "2026-05-15",
  end: "2026-07-01",
  version: "window-2026-05-15-2026-07-01",
  nItems: 111,
} as const;

function object(value: unknown): TabularRow | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as TabularRow : undefined;
}

export function parseSweRebenchNativeRows(rows: readonly TabularRow[], context: AdapterContext, url: string): RawBenchmarkResult[] {
  return rows.flatMap((row) => {
    if (object(row.meta)?.instance_type !== "model") return [];
    const label = stringAt(row, ["modelName"]);
    const modelId = stringAt(row, ["modelId"]);
    const agent = stringAt(row, ["agentVersion"]);
    const stats = object(object(object(row.rangeStats)?.all)?.[SWE_REBENCH_TASK_WINDOW.key]);
    if (!label || !modelId || agent !== "tools" || !stats || typeof stats.resolvedRate !== "number" || !Number.isFinite(stats.resolvedRate)) return [];
    const effort = /\[(none|minimal|low|medium|high|xhigh|max)\]/iu.exec(label)?.[1]?.toLowerCase();
    const model = label.replace(/\s*\[(none|minimal|low|medium|high|xhigh|max)\]/giu, "").trim();
    const release = stringAt(object(row.release) ?? {}, ["date"]);
    const se = typeof stats.sem === "number" && Number.isFinite(stats.sem) && stats.sem >= 0 ? stats.sem : undefined;
    const cost = typeof stats.instanceCosts === "number" && Number.isFinite(stats.instanceCosts) && stats.instanceCosts >= 0 ? stats.instanceCosts : undefined;
    const runId = `${SWE_REBENCH_TASK_WINDOW.key}:${modelId}`;
    return [benchmarkResult({
      model,
      ...(model === "DeepSeek-V4 Pro" && release === "2026-04-24" ? { model_id: "deepseek-v4-pro-0424" } : {}),
      benchmark: "SWE-rebench",
      benchmark_id: "swe-rebench",
      benchmark_version: SWE_REBENCH_TASK_WINDOW.version,
      source_id: "swe-rebench",
      score: stats.resolvedRate,
      score_unit: "percent",
      n_items: SWE_REBENCH_TASK_WINDOW.nItems,
      k_trials: 5,
      n_runs: 5,
      ...(se === undefined ? {} : { se, uncertainty_type: "se", uncertainty_value: se, uncertainty_unit: "run" }),
      ...(cost === undefined ? {} : { cost_per_task: cost }),
      ...(effort ? { effort_tier: effort } : {}),
      harness: `SWE-rebench ReAct ${agent}`,
      harness_class: "common",
      tool_policy: "terminal-tools",
      evaluation_run_id: runId,
      lineage_id: `swe-rebench:${runId}`,
      metadata_incomplete: true,
      config: {
        task_window_start: SWE_REBENCH_TASK_WINDOW.start,
        task_window_end: SWE_REBENCH_TASK_WINDOW.end,
        agent_version: agent,
        language: "all",
        ...(effort ? { reasoning_effort: effort } : {}),
      },
      observed_on: dateOnly(context.now()),
      source_url: url,
      provenance: "independent",
      origin_provenance: "independent",
      metadata: {
        source_model_id: modelId,
        source_model_release: release ?? null,
        task_window_key: SWE_REBENCH_TASK_WINDOW.key,
        pass_at_5: typeof stats.passN === "number" ? stats.passN : null,
        average_total_tokens: typeof stats.totalTokenUsage === "number" ? stats.totalTokenUsage : null,
        notes: "Common 111-task cohort; source SEM across five runs. Exact harness commit and V1/V2 revision are not reported. Historical windows and standalone agent products are not pooled with model results.",
      },
    })];
  });
}

export class SweRebenchAdapter implements IngestAdapter {
  readonly id = "swe-rebench";
  readonly failSoft = true;
  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_SWE_REBENCH_URL", SWE_REBENCH_LEADERBOARD_URL);
    const text = await fetchText(context, url);
    const isHtml = /<html|<!doctype/i.test(text);
    const nativeRows = isHtml ? extractNextFlightArrayRows(text, "items") : parseTabularPayload(text, url);
    const hasNativeRows = nativeRows.some((row) => object(row.rangeStats));
    if (hasNativeRows) {
      const records = parseSweRebenchNativeRows(nativeRows, context, url);
      return output(this.id, context, records, records.length ? [] : [{
        code: "partial", message: `No model results for the pinned common cohort ${SWE_REBENCH_TASK_WINDOW.start}–${SWE_REBENCH_TASK_WINDOW.end}; historical windows were not substituted.`, url,
      }]);
    }
    // A rendered table/export without source task-window metadata is useful
    // for display, but cannot silently become a measurement of today's cohort.
    const rows = isHtml ? extractHtmlRows(text) : nativeRows;
    const records = rowsToBenchmarkResults(rows, context, {
      benchmark: "SWE-rebench", benchmarkId: "swe-rebench", sourceId: this.id,
      sourceUrl: url, provenance: "independent",
      scoreColumns: ["resolved_rate", "pass_rate", "score", "resolved_percent", "accuracy"],
    }).map((row) => ({ ...row, benchmark_version: "unversioned", metadata_incomplete: true,
      config: { ...row.config, aci_fit_eligible: false, aci_exclusion_reason: "SWE-rebench task window and scaffold are not reported in this export." },
    }));
    return output(this.id, context, records, [{ code: "partial", message: "SWE-rebench native task-window data was unavailable; unversioned table rows are display-only.", url }]);
  }
}
