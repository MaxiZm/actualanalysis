import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DatacurveAdapter, DEEPSWE_V1_1_URL, DEEPSWE_V1_URL, parseDeepSweLive } from "../adapters/datacurve.js";
import { createAdapterContext, type RawBenchmarkResult, type RawResult } from "../types.js";

function benchmarks(records: readonly RawResult[]): RawBenchmarkResult[] {
  return records.filter((record): record is RawBenchmarkResult => record.record_type === "benchmark_result");
}

const fixture = (name: string) => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));
const now = () => new Date("2026-09-06T12:00:00Z");

function context(bodies: Record<string, string>) {
  return createAdapterContext({
    dataDir,
    env: {},
    now,
    fetch: async (input) => {
      const body = bodies[String(input)];
      if (body === undefined) throw new Error(`unexpected ${String(input)}`);
      return new Response(body);
    },
  });
}

describe("Datacurve DeepSWE live tables", () => {
  it("keeps v1.1 pass@1, run-to-run CI, explicit effort, and recent model names from the captured feed", async () => {
    const v11 = await fixture("deepswe-v1.1.json");
    const v1 = await fixture("deepswe-v1.json");
    const out = await new DatacurveAdapter().ingest(context({ [DEEPSWE_V1_URL]: v1, [DEEPSWE_V1_1_URL]: v11 }));
    const rows = benchmarks(out.records).filter((record) => record.benchmark_id === "deepswe-1.1");
    expect(rows).toHaveLength(6);
    const astra = rows.find((record) => record.model === "gpt-6-astra");
    expect(astra).toMatchObject({
      source_id: "datacurve",
      benchmark_version: "1.1",
      score: 0.7411504424778761,
      score_unit: "fraction",
      effort_tier: "xhigh",
      n_items: 113,
      n_runs: 4,
      harness: "mini-swe-agent",
      harness_class: "common",
      evaluation_run_id: "mini_swe_agent_gpt_6_astra_xhigh",
      lineage_id: "deepswe:v1.1:mini_swe_agent_gpt_6_astra_xhigh",
      observed_on: "2026-09-03",
      source_url: DEEPSWE_V1_1_URL,
      uncertainty_type: "ci95",
      uncertainty_value: [0.7124964807371247, 0.7698044042186275],
      uncertainty_unit: "run",
      config: { reasoning_effort: "xhigh", dataset_version: "1.1", statistic: "pass_at_1" },
    });
    expect(astra?.se).toBeCloseTo(0.02865396174075141 / 1.96, 12);
    expect(astra).not.toHaveProperty("x_correct");
    expect(astra).not.toHaveProperty("k_trials");
    expect(astra).not.toHaveProperty("model_id");
    expect(rows.find((record) => record.model === "gemini-3-8-flash")).toMatchObject({ effort_tier: "high", score: 0.738255033557047 });
    expect(rows.find((record) => record.model === "grok-4-6")).toMatchObject({ effort_tier: "xhigh", score: 0.6674057649667405 });
    const unlabeled = rows.find((record) => record.model === "kimi-k2-7-code");
    expect(unlabeled).toMatchObject({ score: 0.3053097345132743, evaluation_run_id: "mini_swe_agent_kimi_k2_7_code_default" });
    expect(unlabeled).not.toHaveProperty("effort_tier");
    expect(unlabeled?.config).not.toHaveProperty("reasoning_effort");
    expect(rows.find((record) => record.model === "deepseek-v4-pro")).not.toHaveProperty("model_id");
  });

  it("does not merge v1 into v1.1, invent n_runs for the Wald row, or treat _default as an effort setting", async () => {
    const v11 = await fixture("deepswe-v1.1.json");
    const v1 = await fixture("deepswe-v1.json");
    const out = await new DatacurveAdapter().ingest(context({ [DEEPSWE_V1_URL]: v1, [DEEPSWE_V1_1_URL]: v11 }));
    const v1Rows = benchmarks(out.records).filter((record) => record.benchmark_id === "deepswe");
    const v11Rows = benchmarks(out.records).filter((record) => record.benchmark_id === "deepswe-1.1");
    expect(v1Rows).toHaveLength(6);
    expect(v11Rows).toHaveLength(6);
    expect(new Set(v1Rows.map((record) => record.benchmark_version))).toEqual(new Set(["1"]));
    expect(new Set(v11Rows.map((record) => record.benchmark_version))).toEqual(new Set(["1.1"]));
    const gpt55 = v1Rows.filter((record) => record.model === "gpt-5-5");
    expect(gpt55.map((record) => record.effort_tier).sort()).toEqual(["high", "medium", "xhigh"]);
    expect(gpt55.find((record) => record.effort_tier === "xhigh")).toMatchObject({ n_items: 111, score: 0.7004504504504504 });
    const wald = v1Rows.find((record) => record.model === "minimax-m3");
    expect(wald).toMatchObject({
      score: 0.20444444444444446,
      uncertainty_unit: "item",
      uncertainty_type: "ci95",
      n_items: 113,
    });
    expect(wald).not.toHaveProperty("n_runs");
    expect(wald).not.toHaveProperty("effort_tier");
    expect(v1Rows.find((record) => record.model === "deepseek-v4-pro")).not.toHaveProperty("model_id");
    expect(v1Rows.find((record) => record.model === "claude-haiku-4-5")).not.toHaveProperty("effort_tier");
  });

  it("leaves an incomplete payload visible instead of synthesizing scores", () => {
    const parsed = parseDeepSweLive({ generated_at: "2026-09-03T00:00:00Z", rows: [{ model: "gpt-6-astra" }] }, createAdapterContext({ dataDir, env: {}, now }), {
      url: DEEPSWE_V1_1_URL, benchmark: "DeepSWE v1.1", benchmarkId: "deepswe-1.1", version: "1.1",
    });
    expect(parsed.records).toEqual([]);
    expect(parsed.warnings[0]?.code).toBe("parse_failed");
  });

  it("continues the other DeepSWE revision when one endpoint fails", async () => {
    const v11 = await fixture("deepswe-v1.1.json");
    const out = await new DatacurveAdapter().ingest(context({ [DEEPSWE_V1_1_URL]: v11 }));
    expect(benchmarks(out.records).every((record) => record.benchmark_id === "deepswe-1.1")).toBe(true);
    expect(out.records).toHaveLength(6);
    expect(out.warnings.some((warning) => warning.code === "fetch_failed" && warning.url === DEEPSWE_V1_URL)).toBe(true);
  });
});
