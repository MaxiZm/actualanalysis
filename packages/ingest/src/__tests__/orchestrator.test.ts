import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "@actualanalysis/shared";
import { describe, expect, it } from "vitest";
import { benchmarkResult } from "../adapters/helpers.js";
import { parseCliArgs } from "../cli-options.js";
import { output } from "../lib/adapter.js";
import { annotateObservationMetadata } from "../observation-annotations.js";
import { ingestSources, writeResolvedRecords } from "../orchestrator.js";
import type { IngestAdapter } from "../types.js";
import { formatUnmappedReport, writeUnmappedReportIfChanged } from "../unmapped-report.js";

const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));

function adapter(id: string, sourceId: string, provenance: "self_report" | "independent", score: number): IngestAdapter {
  return {
    id,
    async ingest(context) {
      return output(id, context, [benchmarkResult({
        model: "openai/gpt-5",
        benchmark: "TB 4.0",
        source_id: sourceId,
        score,
        score_unit: "fraction",
        observed_on: "2026-09-03",
        source_url: "https://example.test/result",
        provenance,
      })]);
    },
  };
}

describe("ingestion orchestration", () => {
  it("annotates an exact source row only when its tier equals the registry default", async () => {
    const registry = await loadRegistry(dataDir);
    const o3 = registry.models.find((model) => model.id === "o3");
    if (!o3) throw new Error("o3 fixture model missing");
    const sourceUrl = "https://labs.scale.com/leaderboard/humanitys_last_exam";
    const record = benchmarkResult({
      model: "o3",
      model_id: "o3",
      benchmark: "Humanity's Last Exam (no tools)",
      benchmark_id: "hle-no-tools",
      source_id: "scale",
      score: 0.2,
      score_unit: "fraction",
      config: { evaluation_profile: "medium" },
      observed_on: "2025-04-16",
      source_url: sourceUrl,
      provenance: "independent",
      metadata: { reported_model_name: "o3 (medium) (April 2025)" },
    });
    const [annotated] = annotateObservationMetadata([record], {
      models: registry.models.map((model) => model.id === "o3"
        ? { ...model, default_effort_tier: "medium", max_effort_tier: "high", effort_tier_order: ["low", "medium", "high"] }
        : model),
      sources: registry.sources,
    });
    expect(annotated).toMatchObject({
      effort_tier: "medium",
      harness: "scale-hle-leaderboard",
      harness_class: "common",
      tool_policy: "none",
      source_url: sourceUrl,
      metadata: {
        aci12_observation_annotation: {
          version: "aci-1.2.1",
          status: "metadata_incomplete",
          protocol_id: "scale-hle-leaderboard-2025",
          effort_rule_id: "scale-hle-o3-medium-default",
        },
      },
    });
  });

  it("keeps an ambiguous source snapshot effort-unassigned with an explicit exclusion reason", async () => {
    const registry = await loadRegistry(dataDir);
    const record = benchmarkResult({
      model: "Gemini 2.0 Flash Thinking (January 2025)",
      model_id: "gemini-2.0-flash-thinking",
      benchmark: "Humanity's Last Exam (no tools)",
      benchmark_id: "hle-no-tools",
      source_id: "scale",
      score: 0.1,
      score_unit: "fraction",
      observed_on: "2025-04-10",
      source_url: "https://labs.scale.com/leaderboard/humanitys_last_exam",
      provenance: "independent",
      metadata: { reported_model_name: "Gemini 2.0 Flash Thinking (January 2025)" },
    });
    const [annotated] = annotateObservationMetadata([record], registry);
    expect(annotated?.record_type).toBe("benchmark_result");
    if (annotated?.record_type !== "benchmark_result") throw new Error("expected benchmark result");
    expect(annotated.effort_tier).toBeUndefined();
    expect(annotated.metadata.aci12_observation_annotation).toMatchObject({
      status: "excluded",
      effort_rule_id: "scale-hle-gemini-2.0-flash-thinking-snapshot-ambiguous",
    });
    expect(JSON.stringify(annotated.metadata.aci12_observation_annotation)).toContain("exp-1219");
  });

  it("requires exact source configurations for the Claude and Qwen replacement profiles", async () => {
    const registry = await loadRegistry(dataDir);
    const qwenConfig = {
      arc_model_id: "qwen3-235b-a22b-instruct-2507",
      model_group: null,
      model_type: "Base LLM",
      evaluation_profile: null,
      provider_adapter: false,
      data_subset: "v2_Semi_Private",
    };
    const base = {
      model: "Qwen3-235b-a22b Instruct (25/07)",
      model_id: "qwen3-235b-a22b-2507",
      benchmark: "ARC-AGI-2 semi-private",
      benchmark_id: "arc-agi-2-semi-private",
      source_id: "arcprize",
      score: 0.1,
      score_unit: "fraction" as const,
      observed_on: "2026-09-04",
      source_url: "https://arcprize.org/leaderboard",
      provenance: "independent" as const,
      metadata: {
        reported_display_name: "Qwen3-235b-a22b Instruct (25/07)",
        model_release_date: "2025-07-25",
      },
    };
    const annotationRegistry = {
      models: registry.models.map((model) => {
        if (model.id === "qwen3-235b-a22b-2507") {
          return { ...model, default_effort_tier: "non-thinking", max_effort_tier: "non-thinking", effort_tier_order: ["non-thinking"] };
        }
        if (model.id === "claude-sonnet-4") return { ...model, default_effort_tier: "standard" };
        return model;
      }),
      sources: registry.sources,
    };
    const [exact, changed, claude] = annotateObservationMetadata([
      benchmarkResult({ ...base, config: qwenConfig }),
      benchmarkResult({ ...base, config: { ...qwenConfig, evaluation_profile: "Thinking" } }),
      benchmarkResult({
        ...base,
        model: "Claude Sonnet 4",
        model_id: "claude-sonnet-4",
        score: 0.0552,
        config: {},
        observed_on: "2025-05-23",
        source_url: "https://labs.scale.com/leaderboard/humanitys_last_exam",
        benchmark: "Humanity's Last Exam (no tools)",
        benchmark_id: "hle-no-tools",
        source_id: "scale",
        metadata: { reported_model_name: "Claude Sonnet 4" },
      }),
    ], annotationRegistry);
    expect(exact).toMatchObject({ effort_tier: "non-thinking", harness_class: "common" });
    expect(changed?.record_type === "benchmark_result" && changed.effort_tier).toBe("Thinking");
    expect(claude).toMatchObject({ effort_tier: "standard", tool_policy: "none", harness_class: "common" });
  });

  it("resolves aliases and reports provenance selection without discarding audit rows", async () => {
    const adapters = new Map([
      ["vendor", adapter("vendor", "vendor-model-cards", "self_report", 0.5)],
      ["runner", adapter("runner", "scale", "independent", 0.48)],
    ]);
    const result = await ingestSources({
      sources: ["vendor", "runner"],
      dataDir,
      adapters,
      now: () => new Date("2026-09-03T12:00:00Z"),
      env: {},
    });
    expect(result.records).toHaveLength(2);
    expect(result.records.every((record) => record.model_id === "gpt-5-2025-08-07")).toBe(true);
    expect(result.selectedRecords).toHaveLength(1);
    expect(result.selectedRecords[0]).toMatchObject({ source_id: "scale", score: 0.48 });
    expect(result.supersededRecords[0]).toMatchObject({ source_id: "vendor-model-cards", score: 0.5 });
  });

  it("writes the resolved RawResult array for downstream pipeline steps", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "actualanalysis-ingest-"));
    try {
      const filename = path.join(directory, "nested", "records.json");
      const record = benchmarkResult({
        model: "GPT-5",
        model_id: "gpt-5-2025-08-07",
        benchmark: "Terminal-Bench 4.0",
        benchmark_id: "terminal-bench-4.0",
        source_id: "tbench",
        score: 42,
        score_unit: "percent",
        observed_on: "2026-09-03",
        source_url: "https://www.tbench.ai/leaderboard",
        provenance: "independent",
      });
      await writeResolvedRecords(filename, [record]);
      expect(JSON.parse(await readFile(filename, "utf8"))).toEqual([record]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("formats unmapped names deterministically and skips unchanged rewrites", async () => {
    const entries = [
      { kind: "model" as const, value: "Zeta", source_id: "epoch", occurrences: 1 },
      { kind: "benchmark" as const, value: "Alpha", source_id: "epoch", occurrences: 2 },
    ];
    expect(formatUnmappedReport(entries)).not.toContain("generated_at");
    expect(formatUnmappedReport(entries)).toBe(formatUnmappedReport([...entries].reverse()));

    const directory = await mkdtemp(path.join(os.tmpdir(), "actualanalysis-unmapped-"));
    try {
      const filename = path.join(directory, "nested", "unmapped.yaml");
      expect(await writeUnmappedReportIfChanged(filename, entries)).toBe(true);
      const before = await stat(filename);
      expect(await writeUnmappedReportIfChanged(filename, [...entries].reverse())).toBe(false);
      const after = await stat(filename);
      expect(after.mtimeMs).toBe(before.mtimeMs);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts the CLI --output option in normal and dry-run argument sets", () => {
    const normal = parseCliArgs(["manual", "--output", "out/results.json"], ["manual"]);
    const dry = parseCliArgs(["manual", "--dry-run", "--output", "out/dry.json"], ["manual"]);
    if (!normal || !dry) throw new Error("expected parsed CLI options");
    expect(normal.outputFile).toBe(path.resolve("out/results.json"));
    expect(dry).toMatchObject({ dryRun: true, outputFile: path.resolve("out/dry.json") });
  });

  it("returns a help sentinel without treating --help as an error", () => {
    expect(parseCliArgs(["--help"], ["manual"])).toBeNull();
  });

  it("defaults a source-less dry run to every adapter", () => {
    expect(parseCliArgs(["--dry-run"], ["epoch", "manual"])?.sources).toEqual(["epoch", "manual"]);
  });
});
