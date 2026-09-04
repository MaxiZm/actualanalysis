import { assertPositive, clamp, DEFAULT_EPSILON, logit, mean, sigmoid, stableStringify } from "./math.js";
import type {
  BenchmarkDefinition,
  NormalizedObservation,
  PreparationResult,
  PreparedCell,
  RawScoreResult,
  SourceDescriptor,
} from "./types.js";

export function isIndependentSource(source: SourceDescriptor): boolean {
  if (source.independent !== undefined) return source.independent;
  return source.kind === "independent" || source.kind === "runner" || source.kind === "scrape";
}

/** Larger values are preferred. All records in the best available tier are retained. */
export function provenanceTier(source: SourceDescriptor): number {
  if (isIndependentSource(source)) return 3;
  if (source.kind === "mirror") return 2;
  return 1;
}

export function resultConfigKey(result: RawScoreResult): string {
  return stableStringify(result.config ?? {});
}

interface ProbabilityTransformResult {
  p: number;
  derivative: number;
}

function assertItemCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, received ${value}`);
  }
}

export function normalizeAccuracy(
  score: number,
  chanceLevel = 0,
  epsilon = DEFAULT_EPSILON,
  inputScale: "fraction" | "percent" = "fraction",
): number {
  return toProbability(score, {
    id: "accuracy",
    tags: [],
    holdout: "public",
    transform: { kind: "accuracy", chanceLevel, epsilon, inputScale },
  }).p;
}

export function normalizeElo(
  elo: number,
  eloRef: number,
  scale = 400 / Math.LN10,
  epsilon = DEFAULT_EPSILON,
): number {
  return toProbability(elo, {
    id: "elo",
    tags: [],
    holdout: "public",
    transform: { kind: "elo", eloRef, scale, epsilon },
  }).p;
}

export function normalizeMetr(
  minutes: number,
  centerLog2Minutes = 8,
  scale = 2,
  epsilon = DEFAULT_EPSILON,
): number {
  return toProbability(minutes, {
    id: "metr",
    tags: [],
    holdout: "public",
    transform: { kind: "metr", centerLog2Minutes, scale, epsilon },
  }).p;
}

export function normalizeVending(
  score: number,
  humanBaseline: number,
  options: Omit<Extract<BenchmarkDefinition["transform"], { kind: "vending" }>, "kind" | "humanBaseline"> = {},
): number {
  return toProbability(score, {
    id: "vending",
    tags: [],
    holdout: "public",
    transform: { kind: "vending", humanBaseline, ...options },
  }).p;
}

export function cellNoiseVariance(
  probability: number,
  options: { standardError?: number; nItems?: number; harnessVariance?: number; minLogitSe?: number } = {},
): number {
  if (!(probability > 0 && probability < 1)) {
    throw new Error(`Cell probability must be strictly between zero and one, received ${probability}`);
  }
  const harnessVariance = options.harnessVariance ?? 0;
  if (!(harnessVariance >= 0)) throw new Error("Harness variance must be non-negative");
  let standardError = options.standardError;
  if (standardError === undefined) {
    if (options.nItems === undefined) {
      throw new Error("Cell noise variance requires either standardError or nItems");
    }
    assertItemCount(options.nItems, "Item count");
    standardError = Math.sqrt((probability * (1 - probability)) / options.nItems);
  }
  if (!(standardError >= 0) || !Number.isFinite(standardError)) {
    throw new Error("Cell standard error must be finite and non-negative");
  }
  const samplingVariance = (standardError / (probability * (1 - probability))) ** 2;
  const minLogitSe = options.minLogitSe ?? 0.15;
  if (!(minLogitSe >= 0) || !Number.isFinite(minLogitSe)) {
    throw new Error("Minimum logit standard error must be finite and non-negative");
  }
  return Math.max(samplingVariance, minLogitSe ** 2) + harnessVariance;
}

function toProbability(
  score: number,
  benchmark: BenchmarkDefinition,
  scoreUnit?: RawScoreResult["scoreUnit"],
): ProbabilityTransformResult {
  const transform = benchmark.transform;
  const epsilon = transform.epsilon ?? DEFAULT_EPSILON;
  if (!(epsilon > 0 && epsilon < 0.5)) {
    throw new Error(`Invalid epsilon ${epsilon} for benchmark ${benchmark.id}`);
  }

  switch (transform.kind) {
    case "accuracy": {
      const inputScale =
        scoreUnit === "percent" || scoreUnit === "fraction" ? scoreUnit : transform.inputScale;
      const inputFactor = inputScale === "percent" ? 0.01 : 1;
      const fraction = score * inputFactor;
      const chance = transform.chanceLevel ?? 0;
      if (!(chance >= 0 && chance < 1)) {
        throw new Error(`chanceLevel for ${benchmark.id} must be in [0, 1)`);
      }
      const corrected = (fraction - chance) / (1 - chance);
      return {
        p: clamp(corrected, epsilon, 1 - epsilon),
        derivative: inputFactor / (1 - chance),
      };
    }
    case "elo": {
      const scale = transform.scale ?? 400 / Math.LN10;
      assertPositive(scale, `Elo scale for ${benchmark.id}`);
      const probability = sigmoid((score - transform.eloRef) / scale);
      return {
        p: clamp(probability, epsilon, 1 - epsilon),
        derivative: (probability * (1 - probability)) / scale,
      };
    }
    case "metr": {
      const inputUnit = scoreUnit === "hours" || scoreUnit === "minutes" ? scoreUnit : transform.inputUnit;
      const minutes = inputUnit === "hours" ? score * 60 : score;
      const unitFactor = inputUnit === "hours" ? 60 : 1;
      assertPositive(minutes, `METR minutes for ${benchmark.id}`);
      const scale = transform.scale ?? 2;
      assertPositive(scale, `METR scale for ${benchmark.id}`);
      const probability = sigmoid((Math.log2(minutes) - (transform.centerLog2Minutes ?? 8)) / scale);
      return {
        p: clamp(probability, epsilon, 1 - epsilon),
        derivative: (probability * (1 - probability) * unitFactor) / (scale * Math.LN2 * minutes),
      };
    }
    case "vending": {
      const floor = transform.floor ?? 0;
      const shiftedHuman = transform.humanBaseline - floor;
      assertPositive(shiftedHuman, `Vending human baseline minus floor for ${benchmark.id}`);
      const shiftedScore = score - floor;
      if ((transform.mode ?? "fraction_of_human") === "logistic_ratio") {
        const safeScore = Math.max(shiftedScore, Number.EPSILON);
        const scale = transform.logScale ?? 1;
        const logBase = transform.logBase ?? Math.E;
        assertPositive(scale, `Vending log scale for ${benchmark.id}`);
        assertPositive(logBase, `Vending log base for ${benchmark.id}`);
        if (logBase === 1) throw new Error(`Vending log base for ${benchmark.id} cannot equal one`);
        const logDenominator = scale * Math.log(logBase);
        const probability = sigmoid((Math.log(safeScore) - Math.log(shiftedHuman)) / logDenominator);
        return {
          p: clamp(probability, epsilon, 1 - epsilon),
          derivative:
            shiftedScore > 0 ? (probability * (1 - probability)) / (logDenominator * safeScore) : 0,
        };
      }
      const denominator = Math.log1p(shiftedHuman);
      const nonnegativeScore = Math.max(0, shiftedScore);
      const probability = Math.log1p(nonnegativeScore) / denominator;
      return {
        p: clamp(probability, epsilon, 1 - epsilon),
        derivative: shiftedScore > 0 ? 1 / ((1 + shiftedScore) * denominator) : 0,
      };
    }
  }
}

export function normalizeResult(
  result: RawScoreResult,
  benchmark: BenchmarkDefinition,
): NormalizedObservation {
  if (!Number.isFinite(result.score)) {
    throw new Error(`Non-finite score for ${result.modelId}/${result.benchmarkId}`);
  }
  if (result.benchmarkId !== benchmark.id) {
    throw new Error(`Result benchmark ${result.benchmarkId} does not match ${benchmark.id}`);
  }

  const transformed = toProbability(result.score, benchmark, result.scoreUnit);
  const itemCount = result.nItems ?? benchmark.nItems;
  let normalizedSe: number;
  if (result.se !== undefined) {
    if (!(result.se >= 0) || !Number.isFinite(result.se)) {
      throw new Error(`Invalid standard error for ${result.modelId}/${result.benchmarkId}`);
    }
    normalizedSe = result.seOnNormalizedScale ? result.se : result.se * Math.abs(transformed.derivative);
  } else {
    if (benchmark.transform.kind !== "accuracy") {
      throw new Error(
        `Result ${result.modelId}/${benchmark.id} uses the ${benchmark.transform.kind} transform and requires a reported standard error`,
      );
    }
    if (itemCount === undefined) {
      throw new Error(
        `Accuracy result ${result.modelId}/${benchmark.id} requires either a reported standard error or positive nItems`,
      );
    }
    assertItemCount(itemCount, `Item count for ${benchmark.id}`);
    normalizedSe = Math.sqrt((transformed.p * (1 - transformed.p)) / itemCount);
  }

  const samplingVariance = (normalizedSe / (transformed.p * (1 - transformed.p))) ** 2;
  return {
    result,
    p: transformed.p,
    y: logit(transformed.p),
    normalizedSe,
    samplingVariance,
  };
}

function observationGroupKey(observation: NormalizedObservation): string {
  return `${observation.result.modelId}\u0000${observation.result.benchmarkId}`;
}

function rawResultGroupKey(result: RawScoreResult): string {
  return `${result.modelId}\u0000${result.benchmarkId}\u0000${resultConfigKey(result)}`;
}

/**
 * Random-effects method-of-moments estimate on the logit scale. Only genuinely
 * independent sources and groups with at least two distinct sources contribute.
 */
export function estimateHarnessVarianceDetails(
  observations: readonly NormalizedObservation[],
  priorStandardDeviation = 0.25,
  minimumPairs = 10,
): { variance: number; pairCount: number; usedPrior: boolean } {
  const groups = new Map<string, Map<string, NormalizedObservation>>();
  for (const observation of observations) {
    if (!isIndependentSource(observation.result.source)) continue;
    const key = observationGroupKey(observation);
    const bySource = groups.get(key) ?? new Map<string, NormalizedObservation>();
    const previous = bySource.get(observation.result.source.id);
    if (
      previous === undefined ||
      (observation.result.source.observedOn ?? "") > (previous.result.source.observedOn ?? "")
    ) {
      bySource.set(observation.result.source.id, observation);
    }
    groups.set(key, bySource);
  }

  const pairEstimates: number[] = [];
  for (const group of groups.values()) {
    const entries = [...group.values()];
    if (entries.length < 2) continue;
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const first = entries[left]!;
        const second = entries[right]!;
        pairEstimates.push(Math.max(0, ((first.y - second.y) ** 2 - first.samplingVariance - second.samplingVariance) / 2));
      }
    }
  }
  if (pairEstimates.length < minimumPairs) {
    return { variance: priorStandardDeviation ** 2, pairCount: pairEstimates.length, usedPrior: true };
  }
  return { variance: mean(pairEstimates), pairCount: pairEstimates.length, usedPrior: false };
}

export function estimateHarnessVariance(observations: readonly NormalizedObservation[]): number {
  return estimateHarnessVarianceDetails(observations).variance;
}

function resultId(result: RawScoreResult, index: number): string {
  return result.id ?? `${result.modelId}:${result.benchmarkId}:${result.source.id}:${index}`;
}

export interface PrepareCellsOptions {
  harnessVariance?: number;
  harnessResults?: readonly RawScoreResult[];
  harnessVariancePrior?: number;
  minimumHarnessPairs?: number;
  minLogitSe?: number;
}

export function prepareCells(
  results: readonly RawScoreResult[],
  benchmarks: readonly BenchmarkDefinition[],
  options: PrepareCellsOptions = {},
): PreparationResult {
  const benchmarkMap = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const rawGroups = new Map<string, Array<{ result: RawScoreResult; index: number }>>();
  results.forEach((result, index) => {
    if (!benchmarkMap.has(result.benchmarkId)) {
      throw new Error(`Unknown benchmark ${result.benchmarkId}`);
    }
    const key = rawResultGroupKey(result);
    const group = rawGroups.get(key) ?? [];
    group.push({ result, index });
    rawGroups.set(key, group);
  });

  const selectedGroups: Array<{
    group: Array<{ result: RawScoreResult; index: number }>;
    kept: Array<{ observation: NormalizedObservation; index: number }>;
  }> = [];
  const observations: NormalizedObservation[] = [];
  for (const group of rawGroups.values()) {
    const bestTier = Math.max(...group.map(({ result }) => provenanceTier(result.source)));
    const candidates = group.filter(({ result }) => provenanceTier(result.source) === bestTier);
    // Select provenance and source recency before normalization: a malformed
    // superseded mirror/self-report must not veto stronger usable evidence.
    const latestBySource = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      const sourceId = candidate.result.source.id;
      const previous = latestBySource.get(sourceId);
      if (
        previous === undefined ||
        (candidate.result.source.observedOn ?? "") > (previous.result.source.observedOn ?? "")
      ) {
        latestBySource.set(sourceId, candidate);
      }
    }
    const kept = [...latestBySource.values()].map(({ result, index }) => {
      const benchmark = benchmarkMap.get(result.benchmarkId);
      if (benchmark === undefined) throw new Error(`Unknown benchmark ${result.benchmarkId}`);
      const observation = normalizeResult(result, benchmark);
      observations.push(observation);
      return { observation, index };
    });
    selectedGroups.push({ group, kept });
  }
  const harnessObservations = options.harnessResults === undefined
    ? observations
    : options.harnessResults.flatMap((result) => {
        const definition = benchmarkMap.get(result.benchmarkId);
        if (!definition) return [];
        try { return [normalizeResult(result, definition)]; } catch { return []; }
      });
  const harnessEstimate = estimateHarnessVarianceDetails(
    harnessObservations,
    options.harnessVariancePrior ?? 0.25,
    options.minimumHarnessPairs ?? 10,
  );
  const harnessVariance = options.harnessVariance ?? harnessEstimate.variance;
  if (!(harnessVariance >= 0) || !Number.isFinite(harnessVariance)) {
    throw new Error(`Harness variance must be finite and non-negative, received ${harnessVariance}`);
  }

  const cells: PreparedCell[] = [];
  for (const { group, kept } of selectedGroups) {
    const bestTier = Math.max(...kept.map(({ observation }) => provenanceTier(observation.result.source)));
    const keptIndexes = new Set(kept.map(({ index }) => index));
    const precisionWeights = kept.map(({ observation }) => 1 / Math.max(observation.samplingVariance, 1e-12));
    const precisionSum = precisionWeights.reduce((sum, value) => sum + value, 0);
    const y = kept.reduce(
      (sum, { observation }, index) => sum + observation.y * (precisionWeights[index] ?? 0),
      0,
    ) / precisionSum;
    const samplingVariance = 1 / precisionSum;
    const first = kept[0];
    if (first === undefined) continue;
    const firstResult = first.observation.result;
    const keptResultIds = kept.map(({ observation, index }) => resultId(observation.result, index));
    const excludedResultIds = group
      .filter(({ index }) => !keptIndexes.has(index))
      .map(({ result, index }) => resultId(result, index));
    const sources = kept.map(({ observation }) => observation.result.source);
    cells.push({
      id: `${firstResult.modelId}:${firstResult.benchmarkId}:${resultConfigKey(firstResult)}`,
      modelId: firstResult.modelId,
      benchmarkId: firstResult.benchmarkId,
      configKey: resultConfigKey(firstResult),
      p: sigmoid(y),
      y,
      tau: Math.sqrt(Math.max(samplingVariance, (options.minLogitSe ?? 0.15) ** 2) + harnessVariance),
      samplingVariance,
      harnessVariance,
      provenanceTier: bestTier,
      keptResultIds,
      excludedResultIds,
      sourceIds: [...new Set(sources.map((source) => source.id))].sort(),
      independentSourceIds: [
        ...new Set(sources.filter(isIndependentSource).map((source) => source.id)),
      ].sort(),
      weightMultiplier: 1,
    });
  }

  cells.sort((left, right) => left.modelId.localeCompare(right.modelId) || left.benchmarkId.localeCompare(right.benchmarkId));
  return { cells, observations, harnessVariance, harnessPairCount: harnessEstimate.pairCount };
}
