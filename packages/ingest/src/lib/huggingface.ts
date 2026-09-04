import type { AdapterContext } from "../types.js";
import { fetchJson } from "./http.js";
import { isRow, type TabularRow } from "./tabular.js";

export interface HuggingFaceRowsOptions {
  dataset: string;
  config: string;
  split: string;
  pageSize?: number;
  maxRows?: number;
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
    const payload = await fetchJson(context, `https://datasets-server.huggingface.co/rows?${query}`);
    if (!isRow(payload) || !Array.isArray(payload.rows)) throw new Error("Hugging Face rows API returned an unexpected response");
    const page = payload.rows
      .map((entry) => isRow(entry) && isRow(entry.row) ? entry.row : entry)
      .filter(isRow);
    rows.push(...page);
    const total = typeof payload.num_rows_total === "number" ? payload.num_rows_total : undefined;
    if (page.length < pageSize || (total !== undefined && rows.length >= total)) break;
  }
  return rows;
}

