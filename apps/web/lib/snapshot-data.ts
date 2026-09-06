import { z } from "zod";
import { readReportedEffort } from "@actualanalysis/shared/effort";

import {
  ACI_BASKETS,
  ACI_DOMAINS,
  INDEX_KINDS,
  type AciBasket,
  type AciDomain,
  type BasketScore,
  type BenchmarkRecord,
  type DataStatus,
  type DomainScore,
  type EvidenceSummary,
  type EvidenceTier,
  type IndexKind,
  type IndexScore,
  type IntervalEstimate,
  type ModelRecord,
  type ResultRecord,
  type RunRecord,
  type ScoreUnit,
  type SiteData,
  type SourceKind,
  type SystemSummary,
} from "./data";

const finite = z.number().finite();
const nullableFinite = finite.nullable().optional();
const nullablePositiveInteger = z.number().int().positive().nullable().optional();
const dateValue = z.string().min(1);
const unknownRecord = z.record(z.string(), z.unknown());
const scoreUnit = z.enum(["fraction", "percent", "elo", "minutes", "hours", "currency", "raw"]);
const httpUrl = z.string().url().refine((value) => /^https?:\/\//u.test(value));
const tierValue = z.enum(["verified", "ranked", "provisional"]);

const RunRowSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(INDEX_KINDS),
  methodVersion: z.string().min(1).optional(),
  method_version: z.string().min(1).optional(),
  params: unknownRecord.default({}),
  createdAt: dateValue.optional(),
  created_at: dateValue.optional(),
}).passthrough();

const EvidenceSchema = z.object({
  fitted_cells: nullableFinite,
  domains: nullableFinite,
  safe_independent_cells: nullableFinite,
  max_benchmark_share: nullableFinite,
  max_family_share: nullableFinite,
  own_data_reduction: nullableFinite,
  concentration_c_sf: nullableFinite,
  loo_max_delta: nullableFinite,
  exposure_gap: nullableFinite,
  adversarial_shift: nullableFinite,
}).passthrough();

const ScoreRowSchema = z.object({
  runId: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  systemId: z.string().min(1).optional(),
  system_id: z.string().min(1).optional(),
  profile: z.string().nullable().optional(),
  tier: tierValue.nullable().optional(),
  score: finite.nullable(),
  ciLow: nullableFinite,
  ci_low: nullableFinite,
  ciHigh: nullableFinite,
  ci_high: nullableFinite,
  rank: z.number().int().positive().nullable(),
  rankLow: nullablePositiveInteger,
  rank_low: nullablePositiveInteger,
  rankHigh: nullablePositiveInteger,
  rank_high: nullablePositiveInteger,
  coverage: z.number().min(0).max(1),
  nPrivate: z.number().int().nonnegative().optional(),
  n_private: z.number().int().nonnegative().optional(),
  robustScore: finite.optional(),
  robust_score: finite.optional(),
  flags: z.array(z.unknown()).default([]),
  provisional: z.boolean().default(false),
  pairwise: z.record(z.string(), finite.min(0).max(1)).default({}),
  evidence: EvidenceSchema.nullable().optional(),
}).passthrough();

const IntervalSchema = z.object({
  median: finite,
  low: finite,
  high: finite,
  sd: nullableFinite,
  width: nullableFinite,
}).passthrough();

const DomainSchema = IntervalSchema.extend({
  published: z.boolean().default(false),
  extrapolated: z.boolean().default(true),
  r_s: nullableFinite,
  n_sk: nullableFinite,
});

const BasketSchema = IntervalSchema.extend({
  published: z.boolean().default(false),
  missing_benchmarks: z.array(z.string()).default([]),
});

const SystemParamSchema = z.object({
  model_id: z.string().min(1).optional(),
  profile: z.string().min(1).optional(),
  tier: tierValue.optional(),
  aci_g: IntervalSchema.optional(),
  domains: z.record(z.string(), DomainSchema).default({}),
  baskets: z.record(z.string(), BasketSchema).optional(),
  task_profiles: z.record(z.string(), BasketSchema).optional(),
  evidence: EvidenceSchema.nullable().optional(),
}).passthrough();

const ModelRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  org: z.string().min(1).optional(),
  organization: z.string().min(1).optional(),
  family: z.string().min(1),
  releaseDate: dateValue.nullable().optional(),
  release_date: dateValue.nullable().optional(),
  openWeights: z.boolean().optional(),
  open_weights: z.boolean().optional(),
  license: z.string().nullable().optional(),
  reasoningConfig: unknownRecord.optional(),
  reasoning_config: unknownRecord.optional(),
  reasoning: z.boolean().nullable().optional(),
  paramsTotalB: finite.nonnegative().nullable().optional(),
  params_total_b: finite.nonnegative().nullable().optional(),
  paramsActiveB: finite.nonnegative().nullable().optional(),
  params_active_b: finite.nonnegative().nullable().optional(),
  modality: z.string().min(1).optional(),
  sizeClass: z.string().min(1).optional(),
  size_class: z.string().min(1).optional(),
  contextLength: z.number().int().positive().nullable().optional(),
  maxOutput: z.number().int().positive().nullable().optional(),
}).passthrough();

const BenchmarkRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  tags: z.array(z.string()),
  categories: z.array(z.string()).min(1),
  chanceLevel: finite.optional(),
  chance_level: finite.optional(),
  ceiling: finite.optional(),
  holdout: z.enum(["public", "semi_private", "private", "rolling"]),
  transform: unknownRecord.default({}),
  nItems: z.number().int().positive().nullable().optional(),
  n_items: z.number().int().positive().nullable().optional(),
  harnessUrl: httpUrl.nullable().optional(),
  harness_url: httpUrl.nullable().optional(),
  status: z.string().min(1).default("active"),
}).passthrough();

const SourceRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["runner", "mirror", "self_report", "scrape", "manual"]),
  redistributable: z.boolean(),
  license: z.string().nullable().optional(),
}).passthrough();

const ResultRowSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  benchmarkId: z.string().min(1).optional(),
  benchmark_id: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  source_id: z.string().min(1).optional(),
  score: finite,
  scoreUnit: scoreUnit.optional(),
  score_unit: scoreUnit.optional(),
  provenance: z.string().min(1).optional(),
  se: finite.nonnegative().nullable().optional(),
  nItems: z.number().int().positive().nullable().optional(),
  n_items: z.number().int().positive().nullable().optional(),
  config: unknownRecord.default({}),
  harness: z.string().min(1).nullable().optional(),
  effortTier: z.string().nullable().optional(),
  effort_tier: z.string().nullable().optional(),
  observedOn: dateValue.optional(),
  observed_on: dateValue.optional(),
  url: httpUrl.optional(),
  sourceUrl: httpUrl.optional(),
  source_url: httpUrl.optional(),
  supersededBy: z.string().nullable().optional(),
  superseded_by: z.string().nullable().optional(),
}).passthrough();

const PricingRowSchema = z.object({
  modelId: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  source_id: z.string().min(1).optional(),
  provider: z.string().min(1),
  inputPerM: finite.nonnegative().optional(),
  input_per_m: finite.nonnegative().optional(),
  outputPerM: finite.nonnegative().optional(),
  output_per_m: finite.nonnegative().optional(),
  cacheReadPerM: finite.nonnegative().nullable().optional(),
  cache_read_per_m: finite.nonnegative().nullable().optional(),
  contextLength: z.number().int().positive().nullable().optional(),
  context_length: z.number().int().positive().nullable().optional(),
  maxOutput: z.number().int().positive().nullable().optional(),
  max_output: z.number().int().positive().nullable().optional(),
}).passthrough();

const BenchmarkParamRowSchema = z.object({
  runId: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  benchmarkId: z.string().min(1).optional(),
  benchmark_id: z.string().min(1).optional(),
  difficulty: finite,
  slope: finite.positive(),
  weight: finite.nonnegative().optional(),
  residualVar: finite.nonnegative().nullable().optional(),
  residual_var: finite.nonnegative().nullable().optional(),
}).passthrough();

const CellRowSchema = z.object({
  runId: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  systemId: z.string().min(1).optional(),
  system_id: z.string().min(1).optional(),
  profile: z.string().nullable().optional(),
  benchmarkId: z.string().min(1).optional(),
  benchmark_id: z.string().min(1).optional(),
  y: finite,
  yHat: finite.optional(),
  y_hat: finite.optional(),
  z: finite,
  used: z.boolean().default(true),
}).passthrough();

const SnapshotSchema = z.object({
  generated_at: z.string().datetime(),
  license: z.string().min(1),
  data_policy: z.string().min(1).optional(),
  diagnostics: z.record(z.string(), unknownRecord).default({}),
  exclusions: z.array(z.string()).default([]),
  runs: z.array(RunRowSchema).min(3),
  scores: z.array(ScoreRowSchema).min(3),
  benchmark_params: z.array(BenchmarkParamRowSchema).default([]),
  cells: z.array(CellRowSchema).default([]),
  results: z.array(ResultRowSchema),
  models: z.array(ModelRowSchema).min(1),
  benchmarks: z.array(BenchmarkRowSchema).min(1),
  sources: z.array(SourceRowSchema),
  pricing: z.array(PricingRowSchema),
}).passthrough();

type Snapshot = z.infer<typeof SnapshotSchema>;
type RunRow = z.infer<typeof RunRowSchema>;
type ScoreRow = z.infer<typeof ScoreRowSchema>;
type CellRow = z.infer<typeof CellRowSchema>;
type BenchmarkRow = z.infer<typeof BenchmarkRowSchema>;
type EvidenceRow = z.infer<typeof EvidenceSchema>;

export interface PublishedSiteData extends SiteData {
  generatedAt: string;
  snapshotDate: string;
}

/** Score-row flags that the UI renders as badges rather than diagnostic flags. */
const BADGE_FLAG_KINDS = new Set(["evidence_tier", "system_profile"]);

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  return values.find((value): value is T => value !== undefined && value !== null) ?? null;
}

function requiredAlias(...values: Array<string | undefined>): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

function runDate(run: RunRow): string | null {
  return requiredAlias(run.createdAt, run.created_at);
}

function runMethodVersion(run: RunRow): string | null {
  return requiredAlias(run.methodVersion, run.method_version);
}

function newestRun(rows: RunRow[], kind: IndexKind, methodVersion?: string | null): RunRow | null {
  return rows
    .filter((row) => row.kind === kind && runDate(row) !== null)
    .filter((row) => !methodVersion || runMethodVersion(row) === methodVersion)
    .sort((left, right) => Date.parse(runDate(right) ?? "") - Date.parse(runDate(left) ?? ""))[0] ?? null;
}

/**
 * The newest mixed run defines the published method version; the agentic and chat
 * columns come from the newest runs of that same version, falling back to the newest
 * run of the kind only when no same-version run exists.
 */
export function selectPublishedRuns(rows: RunRow[]): Record<IndexKind, RunRow | null> {
  const mixed = newestRun(rows, "mixed");
  const version = mixed ? runMethodVersion(mixed) : null;
  return {
    mixed,
    agentic: newestRun(rows, "agentic", version) ?? newestRun(rows, "agentic"),
    chat: newestRun(rows, "chat", version) ?? newestRun(rows, "chat"),
  };
}

function flagKind(flag: unknown): string | null {
  if (!flag || typeof flag !== "object") return null;
  const kind = (flag as Record<string, unknown>).kind;
  return typeof kind === "string" ? kind : null;
}

function flagLabel(flag: unknown): string | null {
  if (typeof flag === "string" && flag.trim()) return flag;
  if (!flag || typeof flag !== "object") return null;
  const record = flag as Record<string, unknown>;
  if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
  if (typeof record.kind === "string" && record.kind.trim()) return record.kind.replaceAll("_", " ");
  return null;
}

/** Diagnostic flags only: tier and profile markers become badges. */
export function diagnosticFlags(flags: readonly unknown[]): string[] {
  const labels = flags
    .filter((flag) => !BADGE_FLAG_KINDS.has(flagKind(flag) ?? ""))
    .map(flagLabel)
    .filter((value): value is string => value !== null);
  return [...new Set(labels)];
}

function sourceKind(kind: z.infer<typeof SourceRowSchema>["kind"]): SourceKind {
  if (kind === "mirror") return "mirror";
  if (kind === "self_report" || kind === "manual") return "self-reported";
  return "independent";
}

function transformKind(transform: Record<string, unknown>): string {
  return typeof transform.type === "string"
    ? transform.type
    : typeof transform.kind === "string"
      ? transform.kind
      : "accuracy";
}

function transformName(transform: Record<string, unknown>): string {
  const kind = typeof transform.type === "string"
    ? transform.type
    : typeof transform.kind === "string"
      ? transform.kind
      : "configured";
  switch (kind) {
    case "accuracy": return "Chance correction → clipped logit";
    case "elo": return "Reference Elo → logistic scale";
    case "metr":
    case "metr_horizon": return "Time horizon → log₂ logistic scale";
    case "vending":
    case "log_relative": return "Reference-relative logarithmic transform";
    default: return `${kind.replaceAll("_", " ")} transform`;
  }
}

function reasoningLabel(config: Record<string, unknown>): string {
  for (const key of ["effort", "mode", "type", "reasoning_effort", "thinking"]) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return Object.keys(config).length ? "configured" : "unspecified";
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function logit(value: number): number {
  const clipped = Math.min(1 - 1e-6, Math.max(1e-6, value));
  return Math.log(clipped / (1 - clipped));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

interface TransformShape {
  kind: string;
  chance: number;
  ceiling: number;
  eloReference: number;
  eloScale: number;
  midpointLog2Minutes: number;
  horizonScale: number;
  logBase: number;
  logScale: number;
  referenceValue: number;
}

function transformShape(benchmark: BenchmarkRow): TransformShape {
  const transform = benchmark.transform;
  return {
    kind: transformKind(transform),
    chance: benchmark.chanceLevel ?? benchmark.chance_level ?? 0,
    ceiling: benchmark.ceiling ?? 1,
    eloReference: numberOr(transform.reference_elo ?? transform.eloRef ?? transform.elo_ref ?? transform.reference, 0),
    // The scoring engine uses the standard Elo logistic base: y = (elo − ref)·ln10 / 400.
    eloScale: 400 / Math.LN10,
    midpointLog2Minutes: numberOr(transform.midpoint_log2_minutes ?? transform.centerLog2Minutes, 8),
    horizonScale: numberOr(transform.scale, 2),
    logBase: numberOr(transform.base, 2),
    logScale: numberOr(transform.scale, 1),
    referenceValue: numberOr(transform.reference_value ?? transform.reference, 1),
  };
}

/** Native score expressed as an accuracy fraction for accuracy benchmarks. */
function accuracyFraction(score: number, benchmark: BenchmarkRow, unit: ScoreUnit): number {
  const scale = benchmark.transform.input_scale ?? benchmark.transform.inputScale;
  if (unit === "percent") return score / 100;
  if (unit === "fraction") return score;
  return scale === "percent" || score > 1 ? score / 100 : score;
}

/** Forward transform: native observation → fitted logit, mirroring the scoring engine. */
export function nativeToLogit(score: number, benchmark: BenchmarkRow, unit: ScoreUnit): number | null {
  const shape = transformShape(benchmark);
  switch (shape.kind) {
    case "accuracy": {
      const range = shape.ceiling - shape.chance;
      return range > 0 ? logit((accuracyFraction(score, benchmark, unit) - shape.chance) / range) : null;
    }
    case "elo":
      return (score - shape.eloReference) / shape.eloScale;
    case "metr":
    case "metr_horizon": {
      const minutes = unit === "hours" ? score * 60 : score;
      return minutes > 0 ? (Math.log2(minutes) - shape.midpointLog2Minutes) / shape.horizonScale : null;
    }
    case "vending":
    case "log_relative":
      return score > 0 && shape.referenceValue > 0
        ? (Math.log(score / shape.referenceValue) / Math.log(shape.logBase)) * shape.logScale
        : null;
    default:
      return null;
  }
}

/** Inverse transform: fitted logit → native units of `unit`; null when the transform is not invertible here. */
export function logitToNative(value: number, benchmark: BenchmarkRow, unit: ScoreUnit): number | null {
  const shape = transformShape(benchmark);
  switch (shape.kind) {
    case "accuracy": {
      const fraction = shape.chance + (shape.ceiling - shape.chance) * sigmoid(value);
      return unit === "percent" ? fraction * 100 : fraction;
    }
    case "elo":
      return shape.eloReference + value * shape.eloScale;
    case "metr":
    case "metr_horizon": {
      const minutes = 2 ** (shape.midpointLog2Minutes + value * shape.horizonScale);
      return unit === "hours" ? minutes / 60 : minutes;
    }
    case "vending":
    case "log_relative":
      return shape.referenceValue * shape.logBase ** (value / shape.logScale);
    default:
      return null;
  }
}

/** Chart scale shared by observed and predicted values: accuracy fraction, or logistic of the logit. */
function chartScale(value: number, benchmark: BenchmarkRow, unit: ScoreUnit, alreadyLogit: boolean): number {
  const shape = transformShape(benchmark);
  if (shape.kind === "accuracy") {
    return alreadyLogit
      ? (logitToNative(value, benchmark, "fraction") ?? sigmoid(value))
      : accuracyFraction(value, benchmark, unit);
  }
  const asLogit = alreadyLogit ? value : nativeToLogit(value, benchmark, unit);
  return asLogit === null ? Number.NaN : sigmoid(asLogit);
}

function benchmarkNameWithVersion(name: string, version: string): string {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const versionToken = new RegExp(`(^|[^A-Za-z0-9])${escapedVersion}($|[^A-Za-z0-9])`, "iu");
  return versionToken.test(name) ? name : `${name} ${version}`;
}

function toEvidence(row: EvidenceRow | null | undefined): EvidenceSummary | null {
  if (!row) return null;
  return {
    fittedCells: row.fitted_cells ?? null,
    domains: row.domains ?? null,
    safeIndependentCells: row.safe_independent_cells ?? null,
    maxBenchmarkShare: row.max_benchmark_share ?? null,
    maxFamilyShare: row.max_family_share ?? null,
    ownDataReduction: row.own_data_reduction ?? null,
    concentration: row.concentration_c_sf ?? null,
    looMaxDelta: row.loo_max_delta ?? null,
    exposureGap: row.exposure_gap ?? null,
    adversarialShift: row.adversarial_shift ?? null,
  };
}

function toInterval(row: z.infer<typeof IntervalSchema> | undefined): IntervalEstimate | null {
  if (!row) return null;
  return { median: row.median, low: row.low, high: row.high, sd: row.sd ?? null, width: row.width ?? null };
}

function toSystemSummary(systemId: string, raw: unknown, fallbackTier: EvidenceTier): SystemSummary | null {
  const parsed = SystemParamSchema.safeParse(raw);
  if (!parsed.success) return null;
  const system = parsed.data;
  const profileFromId = systemId.split("@")[1];
  const domains: Partial<Record<AciDomain, DomainScore>> = {};
  for (const domain of ACI_DOMAINS) {
    const value = system.domains[domain];
    if (!value) continue;
    domains[domain] = {
      ...(toInterval(value) as IntervalEstimate),
      published: value.published,
      extrapolated: value.extrapolated,
      ownDataReduction: value.r_s ?? null,
      fittedCells: value.n_sk ?? null,
    };
  }
  const basketSource = system.baskets ?? system.task_profiles ?? {};
  const baskets: Partial<Record<AciBasket, BasketScore>> = {};
  for (const basket of ACI_BASKETS) {
    const value = basketSource[basket];
    if (!value) continue;
    baskets[basket] = {
      ...(toInterval(value) as IntervalEstimate),
      published: value.published,
      missingBenchmarks: [...value.missing_benchmarks],
    };
  }
  return {
    id: systemId,
    profile: system.profile ?? profileFromId ?? "default",
    tier: system.tier ?? fallbackTier,
    aciG: toInterval(system.aci_g),
    domains,
    baskets,
    evidence: toEvidence(system.evidence),
  };
}

function scoreProfileMatches(rowProfile: string | null | undefined, selectedProfile: string): boolean {
  if (!rowProfile || rowProfile === "legacy") return true;
  return rowProfile === selectedProfile;
}

/** Cells carry short profile names ("max") while systems carry runtime profiles ("max-common"). */
function cellBelongsToSystem(cell: CellRow, modelId: string, systemId: string | null, selectedProfile: string): boolean {
  const cellModel = requiredAlias(cell.modelId, cell.model_id);
  if (cellModel !== modelId) return false;
  const cellSystem = requiredAlias(cell.systemId, cell.system_id);
  if (cellSystem && systemId) return cellSystem === systemId;
  if (!cell.profile || cell.profile === "legacy") return true;
  return cell.profile === selectedProfile || selectedProfile.startsWith(`${cell.profile}-`) || selectedProfile === cell.profile;
}

export interface CoverageSummary {
  count: number;
  total: number;
}

/**
 * Coverage is the number of distinct benchmarks with a used fitted cell for the
 * system, over the number of benchmarks fitted in that run (benchmark_params rows,
 * falling back to the benchmarks that have any cell in the run).
 */
export function computeCoverage(
  cells: readonly CellRow[],
  benchmarkParams: readonly z.infer<typeof BenchmarkParamRowSchema>[],
  runId: string,
  modelId: string,
  systemId: string | null,
  selectedProfile: string,
): CoverageSummary | null {
  const runCells = cells.filter((cell) => requiredAlias(cell.runId, cell.run_id) === runId);
  const fitted = new Set(
    benchmarkParams
      .filter((row) => requiredAlias(row.runId, row.run_id) === runId)
      .map((row) => requiredAlias(row.benchmarkId, row.benchmark_id))
      .filter((id): id is string => id !== null),
  );
  if (!fitted.size) {
    for (const cell of runCells) {
      const id = requiredAlias(cell.benchmarkId, cell.benchmark_id);
      if (id) fitted.add(id);
    }
  }
  if (!fitted.size) return null;
  const covered = new Set<string>();
  for (const cell of runCells) {
    if (!cell.used) continue;
    const id = requiredAlias(cell.benchmarkId, cell.benchmark_id);
    if (!id || !fitted.has(id)) continue;
    if (cellBelongsToSystem(cell, modelId, systemId, selectedProfile)) covered.add(id);
  }
  return { count: covered.size, total: fitted.size };
}

/**
 * Converts the database export contract into the serializable records consumed by
 * the app. A null result means the snapshot is incomplete or internally invalid,
 * so callers must retain the unmistakable fixture fallback.
 */
export function mapCommittedSnapshot(raw: unknown, snapshotDate: string): PublishedSiteData | null {
  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success || !/^\d{4}-\d{2}-\d{2}$/u.test(snapshotDate)) return null;
  const snapshot: Snapshot = parsed.data;
  if ("speed" in (raw as object) || "speeds" in (raw as object)) return null;

  const selectedRuns = selectPublishedRuns(snapshot.runs);
  if (INDEX_KINDS.some((kind) => selectedRuns[kind] === null)) return null;

  const runIds = new Set(INDEX_KINDS.map((kind) => selectedRuns[kind]!.id));
  const allModelIds = new Set(snapshot.models.map((model) => model.id));
  const allBenchmarkIds = new Set(snapshot.benchmarks.map((benchmark) => benchmark.id));
  const allSourceIds = new Set(snapshot.sources.map((source) => source.id));
  if (snapshot.models.some((model) => "speed" in model || "speeds" in model)) return null;
  if (snapshot.pricing.some((row) => {
    const modelId = requiredAlias(row.modelId, row.model_id);
    const sourceId = requiredAlias(row.sourceId, row.source_id);
    return modelId === null || sourceId === null || !allModelIds.has(modelId) || !allSourceIds.has(sourceId);
  })) return null;
  if (snapshot.results.some((row) => {
    const modelId = requiredAlias(row.modelId, row.model_id);
    const benchmarkId = requiredAlias(row.benchmarkId, row.benchmark_id);
    const sourceId = requiredAlias(row.sourceId, row.source_id);
    const unit = requiredAlias(row.scoreUnit, row.score_unit);
    const sourceUrl = requiredAlias(row.url, row.sourceUrl, row.source_url);
    return modelId === null || benchmarkId === null || sourceId === null
      || unit === null
      || sourceUrl === null
      || (row.supersededBy === undefined && row.superseded_by === undefined)
      || !allModelIds.has(modelId)
      || !allBenchmarkIds.has(benchmarkId)
      || !allSourceIds.has(sourceId);
  })) return null;

  const profileForRun = (kind: IndexKind): string => String(selectedRuns[kind]?.params.default_profile ?? "max");
  const systemsForRun = (kind: IndexKind): Record<string, unknown> => {
    const systems = selectedRuns[kind]?.params.systems;
    return systems && typeof systems === "object" ? systems as Record<string, unknown> : {};
  };

  const scoresByModel = new Map<string, Partial<Record<IndexKind, IndexScore>>>();
  const scoreRowsByRun = new Map<string, number>();
  const selectedSystemByModel = new Map<string, string>();
  const scoreRowByModelKind = new Map<string, ScoreRow>();
  for (const row of snapshot.scores) {
    const runId = requiredAlias(row.runId, row.run_id);
    const modelId = requiredAlias(row.modelId, row.model_id);
    if (!runId || !modelId || !runIds.has(runId) || !allModelIds.has(modelId)) continue;
    const kind = INDEX_KINDS.find((candidate) => selectedRuns[candidate]?.id === runId);
    if (!kind) continue;
    const selectedProfile = profileForRun(kind);
    if (!scoreProfileMatches(row.profile, selectedProfile)) continue;
    const robustScore = firstDefined(row.robustScore, row.robust_score);
    if (robustScore === null) continue;
    const systemId = requiredAlias(row.systemId, row.system_id);
    const reportedTier: EvidenceTier | null = row.tier ?? (row.provisional ? "provisional" : null);
    const flags = diagnosticFlags(row.flags);
    // A row without a point score can only be shown as an interval, whatever its reported tier.
    const provisional = row.provisional || row.score === null;
    const tier: EvidenceTier | null = reportedTier && reportedTier !== "provisional" && row.score === null
      ? "provisional"
      : reportedTier;
    if (reportedTier && reportedTier !== tier) flags.push(`reported tier ${reportedTier} without a published point score`);
    const coverage = computeCoverage(snapshot.cells, snapshot.benchmark_params, runId, modelId, systemId, selectedProfile);
    const current = scoresByModel.get(modelId) ?? {};
    current[kind] = {
      score: row.score,
      ciLow: firstDefined(row.ciLow, row.ci_low),
      ciHigh: firstDefined(row.ciHigh, row.ci_high),
      rank: row.rank,
      rankLow: firstDefined(row.rankLow, row.rank_low),
      rankHigh: firstDefined(row.rankHigh, row.rank_high),
      coverage: row.coverage,
      coverageCount: coverage?.count ?? null,
      coverageTotal: coverage?.total ?? null,
      robustScore,
      provisional,
      tier,
      systemId,
      profile: row.profile ?? null,
      flags,
      pairwise: { ...row.pairwise },
    };
    scoresByModel.set(modelId, current);
    scoreRowByModelKind.set(`${modelId}\0${kind}`, row);
    if (kind === "mixed" && systemId) selectedSystemByModel.set(modelId, systemId);
    scoreRowsByRun.set(runId, (scoreRowsByRun.get(runId) ?? 0) + 1);
  }
  if ([...runIds].some((runId) => !scoreRowsByRun.has(runId))) return null;

  const scoredModelIds = new Set(scoresByModel.keys());
  if (!scoredModelIds.size) return null;

  const pricingByModel = new Map<string, ModelRecord["pricing"]>();
  const limitsByModel = new Map<string, { context: number | null; output: number | null }>();
  for (const row of snapshot.pricing) {
    const modelId = requiredAlias(row.modelId, row.model_id);
    const input = firstDefined(row.inputPerM, row.input_per_m);
    const output = firstDefined(row.outputPerM, row.output_per_m);
    if (!modelId || input === null || output === null) continue;
    const records = pricingByModel.get(modelId) ?? [];
    records.push({
      provider: row.provider,
      inputPerMillion: input,
      outputPerMillion: output,
      cacheReadPerMillion: firstDefined(row.cacheReadPerM, row.cache_read_per_m),
    });
    pricingByModel.set(modelId, records);
    const current = limitsByModel.get(modelId) ?? { context: null, output: null };
    const context = firstDefined(row.contextLength, row.context_length);
    const maxOutput = firstDefined(row.maxOutput, row.max_output);
    limitsByModel.set(modelId, {
      context: context === null ? current.context : Math.max(current.context ?? 0, context),
      output: maxOutput === null ? current.output : Math.max(current.output ?? 0, maxOutput),
    });
  }
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const benchmarksById = new Map(snapshot.benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const sourceNamesByBenchmark = new Map<string, Set<string>>();
  for (const row of snapshot.results) {
    const benchmarkId = requiredAlias(row.benchmarkId, row.benchmark_id);
    const sourceId = requiredAlias(row.sourceId, row.source_id);
    if (!benchmarkId || !sourceId) continue;
    const source = sourcesById.get(sourceId);
    if (!source) continue;
    const names = sourceNamesByBenchmark.get(benchmarkId) ?? new Set<string>();
    names.add(source.name);
    sourceNamesByBenchmark.set(benchmarkId, names);
  }

  const selectedRunPriority = INDEX_KINDS.map((kind) => selectedRuns[kind]!.id);
  const paramsByBenchmark = new Map<string, z.infer<typeof BenchmarkParamRowSchema>>();
  for (const runId of selectedRunPriority) {
    for (const row of snapshot.benchmark_params) {
      const rowRunId = requiredAlias(row.runId, row.run_id);
      const benchmarkId = requiredAlias(row.benchmarkId, row.benchmark_id);
      if (rowRunId === runId && benchmarkId && !paramsByBenchmark.has(benchmarkId)) {
        paramsByBenchmark.set(benchmarkId, row);
      }
    }
  }

  const benchmarks: BenchmarkRecord[] = snapshot.benchmarks.map((row) => {
    const params = paramsByBenchmark.get(row.id);
    const residualVar = params ? firstDefined(params.residualVar, params.residual_var) : null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      version: row.version,
      tags: row.tags.filter((tag): tag is "agentic" | "chat" => tag === "agentic" || tag === "chat"),
      categories: row.categories,
      holdout: row.holdout === "semi_private" ? "semi-private" : row.holdout,
      nItems: firstDefined(row.nItems, row.n_items),
      status: typeof row.status === "string" ? row.status : "active",
      difficulty: params?.difficulty ?? null,
      slope: params?.slope ?? null,
      misfitSd: residualVar === null ? null : Math.sqrt(residualVar),
      transform: transformName(row.transform),
      harnessUrl: firstDefined(row.harnessUrl, row.harness_url),
      sourceNames: [...(sourceNamesByBenchmark.get(row.id) ?? [])].sort(),
      description: `${benchmarkNameWithVersion(row.name, row.version)} is registered as a ${row.holdout.replaceAll("_", " ")} benchmark in this public snapshot.`,
    };
  });

  const inferredReasoningByModel = new Map<string, Record<string, unknown>>();
  for (const result of snapshot.results) {
    const modelId = requiredAlias(result.modelId, result.model_id);
    const config = result.config;
    if (!modelId || inferredReasoningByModel.has(modelId)) continue;
    if (["effort", "mode", "type", "reasoning_effort", "thinking"].some((key) => typeof config[key] === "string")) {
      inferredReasoningByModel.set(modelId, config);
    }
  }

  const models: ModelRecord[] = snapshot.models.flatMap((row) => {
    const organization = requiredAlias(row.org, row.organization);
    const openWeights = row.openWeights ?? row.open_weights;
    const scores = scoresByModel.get(row.id) ?? {};
    if (!organization || openWeights === undefined) return [];
    const limits = limitsByModel.get(row.id) ?? { context: null, output: null };
    const systemId = selectedSystemByModel.get(row.id) ?? scores.agentic?.systemId ?? scores.chat?.systemId ?? null;
    const mixedRow = scoreRowByModelKind.get(`${row.id}\0mixed`);
    let system: SystemSummary | null = null;
    if (systemId) {
      const fallbackTier = scores.mixed?.tier ?? "provisional";
      for (const kind of INDEX_KINDS) {
        system = toSystemSummary(systemId, systemsForRun(kind)[systemId], fallbackTier);
        if (system) break;
      }
      if (system && mixedRow?.evidence) system = { ...system, evidence: toEvidence(mixedRow.evidence) };
      if (system && scores.mixed?.tier) system = { ...system, tier: scores.mixed.tier };
    }
    return [{
      id: row.id,
      slug: row.slug,
      name: row.name,
      aliases: [...new Set(row.aliases)],
      organization,
      family: row.family,
      releasedOn: firstDefined(row.releaseDate, row.release_date),
      openWeights,
      license: row.license ?? null,
      contextWindow: row.contextLength ?? limits.context,
      maxOutput: row.maxOutput ?? limits.output,
      reasoning: row.reasoning === false
        ? "standard"
        : reasoningLabel(
            Object.keys(row.reasoningConfig ?? row.reasoning_config ?? {}).length
              ? row.reasoningConfig ?? row.reasoning_config ?? {}
              : inferredReasoningByModel.get(row.id) ?? (row.reasoning === true ? { mode: "reasoning" } : {}),
          ),
      paramsTotalB: firstDefined(row.paramsTotalB, row.params_total_b),
      paramsActiveB: firstDefined(row.paramsActiveB, row.params_active_b),
      modality: row.modality ?? "text",
      sizeClass: firstDefined(row.sizeClass, row.size_class) ?? "unknown",
      indexes: scores,
      system,
      pricing: (pricingByModel.get(row.id) ?? []).sort((left, right) => left.provider.localeCompare(right.provider)),
      speed: null,
    }];
  });
  if (!models.length) return null;

  const modelSlugById = new Map(models.map((model) => [model.id, model.slug]));
  const benchmarkSlugById = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark.slug]));
  const mixedProfile = profileForRun("mixed");
  const cellsByPair = new Map<string, CellRow>();
  for (const runId of selectedRunPriority) {
    for (const row of snapshot.cells) {
      const rowRunId = requiredAlias(row.runId, row.run_id);
      const modelId = requiredAlias(row.modelId, row.model_id);
      const benchmarkId = requiredAlias(row.benchmarkId, row.benchmark_id);
      if (rowRunId !== runId || !modelId || !benchmarkId) continue;
      if (!cellBelongsToSystem(row, modelId, selectedSystemByModel.get(modelId) ?? null, mixedProfile)) continue;
      const key = `${modelId}\0${benchmarkId}`;
      if (!cellsByPair.has(key)) cellsByPair.set(key, row);
    }
  }

  const results: ResultRecord[] = snapshot.results.flatMap((row) => {
    const modelId = requiredAlias(row.modelId, row.model_id);
    const benchmarkId = requiredAlias(row.benchmarkId, row.benchmark_id);
    const sourceId = requiredAlias(row.sourceId, row.source_id);
    const observedOn = requiredAlias(row.observedOn, row.observed_on);
    const unit = requiredAlias(row.scoreUnit, row.score_unit) as ScoreUnit | null;
    const sourceUrl = requiredAlias(row.url, row.sourceUrl, row.source_url);
    const modelSlug = modelId ? modelSlugById.get(modelId) : undefined;
    const benchmarkSlug = benchmarkId ? benchmarkSlugById.get(benchmarkId) : undefined;
    const source = sourceId ? sourcesById.get(sourceId) : undefined;
    const benchmark = benchmarkId ? benchmarksById.get(benchmarkId) : undefined;
    if (!modelId || !benchmarkId || !modelSlug || !benchmarkSlug || !source || !benchmark || !observedOn || !unit || !sourceUrl) return [];
    const cell = cellsByPair.get(`${modelId}\0${benchmarkId}`);
    const yHat = cell ? firstDefined(cell.yHat, cell.y_hat) : null;
    const rawStandardError = row.se ?? null;
    const isPercent = unit === "percent";
    const observed = chartScale(row.score, benchmark, unit, false);
    const predicted = yHat === null ? null : chartScale(yHat, benchmark, unit, true);
    const provenanceKind: SourceKind = row.provenance === "self_report"
      ? "self-reported"
      : row.provenance === "mirror"
        ? "mirror"
        : row.provenance === "independent"
          ? "independent"
          : sourceKind(source.kind);
    const sourceEffort = readReportedEffort({ effort_tier: row.effortTier ?? row.effort_tier, config: row.config });
    const assumedMaximum = selectedRuns.mixed?.params.unreported_effort_policy === "maximum" && sourceEffort === undefined;
    return [{
      id: row.id,
      modelSlug,
      benchmarkSlug,
      rawScore: row.score,
      score: Number.isFinite(observed) ? observed : row.score,
      scoreUnit: unit,
      predicted: predicted !== null && Number.isFinite(predicted) ? predicted : null,
      predictedNative: yHat === null ? null : logitToNative(yHat, benchmark, unit),
      observedLogit: cell?.y ?? null,
      predictedLogit: yHat,
      standardError: rawStandardError === null ? null : isPercent ? rawStandardError / 100 : rawStandardError,
      residualZ: cell?.z ?? null,
      sourceKind: provenanceKind,
      sourceName: source.name,
      sourceUrl,
      harness: row.harness ?? null,
      config: assumedMaximum ? { ...row.config, index_effort_assumption: "maximum", source_effort: "not reported" } : row.config,
      nItems: firstDefined(row.nItems, row.n_items),
      observedOn,
      used: firstDefined(row.supersededBy, row.superseded_by) === null,
      displayOnly: !source.redistributable,
      sourceLicense: source.license ?? null,
    }];
  });
  const runs: RunRecord[] = snapshot.runs.flatMap((row) => {
    const methodVersion = runMethodVersion(row);
    const createdAt = runDate(row);
    if (!methodVersion || !createdAt) return [];
    return [{
      id: row.id,
      kind: row.kind,
      methodVersion,
      createdAt,
      published: true,
      note: `Published in the ${snapshotDate} auditable snapshot.`,
    }];
  });
  if (runs.some((run) => !run.methodVersion || !Number.isFinite(Date.parse(run.createdAt)))) return null;

  const history = snapshot.scores.flatMap((row) => {
    const runId = requiredAlias(row.runId, row.run_id);
    const modelId = requiredAlias(row.modelId, row.model_id);
    const run = snapshot.runs.find((candidate) => candidate.id === runId);
    const modelSlug = modelId ? modelSlugById.get(modelId) : undefined;
    const createdAt = run ? runDate(run) : null;
    if (!runId || !run || !modelSlug || !createdAt || row.score === null) return [];
    return [{ modelSlug, kind: run.kind, runId, createdAt, score: row.score }];
  });

  const status: DataStatus = {
    mode: "snapshot",
    label: "Published snapshot",
    snapshotDate,
    published: true,
    methodVersion: selectedRuns.mixed ? runMethodVersion(selectedRuns.mixed) : null,
    disclaimer: `Validated ${snapshotDate} snapshot. Source licensing is preserved per row; non-redistributable evidence is display-only. Speed data is excluded.`,
  };

  return {
    generatedAt: snapshot.generated_at,
    snapshotDate,
    status,
    models,
    benchmarks,
    results,
    history,
    runs,
  };
}
