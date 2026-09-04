import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const holdoutKind = pgEnum("holdout_kind", [
  "public",
  "semi_private",
  "private",
  "rolling"
]);
export const sourceKind = pgEnum("source_kind", [
  "runner",
  "mirror",
  "self_report",
  "scrape",
  "manual"
]);
export const indexKind = pgEnum("index_kind", ["mixed", "agentic", "chat"]);

export const models = pgTable(
  "models",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    org: text("org").notNull(),
    family: text("family").notNull(),
    releaseDate: date("release_date", { mode: "string" }),
    openWeights: boolean("open_weights").notNull().default(false),
    license: text("license"),
    reasoningConfig: jsonb("reasoning_config").$type<Record<string, unknown>>().notNull().default({}),
    reasoning: boolean("reasoning"),
    weightsDate: date("weights_date", { mode: "string" }),
    trainingCutoff: date("training_cutoff", { mode: "string" }),
    defaultEffortTier: text("default_effort_tier"),
    maxEffortTier: text("max_effort_tier"),
    effortTierOrder: text("effort_tier_order").array().notNull().default([]),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([])
    ,contextLength: integer("context_length")
    ,maxOutput: integer("max_output")
    ,sourceUrl: text("source_url")
    ,metadataSources: jsonb("metadata_sources").$type<string[]>().notNull().default([])
    ,status: text("status").notNull().default("active")
    ,paramsTotalB: real("params_total_b")
    ,paramsActiveB: real("params_active_b")
    ,modality: text("modality").notNull().default("text")
    ,sizeClass: text("size_class").notNull().default("unknown")
  },
  (table) => [uniqueIndex("models_slug_unique").on(table.slug), index("models_org_idx").on(table.org)]
);

export const benchmarks = pgTable(
  "benchmarks",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    tags: text("tags").array().notNull(),
    categories: text("categories").array().notNull(),
    chanceLevel: real("chance_level").notNull().default(0),
    holdout: holdoutKind("holdout").notNull(),
    transform: jsonb("transform").$type<Record<string, unknown>>().notNull().default({}),
    nItems: integer("n_items"),
    harnessUrl: text("harness_url"),
    status: text("status").notNull().default("active")
    ,graderVersion: text("grader_version")
    ,familyId: text("family_id")
    ,domains: jsonb("domains").$type<Record<string, number>>().notNull().default({})
    ,ceiling: real("ceiling").notNull().default(1)
    ,obsType: text("obs_type")
    ,publicReleaseDate: date("public_release_date", { mode: "string" })
    ,defaultK: integer("default_k")
    ,defaultRho: real("default_rho")
    ,toolPolicy: text("tool_policy")
    ,defaultVariance: real("default_variance")
    ,isReference: boolean("is_reference").notNull().default(false)
    ,metadataSources: jsonb("metadata_sources").$type<string[]>().notNull().default([])
  },
  (table) => [uniqueIndex("benchmarks_slug_unique").on(table.slug)]
);

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  license: text("license"),
  attribution: text("attribution"),
  kind: sourceKind("kind").notNull(),
  redistributable: boolean("redistributable").notNull().default(false),
  redistributableBenchmarkIds: text("redistributable_benchmark_ids").array().notNull().default([]),
  protocols: jsonb("protocols").$type<Array<Record<string, unknown>>>().notNull().default([])
});

export const results = pgTable(
  "results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    benchmarkId: text("benchmark_id").notNull().references(() => benchmarks.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => sources.id),
    score: real("score").notNull(),
    scoreUnit: text("score_unit").notNull().default("fraction"),
    provenance: text("provenance").notNull().default("manual"),
    se: real("se"),
    nItems: integer("n_items"),
    kSamples: integer("k_samples"),
    benchmarkVersion: text("benchmark_version"),
    graderVersion: text("grader_version"),
    evaluationRunId: text("evaluation_run_id"),
    lineageId: text("lineage_id"),
    originProvenance: text("origin_provenance"),
    hostSource: text("host_source"),
    protocolId: text("protocol_id"),
    versionInferred: boolean("version_inferred").notNull().default(false),
    metadataIncomplete: boolean("metadata_incomplete").notNull().default(false),
    xCorrect: integer("x_correct"),
    kTrials: integer("k_trials"),
    perTaskCounts: jsonb("per_task_counts").$type<number[]>(),
    uncertaintyType: text("uncertainty_type"),
    uncertaintyValue: jsonb("uncertainty_value").$type<number | [number, number]>(),
    uncertaintyUnit: text("uncertainty_unit"),
    nRuns: integer("n_runs"),
    runValues: jsonb("run_values").$type<number[]>(),
    costPerTask: real("cost_per_task"),
    latencyS: real("latency_s"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    configHash: text("config_hash").notNull().default("default"),
    observationKey: text("observation_key").notNull(),
    harness: text("harness"),
    harnessClass: text("harness_class"),
    effortTier: text("effort_tier"),
    toolPolicy: text("tool_policy"),
    observedOn: date("observed_on", { mode: "string" }).notNull(),
    url: text("url").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("results_observation_key_unique").on(table.observationKey),
    index("results_model_benchmark_idx").on(table.modelId, table.benchmarkId)
  ]
);

export const pricing = pgTable(
  "pricing",
  {
    modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => sources.id),
    provider: text("provider").notNull(),
    inputPerM: real("input_per_m").notNull(),
    outputPerM: real("output_per_m").notNull(),
    cacheReadPerM: real("cache_read_per_m"),
    cacheWritePerM: real("cache_write_per_m"),
    contextLength: integer("context_length"),
    maxOutput: integer("max_output"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull()
  },
  (table) => [primaryKey({ columns: [table.modelId, table.provider] })]
);

export const speed = pgTable(
  "speed",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    workload: text("workload").notNull(),
    ttftS: real("ttft_s").notNull(),
    tokensPerS: real("tokens_per_s").notNull(),
    observedOn: date("observed_on", { mode: "string" }).notNull(),
    sourceId: text("source_id").notNull().references(() => sources.id),
    redistributable: boolean("redistributable").notNull().default(false)
  },
  (table) => [uniqueIndex("speed_observation_unique").on(table.modelId, table.provider, table.workload, table.observedOn)]
);

export const indexRuns = pgTable(
  "index_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: indexKind("kind").notNull(),
    methodVersion: text("method_version").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("index_runs_kind_created_idx").on(table.kind, table.createdAt)]
);

export const indexScores = pgTable(
  "index_scores",
  {
    runId: uuid("run_id").notNull().references(() => indexRuns.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    systemId: text("system_id").notNull(),
    profile: text("profile"),
    tier: text("tier"),
    score: real("score"),
    ciLow: real("ci_low"),
    ciHigh: real("ci_high"),
    rank: integer("rank"),
    rankLow: integer("rank_low"),
    rankHigh: integer("rank_high"),
    coverage: real("coverage").notNull(),
    nPrivate: integer("n_private").notNull(),
    robustScore: real("robust_score").notNull(),
    flags: jsonb("flags").$type<unknown[]>().notNull().default([]),
    provisional: boolean("provisional").notNull().default(false),
    pairwise: jsonb("pairwise").$type<Record<string, number>>().notNull().default({})
    ,rankCdf: jsonb("rank_cdf").$type<number[]>().notNull().default([])
    ,topK: jsonb("top_k").$type<Record<string, number>>().notNull().default({})
    ,evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({})
  },
  (table) => [primaryKey({ columns: [table.runId, table.systemId] }), index("index_scores_rank_idx").on(table.runId, table.rank)]
);

export const benchmarkParams = pgTable(
  "benchmark_params",
  {
    runId: uuid("run_id").notNull().references(() => indexRuns.id, { onDelete: "cascade" }),
    benchmarkId: text("benchmark_id").notNull().references(() => benchmarks.id, { onDelete: "cascade" }),
    difficulty: real("difficulty").notNull(),
    slope: real("slope").notNull(),
    weight: real("weight").notNull(),
    weightFactors: jsonb("weight_factors").$type<Record<string, number>>().notNull(),
    residualVar: real("residual_var").notNull()
  },
  (table) => [primaryKey({ columns: [table.runId, table.benchmarkId] })]
);

export const cells = pgTable(
  "cells",
  {
    runId: uuid("run_id").notNull().references(() => indexRuns.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    systemId: text("system_id").notNull(),
    profile: text("profile"),
    benchmarkId: text("benchmark_id").notNull().references(() => benchmarks.id, { onDelete: "cascade" }),
    y: real("y").notNull(),
    yHat: real("y_hat").notNull(),
    z: real("z").notNull(),
    used: boolean("used").notNull().default(true)
  },
  (table) => [primaryKey({ columns: [table.runId, table.systemId, table.benchmarkId] })]
);

export type ModelRow = typeof models.$inferSelect;
export type BenchmarkRow = typeof benchmarks.$inferSelect;
export type ResultRow = typeof results.$inferSelect;
