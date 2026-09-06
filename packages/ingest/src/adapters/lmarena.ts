import { createHash } from "node:crypto";
import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchHuggingFaceRows } from "../lib/huggingface.js";
import { fetchText } from "../lib/http.js";
import { isRow, numberAt, stringAt, type TabularRow } from "../lib/tabular.js";
import { rowsToBenchmarkResults } from "./row-results.js";

export const LMARENA_DATASET = "lmarena-ai/leaderboard-dataset";
export const LMARENA_SOURCE_URL = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset";

export const LMARENA_NATIVE_URL = "https://arena.ai/leaderboard/text/overall";

interface NativeSnapshot { rows: TabularRow[]; cutoff: string; sha256: string; }

/** Decode the official page's public React payload as JSON, never executable JS.
 * Reject partial or differently adjusted tables: ratings share a fitted scale,
 * so a newer model must arrive with its complete contemporaneous cohort.
 */
export function parseArenaNativeSnapshot(html: string): NativeSnapshot {
  const chunks: string[] = [];
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try {
      const value: unknown = JSON.parse(match[1]!);
      if (Array.isArray(value) && value[0] === 1 && typeof value[1] === "string") chunks.push(value[1]);
    } catch { /* Non-data scripts cannot supply a leaderboard. */ }
  }
  const data = chunks.join("");
  for (const match of data.matchAll(/"leaderboard"\s*:\s*(?=\{)/g)) {
    const start = match.index! + match[0].length;
    let depth = 0, quoted = false, escaped = false, end = start;
    for (; end < data.length; end++) {
      const char = data[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) { end++; break; }
    }
    let value: unknown;
    try { value = JSON.parse(data.slice(start, end)); } catch { continue; }
    if (!isRow(value) || value.arenaSlug !== "text" || value.leaderboardSlug !== "overall"
      || !isRow(value.params) || value.params.category !== "overall" || value.params.styleControl !== true
      || !Array.isArray(value.entries) || value.entries.length === 0
      || value.totalModels !== value.entries.length
      || typeof value.voteCutoffISOString !== "string"
      || !/^\d{4}-\d{2}-\d{2}T/.test(value.voteCutoffISOString)
      || !Number.isFinite(Date.parse(value.voteCutoffISOString))) continue;
    const names = new Set<string>();
    const rows: TabularRow[] = [];
    for (const entry of value.entries) {
      if (!isRow(entry)) break;
      const name = stringAt(entry, ["modelDisplayName"]);
      const rating = numberAt(entry, ["rating"]), low = numberAt(entry, ["ratingLower"]), high = numberAt(entry, ["ratingUpper"]);
      const votes = numberAt(entry, ["votes"]);
      if (!name || names.has(name) || rating === undefined || low === undefined || high === undefined
        || high <= low || low > rating || high < rating || votes === undefined || !Number.isInteger(votes) || votes <= 0) break;
      names.add(name);
      rows.push({ model_name: name, rating, rating_lower: low, rating_upper: high, vote_count: votes,
        rank: numberAt(entry, ["rank"]), organization: stringAt(entry, ["modelOrganization"]),
        arena_model_key: stringAt(entry, ["modelKey"]), release_type: stringAt(entry, ["releaseType"]),
        category: "overall", leaderboard_publish_date: value.voteCutoffISOString.slice(0, 10) });
    }
    if (rows.length !== value.entries.length) continue;
    return { rows, cutoff: value.voteCutoffISOString, sha256: createHash("sha256").update(html).digest("hex") };
  }
  throw new Error("Official Arena page has no complete, valid text overall style-controlled snapshot");
}

export class LmArenaAdapter implements IngestAdapter {
  readonly id = "lmarena";
  readonly failSoft = true;

  async ingest(context: AdapterContext) {
    const config = context.env.ACTUALANALYSIS_LMARENA_CONFIG ?? "text_style_control";
    const split = context.env.ACTUALANALYSIS_LMARENA_SPLIT ?? "latest";
    const warnings: AdapterWarning[] = [];
    const [hub, native] = await Promise.allSettled([
      fetchHuggingFaceRows(context, {
        dataset: LMARENA_DATASET,
        config,
        split,
        // The latest export includes >10,000 category rows. Read the full
        // snapshot before selecting overall; category order is not a contract.
        maxRows: 20_000,
        pageDelayMs: 1_100,
      }),
      config === "text_style_control" && split === "latest"
        ? fetchText(context, LMARENA_NATIVE_URL).then(parseArenaNativeSnapshot)
        : Promise.resolve(undefined),
    ]);
    let rows = hub.status === "fulfilled" ? hub.value : [];
    const hubDate = rows.reduce((latest, row) => {
      const date = stringAt(row, ["leaderboard_publish_date"])?.slice(0, 10) ?? "";
      return date > latest ? date : latest;
    }, "");
    const newerNative = native.status === "fulfilled" && native.value
      && (hub.status === "rejected" || native.value.cutoff.slice(0, 10) > hubDate) ? native.value : undefined;
    if (newerNative) {
      rows = newerNative.rows;
      warnings.push({ code: "partial", message: hub.status === "rejected"
        ? "Hugging Face export unavailable; used complete official Arena snapshot."
        : `Hugging Face export (${hubDate || "undated"}) lags official Arena snapshot (${newerNative.cutoff.slice(0, 10)}); used the complete newer cohort.`,
      url: LMARENA_NATIVE_URL });
    } else if (hub.status === "rejected") throw hub.reason;
    else if (native.status === "rejected") warnings.push({ code: "partial", message: "Official Arena snapshot unavailable or invalid; retained complete Hugging Face export.", url: LMARENA_NATIVE_URL });
    const overallRows = rows.filter((row) => {
      const category = stringAt(row, ["category"]);
      return category === undefined || category.toLowerCase() === "overall";
    });
    const rowByModel = new Map(overallRows.flatMap((row) => {
      const model = stringAt(row, ["model_name", "model", "name"]);
      return model ? [[model, row] as const] : [];
    }));
    const records: RawResult[] = rowsToBenchmarkResults(overallRows, context, {
      benchmark: "LMArena text, style-controlled",
      benchmarkId: "lmarena-text-style-controlled",
      sourceId: "lmarena",
      sourceUrl: newerNative ? LMARENA_NATIVE_URL : LMARENA_SOURCE_URL,
      provenance: "independent",
      scoreUnit: "elo",
      scoreColumns: ["rating", "elo", "score"],
    }).map((record) => {
      const row = rowByModel.get(record.model);
      const variance = row ? numberAt(row, ["variance"]) : undefined;
      const voteCount = row ? numberAt(row, ["vote_count", "votes"]) : undefined;
      const ciLow = row ? numberAt(row, ["rating_lower"]) : undefined;
      const ciHigh = row ? numberAt(row, ["rating_upper"]) : undefined;
      const publishDate = row ? stringAt(row, ["leaderboard_publish_date"])?.slice(0, 10) : undefined;
      return {
        ...record,
        config: { ...record.config, arena_model: record.model },
        ...(publishDate && /^\d{4}-\d{2}-\d{2}$/.test(publishDate)
          ? { evaluation_run_id: `text_style_control:${publishDate}` }
          : {}),
        ...(variance !== undefined && variance >= 0 ? { se: Math.sqrt(variance) }
          : newerNative && ciLow !== undefined && ciHigh !== undefined ? { se: (ciHigh - ciLow) / (2 * 1.96) } : {}),
        ...(newerNative ? { metadata: { ...record.metadata,
          arena_snapshot_cutoff: newerNative.cutoff,
          arena_snapshot_sha256: newerNative.sha256,
          arena_snapshot_model_count: newerNative.rows.length,
          arena_model_key: row ? stringAt(row, ["arena_model_key"]) ?? null : null,
          arena_release_type: row ? stringAt(row, ["release_type"]) ?? null : null,
          uncertainty_method: "SE derived from exact native 95% rating endpoints, width / (2 * 1.96)",
          uncertainty_method_url: "https://arena.ai/blog/arena-rank",
        } } : {}),
        ...(ciLow !== undefined && ciHigh !== undefined && ciHigh >= ciLow
          ? { uncertainty_type: "ci95" as const, uncertainty_value: [ciLow, ciHigh] as [number, number], uncertainty_unit: "source" as const }
          : {}),
        ...(voteCount !== undefined && Number.isInteger(voteCount) && voteCount > 0 ? { n_items: voteCount } : {}),
      };
    });
    return output(this.id, context, records, warnings);
  }
}
