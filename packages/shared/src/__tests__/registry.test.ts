import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../registry.js";

const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));

describe("repository registries", () => {
  it("loads and cross-validates every registry", async () => {
    const registry = await loadRegistry(dataDir);
    expect(registry.models.length).toBeGreaterThanOrEqual(2);
    expect(registry.benchmarks).toHaveLength(29);
    expect(registry.benchmarks.every((benchmark) => benchmark.categories.length > 0)).toBe(true);
    expect(registry.sources.length).toBeGreaterThanOrEqual(12);
    expect(registry.indexConfig.method_version).toMatch(/^1\.[23]\.\d+$/);
    expect(registry.results.length).toBeGreaterThan(0);
    const sampleOnlyResults = registry.results.filter((result) => result.sample_only);
    expect(sampleOnlyResults.filter((result) =>
      result.source_id === "kaggle" && result.benchmark_id === "scicode-verified",
    )).toHaveLength(24);
    expect(sampleOnlyResults.filter((result) =>
      result.source_id === "kaggle" && result.benchmark_id === "simpleqa-verified" && result.config.metric === "F1",
    )).toHaveLength(25);
    const reviewOnlyPairs = new Set([
      "arcprize\0arc-agi-2-semi-private",
      "kaggle\0livecodebench-v6-pro",
      "kaggle\0scicode-verified",
      "kaggle\0simpleqa-verified",
      "matharena\0matharena-composite",
      "mcpmark\0mcpmark",
      "metr\0metr-time-horizon-1.1",
      "openai-evals\0gdpval",
      "osworld\0osworld-2.0",
      "scale\0hle-no-tools",
      "swe-rebench\0swe-rebench",
      "taubench\0tau3-bench-banking",
      "vendor-model-cards\0arc-agi-2-semi-private",
      "vendor-model-cards\0automationbench-public",
      "vendor-model-cards\0deepswe",
      "vendor-model-cards\0gdpval",
      "vendor-model-cards\0hle-no-tools",
      "vendor-model-cards\0livecodebench-v6-pro",
      "vendor-model-cards\0mcpmark",
      "vendor-model-cards\0osworld-2.0",
      "vendor-model-cards\0scicode-verified",
      "vendor-model-cards\0simpleqa-verified",
      "vendor-model-cards\0swe-bench-pro-public",
    ]);
    expect(sampleOnlyResults.every((result) => reviewOnlyPairs.has(`${result.source_id}\0${result.benchmark_id}`))).toBe(true);
    expect(registry.results.every((result) => result.url.startsWith("https://"))).toBe(true);
    expect(registry.manualSpeed.redistributable).toBe(false);
    expect(Array.isArray(registry.manualSpeed.observations)).toBe(true);

    const sourcesByBenchmark = new Map(registry.benchmarks.map((benchmark) => [benchmark.id, new Set(benchmark.source_ids)]));
    expect(registry.results.every((result) => sourcesByBenchmark.get(result.benchmark_id)?.has(result.source_id))).toBe(true);

    const vending = registry.benchmarks.find((benchmark) => benchmark.id === "vending-bench-2");
    expect(vending?.transform).toMatchObject({ type: "log_relative", reference_value: 63_000 });
    // Method 1.2.3 admission contract: likelihood-critical fields are mandatory for
    // active benchmarks; provenance pins are carried as metadata_incomplete.
    expect(registry.benchmarks.filter((benchmark) => benchmark.status === "active").every((benchmark) =>
      benchmark.family_id
      && benchmark.obs_type
      && (benchmark.domains || benchmark.categories.length > 0)
      && (benchmark.obs_type !== "count" || benchmark.default_k),
    )).toBe(true);
    expect(registry.benchmarks.filter((benchmark) => benchmark.status === "active").length).toBeGreaterThanOrEqual(20);
  });

  it("keeps non-count benchmark additions out of the count likelihood", async () => {
    const registry = await loadRegistry(dataDir);
    for (const id of ["arc-agi-3", "benchcad", "healthbench-professional"]) {
      expect(registry.benchmarks.find(b=>b.id===id)).toMatchObject({status:"watchlist",obs_type:"judge"});
    }
    expect(registry.benchmarks.find(b=>b.id==="automationbench-public")).toMatchObject({status:"active",obs_type:"count",n_items:600});
  });

  it("quarantines publisher observations for incompatible benchmark revisions", async () => {
    const registry = await loadRegistry(dataDir);
    const reviewed = registry.results.filter((result) =>
      result.notes?.startsWith("REVIEW ONLY:"),
    );
    expect(reviewed.length).toBeGreaterThan(0);
    expect(reviewed.every((result) => result.sample_only)).toBe(true);
    const olderAutomation = registry.results.filter((result) =>
      result.benchmark_id === "automationbench-public"
      && result.benchmark_version === "1.0.6",
    );
    expect(olderAutomation.length).toBeGreaterThan(0);
    expect(olderAutomation.every((result) => result.sample_only)).toBe(true);
  });

  it("covers the active and watch-list suite", async () => {
    const registry = await loadRegistry(dataDir);
    const ids = new Set(registry.benchmarks.map(({ id }) => id));
    for (const id of [
      "terminal-bench-4.0", "swe-rebench", "swe-bench-pro-public", "deepswe", "osworld-2.0",
      "tau3-bench-banking", "gdpval", "metr-time-horizon-1.1", "vending-bench-2", "mcpmark",
      "arc-agi-3", "arc-agi-2-semi-private", "hle-no-tools", "frontiermath-v2-tiers-1-3",
      "frontiermath-v2-tier-4", "matharena-composite", "simpleqa-verified", "mrcr-v2-1m-8-needle",
      "aa-lcr", "lmarena-text-style-controlled", "livebench-2026", "scicode-verified", "critpt",
      "livecodebench-v6-pro",
    ]) expect(ids.has(id), id).toBe(true);
  });

  it("resolves external spellings only through declared aliases", async () => {
    const registry = await loadRegistry(dataDir);
    expect(registry.modelAliases.resolveId("OPENAI/GPT-5")).toBe("gpt-5-2025-08-07");
    expect(registry.modelAliases.resolveId("GPT-5.6-Sol")).toBe("gpt-5.6-sol");
    expect(registry.modelAliases.resolveId("Opus 5")).toBe("claude-opus-5");
    expect(registry.benchmarkAliases.resolveId("τ³-bench Banking")).toBe("tau3-bench-banking");
    expect(registry.benchmarkAliases.resolveId("Terminal Bench")).toBeUndefined();
    expect(registry.benchmarkAliases.resolveId("Terminal-Bench 4.0")).toBe("terminal-bench-4.0");
    expect(registry.benchmarkAliases.resolveId("FrontierMath-Tiers-1-3-v2-Private")).toBe("frontiermath-v2-tiers-1-3");
    expect(registry.benchmarkAliases.resolveId("FrontierMath-Tier-4-v2-Private")).toBe("frontiermath-v2-tier-4");
    expect(registry.benchmarkAliases.resolveId("METR Time Horizons")).toBe("metr-time-horizon-1.1");
    expect(registry.modelAliases.resolveId("an undeclared model")).toBeUndefined();
  });

  it("uses a frozen max-common calibration panel instead of score anchors", async () => {
    const registry = await loadRegistry(dataDir);
    expect(registry.indexConfig.calibration_panel.length).toBeGreaterThanOrEqual(12);
    const modelsById = new Map(registry.models.map((model) => [model.id, model]));
    const panelModels = registry.indexConfig.calibration_panel.map((systemId) => modelsById.get(systemId.slice(0, systemId.lastIndexOf("@"))));
    expect(panelModels.every((model) => model !== undefined)).toBe(true);
    expect(registry.indexConfig.calibration_panel.every((systemId) => systemId.endsWith("@max-common"))).toBe(true);
    expect(registry.benchmarks.filter((benchmark) => benchmark.is_reference).map((benchmark) => benchmark.id)).toEqual([
      "arc-agi-2-semi-private",
    ]);
    expect(registry.sources.flatMap((source) => source.protocols ?? []).some((protocol) =>
      protocol.benchmark_ids.includes("arc-agi-2-semi-private")
      && protocol.benchmark_versions["arc-agi-2-semi-private"] === "semi-private-120",
    )).toBe(true);
  });

  it("declares narrow benchmark redistribution permissions for every public source", async () => {
    const registry = await loadRegistry(dataDir);
    const policies = Object.fromEntries(registry.sources
      .filter((source) => source.redistributable)
      .map((source) => [source.id, source.redistributable_benchmark_ids]));

    expect(policies).toEqual({
      epoch: ["frontiermath-v2-tier-4", "frontiermath-v2-tiers-1-3"],
      lmarena: ["lmarena-text-style-controlled"],
      "swe-rebench": ["swe-rebench"],
    });
  });
});
