import { describe, expect, it } from "vitest";
import { parseEpochFrontierMathRuns } from "../adapters/epoch-runs.js";

const header = "id_runs,task,model,id_model_version,Model,Display name,started_at,Status,task version,mean_score,stderr";
const row = (id: string, task: string, date: string, score: number, version = "2.0.0") =>
  `${id},${task},gpt-5.5_xhigh,gpt-5.5_xhigh,GPT-5.5,GPT-5.5 (xhigh),${date},Success,${version},${score},0.0715`;

describe("Epoch original FrontierMath runs", () => {
  it("preserves the exact revision, effort, original uncertainty and run identity", () => {
    const [record] = parseEpochFrontierMathRuns([header, row("run-1", "FrontierMath-Tier-4-v2-Private", "2026-06-11T17:47:36Z", 0.725)].join("\n"));
    expect(record).toMatchObject({
      model: "GPT-5.5", benchmark_id: "frontiermath-v2-tier-4", benchmark_version: "v2-tier-4",
      grader_version: "2.0.0", effort_tier: "xhigh", evaluation_run_id: "run-1", lineage_id: "epoch:run-1",
      provenance: "independent", origin_provenance: "independent", score: 0.725, se: 0.0715,
      observed_on: "2026-06-11", tool_policy: "python-submit-answer",
    });
    expect(record?.n_items).toBeUndefined(); // Partial runs use source SE rather than a fabricated success count.
  });

  it("does not silently turn a distinct promax system into ordinary max effort", () => {
    const input = [header, row("promax", "FrontierMath-Tier-4-v2-Private", "2026-07-09", .8).replaceAll("gpt-5.5_xhigh", "gpt-5.6-sol_promax")].join("\n");
    const [record] = parseEpochFrontierMathRuns(input);
    expect(record?.effort_tier).toBeUndefined();
    expect(record?.config.aci_fit_eligible).toBe(false);
    expect(record?.config.epoch_model_version).toBe("gpt-5.6-sol_promax");
  });

  it("never relabels v1 or the public subset as v2 private", () => {
    const records = parseEpochFrontierMathRuns([
      header,
      row("old", "FrontierMath-Tier-4-2025-07-01-Private", "2026-04-23", 0.354),
      row("public", "FrontierMath-2025-02-28-Public", "2026-04-23", 1),
      row("wrong-revision", "FrontierMath-Tier-4-v2-Private", "2026-07-01", 0.5, "1.0.0"),
    ].join("\n"));
    expect(records).toEqual([]);
  });

  it("selects the latest completed run rather than the maximum score", () => {
    const records = parseEpochFrontierMathRuns([
      header,
      row("earlier", "FrontierMath-Tier-4-v2-Private", "2026-06-12", 0.8),
      row("later", "FrontierMath-Tier-4-v2-Private", "2026-07-01", 0.7),
    ].join("\n"));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ evaluation_run_id: "later", score: 0.7 });
  });
});
