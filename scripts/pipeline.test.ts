import path from "node:path";
import { describe, expect, it } from "vitest";
import { RawResultSchema, selectPreferredResults, stableStringify, type RawResult } from "@actualanalysis/ingest";
import { runScoring } from "@actualanalysis/scoring";
import { pipelineFixture } from "../packages/scoring/test/helpers.js";
import { RunArtifactSchema } from "@actualanalysis/db";
import { loadRegistry } from "@actualanalysis/shared";
import {
  assessRunSet,
  feasibilityReason,
  mappedBenchmarkRecords,
  planPersistence,
  publicationCoverageRegressions,
  selectCanonicalScoringRecords,
  selectScorableRecords,
  toRunArtifact,
} from "./pipeline.js";

function result(overrides: Partial<Extract<RawResult, { record_type: "benchmark_result" }>> = {}) {
  return RawResultSchema.parse({
    record_type: "benchmark_result",
    model: "Model A",
    model_id: "model-a",
    benchmark: "ARC-AGI-3",
    benchmark_id: "arc-agi-3",
    source_id: "source-a",
    score: 0.5,
    score_unit: "fraction",
    config: {},
    observed_on: "2026-09-03",
    source_url: "https://example.com/result",
    provenance: "independent",
    metadata: {},
    ...overrides,
  });
}

const registryPromise = loadRegistry(path.resolve("data"), { includeManualResults: true });

describe("pipeline run handoff", () => {
  it("converts a complete scoring run to the versioned database artifact", () => {
    const run = runScoring(pipelineFixture());
    const inputAudit = {
      scoring_input_sha256: "a".repeat(64),
      config_sha256: "b".repeat(64),
      registry_sha256: "c".repeat(64),
      bootstrap_seed: 20250903,
      anchors: [{ model_id: "model-a", value: 100 }, { model_id: "model-b", value: 110 }],
      publication_coverage: {
        scorable_results: 40,
        models: 8,
        benchmarks: 6,
        fitted_cells: 48,
        positive_weight_benchmarks: 6,
        ranked_models: 8,
        by_source: { runner: 48 },
      },
      eligibility_rejections: { config: 3, uncertainty: 2, total: 5 },
    };
    const artifact = RunArtifactSchema.parse(toRunArtifact(run, "2026-09-03T00:00:00.000Z", inputAudit));

    expect(artifact.kind).toBe("mixed");
    expect(artifact.scores).toHaveLength(8);
    expect(artifact.benchmark_params).toHaveLength(6);
    expect(artifact.cells).toHaveLength(48);
    expect(new Set(artifact.cells.map((cell) => `${cell.model_id}:${cell.benchmark_id}`)).size).toBe(48);
    expect(artifact.scores.every((score) => Object.keys(score.pairwise).length === 8)).toBe(true);
    expect(artifact.params).toMatchObject(inputAudit);
  });

  it("blocks every publication write when no index can be scored", () => {
    expect(assessRunSet({})).toEqual({
      complete: false,
      createdKinds: [],
      missingKinds: ["mixed", "agentic", "chat"],
      unpublishableKinds: [],
      issues: {
        mixed: "no run artifact was produced",
        agentic: "no run artifact was produced",
        chat: "no run artifact was produced",
      },
    });
    expect(planPersistence({}, { skipScore: false, commitSnapshot: true })).toMatchObject({
      mode: "skip_incomplete",
      writeDatabase: false,
      exportSnapshot: false,
    });
  });

  it("requires the complete three-index set instead of accepting a partial publication", () => {
    const artifact = RunArtifactSchema.parse(toRunArtifact(runScoring(pipelineFixture())));
    expect(assessRunSet({ mixed: artifact, agentic: { ...artifact, kind: "agentic" } })).toEqual({
      complete: false,
      createdKinds: ["mixed", "agentic"],
      missingKinds: ["chat"],
      unpublishableKinds: [],
      issues: { chat: "no run artifact was produced" },
    });
    expect(assessRunSet({
      mixed: artifact,
      agentic: { ...artifact, kind: "agentic" },
      chat: { ...artifact, kind: "chat" },
    }).complete).toBe(true);
    expect(planPersistence({
      mixed: artifact,
      agentic: { ...artifact, kind: "agentic" },
      chat: { ...artifact, kind: "chat" },
    }, { skipScore: false, commitSnapshot: true })).toMatchObject({
      mode: "publish",
      writeDatabase: true,
      exportSnapshot: true,
    });
  });

  it("keeps ingest-only persistence explicit and never exports a stale snapshot", () => {
    expect(planPersistence({}, { skipScore: true, commitSnapshot: false })).toMatchObject({
      mode: "ingest_only",
      writeDatabase: true,
      exportSnapshot: false,
    });
  });

  it("rejects a complete artifact set when every score in an index is provisional or unranked", () => {
    const artifact = RunArtifactSchema.parse(toRunArtifact(runScoring(pipelineFixture())));
    const unranked = RunArtifactSchema.parse({
      ...artifact,
      scores: artifact.scores.map((score) => ({
        ...score,
        provisional: true,
        rank: null,
        rank_low: null,
        rank_high: null,
      })),
    });
    const runs = {
      mixed: unranked,
      agentic: { ...unranked, kind: "agentic" as const },
      chat: { ...artifact, kind: "chat" as const },
    };

    // Only the mixed view must rank a system; an all-provisional profile view is
    // published as intervals (methodology §8.2) and reported as interval-only.
    expect(assessRunSet(runs)).toMatchObject({
      complete: false,
      missingKinds: [],
      unpublishableKinds: ["mixed"],
      issues: {
        mixed: "run has no non-provisional score with a published rank",
        agentic: "interval-only view: no system reaches the Ranked tier in this profile",
      },
    });
    expect(planPersistence(runs, { skipScore: false, commitSnapshot: true })).toMatchObject({
      mode: "skip_incomplete",
      writeDatabase: false,
      exportSnapshot: false,
    });
    const rankedMixed = { ...runs, mixed: { ...artifact, kind: "mixed" as const } };
    expect(assessRunSet(rankedMixed)).toMatchObject({ complete: true, unpublishableKinds: [] });
  });

  it("blocks material evidence regressions against the latest prior publication", () => {
    const artifact = RunArtifactSchema.parse(toRunArtifact(runScoring(pipelineFixture())));
    const current = {
      ...artifact,
      params: {
        ...artifact.params,
        publication_coverage: {
          scorable_results: 79,
          models: 10,
          benchmarks: 4,
          fitted_cells: 80,
          positive_weight_benchmarks: 4,
          ranked_models: 8,
          by_source: { epoch: 4 },
        },
      },
    };
    const regressions = publicationCoverageRegressions({ mixed: current }, [{
      kind: "mixed",
      createdAt: new Date("2026-09-03T00:00:00.000Z"),
      params: {
        publication_coverage: {
          scorable_results: 100,
          models: 10,
          benchmarks: 5,
          fitted_cells: 100,
          positive_weight_benchmarks: 5,
          ranked_models: 10,
          by_source: { epoch: 10 },
        },
      },
    }]);

    expect(regressions).toEqual([
      "mixed positive_weight_benchmarks fell from 5 to 4",
      "mixed scorable_results fell from 100 to 79",
      "mixed source epoch fell from 10 to 4 scorable results",
    ]);
  });
});

describe("pipeline scoring input selection", () => {
  it("rejects an evidence graph disconnected from the reference benchmark", async () => {
    const registry = await registryPromise;
    const activeRegistry = {
      ...registry,
      indexConfig: {
        ...registry.indexConfig,
        reference_benchmark: "arc-agi-2-semi-private",
      },
      benchmarks: registry.benchmarks.map((benchmark) =>
        benchmark.id === "arc-agi-2-semi-private" || benchmark.id === "frontiermath-v2-tiers-1-3"
          ? { ...benchmark, status: "active" as const }
          : benchmark),
    };
    const rows = mappedBenchmarkRecords([
      result({ model_id: "reference-only", benchmark_id: "arc-agi-2-semi-private", n_items: 120 }),
      result({ model_id: "gpt-4.1", benchmark_id: "frontiermath-v2-tiers-1-3", n_items: 295 }),
      result({ model_id: "claude-opus-5", benchmark_id: "frontiermath-v2-tiers-1-3", n_items: 295 }),
    ]);

    expect(feasibilityReason("chat", activeRegistry, rows)).toBe(
      "evidence graph is disconnected from reference benchmark arc-agi-2-semi-private",
    );
  });

  it("chooses one highest-effort canonical config and never duplicate-weights a source", () => {
    const rows = mappedBenchmarkRecords([
      result({ source_id: "low-source", config: { evaluation_profile: "Low", provider_adapter: false } }),
      result({ source_id: "high-source", config: { reasoning_effort: "high", provider_adapter: false } }),
      result({ source_id: "max-adapter", config: { evaluation_profile: "MAX", provider_adapter: true } }),
      result({ source_id: "max-direct-a", config: { evaluation_profile: "max", provider_adapter: false } }),
      result({ source_id: "max-direct-b", config: { evaluation_profile: "max", provider_adapter: false } }),
      result({
        source_id: "max-direct-a",
        config: { evaluation_profile: "max", provider_adapter: false },
        observed_on: "2026-09-01",
      }),
    ]);

    const selected = selectCanonicalScoringRecords(rows);
    expect(selected.records.map((row) => row.source_id)).toEqual(["max-direct-a", "max-direct-b"]);
    expect(new Set(selected.records.map((row) => stableStringify(row.config))).size).toBe(1);
    expect(selected.records[0]?.config).toEqual({ evaluation_profile: "max", provider_adapter: false });
    expect(selected.exclusions.filter((row) => row.reason_code === "non_canonical_config")).toHaveLength(3);
    expect(selected.exclusions.filter((row) => row.reason_code === "duplicate_source_for_canonical_config")).toHaveLength(1);
    expect(selectCanonicalScoringRecords([...rows].reverse())).toEqual(selected);
  });

  it("uses recency and score to resolve multiple top configurations", () => {
    const rows = mappedBenchmarkRecords([
      result({ source_id: "first", config: { reasoning_effort: "max", harness: "alpha" } }),
      result({ source_id: "second", config: { reasoning_effort: "max", harness: "beta" } }),
      result({ source_id: "lower", config: { reasoning_effort: "high", harness: "alpha" } }),
    ]);

    const selected = selectCanonicalScoringRecords(rows);
    expect(selected.records).toHaveLength(1);
    expect(selected.records[0]?.source_id).toBe("first");
    expect(selected.exclusions).toHaveLength(2);
    expect(selected.exclusions.every((row) => row.reason_code === "non_canonical_config")).toBe(true);
    expect(selectCanonicalScoringRecords([...rows].reverse())).toEqual(selected);
  });

  it("selects provenance before effort across a model-benchmark pair", () => {
    const independent = result({
      source_id: "scale",
      provenance: "independent",
      config: { reasoning_effort: "high" },
      score: 0.4,
    });
    const selfReportedMax = result({
      source_id: "vendor-model-cards",
      provenance: "self_report",
      config: { reasoning_effort: "max" },
      score: 0.9,
    });

    const provenance = selectPreferredResults([selfReportedMax, independent]);
    const canonical = selectCanonicalScoringRecords(mappedBenchmarkRecords(provenance.kept));
    expect(canonical.records).toEqual([independent]);
    expect(provenance.superseded).toEqual([selfReportedMax]);
  });

  it("excludes a missing-n accuracy row on the legacy path without throwing and keeps rows whose benchmark declares n", async () => {
    const registry = await registryPromise;
    const registryWithoutFrontierMathN = {
      benchmarks: registry.benchmarks.map((benchmark) =>
        benchmark.id === "frontiermath-v2-tiers-1-3" ? { ...benchmark, n_items: null } : benchmark),
    };
    const rows = mappedBenchmarkRecords([
      result({
        model: "Gemini 3.7 Flash",
        model_id: "gemini-3.7-flash",
        benchmark: "FrontierMath-Tiers-1-3-v2-Private",
        benchmark_id: "frontiermath-v2-tiers-1-3",
        source_id: "epoch",
        provenance: "mirror",
      }),
      result({
        model: "GPT-6 Astra",
        model_id: "gpt-6-astra",
        benchmark: "DeepSWE",
        benchmark_id: "deepswe",
        source_id: "datacurve",
        config: { evaluation_profile: "High", provider_adapter: false },
      }),
    ]);

    const eligibility = selectScorableRecords(registryWithoutFrontierMathN, rows);
    // DeepSWE is active and declares n_items, so the row is scorable; the
    // FrontierMath row has neither n nor a reported SE and is excluded.
    expect(eligibility.records.map((row) => row.benchmark_id)).toEqual(["deepswe"]);
    expect(eligibility.exclusions.map((row) => row.benchmark_id)).toEqual(["frontiermath-v2-tiers-1-3"]);
  });

  it("implements transform-specific uncertainty eligibility", async () => {
    const registry = await registryPromise;
    const activeRegistry = {
      benchmarks: registry.benchmarks.map((benchmark) =>
        benchmark.id === "frontiermath-v2-tiers-1-3" ? { ...benchmark, status: "active" as const } : benchmark),
    };
    const rows = mappedBenchmarkRecords([
      result({ model_id: "row-n", benchmark_id: "frontiermath-v2-tiers-1-3", n_items: 25 }),
      result({ model_id: "reported-se", benchmark_id: "frontiermath-v2-tiers-1-3", se: 0 }),
      result({ model_id: "registry-n", benchmark_id: "arc-agi-2-semi-private" }),
      result({ model_id: "metr-no-se", benchmark_id: "metr-time-horizon-1.1", n_items: 50 }),
      result({ model_id: "metr-with-se", benchmark_id: "metr-time-horizon-1.1", se: 0 }),
    ]);

    const eligibility = selectScorableRecords(activeRegistry, rows);
    expect(eligibility.records.map((row) => row.model_id).sort()).toEqual([
      "metr-with-se",
      "registry-n",
      "reported-se",
      "row-n",
    ]);
    expect(eligibility.exclusions).toMatchObject([{
      model_id: "metr-no-se",
      reason_code: "missing_reported_se",
      transform: "metr_horizon",
    }]);
  });

  it("does not fall back to weaker provenance when strongest evidence lacks uncertainty", async () => {
    const registry = await registryPromise;
    const activeRegistry = {
      benchmarks: registry.benchmarks.map((benchmark) =>
        benchmark.id === "arc-agi-3" ? { ...benchmark, status: "active" as const, n_items: null } : benchmark),
    };
    const weakButComplete = result({ source_id: "manual", provenance: "manual", n_items: 100 });
    const strongButIncomplete = result({ source_id: "independent", provenance: "independent" });
    const provenanceSelection = selectPreferredResults([weakButComplete, strongButIncomplete]);
    const canonical = selectCanonicalScoringRecords(mappedBenchmarkRecords(provenanceSelection.kept));
    const eligibility = selectScorableRecords(activeRegistry, canonical.records);

    expect(provenanceSelection.kept).toMatchObject([{ source_id: "independent" }]);
    expect(eligibility.records).toEqual([]);
    expect(eligibility.exclusions).toMatchObject([{
      source_id: "independent",
      reason_code: "missing_accuracy_uncertainty",
    }]);
  });
});
