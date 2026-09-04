#!/usr/bin/env node
import { createAdapters } from "./adapters/registry.js";
import { cliUsage, parseCliArgs } from "./cli-options.js";
import { ingestSources, writeResolvedRecords } from "./orchestrator.js";
import { writeUnmappedReportIfChanged } from "./unmapped-report.js";

async function main(): Promise<void> {
  const adapters = createAdapters();
  const options = parseCliArgs(process.argv.slice(2), [...adapters.keys()]);
  if (options === null) {
    console.log(cliUsage([...adapters.keys()]));
    return;
  }
  const ingested = await ingestSources({ sources: options.sources, dataDir: options.dataDir, adapters });
  if (!options.dryRun) {
    await writeUnmappedReportIfChanged(options.unmappedFile, ingested.unmapped);
  }
  if (options.outputFile) await writeResolvedRecords(options.outputFile, ingested.records);

  const report = {
    dry_run: options.dryRun,
    sources: options.sources,
    records: ingested.records.length,
    selected_records: ingested.selectedRecords.length,
    superseded_records: ingested.supersededRecords.length,
    benchmark_results: ingested.records.filter(({ record_type }) => record_type === "benchmark_result").length,
    pricing: ingested.records.filter(({ record_type }) => record_type === "pricing").length,
    unmapped: ingested.unmapped,
    warnings: ingested.warnings,
    output: options.outputFile ?? null,
    ...(options.dryRun ? { preview: ingested.records.slice(0, 20) } : {}),
  };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.records} records from ${options.sources.length} source(s); ${ingested.unmapped.length} unmapped name(s).`);
    for (const item of ingested.unmapped) console.log(`UNMAPPED ${item.kind} ${JSON.stringify(item.value)} (${item.source_id}, ${item.occurrences}x)`);
    for (const warning of ingested.warnings) console.warn(`WARN ${warning.source}/${warning.code}: ${warning.message}`);
    if (options.outputFile) console.log(`Wrote resolved records to ${options.outputFile}`);
    if (options.dryRun && ingested.records.length > 0) console.log(JSON.stringify(report.preview, null, 2));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
