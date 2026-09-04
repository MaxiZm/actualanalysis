import { describe, expect, it } from "vitest";
import { fitEciCompatible } from "../src/fit.js";
import { spearmanRankCorrelation } from "../src/math.js";
import fixture from "./fixtures/eci-synthetic-ordering.json";
import { cell } from "./helpers.js";

describe("ECI compatibility ordering gate", () => {
  it("clears Spearman >= 0.99 on the checked-in deterministic fixture", () => {
    // This fixture is explicitly synthetic. Official eci-public outputs are kept
    // out of-tree and compared by scripts/crosscheck/compare_ordering.py.
    expect(fixture.fixture_kind).toBe("synthetic_eci_compatibility");
    expect(fixture.description).toContain("not an export from eci-public");
    const cells = fixture.cells.map((entry) =>
      cell(entry.model_id, entry.benchmark_id, entry.y, entry.tau),
    );
    const fit = fitEciCompatible(cells, {
      identification: { referenceBenchmarkId: fixture.reference_benchmark_id },
      lambdaAlpha: 0.001,
      lambdaCapability: 0.001,
      lambdaDifficulty: 0.001,
      maxIterations: 4_000,
      tolerance: 1e-7,
    });
    const correlation = spearmanRankCorrelation(
      fit.capabilities,
      fixture.reference_capabilities,
    );
    expect(correlation).toBeGreaterThanOrEqual(0.99);
  });

  it("does not allow cell-noise estimates to reweight the compatibility fit", () => {
    const normalNoise = fixture.cells.map((entry) =>
      cell(entry.model_id, entry.benchmark_id, entry.y, entry.tau),
    );
    const arbitraryNoise = fixture.cells.map((entry, index) =>
      cell(entry.model_id, entry.benchmark_id, entry.y, index % 2 === 0 ? 0.001 : 100),
    );
    const options = {
      identification: { referenceBenchmarkId: fixture.reference_benchmark_id },
      lambdaAlpha: 0.001,
      lambdaCapability: 0.001,
      lambdaDifficulty: 0.001,
      maxIterations: 2_000,
    } as const;
    const first = fitEciCompatible(normalNoise, options);
    const second = fitEciCompatible(arbitraryNoise, options);
    expect(second.capabilities).toEqual(first.capabilities);
  });
});
