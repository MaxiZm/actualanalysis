import { describe, expect, it } from "vitest";
import { applyAnchorTransform, computeAnchorTransform, reanchorFit, validateAnchorEligibility } from "../src/anchor.js";
import { calibrateNewBenchmark } from "../src/calibrate.js";
import { fitLatentModel } from "../src/fit.js";
import { createRandom } from "../src/math.js";
import { cell, syntheticCells, trueBenchmarks, trueCapabilities } from "./helpers.js";

describe("robust latent fit", () => {
  it("recovers synthetic capabilities, difficulties and slopes", () => {
    const fit = fitLatentModel(syntheticCells(), {
      identification: { referenceBenchmarkId: "ref" },
      lambdaAlpha: 0.0001,
      lambdaCapability: 0.0001,
      lambdaDifficulty: 0.0001,
      maxIterations: 4_000,
      tolerance: 1e-7,
    });
    for (const [modelId, truth] of Object.entries(trueCapabilities)) {
      expect(fit.capabilities[modelId]).toBeCloseTo(truth, 1);
    }
    for (const [benchmarkId, truth] of Object.entries(trueBenchmarks)) {
      expect(fit.difficulties[benchmarkId]).toBeCloseTo(truth.difficulty, 1);
      expect(fit.discriminations[benchmarkId]).toBeCloseTo(truth.discrimination, 1);
    }
    expect(fit.objective).toBeLessThan(0.01);
  });

  it("resists a gross one-cell outlier through Huber loss", () => {
    const cells = syntheticCells();
    const target = cells.find((entry) => entry.modelId === "m4" && entry.benchmarkId === "coding");
    if (target === undefined) throw new Error("missing fixture cell");
    target.y += 10;
    const fit = fitLatentModel(cells, {
      identification: { referenceBenchmarkId: "ref" },
      lambdaAlpha: 0.001,
      lambdaCapability: 0.001,
      lambdaDifficulty: 0.001,
      maxIterations: 3_000,
    });
    expect(fit.capabilities.m4).toBeGreaterThan(0.2);
    expect(fit.capabilities.m4).toBeLessThan(0.9);
    expect(fit.cells.find((entry) => entry.cellId === target.id)?.z).toBeGreaterThan(20);
  });

  it("converges by stationarity on a sparse fit with the production noise floor", () => {
    const random = createRandom(20);
    const modelIds = ["a", "b", "c", "d", "e"];
    const benchmarkIds = ["ref", "b1", "b2", "b3", "b4", "b5", "b6"];
    const cells = modelIds.flatMap((modelId, modelIndex) =>
      benchmarkIds.flatMap((benchmarkId, benchmarkIndex) => {
        if (!(random() < 0.55 || (modelIndex < 2 && benchmarkIndex === 0))) return [];
        const y = (modelIndex - 2) * 0.5 - (benchmarkIndex - 3) * 0.2 + (random() - 0.5) * 0.2;
        const tau = Math.max(0.15, random() < 0.25 ? 0.003 : random() < 0.5 ? 0.04 : 1 + 3 * random());
        return [cell(modelId, benchmarkId, y, tau)];
      }),
    );
    const fit = fitLatentModel(cells, {
      identification: { referenceBenchmarkId: "ref" },
      modelIds,
      benchmarkIds,
      maxIterations: 2_500,
      tolerance: 1e-6,
    });
    expect(fit.converged).toBe(true);
    expect(fit.iterations).toBeLessThan(2_500);
    expect(fit.iterations).toBeGreaterThanOrEqual(300);
    expect(fit.gradientNorm).toBeLessThan(1e-4);
    expect(fit.maximumUpdate).toBeLessThan(1e-5);
  });
});

describe("anchoring and fixed calibration", () => {
  it("maps anchors exactly while preserving cell predictions", () => {
    const fit = fitLatentModel(syntheticCells(), {
      identification: { referenceBenchmarkId: "ref" },
      lambdaAlpha: 0.0001,
      lambdaCapability: 0.0001,
      lambdaDifficulty: 0.0001,
      maxIterations: 2_000,
    });
    const before = fit.cells.map((entry) => entry.predicted);
    const anchored = reanchorFit(fit, [
      { modelId: "m3", value: 100 },
      { modelId: "m5", value: 110 },
    ]).fit;
    expect(anchored.capabilities.m3).toBeCloseTo(100, 10);
    expect(anchored.capabilities.m5).toBeCloseTo(110, 10);
    expect(anchored.cells.map((entry) => entry.predicted)).toEqual(before);
  });

  it("rejects reversed anchor ordering", () => {
    expect(() => computeAnchorTransform({ low: 0, high: 1 }, [
      { modelId: "low", value: 10 },
      { modelId: "high", value: 0 },
    ])).toThrow(/ordering/);
  });

  it("rejects close or under-covered publication anchors", () => {
    expect(() => validateAnchorEligibility({ low: 0, high: 2.4 }, [
      ...Array.from({ length: 6 }, (_, index) => cell("low", `b${index}`, 0)),
      ...Array.from({ length: 6 }, (_, index) => cell("high", `b${index}`, 1)),
    ], [{ modelId: "low", value: 40 }, { modelId: "high", value: 100 }])).toThrow(/at least 2.5/);
    expect(() => validateAnchorEligibility({ low: 0, high: 3 }, [
      ...Array.from({ length: 5 }, (_, index) => cell("low", `b${index}`, 0)),
      ...Array.from({ length: 6 }, (_, index) => cell("high", `b${index}`, 1)),
    ], [{ modelId: "low", value: 40 }, { modelId: "high", value: 100 }])).toThrow(/at least 6/);
  });

  it("calibrates a new benchmark without changing frozen capabilities", () => {
    const newCells = Object.entries(trueCapabilities).map(([modelId, capability]) =>
      cell(modelId, "new", 1.25 * (capability - 0.4), 0.08),
    );
    const frozen = { ...trueCapabilities };
    const calibrated = calibrateNewBenchmark(newCells, frozen, {
      lambdaAlpha: 0.0001,
      lambdaDifficulty: 0.0001,
      maxIterations: 3_000,
    });
    expect(calibrated.difficulty).toBeCloseTo(0.4, 2);
    expect(calibrated.discrimination).toBeCloseTo(1.25, 2);
    expect(frozen).toEqual(trueCapabilities);
  });

  it("fixed-calibrates correctly on the published anchored score scale", () => {
    const newCells = Object.entries(trueCapabilities).map(([modelId, capability]) =>
      cell(modelId, "new", 1.25 * (capability - 0.4), 0.08),
    );
    const publishedCapabilities = Object.fromEntries(
      Object.entries(trueCapabilities).map(([modelId, capability]) => [modelId, 100 + 10 * capability]),
    );
    const calibrated = calibrateNewBenchmark(newCells, publishedCapabilities, {
      lambdaAlpha: 0.000001,
      lambdaDifficulty: 0.000001,
      maxIterations: 4_000,
    });
    expect(calibrated.difficulty).toBeCloseTo(104, 1);
    expect(calibrated.discrimination).toBeCloseTo(0.125, 2);
  });

  it("fails closed when fixed calibration does not converge", () => {
    const newCells = Object.entries(trueCapabilities).map(([modelId, capability]) =>
      cell(modelId, "new", 1.25 * (capability - 0.4), 0.08),
    );
    expect(() => calibrateNewBenchmark(newCells, trueCapabilities, { maxIterations: 1 })).toThrow(
      /Fixed calibration for new did not converge after 1 iterations \(best objective/,
    );
  });

  it("can apply an explicit affine transform", () => {
    const fit = fitLatentModel(syntheticCells(), {
      identification: { referenceBenchmarkId: "ref" },
      maxIterations: 200,
    });
    const transformed = applyAnchorTransform(fit, { scale: 2, offset: 10 });
    expect(transformed.capabilities.m3).toBeCloseTo((fit.capabilities.m3 ?? 0) * 2 + 10);
    expect(transformed.discriminations.coding).toBeCloseTo((fit.discriminations.coding ?? 0) / 2);
  });
});
