import type { AdapterContext, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractNextFlightArrayRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { isRow, numberAt, stringAt } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, sourceUrl } from "./helpers.js";

export const MCPMARK_URL = "https://mcpmark.ai/leaderboard";
const MCPMARK_TASKS = 127;
const MCPMARK_RUNS = 4;

function modelIdentity(value: string): { model: string; evaluationProfile?: string } {
  const suffix = /-(reasoner|chat|thinking|non-think)$/i.exec(value.trim());
  if (!suffix?.[1]) return { model: value.trim() };
  return { model: value.slice(0, suffix.index), evaluationProfile: suffix[1] };
}

function submissionEffort(value: string | undefined): string | undefined {
  // The API model ID may be dated and unsuffixed while the leaderboard submission
  // explicitly distinguishes configurations such as gpt-5-high and gpt-5-medium.
  return value?.match(/-(xhigh|max|high|medium|low|minimal|none|thinking|non-think|chat|reasoner)$/i)?.[1]?.toLowerCase();
}

/** MCPMark publishes normalized leaderboard rows in its Next.js Flight data. */
export class McpMarkAdapter implements IngestAdapter {
  readonly id = "mcpmark";
  readonly failSoft = true;

  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_MCPMARK_URL", MCPMARK_URL);
    const html = await fetchText(context, url);
    const rows = extractNextFlightArrayRows(html, "data");
    const records: RawResult[] = [];

    for (const row of rows) {
      const rawModel = stringAt(row, ["actualModelName"]);
      const passAtOne = isRow(row.passAtOne) ? row.passAtOne : {};
      const score = numberAt(passAtOne, ["avg"]) ?? numberAt(row, ["avgSuccessRate"]);
      if (!rawModel || score === undefined) continue;
      const identity = modelIdentity(rawModel);
      const submission = stringAt(row, ["name", "key"]) ?? rawModel;
      const effort = submissionEffort(submission) ?? identity.evaluationProfile;
      const reportedStd = numberAt(passAtOne, ["std"]);
      const totalTasks = numberAt(row, ["totalTasks", "total_tasks"]);
      const nItems = totalTasks !== undefined && Number.isInteger(totalTasks) && totalTasks > 0
        ? totalTasks
        : MCPMARK_TASKS;
      const perRunCost = numberAt(row, ["perRunCost", "per_run_cost"]);
      const averageExecutionTime = numberAt(row, ["avgExecutionTime", "avg_agent_execution_time"]);
      const derivedSe = reportedStd !== undefined && reportedStd >= 0
        ? reportedStd / Math.sqrt(MCPMARK_RUNS)
        : undefined;
      records.push(benchmarkResult({
        model: identity.model,
        benchmark: "MCPMark",
        benchmark_id: "mcpmark",
        source_id: "mcpmark",
        score,
        score_unit: "fraction",
        ...(derivedSe !== undefined ? { se: derivedSe } : {}),
        ...(derivedSe !== undefined ? { uncertainty_type: "se", uncertainty_value: derivedSe, uncertainty_unit: "run" } : {}),
        n_items: nItems,
        k_trials: MCPMARK_RUNS,
        n_runs: MCPMARK_RUNS,
        ...(perRunCost !== undefined && perRunCost >= 0 ? { cost_per_task: perRunCost / nItems } : {}),
        ...(averageExecutionTime !== undefined && averageExecutionTime >= 0 ? { latency_s: averageExecutionTime } : {}),
        ...(effort ? { effort_tier: effort } : {}),
        config: {
          submission,
          ...(effort ? { reasoning_effort: effort } : {}),
          evaluation_profile: identity.evaluationProfile ?? null,
        },
        harness: "MCPMark",
        observed_on: dateOnly(context.now()),
        source_url: url,
        provenance: "independent",
        metadata: {
          rank: numberAt(row, ["rank"]) ?? null,
          reported_model_name: rawModel,
          reported_pass_at_1_std: reportedStd ?? null,
          uncertainty_note: "SE derived as the upstream pass@1 standard deviation divided by sqrt(4 runs)",
          pass_at_4: numberAt(row, ["passAtFour"]) ?? null,
          pass_hat_4: numberAt(row, ["passHatFour"]) ?? null,
          average_execution_time_seconds: averageExecutionTime ?? null,
          per_run_cost_usd: perRunCost ?? null,
        },
      }));
    }

    return output(this.id, context, records, records.length === 0
      ? [{ code: "parse_failed", message: "MCPMark Flight payload contained no normalized leaderboard data", url }]
      : []);
  }
}
