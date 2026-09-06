import { fileURLToPath } from "node:url";
import { loadRegistry } from "@actualanalysis/shared";
import { describe, expect, it } from "vitest";
import { LmArenaAdapter, LMARENA_NATIVE_URL, LMARENA_SOURCE_URL, parseArenaNativeSnapshot } from "../adapters/lmarena.js";
import { arenaNamedEffort } from "../lib/reported-effort.js";
import { createAdapterContext } from "../types.js";

const entries = [
  { modelDisplayName: "claude-fable-5", modelKey: "claude-fable-5-text", rating: 1507.164171675996, ratingLower: 1502.1991266186806, ratingUpper: 1512.129216733311, votes: 27189 },
  { modelDisplayName: "gemini-3.8-flash-high", modelKey: "skimaki-kwc6", rating: 1493.847474085215, ratingLower: 1485.29040995021, ratingUpper: 1502.4045382202198, votes: 5125, releaseType: "pre_release" },
];
function page(changes: Record<string, unknown> = {}) {
  const value = { leaderboard: { arenaSlug: "text", leaderboardSlug: "overall", params: { category: "overall", styleControl: true },
    totalModels: entries.length, voteCutoffISOString: "2026-09-02T21:00:00.000Z", entries, ...changes } };
  // Real pages split a public JSON object across several React payload chunks.
  const text = `5:${JSON.stringify(value)}\n`, middle = Math.floor(text.length / 2);
  return [text.slice(0, middle), text.slice(middle)].map((chunk) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join("");
}
const hubRow = { model_name: "claude-fable-5", rating: 1507.4, rating_lower: 1502.4, rating_upper: 1512.4, variance: 6.45,
  vote_count: 26977, category: "overall", leaderboard_publish_date: "2026-09-01" };
function context(html: string, hubDate = "2026-09-01", failHub = false) {
  return createAdapterContext({ dataDir: "/tmp", env: {}, now: () => new Date("2026-09-05T00:00:00Z"), fetch: (async (url: string) => {
    if (url === LMARENA_NATIVE_URL) return new Response(html);
    if (failHub) return new Response("unavailable", { status: 404 });
    return new Response(JSON.stringify({ rows: [{ row: { ...hubRow, leaderboard_publish_date: hubDate } }], num_rows_total: 1 }));
  }) as typeof fetch });
}
describe("official Arena native snapshot fallback", () => {
  it("replaces the whole older export, retains unrounded CI and explicit High", async () => {
    const result = await new LmArenaAdapter().ingest(context(page()));
    expect(result.records).toHaveLength(2);
    const row = result.records.find((record) => record.model === "gemini-3.8-flash-high")!;
    expect(row).toMatchObject({ source_url: LMARENA_NATIVE_URL, score: entries[1]!.rating,
      evaluation_run_id: "text_style_control:2026-09-02", observed_on: "2026-09-02", n_items: 5125,
      uncertainty_type: "ci95", uncertainty_value: [entries[1]!.ratingLower, entries[1]!.ratingUpper],
      config: { arena_model: "gemini-3.8-flash-high" }, metadata: { arena_model_key: "skimaki-kwc6", arena_snapshot_model_count: 2 } });
    if (row.record_type !== "benchmark_result") throw new Error("Expected benchmark");
    expect(row.se).toBeCloseTo((1502.4045382202198 - 1485.29040995021) / 3.92, 12);
    const registry = await loadRegistry(fileURLToPath(new URL("../../../../data/", import.meta.url)), { includeManualResults: false });
    const model = registry.models.find((entry) => entry.id === "gemini-3.8-flash")!;
    expect(arenaNamedEffort(row, model)).toBe("high");
    expect(arenaNamedEffort({ ...row, model: "gemini-3.8-flash" }, model)).toBeUndefined();
    expect(arenaNamedEffort({ ...row, source_url: "https://example.test/leaderboard" }, model)).toBeUndefined();
  });
  it("retains the complete Hub cohort when it is newer", async () => {
    const result = await new LmArenaAdapter().ingest(context(page(), "2026-09-03"));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ score: 1507.4, source_url: LMARENA_SOURCE_URL });
  });
  it.each([
    { totalModels: 3 },
    { params: { category: "overall", styleControl: false } },
    { leaderboardSlug: "math" },
    { entries: [entries[0], entries[0]] },
    { entries: [{ ...entries[0], ratingLower: 2000 }, entries[1]] },
  ])("rejects incomplete or incomparable source data %#", (changes) => {
    expect(() => parseArenaNativeSnapshot(page(changes))).toThrow("no complete");
  });
  it("falls back safely when either endpoint is unavailable", async () => {
    const native = await new LmArenaAdapter().ingest(context(page(), "", true));
    expect(native.records).toHaveLength(2);
    const hub = await new LmArenaAdapter().ingest(context("<html>upstream changed</html>"));
    expect(hub.records).toHaveLength(1);
    expect(hub.warnings[0]?.message).toContain("retained complete Hugging Face");
  });
});
