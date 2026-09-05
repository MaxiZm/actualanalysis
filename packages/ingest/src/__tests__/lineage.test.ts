import { describe, expect, it } from "vitest";
import { benchmarkResult } from "../adapters/helpers.js";
import { harmonizeObservationLineages, selectLineageObservations } from "../lib/lineage.js";
import { deduplicateRecords } from "../lib/records.js";

const native = (effort: string, score: number, date = "2026-09-04") => benchmarkResult({
  model: "GPT-5.5", model_id: "gpt-5.5", benchmark: "ARC-AGI-2", benchmark_id: "arc-agi-2-semi-private",
  source_id: "arcprize", source_url: "https://arcprize.org/leaderboard", provenance: "independent",
  observed_on: date, effort_tier: effort, score, score_unit: "fraction", config: { arc_model_id: `gpt55-${effort}`, evaluation_profile: effort },
});
const copy = (score: number, effort?: string) => benchmarkResult({
  model: "GPT-5.5", model_id: "gpt-5.5", benchmark: "ARC-AGI-2", benchmark_id: "arc-agi-2-semi-private",
  source_id: "epoch", source_url: "https://epoch.ai/data/eci_benchmarks.csv", provenance: "mirror",
  observed_on: "2026-09-04", score, score_unit: "fraction", ...(effort ? { effort_tier: effort } : {}),
});

describe("upstream observation lineage", () => {
  it("keeps distinct results when a publisher uses one batch run ID", () => {
    const base = { ...native("high", .8), evaluation_run_id: "leaderboard-2026-09-05" };
    const rows = [base,
      { ...base, model_id: "gpt-5.6-sol", model: "GPT-5.6 Sol" },
      { ...base, benchmark_id: "hle-no-tools", benchmark: "HLE" },
      { ...native("xhigh", .9), evaluation_run_id: base.evaluation_run_id },
    ];
    expect(selectLineageObservations(harmonizeObservationLineages(rows)).kept).toHaveLength(4);
  });

  it("never deduplicates different entities under a supplied lineage ID", () => {
    const base = { ...native("high", .8), lineage_id: "upstream-batch" };
    expect(selectLineageObservations([base,
      { ...base, model_id: "gpt-5.6-sol", model: "GPT-5.6 Sol" },
      { ...base, benchmark_id: "hle-no-tools", benchmark: "HLE" },
    ]).kept).toHaveLength(3);
  });

  it("counts an unambiguous ARC mirror once and preserves low/high configurations", () => {
    const rows = harmonizeObservationLineages([copy(.85), native("medium", .7042), native("xhigh", .85)]);
    const result = selectLineageObservations(rows);
    expect(result.kept).toHaveLength(2);
    expect(result.kept.map(r => r.record_type === "benchmark_result" ? r.effort_tier : null)).toEqual(["medium", "xhigh"]);
    expect(result.superseded[0]).toMatchObject({ source_id: "epoch", host_source: "arcprize" });
  });

  it("does not guess an unknown-effort mirror when two configurations share the score", () => {
    const result = selectLineageObservations(harmonizeObservationLineages([native("high", .85), native("xhigh", .85), copy(.85)]));
    expect(result.kept).toHaveLength(3);
    expect(result.superseded).toEqual([]);
  });

  it("does not merge a known different effort, task revision, or independent replication", () => {
    const base = native("xhigh", .85);
    const differentVersion = { ...copy(.85, "xhigh"), benchmark_version: "another revision" };
    const result = selectLineageObservations(harmonizeObservationLineages([
      { ...base, benchmark_version: "v2" }, copy(.85, "high"), differentVersion,
      { ...copy(.85, "xhigh"), provenance: "independent" as const },
    ]));
    expect(result.kept).toHaveLength(4);
  });

  it("matches rounded manual copies only to a compatible native configuration", () => {
    const manual = { ...native("high", 84.6), score_unit: "percent" as const, config: { reasoning_effort: "high" }, metadata: { manual_file: "manual/arc.yaml" } };
    const wrongEffort = { ...manual, effort_tier: "medium" };
    const result = selectLineageObservations(harmonizeObservationLineages([manual, wrongEffort, native("high", .8458)]));
    expect(result.kept).toHaveLength(2);
    expect(result.superseded).toHaveLength(1);
    expect(result.superseded[0]?.effort_tier).toBe("high");
  });

  it("preserves a newer lower score when source input arrives in reverse chronological order", () => {
    const records = deduplicateRecords([native("xhigh", .85, "2026-09-04"), native("xhigh", .86, "2026-09-03")]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ score: .85, observed_on: "2026-09-04" });
  });

  it("uses the latest update of an exact native evaluation even when its score falls", () => {
    const result = selectLineageObservations(harmonizeObservationLineages([native("xhigh", .86, "2026-09-03"), native("xhigh", .85, "2026-09-04")]));
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]).toMatchObject({ score: .85, observed_on: "2026-09-04" });
  });
});
