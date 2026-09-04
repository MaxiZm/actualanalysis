import { describe, expect, it } from "vitest";
import {
  cellNoiseVariance,
  estimateHarnessVariance,
  estimateHarnessVarianceDetails,
  normalizeResult,
  prepareCells,
} from "../src/normalize.js";
import type { BenchmarkDefinition, RawScoreResult } from "../src/types.js";

function benchmark(transform: BenchmarkDefinition["transform"]): BenchmarkDefinition {
  return { id: "b", tags: ["chat"], holdout: "public", transform, nItems: 100 };
}

function result(score: number, overrides: Partial<RawScoreResult> = {}): RawScoreResult {
  return {
    id: "r",
    modelId: "m",
    benchmarkId: "b",
    source: { id: "runner", kind: "runner" },
    score,
    ...overrides,
  };
}

describe("normalization", () => {
  it("chance-corrects accuracy, clips, and delta-transforms uncertainty", () => {
    const normalized = normalizeResult(
      result(75, { se: 2 }),
      benchmark({ kind: "accuracy", inputScale: "percent", chanceLevel: 0.25 }),
    );
    expect(normalized.p).toBeCloseTo(2 / 3, 12);
    expect(normalized.y).toBeCloseTo(Math.log(2), 12);
    expect(normalized.normalizedSe).toBeCloseTo(0.02 / 0.75, 12);
    expect(
      normalizeResult(result(0), benchmark({ kind: "accuracy", chanceLevel: 0.25 })).p,
    ).toBe(0.005);
  });

  it("uses the declared Elo and METR transforms", () => {
    const withUncertainty = { se: 0.01, seOnNormalizedScale: true };
    expect(normalizeResult(result(1_200, withUncertainty), benchmark({ kind: "elo", eloRef: 1_200 })).p).toBeCloseTo(0.5);
    expect(normalizeResult(result(256, withUncertainty), benchmark({ kind: "metr" })).p).toBeCloseTo(0.5);
    expect(normalizeResult(result(1_600, withUncertainty), benchmark({ kind: "elo", eloRef: 1_200 })).p).toBeCloseTo(
      10 / 11,
    );
  });

  it("log-scales Vending scores against the human baseline", () => {
    const halfLog = Math.expm1(Math.log1p(10_000) / 2);
    const normalized = normalizeResult(
      result(halfLog, { se: 0.01, seOnNormalizedScale: true }),
      benchmark({ kind: "vending", humanBaseline: 10_000 }),
    );
    expect(normalized.p).toBeCloseTo(0.5, 10);
    expect(
      normalizeResult(
        result(10_000, { se: 0.01, seOnNormalizedScale: true }),
        benchmark({ kind: "vending", humanBaseline: 10_000 }),
      ).p,
    ).toBe(0.995);
  });

  it("never invents n=1 when accuracy uncertainty metadata is missing", () => {
    const noItemCount: BenchmarkDefinition = {
      id: "b",
      tags: ["chat"],
      holdout: "public",
      transform: { kind: "accuracy" },
    };
    expect(() => normalizeResult(result(0.6), noItemCount)).toThrow(
      /requires either a reported standard error or positive nItems/,
    );
    expect(() => cellNoiseVariance(0.6)).toThrow(/requires either standardError or nItems/);
    expect(() => cellNoiseVariance(0.6, { nItems: 1.5 })).toThrow(/positive integer/);
  });

  it("uses registry nItems for accuracy but requires reported uncertainty for continuous transforms", () => {
    const normalized = normalizeResult(result(0.5), benchmark({ kind: "accuracy" }));
    expect(normalized.normalizedSe).toBeCloseTo(0.05, 12);
    expect(() =>
      normalizeResult(result(1_200), benchmark({ kind: "elo", eloRef: 1_200 })),
    ).toThrow(/elo transform and requires a reported standard error/);
  });

  it("estimates harness variance only from repeated independent runs", () => {
    const definition = benchmark({ kind: "accuracy" });
    const observations = [
      normalizeResult(result(0.4, { id: "a", source: { id: "a", kind: "runner" }, se: 0.001 }), definition),
      normalizeResult(result(0.7, { id: "b", source: { id: "b", kind: "runner" }, se: 0.001 }), definition),
      normalizeResult(result(0.9, { id: "c", source: { id: "c", kind: "mirror" }, se: 0.001 }), definition),
    ];
    expect(estimateHarnessVariance(observations)).toBeCloseTo(0.25 ** 2, 12);
    expect(estimateHarnessVarianceDetails(observations, 0.25, 1).variance).toBeGreaterThan(0.1);
  });

  it("floors logit noise and uses the harness prior when fewer than ten pairs exist", () => {
    expect(cellNoiseVariance(0.5, { standardError: 0 })).toBeCloseTo(0.15 ** 2, 12);
    const details = estimateHarnessVarianceDetails([], 0.25, 10);
    expect(details).toEqual({ variance: 0.25 ** 2, pairCount: 0, usedPrior: true });
    const prepared = prepareCells([result(0.5)], [benchmark({ kind: "accuracy" })]);
    expect(prepared.harnessVariance).toBeCloseTo(0.25 ** 2, 12);
    expect(prepared.cells[0]?.tau).toBeCloseTo(Math.sqrt(Math.max(0.2 ** 2, 0.15 ** 2) + 0.25 ** 2), 12);
  });

  it("keeps and pools the strongest provenance tier", () => {
    const definition = benchmark({ kind: "accuracy" });
    const prepared = prepareCells(
      [
        result(0.9, { id: "self", source: { id: "vendor", kind: "self_report" } }),
        result(0.8, { id: "mirror", source: { id: "mirror", kind: "mirror" } }),
        result(0.6, { id: "ind-a", source: { id: "a", kind: "runner" }, se: 0.02 }),
        result(0.7, { id: "ind-b", source: { id: "b", kind: "runner" }, se: 0.02 }),
      ],
      [definition],
      { harnessVariance: 0 },
    );
    expect(prepared.cells).toHaveLength(1);
    expect(prepared.cells[0]?.provenanceTier).toBe(3);
    expect(prepared.cells[0]?.keptResultIds.sort()).toEqual(["ind-a", "ind-b"]);
    expect(prepared.cells[0]?.excludedResultIds.sort()).toEqual(["mirror", "self"]);
    expect(prepared.cells[0]?.p).toBeGreaterThan(0.64);
    expect(prepared.cells[0]?.p).toBeLessThan(0.66);
  });

  it("selects stronger provenance before normalizing superseded records", () => {
    const definition: BenchmarkDefinition = {
      id: "b",
      tags: ["chat"],
      holdout: "public",
      transform: { kind: "accuracy" },
    };
    const prepared = prepareCells(
      [
        result(0.95, {
          id: "invalid-self-report",
          source: { id: "vendor", kind: "self_report" },
        }),
        result(0.6, {
          id: "valid-independent",
          source: { id: "runner", kind: "runner" },
          se: 0.02,
        }),
      ],
      [definition],
      { harnessVariance: 0 },
    );
    expect(prepared.observations).toHaveLength(1);
    expect(prepared.cells[0]?.keptResultIds).toEqual(["valid-independent"]);
    expect(prepared.cells[0]?.excludedResultIds).toEqual(["invalid-self-report"]);
  });
});
