import { describe, expect, it } from "vitest";
import {
  computeMeanWinRates,
  computePublicPrivateGaps,
  findPublicOutliers,
  leaveOneBenchmarkOut,
} from "../src/diagnostics.js";
import { fitLatentModel } from "../src/fit.js";
import type { BenchmarkDefinition, FitResult } from "../src/types.js";
import { cell, pipelineFixture, syntheticCells } from "./helpers.js";

function diagnosticFit(): FitResult {
  return {
    capabilities: { gamed: 1, clean: 0 },
    difficulties: { pub: 0, pub2: 0, priv1: 0, priv2: 0 },
    discriminations: { pub: 1, pub2: 1, priv1: 1, priv2: 1 },
    cells: [
      { cellId: "g-p", modelId: "gamed", benchmarkId: "pub", y: 1, predicted: 0, residual: 1, z: 4, weight: 1 },
      { cellId: "g-p2", modelId: "gamed", benchmarkId: "pub2", y: 1, predicted: 0, residual: 1, z: 4, weight: 1 },
      { cellId: "g-a", modelId: "gamed", benchmarkId: "priv1", y: 0, predicted: 0, residual: 0, z: 0, weight: 1 },
      { cellId: "g-b", modelId: "gamed", benchmarkId: "priv2", y: 0, predicted: 0, residual: 0, z: -0.2, weight: 1 },
      { cellId: "c-p", modelId: "clean", benchmarkId: "pub", y: 0, predicted: 0, residual: 0, z: 0.1, weight: 1 },
      { cellId: "c-p2", modelId: "clean", benchmarkId: "pub2", y: 0, predicted: 0, residual: 0, z: 0.1, weight: 1 },
      { cellId: "c-a", modelId: "clean", benchmarkId: "priv1", y: 0, predicted: 0, residual: 0, z: 0, weight: 1 },
      { cellId: "c-b", modelId: "clean", benchmarkId: "priv2", y: 0, predicted: 0, residual: 0, z: 0.1, weight: 1 },
    ],
    objective: 0,
    iterations: 1,
    converged: true,
    gradientNorm: 0,
    maximumUpdate: 0,
    referenceBenchmarkId: "pub",
  };
}

const diagnosticBenchmarks: BenchmarkDefinition[] = [
  { id: "pub", tags: ["chat"], holdout: "public", transform: { kind: "accuracy" } },
  { id: "pub2", tags: ["chat"], holdout: "public", transform: { kind: "accuracy" } },
  { id: "priv1", tags: ["chat"], holdout: "private", transform: { kind: "accuracy" } },
  { id: "priv2", tags: ["chat"], holdout: "rolling", transform: { kind: "accuracy" } },
];

describe("anti-benchmaxxing diagnostics", () => {
  it("flags a public-private residual gap and a >3σ public outlier", () => {
    const fit = diagnosticFit();
    const gaps = computePublicPrivateGaps(fit, diagnosticBenchmarks);
    expect(gaps.gamed?.flagged).toBe(true);
    expect(gaps.clean?.flagged).toBe(false);
    expect(findPublicOutliers(fit, diagnosticBenchmarks).map((entry) => entry.modelId)).toEqual(["gamed", "gamed"]);
  });

  it("flags cardinal vs ordinal rank disagreement greater than three places", () => {
    const modelIds = ["a", "b", "c", "d", "e"];
    const cells = ["x", "y", "z"].flatMap((benchmarkId) =>
      modelIds.map((modelId, index) => cell(modelId, benchmarkId, 5 - index)),
    );
    const mwr = computeMeanWinRates(cells, { a: 0, b: 1, c: 2, d: 3, e: 4 });
    expect(mwr.a?.rank).toBe(1);
    expect(mwr.a?.cardinalRank).toBe(5);
    expect(mwr.a?.flagged).toBe(true);
  });

  it("reports a sensitive leave-one-benchmark-out score and robust median", () => {
    const cells = syntheticCells();
    const gamed = cells.find((entry) => entry.modelId === "m4" && entry.benchmarkId === "coding");
    if (gamed === undefined) throw new Error("missing gamed cell");
    gamed.y += 4;
    const fitOptions = {
      identification: { referenceBenchmarkId: "ref" },
      lambdaAlpha: 0.001,
      lambdaCapability: 0.001,
      lambdaDifficulty: 0.001,
      maxIterations: 1_500,
      tolerance: 1e-5,
    } as const;
    const fit = fitLatentModel(cells, fitOptions);
    const loo = leaveOneBenchmarkOut(cells, fit, {
      fitOptions,
      standardErrors: Object.fromEntries(Object.keys(fit.capabilities).map((id) => [id, 0.005])),
    });
    expect(loo.models.m4?.mostInfluentialBenchmarkId).toBe("coding");
    expect(loo.models.m4?.flagged).toBe(true);
    expect(loo.models.m4?.robustScore).toBeTypeOf("number");
  });

  it("rejects a non-converged leave-one-benchmark-out refit", () => {
    const cells = syntheticCells();
    const fit = fitLatentModel(cells, {
      identification: { referenceBenchmarkId: "ref" },
      maxIterations: 1_000,
      tolerance: 1e-5,
    });
    expect(() => leaveOneBenchmarkOut(cells, fit, {
      fitOptions: {
        identification: { referenceBenchmarkId: "ref" },
        maxIterations: 1,
      },
    })).toThrow(/Leave-one-benchmark-out fit excluding .* did not converge/);
  });

  it("never fits a zero-observation model or reanchors through a data-free anchor", () => {
    const cells = [
      cell("low", "ref", -1),
      cell("high", "ref", 1),
      cell("low", "other", -0.8),
      cell("high", "other", 0.8),
      cell("sparse", "other", 0.2),
    ];
    const fitOptions = {
      identification: { referenceBenchmarkId: "ref" },
      maxIterations: 2_000,
      tolerance: 1e-5,
    } as const;
    const fit = fitLatentModel(cells, fitOptions);
    expect(fit.converged).toBe(true);
    const loo = leaveOneBenchmarkOut(cells, fit, {
      fitOptions,
      anchors: [{ modelId: "low", value: 100 }, { modelId: "high", value: 110 }],
    });
    expect(loo.fits.other?.capabilities).not.toHaveProperty("sparse");
    expect(loo.models.sparse?.shifts).not.toHaveProperty("other");
    expect(loo.models.sparse?.robustScore).toBe(loo.fits.ref?.capabilities.sparse);

    const disconnected = leaveOneBenchmarkOut(cells, fit, {
      fitOptions,
      anchors: [{ modelId: "low", value: 100 }, { modelId: "sparse", value: 110 }],
    });
    expect(Object.keys(disconnected.fits)).toEqual(["ref"]);
    expect(disconnected.fits.other).toBeUndefined();
  });

  it("does not publish a scoring run whose main fit failed to converge", async () => {
    const { runScoring } = await import("../src/score.js");
    const fixture = pipelineFixture();
    fixture.config.maxIterations = 1;
    expect(() => runScoring(fixture)).toThrow(/Preliminary scoring fit did not converge after 1 iterations/);
  });

  it.each(["1.2.3", "1.3.2", "1.4.0"])("cannot relabel a legacy fit as Bayesian method %s", async (version) => {
    const { runScoring } = await import("../src/score.js");
    const fixture = pipelineFixture();
    fixture.config.methodVersion = version;
    expect(() => runScoring(fixture)).toThrow(/requires the joint NumPyro runner/);
  });

  it("end-to-end scoring emits all diagnostics and cuts flagged cell weight", async () => {
    const { runScoring } = await import("../src/score.js");
    const fixture = pipelineFixture();
    const run = runScoring(fixture);
    expect(run.kind).toBe("mixed");
    expect(run.methodVersion).toBe("1.2.3-test");
    expect(run.scores).toHaveLength(8);
    expect(run.scores.every((score) => !score.provisional)).toBe(true);
    expect(run.scores[0]?.rank).toBe(1);
    expect(run.fit.capabilities.m0).toBeCloseTo(40, 8);
    expect(run.fit.capabilities.m7).toBeCloseTo(100, 8);
    expect(Object.keys(run.benchmarkWeights)).toHaveLength(6);
    expect(run.bootstrap.completedIterations).toBeGreaterThan(12);
    expect(Object.keys(run.leaveOneOut.fits)).toHaveLength(6);
  });

  it("publishes provisional models as ranges without ranks or pairwise entries", async () => {
    const { runScoring } = await import("../src/score.js");
    const fixture = pipelineFixture();
    fixture.config.bootstrapIterations = 4;
    fixture.config.maxIterations = 3_000;
    let retained = 0;
    fixture.results = fixture.results.filter((result) => {
      if (result.modelId !== "m3") return true;
      retained += 1;
      return retained <= 3;
    });
    const run = runScoring(fixture);
    const provisional = run.scores.find((score) => score.modelId === "m3");

    expect(provisional).toMatchObject({ score: null, rank: null, provisional: true });
    expect(provisional?.ciLow).not.toBeNull();
    expect(provisional?.ciHigh).not.toBeNull();
    expect(run.bootstrap.pairwise).not.toHaveProperty("m3");
    expect(Object.values(run.bootstrap.pairwise).every((row) => !("m3" in row))).toBe(true);
  });
});
