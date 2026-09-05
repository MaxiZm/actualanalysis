import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { IndexConfigSchema, type IndexConfig } from "@actualanalysis/shared";
import { parse } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";
import {
  auditCalibrationPanelCoverage,
  auditCalibrationPanelPerDomainCoverage,
  calibrateCapabilityDraws,
  auditReferenceCoverage,
  evaluateContaminationState,
  evidenceTier,
  informationShare,
  isFixedEffort,
  pairwisePosterior,
  partitionOverlapComponents,
  prepareAci12,
  rankPosterior,
  summarizeDraws,
  type AciBenchmarkDefinition,
  type AciObservation,
  type AciSystemDefinition,
} from "../src/aci12.js";

let config: IndexConfig;
beforeAll(async () => {
  const path = fileURLToPath(new URL("../../../data/index-config.yaml", import.meta.url));
  config = IndexConfigSchema.parse(parse(await readFile(path, "utf8")));
});

const system: AciSystemDefinition = {
  modelSnapshotId: "m",
  defaultEffortTier: "default",
  maxEffortTier: "max",
};

function benchmark(overrides: Partial<AciBenchmarkDefinition> = {}): AciBenchmarkDefinition {
  return {
    id: "b",
    familyId: "family",
    domains: { reasoning: 1 },
    primaryDomain: "reasoning",
    holdout: "private",
    chanceLevel: 0.25,
    ceiling: 1,
    obsType: "count",
    status: "active",
    ...overrides,
  };
}

function observation(overrides: Partial<AciObservation> = {}): AciObservation {
  return {
    observationId: "r",
    modelSnapshotId: "m",
    benchmarkId: "b",
    sourceId: "source",
    originProvenance: "independent",
    harnessId: "common-harness",
    harnessClass: "common",
    effortTier: "default",
    toolPolicy: "none",
    score: 0.75,
    scoreUnit: "fraction",
    ...overrides,
  };
}

describe("ACI 1.2 observation contract", () => {
  it("preserves run-level uncertainty instead of fabricating counts from a registry task-set size", () => {
    const row = prepareAci12(
      [observation({ score: 0.725, standardError: 0.07149950427751244 })],
      [system], [benchmark({ nTasks: 41, chanceLevel: 0 })], config,
    ).observations[0]!;
    expect(row.likelihood).toBe("a_prime");
    expect(row.x).toBeUndefined();
    expect(row.variance).toBeCloseTo((0.07149950427751244 / (0.725 * 0.275)) ** 2, 12);
    const exact = prepareAci12(
      [observation({ score: 0.725, xCorrect: 29, nTasks: 40, standardError: 0.07149950427751244 })],
      [system], [benchmark({ nTasks: 41, chanceLevel: 0 })], config,
    ).observations[0]!;
    expect(exact).toMatchObject({ likelihood: "a_single", x: 29, totalTrials: 40 });
  });

  it("uses the corrected A-prime delta-method variance", () => {
    const prepared = prepareAci12(
      [observation({ standardError: 0.02 })],
      [system],
      [benchmark()],
      config,
    );
    const row = prepared.observations[0]!;
    const p = (0.75 - 0.25) / 0.75;
    const seP = 0.02 / 0.75;
    expect(row.likelihood).toBe("a_prime");
    expect(row.variance).toBeCloseTo((seP / (p * (1 - p))) ** 2, 12);
  });

  it("keeps independent and self-reported replications but deduplicates lineage", () => {
    const prepared = prepareAci12(
      [
        observation({ observationId: "origin", lineageId: "lineage", hostSource: "source", nTasks: 100 }),
        observation({ observationId: "mirror", lineageId: "lineage", sourceId: "mirror", hostSource: "source", nTasks: 100 }),
        observation({ observationId: "self", sourceId: "vendor", originProvenance: "self_report", nTasks: 100 }),
      ],
      [system],
      [benchmark()],
      config,
    );
    expect(prepared.observations.map((row) => row.observationId)).toEqual(["origin", "self"]);
    expect(prepared.rejections).toContainEqual(expect.objectContaining({ observationId: "mirror", reason: "duplicate_lineage" }));
  });

  it("requires the common harness for std agentic systems", () => {
    const agentic = benchmark({ primaryDomain: "agentic", domains: { agentic: 1 } });
    const prepared = prepareAci12(
      [observation({ harnessClass: "native", nTasks: 100 })],
      [system],
      [agentic],
      config,
    );
    expect(prepared.observations).toEqual([]);
    expect(["class_unassigned", "profile_unassigned"]).toContain(prepared.rejections[0]?.reason);
  });

  it("matches declared effort tiers case-insensitively and assigns a missing tier as approximate std-common", () => {
    const matched = prepareAci12(
      [observation({ effortTier: " Default ", nTasks: 100 })],
      [system],
      [benchmark()],
      config,
    );
    expect(["std-common", "std"]).toContain(matched.observations[0]?.profile);
    const missing = prepareAci12(
      [observation({ effortTier: undefined, nTasks: 100 })],
      [system],
      [benchmark()],
      config,
    );
    expect(missing.rejections).toEqual([]);
    expect(missing.observations[0]?.profile).toBe("std-common");
    expect(missing.observations[0]?.metadataIncomplete).toBe(true);
  });

  it("rejects source-incompatible aggregates but inflates unpinned reference metadata", () => {
    const incompatible = prepareAci12(
      [observation({ nTasks: 100, sourceFitEligible: false, sourceExclusionReason: "bad denominator" })],
      [system],
      [benchmark()],
      config,
    );
    expect(incompatible.rejections).toContainEqual(expect.objectContaining({ reason: "config_mismatch", detail: "bad denominator" }));

    const unpinnedReference = prepareAci12(
      [observation({ nTasks: 100 })],
      [system],
      [benchmark({ isReference: true, benchmarkVersion: "exact", graderVersion: "exact-grader" })],
      config,
    );
    expect(unpinnedReference.rejections).toEqual([]);
    expect(unpinnedReference.observations[0]?.metadataIncomplete).toBe(true);
  });

  it("selects the active reference by independent version-matched panel coverage", () => {
    const preparation = prepareAci12(
      [
        observation({ observationId: "a1", benchmarkId: "a", benchmarkVersion: "v1", graderVersion: "g1", nTasks: 10 }),
        observation({ observationId: "b1", benchmarkId: "b", benchmarkVersion: "v1", graderVersion: "g1", nTasks: 10 }),
        observation({ observationId: "b2", modelSnapshotId: "m2", benchmarkId: "b", benchmarkVersion: "v1", graderVersion: "g1", nTasks: 10 }),
      ],
      [system, { ...system, modelSnapshotId: "m2" }],
      [benchmark({ id: "a", benchmarkVersion: "v1", graderVersion: "g1" }), benchmark({ id: "b", benchmarkVersion: "v1", graderVersion: "g1" })],
      config,
    );
    expect(auditReferenceCoverage(preparation, preparation.observations.map((row) => row.benchmark), ["m@std", "m2@std"])).toMatchObject({
      selectedBenchmarkId: "b",
      selectedCellCount: 2,
    });
  });

  it("ranks std calibration candidates by unique independent fitted cells", () => {
    const preparation = prepareAci12(
      [
        observation({ observationId: "a1", benchmarkId: "a", nTasks: 10 }),
        observation({ observationId: "b1", benchmarkId: "b", nTasks: 10 }),
        observation({ observationId: "b1-mirror", benchmarkId: "b", nTasks: 10 }),
        observation({ observationId: "a2", modelSnapshotId: "m2", benchmarkId: "a", nTasks: 10 }),
        observation({ observationId: "self", modelSnapshotId: "m3", benchmarkId: "a", originProvenance: "self_report", nTasks: 10 }),
      ],
      [system, { ...system, modelSnapshotId: "m2" }, { ...system, modelSnapshotId: "m3" }],
      [benchmark({ id: "a" }), benchmark({ id: "b" })],
      config,
    );
    expect(auditCalibrationPanelCoverage(preparation, ["m@std", "m2@std", "missing@std"], 2)).toEqual({
      minimumSize: 2,
      configuredSystemIds: ["m@std", "m2@std", "missing@std"],
      configuredMissingIndependentCells: ["missing@std"],
      eligibleSystemCount: 2,
      independentCellsBySystem: { "m@std": 2, "m2@std": 1 },
      coverageRankedSystemIds: ["m@std", "m2@std"],
    });
  });

  it("uses clustered total-count and continuous likelihoods without a noise floor", () => {
    const total = prepareAci12(
      [observation({ score: 0.6, nTasks: 20, kTrials: 5 })],
      [system],
      [benchmark({ defaultRho: 0.2 })],
      config,
    ).observations[0]!;
    expect(total).toMatchObject({ likelihood: "a_total", totalTrials: 100, x: 60, rho: 0.2 });

    const elo = prepareAci12(
      [observation({ score: 1400, scoreUnit: "elo", standardError: 20 })],
      [system],
      [benchmark({ obsType: "elo", eloReference: 1200 })],
      config,
    ).observations[0]!;
    expect(elo.y).toBeCloseTo(200 * Math.LN10 / 400, 12);
    expect(elo.variance).toBeCloseTo((20 * Math.LN10 / 400) ** 2, 12);
  });
});

describe("ACI 1.2 posterior outputs", () => {
  it("calibrates the frozen panel draw-wise to mean 50 and sd 10", () => {
    const raw = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`p${index}@std`, [index, index + 1]]));
    raw.target = [12, 13];
    const calibrated = calibrateCapabilityDraws(raw, Object.keys(raw).filter((key) => key.startsWith("p")));
    for (const draw of [0, 1]) {
      const panel = Object.keys(raw).filter((key) => key.startsWith("p")).map((key) => calibrated[key]![draw]!);
      const center = panel.reduce((sum, value) => sum + value, 0) / panel.length;
      const sd = Math.sqrt(panel.reduce((sum, value) => sum + (value - center) ** 2, 0) / (panel.length - 1));
      expect(center).toBeCloseTo(50, 12);
      expect(sd).toBeCloseTo(10, 12);
    }
  });

  it("gates provisional systems before ranks and pairwise probabilities", () => {
    const narrow = summarizeDraws([50, 51, 52, 53, 54]);
    const tier = evidenceTier(narrow, { fittedCells: 5, domains: 2, safeIndependentCells: 0, maxBenchmarkShare: 0.5, maxFamilyShare: 0.5 }, config);
    expect(tier.tier).toBe("provisional");
    expect(tier.score).toBeNull();

    const draws = { ranked: [60, 61, 62, 63], other: [50, 51, 52, 53], provisional: [100, 100, 100, 100] };
    expect(rankPosterior(draws, ["ranked", "other"]).ranked?.median).toBe(1);
    expect(pairwisePosterior(draws, ["ranked", "other"])).toEqual({ ranked: { other: 1 }, other: { ranked: 0 } });
  });

  it("reports benchmark and family information concentration without caps", () => {
    const shares = informationShare([
      { benchmarkId: "b1", familyId: "f", alpha: 1, observationVariances: [0.1], sigma: 0.2 },
      { benchmarkId: "b2", familyId: "f", alpha: 1, observationVariances: [0.1], sigma: 0.2 },
      { benchmarkId: "b3", familyId: "g", alpha: 1, observationVariances: [0.1], sigma: 0.2 },
    ]);
    expect(shares.maxBenchmarkShare).toBeCloseTo(1 / 3, 12);
    expect(shares.maxFamilyShare).toBeCloseTo(2 / 3, 12);
  });

  it("handles ACI 1.2.2 single-system rule and fixed-effort models", () => {
    const fixedModel: AciSystemDefinition = {
      modelSnapshotId: "fixed-m",
      defaultEffortTier: "default",
      maxEffortTier: "default",
    };
    expect(isFixedEffort(fixedModel)).toBe(true);
    expect(isFixedEffort(system)).toBe(false);
  });

  it("does not pool a documented variable dial when only its maximum is known", () => {
    const variable = { modelSnapshotId: "m", maxEffortTier: "max", effortTierOrder: ["low", "medium", "high", "max"] };
    expect(isFixedEffort(variable)).toBe(false);
    const prepared = prepareAci12([
      observation({ observationId: "low", effortTier: "low", nTasks: 100 }),
      observation({ observationId: "unknown", effortTier: undefined, nTasks: 100 }),
      observation({ observationId: "max", effortTier: "max", nTasks: 100 }),
    ], [variable], [benchmark()], config);
    expect(prepared.observations.map((row) => row.observationId)).toEqual(["max"]);
    expect(prepared.rejections).toHaveLength(2);
  });

  it("flags below-default effort as approximate instead of exact standard effort", () => {
    const prepared = prepareAci12([observation({ effortTier: "low", nTasks: 100 })],
      [{ modelSnapshotId: "m", defaultEffortTier: "medium", maxEffortTier: "max" }], [benchmark()], config);
    expect(prepared.observations[0]?.profile).toBe("std-common");
    expect(prepared.observations[0]?.metadataIncomplete).toBe(true);
  });

  it("evaluates contamination states according to 1.2.2 rules", () => {
    const sysWithFreeze: AciSystemDefinition = {
      modelSnapshotId: "sys-freeze",
      trainingCutoff: "2025-01-01",
      postTrainingFreeze: "2025-01-01",
    };
    const pubBench: AciBenchmarkDefinition = benchmark({
      holdout: "public",
      publicReleaseDate: "2025-06-01",
      itemReleaseDate: "2025-06-01",
    });
    const safeObs = observation({ networkPolicy: "isolated", toolPolicy: "none" });
    expect(evaluateContaminationState(safeObs, sysWithFreeze, pubBench)).toBe("safe");

    const exposedObs = observation({ networkPolicy: "internet_access", toolPolicy: "tools" });
    expect(evaluateContaminationState(exposedObs, sysWithFreeze, pubBench)).toBe("exposed");

    const unknownObs = observation({ versionInferred: true });
    expect(evaluateContaminationState(unknownObs, sysWithFreeze, pubBench)).toBe("unknown");
  });

  it("partitions overlap components correctly into reference and disconnected", () => {
    const obs = [
      { protocolId: "p1", sourceId: "p1", systemId: "s1", benchmarkId: "b1", originProvenance: "independent" as const },
      { protocolId: "p1", sourceId: "p1", systemId: "s2", benchmarkId: "b1", originProvenance: "independent" as const },
      { protocolId: "p2", sourceId: "p2", systemId: "s1", benchmarkId: "b1", originProvenance: "self_report" as const },
      { protocolId: "p2", sourceId: "p2", systemId: "s2", benchmarkId: "b1", originProvenance: "self_report" as const },
      { protocolId: "p3", sourceId: "p3", systemId: "s3", benchmarkId: "b2", originProvenance: "self_report" as const },
    ];
    const overlap = partitionOverlapComponents(obs);
    expect(overlap.referenceProtocols.has("p1")).toBe(true);
    expect(overlap.referenceProtocols.has("p2")).toBe(true);
    expect(overlap.referenceProtocols.has("p3")).toBe(false);
  });

  it("audits calibration panel for per-domain coverage requiring at least 2 cells per domain", () => {
    const bAgentic = benchmark({ id: "b-agentic", domains: { agentic: 1 }, primaryDomain: "agentic" });
    const bCode = benchmark({ id: "b-code", domains: { "software-code": 1 }, primaryDomain: "software-code" });
    const prep = prepareAci12(
      [
        observation({ observationId: "o1", benchmarkId: "b-agentic", modelSnapshotId: "m" }),
        observation({ observationId: "o2", benchmarkId: "b-code", modelSnapshotId: "m" }),
      ],
      [system],
      [bAgentic, bCode],
      config,
    );
    const audit = auditCalibrationPanelPerDomainCoverage(prep, ["m@max-common"], [system]);
    expect(audit.passed).toBe(false);
    expect(audit.failingSystemIds).toContain("m@max-common");
  });
});
