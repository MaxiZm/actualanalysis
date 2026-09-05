import { fileURLToPath } from "node:url";
import { loadRegistry } from "@actualanalysis/shared";
import { describe, expect, it } from "vitest";
import { benchmarkResult } from "../adapters/helpers.js";
import { resolveRecordAliases } from "../lib/records.js";
import { annotateObservationMetadata } from "../observation-annotations.js";

const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));
const arenaUrl = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset";

function row(model: string, sourceUrl = arenaUrl) {
  return benchmarkResult({
    model,
    benchmark: "LMArena text, style-controlled",
    benchmark_id: "lmarena-text-style-controlled",
    source_id: "lmarena",
    score: 1482.8679362258424,
    score_unit: "elo",
    se: 2.6124242158421076,
    n_items: 23153,
    observed_on: "2026-09-01",
    source_url: sourceUrl,
    provenance: "independent",
  });
}

describe("Arena named effort identity", () => {
  it("preserves parenthesized and differently punctuated documented tiers", async () => {
    const registry = await loadRegistry(dataDir);
    const records = resolveRecordAliases([row("muse-spark-1.2 (xHigh)"), row("glm-5.3-max")], registry).records;
    expect(records).toHaveLength(2);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ model_id: "muse-spark-1.2", effort_tier: "xhigh" }),
      expect.objectContaining({ model_id: "glm-5.3", effort_tier: "max" }),
    ]));
  });

  it("resolves audited GPT aliases and preserves each explicitly reported effort", async () => {
    const registry = await loadRegistry(dataDir);
    const resolved = resolveRecordAliases([
      row("gpt-5.6-sol-xhigh"), row("gpt-5.6-terra-xhigh"),
      row("gpt-5.6-luna-xhigh"), row("gpt-5.5-high"),
      row("gpt-5.5"),
    ], registry);
    expect(resolved.unmapped).toEqual([]);
    const records = annotateObservationMetadata(resolved.records, registry);
    expect(records.map((record) => record.record_type === "benchmark_result"
      ? [record.model_id, record.effort_tier] : null)).toEqual(expect.arrayContaining([
      ["gpt-5.6-sol", "xhigh"], ["gpt-5.6-terra", "xhigh"],
      ["gpt-5.6-luna", "xhigh"], ["gpt-5.5", "high"],
      ["gpt-5.5", undefined],
    ]));
    expect(records).toHaveLength(5);
    expect(records.find((record) => record.model === "gpt-5.5-high"))
      .toMatchObject({ config: { reasoning_effort: "high" } });
    expect(records[0]).toMatchObject({ score: 1482.8679362258424, se: 2.6124242158421076, n_items: 23153 });
  });

  it("does not infer a bare model's default, an unsupported suffix, or another source's effort", async () => {
    const registry = await loadRegistry(dataDir);
    const records = annotateObservationMetadata([
      { ...row("gpt-5.5"), model_id: "gpt-5.5" },
      { ...row("gpt-5.6-sol-ultra"), model_id: "gpt-5.6-sol" },
      { ...row("gpt-5.6-sol-xhigh", "https://example.test/arena-mirror"), model_id: "gpt-5.6-sol" },
      { ...row("gpt-5.6-sol-xhigh"), model_id: "gpt-5.6-sol", effort_tier: "medium" },
    ], registry);
    expect(records.map((record) => record.record_type === "benchmark_result" ? record.effort_tier : null))
      .toEqual([undefined, undefined, undefined, "medium"]);
  });
});
