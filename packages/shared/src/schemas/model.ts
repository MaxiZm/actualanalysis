import { z } from "zod";
import {
  HttpUrlSchema,
  IsoDateSchema,
  JsonValueSchema,
  NonEmptyStringSchema,
  RegistryIdSchema,
} from "./common.js";

export const ModelStatusSchema = z.enum(["active", "preview", "retired"]);

export const ModelSchema = z
  .object({
    id: RegistryIdSchema,
    name: NonEmptyStringSchema,
    organization: NonEmptyStringSchema,
    family: NonEmptyStringSchema,
    release_date: IsoDateSchema.optional(),
    weights_date: IsoDateSchema.optional(),
    weights_valid_from: IsoDateSchema.optional(),
    weights_valid_to: IsoDateSchema.optional(),
    training_cutoff: IsoDateSchema.nullable().optional(),
    post_training_freeze: IsoDateSchema.nullable().optional(),
    default_effort_tier: NonEmptyStringSchema.optional(),
    max_effort_tier: NonEmptyStringSchema.optional(),
    effort_tier_order: z.array(NonEmptyStringSchema).min(1).optional(),
    product_runtimes: z.array(NonEmptyStringSchema).default([]),
    open_weights: z.boolean(),
    license: NonEmptyStringSchema.optional(),
    aliases: z.array(NonEmptyStringSchema).default([]),
    reasoning: z.boolean().optional(),
    reasoning_config: z.record(JsonValueSchema).optional(),
    context_length: z.number().int().positive().optional(),
    max_output: z.number().int().positive().optional(),
    params_total_b: z.number().nonnegative().optional(),
    params_active_b: z.number().nonnegative().optional(),
    modality: z.enum(["text", "multimodal", "audio", "vision"]).default("text"),
    size_class: z.enum(["small", "medium", "large", "frontier", "unknown"]).default("unknown"),
    source_url: HttpUrlSchema.optional(),
    metadata_sources: z.array(HttpUrlSchema).default([]),
    status: ModelStatusSchema.default("active"),
    notes: NonEmptyStringSchema.optional(),
  })
  .strict();

export type Model = z.infer<typeof ModelSchema>;
