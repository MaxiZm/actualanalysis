import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ArcPrizeAdapter } from "../adapters/arcprize.js";
import { EpochAdapter } from "../adapters/epoch.js";
import { KaggleAdapter } from "../adapters/kaggle.js";
import { LmArenaAdapter } from "../adapters/lmarena.js";
import { MathArenaAdapter } from "../adapters/matharena.js";
import { McpMarkAdapter } from "../adapters/mcpmark.js";
import { MetrAdapter } from "../adapters/metr.js";
import { OpenRouterAdapter } from "../adapters/openrouter.js";
import { createAdapters } from "../adapters/registry.js";
import { ScaleAdapter } from "../adapters/scale.js";
import { TolerantScraperAdapter } from "../adapters/scraper.js";
import { SweRebenchAdapter } from "../adapters/swe-rebench.js";
import { TauBenchAdapter } from "../adapters/taubench.js";
import { TbenchAdapter } from "../adapters/tbench.js";
import { runAdapter } from "../lib/adapter.js";
import { createAdapterContext } from "../types.js";

const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));
const fixture = (name: string) => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");

function contextFor(body: string) {
  return createAdapterContext({
    dataDir,
    now: () => new Date("2026-09-03T12:00:00Z"),
    fetch: async () => new Response(body, { status: 200 }),
    env: {},
  });
}

function flightHtml(payload: string): string {
  return `<!doctype html><script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`;
}

describe("source adapters", () => {
  it("registers every v1 adapter", () => {
    expect([...createAdapters().keys()]).toEqual([
      "epoch", "openrouter", "swe-rebench", "lmarena", "kaggle", "matharena", "metr",
      "tbench", "scale", "arcprize", "taubench", "mcpmark", "manual",
    ]);
  });

  it("parses Epoch CSV and preserves origin provenance", async () => {
    const result = await new EpochAdapter("https://example.test/epoch.csv").ingest(contextFor(await fixture("epoch.csv")));
    expect(result.records).toHaveLength(2);
    expect(result.records.find((record) => record.record_type === "benchmark_result" && record.model === "GPT-5")).toMatchObject({
      score: 0.42,
      score_unit: "fraction",
      provenance: "mirror",
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "partial",
      message: expect.stringContaining("ECI-preprocessed non-accuracy"),
    }));
  });

  it("blocks Artificial Analysis benchmark scores relayed through Epoch", async () => {
    const csv = [
      "model_id,benchmark_id,model,benchmark,performance,source,observed_on",
      "epoch-gpt5,critpt,GPT-5,CritPt,0.12,Artificial Analysis,2026-08-31",
    ].join("\n");
    const result = await new EpochAdapter("https://example.test/epoch.csv").ingest(contextFor(csv));
    expect(result.records).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "partial",
      message: expect.stringContaining("originate from Artificial Analysis"),
    }));
  });

  it("does not relabel Epoch's Terminal-Bench v2 rows as Terminal-Bench v4", async () => {
    const csv = [
      "model_id,benchmark_id,model,benchmark,performance,source,observed_on",
      "epoch-gpt5,tbench-v2,GPT-5,Terminal Bench,0.63,https://www.tbench.ai/leaderboard/terminal-bench/2.0,2026-08-31",
      "epoch-gpt5,tbench-v4,GPT-5,Terminal-Bench 4.0,0.42,Terminal-Bench v4 Leaderboard,2026-08-31",
    ].join("\n");
    const result = await new EpochAdapter("https://example.test/epoch.csv").ingest(contextFor(csv));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ benchmark: "Terminal-Bench 4.0", score: 0.42 });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "partial",
      message: expect.stringContaining("version does not match"),
    }));
  });

  it("converts OpenRouter per-token prices to per-million prices", async () => {
    const result = await new OpenRouterAdapter("https://example.test/models").ingest(contextFor(await fixture("openrouter.json")));
    expect(result.records[0]).toMatchObject({
      record_type: "pricing",
      model: "openai/gpt-5",
      source_id: "openrouter",
      input_per_million: 1.25,
      output_per_million: 10,
      cache_read_per_million: 0.125,
      context_length: 400000,
      max_output: 128000,
    });
  });

  it("accepts explicit Kaggle feed locations without environment variables", async () => {
    const result = await new KaggleAdapter({
      "simpleqa-verified": "https://example.test/simpleqa.csv",
    }).ingest(contextFor(await fixture("epoch.csv")));
    expect(result.records).toHaveLength(2);
    expect(result.records.every((record) => record.record_type === "benchmark_result" && record.benchmark_id === "simpleqa-verified")).toBe(true);
    expect(result.warnings.filter(({ code }) => code === "configuration")).toHaveLength(2);
  });

  it("parses simple HTML leaderboard tables", async () => {
    const adapter = new TolerantScraperAdapter("fixture", [{
      url: "https://example.test/leaderboard",
      benchmark: "Terminal-Bench 4.0",
      benchmarkId: "terminal-bench-4.0",
      sourceId: "tbench",
      provenance: "independent",
    }]);
    const result = await adapter.ingest(contextFor(await fixture("leaderboard.html")));
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ score_unit: "percent" });
    expect(result.warnings).toEqual([]);
  });

  it("parses METR p50 horizon YAML", async () => {
    const result = await new MetrAdapter("https://example.test/metr.yaml").ingest(contextFor(await fixture("metr.yaml")));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      score: 512,
      score_unit: "minutes",
      benchmark_id: "metr-time-horizon-1.1",
      benchmark_version: "METR-Horizon-v1.1",
      se: 512 * Math.LN2 / 1.96,
      uncertainty_type: "ci95",
      uncertainty_value: [256, 1024],
      metadata: {
        reported_ci95_low: 256,
        reported_ci95_high: 1024,
        long_tasks_version: "799cc9c4b4483a93fc3445623a49ea1bd74fdeb2",
        scaffolds: ["metr_agents/react"],
      },
    });
  });

  it("preserves LMArena snapshot identity and reported 95% bounds", async () => {
    const payload = JSON.stringify({
      num_rows_total: 1,
      rows: [{ row: {
        model_name: "GPT-5",
        rating: 1420,
        rating_lower: 1410,
        rating_upper: 1430,
        variance: 25,
        vote_count: 1200,
        rank: 1,
        category: "overall",
        leaderboard_publish_date: "2026-09-01",
      } }],
    });
    const result = await new LmArenaAdapter().ingest(contextFor(payload));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      evaluation_run_id: "text_style_control:2026-09-01",
      uncertainty_type: "ci95",
      uncertainty_value: [1410, 1430],
      uncertainty_unit: "source",
      se: 5,
    });
  });

  it("parses SWE-rebench's Next.js Flight leaderboard payload", async () => {
    const flight = JSON.stringify([1, JSON.stringify({
      items: [{
        modelName: "GPT-5",
        taskRangeTimestamp: { from: 1, to: 3 },
        rangeStats: { all: { "1:3": { resolvedRate: 42, sem: 2 } } },
      }],
    })]);
    const html = `<!doctype html><script>self.__next_f.push(${flight})</script>`;
    const result = await new SweRebenchAdapter("https://example.test/swe").ingest(contextFor(html));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ model: "GPT-5", score: 42, score_unit: "percent", se: 2 });
  });

  it("parses Scale Flight entries and converts a 95% CI half-width to SE", async () => {
    const html = flightHtml(await fixture("scale-entries.json"));
    const result = await new ScaleAdapter().ingest(contextFor(html));
    expect(result.records).toHaveLength(2);
    expect(result.records.find((record) => record.record_type === "benchmark_result" && record.benchmark_id === "swe-bench-pro-public")).toMatchObject({
      model: "GPT-5.6 Sol",
      score: 59.1,
      se: 3.56 / 1.96,
      n_items: 731,
      effort_tier: "high",
      config: { evaluation_profile: "high" },
    });
    const hle = result.records.find((record) => record.record_type === "benchmark_result" && record.benchmark_id === "hle-no-tools");
    expect(hle).not.toHaveProperty("n_items");
    expect(hle).toMatchObject({
      config: { aci_fit_eligible: false },
      metadata: { exact_benchmark_revision_provided: false, aggregate_count_compatible: false },
    });
  });

  it("keeps Terminal-Bench reasoning effort in config rather than model identity", async () => {
    const result = await new TbenchAdapter().ingest(contextFor(flightHtml(await fixture("tbench-rows.json"))));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      model: "GPT-5.6 Sol",
      score: 37.27,
      se: 2.65,
      n_items: 66,
      k_trials: 5,
      evaluation_run_id: "tb4-gpt-5-6-sol-high",
      cost_per_task: 0.2,
      latency_s: 123.4,
      effort_tier: "high",
      config: { reasoning_effort: "high", agent: "Terminus 2" },
    });
  });

  it("parses MathArena point estimates and reported bootstrap confidence intervals", async () => {
    const result = await new MathArenaAdapter("https://example.test/math").ingest(contextFor(await fixture("matharena.html")));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      model: "GPT-5.6 Sol",
      score: 72.7,
      se: 2.7 / 1.96,
      effort_tier: "high",
      n_runs: 4,
      cost_per_task: 4.37,
      observed_on: "2026-09-03",
      metadata: { model_release_date: "2026-07-09", reported_ci95_half_width: 2.7 },
    });
  });

  it("derives MCPMark SE from the reported standard deviation across four runs", async () => {
    const result = await new McpMarkAdapter("https://example.test/mcp").ingest(
      contextFor(flightHtml(await fixture("mcpmark-data.json"))),
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      model: "GPT-5.6 Sol",
      score: 0.72,
      se: 0.02,
      n_items: 127,
      k_trials: 4,
      n_runs: 4,
      cost_per_task: 1.25 / 127,
      latency_s: 18.2,
      metadata: { reported_pass_at_1_std: 0.04 },
    });
  });

  it("uses only the tau3 knowledge leaderboard pass^1 column", async () => {
    const result = await new TauBenchAdapter("https://example.test/tau").ingest(contextFor(await fixture("taubench.html")));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      model: "GPT-5.6 Sol",
      score: 63.5,
      n_items: 97,
      k_trials: 4,
      observed_on: "2026-09-03",
      effort_tier: "high",
      cost_per_task: 1.05,
      config: { reasoning_effort: "high", retrieval: "BM25", user_simulator: "GPT-5" },
      metadata: { model_release_date: "2026-07-09" },
    });
  });

  it("joins official ARC model and evaluation datasets without inventing ARC-3 uncertainty", async () => {
    const [models, evaluations] = await Promise.all([fixture("arc-models.json"), fixture("arc-evaluations.json")]);
    const context = createAdapterContext({
      dataDir,
      now: () => new Date("2026-09-03T12:00:00Z"),
      fetch: async (input) => new Response(String(input).includes("models") ? models : evaluations, { status: 200 }),
      env: {},
    });
    const result = await new ArcPrizeAdapter(
      "https://example.test/models.json",
      "https://example.test/evaluations.json",
    ).ingest(context);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      model: "GPT-5.6 Sol",
      benchmark_id: "arc-agi-2-semi-private",
      n_items: 120,
      cost_per_task: 0.83,
      effort_tier: "high",
      config: { arc_model_id: "openai-gpt-5-6-sol-high", evaluation_profile: "high", provider_adapter: true },
    });
    expect(result.records[1]).toMatchObject({ benchmark_id: "arc-agi-3" });
    expect(result.records[1]).not.toHaveProperty("n_items");
    expect(result.records[1]).not.toHaveProperty("se");
  });

  it("fails soft when a scraper cannot fetch", async () => {
    const adapter = new TolerantScraperAdapter("fixture", [{
      url: "https://example.test/down",
      benchmark: "MCPMark",
      benchmarkId: "mcpmark",
      sourceId: "mcpmark",
      provenance: "independent",
    }]);
    const context = createAdapterContext({
      dataDir,
      fetch: async () => { throw new Error("offline"); },
      env: {},
    });
    const result = await runAdapter(adapter, context);
    expect(result.records).toEqual([]);
    expect(result.warnings.some(({ code }) => code === "fetch_failed")).toBe(true);
  });
});
