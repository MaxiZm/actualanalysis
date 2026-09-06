import { describe, expect, it } from "vitest";

import {
  computeCoverage,
  diagnosticFlags,
  logitToNative,
  mapCommittedSnapshot,
  nativeToLogit,
  selectPublishedRuns,
} from "./snapshot-data";

function canonicalSnapshot() {
  const system = {
    model_id: "model-a",
    profile: "max-common",
    tier: "ranked",
    aci_g: { median: 110, low: 108, high: 112, sd: 1.2, width: 4 },
    domains: {
      agentic: {
        median: 104,
        low: 100,
        high: 108,
        sd: 2,
        width: 8,
        published: true,
        extrapolated: false,
        r_s: 0.8,
        n_sk: 3,
      },
      reasoning: {
        median: 99,
        low: 90,
        high: 108,
        sd: 5,
        width: 18,
        published: false,
        extrapolated: true,
        r_s: 0.3,
        n_sk: 1,
      },
    },
    baskets: {
      general: {
        median: 61,
        low: 58,
        high: 64,
        sd: 1.5,
        width: 6,
        published: true,
        missing_benchmarks: [],
      },
      coding: {
        median: 55,
        low: 50,
        high: 60,
        sd: 2.5,
        width: 10,
        published: false,
        missing_benchmarks: ["benchmark-z"],
      },
    },
    evidence: {
      fitted_cells: 4,
      domains: 2,
      safe_independent_cells: 1,
      max_benchmark_share: 0.4,
      max_family_share: 0.4,
      own_data_reduction: 0.7,
      concentration_c_sf: 0.2,
      loo_max_delta: null,
      exposure_gap: null,
      adversarial_shift: null,
    },
  };
  const runs = ["mixed", "agentic", "chat"].map((kind) => ({
    id: `run-${kind}`,
    kind,
    methodVersion: "aci-1.0.0",
    params: {
      bootstrap_iterations: 500,
      default_profile: "max-common",
      systems: { "model-a@max-common": system } as Record<string, unknown>,
    },
    createdAt: "2026-09-03T12:00:00.000Z",
  }));
  return {
    generated_at: "2026-09-03T12:30:00.000Z",
    license: "CC-BY-4.0",
    exclusions: [
      "speed observations are non-redistributable and are never included",
    ],
    runs,
    scores: runs.map((run, index) => ({
      runId: run.id,
      modelId: "model-a",
      systemId: "model-a@max-common",
      profile: "max-common",
      tier: "ranked",
      score: 110 + index,
      ciLow: 108 + index,
      ciHigh: 112 + index,
      rank: 1,
      rankLow: 1,
      rankHigh: 1,
      coverage: 0.92,
      nPrivate: 2,
      robustScore: 109 + index,
      flags: [
        { kind: "evidence_tier", detail: "ranked" },
        { kind: "system_profile", detail: "max-common" },
        { kind: "loo_sensitive", detail: `${run.kind} diagnostic` },
      ],
      provisional: false,
      pairwise: { "model-b": 0.875 },
      evidence: system.evidence,
    })),
    benchmark_params: runs.map((run) => ({
      runId: run.id,
      benchmarkId: "benchmark-a",
      difficulty: 0.4,
      slope: 1.3,
      weight: 0.72,
      weightFactors: {
        discrimination: 0.8,
        saturation: 0.9,
        sources: 1,
        privacy: 1,
      },
      residualVar: 0.1,
    })),
    cells: runs.map((run) => ({
      runId: run.id,
      modelId: "model-a",
      systemId: "model-a@max-common",
      profile: "max",
      benchmarkId: "benchmark-a",
      y: 0.4,
      yHat: 0.3,
      z: 0.25,
      used: true,
    })),
    results: [
      {
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
      },
    ],
    models: [
      {
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
      },
    ],
    benchmarks: [
      {
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
      },
    ],
    sources: [
      {
        id: "source-a",
        name: "Independent runner",
        kind: "runner",
        redistributable: true,
      },
    ],
    pricing: [
      {
        modelId: "model-a",
        sourceId: "source-a",
        provider: "Gateway",
        inputPerM: 1.25,
        outputPerM: 5,
        cacheReadPerM: 0.25,
        contextLength: 131_072,
        maxOutput: 16_384,
        fetchedAt: "2026-09-03T10:00:00.000Z",
      },
    ],
  };
}

describe("committed snapshot mapping", () => {
  it("labels the maximum-effort assumption without replacing source settings or relabelling older runs", () => {
    const snapshot = canonicalSnapshot();
    const result = { ...snapshot.results[0]!, config: {} };
    const rows = [result,
      { ...result, id: "explicit-medium", config: { thinking_level: "medium" } },
      { ...result, id: "explicit-top-level", effortTier: "high" },
    ];
    const updated = { ...snapshot, results: rows, runs: snapshot.runs.map(r => ({ ...r, params: { ...r.params, unreported_effort_policy: "maximum" } })) };
    const mapped = mapCommittedSnapshot(updated, "2026-09-06")!;
    expect(mapped.results[0]?.config).toEqual({ index_effort_assumption: "maximum", source_effort: "not reported" });
    expect(mapped.results[1]?.config).toEqual({ thinking_level: "medium" });
    expect(mapped.results[2]?.config).toEqual({});
    expect(result.config).toEqual({});
    expect(mapCommittedSnapshot({ ...snapshot, results: [result] }, "2026-09-05")?.results[0]?.config).toEqual({});
  });

  it("retains catalog models without an estimate instead of silently hiding them", () => {
    const snapshot = canonicalSnapshot();
    snapshot.models.push({
      ...snapshot.models[0]!,
      id: "new-model",
      slug: "new-model",
      name: "New Model",
    });
    snapshot.pricing.push({
      ...snapshot.pricing[0]!,
      modelId: "new-model",
      inputPerM: 2,
    });
    const model = mapCommittedSnapshot(snapshot, "2026-09-03")?.models.find(
      (row) => row.id === "new-model",
    );
    expect(model).toBeDefined();
    expect(model?.indexes).toEqual({});
    expect(model?.pricing[0]?.inputPerMillion).toBe(2);
  });

  it("maps the canonical database export into all production views without speed", () => {
    const mapped = mapCommittedSnapshot(canonicalSnapshot(), "2026-09-03");

    expect(mapped?.status).toMatchObject({
      mode: "snapshot",
      published: true,
      snapshotDate: "2026-09-03",
    });
    expect(mapped?.runs.map((run) => run.kind)).toEqual([
      "mixed",
      "agentic",
      "chat",
    ]);
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
      coverageCount: 1,
      coverageTotal: 1,
      provisional: false,
      tier: "ranked",
      systemId: "model-a@max-common",
      profile: "max-common",
      flags: ["mixed diagnostic"],
      pairwise: { "model-b": 0.875 },
    });
    expect(mapped?.models[0]?.system).toMatchObject({
      id: "model-a@max-common",
      profile: "max-common",
      tier: "ranked",
      aciG: { median: 110, low: 108, high: 112 },
      domains: {
        agentic: {
          median: 104,
          published: true,
          extrapolated: false,
          ownDataReduction: 0.8,
          fittedCells: 3,
        },
        reasoning: { published: false, extrapolated: true },
      },
      baskets: {
        general: { median: 61, published: true, missingBenchmarks: [] },
        coding: { published: false, missingBenchmarks: ["benchmark-z"] },
      },
      evidence: {
        fittedCells: 4,
        domains: 2,
        safeIndependentCells: 1,
        maxFamilyShare: 0.4,
        ownDataReduction: 0.7,
        concentration: 0.2,
        looMaxDelta: null,
        exposureGap: null,
        adversarialShift: null,
      },
    });
    expect(mapped?.benchmarks[0]).toMatchObject({
      slug: "benchmark-a",
      difficulty: 0.4,
      slope: 1.3,
      misfitSd: Math.sqrt(0.1),
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
      observedLogit: 0.4,
      predictedLogit: 0.3,
    });
    expect(mapped?.results[0]?.score).toBeCloseTo(0.62, 6);
    expect(mapped?.results[0]?.predictedNative).toBeCloseTo(57.444, 2);
    expect(mapped?.results[0]?.predicted).toBeCloseTo(0.57444, 4);
    expect(mapped?.history).toHaveLength(3);
    expect(JSON.stringify(mapped)).not.toContain("tokensPerSecond");
  });

  it("does not repeat a benchmark version already present in its name", () => {
    const snapshot = canonicalSnapshot();
    snapshot.benchmarks[0]!.name = "Terminal-Bench 4.0";
    snapshot.benchmarks[0]!.version = "4.0";

    expect(
      mapCommittedSnapshot(snapshot, "2026-09-03")?.benchmarks[0]?.description,
    ).toBe(
      "Terminal-Bench 4.0 is registered as a private benchmark in this public snapshot.",
    );
  });

  it("rejects a partial snapshot that cannot supply every public index", () => {
    const snapshot = canonicalSnapshot();
    snapshot.runs = snapshot.runs.filter((run) => run.kind !== "chat");
    snapshot.scores = snapshot.scores.filter(
      (score) => score.runId !== "run-chat",
    );

    expect(mapCommittedSnapshot(snapshot, "2026-09-03")).toBeNull();
  });

  it("rejects exports that accidentally carry speed observations", () => {
    const snapshot = { ...canonicalSnapshot(), speed: [{ tokensPerS: 99 }] };
    expect(mapCommittedSnapshot(snapshot, "2026-09-03")).toBeNull();
  });

  it("accepts a scored snapshot with no redistributable raw observations", () => {
    const snapshot = {
      ...canonicalSnapshot(),
      sources: [],
      results: [],
      pricing: [],
    };
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
    expect(mapCommittedSnapshot(snapshot, "2026-09-03")?.results[0]?.used).toBe(
      false,
    );
  });

  it("retains a source that forbids redistribution and marks its evidence display-only", () => {
    const snapshot = canonicalSnapshot();
    snapshot.sources[0]!.redistributable = false;
    expect(
      mapCommittedSnapshot(snapshot, "2026-09-03")?.results[0],
    ).toMatchObject({ displayOnly: true });
  });

  it("ignores provisional state from an older run of the same index", () => {
    const snapshot = canonicalSnapshot();
    snapshot.runs.push({
      id: "run-mixed-old",
      kind: "mixed",
      methodVersion: "aci-0.9.0",
      params: {
        bootstrap_iterations: 500,
        default_profile: "max-common",
        systems: {} as Record<string, unknown>,
      },
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
    expect(mapped?.models[0]?.indexes.mixed?.flags).toEqual([
      "mixed diagnostic",
    ]);
  });

  it("keeps provisional state isolated to its selected index", () => {
    const snapshot = canonicalSnapshot();
    const agentic = snapshot.scores.find(
      (score) => score.runId === "run-agentic",
    );
    if (!agentic)
      throw new Error("canonical snapshot is missing agentic score");
    agentic.provisional = true;
    agentic.flags = [
      { kind: "provisional", detail: "score is shrunk and unranked" },
    ];

    const mapped = mapCommittedSnapshot(snapshot, "2026-09-03");
    expect(mapped?.models[0]?.indexes.mixed?.provisional).toBe(false);
    expect(mapped?.models[0]?.indexes.mixed?.flags).toEqual([
      "mixed diagnostic",
    ]);
    expect(mapped?.models[0]?.indexes.agentic?.provisional).toBe(true);
    expect(mapped?.models[0]?.indexes.agentic?.flags).toEqual([
      "score is shrunk and unranked",
    ]);
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
    const model = mapped?.models.find(
      (candidate) => candidate.id === "mixed-only",
    );
    expect(model?.indexes).toEqual({
      mixed: expect.objectContaining({ flags: ["mixed-only diagnostic"] }),
    });
  });

  it("hides interval-only rows behind the provisional flag and downgrades a ranked tier without a point score", () => {
    const snapshot = canonicalSnapshot();
    const chat = snapshot.scores.find((score) => score.runId === "run-chat")!;
    chat.score = null as unknown as number;
    chat.rank = null as unknown as number;
    chat.tier = "ranked";
    chat.provisional = true;

    const mapped = mapCommittedSnapshot(snapshot, "2026-09-03");
    expect(mapped?.models[0]?.indexes.chat).toMatchObject({
      score: null,
      provisional: true,
      tier: "provisional",
    });
    expect(mapped?.models[0]?.indexes.chat?.flags).toContain(
      "reported tier ranked without a published point score",
    );
    expect(mapped?.models[0]?.indexes.mixed).toMatchObject({
      provisional: false,
      tier: "ranked",
    });
  });

  it("prefers same-version agentic and chat runs over a newer run of another method version", () => {
    const snapshot = canonicalSnapshot();
    snapshot.runs.push({
      id: "run-chat-newer-legacy",
      kind: "chat",
      methodVersion: "aci-0.9.0",
      params: {
        bootstrap_iterations: 500,
        default_profile: "max-common",
        systems: {} as Record<string, unknown>,
      },
      createdAt: "2026-09-04T12:00:00.000Z",
    });
    const selected = selectPublishedRuns(
      snapshot.runs as Parameters<typeof selectPublishedRuns>[0],
    );
    expect(selected.mixed?.id).toBe("run-mixed");
    expect(selected.chat?.id).toBe("run-chat");
  });

  it("keeps only diagnostic flags, moving tier and profile markers to badges", () => {
    expect(
      diagnosticFlags([
        { kind: "evidence_tier", detail: "provisional" },
        { kind: "system_profile", detail: "max-common" },
        { kind: "loo_sensitive", detail: "LOO shift 2.1" },
        "public–private gap",
      ]),
    ).toEqual(["LOO shift 2.1", "public–private gap"]);
  });

  it("inverts benchmark transforms back to native units", () => {
    const accuracy = {
      id: "a",
      slug: "a",
      name: "A",
      version: "1",
      tags: [],
      categories: ["x"],
      holdout: "public" as const,
      transform: { type: "accuracy", input_scale: "percent" },
      chanceLevel: 0.25,
      status: "active",
    };
    const elo = {
      ...accuracy,
      transform: { type: "elo", scale: 400, reference_elo: 1400 },
    };
    const horizon = {
      ...accuracy,
      transform: { type: "metr_horizon", scale: 2, midpoint_log2_minutes: 8 },
    };
    const money = {
      ...accuracy,
      transform: {
        type: "log_relative",
        base: 2,
        scale: 1,
        reference_value: 63000,
      },
    };
    expect(logitToNative(0, accuracy, "percent")).toBeCloseTo(62.5, 6);
    expect(
      logitToNative(
        nativeToLogit(80, accuracy, "percent")!,
        accuracy,
        "percent",
      ),
    ).toBeCloseTo(80, 6);
    expect(nativeToLogit(1507.4, elo, "elo")).toBeCloseTo(0.618, 2);
    expect(logitToNative(0.618, elo, "elo")).toBeCloseTo(1507.3, 0);
    expect(
      logitToNative(nativeToLogit(90, horizon, "minutes")!, horizon, "minutes"),
    ).toBeCloseTo(90, 6);
    expect(
      logitToNative(nativeToLogit(2, horizon, "hours")!, horizon, "hours"),
    ).toBeCloseTo(2, 6);
    expect(nativeToLogit(8017.59, money, "currency")).toBeCloseTo(-2.974, 2);
    expect(logitToNative(-2.974, money, "currency")).toBeCloseTo(8017, -1);
  });
});

describe("fitted-cell coverage", () => {
  const params = [
    { runId: "run-1", benchmarkId: "b1", difficulty: 0, slope: 1 },
    { runId: "run-1", benchmarkId: "b2", difficulty: 0, slope: 1 },
    { runId: "run-1", benchmarkId: "b3", difficulty: 0, slope: 1 },
    { runId: "run-0", benchmarkId: "b9", difficulty: 0, slope: 1 },
  ];
  const cells = [
    {
      runId: "run-1",
      modelId: "m",
      systemId: "m@max-common",
      profile: "max",
      benchmarkId: "b1",
      y: 0,
      yHat: 0,
      z: 0,
      used: true,
    },
    {
      runId: "run-1",
      modelId: "m",
      systemId: "m@max-common",
      profile: "max",
      benchmarkId: "b2",
      y: 0,
      yHat: 0,
      z: 0,
      used: false,
    },
    {
      runId: "run-1",
      modelId: "m",
      systemId: "m@std-common",
      profile: "std",
      benchmarkId: "b3",
      y: 0,
      yHat: 0,
      z: 0,
      used: true,
    },
    {
      runId: "run-0",
      modelId: "m",
      systemId: "m@max-common",
      profile: "max",
      benchmarkId: "b9",
      y: 0,
      yHat: 0,
      z: 0,
      used: true,
    },
  ];

  it("counts distinct used cells for the system over benchmarks fitted in that run, not observations", () => {
    expect(
      computeCoverage(
        cells,
        params,
        "run-1",
        "m",
        "m@max-common",
        "max-common",
      ),
    ).toEqual({ count: 1, total: 3 });
    expect(
      computeCoverage(
        cells,
        params,
        "run-1",
        "m",
        "m@std-common",
        "max-common",
      ),
    ).toEqual({ count: 1, total: 3 });
  });

  it("never exceeds the fitted benchmark count when several observations share a benchmark", () => {
    const duplicated = [
      ...cells,
      { ...cells[0]!, y: 0.1 },
      { ...cells[0]!, y: 0.2 },
    ];
    expect(
      computeCoverage(
        duplicated,
        params,
        "run-1",
        "m",
        "m@max-common",
        "max-common",
      ),
    ).toEqual({ count: 1, total: 3 });
  });

  it("falls back to short profile names and cell benchmarks when systems or parameters are absent", () => {
    const legacyCells = cells.map((cell) => {
      const copy: Record<string, unknown> = { ...cell };
      delete copy.systemId;
      return copy as Omit<typeof cell, "systemId">;
    });
    expect(
      computeCoverage(legacyCells, [], "run-1", "m", null, "max-common"),
    ).toEqual({ count: 1, total: 3 });
    expect(
      computeCoverage([], [], "run-1", "m", null, "max-common"),
    ).toBeNull();
  });
});
