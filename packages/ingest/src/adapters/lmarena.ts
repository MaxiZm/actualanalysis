import type { AdapterContext, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchHuggingFaceRows } from "../lib/huggingface.js";
import { numberAt, stringAt } from "../lib/tabular.js";
import { rowsToBenchmarkResults } from "./row-results.js";

export const LMARENA_DATASET = "lmarena-ai/leaderboard-dataset";
export const LMARENA_SOURCE_URL = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset";

export class LmArenaAdapter implements IngestAdapter {
  readonly id = "lmarena";
  readonly failSoft = true;

  async ingest(context: AdapterContext) {
    const rows = await fetchHuggingFaceRows(context, {
      dataset: LMARENA_DATASET,
      config: context.env.ACTUALANALYSIS_LMARENA_CONFIG ?? "text_style_control",
      split: context.env.ACTUALANALYSIS_LMARENA_SPLIT ?? "latest",
      maxRows: 2_000,
    });
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
      sourceUrl: LMARENA_SOURCE_URL,
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
        ...(publishDate && /^\d{4}-\d{2}-\d{2}$/.test(publishDate)
          ? { evaluation_run_id: `text_style_control:${publishDate}` }
          : {}),
        ...(variance !== undefined && variance >= 0 ? { se: Math.sqrt(variance) } : {}),
        ...(ciLow !== undefined && ciHigh !== undefined && ciHigh >= ciLow
          ? { uncertainty_type: "ci95" as const, uncertainty_value: [ciLow, ciHigh] as [number, number], uncertainty_unit: "source" as const }
          : {}),
        ...(voteCount !== undefined && Number.isInteger(voteCount) && voteCount > 0 ? { n_items: voteCount } : {}),
      };
    });
    return output(this.id, context, records);
  }
}
