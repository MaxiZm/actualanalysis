import type { Provenance } from "@actualanalysis/shared";
import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { extractHtmlRows, extractNextFlightArrayRows } from "../lib/html.js";
import { fetchText } from "../lib/http.js";
import { parseTabularPayload } from "./helpers.js";
import { rowsToBenchmarkResults } from "./row-results.js";

export interface ScrapeFeed {
  url: string;
  env?: string;
  benchmark: string;
  benchmarkId: string;
  sourceId: string;
  provenance: Provenance;
  modelColumns?: string[];
  scoreColumns?: string[];
}

export class TolerantScraperAdapter implements IngestAdapter {
  readonly failSoft = true;

  constructor(public readonly id: string, private readonly feeds: readonly ScrapeFeed[]) {}

  async ingest(context: AdapterContext) {
    const records: RawResult[] = [];
    const warnings: AdapterWarning[] = [];
    for (const feed of this.feeds) {
      const url = (feed.env ? context.env[feed.env] : undefined) ?? feed.url;
      try {
        const text = await fetchText(context, url);
        const rows = /<html|<!doctype/i.test(text)
          ? [
              ...extractHtmlRows(text),
              ...extractNextFlightArrayRows(text, "rows"),
              ...extractNextFlightArrayRows(text, "items"),
              ...extractNextFlightArrayRows(text, "entries"),
              ...extractNextFlightArrayRows(text, "data"),
              ...extractNextFlightArrayRows(text, "leaderboard"),
            ]
          : parseTabularPayload(text, url);
        const parsed = rowsToBenchmarkResults(rows, context, {
          benchmark: feed.benchmark,
          benchmarkId: feed.benchmarkId,
          sourceId: feed.sourceId,
          sourceUrl: url,
          provenance: feed.provenance,
          ...(feed.modelColumns ? { modelColumns: feed.modelColumns } : {}),
          ...(feed.scoreColumns ? { scoreColumns: feed.scoreColumns } : {}),
        });
        records.push(...parsed);
        if (parsed.length === 0) warnings.push({
          code: "parse_failed",
          message: `${feed.benchmark} markup contained no recognizable leaderboard rows; upstream may have changed`,
          url,
        });
      } catch (error) {
        warnings.push({ code: "fetch_failed", message: error instanceof Error ? error.message : String(error), url });
      }
    }
    return output(this.id, context, records, warnings);
  }
}
