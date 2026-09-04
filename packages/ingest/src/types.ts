import { z } from "zod";
import {
  HttpUrlSchema,
  HarnessClassSchema,
  IsoDateSchema,
  JsonValueSchema,
  ProvenanceSchema,
  OriginProvenanceSchema,
  RegistryIdSchema,
  ScoreUnitSchema,
} from "@actualanalysis/shared";

export const RawBenchmarkResultSchema = z
  .object({
    record_type: z.literal("benchmark_result"),
    model: z.string().trim().min(1),
    model_id: RegistryIdSchema.optional(),
    benchmark: z.string().trim().min(1),
    benchmark_id: RegistryIdSchema.optional(),
    source_id: RegistryIdSchema,
    system_id: z.string().trim().min(1).optional(),
    benchmark_version: z.string().trim().min(1).optional(),
    grader_version: z.string().trim().min(1).optional(),
    evaluation_run_id: z.string().trim().min(1).optional(),
    lineage_id: z.string().trim().min(1).optional(),
    origin_provenance: OriginProvenanceSchema.optional(),
    host_source: z.string().trim().min(1).optional(),
    protocol_id: RegistryIdSchema.optional(),
    version_inferred: z.boolean().optional(),
    metadata_incomplete: z.boolean().optional(),
    score: z.number().finite(),
    score_unit: ScoreUnitSchema.default("fraction"),
    se: z.number().finite().nonnegative().optional(),
    x_correct: z.number().int().nonnegative().optional(),
    n_items: z.number().int().positive().optional(),
    k_samples: z.number().int().positive().optional(),
    k_trials: z.number().int().positive().optional(),
    per_task_counts: z.array(z.number().int().nonnegative()).optional(),
    uncertainty_type: z.enum(["se", "ci90", "ci95", "none"]).optional(),
    uncertainty_value: z.union([z.number().nonnegative(), z.tuple([z.number().finite(), z.number().finite()])]).optional(),
    uncertainty_unit: z.enum(["item", "run", "source"]).optional(),
    n_runs: z.number().int().positive().optional(),
    run_values: z.array(z.number().finite()).optional(),
    cost_per_task: z.number().nonnegative().optional(),
    latency_s: z.number().nonnegative().optional(),
    config: z.record(JsonValueSchema).default({}),
    harness: z.string().trim().min(1).optional(),
    harness_class: HarnessClassSchema.optional(),
    effort_tier: z.string().trim().min(1).optional(),
    tool_policy: z.string().trim().min(1).optional(),
    observed_on: IsoDateSchema,
    source_url: HttpUrlSchema,
    provenance: ProvenanceSchema,
    metadata: z.record(JsonValueSchema).default({}),
  })
  .strict();

export const RawPricingSchema = z
  .object({
    record_type: z.literal("pricing"),
    model: z.string().trim().min(1),
    model_id: RegistryIdSchema.optional(),
    source_id: RegistryIdSchema,
    provider: z.string().trim().min(1),
    input_per_million: z.number().finite().nonnegative(),
    output_per_million: z.number().finite().nonnegative(),
    cache_read_per_million: z.number().finite().nonnegative().optional(),
    cache_write_per_million: z.number().finite().nonnegative().optional(),
    context_length: z.number().int().positive().optional(),
    max_output: z.number().int().positive().optional(),
    fetched_at: z.string().datetime({ offset: true }),
    source_url: HttpUrlSchema,
    metadata: z.record(JsonValueSchema).default({}),
  })
  .strict();

export const RawResultSchema = z.discriminatedUnion("record_type", [
  RawBenchmarkResultSchema,
  RawPricingSchema,
]);

export type RawBenchmarkResult = z.infer<typeof RawBenchmarkResultSchema>;
export type RawPricing = z.infer<typeof RawPricingSchema>;
export type RawResult = z.infer<typeof RawResultSchema>;

export interface AdapterWarning {
  code: "fetch_failed" | "parse_failed" | "no_records" | "partial" | "configuration";
  message: string;
  url?: string;
}

export interface AdapterOutput {
  source: string;
  records: RawResult[];
  warnings: AdapterWarning[];
  fetched_at: string;
}

export interface AdapterContext {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  dataDir: string;
  signal?: AbortSignal;
  env: Readonly<Record<string, string | undefined>>;
}

export interface IngestAdapter {
  readonly id: string;
  readonly failSoft?: boolean;
  ingest(context: AdapterContext): Promise<AdapterOutput>;
}

export function createAdapterContext(options: Partial<AdapterContext> & Pick<AdapterContext, "dataDir">): AdapterContext {
  return {
    fetch: options.fetch ?? globalThis.fetch,
    now: options.now ?? (() => new Date()),
    dataDir: options.dataDir,
    env: options.env ?? process.env,
    ...(options.signal ? { signal: options.signal } : {}),
  };
}
