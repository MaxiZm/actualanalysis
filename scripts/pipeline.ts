#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAdapters,
  annotateObservationMetadata,
  ingestSources,
  resolveRecordAliases,
  selectPreferredResults,
  selectLineageObservations,
  stableStringify,
  writeUnmappedReportIfChanged,
  type RawResult,
  RawResultSchema,
} from "@actualanalysis/ingest";
import {
  createDatabase,
  exportSnapshot,
  indexRuns,
  persistIngestRecords,
  persistRunInTransaction,
  RunArtifactSchema,
  resultObservationKey,
  seedRegistry,
  type RunArtifact,
} from "@actualanalysis/db";
import { auditCalibrationPanelCoverage, auditCalibrationPanelPerDomainCoverage, auditReferenceCoverage, coerceAci12RegistryInput, coerceScoringInput, runAci12Nuts, runScoring, type Aci12PosteriorOutput, type IndexKind, type ScoringRun } from "@actualanalysis/scoring";
import { loadRegistry } from "@actualanalysis/shared";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kinds = ["mixed", "agentic", "chat"] as const;

interface Options {
  sources: string[] | "all";
  dataDir: string;
  input?: string;
  ingestOutput?: string;
  bootstrap?: number;
  dryRun: boolean;
  skipScore: boolean;
  commitSnapshot: boolean;
}

function usage(): string {
  return `ActualAnalysis ingestion and scoring pipeline

Usage:
  npm run pipeline -- --all [--commit-snapshot]
  npm run pipeline -- epoch openrouter swe-rebench
  npm run pipeline -- --input work/resolved-records.json

Options:
  --all                    Run every registered adapter (fail-soft where declared)
  --input PATH             Use a previously resolved RawResult[] instead of fetching
  --data-dir PATH          Registry directory (default: data/)
  --ingest-output PATH     Save resolved adapter records as JSON
  --bootstrap N            Override bootstrap iterations (useful for smoke tests)
  --dry-run                Fetch/validate/score, but do not write Postgres or snapshots
  --skip-score             Ingest and persist only
  --commit-snapshot        Export latest real runs and raw public data under data/snapshots
  -h, --help               Show this help
`;
}

function parseArgs(argv: string[]): Options | null {
  const sources: string[] = [];
  let all = false;
  let input: string | undefined;
  let dataDir = path.join(root, "data");
  let ingestOutput: string | undefined;
  let bootstrap: number | undefined;
  let dryRun = false;
  let skipScore = false;
  let commitSnapshot = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "-h" || argument === "--help") return null;
    if (argument === "--all") all = true;
    else if (argument === "--dry-run") dryRun = true;
    else if (argument === "--skip-score") skipScore = true;
    else if (argument === "--commit-snapshot") commitSnapshot = true;
    else if (argument === "--input" || argument === "--data-dir" || argument === "--ingest-output" || argument === "--bootstrap") {
      if (!next) throw new Error(`${argument} requires a value`);
      if (argument === "--input") input = path.resolve(next);
      if (argument === "--data-dir") dataDir = path.resolve(next);
      if (argument === "--ingest-output") ingestOutput = path.resolve(next);
      if (argument === "--bootstrap") {
        bootstrap = Number(next);
        if (!Number.isInteger(bootstrap) || bootstrap < 1) throw new Error("--bootstrap must be a positive integer");
      }
      index += 1;
    } else if (argument?.startsWith("-")) throw new Error(`Unknown option ${argument}`);
    else if (argument) sources.push(argument);
  }
  if (all && sources.length) throw new Error("Use --all or explicit source names, not both");
  if (input && (all || sources.length)) throw new Error("--input cannot be combined with live adapter sources");
  if (!input && !all && sources.length === 0) throw new Error(usage());
  if (dryRun && commitSnapshot) throw new Error("--dry-run and --commit-snapshot cannot be combined");
  if (skipScore && commitSnapshot) {
    throw new Error("--skip-score and --commit-snapshot cannot be combined; a snapshot requires one new run for every index");
  }
  return {
    sources: all ? "all" : sources,
    dataDir,
    ...(input ? { input } : {}),
    ...(ingestOutput ? { ingestOutput } : {}),
    ...(bootstrap === undefined ? {} : { bootstrap }),
    dryRun,
    skipScore,
    commitSnapshot,
  };
}

export interface RunSetReadiness {
  complete: boolean;
  createdKinds: IndexKind[];
  missingKinds: IndexKind[];
  unpublishableKinds: IndexKind[];
  issues: Partial<Record<IndexKind, string>>;
}

export interface PersistencePlan {
  mode: "publish" | "ingest_only" | "skip_incomplete";
  writeDatabase: boolean;
  exportSnapshot: boolean;
  runSet: RunSetReadiness;
}

/**
 * Database publication is all-or-nothing: one failed index prevents every
 * registry, ingest, and run mutation for that scoring attempt. An explicit
 * --skip-score run remains the separate opt-in path for ingest-only writes.
 */
export function assessRunSet(
  runs: Partial<Record<IndexKind, RunArtifact>>,
): RunSetReadiness {
  const createdKinds = kinds.filter((kind) => runs[kind] !== undefined);
  const missingKinds = kinds.filter((kind) => runs[kind] === undefined);
  // Methodology §8.2: a provisional system is published as an interval. A
  // view in which no system reaches Ranked (e.g. the chat basket while the
  // communication domain is thin) is therefore still publishable as intervals;
  // only the headline mixed view must rank at least one system.
  const hasRanked = (kind: IndexKind) => {
    const run = runs[kind];
    return run !== undefined && run.scores.some((score) => !score.provisional && score.rank !== null);
  };
  const unpublishableKinds = kinds.filter((kind) => kind === "mixed" && runs[kind] !== undefined && !hasRanked(kind));
  const intervalOnlyKinds = kinds.filter((kind) => kind !== "mixed" && runs[kind] !== undefined && !hasRanked(kind));
  const issues: Partial<Record<IndexKind, string>> = {};
  for (const kind of missingKinds) issues[kind] = "no run artifact was produced";
  for (const kind of unpublishableKinds) {
    issues[kind] = "run has no non-provisional score with a published rank";
  }
  for (const kind of intervalOnlyKinds) {
    issues[kind] = "interval-only view: no system reaches the Ranked tier in this profile";
  }
  return {
    complete: missingKinds.length === 0 && unpublishableKinds.length === 0,
    createdKinds,
    missingKinds,
    unpublishableKinds,
    issues,
  };
}

export function planPersistence(
  runs: Partial<Record<IndexKind, RunArtifact>>,
  options: Pick<Options, "skipScore" | "commitSnapshot">,
): PersistencePlan {
  const runSet = assessRunSet(runs);
  if (options.skipScore) {
    return { mode: "ingest_only", writeDatabase: true, exportSnapshot: false, runSet };
  }
  if (!runSet.complete) {
    return { mode: "skip_incomplete", writeDatabase: false, exportSnapshot: false, runSet };
  }
  return {
    mode: "publish",
    writeDatabase: true,
    exportSnapshot: options.commitSnapshot,
    runSet,
  };
}

const RawResultFileSchema = z.array(RawResultSchema);

async function loadRecords(options: Options) {
  const registry = await loadRegistry(options.dataDir, { includeManualResults: true });
  if (options.input) {
    const parsed = RawResultFileSchema.parse(JSON.parse(await readFile(options.input, "utf8")));
    const resolved = resolveRecordAliases(parsed, registry);
    const annotated = annotateObservationMetadata(resolved.records, registry);
    const selection = selectPreferredResults(annotated);
    return {
      registry,
      records: annotated,
      selectedRecords: selection.kept,
      supersededRecords: selection.superseded,
      unmapped: resolved.unmapped,
      warnings: [] as Array<{ source: string; code: string; message: string }>,
      sources: ["input-file"],
    };
  }
  const ingested = await ingestSources({
    sources: options.sources,
    dataDir: options.dataDir,
    adapters: createAdapters(),
  });
  return { registry, ...ingested };
}

export type MappedBenchmarkRecord = Extract<RawResult, { record_type: "benchmark_result" }> & {
  model_id: string;
  benchmark_id: string;
};

type LoadedRegistry = Awaited<ReturnType<typeof loadRegistry>>;

export function mappedBenchmarkRecords(records: readonly RawResult[]): MappedBenchmarkRecord[] {
  return records.filter(
    (record): record is MappedBenchmarkRecord =>
      record.record_type === "benchmark_result" && Boolean(record.model_id && record.benchmark_id),
  );
}

const effortPriority = new Map([
  ["none", 0],
  ["minimal", 1],
  ["low", 2],
  ["medium", 3],
  ["high", 4],
  ["xhigh", 5],
  ["max", 6],
]);

function normalizedEffort(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/gu, "");
  return effortPriority.has(normalized) ? normalized : null;
}

function configEffortRank(config: MappedBenchmarkRecord["config"]): number {
  return Math.max(
    ...[config.reasoning_effort, config.evaluation_profile]
      .map(normalizedEffort)
      .filter((value): value is string => value !== null)
      .map((value) => effortPriority.get(value) ?? 0),
    0,
  );
}

function prefersDirectProvider(config: MappedBenchmarkRecord["config"]): number {
  return config.provider_adapter === false ? 1 : 0;
}

function hasTools(config: MappedBenchmarkRecord["config"]): number {
  const value = config.tools;
  return value !== undefined && value !== null && value !== false && (!Array.isArray(value) || value.length > 0) ? 1 : 0;
}

function benchmarkKinds(benchmark: LoadedRegistry["benchmarks"][number]): IndexKind[] {
  if (benchmark.status !== "active") return [];
  return kinds.filter((kind) => kind === "mixed" || benchmark.tags.includes(kind));
}

function stableRecordOrder(left: MappedBenchmarkRecord, right: MappedBenchmarkRecord): number {
  return left.model_id.localeCompare(right.model_id)
    || left.benchmark_id.localeCompare(right.benchmark_id)
    || left.source_id.localeCompare(right.source_id)
    || right.observed_on.localeCompare(left.observed_on)
    || stableStringify(left).localeCompare(stableStringify(right));
}

export interface ConfigExclusion {
  reason_code: "non_canonical_config" | "duplicate_source_for_canonical_config" | "ambiguous_canonical_config";
  detail: string;
  model_id: string;
  benchmark_id: string;
  source_id: string;
  observed_on: string;
  config_key: string;
  selected_config_key: string | null;
}

export interface CanonicalConfigSelection {
  records: MappedBenchmarkRecord[];
  exclusions: ConfigExclusion[];
}

/**
 * Select exactly one stable config per model/benchmark after provenance selection.
 * Exact-config rows from multiple sources remain available for precision pooling,
 * but a source contributes at most one observation to that eventual single cell.
 */
export function selectCanonicalScoringRecords(
  records: readonly MappedBenchmarkRecord[],
): CanonicalConfigSelection {
  const groups = new Map<string, MappedBenchmarkRecord[]>();
  for (const record of records) {
    const key = stableStringify({ model_id: record.model_id, benchmark_id: record.benchmark_id });
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const kept: MappedBenchmarkRecord[] = [];
  const exclusions: ConfigExclusion[] = [];
  for (const group of [...groups.values()].sort((left, right) => stableRecordOrder(left[0]!, right[0]!))) {
    const configs = new Map<string, MappedBenchmarkRecord[]>();
    for (const record of group) {
      const key = stableStringify(record.config);
      const configRows = configs.get(key) ?? [];
      configRows.push(record);
      configs.set(key, configRows);
    }
    const rankedConfigs = [...configs.entries()].sort(([leftKey, leftRows], [rightKey, rightRows]) => {
      const left = leftRows[0]!;
      const right = rightRows[0]!;
      return configEffortRank(right.config) - configEffortRank(left.config)
        || prefersDirectProvider(right.config) - prefersDirectProvider(left.config)
        || hasTools(right.config) - hasTools(left.config)
        || Math.max(...rightRows.map((row) => Date.parse(row.observed_on))) - Math.max(...leftRows.map((row) => Date.parse(row.observed_on)))
        || Math.max(...rightRows.map((row) => row.score)) - Math.max(...leftRows.map((row) => row.score))
        || leftKey.localeCompare(rightKey);
    });
    const selectedConfig = rankedConfigs[0];
    if (!selectedConfig) continue;
    const [selectedConfigKey, selectedRows] = selectedConfig;

    for (const [configKey, configRows] of configs) {
      if (configKey === selectedConfigKey) continue;
      for (const record of configRows) {
        exclusions.push({
          reason_code: "non_canonical_config",
          detail: "A higher-priority canonical config was selected for this model and benchmark.",
          model_id: record.model_id,
          benchmark_id: record.benchmark_id,
          source_id: record.source_id,
          observed_on: record.observed_on,
          config_key: configKey,
          selected_config_key: selectedConfigKey,
        });
      }
    }

    const sourceRows = new Map<string, MappedBenchmarkRecord>();
    for (const record of [...selectedRows].sort(stableRecordOrder)) {
      const previous = sourceRows.get(record.source_id);
      if (!previous) {
        sourceRows.set(record.source_id, record);
        continue;
      }
      exclusions.push({
        reason_code: "duplicate_source_for_canonical_config",
        detail: "Only the newest stable row from a source may contribute to the canonical cell.",
        model_id: record.model_id,
        benchmark_id: record.benchmark_id,
        source_id: record.source_id,
        observed_on: record.observed_on,
        config_key: selectedConfigKey,
        selected_config_key: selectedConfigKey,
      });
    }
    kept.push(...sourceRows.values());
  }

  return {
    records: kept.sort(stableRecordOrder),
    exclusions: exclusions.sort((left, right) =>
      left.benchmark_id.localeCompare(right.benchmark_id)
      || left.model_id.localeCompare(right.model_id)
      || left.source_id.localeCompare(right.source_id)
      || left.observed_on.localeCompare(right.observed_on)
      || left.config_key.localeCompare(right.config_key)
      || left.reason_code.localeCompare(right.reason_code)),
  };
}

export interface UncertaintyExclusion {
  reason_code: "benchmark_inactive" | "missing_accuracy_uncertainty" | "missing_reported_se";
  detail: string;
  model_id: string;
  benchmark_id: string;
  source_id: string;
  observed_on: string;
  config_key: string;
  transform: string;
  affected_indexes: IndexKind[];
}

export interface ScoringEligibility {
  records: MappedBenchmarkRecord[];
  exclusions: UncertaintyExclusion[];
}

/** Validate the uncertainty contract without falling back to another config or provenance tier. */
export function selectScorableRecords(
  registry: Pick<LoadedRegistry, "benchmarks">,
  records: readonly MappedBenchmarkRecord[],
): ScoringEligibility {
  const benchmarks = new Map(registry.benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const kept: MappedBenchmarkRecord[] = [];
  const exclusions: UncertaintyExclusion[] = [];
  for (const record of [...records].sort(stableRecordOrder)) {
    const benchmark = benchmarks.get(record.benchmark_id);
    if (!benchmark) throw new Error(`Mapped result references unknown benchmark ${record.benchmark_id}`);
    if (benchmark.status !== "active") {
      exclusions.push({
        reason_code: "benchmark_inactive",
        detail: `Benchmark is ${benchmark.status}; observations remain visible but do not enter scoring.`,
        model_id: record.model_id,
        benchmark_id: record.benchmark_id,
        source_id: record.source_id,
        observed_on: record.observed_on,
        config_key: stableStringify(record.config),
        transform: benchmark.transform.type,
        affected_indexes: [],
      });
      continue;
    }
    const hasReportedSe = record.se !== undefined && Number.isFinite(record.se) && record.se >= 0;
    const hasRowItems = record.n_items !== undefined
      && Number.isInteger(record.n_items)
      && record.n_items > 0;
    const hasBenchmarkItems = benchmark.n_items !== undefined
      && benchmark.n_items !== null
      && Number.isInteger(benchmark.n_items)
      && benchmark.n_items > 0;
    const isAccuracy = benchmark.transform.type === "accuracy";
    if (hasReportedSe || (isAccuracy && (hasRowItems || hasBenchmarkItems))) {
      kept.push(record);
      continue;
    }
    exclusions.push({
      reason_code: isAccuracy ? "missing_accuracy_uncertainty" : "missing_reported_se",
      detail: isAccuracy
        ? "Accuracy results require a finite nonnegative SE, a positive row n_items, or a positive benchmark n_items."
        : `${benchmark.transform.type} results require a finite nonnegative reported SE.`,
      model_id: record.model_id,
      benchmark_id: record.benchmark_id,
      source_id: record.source_id,
      observed_on: record.observed_on,
      config_key: stableStringify(record.config),
      transform: benchmark.transform.type,
      affected_indexes: benchmarkKinds(benchmark),
    });
  }
  exclusions.sort((left, right) =>
    left.benchmark_id.localeCompare(right.benchmark_id)
    || left.model_id.localeCompare(right.model_id)
    || left.source_id.localeCompare(right.source_id)
    || left.observed_on.localeCompare(right.observed_on)
    || left.config_key.localeCompare(right.config_key)
    || left.reason_code.localeCompare(right.reason_code));
  return { records: kept, exclusions };
}

export function feasibilityReason(
  kind: IndexKind,
  registry: LoadedRegistry,
  records: readonly MappedBenchmarkRecord[],
): string | null {
  const referenceBenchmark = registry.indexConfig.reference_benchmark;
  const benchmarkIds = new Set(
    registry.benchmarks
      .filter((benchmark) => benchmark.status === "active")
      .filter((benchmark) => kind === "mixed" ? benchmark.tags.length > 0 : benchmark.tags.includes(kind))
      .map((benchmark) => benchmark.id),
  );
  const relevant = records.filter((record) => benchmarkIds.has(record.benchmark_id));
  const representedBenchmarks = new Set(relevant.map((record) => record.benchmark_id));
  const representedModels = new Set(relevant.map((record) => record.model_id));
  if (referenceBenchmark && !representedBenchmarks.has(referenceBenchmark)) {
    return `reference benchmark ${referenceBenchmark} has no scorable result`;
  }
  if (representedModels.size < 2) return "fewer than two scorable models";
  if (representedBenchmarks.size < 2) return "fewer than two scorable benchmarks";
  const modelsByBenchmark = new Map<string, Set<string>>();
  const benchmarksByModel = new Map<string, Set<string>>();
  for (const record of relevant) {
    const benchmarkModels = modelsByBenchmark.get(record.benchmark_id) ?? new Set<string>();
    benchmarkModels.add(record.model_id);
    modelsByBenchmark.set(record.benchmark_id, benchmarkModels);
    const modelBenchmarks = benchmarksByModel.get(record.model_id) ?? new Set<string>();
    modelBenchmarks.add(record.benchmark_id);
    benchmarksByModel.set(record.model_id, modelBenchmarks);
  }
  const reachableBenchmarks = new Set([referenceBenchmark]);
  const reachableModels = new Set<string>();
  const queue = [referenceBenchmark];
  while (queue.length > 0) {
    const benchmarkId = queue.shift();
    if (!benchmarkId) continue;
    for (const modelId of modelsByBenchmark.get(benchmarkId) ?? []) {
      if (reachableModels.has(modelId)) continue;
      reachableModels.add(modelId);
      for (const connectedBenchmarkId of benchmarksByModel.get(modelId) ?? []) {
        if (reachableBenchmarks.has(connectedBenchmarkId)) continue;
        reachableBenchmarks.add(connectedBenchmarkId);
        queue.push(connectedBenchmarkId);
      }
    }
  }
  if (reachableModels.size !== representedModels.size) return `evidence graph is disconnected from reference benchmark ${referenceBenchmark}`;
  return null;
}

function reasonCounts<T extends { reason_code: string }>(rows: readonly T[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.reason_code, (counts.get(row.reason_code) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function meanSquared(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value * value, 0) / values.length : 0;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export interface RunInputAudit {
  scoring_input_sha256: string;
  config_sha256: string;
  registry_sha256: string;
  bootstrap_seed: number | string | null;
  anchors: Array<{ model_id: string; value: number }>;
  publication_coverage: {
    scorable_results: number;
    models: number;
    benchmarks: number;
    fitted_cells: number;
    positive_weight_benchmarks: number;
    ranked_models: number;
    by_source: Record<string, number>;
  };
  eligibility_rejections: {
    config: number;
    uncertainty: number;
    total: number;
  };
  scoring_eligibility?: {
    config_exclusions: ConfigExclusion[];
    uncertainty_exclusions: UncertaintyExclusion[];
  };
}

interface PriorRunCoverage {
  kind: IndexKind;
  createdAt: Date;
  params: Record<string, unknown>;
}

function publicationCoverage(value: Record<string, unknown>): RunInputAudit["publication_coverage"] | null {
  const candidate = value.publication_coverage;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  const numericKeys = [
    "scorable_results",
    "models",
    "benchmarks",
    "fitted_cells",
    "positive_weight_benchmarks",
    "ranked_models",
  ] as const;
  if (numericKeys.some((key) => typeof record[key] !== "number" || !Number.isFinite(record[key]))) return null;
  const bySource = record.by_source;
  if (!bySource || typeof bySource !== "object" || Array.isArray(bySource)) return null;
  if (Object.values(bySource).some((count) => typeof count !== "number" || !Number.isFinite(count))) return null;
  return {
    scorable_results: record.scorable_results as number,
    models: record.models as number,
    benchmarks: record.benchmarks as number,
    fitted_cells: record.fitted_cells as number,
    positive_weight_benchmarks: record.positive_weight_benchmarks as number,
    ranked_models: record.ranked_models as number,
    by_source: bySource as Record<string, number>,
  };
}

/** Refuse unattended publication when a fail-soft source materially shrinks the evidence graph. */
export function publicationCoverageRegressions(
  runs: Partial<Record<IndexKind, RunArtifact>>,
  priorRuns: readonly PriorRunCoverage[],
): string[] {
  const reasons: string[] = [];
  for (const kind of kinds) {
    const current = runs[kind];
    if (!current) continue;
    const previousRow = [...priorRuns]
      .filter((row) => row.kind === kind && row.params.publication_status !== "rejected")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (!previousRow) continue;
    const previous = publicationCoverage(previousRow.params);
    const next = publicationCoverage(current.params);
    if (!previous || !next) continue;
    for (const metric of ["scorable_results", "fitted_cells", "ranked_models"] as const) {
      if (previous[metric] > 0 && next[metric] < Math.ceil(previous[metric] * 0.8)) {
        reasons.push(`${kind} ${metric} fell from ${previous[metric]} to ${next[metric]}`);
      }
    }
    if (next.positive_weight_benchmarks < previous.positive_weight_benchmarks) {
      reasons.push(
        `${kind} positive_weight_benchmarks fell from ${previous.positive_weight_benchmarks} to ${next.positive_weight_benchmarks}`,
      );
    }
    for (const [sourceId, previousCount] of Object.entries(previous.by_source)) {
      const nextCount = next.by_source[sourceId] ?? 0;
      if (previousCount > 0 && nextCount < Math.ceil(previousCount * 0.5)) {
        reasons.push(`${kind} source ${sourceId} fell from ${previousCount} to ${nextCount} scorable results`);
      }
    }
  }
  return reasons.sort();
}

export function toRunArtifact(
  run: ScoringRun,
  createdAt = new Date().toISOString(),
  inputAudit?: RunInputAudit,
): RunArtifact {
  const fitCellsByBenchmark = new Map<string, typeof run.fit.cells>();
  for (const cell of run.fit.cells) {
    const group = fitCellsByBenchmark.get(cell.benchmarkId) ?? [];
    group.push(cell);
    fitCellsByBenchmark.set(cell.benchmarkId, group);
  }
  const cellGroups = new Map<string, typeof run.fit.cells>();
  for (const cell of run.fit.cells) {
    const key = `${cell.modelId}\0${cell.benchmarkId}`;
    const group = cellGroups.get(key) ?? [];
    group.push(cell);
    cellGroups.set(key, group);
  }

  return RunArtifactSchema.parse({
    kind: run.kind,
    method_version: run.methodVersion,
    created_at: createdAt,
    params: {
      harness_variance: run.harnessVariance,
      harness_variance_pairs: run.harnessPairCount,
      final_gradient_norm: run.fit.gradientNorm,
      final_max_parameter_update: run.fit.maximumUpdate,
      objective: run.fit.objective,
      iterations: run.fit.iterations,
      converged: run.fit.converged,
      reference_benchmark_id: run.fit.referenceBenchmarkId,
      anchor_transform: run.anchorTransform,
      bootstrap: {
        requested: run.bootstrap.requestedIterations,
        attempted: run.bootstrap.attemptedIterations,
        completed: run.bootstrap.completedIterations,
        failed: run.bootstrap.failedIterations,
        failures_by_reason: run.bootstrap.failureReasons,
        confidence_level: run.bootstrap.confidenceLevel,
        ties: run.bootstrap.ties,
      },
      diagnostics: {
        public_private_gaps: run.publicPrivateGaps,
        leave_one_out: run.leaveOneOut.models,
        mean_win_rates: run.meanWinRates,
        public_outlier_cells: run.outlierCells.map((cell) => cell.cellId),
      },
      benchmark_weights: run.benchmarkWeights,
      ...(inputAudit ?? {}),
    },
    scores: run.scores.map((score) => ({
      model_id: score.modelId,
      score: score.score,
      ci_low: score.ciLow,
      ci_high: score.ciHigh,
      rank: score.rank,
      rank_low: score.rankLow,
      rank_high: score.rankHigh,
      coverage: score.coverage,
      n_private: score.privateCount,
      robust_score: score.robustScore,
      flags: score.flags,
      provisional: score.provisional,
      pairwise: run.bootstrap.pairwise[score.modelId] ?? {},
    })),
    benchmark_params: Object.keys(run.fit.difficulties).sort().map((benchmarkId) => {
      const weight = run.benchmarkWeights[benchmarkId];
      const residuals = (fitCellsByBenchmark.get(benchmarkId) ?? []).map((cell) => cell.residual);
      return {
        benchmark_id: benchmarkId,
        difficulty: run.fit.difficulties[benchmarkId] ?? 0,
        slope: run.fit.discriminations[benchmarkId] ?? 1,
        weight: weight?.weight ?? 0,
        weight_factors: weight
          ? {
              ...weight.factors,
              ...Object.fromEntries(
                Object.entries(weight.categoryShares).map(([category, share]) => [
                  `category:${category}`,
                  share,
                ]),
              ),
            }
          : {
              discrimination: 0,
              saturation: 0,
              sources: 0,
              privacy: 0,
              categoryBalance: 0,
            },
        residual_var: meanSquared(residuals),
      };
    }),
    cells: [...cellGroups.values()].map((group) => ({
      ...(() => {
        const exclusions = inputAudit?.scoring_eligibility?.config_exclusions.filter(
          (exclusion) => exclusion.model_id === group[0]!.modelId && exclusion.benchmark_id === group[0]!.benchmarkId,
        ) ?? [];
        return {
          canonical_config: exclusions[0]?.selected_config_key ?? null,
          alternative_configs: [...new Set(exclusions.map((exclusion) => exclusion.config_key))].sort(),
        };
      })(),
      model_id: group[0]!.modelId,
      benchmark_id: group[0]!.benchmarkId,
      y: group.reduce((sum, cell) => sum + cell.y, 0) / group.length,
      y_hat: group.reduce((sum, cell) => sum + cell.predicted, 0) / group.length,
      z: group.reduce((sum, cell) => sum + cell.z, 0) / group.length,
      used: true,
    })),
  });
}

function toAci12RunArtifacts(
  posterior: Aci12PosteriorOutput,
  registry: LoadedRegistry,
  diagnostics: Record<string, unknown>,
  createdAt: string,
  posteriorPath: string,
  evidenceObservationKeys: string[],
): Record<IndexKind, RunArtifact> {
  const benchmarkById = new Map(registry.benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const profileMetric = (kind: IndexKind, systemId: string) => {
    const system = posterior.systems[systemId]!;
    if (kind !== "mixed" && system.index_profiles?.[kind]) return system.index_profiles[kind]!;
    if (kind === "agentic") return system.domains.agentic!;
    if (kind === "chat") return system.task_profiles.chat!;
    return system.display;
  };
  return Object.fromEntries(kinds.map((kind) => {
    const view = posterior.views[kind] ?? {};
    const artifact = RunArtifactSchema.parse({
      kind,
      method_version: registry.indexConfig.method_version,
      created_at: createdAt,
      params: {
        taxonomy_edition: registry.indexConfig.taxonomy_edition,
        calibration_edition: registry.indexConfig.calibration_edition,
        data_cutoff: registry.indexConfig.data_cutoff,
        default_profile: registry.indexConfig.default_profile,
        unreported_effort_policy: registry.indexConfig.unreported_effort_policy,
        reference_benchmark_id: registry.indexConfig.reference_benchmark ?? null,
        scales: posterior.scales,
        joint_posterior_path: posteriorPath,
        current_evidence_observation_keys: evidenceObservationKeys,
        inference: registry.indexConfig.inference,
        diagnostics,
        systems: posterior.systems,
      },
      scores: Object.entries(view).map(([systemId, score]) => {
        const system = posterior.systems[systemId]!;
        const metric = profileMetric(kind, systemId);
        return {
          model_id: system.model_id,
          system_id: systemId,
          profile: system.profile,
          tier: system.tier,
          score: score.score,
          ci_low: score.ci_low,
          ci_high: score.ci_high,
          rank: score.rank,
          rank_low: score.rank_low,
          rank_high: score.rank_high,
          coverage: (system.evidence.domains ?? 0) / 5,
          n_private: system.evidence.safe_independent_cells ?? 0,
          robust_score: metric.median,
          flags: [
            { kind: "evidence_tier", detail: system.tier },
            { kind: "system_profile", detail: system.profile },
          ],
          provisional: score.score === null,
          pairwise: score.pairwise,
          rank_cdf: score.rank_cdf,
          top_k: score.top_k,
          evidence: system.evidence,
        };
      }),
      benchmark_params: Object.entries(posterior.benchmarks).map(([benchmarkId, benchmark]) => ({
        benchmark_id: benchmarkId,
        difficulty: Number(benchmark.difficulty ?? 0),
        slope: Number(benchmark.discrimination ?? 1),
        weight: 0,
        weight_factors: {},
        residual_var: Number(benchmark.cell_misfit_sd ?? 0.3) ** 2,
      })),
      cells: posterior.cells.map((cell) => {
        const systemId = String(cell.system_id);
        const profile = systemId.endsWith("@std-common") || systemId.endsWith("@std") ? "std" : "max";
        return {
          model_id: systemId.slice(0, systemId.lastIndexOf("@")),
          system_id: systemId,
          profile,
          benchmark_id: String(cell.benchmark_id),
          y: Number(cell.observed_logit),
          y_hat: Number(cell.theta_median),
          z: Number(cell.z_median),
          used: benchmarkById.get(String(cell.benchmark_id))?.status === "active",
        };
      }),
    });
    return [kind, artifact];
  })) as Record<IndexKind, RunArtifact>;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    process.stdout.write(usage());
    return;
  }
  const startedAt = new Date().toISOString();
  const ingested = await loadRecords(options);
  const unmappedPath = path.join(options.dataDir, "manual", "unmapped.yaml");
  let unmappedFileChanged: boolean | null = null;
  if (!options.dryRun && !options.input) {
    unmappedFileChanged = await writeUnmappedReportIfChanged(unmappedPath, ingested.unmapped);
  }
  if (options.ingestOutput) {
    await mkdir(path.dirname(options.ingestOutput), { recursive: true });
    await writeFile(options.ingestOutput, `${JSON.stringify(ingested.records, null, 2)}\n`, "utf8");
  }

  const lineageSelection = selectLineageObservations(ingested.records);
  const mapped = mappedBenchmarkRecords(lineageSelection.kept);
  const strongestTierMapped = mappedBenchmarkRecords(ingested.selectedRecords);
  const isAci12 = /^1\.[234]\./.test(ingested.registry.indexConfig.method_version);
  // Method 1.2 fits every non-duplicate observation in the joint likelihood. The
  // canonical-config, provenance-supersession and legacy uncertainty gates below
  // exist only for replaying pre-1.2 runs.
  const canonicalSelection = isAci12
    ? { records: strongestTierMapped, exclusions: [] }
    : selectCanonicalScoringRecords(strongestTierMapped);
  const scoringEligibility = isAci12
    ? { records: mapped, exclusions: [] }
    : selectScorableRecords(ingested.registry, canonicalSelection.records);
  const harnessEligibility = isAci12
    ? { records: mapped, exclusions: [] }
    : selectScorableRecords(ingested.registry, mapped);
  const scorable = scoringEligibility.records;
  const runs: Partial<Record<IndexKind, RunArtifact>> = {};
  const skipped: Partial<Record<IndexKind, string>> = {};
  const artifactDir = path.join(root, "work", "pipeline", startedAt.replaceAll(":", "-"));
  await mkdir(artifactDir, { recursive: true });
  let aci12Eligibility: Record<string, unknown> | null = null;
  if (!options.skipScore && isAci12) {
    const joint = coerceAci12RegistryInput({
      models: ingested.registry.models,
      benchmarks: ingested.registry.benchmarks,
      results: mapped,
      config: ingested.registry.indexConfig,
    });
    const representedSystems = new Set(joint.preparation.observations.map((row) => row.systemId));
    const representedBenchmarks = new Set(joint.preparation.observations.map((row) => row.benchmarkId));
    const panelCoverage = auditCalibrationPanelCoverage(joint.preparation, ingested.registry.indexConfig.calibration_panel);
    const missingPanelSystems = panelCoverage.configuredMissingIndependentCells;
    const perDomainAudit = auditCalibrationPanelPerDomainCoverage(
      joint.preparation,
      ingested.registry.indexConfig.calibration_panel,
      joint.systems,
      ingested.registry.indexConfig.default_profile ?? "max-common",
    );
    const referenceCoverage = auditReferenceCoverage(joint.preparation, joint.benchmarks, ingested.registry.indexConfig.calibration_panel);
    const readinessReason = joint.preparation.observations.length === 0
      ? `ACI ${ingested.registry.indexConfig.method_version} has no profile-assigned observations; ${joint.preparation.rejections.length} observations were rejected`
      : !perDomainAudit.passed
        ? `ACI ${ingested.registry.indexConfig.method_version} calibration panel coverage audit failed: systems [${perDomainAudit.failingSystemIds.join(", ")}] do not satisfy the rule (>= ${perDomainAudit.rule.minCellsPerDomain} independent cell in every domain, >= 2 in at least ${perDomainAudit.rule.minDomainsWithTwo} domains); ${perDomainAudit.candidateSystemIds.length} fitted systems qualify. See aci12-preparation.json candidateSystemIds.`
        : null;
    aci12Eligibility = {
      policy: "distinct configurations share a cell latent; verified origin lineages are counted once and invalid observations are rejected",
      duplicate_source_copies: lineageSelection.superseded.length,
      observations_received: mapped.length,
      observations_prepared_for_fit: joint.preparation.observations.length,
      systems_prepared_for_fit: representedSystems.size,
      rejected_observations: joint.preparation.rejections.length,
      rejections_by_reason: reasonCounts(joint.preparation.rejections.map((row) => ({ reason_code: row.reason }))),
      missing_calibration_panel_systems: missingPanelSystems,
      calibration_panel_coverage: panelCoverage,
      reference_coverage: referenceCoverage,
      audit_artifact: path.join(artifactDir, "aci12-preparation.json"),
    };
    await writeFile(path.join(artifactDir, "aci12-preparation.json"), `${JSON.stringify({
      method_version: ingested.registry.indexConfig.method_version,
      taxonomy_edition: ingested.registry.indexConfig.taxonomy_edition,
      calibration_edition: ingested.registry.indexConfig.calibration_edition,
      observations_received: mapped.length,
      observations_prepared_for_fit: joint.preparation.observations.length,
      systems_prepared_for_fit: representedSystems.size,
      missing_calibration_panel_systems: missingPanelSystems,
      calibration_panel_coverage: panelCoverage,
      per_domain_coverage: perDomainAudit,
      reference_coverage: referenceCoverage,
      rejections: joint.preparation.rejections,
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(artifactDir, "metadata-unblock-table.json"), `${JSON.stringify(perDomainAudit.unblockTable, null, 2)}\n`, "utf8");
    if (readinessReason) {
      for (const kind of kinds) skipped[kind] = readinessReason;
    } else {
      try {
        const posterior = await runAci12Nuts({
          preparation: joint.preparation,
          systems: joint.systems,
          benchmarks: joint.benchmarks,
          config: joint.config,
          outputDirectory: artifactDir,
          requireAccepted: true,
        });
        Object.assign(runs, toAci12RunArtifacts(
          posterior.summary,
          ingested.registry,
          posterior.diagnostics as unknown as Record<string, unknown>,
          startedAt,
          posterior.posteriorPath,
          mapped.map(resultObservationKey),
        ));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        for (const kind of kinds) skipped[kind] = reason;
      }
    }
  } else if (!options.skipScore) {
    const registryHash = sha256({
      models: ingested.registry.models,
      benchmarks: ingested.registry.benchmarks,
      sources: ingested.registry.sources,
    });
    const payload = {
      benchmarks: ingested.registry.benchmarks,
      models: ingested.registry.models,
      results: scorable,
      harness_results: harnessEligibility.records,
      config: ingested.registry.indexConfig,
    };
    for (const kind of kinds) {
      const reason = feasibilityReason(kind, ingested.registry, scorable);
      if (reason) {
        skipped[kind] = reason;
        continue;
      }
      try {
        const input = coerceScoringInput(payload, kind);
        if (options.bootstrap !== undefined) input.config.bootstrapIterations = options.bootstrap;
        const configRejections = canonicalSelection.exclusions.filter((row) => {
          const benchmark = ingested.registry.benchmarks.find((candidate) => candidate.id === row.benchmark_id);
          return benchmark !== undefined && benchmarkKinds(benchmark).includes(kind);
        }).length;
        const uncertaintyRejections = scoringEligibility.exclusions.filter((row) =>
          row.affected_indexes.includes(kind)).length;
        const indexRecords = scorable.filter((record) => {
          const benchmark = ingested.registry.benchmarks.find((candidate) => candidate.id === record.benchmark_id);
          return benchmark !== undefined && benchmarkKinds(benchmark).includes(kind);
        });
        const bySource = new Map<string, number>();
        for (const record of indexRecords) {
          bySource.set(record.source_id, (bySource.get(record.source_id) ?? 0) + 1);
        }
        const scoringRun = runScoring(input);
        runs[kind] = toRunArtifact(scoringRun, startedAt, {
          scoring_input_sha256: sha256(input),
          config_sha256: sha256(input.config),
          registry_sha256: registryHash,
          bootstrap_seed: input.config.bootstrapSeed ?? null,
          anchors: (input.config.anchors ?? []).map((anchor) => ({
            model_id: anchor.modelId,
            value: anchor.value,
          })),
          publication_coverage: {
            scorable_results: indexRecords.length,
            models: new Set(indexRecords.map((record) => record.model_id)).size,
            benchmarks: new Set(indexRecords.map((record) => record.benchmark_id)).size,
            fitted_cells: scoringRun.fit.cells.length,
            positive_weight_benchmarks: Object.values(scoringRun.benchmarkWeights)
              .filter((weight) => weight.weight > 0).length,
            ranked_models: scoringRun.scores.filter((score) => !score.provisional && score.rank !== null).length,
            by_source: Object.fromEntries([...bySource.entries()].sort(([left], [right]) => left.localeCompare(right))),
          },
          eligibility_rejections: {
            config: configRejections,
            uncertainty: uncertaintyRejections,
            total: configRejections + uncertaintyRejections,
          },
          scoring_eligibility: {
            config_exclusions: canonicalSelection.exclusions,
            uncertainty_exclusions: scoringEligibility.exclusions,
          },
        });
      } catch (error) {
        skipped[kind] = error instanceof Error ? error.message : String(error);
      }
    }
  }

  await Promise.all(Object.entries(runs).map(([kind, artifact]) =>
    writeFile(path.join(artifactDir, `${kind}.run.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8"),
  ));

  let databaseSummary: Record<string, unknown> | null = null;
  let snapshot: Awaited<ReturnType<typeof exportSnapshot>> | null = null;
  const persistencePlan = planPersistence(runs, options);
  const { runSet } = persistencePlan;
  if (!options.dryRun) {
    if (!persistencePlan.writeDatabase) {
      databaseSummary = {
        status: "skipped_incomplete_run_set",
        reason: `No database changes were made because the run set is not publishable: ${kinds
          .filter((kind) => runSet.issues[kind] !== undefined)
          .map((kind) => `${kind}: ${runSet.issues[kind]}`)
          .join("; ")}.`,
      };
    } else {
      if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required unless --dry-run is set");
      const { db, close } = createDatabase();
      try {
        const priorRuns = await db.select({
          kind: indexRuns.kind,
          createdAt: indexRuns.createdAt,
          params: indexRuns.params,
        }).from(indexRuns);
        const coverageRegressions = publicationCoverageRegressions(runs, priorRuns);
        if (coverageRegressions.length > 0) {
          databaseSummary = {
            status: "skipped_coverage_regression",
            reason: "No database or snapshot changes were made because evidence coverage regressed materially.",
            regressions: coverageRegressions,
          };
        } else {
          const committed = await db.transaction(async (tx) => {
            const seeded = await seedRegistry(tx, ingested.registry);
            const persisted = await persistIngestRecords(tx, ingested.records);
            const runIds: Partial<Record<IndexKind, string>> = {};
            for (const kind of kinds) {
              const artifact = runs[kind];
              if (artifact) runIds[kind] = await persistRunInTransaction(tx, artifact);
            }
            return { status: "committed", seeded, persisted, run_ids: runIds };
          });
          databaseSummary = committed;
          if (persistencePlan.exportSnapshot) {
            const { mixed, agentic, chat } = committed.run_ids;
            if (!mixed || !agentic || !chat) {
              throw new Error("Committed publication is missing one or more exact run IDs");
            }
            snapshot = await exportSnapshot(db, root, startedAt.slice(0, 10), { mixed, agentic, chat }, { replaceExisting: true });
          }
        }
      } finally {
        await close();
      }
    }
  }

  const report = {
    started_at: startedAt,
    dry_run: options.dryRun,
    sources: ingested.sources,
    records: ingested.records.length,
    selected_records: ingested.selectedRecords.length,
    superseded_records: ingested.supersededRecords.length,
    mapped_benchmark_results: mapped.length,
    scoring_eligibility: isAci12 ? aci12Eligibility ?? {
      policy: "ACI 1.2 preparation was skipped because --skip-score was set",
    } : {
      canonical_config_policy:
        "strongest provenance; then reasoning effort, direct provider, tools present, newest observation, highest score, and stable lexical tie-break",
      config_compatibility:
        "Only source rows with exact stable config JSON equality are pooled; differing cross-source config shapes are not treated as equivalent.",
      strongest_tier_mapped_results: strongestTierMapped.length,
      canonical_config_results: canonicalSelection.records.length,
      scorable_results: scorable.length,
      excluded_config_records: canonicalSelection.exclusions.length,
      excluded_configurations: new Set(canonicalSelection.exclusions.map((row) =>
        stableStringify({
          model_id: row.model_id,
          benchmark_id: row.benchmark_id,
          config_key: row.config_key,
          reason_code: row.reason_code,
        }))).size,
      config_exclusions_by_reason: reasonCounts(canonicalSelection.exclusions),
      config_exclusions: canonicalSelection.exclusions,
      excluded_uncertainty_records: scoringEligibility.exclusions.length,
      uncertainty_exclusions_by_reason: reasonCounts(scoringEligibility.exclusions),
      uncertainty_exclusions: scoringEligibility.exclusions,
    },
    unmapped: ingested.unmapped,
    unmapped_file: options.input || options.dryRun ? null : unmappedPath,
    unmapped_file_changed: unmappedFileChanged,
    warnings: ingested.warnings,
    created_runs: Object.keys(runs),
    skipped_runs: skipped,
    run_set: runSet,
    persistence_mode: options.dryRun ? "dry_run" : persistencePlan.mode,
    artifacts: artifactDir,
    database: databaseSummary,
    snapshot,
  };
  await writeFile(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`pipeline: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
