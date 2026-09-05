import { describe, expect, it } from "vitest";
import type { Aci12PosteriorOutput } from "../src/numpyro.js";
import { checkPermutationInvariance, evaluateAdversarialGate, evaluateHoldoutMetrics, evaluateSbcMetrics } from "../src/validation.js";

const summary = (scores: Record<string, number>): Aci12PosteriorOutput => ({
  systems: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { display: { median: score }, tier: "verified" }])),
}) as Aci12PosteriorOutput;

describe("honest validation metrics", () => {
  it("does not claim unrun holdout or simulation checks passed", () => {
    expect(evaluateHoldoutMetrics([], [])).toEqual({ totalHeldOut: 0, coveredCount: 0, coverageFraction: null, passed: false });
    expect(evaluateSbcMetrics([], [], [])).toEqual({ datasets: 0, medianAbsoluteBias: null, intervalCoverage: null, rankCoverage: null, passed: false });
  });

  it("requires one finite interval for every held-out target", () => {
    expect(() => evaluateHoldoutMetrics([1], [])).toThrow(/exactly one/);
    expect(() => evaluateHoldoutMetrics([], [[0, 1]])).toThrow(/exactly one/);
    expect(() => evaluateHoldoutMetrics([Number.NaN], [[0, 1]])).toThrow(/Invalid/);
    expect(() => evaluateHoldoutMetrics([1], [[0, Number.POSITIVE_INFINITY]])).toThrow(/Invalid/);
    expect(() => evaluateHoldoutMetrics([1], [[2, 0]])).toThrow(/Invalid/);
    expect(() => evaluateHoldoutMetrics([1], [[0, 2]], .95, .85)).toThrow(/thresholds/);
  });

  it("measures actual coverage without inventing rank validation", () => {
    const targets = Array<number>(100).fill(0);
    const intervals: Array<[number, number]> = targets.map((_, i) => i < 90 ? [-1, 1] : [1, 2]);
    expect(evaluateHoldoutMetrics(targets, intervals)).toEqual({ totalHeldOut: 100, coveredCount: 90, coverageFraction: .9, passed: true });
    expect(evaluateSbcMetrics(targets, targets.map(() => .4), intervals)).toEqual({
      datasets: 100, medianAbsoluteBias: .4, intervalCoverage: .9, rankCoverage: null, passed: true,
    });
  });

  it("rejects incomplete simulation outputs and computes the even-sample median", () => {
    expect(() => evaluateSbcMetrics([0], [], [[-1, 1]])).toThrow(/finite estimated median/);
    expect(() => evaluateSbcMetrics([0], [Number.NaN], [[-1, 1]])).toThrow(/finite estimated median/);
    expect(() => evaluateSbcMetrics([0], [0], [])).toThrow(/exactly one/);
    expect(evaluateSbcMetrics([0, 0], [0, 4], [[-1, 1], [-1, 1]]).medianAbsoluteBias).toBe(2);
  });

  it("requires complete nonempty comparisons for refit checks", () => {
    expect(checkPermutationInvariance(summary({}), summary({})).passed).toBe(false);
    expect(checkPermutationInvariance(summary({ a: 1 }), summary({ a: 1, b: 2 })).passed).toBe(false);
    expect(checkPermutationInvariance(summary({ a: 1 }), summary({ a: Number.NaN })).passed).toBe(false);
    expect(evaluateAdversarialGate(summary({}), summary({})).passed).toBe(false);
    expect(evaluateAdversarialGate(summary({ a: 1 }), summary({})).passed).toBe(false);
    expect(evaluateAdversarialGate(summary({ a: 1 }), summary({ a: Number.NaN })).passed).toBe(false);
    expect(evaluateAdversarialGate(summary({ a: 1 }), summary({ a: 5 })).blockedFromVerified).toEqual(["a"]);
    expect(evaluateAdversarialGate(summary({ a: 1 }), summary({ a: 2 })).passed).toBe(true);
  });
});
