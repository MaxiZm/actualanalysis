import { describe, expect, it } from "vitest";
import { hierarchicalBootstrap } from "../src/bootstrap.js";
import { applyProvisionalShrinkage, computeCoverage } from "../src/coverage.js";
import { fitLatentModel } from "../src/fit.js";
import { computeBenchmarkWeights } from "../src/weights.js";
import { cell, pipelineFixture, syntheticCells } from "./helpers.js";

describe("benchmark weights", () => {
  it("publishes all four documented factors", () => {
    const fixture = pipelineFixture();
    const cells = syntheticCells();
    // Give each benchmark three independent sources at the cell metadata level.
    for (const entry of cells) entry.independentSourceIds = ["a", "b", "c"];
    const fit = fitLatentModel(cells, {
      identification: { referenceBenchmarkId: "ref" },
      maxIterations: 1_500,
    });
    const weights = computeBenchmarkWeights(fixture.benchmarks, cells, fit);
    expect(weights.ref?.factors.privacy).toBe(0.7);
    expect(weights.science?.factors.privacy).toBe(1);
    expect(weights.ref?.factors.sources).toBe(1);
    expect(weights.ref?.factors.discrimination).toBe(1);
    expect(weights.ref?.weight).toBeGreaterThan(0);
  });
});

describe("hierarchical bootstrap", () => {
  it("is reproducible and emits CIs, rank CDFs, pairwise probabilities and ties", () => {
    const cells = syntheticCells((modelIndex, benchmarkIndex) =>
      0.02 * Math.sin(modelIndex + benchmarkIndex * 2),
    );
    const fitOptions = {
      identification: { referenceBenchmarkId: "ref" },
      lambdaAlpha: 0.001,
      lambdaCapability: 0.001,
      lambdaDifficulty: 0.001,
      maxIterations: 1_000,
      tolerance: 1e-5,
    } as const;
    const fit = fitLatentModel(cells, fitOptions);
    const options = {
      iterations: 24,
      seed: "repeatable",
      anchors: [
        { modelId: "m3", value: 100 },
        { modelId: "m5", value: 110 },
      ],
      fitOptions,
    };
    const first = hierarchicalBootstrap(cells, fit, options);
    const second = hierarchicalBootstrap(cells, fit, options);
    expect(first.models.m4?.samples).toEqual(second.models.m4?.samples);
    expect(first.models.m4?.ciLow).not.toBeNull();
    expect(first.models.m3?.ciLow).toBeNull();
    expect(first.models.m3?.ciHigh).toBeNull();
    expect(first.models.m7?.rankCdf).toHaveLength(8);
    expect(first.pairwise.m7?.m0).toBeGreaterThan(0.95);
    expect(first.completedIterations).toBe(24);
    expect(first.attemptedIterations).toBe(24);
    expect(first.failedIterations).toBe(0);
  });

  it("omits a model from draws where none of its benchmarks were sampled", () => {
    const cells = [
      cell("low", "ref", -1, 0.02),
      cell("high", "ref", 1, 0.02),
      cell("sparse", "ref", 0.2, 0.02),
      cell("low", "other", -1.1, 0.02),
      cell("high", "other", 0.9, 0.02),
    ];
    const fitOptions = {
      identification: { referenceBenchmarkId: "ref" },
      maxIterations: 2_000,
      tolerance: 1e-5,
    } as const;
    const fit = fitLatentModel(cells, fitOptions);
    expect(fit.converged).toBe(true);
    const bootstrap = hierarchicalBootstrap(cells, fit, {
      iterations: 24,
      seed: "sparse-model",
      anchors: [
        { modelId: "low", value: 100 },
        { modelId: "high", value: 110 },
      ],
      fitOptions,
      minimumSuccessFraction: 0.5,
    });
    expect(bootstrap.models.low?.samples).toHaveLength(24);
    expect(bootstrap.models.high?.samples).toHaveLength(24);
    expect(bootstrap.models.sparse?.samples.length).toBeGreaterThan(0);
    expect(bootstrap.models.sparse?.samples.length).toBeLessThan(24);
  });

  it("rejects draws with an unsampled anchor and non-converged refits", () => {
    const cells = [
      cell("low", "ref", -1, 0.02),
      cell("bridge", "ref", 0, 0.02),
      cell("bridge", "other", 0, 0.02),
      cell("high", "other", 1, 0.02),
    ];
    const fitOptions = {
      identification: { referenceBenchmarkId: "ref" },
      maxIterations: 2_000,
      tolerance: 1e-5,
    } as const;
    const fit = fitLatentModel(cells, fitOptions);
    expect(() => hierarchicalBootstrap(cells, fit, {
      iterations: 12,
      seed: "missing-anchor",
      anchors: [
        { modelId: "low", value: 100 },
        { modelId: "high", value: 110 },
      ],
      fitOptions,
    })).toThrow(/Unable to obtain 12 valid bootstrap replicates/);
    expect(() => hierarchicalBootstrap(syntheticCells(), fitLatentModel(syntheticCells(), fitOptions), {
      iterations: 2,
      seed: "non-converged",
      fitOptions: { ...fitOptions, maxIterations: 1 },
    })).toThrow(/Unable to obtain 2 valid bootstrap replicates/);
  });

  it("uses an observed temporary reference when a bootstrap draw omits the configured reference", () => {
    const cells = [
      cell("low", "ref", -1, 0.02),
      cell("high", "ref", 1, 0.02),
      cell("low", "other", -0.8, 0.02),
      cell("high", "other", 0.8, 0.02),
    ];
    const fitOptions = {
      identification: { referenceBenchmarkId: "ref" },
      maxIterations: 2_000,
      tolerance: 1e-5,
    } as const;
    const fit = fitLatentModel(cells, fitOptions);
    const bootstrap = hierarchicalBootstrap(cells, fit, {
      iterations: 20,
      seed: "temporary-reference",
      anchors: [
        { modelId: "low", value: 100 },
        { modelId: "high", value: 110 },
      ],
      fitOptions,
      minimumSuccessFraction: 0.5,
    });
    expect(bootstrap.completedIterations).toBe(20);
    expect(bootstrap.failureReasons.other).toBeUndefined();
  });
});

describe("coverage gate", () => {
  it("requires four benchmarks and two categories", () => {
    const fixture = pipelineFixture();
    const cells = syntheticCells().filter(
      (entry) => entry.modelId !== "m0" || ["ref", "coding", "science"].includes(entry.benchmarkId),
    );
    const checked = computeCoverage(cells, fixture.benchmarks, ["m0", "m1"]);
    expect(checked.m0?.provisional).toBe(true);
    expect(checked.m1?.provisional).toBe(false);
    expect(checked.m1?.categoryCount).toBe(2);
  });

  it("does not fabricate category coverage from benchmark ids", () => {
    const fixture = pipelineFixture();
    const uncategorized = fixture.benchmarks.map(({ category: _category, categories: _categories, ...benchmark }) => benchmark);
    const checked = computeCoverage(syntheticCells(), uncategorized, ["m1"]);
    expect(checked.m1?.benchmarkCount).toBe(6);
    expect(checked.m1?.categoryCount).toBe(0);
    expect(checked.m1?.provisional).toBe(true);
  });

  it("counts only cells and benchmarks with positive effective weight", () => {
    const fixture = pipelineFixture();
    const cells = syntheticCells();
    const disabledCell = cells.find(
      (entry) => entry.modelId === "m1" && entry.benchmarkId === "coding",
    );
    if (disabledCell === undefined) throw new Error("missing disabled coverage fixture cell");
    disabledCell.weightMultiplier = 0;
    const checked = computeCoverage(cells, fixture.benchmarks, ["m1"], {
      benchmarkWeights: { science: 0 },
    });
    expect(checked.m1?.benchmarkCount).toBe(4);
    expect(checked.m1?.provisional).toBe(false);
  });

  it("does not shrink any provisional fitted capability", () => {
    const estimates = applyProvisionalShrinkage(
      { anchor: 100, peer: 120 },
      {
        anchor: { modelId: "anchor", benchmarkCount: 2, categoryCount: 1, privateCount: 0, coverage: 0.25, provisional: true },
        peer: { modelId: "peer", benchmarkCount: 2, categoryCount: 1, privateCount: 0, coverage: 0.25, provisional: true },
      },
      [{ id: "anchor", family: "family" }, { id: "peer", family: "family" }],
      {
        requestedIterations: 2,
        attemptedIterations: 2,
        completedIterations: 2,
        failedIterations: 0,
        failureReasons: {},
        confidenceLevel: 0.9,
        models: {
          anchor: { modelId: "anchor", samples: [100, 100], standardError: 0, ciLow: null, ciHigh: null, rankLow: null, rankHigh: null, rankCdf: [] },
          peer: { modelId: "peer", samples: [118, 122], standardError: 2, ciLow: 118, ciHigh: 122, rankLow: null, rankHigh: null, rankCdf: [] },
        },
        pairwise: {},
        ties: [],
      },
      { anchorModelIds: ["anchor"], priorStrength: 4 },
    );

    expect(estimates.anchor?.score).toBe(100);
    expect(estimates.anchor?.shrinkageWeight).toBe(1);
    expect(estimates.anchor?.ciLow).toBeNull();
    expect(estimates.peer?.score).toBe(120);
    expect(estimates.peer?.shrinkageWeight).toBe(1);
  });
});
