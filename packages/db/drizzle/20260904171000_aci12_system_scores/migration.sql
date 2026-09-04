ALTER TABLE "index_scores" ADD COLUMN IF NOT EXISTS "system_id" text;
UPDATE "index_scores" SET "system_id" = "model_id" || '@legacy' WHERE "system_id" IS NULL;
ALTER TABLE "index_scores" ALTER COLUMN "system_id" SET NOT NULL;
ALTER TABLE "index_scores" ADD COLUMN IF NOT EXISTS "profile" text;
ALTER TABLE "index_scores" ADD COLUMN IF NOT EXISTS "tier" text;
ALTER TABLE "index_scores" ADD COLUMN IF NOT EXISTS "rank_cdf" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "index_scores" ADD COLUMN IF NOT EXISTS "top_k" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "index_scores" ADD COLUMN IF NOT EXISTS "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "index_scores" DROP CONSTRAINT IF EXISTS "index_scores_pkey";
ALTER TABLE "index_scores" ADD CONSTRAINT "index_scores_pkey" PRIMARY KEY ("run_id", "system_id");

ALTER TABLE "cells" ADD COLUMN IF NOT EXISTS "system_id" text;
UPDATE "cells" SET "system_id" = "model_id" || '@legacy' WHERE "system_id" IS NULL;
ALTER TABLE "cells" ALTER COLUMN "system_id" SET NOT NULL;
ALTER TABLE "cells" ADD COLUMN IF NOT EXISTS "profile" text;
ALTER TABLE "cells" DROP CONSTRAINT IF EXISTS "cells_pkey";
ALTER TABLE "cells" ADD CONSTRAINT "cells_pkey" PRIMARY KEY ("run_id", "system_id", "benchmark_id");
