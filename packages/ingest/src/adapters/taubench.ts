import type { AdapterContext, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractHtmlRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { numberAt, stringAt } from "../lib/tabular.js";
import { benchmarkResult, dateOnly, sourceUrl } from "./helpers.js";

export const TAU3_BANKING_URL = "https://taubench.com/leaderboard?benchmark=knowledge";
const TAU3_BANKING_TASKS = 97;
const TAU3_LEADERBOARD_TRIALS = 4;

function releaseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const isoDate = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value)?.[1];
  if (isoDate) return isoDate;
  // Date-only human labels must not shift a day with the ingest host timezone.
  const timestamp = Date.parse(`${value} UTC`);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString().slice(0, 10);
}

export class TauBenchAdapter implements IngestAdapter {
  readonly id = "taubench";
  readonly failSoft = true;

  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_TAUBENCH_URL", TAU3_BANKING_URL);
    const html = await fetchText(context, url);
    const rows = extractHtmlRows(html);
    const records: RawResult[] = [];

    for (const row of rows) {
      const model = stringAt(row, ["Model"]);
      // The live header contains all pass^k labels, while its displayed value is pass^1.
      const score = numberAt(row, ["Pass^1 Pass^2 Pass^3 Pass^4 ↓", "Pass^1", "Pass@1"]);
      if (!model || score === undefined) continue;
      const modelReleaseDate = releaseDate(stringAt(row, ["Released"]));
      const effort = stringAt(row, ["Reasoning"]);
      const costPerTrajectory = numberAt(row, ["Cost", "Average Cost", "Avg Cost"]);
      records.push(benchmarkResult({
        model,
        benchmark: "tau3-bench Banking",
        benchmark_id: "tau3-bench-banking",
        source_id: "taubench",
        score,
        score_unit: "percent",
        n_items: TAU3_BANKING_TASKS,
        k_trials: TAU3_LEADERBOARD_TRIALS,
        ...(costPerTrajectory !== undefined && costPerTrajectory >= 0 ? { cost_per_task: costPerTrajectory } : {}),
        ...(effort ? { effort_tier: effort } : {}),
        config: {
          reasoning_effort: effort ?? null,
          retrieval: stringAt(row, ["Retrieval"]) ?? null,
          user_simulator: stringAt(row, ["User Sim"]) ?? null,
        },
        harness: "tau3-bench Banking leaderboard",
        observed_on: dateOnly(context.now()),
        source_url: url,
        provenance: "self_report",
        metadata: {
          rank: numberAt(row, ["Rank"]) ?? null,
          model_release_date: modelReleaseDate ?? null,
          task_count_source: "tau3-bench v1 banking_knowledge release",
        },
      }));
    }

    return output(this.id, context, records, records.length === 0
      ? [{ code: "parse_failed", message: "tau3-bench Banking table contained no pass^1 rows", url }]
      : []);
  }
}
