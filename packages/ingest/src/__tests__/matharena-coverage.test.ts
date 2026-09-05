import { describe, expect, it } from "vitest";
import { MathArenaAdapter, MATHARENA_URL } from "../adapters/matharena.js";
import { createAdapterContext } from "../types.js";

describe("MathArena rolling composite feed", () => {
  it("fetches the complete models catalog and does not invent a count of independent composite runs", async () => {
    let fetched = "";
    const context = createAdapterContext({ dataDir: "/tmp", now: () => new Date("2026-09-05T00:00:00Z"),
      fetch: (async (url: string) => { fetched = url; return new Response(`<!doctype html><table>
      <tr><th>Model Name</th><th>Expected Performance</th><th>Expected Cost</th><th>Date</th></tr>
      <tr><td>GPT-5.6-Sol (max)</td><td>64.3% ±3.1%</td><td>Invalid ⚠</td><td>2026-07-09</td></tr>
      <tr><td>GPT-5.5 (xhigh)</td><td>61.0% ±2.5%</td><td>$1.91 ±$0.12</td><td>2026-04-24</td></tr>
      <tr><td>Grok 4.1 Fast (Reasoning)</td><td>13.4% ±2.6%</td><td>$0.040</td><td>2025-11-20</td></tr>
      </table>`); }) as typeof fetch });
    const output = await new MathArenaAdapter().ingest(context);
    expect(fetched).toBe("https://matharena.ai/models");
    expect(MATHARENA_URL).toBe(fetched);
    expect(output.records).toHaveLength(3);
    expect(output.records[0]).toMatchObject({ score: 64.3, se: 3.1 / 1.96, effort_tier: "max",
      metadata: { model_release_date: "2026-07-09" } });
    expect(output.records[2]).toMatchObject({ model: "Grok 4.1 Fast", effort_tier: "Reasoning" });
    expect(output.records[0]).not.toHaveProperty("n_runs");
    expect(output.records[0]).not.toHaveProperty("cost_per_task");
  });
});
