import { fileURLToPath } from "node:url";
import { loadRegistry } from "@actualanalysis/shared";
import { describe, expect, it } from "vitest";
import { benchmarkResult } from "../adapters/helpers.js";
import { deduplicateRecords, idempotencyKey, resolveRecordAliases, selectPreferredResults } from "../lib/records.js";

const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));

const base = benchmarkResult({
  model: "openai/gpt-5",
  benchmark: "TB 4.0",
  source_id: "epoch",
  score: 0.4,
  score_unit: "fraction",
  config: { temperature: 0, nested: { effort: "high" } },
  observed_on: "2026-09-03",
  source_url: "https://example.test/result",
  provenance: "mirror",
});

describe("record identity and mapping", () => {
  it("uses stable natural keys and keeps the latest duplicate", () => {
    const reordered = benchmarkResult({ ...base, score: 0.41, config: { nested: { effort: "high" }, temperature: 0 } });
    expect(idempotencyKey(base)).toBe(idempotencyKey(reordered));
    expect(deduplicateRecords([base, reordered])).toEqual([reordered]);
  });

  it("does not split source identity or provenance tiers by harness label", () => {
    const first = benchmarkResult({ ...base, harness: "runner-v1" });
    const renamed = benchmarkResult({ ...base, harness: "runner-v2", score: 0.43 });
    expect(idempotencyKey(first)).toBe(idempotencyKey(renamed));
    expect(deduplicateRecords([first, renamed])).toEqual([renamed]);

    const selfReport = benchmarkResult({ ...base, source_id: "vendor-model-cards", provenance: "self_report", harness: "vendor" });
    const independent = benchmarkResult({ ...base, source_id: "scale", provenance: "independent", harness: "runner" });
    expect(selectPreferredResults([selfReport, independent])).toEqual({ kept: [independent], superseded: [selfReport] });
  });

  it("resolves declared model and benchmark aliases", async () => {
    const registry = await loadRegistry(dataDir);
    const result = resolveRecordAliases([base], registry);
    expect(result.unmapped).toEqual([]);
    expect(result.records[0]).toMatchObject({ model_id: "gpt-5-2025-08-07", benchmark_id: "terminal-bench-4.0" });
  });

  it("reports unknown names without dropping their records", async () => {
    const registry = await loadRegistry(dataDir);
    const unknown = benchmarkResult({ ...base, model: "Never Seen Model" });
    const result = resolveRecordAliases([unknown], registry);
    expect(result.records).toHaveLength(1);
    expect(result.unmapped).toEqual([{ kind: "model", value: "Never Seen Model", source_id: "epoch", occurrences: 1 }]);
  });

  it("does not queue models from out-of-suite benchmarks", async () => {
    const registry = await loadRegistry(dataDir);
    const unknown = benchmarkResult({ ...base, model: "Never Seen Model", benchmark: "Untracked Benchmark" });
    const result = resolveRecordAliases([unknown], registry);
    expect(result.unmapped).toEqual([
      { kind: "benchmark", value: "Untracked Benchmark", source_id: "epoch", occurrences: 1 },
    ]);
  });

  it("supersedes self-reports when an independent result exists", () => {
    const selfReport = benchmarkResult({ ...base, source_id: "vendor-model-cards", provenance: "self_report" });
    const independent = benchmarkResult({ ...base, source_id: "scale", provenance: "independent", score: 0.39 });
    const selected = selectPreferredResults([selfReport, independent]);
    expect(selected.kept).toEqual([independent]);
    expect(selected.superseded).toEqual([selfReport]);
  });

  it("resolves provenance before configuration so a high-effort self-report cannot win", () => {
    const selfReport = benchmarkResult({
      ...base,
      source_id: "vendor-model-cards",
      provenance: "self_report",
      score: 0.99,
      config: { reasoning_effort: "max" },
    });
    const independent = benchmarkResult({
      ...base,
      source_id: "scale",
      provenance: "independent",
      score: 0.39,
      config: { reasoning_effort: "high" },
    });

    const selected = selectPreferredResults([selfReport, independent]);
    expect(selected.kept).toEqual([independent]);
    expect(selected.superseded).toEqual([selfReport]);
  });

  it("does not let the manual capture mechanism outrank mirrored evidence", () => {
    const manual = benchmarkResult({ ...base, source_id: "manual-source", provenance: "manual", score: 0.99 });
    const mirror = benchmarkResult({ ...base, source_id: "epoch", provenance: "mirror", score: 0.42 });
    const selected = selectPreferredResults([manual, mirror]);
    expect(selected.kept).toEqual([mirror]);
    expect(selected.superseded).toEqual([manual]);
  });

  it("uses a live capture instead of a manual fallback from the same upstream source", () => {
    const manualFallback = benchmarkResult({
      ...base,
      source_id: "arcprize",
      provenance: "independent",
      score: 0.91,
      config: { reasoning_effort: "max", cost_per_task_usd: 2.5 },
      metadata: { manual_file: "manual/results/arcprize.yaml" },
    });
    const live = benchmarkResult({
      ...base,
      source_id: "arcprize",
      provenance: "independent",
      score: 0.9,
      config: { evaluation_profile: "max", provider_adapter: false },
    });

    const selected = selectPreferredResults([manualFallback, live]);
    expect(selected.kept).toEqual([live]);
    expect(selected.superseded).toEqual([manualFallback]);
  });
});
