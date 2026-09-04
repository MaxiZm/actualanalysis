import { reanchorFit } from "./anchor.js";
import { fitLatentModel } from "./fit.js";
import {
  createRandom,
  mean,
  quantile,
  randomNormal,
  rankDescending,
  sampleStandardDeviation,
  sigmoid,
} from "./math.js";
import type {
  BootstrapOptions,
  BootstrapResult,
  FitResult,
  ModelBootstrapSummary,
  PreparedCell,
} from "./types.js";

export function hierarchicalBootstrap(
  cells: readonly PreparedCell[],
  baseFit: FitResult,
  options: BootstrapOptions,
): BootstrapResult {
  const requestedIterations = options.iterations ?? 500;
  const confidenceLevel = options.confidenceLevel ?? 0.9;
  if (!Number.isInteger(requestedIterations) || requestedIterations < 1) {
    throw new Error("Bootstrap iterations must be a positive integer");
  }
  if (!(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new Error("Bootstrap confidence level must be between zero and one");
  }
  const minimumSuccessFraction = options.minimumSuccessFraction ?? 0.8;
  if (!(minimumSuccessFraction > 0 && minimumSuccessFraction <= 1)) {
    throw new Error("Bootstrap minimum success fraction must be in (0, 1]");
  }
  const random = createRandom(options.seed ?? 0x5eed);
  const effectiveCells = cells.filter(
    (cell) =>
      cell.weightMultiplier > 0 &&
      (options.fitOptions.benchmarkWeights?.[cell.benchmarkId] ?? 1) > 0,
  );
  const benchmarkIds = [...new Set(effectiveCells.map((cell) => cell.benchmarkId))].sort();
  if (benchmarkIds.length === 0) throw new Error("Cannot bootstrap an empty set of benchmarks");
  const modelIds = Object.keys(baseFit.capabilities).sort();
  const eligibleModelIds = (options.eligibleModelIds ?? modelIds).filter(
    (modelId) => baseFit.capabilities[modelId] !== undefined,
  );
  const samples = Object.fromEntries(modelIds.map((modelId) => [modelId, [] as number[]]));
  const rankSamples = Object.fromEntries(eligibleModelIds.map((modelId) => [modelId, [] as number[]]));
  const iterationSamples: Array<Record<string, number>> = [];
  const maximumAttempts = Math.ceil(requestedIterations / minimumSuccessFraction);
  let attemptedIterations = 0;
  let completedIterations = 0;
  let failedIterations = 0;
  const failureReasons: Record<string, number> = {};

  while (completedIterations < requestedIterations && attemptedIterations < maximumAttempts) {
    const iteration = attemptedIterations;
    attemptedIterations += 1;
    const sampledCells: PreparedCell[] = [];
    for (let draw = 0; draw < benchmarkIds.length; draw += 1) {
      const benchmarkIndex = Math.floor(random() * benchmarkIds.length);
      const benchmarkId = benchmarkIds[benchmarkIndex];
      if (benchmarkId === undefined) continue;
      for (const cell of effectiveCells) {
        if (cell.benchmarkId !== benchmarkId) continue;
        const y = cell.y + cell.tau * randomNormal(random);
        sampledCells.push({
          ...cell,
          id: `${cell.id}:bootstrap-${iteration}-${draw}`,
          y,
          p: sigmoid(y),
        });
      }
    }
    try {
      const sampledModelIds = [...new Set(sampledCells.map((cell) => cell.modelId))].sort();
      const sampledModelIdSet = new Set(sampledModelIds);
      for (const anchor of options.anchors ?? []) {
        if (!sampledModelIdSet.has(anchor.modelId)) {
          throw new Error(`Anchor model ${anchor.modelId} has no sampled cells`);
        }
      }
      const sampledBenchmarkIds = [...new Set(sampledCells.map((cell) => cell.benchmarkId))].sort();
      const originalReference = options.fitOptions.identification.referenceBenchmarkId;
      const referenceBenchmarkId = sampledBenchmarkIds.includes(originalReference)
        ? originalReference
        : sampledBenchmarkIds[0];
      if (referenceBenchmarkId === undefined) throw new Error("Bootstrap draw has no sampled benchmarks");
      const bootstrapFit = fitLatentModel(sampledCells, {
        ...options.fitOptions,
        identification: {
          ...options.fitOptions.identification,
          referenceBenchmarkId,
          ...(referenceBenchmarkId === originalReference
            ? {}
            : { referenceDifficulty: 0, referenceDiscrimination: 1 }),
        },
        modelIds: sampledModelIds,
        benchmarkIds: sampledBenchmarkIds,
        initial: {
          capabilities: baseFit.capabilities,
          difficulties: baseFit.difficulties,
          discriminations: baseFit.discriminations,
        },
      });
      if (!bootstrapFit.converged) {
        throw new Error(`Bootstrap fit did not converge after ${bootstrapFit.iterations} iterations`);
      }
      const anchored = reanchorFit(bootstrapFit, options.anchors).fit;
      const iterationValues: Record<string, number> = {};
      for (const [modelId, value] of Object.entries(anchored.capabilities)) {
        if (!Number.isFinite(value)) continue;
        samples[modelId]?.push(value);
        iterationValues[modelId] = value;
      }
      iterationSamples.push(iterationValues);
      completedIterations += 1;
      if (eligibleModelIds.every((modelId) => iterationValues[modelId] !== undefined)) {
        const eligibleValues = Object.fromEntries(
          eligibleModelIds.map((modelId) => [modelId, iterationValues[modelId] as number]),
        );
        const ranks = rankDescending(eligibleValues);
        for (const modelId of eligibleModelIds) {
          const rank = ranks[modelId];
          if (rank !== undefined) rankSamples[modelId]?.push(rank);
        }
      }
    } catch (error) {
      failedIterations += 1;
      const message = error instanceof Error ? error.message : String(error);
      const reason = message.includes("has no sampled cells")
        ? "missing_anchor"
        : message.includes("did not converge")
          ? "nonconverged_fit"
          : message.includes("ordering is inconsistent")
            ? "anchor_ordering"
            : message.includes("indistinguishable fitted capabilities")
              ? "indistinguishable_anchors"
              : "other";
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
    }
  }

  const successFraction = attemptedIterations === 0 ? 0 : completedIterations / attemptedIterations;
  if (completedIterations < requestedIterations || successFraction < minimumSuccessFraction) {
    throw new Error(
      `Unable to obtain ${requestedIterations} valid bootstrap replicates: ${completedIterations} succeeded in ${attemptedIterations} attempts (${failedIterations} failed; minimum success fraction ${minimumSuccessFraction}; failures ${JSON.stringify(failureReasons)})`,
    );
  }
  const tail = (1 - confidenceLevel) / 2;
  const anchorIds = new Set((options.anchors ?? []).map((anchor) => anchor.modelId));
  const modelSummaries: Record<string, ModelBootstrapSummary> = {};
  for (const modelId of modelIds) {
    const modelSamples = samples[modelId] ?? [];
    const modelRanks = rankSamples[modelId] ?? [];
    const anchored = anchorIds.has(modelId);
    const rankCdf = Array.from({ length: eligibleModelIds.length }, (_, index) => {
      if (modelRanks.length === 0) return 0;
      return modelRanks.filter((rank) => rank <= index + 1).length / modelRanks.length;
    });
    modelSummaries[modelId] = {
      modelId,
      samples: modelSamples,
      standardError: sampleStandardDeviation(modelSamples),
      ciLow: anchored || modelSamples.length === 0 ? null : quantile(modelSamples, tail),
      ciHigh: anchored || modelSamples.length === 0 ? null : quantile(modelSamples, 1 - tail),
      rankLow: modelRanks.length === 0 ? null : Math.floor(quantile(modelRanks, tail)),
      rankHigh: modelRanks.length === 0 ? null : Math.ceil(quantile(modelRanks, 1 - tail)),
      rankCdf,
    };
  }

  const pairwise: Record<string, Record<string, number>> = {};
  for (const firstId of eligibleModelIds) {
    pairwise[firstId] = {};
    for (const secondId of eligibleModelIds) {
      if (firstId === secondId) {
        pairwise[firstId]![secondId] = 0.5;
        continue;
      }
      let count = 0;
      let wins = 0;
      for (const iterationValues of iterationSamples) {
        const first = iterationValues[firstId];
        const second = iterationValues[secondId];
        if (first === undefined || second === undefined) continue;
        count += 1;
        wins += first > second ? 1 : first === second ? 0.5 : 0;
      }
      // No joint draw provides no ordering evidence; report the neutral
      // probability rather than leaking NaN into JSON artifacts.
      pairwise[firstId]![secondId] = count === 0 ? 0.5 : wins / count;
    }
  }

  const orderedEligible = [...eligibleModelIds].sort((left, right) => {
    const difference = mean(samples[right] ?? []) - mean(samples[left] ?? []);
    return difference === 0 ? left.localeCompare(right) : difference;
  });
  const ties: string[][] = [];
  let currentGroup: string[] = [];
  for (const modelId of orderedEligible) {
    const previous = currentGroup[currentGroup.length - 1];
    if (previous === undefined) {
      currentGroup = [modelId];
      continue;
    }
    const probability = pairwise[previous]?.[modelId] ?? 1;
    if (probability < 0.9) {
      currentGroup.push(modelId);
    } else {
      if (currentGroup.length > 1) ties.push(currentGroup);
      currentGroup = [modelId];
    }
  }
  if (currentGroup.length > 1) ties.push(currentGroup);

  return {
    requestedIterations,
    attemptedIterations,
    completedIterations,
    failedIterations,
    failureReasons,
    confidenceLevel,
    models: modelSummaries,
    pairwise,
    ties,
  };
}

export const bootstrapScores = hierarchicalBootstrap;
