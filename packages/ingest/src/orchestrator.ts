import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRegistry } from "@actualanalysis/shared";
import { createAdapters } from "./adapters/registry.js";
import { runAdapter } from "./lib/adapter.js";
import {
  resolveRecordAliases,
  selectPreferredResults,
  type UnmappedName,
} from "./lib/records.js";
import {
  createAdapterContext,
  type AdapterContext,
  type AdapterOutput,
  type IngestAdapter,
  type RawResult,
} from "./types.js";
import { annotateObservationMetadata } from "./observation-annotations.js";

export interface SourceWarning {
  source: string;
  code: string;
  message: string;
  url?: string;
}

export interface IngestSourcesOptions {
  sources: readonly string[] | "all";
  dataDir: string;
  adapters?: ReadonlyMap<string, IngestAdapter>;
  fetch?: AdapterContext["fetch"];
  now?: AdapterContext["now"];
  signal?: AbortSignal;
  env?: AdapterContext["env"];
}

export interface IngestSourcesResult {
  sources: string[];
  records: RawResult[];
  selectedRecords: RawResult[];
  supersededRecords: RawResult[];
  unmapped: UnmappedName[];
  warnings: SourceWarning[];
  outputs: AdapterOutput[];
}

/** Complete fetch -> validate -> deduplicate -> alias-resolution orchestration for pipelines. */
export async function ingestSources(options: IngestSourcesOptions): Promise<IngestSourcesResult> {
  const adapters = options.adapters ?? createAdapters();
  const requested = options.sources === "all" ? [...adapters.keys()] : [...new Set(options.sources)];
  for (const source of requested) {
    if (!adapters.has(source)) throw new Error(`Unknown ingest source: ${source}`);
  }

  const registry = await loadRegistry(options.dataDir);
  const context = createAdapterContext({
    dataDir: options.dataDir,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const outputs = await Promise.all(requested.map(async (source): Promise<AdapterOutput> => {
    const adapter = adapters.get(source);
    if (!adapter) throw new Error(`Unknown ingest source: ${source}`);
    return runAdapter(adapter, context);
  }));

  const resolved = resolveRecordAliases(outputs.flatMap(({ records }) => records), registry);
  const annotatedRecords = annotateObservationMetadata(resolved.records, registry);
  const selection = selectPreferredResults(annotatedRecords);
  const warnings: SourceWarning[] = outputs.flatMap((sourceOutput) => sourceOutput.warnings.map((warning) => ({
    source: sourceOutput.source,
    code: warning.code,
    message: warning.message,
    ...(warning.url ? { url: warning.url } : {}),
  })));

  return {
    sources: requested,
    records: annotatedRecords,
    selectedRecords: selection.kept,
    supersededRecords: selection.superseded,
    unmapped: resolved.unmapped,
    warnings,
    outputs,
  };
}

export async function writeResolvedRecords(filename: string, records: readonly RawResult[]): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}
