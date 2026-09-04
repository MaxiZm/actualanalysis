import { describe, expect, it } from "vitest";

import {
  OPENROUTER_MODELS_API_URL,
  blendedOpenRouterPrice,
  cacheAwareOpenRouterPrice,
  matchOpenRouterCatalog,
  parseOpenRouterCatalog,
  resolveDisplayLimits,
  type OpenRouterCatalogRow,
} from "./openrouter-display";

function apiRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "openai/example",
    name: "A name that is never used for matching",
    pricing: {
      prompt: "0.0000025",
      completion: "0.000010",
      input_cache_read: "0.00000025",
    },
    context_length: 128_000,
    top_provider: { max_completion_tokens: 16_384 },
    ...overrides,
  };
}

function catalogRows(raw: unknown): OpenRouterCatalogRow[] {
  const parsed = parseOpenRouterCatalog(raw);
  if (!parsed.ok) throw new Error(`unexpected parser failure: ${parsed.error}`);
  return parsed.rows;
}

describe("OpenRouter display-only catalog parser", () => {
  it("converts per-token numeric strings to finite nonnegative USD per million", () => {
    const parsed = parseOpenRouterCatalog({ data: [apiRow()] });

    expect(parsed).toEqual({
      ok: true,
      rejectedRows: 0,
      rows: [{
        openRouterId: "openai/example",
        provider: "OpenRouter",
        inputPerMillion: 2.5,
        outputPerMillion: 10,
        cacheReadPerMillion: 0.25,
        contextWindow: 128_000,
        maxOutput: 16_384,
        sourceUrl: OPENROUTER_MODELS_API_URL,
        displayOnly: true,
        redistributable: false,
      }],
    });
  });

  it("keeps valid rows while counting malformed rows", () => {
    const parsed = parseOpenRouterCatalog({
      data: [
        apiRow(),
        apiRow({ id: "openai/negative", pricing: { prompt: "-0.1", completion: "0.2" } }),
        apiRow({ id: "openai/numeric", pricing: { prompt: 0.1, completion: "0.2" } }),
        apiRow({ id: "openai/bad-context", context_length: 12.5 }),
        apiRow({ id: "openai/overflow", pricing: { prompt: "1e308", completion: "0.2" } }),
      ],
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rejectedRows).toBe(4);
  });

  it("distinguishes invalid, empty, and entirely malformed envelopes", () => {
    expect(parseOpenRouterCatalog({ models: [] })).toEqual({
      ok: false,
      error: "invalid-envelope",
      rows: [],
      rejectedRows: 0,
    });
    expect(parseOpenRouterCatalog({ data: [] })).toEqual({
      ok: false,
      error: "empty-catalog",
      rows: [],
      rejectedRows: 0,
    });
    expect(parseOpenRouterCatalog({ data: [{ id: "bad" }] })).toEqual({
      ok: false,
      error: "no-valid-rows",
      rows: [],
      rejectedRows: 1,
    });
  });

  it("accepts absent optional cache and limit fields but validates present values", () => {
    const minimal = apiRow({
      pricing: { prompt: "0", completion: "1e-6" },
      context_length: null,
      top_provider: null,
    });
    const parsed = parseOpenRouterCatalog({ data: [minimal] });

    expect(parsed.ok).toBe(true);
    expect(parsed.rows[0]).toMatchObject({
      inputPerMillion: 0,
      outputPerMillion: 1,
      cacheReadPerMillion: null,
      contextWindow: null,
      maxOutput: null,
    });
  });

  it("does not mutate the response object", () => {
    const raw = { data: [apiRow()] };
    const before = structuredClone(raw);
    parseOpenRouterCatalog(raw);
    expect(raw).toEqual(before);
  });
});

describe("exact and normalized alias matching", () => {
  it("matches an explicitly declared alias case-insensitively", () => {
    const rows = catalogRows({ data: [apiRow()] });
    const result = matchOpenRouterCatalog(rows, [
      { modelId: "registry-model", aliases: ["OPENAI/EXAMPLE"] },
    ]);

    expect(result.matches["registry-model"]?.openRouterId).toBe("openai/example");
    expect(result.unmatchedModelIds).toEqual([]);
  });

  it("does not use names, slugs, substrings, whitespace normalization, or fuzzy matching", () => {
    const rows = catalogRows({ data: [apiRow()] });
    const targets = [
      { modelId: "by-name", aliases: [], name: "openai/example" },
      { modelId: "by-slug", aliases: [], slug: "openai/example" },
      { modelId: "substring", aliases: ["openai/exam"] },
      { modelId: "padded", aliases: [" openai/example "] },
    ];
    const result = matchOpenRouterCatalog(rows, targets);

    expect(result.matches).toEqual({});
    expect(result.unmatchedModelIds).toEqual(["by-name", "by-slug", "substring", "padded"]);
  });

  it("leaves aliases shared by multiple registry models unmatched", () => {
    const rows = catalogRows({ data: [apiRow()] });
    const result = matchOpenRouterCatalog(rows, [
      { modelId: "model-a", aliases: ["openai/example"] },
      { modelId: "model-b", aliases: ["OpenAI/Example"] },
    ]);

    expect(result.matches).toEqual({});
    expect(result.unmatchedModelIds).toEqual(["model-a", "model-b"]);
    expect(result.ambiguousAliases).toEqual(["example", "openai/example"]);
  });

  it("normalizes vendor prefixes, batch suffixes, separators, and dated releases", () => {
    const rows = catalogRows({ data: [apiRow({ id: "anthropic/claude-3.7-sonnet:batch" })] });
    const result = matchOpenRouterCatalog(rows, [{ modelId: "claude", aliases: ["claude-3-7-sonnet-20250219"] }]);
    expect(result.matches.claude?.openRouterId).toBe("anthropic/claude-3.7-sonnet:batch");
  });

  it("does not mutate catalog rows or alias targets", () => {
    const rows = catalogRows({ data: [apiRow()] });
    const targets = [{ modelId: "registry-model", aliases: ["OPENAI/EXAMPLE"] }];
    const rowsBefore = structuredClone(rows);
    const targetsBefore = structuredClone(targets);

    matchOpenRouterCatalog(rows, targets);

    expect(rows).toEqual(rowsBefore);
    expect(targets).toEqual(targetsBefore);
  });
});

describe("OpenRouter economics display helpers", () => {
  it("computes the published 3:1 and cache-aware blends", () => {
    const pricing = {
      inputPerMillion: 2,
      outputPerMillion: 10,
      cacheReadPerMillion: 0.5,
    };

    expect(blendedOpenRouterPrice(pricing)).toBe(4);
    expect(cacheAwareOpenRouterPrice(pricing)).toBe(1.75);
    expect(cacheAwareOpenRouterPrice({ ...pricing, cacheReadPerMillion: null })).toBe(2.8);
  });

  it("prefers explicit vendor limits, then OpenRouter, then the public snapshot", () => {
    const live = catalogRows({ data: [apiRow()] })[0]!;
    const resolved = resolveDisplayLimits({
      vendorOverride: { contextWindow: 256_000, sourceUrl: "https://vendor.example/model-card" },
      openRouter: live,
      snapshot: {
        contextWindow: 64_000,
        maxOutput: 8_192,
        sourceUrl: "https://actualanalysis.example/snapshot",
      },
    });

    expect(resolved).toMatchObject({
      contextWindow: 256_000,
      contextWindowSource: "vendor",
      contextWindowSourceUrl: "https://vendor.example/model-card",
      maxOutput: 16_384,
      maxOutputSource: "openrouter",
      maxOutputSourceUrl: OPENROUTER_MODELS_API_URL,
    });

    const fallback = resolveDisplayLimits({
      openRouter: { ...live, contextWindow: null, maxOutput: null },
      snapshot: { contextWindow: 64_000, maxOutput: 8_192 },
    });
    expect(fallback).toMatchObject({
      contextWindow: 64_000,
      contextWindowSource: "snapshot",
      maxOutput: 8_192,
      maxOutputSource: "snapshot",
    });
  });
});
