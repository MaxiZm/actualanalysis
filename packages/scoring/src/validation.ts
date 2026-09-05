import type { Aci12PosteriorOutput } from "./numpyro.js";

export interface SbcMetrics {
  datasets: number;
  medianAbsoluteBias: number | null;
  intervalCoverage: number | null;
  rankCoverage: number | null;
  passed: boolean;
}

export interface HoldoutEvaluation {
  totalHeldOut: number;
  coveredCount: number;
  coverageFraction: number | null;
  passed: boolean;
}

export interface AdversarialGateResult {
  systemShifts: Record<string, number>;
  blockedFromVerified: string[];
  passed: boolean;
}

export interface InvarianceCheckResult {
  permutationInvariant: boolean;
  reseedEquivalent: boolean;
  maxScoreDifference: number;
  passed: boolean;
}

function validateIntervals(actuals: number[], intervals: Array<[number, number]>): void {
  if (actuals.length !== intervals.length) {
    throw new RangeError("Every validation target must have exactly one predictive interval");
  }
  for (let i = 0; i < actuals.length; i++) {
    const interval = intervals[i];
    if (!Number.isFinite(actuals[i]) || interval?.length !== 2
      || !interval.every(Number.isFinite) || interval[0] > interval[1]) {
      throw new RangeError(`Invalid target or predictive interval at validation row ${i}`);
    }
  }
}

/**
 * Validates pipeline invariance (§12.6):
 * Permuting observation order or entity labels preserves published integers.
 */
export function checkPermutationInvariance(
  originalSummary: Aci12PosteriorOutput,
  permutedSummary: Aci12PosteriorOutput,
): InvarianceCheckResult {
  let maxDiff = 0;
  const originalIds = Object.keys(originalSummary.systems);
  let complete = originalIds.length > 0 && originalIds.length === Object.keys(permutedSummary.systems).length;
  let matches = complete;

  for (const [sysId, sysOriginal] of Object.entries(originalSummary.systems)) {
    const sysPermuted = permutedSummary.systems[sysId];
    if (!sysPermuted) {
      complete = false;
      matches = false;
      continue;
    }
    const scoreOrig = Math.round(sysOriginal.display.median);
    const scorePerm = Math.round(sysPermuted.display.median);
    if (!Number.isFinite(scoreOrig) || !Number.isFinite(scorePerm)) {
      complete = false;
      matches = false;
      continue;
    }
    const diff = Math.abs(scoreOrig - scorePerm);
    if (diff > maxDiff) maxDiff = diff;
    if (diff > 0) {
      matches = false;
    }
  }

  return {
    permutationInvariant: matches,
    reseedEquivalent: complete && maxDiff <= 1,
    maxScoreDifference: maxDiff,
    passed: matches,
  };
}

/**
 * Evaluates the adversarial self-report fit gate (§10.8):
 * Any system whose composite ACI-G moves by > 3.0 points when self-report offset is added
 * is blocked from Verified tier.
 */
export function evaluateAdversarialGate(
  standardSummary: Aci12PosteriorOutput,
  adversarialSummary: Aci12PosteriorOutput,
  maxAllowedShift = 3.0,
): AdversarialGateResult {
  if (!Number.isFinite(maxAllowedShift) || maxAllowedShift < 0) {
    throw new RangeError("The allowed adversarial shift must be finite and nonnegative");
  }
  const shifts: Record<string, number> = {};
  const blocked: string[] = [];
  const standardIds = Object.keys(standardSummary.systems);
  let complete = standardIds.length > 0 && standardIds.length === Object.keys(adversarialSummary.systems).length;

  for (const [sysId, stdSys] of Object.entries(standardSummary.systems)) {
    const advSys = adversarialSummary.systems[sysId];
    if (!advSys) {
      complete = false;
      continue;
    }
    const shift = Math.abs(advSys.display.median - stdSys.display.median);
    if (!Number.isFinite(shift)) {
      complete = false;
      continue;
    }
    shifts[sysId] = shift;
    if (shift > maxAllowedShift && stdSys.tier === "verified") {
      blocked.push(sysId);
    }
  }

  return {
    systemShifts: shifts,
    blockedFromVerified: blocked,
    passed: complete && blocked.length === 0,
  };
}

/**
 * Evaluates holdout prediction intervals (§12.3).
 * Target coverage range is [0.85, 0.95].
 */
export function evaluateHoldoutMetrics(
  actuals: number[],
  predictiveIntervals: Array<[number, number]>,
  minCoverage = 0.85,
  maxCoverage = 0.95,
): HoldoutEvaluation {
  validateIntervals(actuals, predictiveIntervals);
  if (!Number.isFinite(minCoverage) || !Number.isFinite(maxCoverage)
    || minCoverage < 0 || maxCoverage > 1 || minCoverage > maxCoverage) {
    throw new RangeError("Coverage thresholds must satisfy 0 <= minimum <= maximum <= 1");
  }
  if (actuals.length === 0) {
    return { totalHeldOut: 0, coveredCount: 0, coverageFraction: null, passed: false };
  }
  let covered = 0;
  for (let i = 0; i < actuals.length; i++) {
    const val = actuals[i]!;
    const [low, high] = predictiveIntervals[i]!;
    if (val >= low && val <= high) covered++;
  }
  const fraction = covered / actuals.length;
  return {
    totalHeldOut: actuals.length,
    coveredCount: covered,
    coverageFraction: fraction,
    passed: fraction >= minCoverage && fraction <= maxCoverage,
  };
}

/**
 * Checks SBC acceptance criteria (§12.1):
 * Median absolute bias < 1 point, 90% interval coverage in [0.87, 0.93].
 */
export function evaluateSbcMetrics(
  trueValues: number[],
  estimatedMedians: number[],
  intervals: Array<[number, number]>,
): SbcMetrics {
  const n = trueValues.length;
  validateIntervals(trueValues, intervals);
  if (estimatedMedians.length !== n || !estimatedMedians.every(Number.isFinite)) {
    throw new RangeError("Every simulation target must have exactly one finite estimated median");
  }
  if (n === 0) {
    return { datasets: 0, medianAbsoluteBias: null, intervalCoverage: null, rankCoverage: null, passed: false };
  }
  const biases: number[] = [];
  let covered = 0;
  for (let i = 0; i < n; i++) {
    const tv = trueValues[i]!;
    const est = estimatedMedians[i]!;
    biases.push(Math.abs(est - tv));
    const [low, high] = intervals[i]!;
    if (tv >= low && tv <= high) covered++;
  }
  biases.sort((a, b) => a - b);
  const middle = Math.floor(biases.length / 2);
  const medianBias = biases.length % 2 ? biases[middle]! : (biases[middle - 1]! + biases[middle]!) / 2;
  const coverage = covered / n;
  const passed = medianBias < 1.0 && coverage >= 0.87 && coverage <= 0.93;
  return {
    datasets: n,
    medianAbsoluteBias: medianBias,
    intervalCoverage: coverage,
    // No rank truths or rank intervals are supplied to this evaluator.
    rankCoverage: null,
    passed,
  };
}
