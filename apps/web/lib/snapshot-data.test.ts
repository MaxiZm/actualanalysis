import { describe, expect, it } from "vitest";

import { mapCommittedSnapshot } from "./snapshot-data";

function canonicalSnapshot() {
  const runs = ["mixed", "agentic", "chat"].map((kind) => ({
    id: `run-${kind}`,
    kind,
    methodVersion: "aci-1.0.0",
    params: { bootstrap_iterations: 500 },
    createdAt: "2026-09-03T12:00:00.000Z",
  }));
  return {
    generated_at: "2026-09-03T12:30:00.000Z",
    license: "CC-BY-4.0",
    exclusions: ["speed observations are non-redistributable and are never included"],
    runs,
    scores: runs.map((run, index) => ({
      runId: run.id,
      modelId: "model-a",
      score: 110 + index,
      ciLow: 108 + index,
      ciHigh: 112 + index,
      rank: 1,
      rankLow: 1,
      rankHigh: 1,
      coverage: 0.92,
      nPrivate: 2,
      robustScore: 109 + index,
      flags: [{ kind: "loo_sensitive", detail: `${run.kind} diagnostic` }],
      provisional: false,
      pairwise: { "model-b": 0.875 },
    })),
    benchmark_params: runs.map((run) => ({
      runId: run.id,
      benchmarkId: "benchmark-a",
      difficulty: 0.4,
      slope: 1.3,
      weight: 0.72,
      weightFactors: { discrimination: 0.8, saturation: 0.9, sources: 1, privacy: 1 },
      residualVar: 0.1,
    })),
    cells: runs.map((run) => ({
      runId: run.id,
      modelId: "model-a",
      benchmarkId: "benchmark-a",
      y: 0.4,
      yHat: 0.3,
      z: 0.25,
      used: true,
    })),
    results: [{
      id: "00000000-0000-4000-8000-000000000001",
      modelId: "model-a",
      benchmarkId: "benchmark-a",
      sourceId: "source-a",
      score: 62,
      scoreUnit: "percent",
      se: 2,
      nItems: 100,
      config: { reasoning_effort: "high" },
      harness: "Independent harness",
      observedOn: "2026-09-02",
      url: "https://example.com/benchmark-result",
      supersededBy: null as string | null,
    }],
    models: [{
      id: "model-a",
      slug: "model-a",
      name: "Model A",
      org: "Open Lab",
      family: "A family",
      releaseDate: "2026-08-01",
      openWeights: true,
      license: "Apache-2.0",
      reasoningConfig: { effort: "high" },
      aliases: ["provider/model-a"],
    }],
    benchmarks: [{
      id: "benchmark-a",
      slug: "benchmark-a",
      name: "Benchmark A",
      version: "2026.1",
      tags: ["agentic", "chat"],
      categories: ["reasoning"],
      chanceLevel: 0,
      holdout: "private",
      transform: { type: "accuracy", input_scale: "percent" },
      nItems: 100,
      status: "active",
      harnessUrl: "https://example.com/benchmark-harness",
    }],
    sources: [{ id: "source-a", name: "Independent runner", kind: "runner", redistributable: true }],
    pricing: [{
      modelId: "model-a",
      sourceId: "source-a",
      provider: "Gateway",
      inputPerM: 1.25,
      outputPerM: 5,
      cacheReadPerM: 0.25,
      contextLength: 131_072,
      maxOutput: 16_384,
      fetchedAt: "2026-09-03T10:00:00.000Z",
    }],
  };
}

describe("committed snapshot mapping", () => {
  it("maps the canonical database export into all production views without speed", () => {
    const mapped = mapCommittedSnapshot(canonicalSnapshot(), "2026-09-03");

    expect(mapped?.status).toMatchObject({ mode: "snapshot", published: true, snapshotDate: "2026-09-03" });
    expect(mapped?.runs.map((run) => run.kind)).toEqual(["mixed", "agentic", "chat"]);
    expect(mapped?.models).toHaveLength(1);
    expect(mapped?.models[0]).toMatchObject({
      slug: "model-a",
      organization: "Open Lab",
      contextWindow: 131_072,
      maxOutput: 16_384,
      reasoning: "high",
      speed: null,
      aliases: ["provider/model-a"],
    });
    expect(mapped?.models[0]?.indexes.mixed).toMatchObject({
      score: 110,
      rank: 1,
      coverage: 0.92,
      provisional: false,
      flags: ["mixed diagnostic"],
      pairwise: { "model-b": 0.875 },
    });
    expect(mapped?.benchmarks[0]).toMatchObject({
      slug: "benchmark-a",
      difficulty: 0.4,
      slope: 1.3,
      weight: 0.72,
      categories: ["reasoning"],
      sourceNames: ["Independent runner"],
      harnessUrl: "https://example.com/benchmark-harness",
    });
    expect(mapped?.results[0]).toMatchObject({
      modelSlug: "model-a",
      benchmarkSlug: "benchmark-a",
      sourceKind: "independent",
      sourceName: "Independent runner",
      sourceUrl: "https://example.com/benchmark-result",
      rawScore: 62,
      scoreUnit: "percent",
      harness: "Independent harness",
      config: { reasoning_effort: "high" },
      used: true,
      residualZ: 0.25,
    });
    expect(mapped?.history).toHaveLength(3);
    expect(JSON.stringify(mapped)).not.toContain("tokensPerSecond");
  });

  it("does not repeat a benchmark version already present in its name", () => {
    const snapshot = canonicalSnapshot();
    snapshot.benchmarks[0]!.name = "Terminal-Bench 4.0";
    snapshot.benchmarks[0]!.version = "4.0";

    expect(mapCommittedSnapshot(snapshot, "2026-09-03")?.benchmarks[0]?.description).toBe(
      "Terminal-Bench 4.0 is registered as a private benchmark in this public snapshot.",
    );
  });

  it("rejects a partial snapshot that cannot supply every public index", () => {
    const snapshot = canonicalSnapshot();
    snapshot.runs = snapshot.runs.filter((run) => run.kind !== "chat");
    snapshot.scores = snapshot.scores.filter((score) => score.runId !== "run-chat");

    expect(mapCommittedSnapshot(snapshot, "2026-09-03")).toBeNull();
  });

  it("rejects exports that accidentally carry speed observations", () => {
    const snapshot = { ...canonicalSnapshot(), speed: [{ tokensPerS: 99 }] };
    expect(mapCommittedSnapshot(snapshot, "2026-09-03")).toBeNull();
  });

  it("accepts a scored snapshot with no redistributable raw observations", () => {
    const snapshot = { ...canonicalSnapshot(), sources: [], results: [], pricing: [] };
    const mapped = mapCommittedSnapshot(snapshot, "2026-09-03");
    expect(mapped?.status.published).toBe(true);
    expect(mapped?.models[0]?.pricing).toEqual([]);
    expect(mapped?.results).toEqual([]);
  });

  it("derives kept provenance from lineage when public fitted cells are omitted", () => {
    const snapshot = canonicalSnapshot();
    snapshot.cells = [];

    const kept = mapCommittedSnapshot(snapshot, "2026-09-03")?.results[0];
    expect(kept).toMatchObject({
      used: true,
      predicted: null,
      residualZ: null,
      sourceName: "Independent runner",
      sourceUrl: "https://example.com/benchmark-result",
      harness: "Independent harness",
      config: { reasoning_effort: "high" },
      scoreUnit: "percent",
    });

    snapshot.results[0]!.supersededBy = "00000000-0000-4000-8000-000000000002";
    expect(mapCommittedSnapshot(snapshot, "2026-09-03")?.results[0]?.used).toBe(false);
  });

  it("retains a source that forbids redistribution and marks its evidence display-only", () => {
    const snapshot = canonicalSnapshot();
    snapshot.sources[0]!.redistributable = false;
    expect(mapCommittedSnapshot(snapshot, "2026-09-03")?.results[0]).toMatchObject({ displayOnly: true });
  });

  it("ignores provisional state from an older run of the same index", () => {
    const snapshot = canonicalSnapshot();
    snapshot.runs.push({
      id: "run-mixed-old",
      kind: "mixed",
      methodVersion: "aci-0.9.0",
      params: { bootstrap_iterations: 500 },
      createdAt: "2026-09-02T12:00:00.000Z",
    });
    snapshot.scores.push({
      ...snapshot.scores[0]!,
      runId: "run-mixed-old",
      provisional: true,
      flags: [{ kind: "historical", detail: "historical diagnostic" }],
    });

    const mapped = mapCommittedSnapshot(snapshot, "2026-09-03");
    expect(mapped?.models[0]?.indexes.mixed?.provisional).toBe(false);
    expect(mapped?.models[0]?.indexes.mixed?.flags).toEqual(["mixed diagnostic"]);
  });

  it("keeps provisional state isolated to its selected index", () => {
    const snapshot = canonicalSnapshot();
    const agentic = snapshot.scores.find((score) => score.runId === "run-agentic");
    if (!agentic) throw new Error("canonical snapshot is missing agentic score");
    agentic.provisional = true;
    agentic.flags = [{ kind: "provisional", detail: "score is shrunk and unranked" }];

    const mapped = mapCommittedSnapshot(snapshot, "2026-09-03");
    expect(mapped?.models[0]?.indexes.mixed?.provisional).toBe(false);
    expect(mapped?.models[0]?.indexes.mixed?.flags).toEqual(["mixed diagnostic"]);
    expect(mapped?.models[0]?.indexes.agentic?.provisional).toBe(true);
    expect(mapped?.models[0]?.indexes.agentic?.flags).toEqual(["score is shrunk and unranked"]);
  });

  it("keeps a model visible when it is scored in only one selected index", () => {
    const snapshot = canonicalSnapshot();
    snapshot.models.push({
      ...snapshot.models[0]!,
      id: "mixed-only",
      slug: "mixed-only",
      name: "Mixed Only",
    });
    snapshot.scores.push({
      ...snapshot.scores[0]!,
      modelId: "mixed-only",
      flags: [{ kind: "mixed_only", detail: "mixed-only diagnostic" }],
    });

    const mapped = mapCommittedSnapshot(snapshot, "2026-09-03");
    const model = mapped?.models.find((candidate) => candidate.id === "mixed-only");
    expect(model?.indexes).toEqual({
      mixed: expect.objectContaining({ flags: ["mixed-only diagnostic"] }),
    });
  });
});
