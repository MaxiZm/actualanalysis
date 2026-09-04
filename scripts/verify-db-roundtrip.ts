#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  benchmarks,
  cells,
  createDatabase,
  exportSnapshot,
  importPublicSnapshot,
  indexRuns,
  indexScores,
  models,
  persistIngestRecords,
  persistRun,
  pricing,
  PublicSnapshotSchema,
  results,
  seedRegistry,
  sources,
  speed,
  type RunArtifact,
} from "@actualanalysis/db";
import { loadRegistry } from "@actualanalysis/shared";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;

function databaseName(url: string): string {
  return new URL(url).pathname.slice(1);
}

function verificationDatabases(): { sourceUrl: string; targetUrl: string } {
  if (!sourceUrl || !targetUrl) {
    throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required");
  }
  if (process.env.ALLOW_NON_TEST_DATABASES !== "1") {
    for (const url of [sourceUrl, targetUrl]) {
      if (!/verify_(source|target)$/u.test(databaseName(url))) {
        throw new Error("Refusing non-verification database; expected names ending verify_source/verify_target");
      }
    }
  }
  return { sourceUrl, targetUrl };
}

function verificationArtifact(
  kind: "mixed" | "agentic" | "chat",
  modelIds: string[],
  referenceBenchmark: string,
  createdAt: string,
): RunArtifact {
  return {
    kind,
    method_version: "0.0.0-synthetic-db-verification",
    created_at: createdAt,
    params: { synthetic_verification: true, do_not_publish: true },
    scores: modelIds.map((modelId, index) => ({
      model_id: modelId,
      score: 90 + index * 5,
      ci_low: 88 + index * 5,
      ci_high: 92 + index * 5,
      rank: modelIds.length - index,
      rank_low: Math.max(1, modelIds.length - index - 1),
      rank_high: Math.min(modelIds.length, modelIds.length - index + 1),
      coverage: 1,
      n_private: 2,
      robust_score: 89.5 + index * 5,
      flags: [],
      provisional: false,
      pairwise: {},
    })),
    benchmark_params: [{
      benchmark_id: referenceBenchmark,
      difficulty: 0,
      slope: 1,
      weight: 0.5,
      weight_factors: { discrimination: 1, saturation: 1, sources: 1, privacy: 0.5 },
      residual_var: 0.04,
    }],
    cells: modelIds.map((modelId, index) => ({
      model_id: modelId,
      benchmark_id: referenceBenchmark,
      y: index / 4,
      y_hat: index / 4 + 0.01,
      z: -0.1,
      used: true,
    })),
  };
}

function csvRows(text: string): number {
  const lines = text.trim().split("\n");
  return text.trim() === "" ? 0 : Math.max(0, lines.length - 1);
}

function isSyntheticVerification(value: unknown): boolean {
  return (
    typeof value === "object"
    && value !== null
    && "synthetic_verification" in value
    && value.synthetic_verification === true
  );
}

async function main(): Promise<void> {
  const urls = verificationDatabases();
  const registry = await loadRegistry(path.join(root, "data"), { includeManualResults: true });
  const source = createDatabase(urls.sourceUrl);
  const target = createDatabase(urls.targetUrl);
  const createdAt = new Date().toISOString();
  const snapshotRoot = path.join(root, "work", "db-roundtrip");
  const stamp = createdAt.slice(0, 10);

  try {
    await seedRegistry(source.db, registry);
    const modelIds = registry.models.map((model) => model.id);
    await persistIngestRecords(source.db, [
      {
        record_type: "benchmark_result",
        model: "GPT-5",
        model_id: "gpt-5-2025-08-07",
        benchmark: "FrontierMath v2 Tier 4",
        benchmark_id: "frontiermath-v2-tier-4",
        source_id: "vendor-model-cards",
        score: 41,
        score_unit: "percent",
        config: {},
        observed_on: "2026-09-03",
        source_url: "https://example.com/synthetic-verification/self-report",
        provenance: "self_report",
        metadata: { synthetic_verification: true },
      },
      {
        record_type: "benchmark_result",
        model: "GPT-5",
        model_id: "gpt-5-2025-08-07",
        benchmark: "FrontierMath v2 Tier 4",
        benchmark_id: "frontiermath-v2-tier-4",
        source_id: "epoch",
        score: 40,
        score_unit: "percent",
        config: {},
        observed_on: "2026-09-03",
        source_url: "https://example.com/synthetic-verification/independent",
        provenance: "independent",
        metadata: { synthetic_verification: true },
      },
      {
        record_type: "pricing",
        model: "openai/gpt-5",
        model_id: "gpt-5-2025-08-07",
        source_id: "openrouter",
        provider: "synthetic-private",
        input_per_million: 1,
        output_per_million: 4,
        fetched_at: createdAt,
        source_url: "https://example.com/synthetic-verification/pricing",
        metadata: { synthetic_verification: true },
      },
      {
        record_type: "pricing",
        model: "openai/gpt-5",
        model_id: "gpt-5-2025-08-07",
        source_id: "epoch",
        provider: "synthetic-public",
        input_per_million: 1.25,
        output_per_million: 5,
        fetched_at: createdAt,
        source_url: "https://example.com/synthetic-verification/public-pricing",
        metadata: { synthetic_verification: true },
      },
    ]);
    await persistRun(source.db, verificationArtifact("mixed", modelIds, "hle-no-tools", createdAt));
    await persistRun(source.db, verificationArtifact("agentic", modelIds, "terminal-bench-4.0", createdAt));
    await persistRun(source.db, verificationArtifact("chat", modelIds, "hle-no-tools", createdAt));
    const exported = await exportSnapshot(source.db, snapshotRoot, stamp);
    const snapshotFile = path.join(exported.output, "snapshot.json");
    const parsed: unknown = JSON.parse(await readFile(snapshotFile, "utf8"));
    const snapshot = PublicSnapshotSchema.parse(parsed);
    if ("speed" in snapshot) throw new Error("Public snapshot unexpectedly contains speed data");
    if (snapshot.sources.some((row) => !row.redistributable)) {
      throw new Error("Public snapshot contains a source that forbids redistribution");
    }
    const publicSources = new Map(snapshot.sources.map((row) => [
      row.id,
      new Set(row.redistributableBenchmarkIds),
    ]));
    if (
      snapshot.results.some((row) => !publicSources.get(row.sourceId)?.has(row.benchmarkId))
      || snapshot.pricing.some((row) => !publicSources.has(row.sourceId))
    ) {
      throw new Error("Public snapshot contains a raw row outside its source redistribution policy");
    }
    const imported = await importPublicSnapshot(target.db, snapshot);

    const [targetModels, targetBenchmarks, targetSources, targetPricing, targetResults, targetRuns, targetScores, targetCells, targetSpeed] = await Promise.all([
      target.db.select().from(models),
      target.db.select().from(benchmarks),
      target.db.select().from(sources),
      target.db.select().from(pricing),
      target.db.select().from(results),
      target.db.select().from(indexRuns),
      target.db.select().from(indexScores),
      target.db.select().from(cells),
      target.db.select().from(speed),
    ]);
    const targetCounts = {
      models: targetModels.length,
      benchmarks: targetBenchmarks.length,
      sources: targetSources.length,
      pricing: targetPricing.length,
      results: targetResults.length,
      runs: targetRuns.length,
      scores: targetScores.length,
      cells: targetCells.length,
      speed: targetSpeed.length,
    };
    const supersededResults = targetResults.filter((row) => row.supersededBy !== null).length;
    const syntheticResults = targetResults.filter((row) => isSyntheticVerification(row.metadata));
    if (
      targetCounts.models !== snapshot.models.length ||
      targetCounts.benchmarks !== snapshot.benchmarks.length ||
      targetCounts.sources !== snapshot.sources.length ||
      targetCounts.pricing !== snapshot.pricing.length ||
      targetCounts.results !== snapshot.results.length ||
      targetCounts.runs !== snapshot.runs.length ||
      targetCounts.scores !== snapshot.scores.length ||
      targetCounts.cells !== snapshot.cells.length ||
      supersededResults !== 0 ||
      targetCounts.speed !== 0 ||
      syntheticResults.length !== 1 ||
      syntheticResults[0]?.sourceId !== "epoch" ||
      targetPricing.length !== 1 ||
      targetPricing[0]?.sourceId !== "epoch"
    ) {
      throw new Error(`Round-trip counts are invalid: ${JSON.stringify(targetCounts)}`);
    }
    const csvCounts = Object.fromEntries(await Promise.all([
      "models", "benchmarks", "sources", "pricing", "results", "index-scores", "benchmark-params", "cells",
    ].map(async (name) => [name, csvRows(await readFile(path.join(exported.output, `${name}.csv`), "utf8"))])));

    process.stdout.write(`${JSON.stringify({ exported, imported, targetCounts, supersededResults, csvCounts, snapshotFile }, null, 2)}\n`);
  } finally {
    await Promise.all([source.close(), target.close()]);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
