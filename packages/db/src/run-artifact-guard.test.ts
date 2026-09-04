import { describe, expect, it } from "vitest";
import { RunArtifactSchema } from "./run-artifact.js";

const base = {
  kind: "mixed",
  method_version: "1.2.3",
  created_at: "2026-09-04T00:00:00.000Z",
  params: { joint_posterior_path: "/tmp/posterior.npz" },
  scores: [],
  benchmark_params: [],
  cells: [],
};

const diagnostics = { engine: "numpyro-nuts", accepted: true, posterior_draws: 8000, elapsed_seconds: 120, divergences: 0 };

describe("run artifact integrity guard", () => {
  it("rejects a 1.2.x artifact that lacks real NUTS diagnostics", () => {
    expect(() => RunArtifactSchema.parse(base)).toThrow(/diagnostics/);
    expect(() => RunArtifactSchema.parse({ ...base, params: { ...base.params, diagnostics: { ...diagnostics, engine: "affine-relabel" } } })).toThrow(/numpyro-nuts/);
    expect(() => RunArtifactSchema.parse({ ...base, params: { ...base.params, diagnostics: { ...diagnostics, accepted: false } } })).toThrow(/accepted/);
    expect(() => RunArtifactSchema.parse({ ...base, params: { ...base.params, diagnostics: { ...diagnostics, posterior_draws: 100 } } })).toThrow(/posterior_draws/);
  });

  it("accepts a 1.2.x artifact with accepted NUTS diagnostics and a posterior path", () => {
    expect(RunArtifactSchema.parse({ ...base, params: { ...base.params, diagnostics } }).method_version).toBe("1.2.3");
  });

  it("does not apply the guard to legacy or test-suffixed versions", () => {
    expect(RunArtifactSchema.parse({ ...base, method_version: "1.0.0", params: {} }).method_version).toBe("1.0.0");
    expect(RunArtifactSchema.parse({ ...base, method_version: "1.2.3-test", params: {} }).method_version).toBe("1.2.3-test");
  });
});
