import { describe, expect, it } from "vitest";
import { computeBenchmarkWeights } from "../src/weights.js";
import type { BenchmarkDefinition, FitResult } from "../src/types.js";
import { cell } from "./helpers.js";

describe("category-balanced benchmark weights", () => {
  it("normalizes categories equally and enforces the maximum share", () => {
    const definitions: BenchmarkDefinition[] = ["math-1", "math-2", "code-1", "code-2", "code-3", "code-4"].map((id) => ({
      id,
      name: id,
      tags: ["chat"],
      categories: [id.startsWith("math") ? "mathematics" : "software-engineering"],
      holdout: "private",
      transform: { kind: "accuracy" },
    }));
    const cells = definitions.map((benchmark) => cell("model", benchmark.id, 0, 0.15));
    const fit: FitResult = {
      capabilities: { model: 0 },
      difficulties: Object.fromEntries(definitions.map((benchmark) => [benchmark.id, 0])),
      discriminations: Object.fromEntries(definitions.map((benchmark) => [benchmark.id, 1])),
      cells: [],
      objective: 0,
      iterations: 300,
      converged: true,
      gradientNorm: 0,
      maximumUpdate: 0,
      referenceBenchmarkId: "math-1",
    };

    const weights = computeBenchmarkWeights(definitions, cells, fit, { maxShare: 0.25 });
    const total = Object.values(weights).reduce((sum, weight) => sum + weight.weight, 0);
    const math = Object.values(weights).filter((weight) => weight.benchmarkId.startsWith("math")).reduce((sum, weight) => sum + weight.weight, 0);
    const code = total - math;

    expect(total).toBeCloseTo(2, 10);
    expect(math).toBeCloseTo(1, 10);
    expect(code).toBeCloseTo(1, 10);
    expect(Math.max(...Object.values(weights).map((weight) => weight.weight / total))).toBeLessThanOrEqual(0.25);
    expect(Object.values(weights).every((weight) => weight.factors.discrimination === 1)).toBe(true);
  });

  it("rejects an infeasible cap", () => {
    const definitions: BenchmarkDefinition[] = ["a", "b"].map((id) => ({
      id,
      name: id,
      tags: ["chat"],
      categories: ["reasoning"],
      holdout: "private",
      transform: { kind: "accuracy" },
    }));
    const fit = {
      capabilities: { model: 0 }, difficulties: { a: 0, b: 0 }, discriminations: { a: 1, b: 1 }, cells: [],
      objective: 0, iterations: 300, converged: true, gradientNorm: 0, maximumUpdate: 0, referenceBenchmarkId: "a",
    } satisfies FitResult;
    expect(() => computeBenchmarkWeights(definitions, definitions.map((benchmark) => cell("model", benchmark.id, 0)), fit, { maxShare: 0.15 })).toThrow(/infeasible/);
  });
});
