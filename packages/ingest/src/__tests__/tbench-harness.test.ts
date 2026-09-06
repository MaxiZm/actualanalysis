import { fileURLToPath } from "node:url";
import { loadRegistry } from "@actualanalysis/shared";
import { describe, expect, it } from "vitest";
import { TbenchAdapter } from "../adapters/tbench.js";
import { annotateObservationMetadata } from "../observation-annotations.js";
import { resolveRecordAliases } from "../lib/records.js";
import { createAdapterContext } from "../types.js";

const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));

function row(model: string, agent: string, url?: string) {
  return {
    id: `${model}:${agent}:${url ?? "unreported-url"}`,
    updated_at: "2026-09-03T18:00:00Z",
    metadata: {
      model_display: { label: model },
      agent_display: { label: agent, ...(url ? { url } : {}) },
      reasoning_effort: "high",
    },
    metrics: { accuracy: 19.09, accuracy_ci95_half_width: 3.36, n_trials: 330 },
  };
}

async function ingest(rows: ReturnType<typeof row>[]) {
  const body = `<script>self.__next_f.push(${JSON.stringify([1, JSON.stringify({ rows })])})</script>`;
  const result = await new TbenchAdapter().ingest(createAdapterContext({
    dataDir, env: {}, now: () => new Date("2026-09-06T00:00:00Z"),
    fetch: async () => new Response(body),
  }));
  return result.records;
}

describe("Terminal-Bench scaffold identity", () => {
  it("preserves both Gemini submissions as the same verified common scaffold through source annotation", async () => {
    const registry = await loadRegistry(dataDir);
    const records = await ingest([
      row("Gemini 3.8 Flash", "mini-SWE-agent", "https://github.com/SWE-agent/mini-swe-agent"),
      row("Gemini 3.7 Flash", "mini-SWE-agent", "https://github.com/SWE-agent/mini-swe-agent"),
    ]);
    const annotated = annotateObservationMetadata(resolveRecordAliases(records, registry).records, registry);
    expect(annotated).toHaveLength(2);
    expect(annotated).toEqual(expect.arrayContaining(["gemini-3.8-flash", "gemini-3.7-flash"].map((model_id) =>
      expect.objectContaining({ model_id, harness: "mini-SWE-agent", harness_class: "common", effort_tier: "high", score: 19.09, se: 3.36 / 1.96 }))));
  });

  it("keeps the named vendor product agents native", async () => {
    const records = await ingest([
      row("GPT-6 Astra", "Codex"),
      row("Claude Fable 5.1", "Claude Code"),
      row("Grok 4.6", "Grok Build"),
    ]);
    expect(records).toHaveLength(3);
    for (const record of records) expect(record).toMatchObject({ harness_class: "native" });
  });

  it("leaves unrecognized or conflicting scaffold identities unknown", async () => {
    const registry = await loadRegistry(dataDir);
    const fixtures = [
      row("Gemini 3.8 Flash", "New Agent"),
      row("Gemini 3.8 Flash", "mini-SWE-agent", "https://example.test/modified-agent"),
      row("Gemini 3.8 Flash", "mini-SWE-agent"),
    ];
    // Validate each identity separately: adapter output deduplicates repeated
    // model/agent configurations independently of their display URLs.
    const records = (await Promise.all(fixtures.map((fixture) => ingest([fixture])))).flat();
    const annotated = records.flatMap((record) =>
      annotateObservationMetadata(resolveRecordAliases([record], registry).records, registry));
    expect(annotated).toHaveLength(3);
    for (const record of annotated) expect(record).toMatchObject({ harness_class: "unknown" });
    expect(registry.sources.find((source) => source.id === "tbench")?.protocols?.[0])
      .not.toHaveProperty("harness_class");
  });
});
