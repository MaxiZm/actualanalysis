ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "protocols" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "protocol_id" text;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "version_inferred" boolean DEFAULT false NOT NULL;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "metadata_incomplete" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "results_protocol_idx" ON "results" ("protocol_id");
