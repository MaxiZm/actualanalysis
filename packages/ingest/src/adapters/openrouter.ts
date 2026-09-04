import { RawPricingSchema, type AdapterContext, type IngestAdapter, type RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchJson } from "../lib/http.js";
import { isRow, rowsFromUnknown } from "../lib/tabular.js";
import { sourceUrl } from "./helpers.js";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

function perMillion(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export class OpenRouterAdapter implements IngestAdapter {
  readonly id = "openrouter";
  readonly failSoft = true;

  constructor(private readonly url?: string) {}

  async ingest(context: AdapterContext) {
    const url = this.url ?? sourceUrl(context, "ACTUALANALYSIS_OPENROUTER_URL", OPENROUTER_MODELS_URL);
    const payload = await fetchJson(context, url);
    const rows = rowsFromUnknown(payload);
    const records: RawResult[] = [];

    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : undefined;
      const pricing = isRow(row.pricing) ? row.pricing : {};
      const topProvider = isRow(row.top_provider) ? row.top_provider : {};
      const input = perMillion(pricing.prompt ?? pricing.input);
      const outputPrice = perMillion(pricing.completion ?? pricing.output);
      if (!id || input === undefined || outputPrice === undefined) continue;
      records.push(RawPricingSchema.parse({
        record_type: "pricing",
        model: id,
        source_id: "openrouter",
        provider: "openrouter",
        input_per_million: input,
        output_per_million: outputPrice,
        cache_read_per_million: perMillion(pricing.input_cache_read ?? pricing.cache_read),
        cache_write_per_million: perMillion(pricing.input_cache_write ?? pricing.cache_write),
        context_length: positiveInteger(row.context_length),
        max_output: positiveInteger(topProvider.max_completion_tokens ?? row.max_completion_tokens),
        fetched_at: context.now().toISOString(),
        source_url: url,
        metadata: {
          openrouter_id: id,
          author: id.includes("/") ? id.split("/")[0] ?? null : null,
          canonical_slug: typeof row.canonical_slug === "string" ? row.canonical_slug : null,
        },
      }));
    }

    return output(this.id, context, records, rows.length > 0 && records.length === 0
      ? [{ code: "parse_failed", message: "OpenRouter response had no models with prompt and completion prices", url }]
      : []);
  }
}
