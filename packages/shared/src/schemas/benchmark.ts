import { z } from "zod";
import {
  HttpUrlSchema,
  IsoDateSchema,
  NonEmptyStringSchema,
  RegistryIdSchema,
} from "./common.js";

export const BenchmarkTagSchema = z.enum(["agentic", "chat"]);
export const HoldoutSchema = z.enum(["public", "semi_private", "private", "rolling"]);
export const BenchmarkStatusSchema = z.enum(["active", "shadow", "watchlist", "retired"]);
export const UtilityStatusSchema = z.enum(["eligible", "pending", "ineligible"]);
export const ObservationTypeSchema = z.enum(["count", "passk", "arena", "elo", "horizon", "money", "judge"]);

const AccuracyTransformSchema = z
  .object({
    type: z.literal("accuracy"),
    input_scale: z.enum(["fraction", "percent"]).default("fraction"),
  })
  .strict();

const EloTransformSchema = z
  .object({
    type: z.literal("elo"),
    reference_model: NonEmptyStringSchema,
    reference_elo: z.number().finite(),
    scale: z.number().positive().default(400),
  })
  .strict();

const MetrHorizonTransformSchema = z
  .object({
    type: z.literal("metr_horizon"),
    input_unit: z.enum(["minutes", "hours"]).default("minutes"),
    midpoint_log2_minutes: z.number().finite().default(8),
    scale: z.number().positive().default(2),
    quantile: z.enum(["p50", "p80"]).default("p50"),
  })
  .strict();

const LogRelativeTransformSchema = z
  .object({
    type: z.literal("log_relative"),
    reference_value: z.number().positive(),
    base: z.number().positive().refine((value) => value !== 1, "log base cannot be 1").default(2),
    scale: z.number().positive().default(1),
  })
  .strict();

export const BenchmarkTransformSchema = z.discriminatedUnion("type", [
  AccuracyTransformSchema,
  EloTransformSchema,
  MetrHorizonTransformSchema,
  LogRelativeTransformSchema,
]);

export const BenchmarkSchema = z
  .object({
    id: RegistryIdSchema,
    name: NonEmptyStringSchema,
    version: NonEmptyStringSchema,
    grader_version: NonEmptyStringSchema.optional(),
    family_id: RegistryIdSchema.optional(),
    aliases: z.array(NonEmptyStringSchema).default([]),
    tags: z.array(BenchmarkTagSchema).min(1),
    categories: z.array(RegistryIdSchema).min(1),
    domains: z.record(RegistryIdSchema, z.number().min(0).max(1)).optional(),
    holdout: HoldoutSchema,
    holdout_details: NonEmptyStringSchema.optional(),
    chance_level: z.number().min(0).lt(1).default(0),
    ceiling: z.number().gt(0).lte(1).default(1),
    obs_type: ObservationTypeSchema.optional(),
    public_release_date: IsoDateSchema.optional(),
    item_release_date: IsoDateSchema.optional(),
    default_k: z.number().int().positive().optional(),
    default_rho: z.number().min(0).lt(1).optional(),
    tool_policy: NonEmptyStringSchema.optional(),
    default_variance: z.number().positive().optional(),
    is_reference: z.boolean().default(false),
    transform: BenchmarkTransformSchema,
    n_items: z.number().int().positive().nullable().optional(),
    harness_url: HttpUrlSchema,
    source_ids: z.array(RegistryIdSchema).min(1),
    metadata_sources: z.array(HttpUrlSchema).default([]),
    status: BenchmarkStatusSchema.default("active"),
    measurement_status: BenchmarkStatusSchema.optional(),
    utility_status: UtilityStatusSchema.default("pending"),
    utility_map: z.unknown().optional(),
    E_ref: z.number().finite().optional(),
    horizon_slope_published: z.boolean().optional(),
    common_runtime_id: RegistryIdSchema.optional(),
    promotion_rule: NonEmptyStringSchema.optional(),
    notes: NonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((benchmark, context) => {
    if (benchmark.ceiling <= benchmark.chance_level) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["ceiling"], message: "ceiling must exceed chance_level" });
    }
    if (benchmark.domains) {
      const total = Object.values(benchmark.domains).reduce((sum, value) => sum + value, 0);
      if (Math.abs(total - 1) > 1e-9) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["domains"], message: "domain shares must sum to 1" });
      }
    }
  });

export type BenchmarkTag = z.infer<typeof BenchmarkTagSchema>;
export type Holdout = z.infer<typeof HoldoutSchema>;
export type UtilityStatus = z.infer<typeof UtilityStatusSchema>;
export type BenchmarkTransform = z.infer<typeof BenchmarkTransformSchema>;
export type Benchmark = z.infer<typeof BenchmarkSchema>;
