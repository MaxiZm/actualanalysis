import { reanchorFit, validateAnchorEligibility } from "./anchor.js";
import { hierarchicalBootstrap } from "./bootstrap.js";
import { applyProvisionalShrinkage, computeCoverage } from "./coverage.js";
import {
  computeMeanWinRates,
  computePublicPrivateGaps,
  findPublicOutliers,
  leaveOneBenchmarkOut,
} from "./diagnostics.js";
import { fitLatentModel } from "./fit.js";
import { coerceScoringInput } from "./input.js";
import { rankDescending } from "./math.js";
import { prepareCells } from "./normalize.js";
import { computeBenchmarkWeights, weightMap } from "./weights.js";
import type {
  BenchmarkDefinition,
  DiagnosticFlag,
  FitOptions,
  IndexScore,
  ModelDefinition,
  PreparedCell,
  ScoringInput,
  ScoringRun,
} from "./types.js";

export function benchmarkBelongsToIndex(
  benchmark: BenchmarkDefinition,
  kind: ScoringInput["config"]["kind"],
): boolean {
  if (benchmark.status !== undefined && benchmark.status !== "active") return false;
  if (kind === "mixed") return benchmark.tags.includes("agentic") || benchmark.tags.includes("chat");
  return benchmark.tags.includes(kind);
}

function createFitOptions(
  input: ScoringInput,
  modelIds: string[],
  benchmarkIds: string[],
  benchmarkWeights?: Record<string, number>,
): FitOptions {
  const options: FitOptions = {
    identification: input.config.identification,
    modelIds,
    benchmarkIds,
  };
  if (benchmarkWeights !== undefined) options.benchmarkWeights = benchmarkWeights;
  if (input.config.huberDelta !== undefined) options.huberDelta = input.config.huberDelta;
  if (input.config.lambdaAlpha !== undefined) options.lambdaAlpha = input.config.lambdaAlpha;
  if (input.config.lambdaCapability !== undefined) options.lambdaCapability = input.config.lambdaCapability;
  if (input.config.lambdaDifficulty !== undefined) options.lambdaDifficulty = input.config.lambdaDifficulty;
  if (input.config.learningRate !== undefined) options.learningRate = input.config.learningRate;
  if (input.config.maxIterations !== undefined) options.maxIterations = input.config.maxIterations;
  if (input.config.tolerance !== undefined) options.tolerance = input.config.tolerance;
  if (input.config.fitMode === "eci_compatible") {
    options.loss = "squared";
    options.useCellNoise = false;
    delete options.benchmarkWeights;
  }
  return options;
}

function modelDefinitions(input: ScoringInput, modelIds: readonly string[]): ModelDefinition[] {
  const supplied = new Map((input.models ?? []).map((model) => [model.id, model]));
  return modelIds.map((modelId) => supplied.get(modelId) ?? { id: modelId });
}

function addFlag(target: Record<string, DiagnosticFlag[]>, flag: DiagnosticFlag): void {
  const flags = target[flag.modelId] ?? [];
  flags.push(flag);
  target[flag.modelId] = flags;
}

function requireConverged(fit: ReturnType<typeof fitLatentModel>, stage: string): void {
  if (fit.converged) return;
  throw new Error(
    `${stage} did not converge after ${fit.iterations} iterations (best objective ${fit.objective}; gradient infinity norm ${fit.gradientNorm}; max update ${fit.maximumUpdate})`,
  );
}

/** Complete ACI scoring pass: normalize, fit, weight, diagnose, bootstrap and gate. */
export function runScoring(input: ScoringInput): ScoringRun {
  if (/^1\.[234]\.\d+$/.test(input.config.methodVersion ?? "")) {
    throw new Error(`Method ${input.config.methodVersion} requires the joint NumPyro runner; the legacy per-index optimizer is disabled`);
  }
  const benchmarks = input.benchmarks.filter((benchmark) =>
    benchmarkBelongsToIndex(benchmark, input.config.kind),
  );
  if (benchmarks.length === 0) throw new Error(`No benchmarks belong to ${input.config.kind}`);
  const benchmarkIds = benchmarks.map((benchmark) => benchmark.id).sort();
  if (!benchmarkIds.includes(input.config.identification.referenceBenchmarkId)) {
    throw new Error(
      `Reference benchmark ${input.config.identification.referenceBenchmarkId} is not in the ${input.config.kind} index`,
    );
  }
  const benchmarkSet = new Set(benchmarkIds);
  const relevantResults = input.results.filter((result) => benchmarkSet.has(result.benchmarkId));
  const harnessResults = input.harnessResults?.filter((result) => benchmarkSet.has(result.benchmarkId));
  const preparation = prepareCells(relevantResults, benchmarks, {
    ...(harnessResults ? { harnessResults } : {}),
    ...(input.config.harnessVariancePrior === undefined ? {} : { harnessVariancePrior: input.config.harnessVariancePrior }),
    ...(input.config.minLogitSe === undefined ? {} : { minLogitSe: input.config.minLogitSe }),
  });
  if (preparation.cells.length === 0) throw new Error("No score cells remain after normalization");
  const modelIds = [...new Set(preparation.cells.map((cell) => cell.modelId))].sort();
  const baseOptions = createFitOptions(input, modelIds, benchmarkIds);

  const preliminaryFit = fitLatentModel(preparation.cells, baseOptions);
  requireConverged(preliminaryFit, "Preliminary scoring fit");
  const preliminaryWeights = computeBenchmarkWeights(benchmarks, preparation.cells, preliminaryFit, {
    ...(input.config.topModelCount === undefined ? {} : { topModelCount: input.config.topModelCount }),
    ...(input.config.saturationThreshold === undefined
      ? {}
      : { saturationThreshold: input.config.saturationThreshold }),
    ...(input.config.publicStaticFactor === undefined
      ? {}
      : { publicStaticFactor: input.config.publicStaticFactor }),
    ...(input.config.privateRollingFactor === undefined
      ? {}
      : { privateRollingFactor: input.config.privateRollingFactor }),
    ...(input.config.benchmarkWeightCaps === undefined
      ? {}
      : { weightCaps: input.config.benchmarkWeightCaps }),
    ...(input.config.maxBenchmarkShare === undefined ? {} : { maxShare: input.config.maxBenchmarkShare }),
  });
  const weightedOptions = createFitOptions(input, modelIds, benchmarkIds, weightMap(preliminaryWeights));
  const weightedFit = fitLatentModel(preparation.cells, {
    ...weightedOptions,
    initial: {
      capabilities: preliminaryFit.capabilities,
      difficulties: preliminaryFit.difficulties,
      discriminations: preliminaryFit.discriminations,
    },
  });
  requireConverged(weightedFit, "Weighted scoring fit");
  const initialOutliers =
    input.config.fitMode === "eci_compatible"
      ? []
      : findPublicOutliers(weightedFit, benchmarks, input.config.publicOutlierZThreshold ?? 3);
  const outlierIds = new Set(initialOutliers.map((cell) => cell.cellId));
  const adjustedCells: PreparedCell[] = preparation.cells.map((cell) =>
    outlierIds.has(cell.id)
      ? {
          ...cell,
          weightMultiplier: cell.weightMultiplier * (input.config.publicOutlierWeightFactor ?? 0.25),
        }
      : cell,
  );
  const finalWeights = computeBenchmarkWeights(benchmarks, adjustedCells, weightedFit, {
    ...(input.config.topModelCount === undefined ? {} : { topModelCount: input.config.topModelCount }),
    ...(input.config.saturationThreshold === undefined
      ? {}
      : { saturationThreshold: input.config.saturationThreshold }),
    ...(input.config.publicStaticFactor === undefined
      ? {}
      : { publicStaticFactor: input.config.publicStaticFactor }),
    ...(input.config.privateRollingFactor === undefined
      ? {}
      : { privateRollingFactor: input.config.privateRollingFactor }),
    ...(input.config.benchmarkWeightCaps === undefined
      ? {}
      : { weightCaps: input.config.benchmarkWeightCaps }),
    ...(input.config.maxBenchmarkShare === undefined ? {} : { maxShare: input.config.maxBenchmarkShare }),
  });
  const finalFitOptions = createFitOptions(input, modelIds, benchmarkIds, weightMap(finalWeights));
  const rawFinalFit = fitLatentModel(adjustedCells, {
    ...finalFitOptions,
    initial: {
      capabilities: weightedFit.capabilities,
      difficulties: weightedFit.difficulties,
      discriminations: weightedFit.discriminations,
    },
  });
  requireConverged(rawFinalFit, "Final scoring fit");
  validateAnchorEligibility(rawFinalFit.capabilities, adjustedCells, input.config.anchors ?? []);
  const anchored = reanchorFit(rawFinalFit, input.config.anchors);

  const coverage = computeCoverage(adjustedCells, benchmarks, modelIds, {
    ...(input.config.minBenchmarks === undefined ? {} : { minBenchmarks: input.config.minBenchmarks }),
    ...(input.config.minCategories === undefined ? {} : { minCategories: input.config.minCategories }),
    benchmarkWeights: weightMap(finalWeights),
  });
  const eligibleModelIds = modelIds.filter((modelId) => coverage[modelId]?.provisional === false);
  const bootstrap = hierarchicalBootstrap(adjustedCells, rawFinalFit, {
    iterations: input.config.bootstrapIterations ?? 500,
    confidenceLevel: input.config.bootstrapConfidenceLevel ?? 0.9,
    minimumSuccessFraction: input.config.bootstrapMinimumSuccessFraction ?? 0.8,
    seed: input.config.bootstrapSeed ?? `${input.config.kind}:${input.config.methodVersion ?? "1.0.0"}`,
    anchors: input.config.anchors ?? [],
    fitOptions: finalFitOptions,
    eligibleModelIds,
  });
  const bootstrapStandardErrors = Object.fromEntries(
    Object.entries(bootstrap.models).map(([modelId, summary]) => [modelId, summary.standardError]),
  );
  const loo = leaveOneBenchmarkOut(adjustedCells, anchored.fit, {
    fitOptions: finalFitOptions,
    anchors: input.config.anchors ?? [],
    initialFit: rawFinalFit,
    standardErrors: bootstrapStandardErrors,
    thresholdMultiplier: input.config.looSeMultiplier ?? 2,
  });
  const publicPrivateGaps = computePublicPrivateGaps(
    anchored.fit,
    benchmarks,
    input.config.publicPrivateGapThreshold ?? 1,
  );
  const meanWinRates = computeMeanWinRates(
    adjustedCells,
    anchored.fit.capabilities,
    input.config.ordinalRankGap ?? 3,
  );
  const definitions = modelDefinitions(input, modelIds);
  const provisionalEstimates = applyProvisionalShrinkage(
    anchored.fit.capabilities,
    coverage,
    definitions,
    bootstrap,
    {
      priorStrength: input.config.provisionalPriorStrength ?? 4,
      anchorModelIds: (input.config.anchors ?? []).map((anchor) => anchor.modelId),
      ...(input.config.provisionalCiMultiplier === undefined
        ? {}
        : { ciMultiplier: input.config.provisionalCiMultiplier }),
    },
  );

  const flagsByModel = Object.fromEntries(modelIds.map((modelId) => [modelId, [] as DiagnosticFlag[]]));
  for (const [modelId, gap] of Object.entries(publicPrivateGaps)) {
    if (gap.flagged) {
      addFlag(flagsByModel, {
        kind: "public_private_gap",
        modelId,
        ...(gap.gap === null ? {} : { value: gap.gap }),
        threshold: input.config.publicPrivateGapThreshold ?? 1,
        detail: `Public residuals exceed private/rolling residuals by ${(gap.gap ?? 0).toFixed(2)}σ`,
      });
    }
  }
  for (const [modelId, entry] of Object.entries(loo.models)) {
    if (entry.flagged) {
      addFlag(flagsByModel, {
        kind: "loo_sensitive",
        modelId,
        ...(entry.mostInfluentialBenchmarkId === null
          ? {}
          : { benchmarkId: entry.mostInfluentialBenchmarkId }),
        value: entry.maxAbsShift,
        threshold: (input.config.looSeMultiplier ?? 2) * (bootstrapStandardErrors[modelId] ?? 0),
        detail: `Removing one benchmark moves the score by up to ${entry.maxAbsShift.toFixed(2)}`,
      });
    }
  }
  for (const outlier of initialOutliers) {
    addFlag(flagsByModel, {
      kind: "public_outlier",
      modelId: outlier.modelId,
      benchmarkId: outlier.benchmarkId,
      value: outlier.z,
      threshold: input.config.publicOutlierZThreshold ?? 3,
      detail: `Public-static result is a +${outlier.z.toFixed(2)}σ residual; cell weight was cut to ${input.config.publicOutlierWeightFactor ?? 0.25}`,
    });
  }
  for (const [modelId, entry] of Object.entries(meanWinRates)) {
    if (entry.flagged) {
      addFlag(flagsByModel, {
        kind: "ordinal_disagreement",
        modelId,
        ...(entry.rankDifference === null ? {} : { value: entry.rankDifference }),
        threshold: input.config.ordinalRankGap ?? 3,
        detail: `Cardinal and mean-win-rate ranks differ by ${entry.rankDifference ?? 0} places`,
      });
    }
  }
  for (const [modelId, entry] of Object.entries(coverage)) {
    if (entry.provisional) {
      addFlag(flagsByModel, {
        kind: "provisional",
        modelId,
        value: entry.benchmarkCount,
        threshold: input.config.minBenchmarks ?? 4,
        detail: `${entry.benchmarkCount} benchmarks across ${entry.categoryCount} categories; fitted range is shown but the model is unranked`,
      });
    }
  }

  const rankedCapabilities = Object.fromEntries(
    eligibleModelIds.map((modelId) => [modelId, anchored.fit.capabilities[modelId] ?? 0]),
  );
  const ranks = rankDescending(rankedCapabilities);
  const scores: IndexScore[] = modelIds.map((modelId) => {
    const estimate = provisionalEstimates[modelId];
    const modelCoverage = coverage[modelId];
    const bootstrapSummary = bootstrap.models[modelId];
    const looEntry = loo.models[modelId];
    if (estimate === undefined || modelCoverage === undefined || bootstrapSummary === undefined || looEntry === undefined) {
      throw new Error(`Incomplete scoring output for ${modelId}`);
    }
    const robustScore = looEntry.robustScore;
    return {
      modelId,
      score: modelCoverage.provisional ? null : (anchored.fit.capabilities[modelId] ?? null),
      ciLow: estimate.ciLow,
      ciHigh: estimate.ciHigh,
      rank: modelCoverage.provisional ? null : (ranks[modelId] ?? null),
      rankLow: modelCoverage.provisional ? null : bootstrapSummary.rankLow,
      rankHigh: modelCoverage.provisional ? null : bootstrapSummary.rankHigh,
      coverage: modelCoverage.coverage,
      benchmarkCount: modelCoverage.benchmarkCount,
      privateCount: modelCoverage.privateCount,
      robustScore,
      provisional: modelCoverage.provisional,
      flags: flagsByModel[modelId] ?? [],
    };
  });
  scores.sort((left, right) => {
    if (left.rank === null && right.rank !== null) return 1;
    if (left.rank !== null && right.rank === null) return -1;
    return (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY) || left.modelId.localeCompare(right.modelId);
  });

  return {
    kind: input.config.kind,
    methodVersion: input.config.methodVersion ?? "1.0.0",
    harnessVariance: preparation.harnessVariance,
    harnessPairCount: preparation.harnessPairCount,
    fit: anchored.fit,
    anchorTransform: anchored.transform,
    benchmarkWeights: finalWeights,
    bootstrap,
    coverage,
    publicPrivateGaps,
    leaveOneOut: loo,
    meanWinRates,
    outlierCells: initialOutliers,
    scores,
    preparedCells: adjustedCells,
  };
}

/** Convenience entry point for running all three independently identified indexes. */
export function runAllIndexes(
  payload: unknown,
  kinds: readonly ScoringInput["config"]["kind"][] = ["mixed", "agentic", "chat"],
): Record<string, ScoringRun> {
  return Object.fromEntries(
    kinds.map((kind) => [kind, runScoring(coerceScoringInput(payload, kind))]),
  );
}

export const scoreIndex = runScoring;
