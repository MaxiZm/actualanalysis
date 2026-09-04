#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDatabase, type Database } from "./client.js";
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
} from "./schema.js";

const JsonObjectSchema = z.record(z.string(), z.unknown());
const PublicBenchmarkAllowlistSchema = z.array(z.string().min(1)).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Redistributable benchmark IDs must be unique." });
  }
});

export const PublicSnapshotSchema = z.object({
  generated_at: z.string().datetime(),
  license: z.string().min(1),
  data_policy: z.string().min(1).optional(),
  exclusions: z.array(z.string()).default([]),
  diagnostics: z.record(z.string(), JsonObjectSchema).default({}),
  models: z.array(z.object({
    id: z.string(), slug: z.string(), name: z.string(), org: z.string(), family: z.string(),
    releaseDate: z.string().nullable(), openWeights: z.boolean(), license: z.string().nullable(),
    reasoningConfig: JsonObjectSchema, reasoning: z.boolean().nullable().optional(), aliases: z.array(z.string()),
    weightsDate: z.string().nullable().optional(), trainingCutoff: z.string().nullable().optional(),
    defaultEffortTier: z.string().nullable().optional(), maxEffortTier: z.string().nullable().optional(),
    effortTierOrder: z.array(z.string()).optional(),
    metadataSources: z.array(z.string().url()).optional(),
    contextLength: z.number().int().nullable().optional(), maxOutput: z.number().int().nullable().optional(),
    sourceUrl: z.string().nullable().optional(), status: z.string().optional(),
    paramsTotalB: z.number().nullable().optional(), paramsActiveB: z.number().nullable().optional(),
    modality: z.string().optional(), sizeClass: z.string().optional(),
  })),
  benchmarks: z.array(z.object({
    id: z.string(), slug: z.string(), name: z.string(), version: z.string(), tags: z.array(z.string()),
    categories: z.array(z.string()).min(1),
    chanceLevel: z.number(), holdout: z.enum(["public", "semi_private", "private", "rolling"]),
    transform: JsonObjectSchema, nItems: z.number().int().nullable(), harnessUrl: z.string().nullable(), status: z.string(),
    graderVersion: z.string().nullable().optional(), familyId: z.string().nullable().optional(),
    domains: z.record(z.string(), z.number()).optional(), ceiling: z.number().optional(), obsType: z.string().nullable().optional(),
    publicReleaseDate: z.string().nullable().optional(), defaultK: z.number().int().nullable().optional(),
    defaultRho: z.number().nullable().optional(), toolPolicy: z.string().nullable().optional(),
    defaultVariance: z.number().nullable().optional(), isReference: z.boolean().optional(),
    metadataSources: z.array(z.string().url()).optional(),
  })),
  sources: z.array(z.object({
    id: z.string(), name: z.string(), url: z.string(), license: z.string().nullable(),
    attribution: z.string().min(1).nullable().default(null),
    kind: z.enum(["runner", "mirror", "self_report", "scrape", "manual"]),
    redistributable: z.boolean(),
    redistributableBenchmarkIds: PublicBenchmarkAllowlistSchema,
    protocols: z.array(JsonObjectSchema).optional(),
  })),
  pricing: z.array(z.object({
    modelId: z.string(), sourceId: z.string(), provider: z.string(), inputPerM: z.number(), outputPerM: z.number(),
    cacheReadPerM: z.number().nullable(), cacheWritePerM: z.number().nullable(),
    contextLength: z.number().int().nullable(), maxOutput: z.number().int().nullable(), fetchedAt: z.string().datetime(),
  })),
  results: z.array(z.object({
    id: z.string().uuid(), modelId: z.string(), benchmarkId: z.string(), sourceId: z.string(), score: z.number(),
    scoreUnit: z.string(), provenance: z.string(),
    se: z.number().nullable(), nItems: z.number().int().nullable(), kSamples: z.number().int().nullable(),
    benchmarkVersion: z.string().nullable().optional(), graderVersion: z.string().nullable().optional(),
    evaluationRunId: z.string().nullable().optional(), lineageId: z.string().nullable().optional(),
    originProvenance: z.string().nullable().optional(), hostSource: z.string().nullable().optional(),
    protocolId: z.string().nullable().optional(), versionInferred: z.boolean().optional(), metadataIncomplete: z.boolean().optional(),
    xCorrect: z.number().int().nullable().optional(), kTrials: z.number().int().nullable().optional(),
    perTaskCounts: z.array(z.number().int()).nullable().optional(), uncertaintyType: z.string().nullable().optional(),
    uncertaintyValue: z.union([z.number(), z.tuple([z.number(), z.number()])]).nullable().optional(),
    uncertaintyUnit: z.string().nullable().optional(), nRuns: z.number().int().nullable().optional(),
    runValues: z.array(z.number()).nullable().optional(), costPerTask: z.number().nullable().optional(),
    latencyS: z.number().nullable().optional(),
    config: JsonObjectSchema, configHash: z.string(), observationKey: z.string().optional(),
    harness: z.string().nullable(), harnessClass: z.string().nullable().optional(), effortTier: z.string().nullable().optional(),
    toolPolicy: z.string().nullable().optional(), observedOn: z.string(),
    url: z.string(), metadata: JsonObjectSchema, supersededBy: z.string().uuid().nullable(), createdAt: z.string().datetime(),
  })),
  runs: z.array(z.object({
    id: z.string().uuid(), kind: z.enum(["mixed", "agentic", "chat"]), methodVersion: z.string(),
    params: JsonObjectSchema, createdAt: z.string().datetime(),
  })),
  scores: z.array(z.object({
    runId: z.string().uuid(), modelId: z.string(), score: z.number().nullable(), ciLow: z.number().nullable(),
    ciHigh: z.number().nullable(), rank: z.number().int().nullable(), rankLow: z.number().int().nullable(),
    rankHigh: z.number().int().nullable(), coverage: z.number(), nPrivate: z.number().int(), robustScore: z.number(),
    flags: z.array(z.unknown()), provisional: z.boolean(), pairwise: z.record(z.string(), z.number()),
    systemId: z.string().optional(), profile: z.string().nullable().optional(), tier: z.string().nullable().optional(),
    rankCdf: z.array(z.number()).optional(), topK: z.record(z.string(), z.number()).optional(),
    evidence: z.record(z.string(), z.number().nullable()).optional(),
  })),
  benchmark_params: z.array(z.object({
    runId: z.string().uuid(), benchmarkId: z.string(), difficulty: z.number(), slope: z.number(), weight: z.number(),
    weightFactors: z.record(z.string(), z.number()), residualVar: z.number(),
  })),
  cells: z.array(z.object({
    runId: z.string().uuid(), modelId: z.string(), benchmarkId: z.string(), y: z.number(), yHat: z.number(),
    systemId: z.string().optional(), profile: z.string().nullable().optional(), z: z.number(), used: z.boolean(),
  })),
}).strict().superRefine((snapshot, context) => {
  const publicSources = new Map(snapshot.sources.map((source) => [source.id, source]));
  const publicBenchmarkIds = new Set(snapshot.benchmarks.map((benchmark) => benchmark.id));
  snapshot.sources.forEach((source, sourceIndex) => {
    source.redistributableBenchmarkIds.forEach((benchmarkId, benchmarkIndex) => {
      if (!publicBenchmarkIds.has(benchmarkId)) {
        context.addIssue({
          code: "custom",
          path: ["sources", sourceIndex, "redistributableBenchmarkIds", benchmarkIndex],
          message: `Redistributable benchmark ${benchmarkId} is absent from this snapshot.`,
        });
      }
    });
  });
  snapshot.results.forEach((row, index) => {
    const source = publicSources.get(row.sourceId);
    if (!source) {
      context.addIssue({
        code: "custom",
        path: ["results", index, "sourceId"],
        message: `Source ${row.sourceId} is not included as a redistributable public source.`,
      });
    }
  });
  snapshot.pricing.forEach((row, index) => {
    if (!publicSources.has(row.sourceId)) {
      context.addIssue({
        code: "custom",
        path: ["pricing", index, "sourceId"],
        message: `Source ${row.sourceId} is not included in this snapshot.`,
      });
    }
  });
});

export type PublicSnapshot = z.infer<typeof PublicSnapshotSchema>;

/** Imports a public snapshot in dependency order. Speed is absent by contract. */
export async function importPublicSnapshot(db: Database, input: unknown): Promise<Record<string, number>> {
  const snapshot = PublicSnapshotSchema.parse(input);
  await db.transaction(async (tx) => {
    if (snapshot.models.length) await tx.insert(models).values(snapshot.models).onConflictDoNothing();
    if (snapshot.benchmarks.length) await tx.insert(benchmarks).values(snapshot.benchmarks).onConflictDoNothing();
    if (snapshot.sources.length) await tx.insert(sources).values(snapshot.sources).onConflictDoNothing();
    if (snapshot.pricing.length) {
      await tx.insert(pricing).values(snapshot.pricing.map((row) => ({ ...row, fetchedAt: new Date(row.fetchedAt) }))).onConflictDoNothing();
    }
    if (snapshot.results.length) {
      await tx.insert(results).values(snapshot.results.map((row) => ({
        ...row,
        observationKey: row.observationKey ?? row.id,
        createdAt: new Date(row.createdAt),
      }))).onConflictDoNothing();
    }
    if (snapshot.runs.length) {
      await tx.insert(indexRuns).values(snapshot.runs.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }))).onConflictDoNothing();
    }
    if (snapshot.scores.length) await tx.insert(indexScores).values(snapshot.scores.map((row) => ({
      ...row,
      systemId: row.systemId ?? `${row.modelId}@legacy`,
      profile: row.profile ?? "legacy",
      tier: row.tier ?? (row.provisional ? "provisional" : "ranked"),
      rankCdf: row.rankCdf ?? [],
      topK: row.topK ?? {},
      evidence: row.evidence ?? {},
    }))).onConflictDoNothing();
    if (snapshot.benchmark_params.length) await tx.insert(benchmarkParams).values(snapshot.benchmark_params).onConflictDoNothing();
    if (snapshot.cells.length) await tx.insert(cells).values(snapshot.cells.map((row) => ({
      ...row,
      systemId: row.systemId ?? `${row.modelId}@legacy`,
      profile: row.profile ?? "legacy",
    }))).onConflictDoNothing();
  });
  return {
    models: snapshot.models.length,
    benchmarks: snapshot.benchmarks.length,
    sources: snapshot.sources.length,
    pricing: snapshot.pricing.length,
    results: snapshot.results.length,
    runs: snapshot.runs.length,
    scores: snapshot.scores.length,
    benchmarkParams: snapshot.benchmark_params.length,
    cells: snapshot.cells.length,
  };
}

async function main(): Promise<void> {
  const filename = process.argv[2];
  if (!filename) throw new Error("Usage: npm run import-snapshot --workspace @actualanalysis/db -- <snapshot.json>");
  const payload: unknown = JSON.parse(await readFile(path.resolve(filename), "utf8"));
  const { db, close } = createDatabase();
  try {
    const summary = await importPublicSnapshot(db, payload);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
