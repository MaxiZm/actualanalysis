import { describe, expect, it } from "vitest";
import { PublicSnapshotSchema } from "./import-snapshot.js";

const emptySnapshot = {
  generated_at: "2026-09-03T00:00:00.000Z",
  license: "CC-BY-4.0",
  exclusions: ["speed observations are non-redistributable and are never included"],
  models: [],
  benchmarks: [],
  sources: [],
  pricing: [],
  results: [],
  runs: [],
  scores: [],
  benchmark_params: [],
  cells: [],
};

function benchmark(id = "benchmark-a") {
  return {
    id,
    slug: id,
    name: `Benchmark ${id}`,
    version: "1",
    tags: ["chat"],
    categories: ["reasoning"],
    chanceLevel: 0,
    holdout: "private" as const,
    transform: {},
    nItems: null,
    harnessUrl: null,
    status: "active",
  };
}

describe("public snapshot contract", () => {
  it("accepts the redistributable export shape", () => {
    expect(PublicSnapshotSchema.parse(emptySnapshot).license).toBe("CC-BY-4.0");
  });

  it("rejects any top-level speed payload", () => {
    expect(PublicSnapshotSchema.safeParse({ ...emptySnapshot, speed: [] }).success).toBe(false);
  });

  it("retains score unit, provenance, and source metadata", () => {
    const parsed = PublicSnapshotSchema.parse({
      ...emptySnapshot,
      benchmarks: [benchmark()],
      sources: [{
        id: "source-a",
        name: "Public source",
        url: "https://example.com/source",
        license: "CC-BY-4.0",
        attribution: "Example publisher",
        kind: "runner",
        redistributable: true,
        redistributableBenchmarkIds: ["benchmark-a"],
      }],
      results: [{
        id: "00000000-0000-4000-8000-000000000001",
        modelId: "model-a",
        benchmarkId: "benchmark-a",
        sourceId: "source-a",
        score: 42,
        scoreUnit: "percent",
        provenance: "independent",
        se: null,
        nItems: null,
        kSamples: null,
        config: {},
        configHash: "hash",
        harness: null,
        observedOn: "2026-09-03",
        url: "https://example.com/result",
        metadata: { upstream_id: "row-1" },
        supersededBy: null,
        createdAt: "2026-09-03T00:00:00.000Z",
      }],
    });
    expect(parsed.results[0]).toMatchObject({ scoreUnit: "percent", provenance: "independent" });
  });

  it("requires benchmark categories needed to reproduce coverage", () => {
    const benchmarkRow = benchmark();
    expect(PublicSnapshotSchema.safeParse({ ...emptySnapshot, benchmarks: [benchmarkRow] }).success).toBe(true);
    const { categories: _categories, ...withoutCategories } = benchmarkRow;
    expect(PublicSnapshotSchema.safeParse({ ...emptySnapshot, benchmarks: [withoutCategories] }).success).toBe(false);
  });

  it("requires source policy metadata and accepts display-only sources", () => {
    const source = {
      id: "private-source",
      name: "Private source",
      url: "https://example.com/private",
      license: "Terms apply",
      attribution: "Example publisher",
      kind: "runner" as const,
      redistributable: false,
    };
    expect(PublicSnapshotSchema.safeParse({ ...emptySnapshot, sources: [{ ...source, redistributableBenchmarkIds: [] }] }).success).toBe(true);
    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      sources: [{ ...source, redistributable: true, redistributableBenchmarkIds: [] }],
    }).success).toBe(true);
    expect(PublicSnapshotSchema.parse({
      ...emptySnapshot,
      sources: [{ ...source, redistributable: true, redistributableBenchmarkIds: [] }],
    }).sources[0]?.attribution).toBe("Example publisher");
    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      sources: [{ ...source, redistributable: true }],
    }).success).toBe(false);
  });

  it("accepts fitted cells for on-site audit", () => {
    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      cells: [{
        runId: "00000000-0000-4000-8000-000000000001",
        modelId: "model-a",
        benchmarkId: "benchmark-a",
        y: 0.25,
        yHat: 0.2,
        z: 0.5,
        used: true,
      }],
    }).success).toBe(true);
  });

  it("rejects raw rows whose source is absent from the public source manifest", () => {
    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      results: [{
        id: "00000000-0000-4000-8000-000000000001",
        modelId: "model-a",
        benchmarkId: "benchmark-a",
        sourceId: "private-source",
        score: 0.8,
        scoreUnit: "fraction",
        provenance: "independent",
        se: 0.01,
        nItems: null,
        kSamples: null,
        config: {},
        configHash: "hash",
        harness: null,
        observedOn: "2026-09-03",
        url: "https://example.com/private-result",
        metadata: {},
        supersededBy: null,
        createdAt: "2026-09-03T00:00:00.000Z",
      }],
    }).success).toBe(false);
    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      pricing: [{
        modelId: "model-a",
        sourceId: "private-source",
        provider: "provider-a",
        inputPerM: 1,
        outputPerM: 2,
        cacheReadPerM: null,
        cacheWritePerM: null,
        contextLength: null,
        maxOutput: null,
        fetchedAt: "2026-09-03T00:00:00.000Z",
      }],
    }).success).toBe(false);
  });

  it("accepts display-only results outside a source reuse allowlist and keeps pricing source-level", () => {
    const source = {
      id: "source-a",
      name: "Public source",
      url: "https://example.com/source",
      license: "CC-BY-4.0",
      attribution: "Example publisher",
      kind: "runner" as const,
      redistributable: true as const,
      redistributableBenchmarkIds: ["benchmark-a"],
    };
    const result = {
      id: "00000000-0000-4000-8000-000000000001",
      modelId: "model-a",
      benchmarkId: "benchmark-b",
      sourceId: "source-a",
      score: 0.8,
      scoreUnit: "fraction",
      provenance: "independent",
      se: 0.01,
      nItems: null,
      kSamples: null,
      config: {},
      configHash: "hash",
      harness: null,
      observedOn: "2026-09-03",
      url: "https://example.com/result",
      metadata: {},
      supersededBy: null,
      createdAt: "2026-09-03T00:00:00.000Z",
    };
    const pricing = {
      modelId: "model-a",
      sourceId: "source-a",
      provider: "provider-a",
      inputPerM: 1,
      outputPerM: 2,
      cacheReadPerM: null,
      cacheWritePerM: null,
      contextLength: null,
      maxOutput: null,
      fetchedAt: "2026-09-03T00:00:00.000Z",
    };

    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      benchmarks: [benchmark("benchmark-a"), benchmark("benchmark-b")],
      sources: [source],
      results: [result],
    }).success).toBe(true);
    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      benchmarks: [benchmark("benchmark-a")],
      sources: [source],
      pricing: [pricing],
    }).success).toBe(true);
  });

  it("rejects duplicate or unknown benchmark permissions", () => {
    const source = {
      id: "source-a",
      name: "Public source",
      url: "https://example.com/source",
      license: "CC-BY-4.0",
      attribution: null,
      kind: "runner" as const,
      redistributable: true as const,
    };

    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      benchmarks: [benchmark()],
      sources: [{ ...source, redistributableBenchmarkIds: ["benchmark-a", "benchmark-a"] }],
    }).success).toBe(false);
    expect(PublicSnapshotSchema.safeParse({
      ...emptySnapshot,
      sources: [{ ...source, redistributableBenchmarkIds: ["unknown-benchmark"] }],
    }).success).toBe(false);
  });
});
