import { describe, expect, it } from "vitest";
import { LiveBenchAdapter } from "../adapters/livebench.js";
import { createAdapterContext } from "../types.js";

function context(table: string, categories: unknown) {
  return createAdapterContext({ dataDir: "data", env: {}, now: () => new Date("2026-09-05T00:00:00Z"),
    fetch: async (input) => new Response(String(input).includes("categories") ? JSON.stringify(categories) : table),
  });
}

describe("LiveBench native composite", () => {
  it("weights categories equally, preserves explicit effort, and remains observed-only", async () => {
    const out = await new LiveBenchAdapter().ingest(context("model,a,b,c,d\ngpt-6-astra-max,100,100,100,0\n", { Large: ["a", "b", "c"], Small: ["d"] }));
    expect(out.records).toHaveLength(1);
    expect(out.records[0]).toMatchObject({ model: "gpt-6-astra", effort_tier: "max", score: 50, config: { aci_fit_eligible: false }, metadata: { category_means: { Large: 100, Small: 0 }, source_model_id: "gpt-6-astra-max" } });
    for (const key of ["n_items", "x_correct", "k_trials", "se", "uncertainty_value"]) expect(out.records[0]).not.toHaveProperty(key);
  });

  it("does not turn missing scores into zeros or change category composition", async () => {
    const out = await new LiveBenchAdapter().ingest(context("model,a,b\ncomplete,0,100\nmissing,,100\ninvalid,Infinity,100\n", { One: ["a"], Two: ["b"] }));
    expect(out.records).toHaveLength(1);
    expect(out.records[0]).toMatchObject({ model: "complete", score: 50 });
    expect(out.warnings).toHaveLength(2);
  });

  it("keeps Max model names and dated DeepSeek releases intact rather than guessing a release or default tier", async () => {
    const out = await new LiveBenchAdapter().ingest(context("model,a\nqwen3.8-max,80\nox-alpha-max,70\ndeepseek-v4-pro,60\ndeepseek-v4-pro-0813,75\n", { One: ["a"] }));
    expect(out.records.map((r) => r.model).sort()).toEqual(["deepseek-v4-pro", "deepseek-v4-pro-0813", "ox-alpha-max", "qwen3.8-max"]);
    for (const row of out.records) expect(row).not.toHaveProperty("effort_tier");
  });

  it("rejects empty or duplicated task mappings instead of publishing an invalid aggregate", async () => {
    await expect(new LiveBenchAdapter().ingest(context("model,a\nm,50\n", {}))).rejects.toThrow("empty or invalid");
    await expect(new LiveBenchAdapter().ingest(context("model,a\nm,50\n", { One: ["a"], Two: ["a"] }))).rejects.toThrow("multiple categories");
  });
});
