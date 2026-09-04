import type { AdapterContext, AdapterOutput, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { deduplicateRecords } from "./records.js";

export function output(source: string, context: AdapterContext, records: RawResult[], warnings: AdapterWarning[] = []): AdapterOutput {
  const deduplicated = deduplicateRecords(records);
  if (deduplicated.length === 0 && !warnings.some(({ code }) => code === "no_records")) {
    warnings.push({ code: "no_records", message: `${source} returned no usable records` });
  }
  return { source, records: deduplicated, warnings, fetched_at: context.now().toISOString() };
}

/** Makes scheduled ingestion resilient while preserving explicit error diagnostics. */
export async function runAdapter(adapter: IngestAdapter, context: AdapterContext): Promise<AdapterOutput> {
  try {
    return await adapter.ingest(context);
  } catch (error) {
    if (!adapter.failSoft) throw error;
    return output(adapter.id, context, [], [{
      code: "fetch_failed",
      message: error instanceof Error ? error.message : String(error),
    }]);
  }
}

