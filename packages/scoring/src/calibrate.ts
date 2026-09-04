import { clamp, huber, huberDerivative, mean } from "./math.js";
import type {
  CellFit,
  FixedCalibrationOptions,
  FixedCalibrationResult,
  PreparedCell,
} from "./types.js";

/**
 * Calibrate a newly added benchmark while freezing every existing capability.
 * This is the safe between-release path described by the methodology.
 */
export function calibrateNewBenchmark(
  cells: readonly PreparedCell[],
  frozenCapabilities: Record<string, number>,
  options: FixedCalibrationOptions = {},
): FixedCalibrationResult {
  const benchmarkIds = [...new Set(cells.map((cell) => cell.benchmarkId))];
  if (benchmarkIds.length !== 1 || benchmarkIds[0] === undefined) {
    throw new Error("Fixed calibration requires cells from exactly one benchmark");
  }
  const benchmarkId = benchmarkIds[0];
  const usableCells = cells.filter((cell) => frozenCapabilities[cell.modelId] !== undefined);
  if (usableCells.length < 2) throw new Error("Fixed calibration requires at least two anchored models");
  const frozenValues = usableCells.flatMap((cell) => {
    const value = frozenCapabilities[cell.modelId];
    return value === undefined ? [] : [value];
  });
  const minimumCapability = Math.min(...frozenValues);
  const maximumCapability = Math.max(...frozenValues);
  const capabilityRange = Math.max(1, maximumCapability - minimumCapability);
  const difficultyLowerBound = minimumCapability - 10 * capabilityRange;
  const difficultyUpperBound = maximumCapability + 10 * capabilityRange;
  const delta = options.huberDelta ?? 1.5;
  const lambdaAlpha = options.lambdaAlpha ?? 0.1;
  // Difficulty is not zero-centred after the public affine re-anchoring, so a
  // zero-centred D penalty would drag a valid ~100-scale calibration toward 0.
  const lambdaDifficulty = options.lambdaDifficulty ?? 0;
  const learningRate = options.learningRate ?? 0.01;
  const maxIterations = options.maxIterations ?? 5_000;
  const tolerance = options.tolerance ?? 1e-6;
  const capabilityMean = mean(frozenValues);
  const outcomeMean = mean(usableCells.map((cell) => cell.y));
  const capabilityVariance = usableCells.reduce((sum, cell) => {
    const capability = frozenCapabilities[cell.modelId] ?? capabilityMean;
    return sum + (capability - capabilityMean) ** 2;
  }, 0);
  const covariance = usableCells.reduce((sum, cell) => {
    const capability = frozenCapabilities[cell.modelId] ?? capabilityMean;
    return sum + (capability - capabilityMean) * (cell.y - outcomeMean);
  }, 0);
  const slopeEstimate = capabilityVariance > 0 ? Math.max(1e-4, covariance / capabilityVariance) : 1;
  const initialDiscrimination = options.initialDiscrimination ?? slopeEstimate;
  let difficulty = options.initialDifficulty ?? capabilityMean - outcomeMean / initialDiscrimination;
  let logDiscrimination = Math.log(initialDiscrimination);
  const firstMoment = [0, 0];
  const secondMoment = [0, 0];
  let best = { difficulty, logDiscrimination, objective: Number.POSITIVE_INFINITY };
  let stable = 0;
  let previousObjective = Number.POSITIVE_INFINITY;
  let converged = false;
  let iterations = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const discrimination = Math.exp(logDiscrimination);
    let objective = lambdaDifficulty * difficulty * difficulty + lambdaAlpha * logDiscrimination ** 2;
    let difficultyGradient = 2 * lambdaDifficulty * difficulty;
    let alphaGradient = 2 * lambdaAlpha * logDiscrimination;
    for (const cell of usableCells) {
      const capability = frozenCapabilities[cell.modelId];
      if (capability === undefined) continue;
      const predicted = discrimination * (capability - difficulty);
      const z = (cell.y - predicted) / cell.tau;
      const weight = cell.weightMultiplier;
      objective += weight * huber(z, delta);
      const predictionGradient = (-weight * huberDerivative(z, delta)) / cell.tau;
      difficultyGradient -= predictionGradient * discrimination;
      alphaGradient += predictionGradient * predicted;
    }
    if (objective < best.objective) best = { difficulty, logDiscrimination, objective };
    const gradients = [difficultyGradient, alphaGradient];
    let maximumUpdate = 0;
    for (let index = 0; index < 2; index += 1) {
      const gradient = gradients[index] ?? 0;
      firstMoment[index] = 0.9 * (firstMoment[index] ?? 0) + 0.1 * gradient;
      secondMoment[index] = 0.999 * (secondMoment[index] ?? 0) + 0.001 * gradient * gradient;
      const first = (firstMoment[index] ?? 0) / (1 - 0.9 ** iteration);
      const second = (secondMoment[index] ?? 0) / (1 - 0.999 ** iteration);
      const update = (learningRate * first) / (Math.sqrt(second) + 1e-8);
      maximumUpdate = Math.max(maximumUpdate, Math.abs(update));
      if (index === 0) difficulty -= update;
      else logDiscrimination -= update;
    }
    difficulty = clamp(difficulty, difficultyLowerBound, difficultyUpperBound);
    logDiscrimination = clamp(logDiscrimination, -12, 8);
    const relativeChange =
      Number.isFinite(previousObjective)
        ? Math.abs(previousObjective - objective) / Math.max(1, Math.abs(previousObjective))
        : Number.POSITIVE_INFINITY;
    stable = relativeChange < tolerance || maximumUpdate < tolerance ? stable + 1 : 0;
    previousObjective = objective;
    iterations = iteration;
    if (iteration >= 100 && stable >= 20) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    throw new Error(
      `Fixed calibration for ${benchmarkId} did not converge after ${iterations} iterations (best objective ${best.objective})`,
    );
  }
  const discrimination = Math.exp(best.logDiscrimination);
  const fittedCells: CellFit[] = usableCells.map((cell) => {
    const capability = frozenCapabilities[cell.modelId];
    if (capability === undefined) throw new Error(`Missing capability for ${cell.modelId}`);
    const predicted = discrimination * (capability - best.difficulty);
    return {
      cellId: cell.id,
      modelId: cell.modelId,
      benchmarkId,
      y: cell.y,
      predicted,
      residual: cell.y - predicted,
      z: (cell.y - predicted) / cell.tau,
      weight: cell.weightMultiplier,
    };
  });
  return {
    benchmarkId,
    difficulty: best.difficulty,
    discrimination,
    objective: best.objective,
    iterations,
    converged,
    cells: fittedCells,
  };
}
