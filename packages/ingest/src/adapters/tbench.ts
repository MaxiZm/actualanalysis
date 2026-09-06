import type { AdapterContext, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractHtmlRows, extractNextFlightArrayRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { isRow } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, sourceUrl } from "./helpers.js";
import { rowsToBenchmarkResults } from "./row-results.js";

export const TBENCH_URL = "https://www.tbench.ai/leaderboard";

function harnessClass(label: unknown, url: unknown): "common" | "native" | "unknown" {
  if (typeof label !== "string") return "unknown";
  const name = label.trim().toLowerCase();
  // The public agent identity distinguishes a shared, model-agnostic scaffold
  // from product agents. A leaderboard's native source is not a native harness.
  if (name === "mini-swe-agent" && typeof url === "string"
    && /^https:\/\/github\.com\/swe-agent\/mini-swe-agent\/?$/i.test(url)) return "common";
  if (["codex", "claude code", "grok build"].includes(name)) return "native";
  return "unknown";
}

export class TbenchAdapter implements IngestAdapter {
  readonly id = "tbench";
  readonly failSoft = true;

  async ingest(context: AdapterContext) {
    const url = sourceUrl(context, "ACTUALANALYSIS_TBENCH_URL", TBENCH_URL);
    const html = await fetchText(context, url);
    const flightRows = extractNextFlightArrayRows(html, "rows");
    const records: RawResult[] = [];

    for (const row of flightRows) {
      const metadata = isRow(row.metadata) ? row.metadata : {};
      const metrics = isRow(row.metrics) ? row.metrics : {};
      const modelDisplay = isRow(metadata.model_display) ? metadata.model_display : {};
      const agentDisplay = isRow(metadata.agent_display) ? metadata.agent_display : {};
      const modelName = typeof modelDisplay.label === "string" ? modelDisplay.label : undefined;
      const effort = typeof metadata.reasoning_effort === "string" ? metadata.reasoning_effort : undefined;
      const score = typeof metrics.accuracy === "number" ? metrics.accuracy : undefined;
      if (!modelName || score === undefined) continue;
      const reportedSe = typeof metrics.accuracy_stderr === "number" ? metrics.accuracy_stderr : undefined;
      const ciHalfWidth = typeof metrics.accuracy_ci95_half_width === "number" ? metrics.accuracy_ci95_half_width : undefined;
      const trials = typeof metrics.n_trials === "number" ? metrics.n_trials : typeof row.n_trials === "number" ? row.n_trials : undefined;
      const samplesPerTask = trials !== undefined && trials % 66 === 0 ? trials / 66 : undefined;
      const updatedOn = typeof row.updated_at === "string" ? row.updated_at.slice(0, 10) : undefined;
      const totalCost = typeof metrics.total_cost_usd === "number" ? metrics.total_cost_usd : undefined;
      const averageDuration = typeof metrics.avg_trial_duration_sec === "number" ? metrics.avg_trial_duration_sec : undefined;
      records.push(benchmarkResult({
        // Reasoning effort is an evaluation configuration, not part of the model identity.
        model: modelName,
        benchmark: "Terminal-Bench 4.0",
        benchmark_id: "terminal-bench-4.0",
        source_id: "tbench",
        score,
        score_unit: "percent",
        ...(reportedSe !== undefined && reportedSe >= 0
          ? { se: reportedSe, uncertainty_type: "se", uncertainty_value: reportedSe, uncertainty_unit: "run" }
          : ciHalfWidth !== undefined && ciHalfWidth >= 0
            ? { se: ciHalfWidth / 1.96 }
            : {}),
        n_items: 66,
        ...(samplesPerTask !== undefined && Number.isInteger(samplesPerTask) && samplesPerTask > 0 ? { k_trials: samplesPerTask } : {}),
        ...(typeof row.id === "string" && row.id.trim() ? { evaluation_run_id: row.id.trim() } : {}),
        ...(totalCost !== undefined && totalCost >= 0 && trials !== undefined && trials > 0 ? { cost_per_task: totalCost / trials } : {}),
        ...(averageDuration !== undefined && averageDuration >= 0 ? { latency_s: averageDuration } : {}),
        ...(effort ? { effort_tier: effort } : {}),
        config: {
          reasoning_effort: effort ?? null,
          agent: typeof agentDisplay.label === "string" ? agentDisplay.label : null,
        },
        harness: typeof agentDisplay.label === "string" ? agentDisplay.label : "Terminal-Bench",
        harness_class: harnessClass(agentDisplay.label, agentDisplay.url),
        observed_on: updatedOn && /^\d{4}-\d{2}-\d{2}$/.test(updatedOn)
          ? updatedOn
          : dateOnly(context.now()),
        source_url: url,
        provenance: "independent",
        metadata: {
          leaderboard_row_id: typeof row.id === "string" ? row.id : null,
          reported_model_name: modelName,
          source_agent_url: typeof agentDisplay.url === "string" ? agentDisplay.url : null,
          reported_ci95_half_width: ciHalfWidth ?? null,
          reported_standard_error: reportedSe ?? null,
          total_cost_usd: totalCost ?? null,
        },
      }));
    }

    if (records.length === 0) {
      records.push(...rowsToBenchmarkResults(extractHtmlRows(html), context, {
        benchmark: "Terminal-Bench 4.0",
        benchmarkId: "terminal-bench-4.0",
        sourceId: "tbench",
        sourceUrl: url,
        provenance: "independent",
      }));
    }

    return output(this.id, context, records, records.length === 0
      ? [{ code: "parse_failed", message: "Terminal-Bench markup contained no recognizable leaderboard rows", url }]
      : []);
  }
}
