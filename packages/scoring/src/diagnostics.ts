import { reanchorFit } from "./anchor.js";
import { fitLatentModel } from "./fit.js";
import { mean, median, rankDescending } from "./math.js";
import type {
  AnchorDefinition,
  BenchmarkDefinition,
  CellFit,
  FitOptions,
  FitResult,
  LeaveOneOutResult,
  MeanWinRateEntry,
  PreparedCell,
  PublicPrivateGap,
} from "./types.js";

function benchmarkMap(benchmarks: readonly BenchmarkDefinition[]): Map<string, BenchmarkDefinition> {
  return new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
}

export function computePublicPrivateGaps(
  fit: FitResult,
  benchmarks: readonly BenchmarkDefinition[],
  threshold = 1,
  minimumPrivateBenchmarks = 2,
  minimumPublicBenchmarks = 2,
): Record<string, PublicPrivateGap> {
  const definitions = benchmarkMap(benchmarks);
  const result: Record<string, PublicPrivateGap> = {};
  for (const modelId of Object.keys(fit.capabilities)) {
    const modelCells = fit.cells.filter((cell) => cell.modelId === modelId);
    const publicCells = modelCells.filter((cell) => {
      const holdout = definitions.get(cell.benchmarkId)?.holdout;
      return holdout === "public";
    });
    const privateCells = modelCells.filter((cell) => {
      const holdout = definitions.get(cell.benchmarkId)?.holdout;
      return holdout === "semi_private" || holdout === "private" || holdout === "rolling";
    });
    const privateBenchmarks = new Set(privateCells.map((cell) => cell.benchmarkId)).size;
    const publicBenchmarks = new Set(publicCells.map((cell) => cell.benchmarkId)).size;
    const publicMeanZ = publicCells.length === 0 ? null : mean(publicCells.map((cell) => cell.z));
    const privateMeanZ = privateCells.length === 0 ? null : mean(privateCells.map((cell) => cell.z));
    const gap = publicMeanZ === null || privateMeanZ === null ? null : publicMeanZ - privateMeanZ;
    result[modelId] = {
      modelId,
      publicMeanZ,
      privateMeanZ,
      gap,
      publicCount: publicBenchmarks,
      privateCount: privateBenchmarks,
      flagged: gap !== null && gap > threshold && privateBenchmarks >= minimumPrivateBenchmarks && publicBenchmarks >= minimumPublicBenchmarks,
    };
  }
  return result;
}

export function findPublicOutliers(
  fit: FitResult,
  benchmarks: readonly BenchmarkDefinition[],
  threshold = 3,
): CellFit[] {
  const definitions = benchmarkMap(benchmarks);
  return fit.cells.filter(
    (cell) => definitions.get(cell.benchmarkId)?.holdout === "public" && cell.z > threshold,
  );
}

export interface LeaveOneOutOptions {
  fitOptions: FitOptions;
  anchors?: AnchorDefinition[];
  initialFit?: FitResult;
  standardErrors?: Record<string, number>;
  thresholdMultiplier?: number;
}

export function leaveOneBenchmarkOut(
  cells: readonly PreparedCell[],
  baseFit: FitResult,
  options: LeaveOneOutOptions,
): LeaveOneOutResult {
  const benchmarkIds = [...new Set(cells.map((cell) => cell.benchmarkId))].sort();
  const fits: Record<string, FitResult> = {};
  const comparisonAnchors =
    options.anchors !== undefined && options.anchors.length > 0
      ? options.anchors
      : Object.entries(baseFit.capabilities).map(([modelId, value]) => ({ modelId, value }));
  for (const omittedBenchmarkId of benchmarkIds) {
    const reducedCells = cells.filter(
      (cell) =>
        cell.benchmarkId !== omittedBenchmarkId
        && cell.weightMultiplier > 0
        && (options.fitOptions.benchmarkWeights?.[cell.benchmarkId] ?? 1) > 0,
    );
    if (reducedCells.length === 0) continue;
    const remainingModelIds = [...new Set(reducedCells.map((cell) => cell.modelId))].sort();
    const remainingModelIdSet = new Set(remainingModelIds);
    // A data-free anchor would recreate the zero-cell failure mode fixed in
    // bootstrap and can arbitrarily rescale every LOO score. This omission has
    // no defensible anchored comparison, so leave it out of the robust median.
    if (comparisonAnchors.some((anchor) => !remainingModelIdSet.has(anchor.modelId))) continue;
    const remainingBenchmarkIds = [...new Set(reducedCells.map((cell) => cell.benchmarkId))].sort();
    const originalReference = options.fitOptions.identification.referenceBenchmarkId;
    const referenceBenchmarkId = remainingBenchmarkIds.includes(originalReference)
      ? originalReference
      : remainingBenchmarkIds[0];
    if (referenceBenchmarkId === undefined) continue;
    const rawFit = fitLatentModel(reducedCells, {
      ...options.fitOptions,
      identification: {
        ...options.fitOptions.identification,
        referenceBenchmarkId,
        ...(referenceBenchmarkId === originalReference
          ? {}
          : { referenceDifficulty: 0, referenceDiscrimination: 1 }),
      },
      modelIds: remainingModelIds,
      benchmarkIds: remainingBenchmarkIds,
      initial: {
        capabilities: options.initialFit?.capabilities ?? baseFit.capabilities,
        difficulties: options.initialFit?.difficulties ?? baseFit.difficulties,
        discriminations: options.initialFit?.discriminations ?? baseFit.discriminations,
      },
    });
    if (!rawFit.converged) {
      throw new Error(
        `Leave-one-benchmark-out fit excluding ${omittedBenchmarkId} did not converge after ${rawFit.iterations} iterations (best objective ${rawFit.objective})`,
      );
    }
    fits[omittedBenchmarkId] = reanchorFit(rawFit, comparisonAnchors).fit;
  }

  const models: LeaveOneOutResult["models"] = {};
  for (const [modelId, headlineScore] of Object.entries(baseFit.capabilities)) {
    const scores: Array<{ benchmarkId: string; score: number }> = [];
    for (const [benchmarkId, fit] of Object.entries(fits)) {
      const score = fit.capabilities[modelId];
      if (score !== undefined) scores.push({ benchmarkId, score });
    }
    const shifts = Object.fromEntries(
      scores.map(({ benchmarkId, score }) => [benchmarkId, score - headlineScore]),
    );
    const mostInfluential = [...scores].sort(
      (left, right) => Math.abs(right.score - headlineScore) - Math.abs(left.score - headlineScore),
    )[0];
    const maxAbsShift = mostInfluential === undefined ? 0 : Math.abs(mostInfluential.score - headlineScore);
    const standardError = options.standardErrors?.[modelId] ?? Number.POSITIVE_INFINITY;
    const thresholdMultiplier = options.thresholdMultiplier ?? 2;
    models[modelId] = {
      modelId,
      headlineScore,
      robustScore: scores.length === 0 ? headlineScore : median(scores.map(({ score }) => score)),
      maxAbsShift,
      mostInfluentialBenchmarkId: mostInfluential?.benchmarkId ?? null,
      shifts,
      flagged: maxAbsShift > thresholdMultiplier * standardError,
    };
  }
  return { fits, models };
}

export function computeMeanWinRates(
  cells: readonly PreparedCell[],
  cardinalCapabilities?: Record<string, number>,
  disagreementThreshold = 3,
): Record<string, MeanWinRateEntry> {
  const byBenchmark = new Map<string, Map<string, number[]>>();
  for (const cell of cells) {
    const byModel = byBenchmark.get(cell.benchmarkId) ?? new Map<string, number[]>();
    const values = byModel.get(cell.modelId) ?? [];
    values.push(cell.y);
    byModel.set(cell.modelId, values);
    byBenchmark.set(cell.benchmarkId, byModel);
  }

  const perModel = new Map<string, number[]>();
  for (const byModel of byBenchmark.values()) {
    const entries = [...byModel.entries()].map(([modelId, values]) => [modelId, mean(values)] as const);
    if (entries.length < 2) continue;
    for (const [modelId, value] of entries) {
      let wins = 0;
      for (const [opponentId, opponentValue] of entries) {
        if (opponentId === modelId) continue;
        wins += value > opponentValue ? 1 : value === opponentValue ? 0.5 : 0;
      }
      const rates = perModel.get(modelId) ?? [];
      rates.push(wins / (entries.length - 1));
      perModel.set(modelId, rates);
    }
  }
  const rates = Object.fromEntries(
    [...perModel.entries()].map(([modelId, values]) => [modelId, mean(values)]),
  );
  const ordinalRanks = rankDescending(rates);
  const cardinalRanks = cardinalCapabilities === undefined ? {} : rankDescending(cardinalCapabilities);
  const result: Record<string, MeanWinRateEntry> = {};
  for (const [modelId, meanWinRate] of Object.entries(rates)) {
    const cardinalRank = cardinalRanks[modelId] ?? null;
    const rank = ordinalRanks[modelId] ?? 0;
    const rankDifference = cardinalRank === null ? null : Math.abs(rank - cardinalRank);
    result[modelId] = {
      modelId,
      meanWinRate,
      benchmarksCompared: perModel.get(modelId)?.length ?? 0,
      rank,
      cardinalRank,
      rankDifference,
      flagged: rankDifference !== null && rankDifference > disagreementThreshold,
    };
  }
  return result;
}
