import { describe, expect, it } from "vitest";
import { EpochAdapter, EPOCH_ECI_URL } from "../adapters/epoch.js";
import { createAdapterContext } from "../types.js";
import { parseEpochSimpleQaRuns } from "../adapters/epoch-runs.js";

const header = "id_runs,task,original_task_name,id_model_version,Model,Display name,started_at,Status,task version,mean_score,stderr";
const row = (id: string, version: string, date: string, score: number, protocol = "SimpleQA Verified (anti-abstention)") =>
  `${id},SimpleQA Verified,${protocol},gpt-5.6-sol_max,GPT-5.6 Sol,GPT-5.6 Sol (max),${date},Success,${version},${score},0.0145`;

describe("Epoch SimpleQA native revision identity", () => {
  it("keeps accuracy, uncertainty, source run and named effort", () => {
    const [record] = parseEpochSimpleQaRuns([header, row("run1", "1.2.0", "2026-08-31T12:00:00Z", .697)].join("\n"));
    expect(record).toMatchObject({ benchmark_id: "simpleqa-verified-epoch-anti-abstention-v1-2-0",
      benchmark_version: "epoch-anti-abstention-1.2.0", evaluation_run_id: "run1", lineage_id: "epoch:run1",
      score: .697, se: .0145, score_unit: "fraction", effort_tier: "max",
      provenance: "independent", config: { statistic: "mean_accuracy", prompt_protocol: "native task revision; current source label anti-abstention" } });
    expect(record?.x_correct).toBeUndefined();
    expect(record?.n_items).toBeUndefined();
  });
  it("never admits the chance-rescaled ECI HLE projection as raw accuracy", async () => {
    const context = createAdapterContext({ dataDir: "/tmp", env: {}, fetch: (async () => new Response("model,benchmark,performance\nGPT-5,HLE,0.21554621848739497\nAmazon Nova Pro,HLE,0")) as typeof fetch });
    const result = await new EpochAdapter("https://epoch.ai/data/eci_benchmarks.csv").ingest(context);
    expect(result.records).toHaveLength(0);
    expect(result.warnings.some(w => w.message.includes("ECI-preprocessed"))).toBe(true);
  });
  it("replaces the lossy ECI SimpleQA projection in default ingestion", async () => {
    const context = createAdapterContext({ dataDir: "/tmp", env: {}, fetch: (async (url: string) => new Response(url === EPOCH_ECI_URL
      ? "model,benchmark,performance\nGPT-5.6 Sol,SimpleQA Verified,0.99"
      : [header, row("native", "1.2.0", "2026-08-31", .697)].join("\n"))) as typeof fetch });
    const result = await new EpochAdapter().ingest(context);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ evaluation_run_id: "native", score: .697, effort_tier: "max" });
  });
  it("never falls back to a best-over-configurations score when native retrieval fails", async () => {
    const context = createAdapterContext({ dataDir: "/tmp", env: {}, fetch: (async (url: string) => {
      if (url !== EPOCH_ECI_URL) throw new Error("native feed unavailable");
      return new Response("model,benchmark,performance\nGPT-5.6 Sol,SimpleQA Verified,0.99");
    }) as typeof fetch });
    const result = await new EpochAdapter().ingest(context);
    expect(result.records).toHaveLength(0);
    expect(result.warnings.some(w => w.message.includes("SimpleQA"))).toBe(true);
  });
  it("preserves native task revisions as separate conditions", () => {
    const records = parseEpochSimpleQaRuns([header, row("v1", "1.0.0", "2026-08-10", .69), row("v12", "1.2.0", "2026-08-31", .70)].join("\n"));
    expect(records.map(r => r.benchmark_id).sort()).toEqual(["simpleqa-verified-epoch-anti-abstention-v1-0-0", "simpleqa-verified-epoch-anti-abstention-v1-2-0"]);
  });
  it("requires the native task label and a known task revision", () => {
    const records = parseEpochSimpleQaRuns([header, row("old", "1.2.0", "2026-08-10", .69, "SimpleQA Verified"), row("unknown", "2.0.0", "2026-08-31", .70)].join("\n"));
    expect(records).toEqual([]);
  });
  it("uses the latest exact run rather than its best score", () => {
    const records = parseEpochSimpleQaRuns([header, row("new", "1.2.0", "2026-08-31", .60), row("old", "1.2.0", "2026-08-10", .70)].join("\n"));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ evaluation_run_id: "new", score: .60 });
  });
});
