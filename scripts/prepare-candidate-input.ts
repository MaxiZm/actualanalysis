#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  annotateObservationMetadata,
  ingestSources,
  resolveRecordAliases,
  selectLineageObservations,
  selectPreferredResults,
  stableStringify,
  type IngestSourcesOptions,
  type IngestSourcesResult,
  type RawBenchmarkResult,
  type RawResult,
} from "@actualanalysis/ingest";
import { loadRegistry, type Domain } from "@actualanalysis/shared";
import {
  ACI_DOMAINS,
  coerceAci12RegistryInput,
  isFixedEffort,
  normalizedTier,
  type Aci12RegistryResult,
  type AciBenchmarkDefinition,
  type CoercedAci12Input,
} from "@actualanalysis/scoring";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_REFRESH_SOURCES = ["manual", "datacurve", "matharena"] as const;
export const DEFAULT_REFRESH_WORK_DIR = path.join(root, "work", "coverage-expansion");
export const DEFAULT_FALLBACK_CAPTURE_PATHS = [
  path.join(root, "work", "coverage-expansion", "live-datacurve-matharena.json"),
  "/Users/mzalik/Documents/Projects/actualanalysis/packages/ingest/work/coverage-expansion/live-datacurve-matharena.json",
] as const;

export class RefreshCaptureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefreshCaptureUnavailableError";
  }
}

export interface CandidatePreparationOptions {
  dataDir?: string | undefined;
  input?: string | undefined;
  output?: string | undefined;
  seed?: number | undefined;
  progressBar?: boolean | undefined;
  refreshInput?: boolean | undefined;
  sources?: readonly string[] | undefined;
  workDir?: string | undefined;
  fallbackCapturePath?: string | undefined;
  ingestSourcesFn?: ((options: IngestSourcesOptions) => Promise<IngestSourcesResult>) | undefined;
}

export interface PreparedCandidateInputData {
  method_version: string;
  trait_structure: string;
  n_models: number;
  n_systems: number;
  n_benchmarks: number;
  n_families: number;
  n_protocols: number;
  protocol_ids: string[];
  protocol_is_self_report: boolean[];
  system_ids: string[];
  benchmark_ids: string[];
  domains: string[];
  calibration_panel_system_ids: string[];
  tiers: unknown;
  profiles: unknown;
  system_training_cutoff: Array<string | null>;
  benchmark_family_ids: string[];
  benchmark_holdout: string[];
  benchmark_public_release_date: Array<string | null>;
  system_model_index: number[];
  system_profile_index: number[];
  system_is_fixed_effort: boolean[];
  benchmark_family_index: number[];
  benchmark_utility_eligible: boolean[];
  benchmark_domains: number[][];
  cell_system_index: number[];
  cell_benchmark_index: number[];
  benchmark_default_rho: number[];
  benchmark_estimate_rho: boolean[];
  observations: Array<Record<string, unknown>>;
  priors: unknown;
  inference: unknown;
  metadata_incomplete_multiplier: number;
  unreported_effort_policy: string;
  seed: number;
  progress_bar: boolean;
}

function primaryDomain(benchmark: AciBenchmarkDefinition): Domain {
  return benchmark.primaryDomain ?? ACI_DOMAINS.reduce((best, domain) =>
    (benchmark.domains[domain] ?? 0) > (benchmark.domains[best] ?? 0) ? domain : best,
  ACI_DOMAINS[0]!);
}

export function buildAci12InferencePayload(
  coerced: CoercedAci12Input,
  seed = 20260904,
  progressBar = false,
): PreparedCandidateInputData {
  const observedSystemIds = [...new Set(coerced.preparation.observations.map((row) => row.systemId))].sort();
  const modelIds = [...new Set(observedSystemIds.map((id) => id.slice(0, id.lastIndexOf("@"))))].sort();

  const representedSystemIds = modelIds.flatMap((id) => {
    const definition = coerced.systems.find((system) => system.modelSnapshotId === id);
    if (!definition) return [];
    if (isFixedEffort(definition)) {
      return [`${id}@max-common`];
    }
    const ids: string[] = [];
    if (definition.defaultEffortTier) ids.push(`${id}@std-common`);
    if (definition.maxEffortTier && normalizedTier(definition.maxEffortTier) !== normalizedTier(definition.defaultEffortTier)) {
      ids.push(`${id}@max-common`);
    }
    return ids;
  });

  const systemIndex = new Map(representedSystemIds.map((id, index) => [id, index]));
  const modelIndex = new Map(modelIds.map((id, index) => [id, index]));
  const representedBenchmarkIds = [...new Set(coerced.preparation.observations.map((row) => row.benchmarkId))].sort();
  const benchmarks = representedBenchmarkIds.map((id) => coerced.benchmarks.find((benchmark) => benchmark.id === id)!).filter(Boolean);
  const benchmarkIndex = new Map(benchmarks.map((benchmark, index) => [benchmark.id, index]));
  const familyIds = [...new Set(benchmarks.map((benchmark) => benchmark.familyId))].sort();
  const familyIndex = new Map(familyIds.map((id, index) => [id, index]));
  const cells = [...new Set(coerced.preparation.observations.map((row) => `${row.systemId}\0${row.benchmarkId}`))].sort();
  const cellIndex = new Map(cells.map((key, index) => [key, index]));

  const protocolOf = (row: { protocolId?: string; sourceId: string }) => row.protocolId ?? row.sourceId;
  const protocolIds = [...new Set(coerced.preparation.observations.map(protocolOf))].sort();
  const protocolIndex = new Map(protocolIds.map((id, index) => [id, index]));
  const protocolIsSelfReport = protocolIds.map((pId) => {
    const sample = coerced.preparation.observations.find((r) => protocolOf(r) === pId);
    return sample?.originProvenance === "self_report";
  });

  const domainIndex = new Map(ACI_DOMAINS.map((domain, index) => [domain, index]));
  const estimateRhoByBenchmark = new Map(benchmarks.map((benchmark) => [
    benchmark.id,
    new Set(coerced.preparation.observations
      .filter((row) => row.benchmarkId === benchmark.id && row.perTaskCounts?.length)
      .map((row) => row.systemId)).size >= 5,
  ]));

  return {
    method_version: coerced.config.method_version,
    trait_structure: coerced.config.trait_structure ?? "correlated",
    n_models: modelIds.length,
    n_systems: representedSystemIds.length,
    n_benchmarks: benchmarks.length,
    n_families: familyIds.length,
    n_protocols: protocolIds.length,
    protocol_ids: protocolIds,
    protocol_is_self_report: protocolIsSelfReport,
    system_ids: representedSystemIds,
    benchmark_ids: benchmarks.map((benchmark) => benchmark.id),
    domains: [...ACI_DOMAINS],
    calibration_panel_system_ids: coerced.config.calibration_panel,
    tiers: coerced.config.tiers,
    profiles: coerced.config.profiles,
    system_training_cutoff: representedSystemIds.map((id) => {
      const def = coerced.systems.find((system) => system.modelSnapshotId === id.slice(0, id.lastIndexOf("@")));
      return def?.postTrainingFreeze ?? def?.trainingCutoff ?? null;
    }),
    benchmark_family_ids: benchmarks.map((benchmark) => benchmark.familyId),
    benchmark_holdout: benchmarks.map((benchmark) => benchmark.holdout),
    benchmark_public_release_date: benchmarks.map((benchmark) => benchmark.itemReleaseDate ?? benchmark.publicReleaseDate ?? null),
    system_model_index: representedSystemIds.map((id) => modelIndex.get(id.slice(0, id.lastIndexOf("@")))!),
    system_profile_index: representedSystemIds.map((id) => id.endsWith("@max-common") || id.endsWith("@max") ? 1 : 0),
    system_is_fixed_effort: representedSystemIds.map((id) => {
      const def = coerced.systems.find((system) => system.modelSnapshotId === id.slice(0, id.lastIndexOf("@")));
      return def ? isFixedEffort(def) : false;
    }),
    benchmark_family_index: benchmarks.map((benchmark) => familyIndex.get(benchmark.familyId)!),
    benchmark_utility_eligible: benchmarks.map((benchmark) => benchmark.utilityStatus === "eligible" && ["count", "passk"].includes(benchmark.obsType)),
    benchmark_domains: benchmarks.map((benchmark) => ACI_DOMAINS.map((domain) => benchmark.domains[domain] ?? 0)),
    cell_system_index: cells.map((key) => systemIndex.get(key.split("\0")[0]!)!),
    cell_benchmark_index: cells.map((key) => benchmarkIndex.get(key.split("\0")[1]!)!),
    benchmark_default_rho: benchmarks.map((benchmark) => benchmark.defaultRho ?? (primaryDomain(benchmark) === "agentic" ? coerced.config.likelihood.agentic_default_rho : coerced.config.likelihood.other_default_rho)),
    benchmark_estimate_rho: benchmarks.map((benchmark) => estimateRhoByBenchmark.get(benchmark.id) ?? false),
    observations: coerced.preparation.observations.map((row) => ({
      cell_index: cellIndex.get(`${row.systemId}\0${row.benchmarkId}`)!,
      protocol_index: protocolIndex.get(protocolOf(row))!,
      provenance_index: row.originProvenance === "self_report" ? 1 : 0,
      system_index: systemIndex.get(row.systemId)!,
      benchmark_index: benchmarkIndex.get(row.benchmarkId)!,
      domain_index: domainIndex.get(primaryDomain(row.benchmark))!,
      metadata_incomplete: row.metadataIncomplete,
      in_reference_component: row.inReferenceComponent ?? true,
      likelihood: row.likelihood,
      ...(row.y === undefined ? {} : { y: row.y }),
      ...(row.variance === undefined ? {} : { variance: row.variance }),
      ...(row.x === undefined ? {} : { x: row.x }),
      n_tasks: row.nTasks ?? row.benchmark.nTasks ?? 1,
      k_trials: row.kTrials ?? row.benchmark.defaultK ?? 1,
      per_task_counts: row.perTaskCounts ?? [],
      rho: row.rho ?? 0,
      use_beta_binomial: row.likelihood === "a_exact"
        && ((row.rho ?? 0) > 0 || (estimateRhoByBenchmark.get(row.benchmarkId) ?? false)),
      chance_level: row.benchmark.chanceLevel,
      ceiling: row.benchmark.ceiling,
    })),
    priors: coerced.config.priors,
    inference: coerced.config.inference,
    metadata_incomplete_multiplier: coerced.config.likelihood.metadata_incomplete_multiplier,
    unreported_effort_policy: coerced.config.unreported_effort_policy,
    seed,
    progress_bar: progressBar,
  };
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function optionalNumber(value: unknown): number | undefined {
  if (!isPresent(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalJsonArray(value: unknown): unknown[] | undefined {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return Array.isArray(value) ? value : undefined;
}

function optionalConfig(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function pick<T>(row: Record<string, unknown>, snake: string, camel: string): T | undefined {
  const value = row[snake] ?? row[camel];
  return isPresent(value) ? value as T : undefined;
}

export function isForbiddenAaRecord(record: {
  source_id?: string | undefined;
  benchmark_id?: string | undefined;
  benchmark?: string | undefined;
  protocol_id?: string | undefined;
}): boolean {
  const source = record.source_id ?? "";
  const protocol = record.protocol_id ?? "";
  const benchmark = record.benchmark_id ?? record.benchmark ?? "";
  return source.startsWith("aa-")
    || source === "critpt"
    || protocol.startsWith("aa-")
    || benchmark === "aa-lcr"
    || benchmark === "critpt"
    || benchmark.startsWith("aa-");
}

function canonicalFraction(row: RawBenchmarkResult): number {
  const fraction = row.score_unit === "percent" ? row.score / 100 : row.score;
  return Math.round(fraction * 1e6) / 1e6;
}

function displayPercentKey(row: RawBenchmarkResult): number {
  return Math.round(canonicalFraction(row) * 1000) / 10;
}

function effortToken(row: RawBenchmarkResult): string {
  const raw = row.effort_tier ?? row.config.evaluation_profile ?? row.config.reasoning_effort ?? "";
  return String(raw).toLowerCase().replace(/[\s_-]+/g, "").trim();
}

function explicitEffortToken(row: RawBenchmarkResult): string | undefined {
  const token = effortToken(row);
  return token.length > 0 ? token : undefined;
}

export function explicitIdentitiesConflict(left: RawBenchmarkResult, right: RawBenchmarkResult): boolean {
  if (left.evaluation_run_id && right.evaluation_run_id && left.evaluation_run_id !== right.evaluation_run_id) return true;
  if (left.lineage_id && right.lineage_id && left.lineage_id !== right.lineage_id) return true;
  if (left.benchmark_version && right.benchmark_version && left.benchmark_version !== right.benchmark_version) return true;
  return false;
}

export function explicitMatharenaEffortConflict(left: RawBenchmarkResult, right: RawBenchmarkResult): boolean {
  if (left.source_id !== "matharena" || right.source_id !== "matharena") return false;
  const leftEffort = explicitEffortToken(left);
  const rightEffort = explicitEffortToken(right);
  return Boolean(leftEffort && rightEffort && leftEffort !== rightEffort);
}

export function captureReplayIdentityKeys(row: RawBenchmarkResult): string[] {
  const model = row.model_id ?? row.model;
  const benchmark = row.benchmark_id ?? row.benchmark;
  const source = row.source_id;
  const keys = [
    stableStringify({
      kind: "replay",
      source,
      model,
      benchmark,
      percent: displayPercentKey(row),
      observed_on: row.observed_on,
      effort: effortToken(row),
    }),
  ];
  if (row.evaluation_run_id) {
    keys.push(stableStringify({ kind: "run", source, model, benchmark, run: row.evaluation_run_id }));
  }
  if (row.lineage_id) {
    keys.push(stableStringify({ kind: "lineage", source, model, benchmark, lineage: row.lineage_id }));
  }
  if (source === "matharena") {
    keys.push(stableStringify({
      kind: "matharena-config",
      source,
      model,
      benchmark,
      profile: effortToken(row),
    }));
  }
  return keys;
}

export interface CaptureMergeResult {
  kept: RawBenchmarkResult[];
  superseded: RawBenchmarkResult[];
}

function pickPinned<K extends keyof RawBenchmarkResult>(
  rows: readonly RawBenchmarkResult[],
  field: K,
): RawBenchmarkResult[K] | undefined {
  for (const row of rows) {
    const value = row[field];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function mergeCaptureCluster(
  cluster: Array<{ record: RawBenchmarkResult; origin: "historical" | "fresh" }>,
): RawBenchmarkResult {
  const historical = cluster.filter((row) => row.origin === "historical").map((row) => row.record);
  const newest = [...cluster].sort((left, right) => right.record.observed_on.localeCompare(left.record.observed_on))[0]!.record;
  const pinned = historical[0] ?? newest;
  const matharenaUpdate = pinned.source_id === "matharena" && newest !== pinned;
  const scoreSource = matharenaUpdate ? newest : pinned;
  const protocolId = pickPinned(historical, "protocol_id") ?? pickPinned(cluster.map((row) => row.record), "protocol_id");
  const merged: RawBenchmarkResult = {
    ...scoreSource,
    ...(protocolId ? { protocol_id: protocolId } : {}),
  };
  const hostSource = pickPinned(historical, "host_source") ?? scoreSource.host_source;
  const originProvenance = pickPinned(historical, "origin_provenance") ?? scoreSource.origin_provenance;
  const lineageId = pickPinned(historical, "lineage_id") ?? scoreSource.lineage_id;
  const sourceUrl = pickPinned(historical, "source_url") ?? scoreSource.source_url;
  if (hostSource) merged.host_source = hostSource;
  if (originProvenance) merged.origin_provenance = originProvenance;
  if (lineageId) merged.lineage_id = lineageId;
  merged.source_url = sourceUrl;
  return merged;
}

export function mergeHistoricalAndFreshRecords(
  historical: readonly RawBenchmarkResult[],
  fresh: readonly RawResult[],
): CaptureMergeResult {
  const kept = [...historical];
  const superseded: RawBenchmarkResult[] = [];
  const historicalByKey = new Map<string, number>();
  kept.forEach((record, index) => {
    for (const key of captureReplayIdentityKeys(record)) {
      if (!historicalByKey.has(key)) historicalByKey.set(key, index);
    }
  });

  const unmatchedFresh: RawBenchmarkResult[] = [];
  for (const record of fresh) {
    if (record.record_type !== "benchmark_result") continue;
    const hits = [...new Set(
      captureReplayIdentityKeys(record)
        .map((key) => historicalByKey.get(key))
        .filter((index): index is number => index !== undefined),
    )].filter((index) => !explicitIdentitiesConflict(kept[index]!, record)
      && !explicitMatharenaEffortConflict(kept[index]!, record));
    if (hits.length === 0 && record.source_id === "matharena") {
      const model = record.model_id ?? record.model;
      const benchmark = record.benchmark_id ?? record.benchmark;
      const unique = historical
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.source_id === "matharena"
          && (row.model_id ?? row.model) === model
          && (row.benchmark_id ?? row.benchmark) === benchmark);
      if (unique.length === 1 && !explicitIdentitiesConflict(unique[0]!.row, record)
        && !explicitMatharenaEffortConflict(unique[0]!.row, record)) {
        hits.push(unique[0]!.index);
      }
    }
    if (hits.length === 1) {
      const index = hits[0]!;
      kept[index] = mergeCaptureCluster([
        { record: kept[index]!, origin: "historical" },
        { record, origin: "fresh" },
      ]);
      superseded.push(record);
      continue;
    }
    unmatchedFresh.push(record);
  }

  const parent = unmatchedFresh.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor]!;
    return cursor;
  };
  const owner = new Map<string, number>();
  unmatchedFresh.forEach((record, index) => {
    for (const key of captureReplayIdentityKeys(record)) {
      const previous = owner.get(key);
      if (previous !== undefined
        && !explicitIdentitiesConflict(record, unmatchedFresh[previous]!)
        && !explicitMatharenaEffortConflict(record, unmatchedFresh[previous]!)) {
        parent[find(index)] = find(previous);
      }
      if (previous === undefined) owner.set(key, index);
    }
  });
  const freshGroups = new Map<number, RawBenchmarkResult[]>();
  unmatchedFresh.forEach((record, index) => {
    const rootIndex = find(index);
    const group = freshGroups.get(rootIndex) ?? [];
    group.push(record);
    freshGroups.set(rootIndex, group);
  });
  for (const group of freshGroups.values()) {
    const merged = mergeCaptureCluster(group.map((record) => ({ record, origin: "fresh" as const })));
    const headline = applyOfficialTau3HeadlineTrials(merged);
    if (headline.reject) {
      superseded.push(...group);
      continue;
    }
    kept.push(headline.record);
    superseded.push(...group.filter((record) => record !== group[0]));
  }
  return { kept, superseded };
}

const PASS1_HEADLINE = /pass\s*[\^@]\s*1|pass\^1|pass@1/i;

export function applyOfficialTau3HeadlineTrials(row: RawBenchmarkResult): { record: RawBenchmarkResult; reject?: string } {
  if ((row.benchmark_id ?? row.benchmark) !== "tau3-bench-banking") return { record: row };
  if (row.k_trials === 1) return { record: row };
  const notes = typeof row.metadata.notes === "string" ? row.metadata.notes : "";
  if (PASS1_HEADLINE.test(notes)) {
    return { record: { ...row, k_trials: 1 } };
  }
  return {
    record: row,
    reject: "tau3-bench-banking official headline is Pass^1; k_trials is not explicitly 1 and notes do not verify pass^1 (refusing registry default_k=4)",
  };
}

export function mapRegistryResult(row: unknown): Aci12RegistryResult {
  const r = (row ?? {}) as Record<string, unknown>;
  const config = optionalConfig(r.config);
  const perTaskCounts = optionalJsonArray(r.per_task_counts ?? r.perTaskCounts);
  const runValues = optionalJsonArray(r.run_values ?? r.runValues);
  return {
    id: pick<string>(r, "id", "id"),
    model_id: String(pick(r, "model_id", "modelId") ?? ""),
    benchmark_id: String(pick(r, "benchmark_id", "benchmarkId") ?? ""),
    source_id: String(pick(r, "source_id", "sourceId") ?? ""),
    benchmark_version: pick<string>(r, "benchmark_version", "benchmarkVersion"),
    grader_version: pick<string>(r, "grader_version", "graderVersion"),
    evaluation_run_id: pick<string>(r, "evaluation_run_id", "evaluationRunId"),
    score: Number(r.score),
    score_unit: (pick(r, "score_unit", "scoreUnit") ?? "fraction") as Aci12RegistryResult["score_unit"],
    provenance: r.provenance as Aci12RegistryResult["provenance"],
    config,
    se: optionalNumber(r.se),
    n_items: optionalNumber(r.n_items ?? r.nItems),
    k_trials: optionalNumber(r.k_trials ?? r.kTrials),
    x_correct: optionalNumber(r.x_correct ?? r.xCorrect),
    per_task_counts: perTaskCounts as number[] | undefined,
    uncertainty_type: pick(r, "uncertainty_type", "uncertaintyType") as Aci12RegistryResult["uncertainty_type"],
    uncertainty_value: (r.uncertainty_value !== undefined && r.uncertainty_value !== null
      ? r.uncertainty_value
      : r.uncertaintyValue) as Aci12RegistryResult["uncertainty_value"],
    uncertainty_unit: pick(r, "uncertainty_unit", "uncertaintyUnit") as Aci12RegistryResult["uncertainty_unit"],
    n_runs: optionalNumber(r.n_runs ?? r.nRuns),
    run_values: runValues as number[] | undefined,
    cost_per_task: optionalNumber(r.cost_per_task ?? r.costPerTask),
    latency_s: optionalNumber(r.latency_s ?? r.latencyS),
    harness: pick<string>(r, "harness", "harness"),
    harness_class: pick(r, "harness_class", "harnessClass") as Aci12RegistryResult["harness_class"],
    effort_tier: pick<string>(r, "effort_tier", "effortTier"),
    tool_policy: pick<string>(r, "tool_policy", "toolPolicy"),
    lineage_id: pick<string>(r, "lineage_id", "lineageId"),
    host_source: pick<string>(r, "host_source", "hostSource"),
    protocol_id: pick<string>(r, "protocol_id", "protocolId"),
    version_inferred: r.version_inferred === true || r.versionInferred === true,
    metadata_incomplete: r.metadata_incomplete === true || r.metadataIncomplete === true,
    origin_provenance: pick(r, "origin_provenance", "originProvenance") as Aci12RegistryResult["origin_provenance"],
    observed_on: pick<string>(r, "observed_on", "observedOn"),
    url: pick<string>(r, "url", "url") ?? pick<string>(r, "source_url", "sourceUrl"),
  };
}

export function snapshotResultToRawBenchmarkResult(row: unknown): RawBenchmarkResult | undefined {
  const r = (row ?? {}) as Record<string, unknown>;
  const modelId = pick<string>(r, "model_id", "modelId") ?? pick<string>(r, "model", "model");
  const benchmarkId = pick<string>(r, "benchmark_id", "benchmarkId") ?? pick<string>(r, "benchmark", "benchmark");
  const sourceId = pick<string>(r, "source_id", "sourceId");
  const sourceUrl = pick<string>(r, "source_url", "sourceUrl") ?? pick<string>(r, "url", "url");
  const observedOn = pick<string>(r, "observed_on", "observedOn");
  const provenance = pick<RawBenchmarkResult["provenance"]>(r, "provenance", "provenance");
  const score = optionalNumber(r.score);
  if (!modelId || !benchmarkId || !sourceId || !sourceUrl || !observedOn || !provenance || score === undefined) {
    return undefined;
  }

  const config = optionalConfig(r.config) ?? {};
  const metadata = optionalConfig(r.metadata) ?? {};
  const perTaskCounts = optionalJsonArray(r.per_task_counts ?? r.perTaskCounts);
  const runValues = optionalJsonArray(r.run_values ?? r.runValues);
  const kSamples = optionalNumber(r.k_samples ?? r.kSamples);
  const record: RawBenchmarkResult = {
    record_type: "benchmark_result",
    model: pick<string>(r, "model", "model") ?? modelId,
    model_id: modelId,
    benchmark: pick<string>(r, "benchmark", "benchmark") ?? benchmarkId,
    benchmark_id: benchmarkId,
    source_id: sourceId,
    score,
    score_unit: (pick(r, "score_unit", "scoreUnit") ?? "fraction") as RawBenchmarkResult["score_unit"],
    observed_on: observedOn,
    source_url: sourceUrl,
    provenance,
    config,
    metadata,
  };
  const systemId = pick<string>(r, "system_id", "systemId");
  const benchmarkVersion = pick<string>(r, "benchmark_version", "benchmarkVersion");
  const graderVersion = pick<string>(r, "grader_version", "graderVersion");
  const evaluationRunId = pick<string>(r, "evaluation_run_id", "evaluationRunId");
  const lineageId = pick<string>(r, "lineage_id", "lineageId");
  const originProvenance = pick<RawBenchmarkResult["origin_provenance"]>(r, "origin_provenance", "originProvenance");
  const hostSource = pick<string>(r, "host_source", "hostSource");
  const protocolId = pick<string>(r, "protocol_id", "protocolId");
  const se = optionalNumber(r.se);
  const xCorrect = optionalNumber(r.x_correct ?? r.xCorrect);
  const nItems = optionalNumber(r.n_items ?? r.nItems);
  const kTrials = optionalNumber(r.k_trials ?? r.kTrials);
  const uncertaintyType = pick<RawBenchmarkResult["uncertainty_type"]>(r, "uncertainty_type", "uncertaintyType");
  const uncertaintyValue = (r.uncertainty_value !== undefined && r.uncertainty_value !== null
    ? r.uncertainty_value
    : r.uncertaintyValue) as RawBenchmarkResult["uncertainty_value"];
  const uncertaintyUnit = pick<RawBenchmarkResult["uncertainty_unit"]>(r, "uncertainty_unit", "uncertaintyUnit");
  const nRuns = optionalNumber(r.n_runs ?? r.nRuns);
  const costPerTask = optionalNumber(r.cost_per_task ?? r.costPerTask);
  const latencyS = optionalNumber(r.latency_s ?? r.latencyS);
  const harness = pick<string>(r, "harness", "harness");
  const harnessClass = pick<RawBenchmarkResult["harness_class"]>(r, "harness_class", "harnessClass");
  const effortTier = pick<string>(r, "effort_tier", "effortTier");
  const toolPolicy = pick<string>(r, "tool_policy", "toolPolicy");
  if (systemId) record.system_id = systemId;
  if (benchmarkVersion) record.benchmark_version = benchmarkVersion;
  if (graderVersion) record.grader_version = graderVersion;
  if (evaluationRunId) record.evaluation_run_id = evaluationRunId;
  if (lineageId) record.lineage_id = lineageId;
  if (originProvenance) record.origin_provenance = originProvenance;
  if (hostSource) record.host_source = hostSource;
  if (protocolId) record.protocol_id = protocolId;
  if (r.version_inferred === true || r.versionInferred === true) record.version_inferred = true;
  if (r.metadata_incomplete === true || r.metadataIncomplete === true) record.metadata_incomplete = true;
  if (se !== undefined) record.se = se;
  if (xCorrect !== undefined) record.x_correct = xCorrect;
  if (nItems !== undefined) record.n_items = nItems;
  if (kSamples !== undefined) record.k_samples = kSamples;
  if (kTrials !== undefined) record.k_trials = kTrials;
  if (perTaskCounts) record.per_task_counts = perTaskCounts as number[];
  if (uncertaintyType) record.uncertainty_type = uncertaintyType;
  if (uncertaintyValue !== undefined && uncertaintyValue !== null) record.uncertainty_value = uncertaintyValue;
  if (uncertaintyUnit) record.uncertainty_unit = uncertaintyUnit;
  if (nRuns !== undefined) record.n_runs = nRuns;
  if (runValues) record.run_values = runValues as number[];
  if (costPerTask !== undefined) record.cost_per_task = costPerTask;
  if (latencyS !== undefined) record.latency_s = latencyS;
  if (harness) record.harness = harness;
  if (harnessClass) record.harness_class = harnessClass;
  if (effortTier) record.effort_tier = effortTier;
  if (toolPolicy) record.tool_policy = toolPolicy;
  return record;
}

export function rawBenchmarkToRegistryResult(record: RawBenchmarkResult): Aci12RegistryResult | undefined {
  if (!record.model_id || !record.benchmark_id) return undefined;
  return {
    model_id: record.model_id,
    benchmark_id: record.benchmark_id,
    source_id: record.source_id,
    score: record.score,
    score_unit: record.score_unit,
    provenance: record.provenance,
    url: record.source_url,
    observed_on: record.observed_on,
    config: record.config,
    ...(record.benchmark_version ? { benchmark_version: record.benchmark_version } : {}),
    ...(record.grader_version ? { grader_version: record.grader_version } : {}),
    ...(record.evaluation_run_id ? { evaluation_run_id: record.evaluation_run_id } : {}),
    ...(record.se !== undefined ? { se: record.se } : {}),
    ...(record.n_items !== undefined ? { n_items: record.n_items } : {}),
    ...(record.k_trials !== undefined ? { k_trials: record.k_trials } : {}),
    ...(record.x_correct !== undefined ? { x_correct: record.x_correct } : {}),
    ...(record.per_task_counts ? { per_task_counts: record.per_task_counts } : {}),
    ...(record.uncertainty_type ? { uncertainty_type: record.uncertainty_type } : {}),
    ...(record.uncertainty_value !== undefined ? { uncertainty_value: record.uncertainty_value } : {}),
    ...(record.uncertainty_unit ? { uncertainty_unit: record.uncertainty_unit } : {}),
    ...(record.n_runs !== undefined ? { n_runs: record.n_runs } : {}),
    ...(record.run_values ? { run_values: record.run_values } : {}),
    ...(record.cost_per_task !== undefined ? { cost_per_task: record.cost_per_task } : {}),
    ...(record.latency_s !== undefined ? { latency_s: record.latency_s } : {}),
    ...(record.harness ? { harness: record.harness } : {}),
    ...(record.harness_class ? { harness_class: record.harness_class } : {}),
    ...(record.effort_tier ? { effort_tier: record.effort_tier } : {}),
    ...(record.tool_policy ? { tool_policy: record.tool_policy } : {}),
    ...(record.lineage_id ? { lineage_id: record.lineage_id } : {}),
    ...(record.host_source ? { host_source: record.host_source } : {}),
    ...(record.protocol_id ? { protocol_id: record.protocol_id } : {}),
    ...(record.version_inferred ? { version_inferred: true } : {}),
    ...(record.metadata_incomplete ? { metadata_incomplete: true } : {}),
    ...(record.origin_provenance ? { origin_provenance: record.origin_provenance } : {}),
  };
}

export interface RefreshDeltaSummary {
  observations: { before: number; after: number; delta: number };
  cells: { before: number; after: number; delta: number };
  unique_new_cells: number;
  extra_replications: number;
  effort_reassignment_cells: number;
  added_observation_count: number;
}

function cellKey(payload: PreparedCandidateInputData, cellIndex: number): string {
  return `${payload.system_ids[payload.cell_system_index[cellIndex]!]}\0${payload.benchmark_ids[payload.cell_benchmark_index[cellIndex]!]}`;
}

function modelBenchmarkKey(systemId: string, benchmarkId: string): string {
  return `${systemId.slice(0, systemId.lastIndexOf("@"))}\0${benchmarkId}`;
}

export function summarizeRefreshDelta(
  before: PreparedCandidateInputData,
  after: PreparedCandidateInputData,
): RefreshDeltaSummary {
  const beforeCells = new Set(before.cell_system_index.map((_, index) => cellKey(before, index)));
  const afterCells = new Set(after.cell_system_index.map((_, index) => cellKey(after, index)));
  const addedCells = [...afterCells].filter((key) => !beforeCells.has(key));
  const beforeModelBenchmarks = new Set([...beforeCells].map((key) => {
    const [systemId, benchmarkId] = key.split("\0");
    return modelBenchmarkKey(systemId!, benchmarkId!);
  }));
  const uniqueNewCells = addedCells.filter((key) => {
    const [systemId, benchmarkId] = key.split("\0");
    return !beforeModelBenchmarks.has(modelBenchmarkKey(systemId!, benchmarkId!));
  }).length;
  const effortReassignmentCells = addedCells.length - uniqueNewCells;

  const obsKey = (payload: PreparedCandidateInputData, obs: Record<string, unknown>) =>
    `${payload.system_ids[obs.system_index as number]}::${payload.benchmark_ids[obs.benchmark_index as number]}::${payload.protocol_ids[obs.protocol_index as number]}`;
  const beforeObs = new Set(before.observations.map((obs) => obsKey(before, obs)));
  const addedObs = after.observations.filter((obs) => !beforeObs.has(obsKey(after, obs)));
  const extraReplications = addedObs.filter((obs) => {
    const key = `${after.system_ids[obs.system_index as number]}\0${after.benchmark_ids[obs.benchmark_index as number]}`;
    return beforeCells.has(key);
  }).length;

  return {
    observations: { before: before.observations.length, after: after.observations.length, delta: after.observations.length - before.observations.length },
    cells: { before: beforeCells.size, after: afterCells.size, delta: afterCells.size - beforeCells.size },
    unique_new_cells: uniqueNewCells,
    extra_replications: extraReplications,
    effort_reassignment_cells: effortReassignmentCells,
    added_observation_count: addedObs.length,
  };
}

async function readJsonResults(inputPath: string): Promise<unknown[]> {
  if (!inputPath.endsWith(".json")) {
    throw new Error(`Unsupported input format for ${inputPath}: use JSON snapshot or results array`);
  }
  const parsed = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && "results" in parsed && Array.isArray((parsed as { results: unknown[] }).results)) {
    return (parsed as { results: unknown[] }).results;
  }
  throw new Error(`Invalid JSON results file at ${inputPath}: expected array or object with .results array`);
}

async function pathExists(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function resolveFallbackCapturePath(explicit?: string): Promise<string | undefined> {
  if (explicit) return await pathExists(explicit) ? explicit : undefined;
  for (const candidate of DEFAULT_FALLBACK_CAPTURE_PATHS) {
    if (await pathExists(candidate)) return candidate;
  }
  return undefined;
}

async function loadFallbackCapture(filename: string): Promise<RawResult[]> {
  const parsed = JSON.parse(await readFile(filename, "utf8")) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [];
  return rows.filter((row): row is RawResult =>
    Boolean(row && typeof row === "object" && (row as { record_type?: string }).record_type === "benchmark_result"),
  );
}

export interface RefreshLoadResult {
  records: RawResult[];
  fallbackUsed: boolean;
  fallbackPath?: string;
  warnings: IngestSourcesResult["warnings"];
  sources: string[];
}

export async function loadRefreshRecords(options: {
  dataDir: string;
  sources: readonly string[];
  fallbackCapturePath?: string | undefined;
  ingestSourcesFn?: CandidatePreparationOptions["ingestSourcesFn"];
}): Promise<RefreshLoadResult> {
  const ingest = options.ingestSourcesFn ?? ingestSources;
  const ingested = await ingest({ sources: [...options.sources], dataDir: options.dataDir });
  const remoteSources = options.sources.filter((source) => source !== "manual");
  const missing = remoteSources.filter((source) => {
    const output = ingested.outputs.find((row) => row.source === source);
    return !output || output.records.length === 0;
  });
  if (missing.length === 0) {
    return {
      records: ingested.records,
      fallbackUsed: false,
      warnings: ingested.warnings,
      sources: ingested.sources,
    };
  }

  const fallbackPath = await resolveFallbackCapturePath(options.fallbackCapturePath);
  if (!fallbackPath) {
    throw new RefreshCaptureUnavailableError(
      `Refresh capture unavailable for ${missing.join(", ")}; refusing to measure zero fresh public observations.`,
    );
  }
  const fallback = await loadFallbackCapture(fallbackPath);
  const fill = fallback.filter((row) => row.record_type === "benchmark_result" && missing.includes(row.source_id));
  if (fill.length === 0) {
    throw new RefreshCaptureUnavailableError(
      `Refresh capture at ${fallbackPath} has no rows for ${missing.join(", ")}; refusing to measure zero fresh public observations.`,
    );
  }
  return {
    records: [...ingested.records, ...fill],
    fallbackUsed: true,
    fallbackPath,
    warnings: [
      ...ingested.warnings,
      ...missing.map((source) => ({
        source,
        code: "fetch_failed",
        message: `Live ${source} capture empty; filled from ${fallbackPath}`,
      })),
    ],
    sources: ingested.sources,
  };
}

export interface PreparedCandidateResult {
  payload: PreparedCandidateInputData;
  coerced: CoercedAci12Input;
  outputPath?: string;
  selectedRecords?: RawBenchmarkResult[];
  freshRecords?: RawResult[];
  fallbackUsed?: boolean;
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function prepareCandidateInput(options: CandidatePreparationOptions = {}): Promise<PreparedCandidateResult> {
  const dataDir = path.resolve(options.dataDir ?? path.join(root, "data"));
  const registry = await loadRegistry(dataDir, { includeManualResults: true });

  const inputPath = options.input
    ? path.resolve(options.input)
    : path.join(dataDir, "snapshots", "2026-09-06", "snapshot.json");
  const rawResults = await readJsonResults(inputPath);

  if (!options.refreshInput) {
    const mapped = rawResults.map(mapRegistryResult);
    const coerced = coerceAci12RegistryInput({
      models: registry.models,
      benchmarks: registry.benchmarks,
      results: mapped,
      config: registry.indexConfig,
    });
    const payload = buildAci12InferencePayload(coerced, options.seed ?? 20260904, options.progressBar ?? false);
    if (options.output) {
      const outputPath = path.resolve(options.output);
      await writeJson(outputPath, payload);
      return { payload, coerced, outputPath };
    }
    return { payload, coerced };
  }

  const sources = options.sources?.length ? [...options.sources] : [...DEFAULT_REFRESH_SOURCES];
  const historical = rawResults.flatMap((row) => {
    const converted = snapshotResultToRawBenchmarkResult(row);
    return converted ? [converted] : [];
  });
  const fresh = await loadRefreshRecords({
    dataDir,
    sources,
    ...(options.fallbackCapturePath ? { fallbackCapturePath: options.fallbackCapturePath } : {}),
    ...(options.ingestSourcesFn ? { ingestSourcesFn: options.ingestSourcesFn } : {}),
  });
  const captureMerge = mergeHistoricalAndFreshRecords(historical, fresh.records);
  const resolved = resolveRecordAliases(captureMerge.kept, registry);
  const annotated = annotateObservationMetadata(resolved.records, registry);
  const preferred = selectPreferredResults(annotated);
  // ACI 1.2+ fits every non-duplicate observation. Provenance preference is
  // recorded for audit, but lineage selection runs on the full annotated merge.
  const lineage = selectLineageObservations(annotated);
  const selectedRecords = lineage.kept.filter((row): row is RawBenchmarkResult =>
    row.record_type === "benchmark_result"
    && Boolean(row.model_id && row.benchmark_id)
    && !isForbiddenAaRecord(row),
  );
  const mapped = selectedRecords.flatMap((row) => {
    const converted = rawBenchmarkToRegistryResult(row);
    return converted ? [converted] : [];
  });
  const coerced = coerceAci12RegistryInput({
    models: registry.models,
    benchmarks: registry.benchmarks,
    results: mapped,
    config: registry.indexConfig,
  });
  const payload = buildAci12InferencePayload(coerced, options.seed ?? 20260904, options.progressBar ?? false);

  const workDir = path.resolve(options.workDir ?? DEFAULT_REFRESH_WORK_DIR);
  await writeJson(path.join(workDir, "fresh-raw-capture.json"), fresh.records);
  await writeJson(path.join(workDir, "selected-merged-records.json"), selectedRecords);
  await writeJson(path.join(workDir, "ready-input.json"), payload);
  await writeJson(path.join(workDir, "rejections.json"), {
    scoring_rejections: coerced.preparation.rejections,
    capture_replay_superseded: captureMerge.superseded,
    provenance_superseded: preferred.superseded,
    lineage_superseded: lineage.superseded,
  });

  let outputPath: string | undefined;
  if (options.output) {
    outputPath = path.resolve(options.output);
    await writeJson(outputPath, payload);
  }

  return {
    payload,
    coerced,
    ...(outputPath ? { outputPath } : {}),
    selectedRecords,
    freshRecords: fresh.records,
    fallbackUsed: fresh.fallbackUsed,
  };
}

function usage(): string {
  return `ActualAnalysis candidate inference input preparation tool

Usage:
  tsx scripts/prepare-candidate-input.ts --output <path> [options]

Options:
  -o, --output PATH       Output JSON path for prepared candidate input (required)
  -i, --input PATH        Path to results JSON (array or snapshot.json). Default: latest snapshot
  -d, --data-dir PATH     Registry data directory (default: data/)
      --seed N            Random seed (default: 20260904)
      --refresh-input     Merge latest snapshot with fresh ingest sources, then select
      --sources LIST      Comma-separated ingest sources (requires --refresh-input).
                          Default with --refresh-input: manual,datacurve,matharena
  -h, --help              Show this help
`;
}

function parseSources(value: string): string[] {
  return value.split(",").map((source) => source.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let output: string | undefined;
  let input: string | undefined;
  let dataDir: string | undefined;
  let seed: number | undefined;
  let refreshInput = false;
  let sources: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "-h" || arg === "--help") {
      console.log(usage());
      return;
    }
    if (arg === "-o" || arg === "--output") {
      if (!next) throw new Error(`${arg} requires a path`);
      output = next;
      i++;
    } else if (arg === "-i" || arg === "--input") {
      if (!next) throw new Error(`${arg} requires a path`);
      input = next;
      i++;
    } else if (arg === "-d" || arg === "--data-dir") {
      if (!next) throw new Error(`${arg} requires a path`);
      dataDir = next;
      i++;
    } else if (arg === "--seed") {
      if (!next) throw new Error(`${arg} requires an integer`);
      seed = Number(next);
      i++;
    } else if (arg === "--refresh-input") {
      refreshInput = true;
    } else if (arg === "--sources" || arg?.startsWith("--sources=")) {
      const value = arg.startsWith("--sources=") ? arg.slice("--sources=".length) : next;
      if (!arg.startsWith("--sources=")) {
        if (!next) throw new Error("--sources requires a comma-separated list");
        i++;
      }
      if (!value) throw new Error("--sources requires a comma-separated list");
      sources = parseSources(value);
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (sources && !refreshInput) {
    throw new Error("--sources requires --refresh-input");
  }

  if (!output) {
    console.error("Error: --output PATH is required.\n\n" + usage());
    process.exitCode = 1;
    return;
  }

  const result = await prepareCandidateInput({
    output,
    input,
    dataDir,
    seed,
    refreshInput,
    ...(sources ? { sources } : {}),
  });
  console.log(`Successfully prepared candidate input at: ${result.outputPath}`);
  console.log(`Models: ${result.payload.n_models}, Systems: ${result.payload.n_systems}, Benchmarks: ${result.payload.n_benchmarks}, Observations: ${result.payload.observations.length}`);
  if (refreshInput) {
    console.log(`Refresh sources: ${(sources ?? DEFAULT_REFRESH_SOURCES).join(", ")}; selected records: ${result.selectedRecords?.length ?? 0}; fallback used: ${result.fallbackUsed === true}`);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
