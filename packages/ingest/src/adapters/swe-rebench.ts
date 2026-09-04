import type { AdapterContext, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractHtmlRows, extractNextFlightArrayRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { booleanAt, stringAt, type TabularRow } from "../lib/tabular.js";
import { parseTabularPayload, sourceUrl } from "./helpers.js";
import { rowsToBenchmarkResults } from "./row-results.js";

export const SWE_REBENCH_LEADERBOARD_URL = "https://swe-rebench.com/leaderboard";

export class SweRebenchAdapter implements IngestAdapter {
  readonly id = "swe-rebench";
  readonly failSoft = true;

  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_SWE_REBENCH_URL", SWE_REBENCH_LEADERBOARD_URL);
    const text = await fetchText(context, url);
    const isHtml = /<html|<!doctype/i.test(text);
    const rows = isHtml
      ? [...extractHtmlRows(text), ...extractNextFlightArrayRows(text, "items")]
      : parseTabularPayload(text, url);
    let records: RawResult[] = rowsToBenchmarkResults(rows, context, {
      benchmark: "SWE-rebench",
      benchmarkId: "swe-rebench",
      sourceId: "swe-rebench",
      sourceUrl: url,
      provenance: "independent",
      scoreColumns: ["resolved_rate", "pass_rate", "score", "resolved_percent", "accuracy"],
    });

    if (records.length === 0) {
      const nextSummaries = rows.flatMap((row) => {
        const model = stringAt(row, ["modelName", "model_name", "model"]);
        const rangeStats = row.rangeStats;
        if (!model || !rangeStats || typeof rangeStats !== "object" || Array.isArray(rangeStats)) return [];
        const all = (rangeStats as Record<string, unknown>).all;
        if (!all || typeof all !== "object" || Array.isArray(all)) return [];
        const configuredRange = row.taskRangeTimestamp && typeof row.taskRangeTimestamp === "object" && !Array.isArray(row.taskRangeTimestamp)
          ? `${String((row.taskRangeTimestamp as Record<string, unknown>).from)}:${String((row.taskRangeTimestamp as Record<string, unknown>).to)}`
          : undefined;
        const candidates = Object.entries(all as Record<string, unknown>)
          .filter((entry): entry is [string, TabularRow] => Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]))
          .sort(([left], [right]) => {
            const span = (key: string): number => {
              const [from = "0", to = "0"] = key.split(":");
              return Number(to) - Number(from);
            };
            return span(right) - span(left);
          });
        const stats = (configuredRange ? candidates.find(([key]) => key === configuredRange)?.[1] : undefined) ?? candidates[0]?.[1];
        if (!stats || typeof stats.resolvedRate !== "number") return [];
        return [{
          model,
          score: stats.resolvedRate,
          ...(typeof stats.sem === "number" && stats.sem >= 0 ? { se: stats.sem } : {}),
          observed_on: context.now().toISOString().slice(0, 10),
        }];
      });
      records = rowsToBenchmarkResults(nextSummaries, context, {
        benchmark: "SWE-rebench",
        benchmarkId: "swe-rebench",
        sourceId: "swe-rebench",
        sourceUrl: url,
        provenance: "independent",
      });
    }

    if (records.length === 0) {
      const groups = new Map<string, { passed: number; total: number; rows: TabularRow[] }>();
      for (const row of rows) {
        const model = stringAt(row, ["model", "model_name", "agent", "system"]);
        const passed = booleanAt(row, ["resolved", "passed", "success"]);
        if (!model || passed === undefined) continue;
        const group = groups.get(model) ?? { passed: 0, total: 0, rows: [] };
        group.passed += passed ? 1 : 0;
        group.total += 1;
        group.rows.push(row);
        groups.set(model, group);
      }
      const summaries = [...groups.entries()].map(([model, group]) => ({ model, score: group.passed / group.total, n_items: group.total }));
      records = rowsToBenchmarkResults(summaries, context, {
        benchmark: "SWE-rebench",
        benchmarkId: "swe-rebench",
        sourceId: "swe-rebench",
        sourceUrl: url,
        provenance: "independent",
      });
    }

    return output(this.id, context, records, rows.length > 0 && records.length === 0
      ? [{ code: "parse_failed", message: "SWE-rebench response had no aggregate or per-instance model outcomes", url }]
      : []);
  }
}
