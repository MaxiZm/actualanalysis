import { describe, expect, it } from "vitest";
import type { ResultRecord } from "./data";
import { uniqueUsedResultPairs } from "./result-pairs";

function result(overrides: Partial<ResultRecord>): ResultRecord {
  return {
    id: "result-1",
    modelSlug: "model-a",
    benchmarkSlug: "benchmark-a",
    rawScore: 0.8,
    score: 0.8,
    scoreUnit: "fraction",
    predicted: 0.75,
    standardError: 0.04,
    residualZ: 0.5,
    sourceKind: "self-reported",
    sourceName: "Source",
    sourceUrl: "https://example.com",
    harness: null,
    config: {},
    nItems: 100,
    observedOn: "2026-09-04",
    used: true,
    ...overrides,
  };
}

describe("uniqueUsedResultPairs", () => {
  it("returns one row per used model and benchmark pair", () => {
    const rows = uniqueUsedResultPairs([
      result({ id: "config-a" }),
      result({ id: "config-b", standardError: 0.02 }),
      result({ id: "unused", modelSlug: "model-b", used: false }),
      result({ id: "other-model", modelSlug: "model-c" }),
    ]);

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => `${row.modelSlug}\0${row.benchmarkSlug}`)).size).toBe(2);
    expect(rows.find((row) => row.modelSlug === "model-a")?.standardError).toBe(0.02);
  });

  it("prefers independent provenance for the displayed pair", () => {
    const rows = uniqueUsedResultPairs([
      result({ id: "self" }),
      result({ id: "independent", sourceKind: "independent" }),
    ]);

    expect(rows[0]?.id).toBe("independent");
    expect(rows[0]?.sourceKind).toBe("independent");
  });
});
