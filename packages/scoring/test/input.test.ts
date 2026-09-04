import { describe, expect, it } from "vitest";
import { coerceScoringInput } from "../src/input.js";
import { normalizeResult } from "../src/normalize.js";

describe("input compatibility", () => {
  it("accepts registry-style snake_case payloads", () => {
    const input = coerceScoringInput({
      benchmarks: [
        {
          slug: "hle",
          tags: ["chat"],
          categories: ["knowledge", "reasoning"],
          holdout: "semi-private",
          chance_level: 0.25,
          n_items: 100,
          transform: { type: "accuracy", scale: "percent" },
        },
      ],
      results: [
        {
          model_id: "model",
          benchmark_id: "hle",
          source_id: "runner",
          source_kind: "runner",
          performance: 50,
          standard_error: 2,
        },
      ],
      config: {
        index: "chat",
        reference_benchmark: "hle",
        method_version: "2.0.0",
        bootstrap_iterations: 10,
        anchors: { model: 100 },
      },
    });
    expect(input.benchmarks[0]?.id).toBe("hle");
    expect(input.benchmarks[0]?.holdout).toBe("semi_private");
    expect(input.benchmarks[0]?.categories).toEqual(["knowledge", "reasoning"]);
    expect(input.benchmarks[0]?.transform).toEqual({
      kind: "accuracy",
      inputScale: "percent",
      chanceLevel: 0.25,
    });
    expect(input.results[0]?.modelId).toBe("model");
    expect(input.config.bootstrapIterations).toBe(10);
    expect(input.config.anchors).toEqual([{ modelId: "model", value: 100 }]);
  });

  it("adapts the exact shared registry transforms and nested index config", () => {
    const payload = {
      benchmarks: [
        {
          id: "metr",
          name: "METR",
          tags: ["agentic"],
          holdout: "rolling",
          chance_level: 0,
          transform: {
            type: "metr_horizon",
            input_unit: "hours",
            midpoint_log2_minutes: 8,
            scale: 2,
            quantile: "p50",
          },
          source_ids: ["metr"],
          status: "active",
        },
        {
          id: "vending",
          name: "Vending",
          tags: ["agentic"],
          holdout: "private",
          chance_level: 0,
          transform: { type: "log_relative", reference_value: 1, base: 2, scale: 1 },
          source_ids: ["epoch"],
          status: "active",
        },
        {
          id: "arena",
          name: "Arena",
          tags: ["chat"],
          holdout: "rolling",
          chance_level: 0,
          transform: { type: "elo", reference_model: "fixed", reference_elo: 1_200, scale: 400 },
          source_ids: ["arena"],
          status: "active",
        },
      ],
      results: [
        {
          id: "result-id",
          model_id: "model",
          benchmark_id: "metr",
          source_id: "source-id",
          score: 256,
          score_unit: "minutes",
          observed_on: "2026-01-01",
          provenance: "independent",
          standard_error: 1,
        },
      ],
      config: {
        method_version: "1.0.0",
        epsilon: 0.005,
        huber_delta: 1.5,
        regularization: { alpha: 0.1, capability: 0.2, difficulty: 0.3 },
        optimizer: { name: "adam", learning_rate: 0.01, tolerance: 1e-6, max_iterations: 10_000 },
        bootstrap: { iterations: 500, confidence: 0.9, minimum_success_fraction: 0.8, seed: 42 },
        coverage: { min_benchmarks: 4, min_categories: 2, provisional_ci_multiplier: 1.5 },
        weighting: {
          max_discriminability: 2,
          source_target_count: 3,
          public_static_factor: 0.7,
          private_rolling_factor: 1,
          public_outlier_next_fit_factor: 0.25,
          lmarena_cap: 0.5,
        },
        diagnostics: {
          hubris_z_threshold: 3,
          public_private_gap_threshold: 1,
          loo_se_multiplier: 2,
          ordinal_rank_gap: 3,
        },
        indices: {
          mixed: {
            reference_benchmark: "vending",
            anchors: [
              { model_id: "a", value: 100 },
              { model_id: "b", value: 110 },
            ],
          },
          agentic: {
            reference_benchmark: "metr",
            anchors: [
              { model_id: "a", value: 100 },
              { model_id: "b", value: 110 },
            ],
          },
          chat: {
            reference_benchmark: "arena",
            anchors: [
              { model_id: "a", value: 100 },
              { model_id: "b", value: 110 },
            ],
          },
        },
      },
    };
    const input = coerceScoringInput(payload, "agentic");
    expect(input.config.identification.referenceBenchmarkId).toBe("metr");
    expect(input.config.lambdaCapability).toBe(0.2);
    expect(input.config.maxIterations).toBe(10_000);
    expect(input.config.learningRate).toBe(0.01);
    expect(input.config.bootstrapConfidenceLevel).toBe(0.9);
    expect(input.config.bootstrapMinimumSuccessFraction).toBe(0.8);
    expect(input.config.publicOutlierWeightFactor).toBe(0.25);
    expect(input.config.benchmarkWeightCaps?.["lmarena-text-style-controlled"]).toBe(0.5);
    expect(input.results[0]?.source.id).toBe("source-id");
    expect(input.results[0]?.source.kind).toBe("independent");
    const metr = input.benchmarks.find((benchmark) => benchmark.id === "metr");
    const vending = input.benchmarks.find((benchmark) => benchmark.id === "vending");
    const arena = input.benchmarks.find((benchmark) => benchmark.id === "arena");
    if (metr === undefined || vending === undefined || arena === undefined || input.results[0] === undefined) {
      throw new Error("missing coerced fixture");
    }
    expect(metr.transform.kind).toBe("metr");
    expect(normalizeResult(input.results[0], metr).p).toBeCloseTo(0.5);
    expect(vending.transform).toMatchObject({
      kind: "vending",
      mode: "logistic_ratio",
      humanBaseline: 1,
      logBase: 2,
    });
    expect(
      normalizeResult({ ...input.results[0], benchmarkId: "vending", score: 1 }, vending).p,
    ).toBeCloseTo(0.5);
    expect(
      normalizeResult({ ...input.results[0], benchmarkId: "vending", score: 2 }, vending).p,
    ).toBeCloseTo(1 / (1 + Math.exp(-1)));
    expect(arena.transform).toMatchObject({ kind: "elo", eloRef: 1_200 });
  });
});
