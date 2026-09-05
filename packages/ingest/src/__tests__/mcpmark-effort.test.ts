import { describe, expect, it } from "vitest";
import { McpMarkAdapter } from "../adapters/mcpmark.js";
import { createAdapterContext } from "../types.js";

async function ingest(rows: Record<string, unknown>[]) {
  const payload = `1:${JSON.stringify({ data: rows })}\n`;
  const body = `<script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`;
  const result = await new McpMarkAdapter().ingest(createAdapterContext({
    dataDir: "data",
    now: () => new Date("2026-09-05T00:00:00Z"),
    env: {},
    fetch: async () => new Response(body, { status: 200 }),
  }));
  return { ...result, records: result.records.filter((record) => record.record_type === "benchmark_result") };
}

const sourceRow = (actualModelName: string, name: string, avg: number) => ({
  actualModelName, name, key: name, passAtOne: { avg, std: 0.02 },
});

describe("MCPMark source-reported effort", () => {
  it("retains different effort submissions for the same dated model without selecting the highest score", async () => {
    const { records } = await ingest([
      sourceRow("gpt-5-2025-08-07", "gpt-5-medium", 0.52),
      sourceRow("gpt-5-2025-08-07", "gpt-5-high", 0.51),
      sourceRow("gpt-5.2-2025-12-11", "gpt-5-2-high", 0.5748),
    ]);
    expect(records).toHaveLength(3);
    expect(records).toEqual(expect.arrayContaining([
      { model: "gpt-5-2025-08-07", score: 0.52, effort_tier: "medium", config: { submission: "gpt-5-medium", reasoning_effort: "medium" } },
      { model: "gpt-5-2025-08-07", score: 0.51, effort_tier: "high", config: { submission: "gpt-5-high", reasoning_effort: "high" } },
      { model: "gpt-5.2-2025-12-11", effort_tier: "high" },
    ].map((record) => expect.objectContaining({ ...record, ...(record.config ? { config: expect.objectContaining(record.config) } : {}) }))));
  });

  it("uses explicit Gemini tiers, retains older reasoning profiles, and leaves unlabeled defaults unknown", async () => {
    const { records } = await ingest([
      sourceRow("gemini-3-pro", "gemini-3-pro-high", 0.5394),
      sourceRow("gemini-3-pro", "gemini-3-pro-low", 0.48),
      sourceRow("deepseek-v3.2-reasoner", "deepseek-v3-2-thinking", 0.40),
      sourceRow("grok-4-0709", "grok-4", 0.32),
    ]);
    expect(records).toEqual(expect.arrayContaining([
      { model: "gemini-3-pro", effort_tier: "high" },
      { model: "gemini-3-pro", effort_tier: "low" },
      { model: "deepseek-v3.2", effort_tier: "thinking", config: { evaluation_profile: "reasoner" } },
      { model: "grok-4-0709", config: { evaluation_profile: null } },
    ].map((record) => expect.objectContaining({ ...record, ...(record.config ? { config: expect.objectContaining(record.config) } : {}) }))));
    const unknown = records.find((record) => record.model === "grok-4-0709");
    expect(unknown).not.toHaveProperty("effort_tier");
    expect(unknown?.config).not.toHaveProperty("reasoning_effort");
  });
});
