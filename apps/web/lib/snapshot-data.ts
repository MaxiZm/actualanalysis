import { z } from "zod";

import {
  INDEX_KINDS,
  type BenchmarkRecord,
  type DataStatus,
  type IndexKind,
  type IndexScore,
  type ModelRecord,
  type ResultRecord,
  type RunRecord,
  type SiteData,
  type SourceKind,
} from "./data";

const finite = z.number().finite();
const nullableFinite = finite.nullable().optional();
const nullablePositiveInteger = z.number().int().positive().nullable().optional();
const dateValue = z.string().min(1);
const unknownRecord = z.record(z.string(), z.unknown());
const scoreUnit = z.enum(["fraction", "percent", "elo", "minutes", "hours", "currency", "raw"]);
const httpUrl = z.string().url().refine((value) => /^https?:\/\//u.test(value));

const RunRowSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(INDEX_KINDS),
  methodVersion: z.string().min(1).optional(),
  method_version: z.string().min(1).optional(),
  params: unknownRecord.default({}),
  createdAt: dateValue.optional(),
  created_at: dateValue.optional(),
}).passthrough();

const ScoreRowSchema = z.object({
  runId: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  systemId: z.string().min(1).optional(),
  system_id: z.string().min(1).optional(),
  profile: z.string().nullable().optional(),
  tier: z.enum(["verified", "ranked", "provisional"]).nullable().optional(),
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
  se: finite.nonnegative().nullable().optional(),
  nItems: z.number().int().positive().nullable().optional(),
  n_items: z.number().int().positive().nullable().optional(),
  config: unknownRecord.default({}),
  harness: z.string().min(1).nullable().optional(),
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
  weight: finite.nonnegative(),
  weightFactors: z.record(z.string(), finite).optional(),
  weight_factors: z.record(z.string(), finite).optional(),
}).passthrough();

const CellRowSchema = z.object({
  runId: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  systemId: z.string().min(1).optional(),
  system_id: z.string().min(1).optional(),
  profile: z.enum(["std", "max", "legacy"]).nullable().optional(),
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
type BenchmarkRow = z.infer<typeof BenchmarkRowSchema>;

export interface PublishedSiteData extends SiteData {
  generatedAt: string;
  snapshotDate: string;
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  return values.find((value): value is T => value !== undefined && value !== null) ?? null;
}

function requiredAlias(...values: Array<string | undefined>): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

function runDate(run: RunRow): string | null {
  return requiredAlias(run.createdAt, run.created_at);
}

function newestRun(rows: RunRow[], kind: IndexKind): RunRow | null {
  return rows
    .filter((row) => row.kind === kind && runDate(row) !== null)
    .sort((left, right) => Date.parse(runDate(right) ?? "") - Date.parse(runDate(left) ?? ""))[0] ?? null;
}

function flagLabel(flag: unknown): string | null {
  if (typeof flag === "string" && flag.trim()) return flag;
  if (!flag || typeof flag !== "object") return null;
  const record = flag as Record<string, unknown>;
  if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
  if (typeof record.kind === "string" && record.kind.trim()) return record.kind.replaceAll("_", " ");
  return null;
}

function sourceKind(kind: z.infer<typeof SourceRowSchema>["kind"]): SourceKind {
  if (kind === "mirror") return "mirror";
  if (kind === "self_report" || kind === "manual") return "self-reported";
  return "independent";
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

function normalizeRawScore(
  score: number,
  benchmark: BenchmarkRow,
  unit: z.infer<typeof scoreUnit>,
): number {
  const kind = typeof benchmark.transform.type === "string"
    ? benchmark.transform.type
    : typeof benchmark.transform.kind === "string"
      ? benchmark.transform.kind
      : "accuracy";
  if (kind === "accuracy") {
    const scale = benchmark.transform.input_scale ?? benchmark.transform.inputScale;
    if (unit === "percent") return score / 100;
    if (unit === "fraction") return score;
    return scale === "percent" || score > 1 ? score / 100 : score;
  }
  if (kind === "elo") {
    const reference = Number(benchmark.transform.reference_elo ?? benchmark.transform.eloRef ?? 0);
    const scale = Number(benchmark.transform.scale ?? 400);
    return sigmoid((score - reference) / scale);
  }
  if (kind === "metr" || kind === "metr_horizon") {
    const midpoint = Number(benchmark.transform.midpoint_log2_minutes ?? benchmark.transform.centerLog2Minutes ?? 8);
    const scale = Number(benchmark.transform.scale ?? 2);
    const minutes = unit === "hours" ? score * 60 : score;
    return minutes > 0 ? sigmoid((Math.log2(minutes) - midpoint) / scale) : 0;
  }
  return score;
}

function inverseCellScore(value: number, benchmark: BenchmarkRow): number {
  const corrected = sigmoid(value);
  const kind = benchmark.transform.type ?? benchmark.transform.kind;
  if (kind !== "accuracy") return corrected;
  const chance = benchmark.chanceLevel ?? benchmark.chance_level ?? 0;
  return chance + (1 - chance) * corrected;
}

function valueFromFactors(factors: Record<string, number>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (factors[key] !== undefined) return factors[key] ?? null;
  }
  return null;
}

function benchmarkNameWithVersion(name: string, version: string): string {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const versionToken = new RegExp(`(^|[^A-Za-z0-9])${escapedVersion}($|[^A-Za-z0-9])`, "iu");
  return versionToken.test(name) ? name : `${name} ${version}`;
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

  const selectedRuns = Object.fromEntries(
    INDEX_KINDS.map((kind) => [kind, newestRun(snapshot.runs, kind)]),
  ) as Record<IndexKind, RunRow | null>;
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

  const scoresByModel = new Map<string, Partial<Record<IndexKind, IndexScore>>>();
  const scoreRowsByRun = new Map<string, number>();
  for (const row of snapshot.scores) {
    const runId = requiredAlias(row.runId, row.run_id);
    const modelId = requiredAlias(row.modelId, row.model_id);
    if (!runId || !modelId || !runIds.has(runId) || !allModelIds.has(modelId)) continue;
    const kind = INDEX_KINDS.find((candidate) => selectedRuns[candidate]?.id === runId);
    const selectedProfile = kind
      ? String(selectedRuns[kind]?.params.default_profile ?? "max")
      : "max";
    if (row.profile && row.profile !== "legacy" && row.profile !== selectedProfile) continue;
    const robustScore = firstDefined(row.robustScore, row.robust_score);
    if (!kind || robustScore === null) continue;
    const current = scoresByModel.get(modelId) ?? {};
    const flags = row.flags.map(flagLabel).filter((value): value is string => value !== null);
    current[kind] = {
      score: row.score,
      ciLow: firstDefined(row.ciLow, row.ci_low),
      ciHigh: firstDefined(row.ciHigh, row.ci_high),
      rank: row.rank,
      rankLow: firstDefined(row.rankLow, row.rank_low),
      rankHigh: firstDefined(row.rankHigh, row.rank_high),
      coverage: row.coverage,
      robustScore,
      provisional: row.provisional,
      flags: [...new Set(flags)],
      pairwise: { ...row.pairwise },
    };
    scoresByModel.set(modelId, current);
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
    if (!modelId || !scoredModelIds.has(modelId) || input === null || output === null) continue;
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
    const factors = params?.weightFactors ?? params?.weight_factors ?? {};
    const saturationFactor = valueFromFactors(factors, "saturation");
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      version: row.version,
      tags: row.tags.filter((tag): tag is "agentic" | "chat" => tag === "agentic" || tag === "chat"),
      categories: row.categories,
      holdout: row.holdout === "semi_private" ? "semi-private" : row.holdout,
      nItems: firstDefined(row.nItems, row.n_items),
      difficulty: params?.difficulty ?? null,
      slope: params?.slope ?? null,
      weight: params?.weight ?? null,
      saturation: saturationFactor === null ? null : Math.max(0, Math.min(1, 1 - saturationFactor)),
      weightFactors: {
        discrimination: valueFromFactors(factors, "discrimination"),
        saturation: saturationFactor,
        source: valueFromFactors(factors, "sources", "source"),
        holdout: valueFromFactors(factors, "privacy", "holdout"),
      },
      categoryShares: Object.fromEntries(
        Object.entries(factors)
          .filter(([key, value]) => key.startsWith("category:") && typeof value === "number")
          .map(([key, value]) => [key.slice("category:".length), value]),
      ),
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
    if (!scoredModelIds.has(row.id)) return [];
    const organization = requiredAlias(row.org, row.organization);
    const openWeights = row.openWeights ?? row.open_weights;
    const scores = scoresByModel.get(row.id);
    if (!organization || openWeights === undefined || !scores) return [];
    const limits = limitsByModel.get(row.id) ?? { context: null, output: null };
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
      pricing: (pricingByModel.get(row.id) ?? []).sort((left, right) => left.provider.localeCompare(right.provider)),
      speed: null,
    }];
  });
  if (!models.length) return null;

  const modelSlugById = new Map(models.map((model) => [model.id, model.slug]));
  const benchmarkSlugById = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark.slug]));
  const cellsByPair = new Map<string, z.infer<typeof CellRowSchema>>();
  for (const runId of selectedRunPriority) {
    for (const row of snapshot.cells) {
      const rowRunId = requiredAlias(row.runId, row.run_id);
      const modelId = requiredAlias(row.modelId, row.model_id);
      const benchmarkId = requiredAlias(row.benchmarkId, row.benchmark_id);
      const selectedProfile = String(selectedRuns.mixed?.params.default_profile ?? "max");
      if (row.profile && row.profile !== "legacy" && row.profile !== selectedProfile) continue;
      if (rowRunId === runId && modelId && benchmarkId && !cellsByPair.has(`${modelId}\0${benchmarkId}`)) {
        cellsByPair.set(`${modelId}\0${benchmarkId}`, row);
      }
    }
  }

  const results: ResultRecord[] = snapshot.results.flatMap((row) => {
    const modelId = requiredAlias(row.modelId, row.model_id);
    const benchmarkId = requiredAlias(row.benchmarkId, row.benchmark_id);
    const sourceId = requiredAlias(row.sourceId, row.source_id);
    const observedOn = requiredAlias(row.observedOn, row.observed_on);
    const unit = requiredAlias(row.scoreUnit, row.score_unit) as z.infer<typeof scoreUnit> | null;
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
    return [{
      id: row.id,
      modelSlug,
      benchmarkSlug,
      rawScore: row.score,
      score: cell ? inverseCellScore(cell.y, benchmark) : normalizeRawScore(row.score, benchmark, unit),
      scoreUnit: unit,
      predicted: cell && yHat !== null ? inverseCellScore(yHat, benchmark) : null,
      standardError: rawStandardError === null ? null : isPercent ? rawStandardError / 100 : rawStandardError,
      residualZ: cell?.z ?? null,
      sourceKind: sourceKind(source.kind),
      sourceName: source.name,
      sourceUrl,
      harness: row.harness ?? null,
      config: row.config,
      nItems: firstDefined(row.nItems, row.n_items),
      observedOn,
      used: firstDefined(row.supersededBy, row.superseded_by) === null,
      displayOnly: !source.redistributable,
      sourceLicense: source.license ?? null,
    }];
  });
  const runs: RunRecord[] = snapshot.runs.flatMap((row) => {
    const methodVersion = requiredAlias(row.methodVersion, row.method_version);
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
    methodVersion: selectedRuns.mixed?.methodVersion ?? selectedRuns.mixed?.method_version ?? null,
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
