import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseOsworldResults } from "../adapters/osworld.js";
import { createAdapterContext } from "../types.js";

const context = createAdapterContext({ dataDir: "data", now: () => new Date("2026-09-05T12:00:00Z"), env: {} });
const row = { model: "Claude Opus 5", official: true, reasoning: "high", toolSetting: "batch tool", stepBudget: 500, binaryAccuracy: 25, partialScore: 68 };
const defaults = { defaultResultReleaseVersion: "v2026.06.24", defaultResultDatasetScope: "full", datasetSize: 108, updatedAt: "2026-09-03", defaultReleaseVersion: "v2026.08.08" };

describe("OSWorld benchmark conditions", () => {
  it("matches the registered current task, grader and machine tool policy", () => {
    const benchmark = parse(readFileSync(new URL("../../../../data/benchmarks/osworld-2.0.yaml", import.meta.url), "utf8"));
    const { records: [record] } = parseOsworldResults({ ...defaults, results: [{ ...row, releaseVersion: "v2026.08.08" }] }, context);
    expect(record?.benchmark_version).toBe(benchmark.version);
    expect(record?.grader_version).toBe(benchmark.grader_version);
    expect(record?.tool_policy).toBe(benchmark.tool_policy);
  });
  it("resolves omitted row versions from historical result defaults, not the UI-selected release", () => {
    const { records } = parseOsworldResults({ ...defaults, results: [row, { ...row, releaseVersion: "v2026.08.08" }] }, context);
    expect(records[0]).toMatchObject({ benchmark_id: "osworld-2.0-2026.06.24-full", benchmark_version: "osworld-v2-2026.06.24", score: 25, config: { dataset_scope: "full", release_version: "v2026.06.24", reasoning_effort: "high", step_budget: 500 }, metadata: { nominal_task_count: 108 } });
    expect(records[0]).not.toHaveProperty("n_items");
    expect(records[0]).not.toHaveProperty("n_runs");
    expect(records[1]).toMatchObject({ benchmark_id: "osworld-2.0", benchmark_version: "osworld-v2-2026.08.08" });
    expect(records[0]?.evaluation_run_id).not.toBe(records[1]?.evaluation_run_id);
  });
  it("keeps offline subsets separate and never substitutes partial scores or full-set denominators", () => {
    const { records } = parseOsworldResults({ ...defaults, results: [{ ...row, releaseVersion: "v2026.08.08", datasetScope: "offline" }] }, context);
    expect(records[0]).toMatchObject({ benchmark_id: "osworld-2.0-2026.08.08-offline", score: 25, score_unit: "percent", n_runs: 7, config: { scoring: "binaryAccuracy", aci_fit_eligible: false }, metadata: { reported_partial_score: 68, nominal_task_count: 82, aggregate_count_compatible: false } });
    expect(records[0]).not.toHaveProperty("n_items");
    expect(records[0]).not.toHaveProperty("se");
  });
  it("preserves published August model-specific repeat counts without inventing task-level trials", () => {
    const { records } = parseOsworldResults({ ...defaults, results: [{ ...row, releaseVersion: "v2026.08.08" }, { ...row, model: "GPT-5.6 Sol", releaseVersion: "v2026.08.08" }] }, context);
    expect(records.map(record => record.n_runs)).toEqual([7, 2]);
    for (const record of records) {
      expect(record).not.toHaveProperty("n_items");
      expect(record).not.toHaveProperty("k_trials");
      expect(record).not.toHaveProperty("se");
    }
  });
  it("does not invent a current condition when source defaults are missing or a new release appears", () => {
    const result = parseOsworldResults({ datasetSize: 108, results: [row, { ...row, releaseVersion: "v2026.09.01", datasetScope: "full" }, { ...row, official: false }] }, context);
    expect(result.records).toHaveLength(0);
    expect(result.warnings[0]?.message).toContain("2 OSWorld rows");
  });
});
