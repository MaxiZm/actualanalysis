import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desc, inArray } from "drizzle-orm";
import { createDatabase } from "./client.js";
import type { Database } from "./client.js";
import { PublicSnapshotSchema } from "./import-snapshot.js";
import {
  benchmarkParams,
  benchmarks,
  cells,
  indexRuns,
  indexScores,
  models,
  pricing,
  results,
  sources,
} from "./schema.js";

const SNAPSHOT_FILENAMES = [
  "snapshot.json",
  "index-scores.csv",
  "benchmark-params.csv",
  "cells.csv",
  "results.csv",
  "models.csv",
  "benchmarks.csv",
  "sources.csv",
  "pricing.csv",
] as const;

type SnapshotFilename = (typeof SNAPSHOT_FILENAMES)[number];
type SnapshotFiles = Record<SnapshotFilename, string>;
type IndexRunRow = typeof indexRuns.$inferSelect;

const SNAPSHOT_KINDS = ["mixed", "agentic", "chat"] as const;

export type SnapshotRunIds = Record<(typeof SNAPSHOT_KINDS)[number], string>;

export function serializeSnapshotCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0] ?? {});
  const escape = (value: unknown) => {
    const serial = value instanceof Date
      ? value.toISOString()
      : typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value ?? "");
    return /[",\n]/u.test(serial) ? `"${serial.replaceAll('"', '""')}"` : serial;
  };
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => escape(row[header])).join(",")).join("\n")}\n`;
}

export interface SnapshotSummary {
  output: string;
  runs: number;
  scores: number;
  results: number;
}

export function selectSnapshotRuns(
  allRuns: readonly IndexRunRow[],
  exactRunIds?: SnapshotRunIds,
): { chosen: IndexRunRow[]; history: IndexRunRow[] } {
  if (!exactRunIds) {
    const chosen = SNAPSHOT_KINDS.flatMap((kind) => allRuns.find((run) => run.kind === kind) ?? []);
    if (chosen.length !== SNAPSHOT_KINDS.length) {
      throw new Error(`Refusing to publish an incomplete snapshot: found ${chosen.length}/3 latest index runs.`);
    }
    return { chosen, history: [...allRuns] };
  }

  const requestedIds = SNAPSHOT_KINDS.map((kind) => exactRunIds[kind]);
  if (new Set(requestedIds).size !== SNAPSHOT_KINDS.length) {
    throw new Error("Exact snapshot run IDs must be distinct for mixed, agentic, and chat.");
  }

  const chosen = SNAPSHOT_KINDS.map((kind) => {
    const requestedId = exactRunIds[kind];
    const run = allRuns.find((candidate) => candidate.id === requestedId);
    if (!run) throw new Error(`Exact ${kind} snapshot run does not exist: ${requestedId}`);
    if (run.kind !== kind) {
      throw new Error(`Exact ${kind} snapshot run ${requestedId} has kind ${run.kind}.`);
    }
    return run;
  });
  const chosenByKind = new Map(chosen.map((run) => [run.kind, run]));
  const history = allRuns.filter((run) => {
    const cutoff = chosenByKind.get(run.kind);
    return cutoff !== undefined && run.createdAt.getTime() <= cutoff.createdAt.getTime();
  });
  return { chosen, history };
}

/**
 * Publishes a complete immutable snapshot directory with one filesystem rename.
 * Existing dated snapshots are never removed or overwritten: callers must use a
 * new stamp, which also keeps a failed retry from damaging the last good export.
 */
export async function publishSnapshotFilesAtomically(
  output: string,
  files: SnapshotFiles,
  options: { replaceExisting?: boolean } = {},
): Promise<void> {
  const parent = path.dirname(output);
  await mkdir(parent, { recursive: true });
  try {
    await lstat(output);
    if (!options.replaceExisting) throw new Error(`Refusing to overwrite existing snapshot directory: ${output}`);
    // A same-day refresh after a newer accepted run set: the previous export is
    // archived (never deleted) so the dated path always holds the latest runs.
    const archive = path.join(parent, ".archive");
    await mkdir(archive, { recursive: true });
    await rename(output, path.join(archive, `${path.basename(output)}-${new Date().toISOString().replaceAll(":", "-")}`));
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const staging = await mkdtemp(path.join(parent, `.${path.basename(output)}-`));
  try {
    await Promise.all(SNAPSHOT_FILENAMES.map((filename) =>
      writeFile(path.join(staging, filename), files[filename], { flag: "wx" })
    ));
    await rename(staging, output);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/** Retired conditions are kept in the database audit, but leave every current export. */
export function excludeRetiredBenchmarks<
  B extends { id: string; status?: string | null },
  R extends { benchmarkId: string },
  P extends { benchmarkId: string },
  C extends { benchmarkId: string },
>(input: { benchmarks: B[]; results: R[]; params: P[]; cells: C[] }) {
  const benchmarks = input.benchmarks.filter((row) => row.status !== "retired");
  const ids = new Set(benchmarks.map((row) => row.id));
  return {
    benchmarks,
    results: input.results.filter((row) => ids.has(row.benchmarkId)),
    params: input.params.filter((row) => ids.has(row.benchmarkId)),
    cells: input.cells.filter((row) => ids.has(row.benchmarkId)),
  };
}

/** A corrected publication lists exactly the input observations it reviewed.
 * Rows from older DB runs remain in storage, but cannot silently reappear in the
 * current benchmark tables/exports after a revision or duplicate correction.
 * Older run sets without an inventory retain their historical export behavior.
 */
export function selectCurrentEvidence<R extends { observationKey: string | null }>(
  rows: R[], runs: Array<{ params: Record<string, unknown> | null }>,
): R[] {
  const inventories = runs.map(run => run.params?.current_evidence_observation_keys);
  if (!inventories.length || !inventories.every((keys): keys is string[] => Array.isArray(keys) && keys.every(key => typeof key === "string"))) return rows;
  const allowed = new Set(inventories.flat());
  return rows.filter(row => row.observationKey !== null && allowed.has(row.observationKey));
}

/**
 * Writes the complete audit surface for the selected index runs. Source rows
 * retain their redistribution policy so consumers can distinguish reusable
 * records from display-only evidence. Speed remains excluded by contract.
 */
export async function exportSnapshot(
  db: Database,
  root: string,
  stamp = new Date().toISOString().slice(0, 10),
  exactRunIds?: SnapshotRunIds,
  options: { replaceExisting?: boolean } = {},
): Promise<SnapshotSummary> {
  const allRuns = await db.select().from(indexRuns).orderBy(desc(indexRuns.createdAt));
  const { chosen, history } = selectSnapshotRuns(allRuns, exactRunIds);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(stamp)) {
    throw new Error(`Snapshot stamp must use YYYY-MM-DD format: ${stamp}`);
  }
  const output = path.join(root, "data", "snapshots", stamp);
  const runIds = chosen.map((run) => run.id);
  const historyRunIds = history.map((run) => run.id);
  const [sourceRows, scoreRows, allParams, allCells, allResults, modelRows, allBenchmarks, priceRows] = await Promise.all([
    db.select().from(sources),
    historyRunIds.length ? db.select().from(indexScores).where(inArray(indexScores.runId, historyRunIds)) : [],
    runIds.length ? db.select().from(benchmarkParams).where(inArray(benchmarkParams.runId, runIds)) : [],
    runIds.length ? db.select().from(cells).where(inArray(cells.runId, runIds)) : [],
    db.select().from(results),
    db.select().from(models),
    db.select().from(benchmarks),
    db.select().from(pricing),
  ]);
  const { benchmarks: benchmarkRows, results: resultRows, params, cells: cellRows } = excludeRetiredBenchmarks({
    benchmarks: allBenchmarks, results: selectCurrentEvidence(allResults, chosen), params: allParams, cells: allCells,
  });
  const diagnostics = Object.fromEntries(chosen.map((run) => {
    const paramsRecord = run.params ?? {};
    const runDiagnostics = typeof paramsRecord.diagnostics === "object" && paramsRecord.diagnostics !== null
      ? paramsRecord.diagnostics
      : {};
    const benchmarkWeights = paramsRecord.benchmarkWeights ?? paramsRecord.benchmark_weights ?? {};
    return [run.id, { kind: run.kind, diagnostics: runDiagnostics, benchmarkWeights }];
  }));
  const snapshot = {
    generated_at: new Date().toISOString(),
    license: "Mixed; see sources[].license and sources[].redistributable",
    data_policy: "All benchmark evidence is available for on-site audit. Rows whose source is not redistributable are display-only.",
    exclusions: [
      "speed observations are non-redistributable and are never included",
      "rows absent from the selected publication evidence inventory remain in database history and are excluded from current exports",
    ],
    diagnostics,
    runs: history,
    scores: scoreRows,
    benchmark_params: params,
    cells: cellRows,
    results: resultRows,
    models: modelRows,
    benchmarks: benchmarkRows,
    sources: sourceRows,
    pricing: priceRows,
  };
  const publicSnapshot = PublicSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
  const files: SnapshotFiles = {
    "snapshot.json": `${JSON.stringify(publicSnapshot, null, 2)}\n`,
    "index-scores.csv": serializeSnapshotCsv(scoreRows as unknown as Array<Record<string, unknown>>),
    "benchmark-params.csv": serializeSnapshotCsv(params as unknown as Array<Record<string, unknown>>),
    "cells.csv": serializeSnapshotCsv(cellRows as unknown as Array<Record<string, unknown>>),
    "results.csv": serializeSnapshotCsv(resultRows as unknown as Array<Record<string, unknown>>),
    "models.csv": serializeSnapshotCsv(modelRows as unknown as Array<Record<string, unknown>>),
    "benchmarks.csv": serializeSnapshotCsv(benchmarkRows as unknown as Array<Record<string, unknown>>),
    "sources.csv": serializeSnapshotCsv(sourceRows as unknown as Array<Record<string, unknown>>),
    "pricing.csv": serializeSnapshotCsv(priceRows as unknown as Array<Record<string, unknown>>),
  };
  await publishSnapshotFilesAtomically(output, files, options);
  return { output, runs: history.length, scores: scoreRows.length, results: resultRows.length };
}

async function main() {
  const { db, close } = createDatabase();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../..");
  try {
    const summary = await exportSnapshot(db, root);
    process.stdout.write(`Wrote auditable snapshot to ${summary.output}\n`);
  } finally {
    await close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
