import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseSweRebenchNativeRows, SweRebenchAdapter, SWE_REBENCH_TASK_WINDOW } from "../adapters/swe-rebench.js";
import { createAdapterContext } from "../types.js";

const context = createAdapterContext({ dataDir: "data", now: () => new Date("2026-09-05T12:00:00Z"), env: {} });
function native(name: string, score: number) {
  return {
    modelName: name, modelId: `${name}__tools`, agentVersion: "tools", meta: { instance_type: "model" },
    taskRangeTimestamp: { from: 1, to: 9999999999999 },
    rangeStats: { all: {
      "1:9999999999999": { resolvedRate: 99, sem: 0.1 },
      [SWE_REBENCH_TASK_WINDOW.key]: { resolvedRate: score, sem: 1.3, instanceCosts: 0.5, passN: 90 },
    } },
  };
}
describe("SWE-rebench common task window", () => {
  it("matches the registered task cohort and machine tool policy", () => {
    const benchmark = parse(readFileSync(new URL("../../../../data/benchmarks/swe-rebench.yaml", import.meta.url), "utf8"));
    const [record] = parseSweRebenchNativeRows([native("GPT-5.6 Sol [medium]", 42)], context, "https://swe-rebench.com/leaderboard");
    expect(record?.benchmark_version).toBe(benchmark.version);
    expect(record?.n_items).toBe(benchmark.n_items);
    expect(record?.tool_policy).toBe(benchmark.tool_policy);
  });
  it("selects the same 111 tasks for every model, retaining exact window, effort, SEM and scaffold", () => {
    const records = parseSweRebenchNativeRows([native("GPT-5.6 Sol [medium]", 42), native("Fable 5 [high]", 52)], context, "https://swe-rebench.com/leaderboard");
    expect(records.map(r => r.score)).toEqual([42, 52]);
    expect(records[0]).toMatchObject({ model: "GPT-5.6 Sol", benchmark_version: SWE_REBENCH_TASK_WINDOW.version, n_items: 111, n_runs: 5, effort_tier: "medium", se: 1.3, uncertainty_unit: "run", harness: "SWE-rebench ReAct tools", config: { task_window_start: "2026-05-15", task_window_end: "2026-07-01", agent_version: "tools" } });
    expect(records[1]?.effort_tier).toBe("high");
    expect(records.every(r => r.lineage_id?.includes(SWE_REBENCH_TASK_WINDOW.key))).toBe(true);
  });
  it("skips standalone agents, different scaffolds and models absent from the selected cohort", () => {
    const agent = { ...native("Claude Code", 60), meta: { instance_type: "agent" } };
    const old = { ...native("Older model", 50), rangeStats: { all: { "1:9999999999999": { resolvedRate: 99 } } } };
    const otherScaffold = { ...native("Other model", 50), agentVersion: "text" };
    expect(parseSweRebenchNativeRows([agent, old, otherScaffold], context, "https://swe-rebench.com/leaderboard")).toHaveLength(0);
  });
  it("preserves source percent units below 1 percent and the April preview release identity", () => {
    const records = parseSweRebenchNativeRows([{ ...native("DeepSeek-V4 Pro [high]", 0.8), release: { date: "2026-04-24" } }], context, "https://swe-rebench.com/leaderboard");
    expect(records[0]).toMatchObject({ model_id: "deepseek-v4-pro-0424", score: 0.8, score_unit: "percent", effort_tier: "high" });
  });
  it("prefers native cohort rows over a rendered aggregate that hides its historical window", async () => {
    const payload = JSON.stringify([1, JSON.stringify({ items: [native("GPT-5.6 Sol [medium]", 42)] })]);
    const html = `<!doctype html><table><tr><th>Model</th><th>Score</th></tr><tr><td>OpenAI GPT-5.6 Sol</td><td>99%</td></tr></table><script>self.__next_f.push(${payload})</script>`;
    const result = await new SweRebenchAdapter().ingest({ ...context, fetch: async () => new Response(html) });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ model: "GPT-5.6 Sol", score: 42 });
  });
});
