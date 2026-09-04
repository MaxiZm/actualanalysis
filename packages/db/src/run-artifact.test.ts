import { describe, expect, it } from "vitest";
import { RunArtifactSchema } from "./run-artifact.js";

describe("run artifact", () => {
  it("validates a complete, importable run", () => {
    const parsed = RunArtifactSchema.parse({
      kind: "agentic",
      method_version: "1.0.0-test",
      params: { seed: 7 },
      scores: [{
        model_id: "model-a",
        score: 100,
        ci_low: 98,
        ci_high: 102,
        rank: 1,
        rank_low: 1,
        rank_high: 2,
        coverage: 0.8,
        n_private: 2,
        robust_score: 99.8
      }],
      benchmark_params: [{
        benchmark_id: "bench-a",
        difficulty: 0,
        slope: 1,
        weight: 0.7,
        weight_factors: { discrimination: 0.5, saturation: 1, sources: 1, holdout: 0.7 },
        residual_var: 0.1
      }],
      cells: [{ model_id: "model-a", benchmark_id: "bench-a", y: 1, y_hat: 0.9, z: 0.2 }]
    });
    expect(parsed.scores[0]?.flags).toEqual([]);
    expect(parsed.cells[0]?.used).toBe(true);
  });

  it("rejects impossible rank probabilities", () => {
    const invalid = RunArtifactSchema.safeParse({
      kind: "mixed",
      method_version: "x",
      params: {},
      scores: [],
      benchmark_params: [{ benchmark_id: "b", difficulty: 0, slope: -1, weight: 1, weight_factors: {}, residual_var: 0 }],
      cells: []
    });
    expect(invalid.success).toBe(false);
  });
});
