import type { AdapterContext } from "../types.js";
import { fetchJson, HttpError } from "./http.js";
import { isRow, type TabularRow } from "./tabular.js";

export interface HuggingFaceRowsOptions {
  dataset: string;
  config: string;
  split: string;
  pageSize?: number;
  maxRows?: number;
  pageDelayMs?: number;
}

/** Reads Hub parquet through the public datasets-server JSON API; no Python runtime is needed. */
export async function fetchHuggingFaceRows(context: AdapterContext, options: HuggingFaceRowsOptions): Promise<TabularRow[]> {
  const pageSize = Math.min(options.pageSize ?? 100, 100);
  const maxRows = options.maxRows ?? 2_000;
  const rows: TabularRow[] = [];

  while (rows.length < maxRows) {
    const query = new URLSearchParams({
      dataset: options.dataset,
      config: options.config,
      split: options.split,
      offset: String(rows.length),
      length: String(Math.min(pageSize, maxRows - rows.length)),
    });
    const url = `https://datasets-server.huggingface.co/rows?${query}`;
    let payload: unknown;
    for (let attempt = 0; ; attempt++) {
      try {
        payload = await fetchJson(context, url);
        break;
      } catch (error) {
        if (!(error instanceof HttpError) || ![429, 502, 503, 504].includes(error.status) || attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    if (!isRow(payload) || !Array.isArray(payload.rows)) throw new Error("Hugging Face rows API returned an unexpected response");
    const page = payload.rows
      .map((entry) => isRow(entry) && isRow(entry.row) ? entry.row : entry)
      .filter(isRow);
    rows.push(...page);
    const total = typeof payload.num_rows_total === "number" ? payload.num_rows_total : undefined;
    if (total !== undefined && total > maxRows) throw new Error(`Hugging Face snapshot contains ${total} rows, exceeding the configured complete-snapshot limit ${maxRows}`);
    if (page.length < pageSize || (total !== undefined && rows.length >= total)) break;
    if (options.pageDelayMs) await new Promise((resolve) => setTimeout(resolve, options.pageDelayMs));
  }
  return rows;
}
