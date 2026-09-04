import { z } from "zod";
import {
  HttpUrlSchema,
  IsoDateSchema,
  JsonValueSchema,
  NonEmptyStringSchema,
  RegistryIdSchema,
} from "./common.js";

export const ScoreUnitSchema = z.enum(["fraction", "percent", "elo", "minutes", "hours", "currency", "raw"]);
export const ProvenanceSchema = z.enum(["independent", "mirror", "self_report", "manual"]);
export const OriginProvenanceSchema = z.enum(["independent", "self_report"]);
export const HarnessClassSchema = z.enum(["common", "native", "unknown"]);
export const UncertaintyTypeSchema = z.enum(["se", "ci90", "ci95", "none"]);
export const UncertaintyUnitSchema = z.enum(["item", "run", "source"]);

export const ResultSchema = z
  .object({
    id: RegistryIdSchema.optional(),
    model_id: RegistryIdSchema,
    benchmark_id: RegistryIdSchema,
    source_id: RegistryIdSchema,
    system_id: NonEmptyStringSchema.optional(),
    benchmark_version: NonEmptyStringSchema.optional(),
    grader_version: NonEmptyStringSchema.optional(),
    evaluation_run_id: NonEmptyStringSchema.optional(),
    lineage_id: NonEmptyStringSchema.optional(),
    origin_provenance: OriginProvenanceSchema.optional(),
    host_source: NonEmptyStringSchema.optional(),
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
    uncertainty_type: UncertaintyTypeSchema.optional(),
    uncertainty_value: z.union([z.number().nonnegative(), z.tuple([z.number().finite(), z.number().finite()])]).optional(),
    uncertainty_unit: UncertaintyUnitSchema.optional(),
    n_runs: z.number().int().positive().optional(),
    run_values: z.array(z.number().finite()).optional(),
    cost_per_task: z.number().nonnegative().optional(),
    latency_s: z.number().nonnegative().optional(),
    config: z.record(JsonValueSchema).default({}),
    harness: NonEmptyStringSchema.optional(),
    harness_class: HarnessClassSchema.optional(),
    effort_tier: NonEmptyStringSchema.optional(),
    tool_policy: NonEmptyStringSchema.optional(),
    observed_on: IsoDateSchema,
    url: HttpUrlSchema,
    provenance: ProvenanceSchema,
    superseded_by: RegistryIdSchema.nullable().optional(),
    notes: NonEmptyStringSchema.optional(),
    sample_only: z.boolean().default(false),
  })
  .strict();

export const ResultFileSchema = z.object({ results: z.array(ResultSchema) }).strict();

export const SpeedObservationSchema = z
  .object({
    model_id: RegistryIdSchema,
    provider: NonEmptyStringSchema,
    ttft_s: z.number().finite().nonnegative().nullable(),
    tokens_per_s: z.number().finite().positive().nullable(),
    configuration: z.string().optional(),
    workload: z.enum(["1k", "10k", "100k", "source-default"]),
    observed_on: IsoDateSchema,
    source_url: HttpUrlSchema,
    redistributable: z.literal(false),
  })
  .strict();

export const SpeedFileSchema = z
  .object({
    redistributable: z.literal(false),
    warning: NonEmptyStringSchema,
    methodology_url: z.string().url().optional(),
    selection: z.string().optional(),
    definitions: z.record(z.string()).optional(),
    observations: z.array(SpeedObservationSchema),
  })
  .strict();

export type ScoreUnit = z.infer<typeof ScoreUnitSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Result = z.infer<typeof ResultSchema>;
export type SpeedObservation = z.infer<typeof SpeedObservationSchema>;
