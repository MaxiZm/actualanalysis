import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { IngestSourcesResult, RawBenchmarkResult, RawResult } from "@actualanalysis/ingest";
import {
  RefreshCaptureUnavailableError,
  applyOfficialTau3HeadlineTrials,
  isForbiddenAaRecord,
  mergeHistoricalAndFreshRecords,
  prepareCandidateInput,
  snapshotResultToRawBenchmarkResult,
} from "./prepare-candidate-input.js";

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");

function rawResult(overrides: Partial<RawBenchmarkResult> & Pick<RawBenchmarkResult, "model" | "model_id" | "benchmark" | "benchmark_id" | "source_id">): RawBenchmarkResult {
  return {
    record_type: "benchmark_result",
    score: 0.42,
    score_unit: "fraction",
    observed_on: "2026-09-06",
    source_url: "https://example.com/result",
    provenance: "independent",
    config: {},
    metadata: {},
    n_items: 100,
    se: 0.02,
    ...overrides,
  };
}

function ingestResult(records: RawResult[], sources = ["manual"]): IngestSourcesResult {
  return {
    sources,
    records,
    selectedRecords: records,
    supersededRecords: [],
    unmapped: [],
    warnings: [],
    outputs: sources.map((source) => ({
      source,
      records: records.filter((row) => row.record_type !== "benchmark_result" || row.source_id === source || source === "manual"),
      warnings: [],
      fetched_at: "2026-09-07T00:00:00.000Z",
    })),
  };
}

async function writeInput(rows: unknown[]): Promise<{ input: string; workDir: string }> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "prepare-candidate-"));
  const input = path.join(workDir, "historical.json");
  await writeFile(input, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  return { input, workDir };
}

describe("prepare-candidate-input refresh", () => {
  it("normalizes snapshot camelCase into RawBenchmarkResult snake_case and preserves url fields", () => {
    const converted = snapshotResultToRawBenchmarkResult({
      modelId: "grok-4.6",
      benchmarkId: "swe-rebench",
      sourceId: "swe-rebench",
      score: 0.5,
      scoreUnit: "fraction",
      provenance: "independent",
      observedOn: "2026-09-06",
      url: "https://swe-rebench.com/leaderboard",
      nItems: 50,
      nRuns: 3,
      runValues: [0.4, 0.5, 0.6],
      uncertaintyType: "se",
      uncertaintyValue: 0.01,
      uncertaintyUnit: "run",
      benchmarkVersion: "2025-01",
      lineageId: "lineage-1",
    });
    expect(converted).toMatchObject({
      record_type: "benchmark_result",
      model_id: "grok-4.6",
      benchmark_id: "swe-rebench",
      source_id: "swe-rebench",
      source_url: "https://swe-rebench.com/leaderboard",
      n_items: 50,
      n_runs: 3,
      lineage_id: "lineage-1",
      benchmark_version: "2025-01",
    });
  });

  it("lets a new manual row survive refresh selection", async () => {
    const historical = [{
      modelId: "claude-3.5-sonnet",
      benchmarkId: "swe-rebench",
      sourceId: "swe-rebench",
      score: 0.31,
      scoreUnit: "fraction",
      provenance: "independent",
      observedOn: "2026-08-01",
      url: "https://swe-rebench.com/leaderboard",
      nItems: 100,
      se: 0.03,
      lineageId: "historical-swe",
    }];
    const manual = rawResult({
      model: "grok-4.6",
      model_id: "grok-4.6",
      benchmark: "swe-rebench",
      benchmark_id: "swe-rebench",
      source_id: "vendor-model-cards",
      provenance: "manual",
      origin_provenance: "self_report",
      score: 0.55,
      metadata: { manual_file: "manual/results/grok-swe.yaml" },
      lineage_id: "manual-grok-swe",
    });
    const { input, workDir } = await writeInput(historical);
    const result = await prepareCandidateInput({
      dataDir,
      input,
      workDir,
      refreshInput: true,
      sources: ["manual"],
      fallbackCapturePath: path.join(workDir, "missing-capture.json"),
      ingestSourcesFn: async () => ingestResult([manual]),
    });

    expect(result.selectedRecords?.some((row) => row.model_id === "grok-4.6" && row.benchmark_id === "swe-rebench")).toBe(true);
    expect(result.payload.system_ids.some((id) => id.startsWith("grok-4.6@"))).toBe(true);
  });

  it("does not increase the admitted count for a duplicate lineage", async () => {
    const historical = [{
      modelId: "claude-3.5-sonnet",
      benchmarkId: "swe-rebench",
      sourceId: "swe-rebench",
      score: 0.31,
      scoreUnit: "fraction",
      provenance: "independent",
      observedOn: "2026-08-01",
      url: "https://swe-rebench.com/leaderboard",
      nItems: 100,
      se: 0.03,
      lineageId: "same-lineage",
      hostSource: "swe-rebench",
    }];
    const duplicate = rawResult({
      model: "claude-3.5-sonnet",
      model_id: "claude-3.5-sonnet",
      benchmark: "swe-rebench",
      benchmark_id: "swe-rebench",
      source_id: "vendor-model-cards",
      provenance: "mirror",
      score: 0.31,
      n_items: 100,
      se: 0.03,
      lineage_id: "same-lineage",
      host_source: "swe-rebench",
      metadata: { origin_source: "https://swe-rebench.com/leaderboard" },
    });
    const { input, workDir } = await writeInput(historical);
    const baseline = await prepareCandidateInput({ dataDir, input, workDir: path.join(workDir, "baseline") });
    const refreshed = await prepareCandidateInput({
      dataDir,
      input,
      workDir: path.join(workDir, "refresh"),
      refreshInput: true,
      sources: ["manual"],
      fallbackCapturePath: path.join(workDir, "missing-capture.json"),
      ingestSourcesFn: async () => ingestResult([duplicate]),
    });

    expect(refreshed.selectedRecords?.filter((row) => row.lineage_id === "same-lineage")).toHaveLength(1);
    expect(refreshed.payload.observations.length).toBe(baseline.payload.observations.length);
  });

  it("excludes forbidden Artificial Analysis rows from selected refresh records", async () => {
    const historical = [{
      modelId: "claude-3.5-sonnet",
      benchmarkId: "swe-rebench",
      sourceId: "swe-rebench",
      score: 0.31,
      scoreUnit: "fraction",
      provenance: "independent",
      observedOn: "2026-08-01",
      url: "https://swe-rebench.com/leaderboard",
      nItems: 100,
      se: 0.03,
    }];
    const aaRow = rawResult({
      model: "claude-3.5-sonnet",
      model_id: "claude-3.5-sonnet",
      benchmark: "critpt",
      benchmark_id: "critpt",
      source_id: "aa-benchmarks-manual",
      provenance: "manual",
      protocol_id: "aa-benchmarks-manual",
      metadata: { manual_file: "manual/results/aa.yaml" },
    });
    expect(isForbiddenAaRecord(aaRow)).toBe(true);
    const { input, workDir } = await writeInput(historical);
    const result = await prepareCandidateInput({
      dataDir,
      input,
      workDir,
      refreshInput: true,
      sources: ["manual"],
      fallbackCapturePath: path.join(workDir, "missing-capture.json"),
      ingestSourcesFn: async () => ingestResult([aaRow]),
    });

    expect(result.selectedRecords?.some((row) => isForbiddenAaRecord(row))).toBe(false);
    expect(result.payload.protocol_ids.some((id) => id.startsWith("aa-"))).toBe(false);
    expect(result.payload.benchmark_ids).not.toContain("critpt");
  });

  it("refuses to treat an unavailable refresh capture as measured zero", async () => {
    const historical = [{
      modelId: "claude-3.5-sonnet",
      benchmarkId: "swe-rebench",
      sourceId: "swe-rebench",
      score: 0.31,
      scoreUnit: "fraction",
      provenance: "independent",
      observedOn: "2026-08-01",
      url: "https://swe-rebench.com/leaderboard",
      nItems: 100,
      se: 0.03,
    }];
    const { input, workDir } = await writeInput(historical);
    await expect(prepareCandidateInput({
      dataDir,
      input,
      workDir,
      refreshInput: true,
      sources: ["datacurve"],
      fallbackCapturePath: path.join(workDir, "missing-capture.json"),
      ingestSourcesFn: async () => ({
        sources: ["datacurve"],
        records: [],
        selectedRecords: [],
        supersededRecords: [],
        unmapped: [],
        warnings: [{ source: "datacurve", code: "fetch_failed", message: "network down" }],
        outputs: [{ source: "datacurve", records: [], warnings: [{ code: "fetch_failed", message: "network down" }], fetched_at: "2026-09-07T00:00:00.000Z" }],
      }),
    })).rejects.toBeInstanceOf(RefreshCaptureUnavailableError);
  });

  it("dedups historical/fresh capture replays with the same source/score/run identity", () => {
    const historical = rawResult({
      model: "kimi-k2.5",
      model_id: "kimi-k2.5",
      benchmark: "hle-no-tools",
      benchmark_id: "hle-no-tools",
      source_id: "scale",
      score: 24.37,
      score_unit: "percent",
      observed_on: "2026-02-13",
      protocol_id: "scale-hle-leaderboard-2025",
      config: {},
    });
    const replay = rawResult({
      model: "kimi-k2.5",
      model_id: "kimi-k2.5",
      benchmark: "hle-no-tools",
      benchmark_id: "hle-no-tools",
      source_id: "scale",
      score: 24.37,
      score_unit: "percent",
      observed_on: "2026-02-13",
      config: { tools: false },
    });
    const merged = mergeHistoricalAndFreshRecords([historical], [replay]);
    expect(merged.kept).toHaveLength(1);
    expect(merged.kept[0]?.protocol_id).toBe("scale-hle-leaderboard-2025");
    expect(merged.kept[0]?.config).toEqual({});
  });

  it("preserves pinned protocol metadata for percent/fraction copies of the same ARC run", () => {
    const historical = rawResult({
      model: "gpt-5.6-luna",
      model_id: "gpt-5.6-luna",
      benchmark: "arc-agi-2-semi-private",
      benchmark_id: "arc-agi-2-semi-private",
      source_id: "arcprize",
      score: 0.4764,
      score_unit: "fraction",
      observed_on: "2026-09-04",
      effort_tier: "XHigh",
      protocol_id: "arcprize-arc2-standard-2025",
      config: { data_subset: "v2_Semi_Private", evaluation_profile: "XHigh" },
    });
    const percentCopy = rawResult({
      model: "gpt-5.6-luna",
      model_id: "gpt-5.6-luna",
      benchmark: "arc-agi-2-semi-private",
      benchmark_id: "arc-agi-2-semi-private",
      source_id: "arcprize",
      score: 47.6,
      score_unit: "percent",
      observed_on: "2026-09-04",
      effort_tier: "xhigh",
      config: { reasoning_effort: "xhigh" },
    });
    const merged = mergeHistoricalAndFreshRecords([historical], [percentCopy]);
    expect(merged.kept).toHaveLength(1);
    expect(merged.kept[0]?.protocol_id).toBe("arcprize-arc2-standard-2025");
    expect(merged.kept[0]?.score_unit).toBe("fraction");
  });

  it("supersedes MathArena same-config composites instead of adding a second protocol", () => {
    const historical = rawResult({
      model: "deepseek-v3.2",
      model_id: "deepseek-v3.2",
      benchmark: "matharena-composite",
      benchmark_id: "matharena-composite",
      source_id: "matharena",
      score: 14.4,
      score_unit: "percent",
      observed_on: "2026-09-05",
      protocol_id: "matharena-expected-performance-2026-09-05",
      config: { aggregate: "non-deprecated competitions", evaluation_profile: "Think" },
    });
    const updated = rawResult({
      model: "deepseek-v3.2",
      model_id: "deepseek-v3.2",
      benchmark: "matharena-composite",
      benchmark_id: "matharena-composite",
      source_id: "matharena",
      score: 14.1,
      score_unit: "percent",
      observed_on: "2026-09-06",
      config: { aggregate: "non-deprecated competitions", evaluation_profile: "Think" },
    });
    const merged = mergeHistoricalAndFreshRecords([historical], [updated]);
    expect(merged.kept).toHaveLength(1);
    expect(merged.kept[0]?.score).toBe(14.1);
    expect(merged.kept[0]?.protocol_id).toBe("matharena-expected-performance-2026-09-05");
    expect(merged.kept[0]?.observed_on).toBe("2026-09-06");

    const caseFolded = mergeHistoricalAndFreshRecords([
      rawResult({
        model: "claude-opus-4.6",
        model_id: "claude-opus-4.6",
        benchmark: "matharena-composite",
        benchmark_id: "matharena-composite",
        source_id: "matharena",
        score: 25.6,
        score_unit: "percent",
        observed_on: "2026-09-05",
        effort_tier: "High",
        protocol_id: "matharena-expected-performance-2026-09-05",
        config: { aggregate: "non-deprecated competitions", evaluation_profile: "High" },
      }),
    ], [
      rawResult({
        model: "claude-opus-4.6",
        model_id: "claude-opus-4.6",
        benchmark: "matharena-composite",
        benchmark_id: "matharena-composite",
        source_id: "matharena",
        score: 25.6,
        score_unit: "percent",
        observed_on: "2026-09-06",
        effort_tier: "high",
        config: { aggregate: "non-deprecated competitions", evaluation_profile: "high" },
      }),
    ]);
    expect(caseFolded.kept).toHaveLength(1);
    expect(caseFolded.kept[0]?.protocol_id).toBe("matharena-expected-performance-2026-09-05");

    const uniqueModel = mergeHistoricalAndFreshRecords([
      rawResult({
        model: "grok-4-fast",
        model_id: "grok-4-fast",
        benchmark: "matharena-composite",
        benchmark_id: "matharena-composite",
        source_id: "matharena",
        score: 12.8,
        score_unit: "percent",
        observed_on: "2026-09-05",
        effort_tier: "reasoning",
        protocol_id: "matharena-expected-performance-2026-09-05",
        config: { aggregate: "non-deprecated competitions", evaluation_profile: "reasoning" },
      }),
    ], [
      rawResult({
        model: "grok-4-fast",
        model_id: "grok-4-fast",
        benchmark: "matharena-composite",
        benchmark_id: "matharena-composite",
        source_id: "matharena",
        score: 12.5,
        score_unit: "percent",
        observed_on: "2026-09-06",
        config: { aggregate: "non-deprecated competitions", evaluation_profile: null },
      }),
    ]);
    expect(uniqueModel.kept).toHaveLength(1);
    expect(uniqueModel.kept[0]?.score).toBe(12.5);
    expect(uniqueModel.kept[0]?.protocol_id).toBe("matharena-expected-performance-2026-09-05");
  });

  it("pins verified tau3 Pass^1 headlines to k_trials=1 and rejects unverifiable k=4", () => {
    const verified = applyOfficialTau3HeadlineTrials(rawResult({
      model: "claude-opus-5",
      model_id: "claude-opus-5",
      benchmark: "tau3-bench-banking",
      benchmark_id: "tau3-bench-banking",
      source_id: "taubench",
      k_trials: 4,
      metadata: { notes: "leaderboard pass^1 shown (pass^2..pass^4 also reported)" },
    }));
    expect(verified.reject).toBeUndefined();
    expect(verified.record.k_trials).toBe(1);

    const unverifiable = rawResult({
      model: "grok-4.20",
      model_id: "grok-4.20",
      benchmark: "tau3-bench-banking",
      benchmark_id: "tau3-bench-banking",
      source_id: "taubench",
      score: 18.04,
      score_unit: "percent",
      k_trials: 4,
      n_items: 97,
      metadata: { notes: "Sierra-run submission on the τ³-Banking leaderboard for Grok 4.20" },
    });
    expect(applyOfficialTau3HeadlineTrials(unverifiable).reject).toMatch(/Pass\^1/);
    const merged = mergeHistoricalAndFreshRecords([], [unverifiable]);
    expect(merged.kept).toHaveLength(0);
  });

  it("keeps distinct explicit run IDs even when score/date/effort fallback matches", () => {
    const shared = {
      model: "gpt-5.6-luna",
      model_id: "gpt-5.6-luna",
      benchmark: "arc-agi-2-semi-private",
      benchmark_id: "arc-agi-2-semi-private",
      source_id: "arcprize",
      score: 0.5,
      score_unit: "fraction" as const,
      observed_on: "2026-09-04",
      effort_tier: "high",
    };
    const historical = rawResult({ ...shared, evaluation_run_id: "run-a" });
    const fresh = rawResult({ ...shared, evaluation_run_id: "run-b" });
    const merged = mergeHistoricalAndFreshRecords([historical], [fresh]);
    expect(merged.kept).toHaveLength(2);
    expect(new Set(merged.kept.map((row) => row.evaluation_run_id))).toEqual(new Set(["run-a", "run-b"]));

    const lineageMerged = mergeHistoricalAndFreshRecords(
      [rawResult({ ...shared, lineage_id: "lineage-a" })],
      [rawResult({ ...shared, lineage_id: "lineage-b" })],
    );
    expect(lineageMerged.kept).toHaveLength(2);

    const versionMerged = mergeHistoricalAndFreshRecords(
      [rawResult({ ...shared, benchmark_version: "v2" })],
      [rawResult({ ...shared, benchmark_version: "v3" })],
    );
    expect(versionMerged.kept).toHaveLength(2);

    const twoFresh = mergeHistoricalAndFreshRecords([], [
      rawResult({ ...shared, evaluation_run_id: "run-a" }),
      rawResult({ ...shared, evaluation_run_id: "run-b" }),
    ]);
    expect(twoFresh.kept).toHaveLength(2);
  });

  it("does not use MathArena unique-model fallback to relabel high as max", () => {
    const historical = rawResult({
      model: "gpt-5.5",
      model_id: "gpt-5.5",
      benchmark: "matharena-composite",
      benchmark_id: "matharena-composite",
      source_id: "matharena",
      score: 61,
      score_unit: "percent",
      observed_on: "2026-09-05",
      effort_tier: "high",
      protocol_id: "matharena-expected-performance-2026-09-05",
      config: { aggregate: "non-deprecated competitions", evaluation_profile: "high", reasoning_effort: "high" },
    });
    const freshMax = rawResult({
      model: "gpt-5.5",
      model_id: "gpt-5.5",
      benchmark: "matharena-composite",
      benchmark_id: "matharena-composite",
      source_id: "matharena",
      score: 60.6,
      score_unit: "percent",
      observed_on: "2026-09-06",
      effort_tier: "max",
      config: { aggregate: "non-deprecated competitions", evaluation_profile: "max", reasoning_effort: "max" },
    });
    const merged = mergeHistoricalAndFreshRecords([historical], [freshMax]);
    expect(merged.kept).toHaveLength(2);
    expect(merged.kept.map((row) => row.config.reasoning_effort).sort()).toEqual(["high", "max"]);
    expect(merged.kept.find((row) => row.protocol_id === "matharena-expected-performance-2026-09-05")?.config.reasoning_effort).toBe("high");
  });
});
