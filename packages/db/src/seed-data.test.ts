import { describe, expect, it } from "vitest";
import type { RawBenchmarkResult } from "@actualanalysis/ingest";

import { resultGroupKey, sourceSeedValues } from "./seed-data.js";

function result(harness: string): RawBenchmarkResult {
  return {
    record_type: "benchmark_result",
    model: "Model A",
    model_id: "model-a",
    benchmark: "Benchmark A",
    benchmark_id: "benchmark-a",
    source_id: "source-a",
    score: 0.5,
    score_unit: "fraction",
    config: { effort: "high" },
    harness,
    observed_on: "2026-09-03",
    source_url: "https://example.com/result",
    provenance: "independent",
    metadata: {},
  };
}

describe("database result supersession identity", () => {
  it("groups provenance by model and benchmark regardless of harness", () => {
    expect(resultGroupKey(result("runner-a"))).toBe(resultGroupKey(result("runner-b")));
  });

  it("resolves provenance before materially different configurations", () => {
    const baseline = result("runner-a");
    expect(resultGroupKey(baseline)).toBe(resultGroupKey({
      ...baseline,
      config: { effort: "low" },
    }));
  });
});

describe("source registry persistence", () => {
  it("preserves explicit attribution and normalizes a missing value to null", () => {
    const source = {
      id: "epoch",
      name: "Epoch AI benchmark hub",
      url: "https://epoch.ai/data/eci",
      license: "CC-BY-4.0",
      kind: "mirror" as const,
      redistributable: true,
      redistributable_benchmark_ids: ["frontiermath-v2-tier-4"],
    };

    expect(sourceSeedValues({ ...source, attribution: "Epoch AI" })).toMatchObject({
      attribution: "Epoch AI",
      redistributableBenchmarkIds: ["frontiermath-v2-tier-4"],
    });
    expect(sourceSeedValues(source)).toMatchObject({
      attribution: null,
      redistributableBenchmarkIds: ["frontiermath-v2-tier-4"],
    });
    expect(sourceSeedValues({
      ...source,
      redistributable: false,
      redistributable_benchmark_ids: undefined,
    })).toMatchObject({ redistributable: false, redistributableBenchmarkIds: [] });
  });
});
