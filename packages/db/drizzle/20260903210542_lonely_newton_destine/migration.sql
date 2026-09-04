CREATE TYPE "holdout_kind" AS ENUM('public', 'semi_private', 'private', 'rolling');--> statement-breakpoint
CREATE TYPE "index_kind" AS ENUM('mixed', 'agentic', 'chat');--> statement-breakpoint
CREATE TYPE "source_kind" AS ENUM('runner', 'mirror', 'self_report', 'scrape', 'manual');--> statement-breakpoint
CREATE TABLE "benchmark_params" (
	"run_id" uuid,
	"benchmark_id" text,
	"difficulty" real NOT NULL,
	"slope" real NOT NULL,
	"weight" real NOT NULL,
	"weight_factors" jsonb NOT NULL,
	"residual_var" real NOT NULL,
	CONSTRAINT "benchmark_params_pkey" PRIMARY KEY("run_id","benchmark_id")
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"tags" text[] NOT NULL,
	"categories" text[] NOT NULL,
	"chance_level" real DEFAULT 0 NOT NULL,
	"holdout" "holdout_kind" NOT NULL,
	"transform" jsonb DEFAULT '{}' NOT NULL,
	"n_items" integer,
	"harness_url" text,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cells" (
	"run_id" uuid,
	"model_id" text,
	"benchmark_id" text,
	"y" real NOT NULL,
	"y_hat" real NOT NULL,
	"z" real NOT NULL,
	"used" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cells_pkey" PRIMARY KEY("run_id","model_id","benchmark_id")
);
--> statement-breakpoint
CREATE TABLE "index_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" "index_kind" NOT NULL,
	"method_version" text NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_scores" (
	"run_id" uuid,
	"model_id" text,
	"score" real NOT NULL,
	"ci_low" real,
	"ci_high" real,
	"rank" integer,
	"rank_low" integer,
	"rank_high" integer,
	"coverage" real NOT NULL,
	"n_private" integer NOT NULL,
	"robust_score" real NOT NULL,
	"flags" jsonb DEFAULT '[]' NOT NULL,
	"provisional" boolean DEFAULT false NOT NULL,
	"pairwise" jsonb DEFAULT '{}' NOT NULL,
	CONSTRAINT "index_scores_pkey" PRIMARY KEY("run_id","model_id")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"org" text NOT NULL,
	"family" text NOT NULL,
	"release_date" date,
	"open_weights" boolean DEFAULT false NOT NULL,
	"license" text,
	"reasoning_config" jsonb DEFAULT '{}' NOT NULL,
	"aliases" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing" (
	"model_id" text,
	"source_id" text NOT NULL,
	"provider" text,
	"input_per_m" real NOT NULL,
	"output_per_m" real NOT NULL,
	"cache_read_per_m" real,
	"cache_write_per_m" real,
	"context_length" integer,
	"max_output" integer,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pricing_pkey" PRIMARY KEY("model_id","provider")
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"model_id" text NOT NULL,
	"benchmark_id" text NOT NULL,
	"source_id" text NOT NULL,
	"score" real NOT NULL,
	"score_unit" text DEFAULT 'fraction' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"se" real,
	"n_items" integer,
	"k_samples" integer,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"config_hash" text DEFAULT 'default' NOT NULL,
	"harness" text,
	"observed_on" date NOT NULL,
	"url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"license" text,
	"attribution" text,
	"kind" "source_kind" NOT NULL,
	"redistributable" boolean DEFAULT false NOT NULL,
	"redistributable_benchmark_ids" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"workload" text NOT NULL,
	"ttft_s" real NOT NULL,
	"tokens_per_s" real NOT NULL,
	"observed_on" date NOT NULL,
	"source_id" text NOT NULL,
	"redistributable" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "benchmarks_slug_unique" ON "benchmarks" ("slug");--> statement-breakpoint
CREATE INDEX "index_runs_kind_created_idx" ON "index_runs" ("kind","created_at");--> statement-breakpoint
CREATE INDEX "index_scores_rank_idx" ON "index_scores" ("run_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "models_slug_unique" ON "models" ("slug");--> statement-breakpoint
CREATE INDEX "models_org_idx" ON "models" ("org");--> statement-breakpoint
CREATE UNIQUE INDEX "results_cell_source_config_unique" ON "results" ("model_id","benchmark_id","source_id","config_hash");--> statement-breakpoint
CREATE INDEX "results_model_benchmark_idx" ON "results" ("model_id","benchmark_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speed_observation_unique" ON "speed" ("model_id","provider","workload","observed_on");--> statement-breakpoint
ALTER TABLE "benchmark_params" ADD CONSTRAINT "benchmark_params_run_id_index_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "index_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "benchmark_params" ADD CONSTRAINT "benchmark_params_benchmark_id_benchmarks_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "benchmarks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_run_id_index_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "index_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_model_id_models_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_benchmark_id_benchmarks_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "benchmarks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "index_scores" ADD CONSTRAINT "index_scores_run_id_index_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "index_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "index_scores" ADD CONSTRAINT "index_scores_model_id_models_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_model_id_models_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id");--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_model_id_models_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_benchmark_id_benchmarks_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "benchmarks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id");--> statement-breakpoint
ALTER TABLE "speed" ADD CONSTRAINT "speed_model_id_models_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "speed" ADD CONSTRAINT "speed_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id");
