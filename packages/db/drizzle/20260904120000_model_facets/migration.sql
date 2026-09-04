ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "context_length" integer;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "max_output" integer;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "params_total_b" real;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "params_active_b" real;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "modality" text DEFAULT 'text' NOT NULL;
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "size_class" text DEFAULT 'unknown' NOT NULL;
