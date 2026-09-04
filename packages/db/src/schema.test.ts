import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  benchmarkParams,
  benchmarks,
  cells,
  indexRuns,
  indexScores,
  models,
  pricing,
  results,
  sources,
  speed
} from "./schema.js";

describe("database schema", () => {
  it("contains every public pipeline relation", () => {
    expect([
      models,
      benchmarks,
      sources,
      results,
      pricing,
      speed,
      indexRuns,
      indexScores,
      benchmarkParams,
      cells
    ].map(getTableName)).toEqual([
      "models",
      "benchmarks",
      "sources",
      "results",
      "pricing",
      "speed",
      "index_runs",
      "index_scores",
      "benchmark_params",
      "cells"
    ]);
  });

  it("preserves raw score semantics and provenance metadata", () => {
    expect(results.scoreUnit.name).toBe("score_unit");
    expect(results.provenance.name).toBe("provenance");
    expect(results.metadata.name).toBe("metadata");
    expect(results.observationKey.name).toBe("observation_key");
    expect(results.lineageId.name).toBe("lineage_id");
    expect(results.originProvenance.name).toBe("origin_provenance");
    expect(results.protocolId.name).toBe("protocol_id");
    expect(results.versionInferred.name).toBe("version_inferred");
    expect(results.metadataIncomplete.name).toBe("metadata_incomplete");
    expect(results.perTaskCounts.name).toBe("per_task_counts");
  });

  it("persists benchmark categories used by the coverage gate", () => {
    expect(benchmarks.categories.name).toBe("categories");
    expect(benchmarks.categories.notNull).toBe(true);
    expect(benchmarks.domains.name).toBe("domains");
    expect(benchmarks.familyId.name).toBe("family_id");
    expect(benchmarks.ceiling.name).toBe("ceiling");
  });

  it("carries redistribution policy through source-backed raw rows", () => {
    expect(sources.redistributable.name).toBe("redistributable");
    expect(sources.redistributable.notNull).toBe(true);
    expect(sources.redistributableBenchmarkIds.name).toBe("redistributable_benchmark_ids");
    expect(sources.redistributableBenchmarkIds.notNull).toBe(true);
    expect(sources.attribution.name).toBe("attribution");
    expect(sources.protocols.name).toBe("protocols");
    expect(pricing.sourceId.name).toBe("source_id");
    expect(pricing.sourceId.notNull).toBe(true);
  });
});
