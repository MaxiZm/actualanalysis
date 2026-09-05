import { describe, expect, it } from "vitest";
import { parseEpochGpqaRuns } from "../adapters/epoch-runs.js";
import { EpochAdapter, EPOCH_ECI_URL } from "../adapters/epoch.js";
import { createAdapterContext } from "../types.js";
const header = "id_runs,task,original_task_name,id_model_version,Model,Display name,started_at,Status,task version,mean_score,stderr";
const row = (id: string, revision: string, date: string, score: number) => `${id},GPQA diamond,GPQA diamond,gpt-5.5_xhigh,GPT-5.5,GPT-5.5 (xhigh),${date},Success,${revision},${score},0.015`;

describe("native Epoch GPQA display evidence", () => {
  it("preserves native accuracy, uncertainty and effort while preventing fit admission", () => {
    const [result] = parseEpochGpqaRuns([header, row("native", "1.0.11", "2026-08-31", .90)].join("\n"));
    expect(result).toMatchObject({ score: .90, score_unit: "fraction", se: .015, effort_tier: "xhigh",
      evaluation_run_id: "native", config: { task_version: "1.0.11", aci_fit_eligible: false } });
    expect(result).not.toHaveProperty("n_items");
    expect(result).not.toHaveProperty("x_correct");
  });
  it("retains distinct native revisions and selects the latest exact run, never the best", () => {
    const result = parseEpochGpqaRuns([header, row("old", "1.0.11", "2026-08-01", .95),
      row("new", "1.0.11", "2026-08-31", .9), row("prior-revision", "1.0.0", "2026-04-24", .93)].join("\n"));
    expect(result.map(r => r.evaluation_run_id).sort()).toEqual(["new", "prior-revision"]);
  });
  it("replaces normalized ECI projection with native raw mean in default ingestion", async () => {
    const context = createAdapterContext({ dataDir: "/tmp", env: {}, fetch: (async (url: string) => new Response(url === EPOCH_ECI_URL
      ? "model,benchmark,performance\nGPT-5.5,GPQA diamond,0.8666666666666667"
      : [header, row("native", "1.0.11", "2026-08-31", .9)].join("\n"))) as typeof fetch });
    const result = await new EpochAdapter().ingest(context);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ evaluation_run_id: "native", score: .9, config: { aci_fit_eligible: false } });
  });
});
