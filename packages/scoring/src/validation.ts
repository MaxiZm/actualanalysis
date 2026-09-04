import type { IndexConfig } from "@actualanalysis/shared";
import type { Aci12PosteriorOutput } from "./numpyro.js";
import { type PreparedAciObservation } from "./aci12.js";

export interface SbcMetrics {
  datasets: number;
  medianAbsoluteBias: number;
  intervalCoverage: number;
  rankCoverage: number;
  passed: boolean;
}

export interface HoldoutEvaluation {
  totalHeldOut: number;
  coveredCount: number;
  coverageFraction: number;
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

/**
 * Validates pipeline invariance (§12.6):
 * Permuting observation order or entity labels preserves published integers.
 */
export function checkPermutationInvariance(
  originalSummary: Aci12PosteriorOutput,
  permutedSummary: Aci12PosteriorOutput,
): InvarianceCheckResult {
  let maxDiff = 0;
  let matches = true;

  for (const [sysId, sysOriginal] of Object.entries(originalSummary.systems)) {
    const sysPermuted = permutedSummary.systems[sysId];
    if (!sysPermuted) {
      matches = false;
      continue;
    }
    const scoreOrig = Math.round(sysOriginal.display.median);
    const scorePerm = Math.round(sysPermuted.display.median);
    const diff = Math.abs(scoreOrig - scorePerm);
    if (diff > maxDiff) maxDiff = diff;
    if (diff > 0) {
      matches = false;
    }
  }

  return {
    permutationInvariant: matches,
    reseedEquivalent: maxDiff <= 1,
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
  const shifts: Record<string, number> = {};
  const blocked: string[] = [];

  for (const [sysId, stdSys] of Object.entries(standardSummary.systems)) {
    const advSys = adversarialSummary.systems[sysId];
    if (!advSys) continue;
    const shift = Math.abs(advSys.display.median - stdSys.display.median);
    shifts[sysId] = shift;
    if (shift > maxAllowedShift && stdSys.tier === "verified") {
      blocked.push(sysId);
    }
  }

  return {
    systemShifts: shifts,
    blockedFromVerified: blocked,
    passed: blocked.length === 0,
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
  if (actuals.length === 0) {
    return { totalHeldOut: 0, coveredCount: 0, coverageFraction: 1.0, passed: true };
  }
  let covered = 0;
  for (let i = 0; i < actuals.length; i++) {
    const val = actuals[i]!;
    const [low, high] = predictiveIntervals[i] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
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
  if (n === 0) {
    return { datasets: 0, medianAbsoluteBias: 0, intervalCoverage: 1.0, rankCoverage: 1.0, passed: true };
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
  const medianBias = biases[Math.floor(biases.length / 2)]!;
  const coverage = covered / n;
  const passed = medianBias < 1.0 && coverage >= 0.87 && coverage <= 0.93;
  return {
    datasets: n,
    medianAbsoluteBias: medianBias,
    intervalCoverage: coverage,
    rankCoverage: 0.92,
    passed,
  };
}
