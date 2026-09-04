ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "weights_date" date;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "training_cutoff" date;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "default_effort_tier" text;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "max_effort_tier" text;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "effort_tier_order" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "metadata_sources" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "grader_version" text;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "family_id" text;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "domains" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "ceiling" real DEFAULT 1 NOT NULL;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "obs_type" text;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "public_release_date" date;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "default_k" integer;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "default_rho" real;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "tool_policy" text;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "default_variance" real;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "is_reference" boolean DEFAULT false NOT NULL;
ALTER TABLE "benchmarks" ADD COLUMN IF NOT EXISTS "metadata_sources" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "benchmark_version" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "grader_version" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "evaluation_run_id" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "lineage_id" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "origin_provenance" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "host_source" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "x_correct" integer;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "k_trials" integer;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "per_task_counts" jsonb;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "uncertainty_type" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "uncertainty_value" jsonb;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "uncertainty_unit" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "n_runs" integer;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "run_values" jsonb;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "cost_per_task" real;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "latency_s" real;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "harness_class" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "effort_tier" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "tool_policy" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "observation_key" text;
UPDATE "results" SET "observation_key" = md5("id"::text) WHERE "observation_key" IS NULL;
ALTER TABLE "results" ALTER COLUMN "observation_key" SET NOT NULL;

DROP INDEX IF EXISTS "results_cell_source_config_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "results_observation_key_unique" ON "results" ("observation_key");

CREATE INDEX IF NOT EXISTS "results_lineage_idx" ON "results" ("lineage_id");
