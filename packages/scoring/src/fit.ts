import { assertPositive, clamp, huber, huberDerivative, mean } from "./math.js";
import type { CellFit, FitOptions, FitResult, PreparedCell } from "./types.js";

interface ParameterLayout {
  modelIds: string[];
  benchmarkIds: string[];
  modelIndex: Map<string, number>;
  difficultyIndex: Map<string, number>;
  logDiscriminationIndex: Map<string, number>;
  parameterCount: number;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function createLayout(cells: readonly PreparedCell[], options: FitOptions): ParameterLayout {
  const modelIds = uniqueSorted([
    ...cells.map((cell) => cell.modelId),
    ...(options.modelIds ?? []),
  ]);
  const benchmarkIds = uniqueSorted([
    ...cells.map((cell) => cell.benchmarkId),
    ...(options.benchmarkIds ?? []),
    options.identification.referenceBenchmarkId,
  ]);
  if (modelIds.length === 0) throw new Error("Cannot fit a latent model with no models");
  if (benchmarkIds.length === 0) throw new Error("Cannot fit a latent model with no benchmarks");

  const modelIndex = new Map(modelIds.map((id, index) => [id, index]));
  let nextIndex = modelIds.length;
  const difficultyIndex = new Map<string, number>();
  const logDiscriminationIndex = new Map<string, number>();
  for (const benchmarkId of benchmarkIds) {
    if (benchmarkId === options.identification.referenceBenchmarkId) continue;
    difficultyIndex.set(benchmarkId, nextIndex);
    nextIndex += 1;
    logDiscriminationIndex.set(benchmarkId, nextIndex);
    nextIndex += 1;
  }
  return {
    modelIds,
    benchmarkIds,
    modelIndex,
    difficultyIndex,
    logDiscriminationIndex,
    parameterCount: nextIndex,
  };
}

function arrayValue(values: readonly number[], index: number, label: string): number {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing ${label} parameter at index ${index}`);
  return value;
}

function mapIndex(map: Map<string, number>, id: string, label: string): number {
  const index = map.get(id);
  if (index === undefined) throw new Error(`Unknown ${label} id ${id}`);
  return index;
}

function parameterValues(
  parameters: readonly number[],
  layout: ParameterLayout,
  options: FitOptions,
  modelId: string,
  benchmarkId: string,
): { capability: number; difficulty: number; discrimination: number } {
  const capability = arrayValue(parameters, mapIndex(layout.modelIndex, modelId, "model"), "capability");
  if (benchmarkId === options.identification.referenceBenchmarkId) {
    return {
      capability,
      difficulty: options.identification.referenceDifficulty ?? 0,
      discrimination: options.identification.referenceDiscrimination ?? 1,
    };
  }
  const difficulty = arrayValue(
    parameters,
    mapIndex(layout.difficultyIndex, benchmarkId, "benchmark difficulty"),
    "difficulty",
  );
  const logDiscrimination = arrayValue(
    parameters,
    mapIndex(layout.logDiscriminationIndex, benchmarkId, "benchmark discrimination"),
    "log-discrimination",
  );
  return { capability, difficulty, discrimination: Math.exp(logDiscrimination) };
}

function initializeParameters(
  cells: readonly PreparedCell[],
  layout: ParameterLayout,
  options: FitOptions,
): number[] {
  const parameters = new Array<number>(layout.parameterCount).fill(0);
  const referenceId = options.identification.referenceBenchmarkId;
  const referenceDifficulty = options.identification.referenceDifficulty ?? 0;
  const referenceDiscrimination = options.identification.referenceDiscrimination ?? 1;
  assertPositive(referenceDiscrimination, "Reference discrimination");

  for (const modelId of layout.modelIds) {
    const modelCells = cells.filter((cell) => cell.modelId === modelId && cell.weightMultiplier > 0);
    const referenceCells = modelCells.filter((cell) => cell.benchmarkId === referenceId);
    const estimated =
      referenceCells.length > 0
        ? referenceDifficulty + mean(referenceCells.map((cell) => cell.y)) / referenceDiscrimination
        : modelCells.length > 0
          ? mean(modelCells.map((cell) => cell.y))
          : 0;
    const initial = options.initial?.capabilities?.[modelId] ?? estimated;
    parameters[mapIndex(layout.modelIndex, modelId, "model")] = clamp(initial, -20, 20);
  }

  for (const benchmarkId of layout.benchmarkIds) {
    if (benchmarkId === referenceId) continue;
    const benchmarkCells = cells.filter(
      (cell) => cell.benchmarkId === benchmarkId && cell.weightMultiplier > 0,
    );
    const difficultyEstimate =
      benchmarkCells.length > 0
        ? mean(
            benchmarkCells.map((cell) => {
              const capability = parameters[mapIndex(layout.modelIndex, cell.modelId, "model")] ?? 0;
              return capability - cell.y;
            }),
          )
        : 0;
    const difficulty = options.initial?.difficulties?.[benchmarkId] ?? difficultyEstimate;
    const discrimination = options.initial?.discriminations?.[benchmarkId] ?? 1;
    assertPositive(discrimination, `Initial discrimination for ${benchmarkId}`);
    parameters[mapIndex(layout.difficultyIndex, benchmarkId, "benchmark difficulty")] = clamp(
      difficulty,
      -20,
      20,
    );
    parameters[mapIndex(layout.logDiscriminationIndex, benchmarkId, "benchmark discrimination")] = clamp(
      Math.log(discrimination),
      -4,
      4,
    );
  }
  return parameters;
}

interface ObjectiveGradient {
  objective: number;
  gradient: number[];
}

function objectiveAndGradient(
  parameters: readonly number[],
  cells: readonly PreparedCell[],
  layout: ParameterLayout,
  options: FitOptions,
): ObjectiveGradient {
  const gradient = new Array<number>(parameters.length).fill(0);
  const delta = options.huberDelta ?? 1.5;
  const lossKind = options.loss ?? "huber";
  const useCellNoise = options.useCellNoise ?? true;
  const lambdaAlpha = options.lambdaAlpha ?? 0.1;
  const lambdaCapability = options.lambdaCapability ?? 0.1;
  const lambdaDifficulty = options.lambdaDifficulty ?? 0.1;
  assertPositive(delta, "Huber delta");
  let objective = 0;

  for (const cell of cells) {
    assertPositive(cell.tau, `Cell noise for ${cell.id}`);
    const benchmarkWeight = options.benchmarkWeights?.[cell.benchmarkId] ?? 1;
    const weight = benchmarkWeight * cell.weightMultiplier;
    if (!(weight > 0)) continue;
    const values = parameterValues(parameters, layout, options, cell.modelId, cell.benchmarkId);
    const predicted = values.discrimination * (values.capability - values.difficulty);
    const residualScale = useCellNoise ? cell.tau : 1;
    const standardizedResidual = (cell.y - predicted) / residualScale;
    objective +=
      weight *
      (lossKind === "squared"
        ? 0.5 * standardizedResidual * standardizedResidual
        : huber(standardizedResidual, delta));
    const lossDerivative =
      lossKind === "squared"
        ? standardizedResidual
        : huberDerivative(standardizedResidual, delta);
    const predictionGradient = (-weight * lossDerivative) / residualScale;
    const capabilityIndex = mapIndex(layout.modelIndex, cell.modelId, "model");
    gradient[capabilityIndex] =
      (gradient[capabilityIndex] ?? 0) + predictionGradient * values.discrimination;
    if (cell.benchmarkId !== options.identification.referenceBenchmarkId) {
      const difficultyIndex = mapIndex(layout.difficultyIndex, cell.benchmarkId, "benchmark difficulty");
      const logAlphaIndex = mapIndex(
        layout.logDiscriminationIndex,
        cell.benchmarkId,
        "benchmark discrimination",
      );
      gradient[difficultyIndex] =
        (gradient[difficultyIndex] ?? 0) - predictionGradient * values.discrimination;
      gradient[logAlphaIndex] = (gradient[logAlphaIndex] ?? 0) + predictionGradient * predicted;
    }
  }

  for (const modelId of layout.modelIds) {
    const index = mapIndex(layout.modelIndex, modelId, "model");
    const value = arrayValue(parameters, index, "capability");
    objective += lambdaCapability * value * value;
    gradient[index] = (gradient[index] ?? 0) + 2 * lambdaCapability * value;
  }
  for (const benchmarkId of layout.benchmarkIds) {
    if (benchmarkId === options.identification.referenceBenchmarkId) continue;
    const difficultyIndex = mapIndex(layout.difficultyIndex, benchmarkId, "benchmark difficulty");
    const logAlphaIndex = mapIndex(
      layout.logDiscriminationIndex,
      benchmarkId,
      "benchmark discrimination",
    );
    const difficulty = arrayValue(parameters, difficultyIndex, "difficulty");
    const logAlpha = arrayValue(parameters, logAlphaIndex, "log-discrimination");
    objective += lambdaDifficulty * difficulty * difficulty + lambdaAlpha * logAlpha * logAlpha;
    gradient[difficultyIndex] = (gradient[difficultyIndex] ?? 0) + 2 * lambdaDifficulty * difficulty;
    gradient[logAlphaIndex] = (gradient[logAlphaIndex] ?? 0) + 2 * lambdaAlpha * logAlpha;
  }

  return { objective, gradient };
}

function materializeResult(
  parameters: readonly number[],
  cells: readonly PreparedCell[],
  layout: ParameterLayout,
  options: FitOptions,
  objective: number,
  iterations: number,
  converged: boolean,
  gradientNorm: number,
  maximumUpdate: number,
): FitResult {
  const capabilities: Record<string, number> = {};
  const difficulties: Record<string, number> = {};
  const discriminations: Record<string, number> = {};
  for (const modelId of layout.modelIds) {
    capabilities[modelId] = arrayValue(
      parameters,
      mapIndex(layout.modelIndex, modelId, "model"),
      "capability",
    );
  }
  for (const benchmarkId of layout.benchmarkIds) {
    if (benchmarkId === options.identification.referenceBenchmarkId) {
      difficulties[benchmarkId] = options.identification.referenceDifficulty ?? 0;
      discriminations[benchmarkId] = options.identification.referenceDiscrimination ?? 1;
    } else {
      difficulties[benchmarkId] = arrayValue(
        parameters,
        mapIndex(layout.difficultyIndex, benchmarkId, "benchmark difficulty"),
        "difficulty",
      );
      discriminations[benchmarkId] = Math.exp(
        arrayValue(
          parameters,
          mapIndex(layout.logDiscriminationIndex, benchmarkId, "benchmark discrimination"),
          "log-discrimination",
        ),
      );
    }
  }
  const residualRows = cells.map((cell) => {
    const capability = capabilities[cell.modelId];
    const difficulty = difficulties[cell.benchmarkId];
    const discrimination = discriminations[cell.benchmarkId];
    if (capability === undefined || difficulty === undefined || discrimination === undefined) {
      throw new Error(`Missing fitted parameter for cell ${cell.id}`);
    }
    const predicted = discrimination * (capability - difficulty);
    return { cell, capability, difficulty, discrimination, predicted, residual: cell.y - predicted };
  });
  const fittedCells: CellFit[] = residualRows.map(({ cell, predicted, residual }) => {
    const peers = residualRows.filter((row) => row.cell.benchmarkId === cell.benchmarkId && row.cell.id !== cell.id);
    const peerMean = peers.length ? mean(peers.map((row) => row.residual)) : 0;
    const benchmarkVariance = peers.length > 1
      ? peers.reduce((sum, row) => sum + (row.residual - peerMean) ** 2, 0) / (peers.length - 1)
      : 0;
    return {
      cellId: cell.id,
      modelId: cell.modelId,
      benchmarkId: cell.benchmarkId,
      y: cell.y,
      predicted,
      residual,
      z: residual / Math.sqrt(cell.tau ** 2 + benchmarkVariance),
      weight: (options.benchmarkWeights?.[cell.benchmarkId] ?? 1) * cell.weightMultiplier,
    };
  });
  return {
    capabilities,
    difficulties,
    discriminations,
    cells: fittedCells,
    objective,
    iterations,
    converged,
    gradientNorm,
    maximumUpdate,
    referenceBenchmarkId: options.identification.referenceBenchmarkId,
  };
}

/** Robust 2PL fit on logit-normalized observations using bounded Adam. */
export function fitLatentModel(cells: readonly PreparedCell[], options: FitOptions): FitResult {
  const layout = createLayout(cells, options);
  let parameters = initializeParameters(cells, layout, options);
  const firstMoment = new Array<number>(parameters.length).fill(0);
  const secondMoment = new Array<number>(parameters.length).fill(0);
  // A 0.03 step oscillates on sparse fits with heterogeneous cell variances.
  // The lower default retains Adam's fast start while allowing its convergence
  // test to settle on the production-shaped sparse fixture.
  const learningRate = options.learningRate ?? 0.02;
  const maxIterations = options.maxIterations ?? 20_000;
  const tolerance = options.tolerance ?? 1e-4;
  const minIterations = options.minIterations ?? 300;
  assertPositive(learningRate, "Learning rate");
  assertPositive(maxIterations, "Maximum iterations");
  assertPositive(tolerance, "Convergence tolerance");

  const beta1 = 0.9;
  const beta2 = 0.999;
  const epsilon = 1e-8;
  let bestParameters = [...parameters];
  let bestObjective = Number.POSITIVE_INFINITY;
  let stableIterations = 0;
  let converged = false;
  let completedIterations = 0;
  let finalMaximumUpdate = Number.POSITIVE_INFINITY;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const evaluation = objectiveAndGradient(parameters, cells, layout, options);
    if (!Number.isFinite(evaluation.objective)) {
      throw new Error(`Non-finite objective at iteration ${iteration}`);
    }
    if (evaluation.objective < bestObjective) {
      bestObjective = evaluation.objective;
      bestParameters = [...parameters];
    }

    const gradientNorm = Math.sqrt(
      evaluation.gradient.reduce((sum, value) => sum + value * value, 0),
    );
    const gradientScale = gradientNorm > 1_000 ? 1_000 / gradientNorm : 1;
    let maximumUpdate = 0;
    const progress = maxIterations <= 1 ? 1 : (iteration - 1) / (maxIterations - 1);
    // Decay almost to zero so Adam can actually settle under the publication
    // gate instead of orbiting the optimum at a non-trivial step size.
    const minimumLearningRate = 1e-6;
    const decayedLearningRate = minimumLearningRate
      + (learningRate - minimumLearningRate) * 0.5 * (1 + Math.cos(Math.PI * progress));
    for (let index = 0; index < parameters.length; index += 1) {
      const gradient = (evaluation.gradient[index] ?? 0) * gradientScale;
      firstMoment[index] = beta1 * (firstMoment[index] ?? 0) + (1 - beta1) * gradient;
      secondMoment[index] = beta2 * (secondMoment[index] ?? 0) + (1 - beta2) * gradient * gradient;
      const correctedFirst = (firstMoment[index] ?? 0) / (1 - beta1 ** iteration);
      const correctedSecond = (secondMoment[index] ?? 0) / (1 - beta2 ** iteration);
      const update = (decayedLearningRate * correctedFirst) / (Math.sqrt(correctedSecond) + epsilon);
      maximumUpdate = Math.max(maximumUpdate, Math.abs(update));
      parameters[index] = (parameters[index] ?? 0) - update;
    }

    for (const modelId of layout.modelIds) {
      const index = mapIndex(layout.modelIndex, modelId, "model");
      parameters[index] = clamp(parameters[index] ?? 0, -30, 30);
    }
    for (const benchmarkId of layout.benchmarkIds) {
      if (benchmarkId === options.identification.referenceBenchmarkId) continue;
      const difficultyIndex = mapIndex(layout.difficultyIndex, benchmarkId, "benchmark difficulty");
      const logAlphaIndex = mapIndex(
        layout.logDiscriminationIndex,
        benchmarkId,
        "benchmark discrimination",
      );
      parameters[difficultyIndex] = clamp(parameters[difficultyIndex] ?? 0, -30, 30);
      parameters[logAlphaIndex] = clamp(parameters[logAlphaIndex] ?? 0, -4, 4);
    }

    const gradientInfinityNorm = Math.max(...evaluation.gradient.map(Math.abs));
    stableIterations = gradientInfinityNorm < 1e-4 && maximumUpdate < 1e-5 ? stableIterations + 1 : 0;
    completedIterations = iteration;
    finalMaximumUpdate = maximumUpdate;
    if (iteration >= minIterations && stableIterations >= 20) {
      converged = true;
      break;
    }
  }

  const finalEvaluation = objectiveAndGradient(parameters, cells, layout, options);
  if (finalEvaluation.objective < bestObjective) {
    bestObjective = finalEvaluation.objective;
    bestParameters = [...parameters];
  }
  const finalGradientNorm = Math.max(...finalEvaluation.gradient.map(Math.abs));
  return materializeResult(
    bestParameters,
    cells,
    layout,
    options,
    bestObjective,
    completedIterations,
    converged,
    finalGradientNorm,
    finalMaximumUpdate,
  );
}

export const fit2PL = fitLatentModel;

/**
 * Compatibility path for ordering comparisons with Epoch's ECI implementation:
 * equal cell/benchmark weights and ordinary squared residuals without τ scaling.
 * This remains logit-scale 2PL, so the cross-check is intentionally an ordering
 * gate rather than a numeric-parameter equality claim.
 */
export function fitEciCompatible(
  cells: readonly PreparedCell[],
  options: FitOptions,
): FitResult {
  return fitLatentModel(
    cells.map((cell) => ({ ...cell, weightMultiplier: 1 })),
    {
      ...options,
      benchmarkWeights: Object.fromEntries(
        [...new Set(cells.map((cell) => cell.benchmarkId))].map((benchmarkId) => [benchmarkId, 1]),
      ),
      loss: "squared",
      useCellNoise: false,
    },
  );
}
