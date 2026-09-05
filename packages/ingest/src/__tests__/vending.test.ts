import { describe, expect, it } from "vitest";
import { VendingBenchAdapter, extractVendingRuns } from "../adapters/vending.js";
import { createAdapterContext } from "../types.js";

const site = "https://example.test/evals/vending-bench-2";
const run = (score: number, count = 5) => ({ final_value: score, final_value_sem: 12.5, num_final_values: count, num_epochs: 6 });
function sourceContext(runs: Record<string, unknown>) {
  const pages = new Map([
    [site, `<table><tr><td>Only ten rows initially visible</td></tr></table><script>import("../_app/immutable/entry/app.hash.js");const x={node_ids:[0,3,26]};</script>`],
    ["https://example.test/_app/immutable/entry/app.hash.js", `const deps=["../nodes/26.page.js"];`],
    ["https://example.test/_app/immutable/nodes/26.page.js", `import {m as native} from "../chunks/data.js"; const displayed=native.runs.vb2;`],
    ["https://example.test/_app/immutable/chunks/data.js", `const raw={vb2:${JSON.stringify(runs)},arena:{other:untrustedFunction()}}; const x={runs:raw};export{x as m};`],
  ]);
  return createAdapterContext({ dataDir: "data", env: {}, now: () => new Date("2026-09-05T00:00:00Z"), fetch: async (input) => {
    const body = pages.get(String(input));
    if (body === undefined) throw new Error(`Unexpected request ${String(input)}`);
    return new Response(body);
  } });
}

describe("Vending-Bench native data", () => {
  it("recovers all configurations beyond the ten-row HTML preview and excludes Arena", async () => {
    const runs = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`Model ${index}`, run(index * 100)]));
    const out = await new VendingBenchAdapter(site).ingest(sourceContext(runs));
    expect(out.records).toHaveLength(12);
    expect(new Set(out.records.map((record) => record.model)).size).toBe(12);
    expect(out.records.find((record) => record.model === "Model 11")).toMatchObject({ score: 1100, score_unit: "currency", se: 12.5, n_runs: 5, k_trials: 5 });
  });

  it("preserves negative balances, actual run counts, provider variants, and explicitly labeled effort", async () => {
    const out = await new VendingBenchAdapter(site).ingest(sourceContext({
      "Claude Fable 5 - High": run(-10, 4),
      "Claude Fable 5 - Max": run(200, 6),
      "Kimi K3 (Fireworks)": run(500),
      "Kimi K3 (Moonshot)": run(450),
    }));
    expect(out.records).toHaveLength(4);
    const high = out.records.find((record) => record.record_type === "benchmark_result" && record.effort_tier === "high");
    expect(high).toMatchObject({ model: "Claude Fable 5", score: -10, n_runs: 4, metadata: { reported_num_epochs: 6, reported_num_final_values: 4 } });
    const kimi = out.records.filter((record) => record.model === "Kimi K3");
    expect(kimi).toHaveLength(2);
    expect(kimi.map((record) => record.record_type === "benchmark_result" ? record.config.provider : null).sort()).toEqual(["Fireworks", "Moonshot"]);
    for (const record of kimi) expect(record).not.toHaveProperty("effort_tier");
  });

  it("does not execute source expressions and rejects executable values inside the run table", () => {
    expect(() => extractVendingRuns("const x={vb2:{m:globalThis.untrusted()}};")).toThrow("not a static literal");
    expect(() => extractVendingRuns("const x={vb2:{...source}};")).toThrow("non-literal property");
    expect(extractVendingRuns("const x={vb2:{m:{final_value:-10}},arena:globalThis.untrusted()};")).toEqual({ m: { final_value: -10 } });
  });
});
