import { z } from "zod";
import { HttpUrlSchema, IsoDateSchema, JsonValueSchema, NonEmptyStringSchema, RegistryIdSchema } from "./common.js";
import { HarnessClassSchema, OriginProvenanceSchema } from "./result.js";

export const SourceKindSchema = z.enum(["runner", "mirror", "self_report", "scrape", "manual"]);

export const SourceProtocolSchema = z.object({
  protocol_id: RegistryIdSchema,
  benchmark_ids: z.array(RegistryIdSchema).min(1),
  model_ids: z.array(RegistryIdSchema).min(1).optional(),
  provenance: OriginProvenanceSchema,
  effort_tier: NonEmptyStringSchema.optional(),
  effort_tier_rule: z.enum(["provider_default", "highest_exposed"]).optional(),
  harness_id: NonEmptyStringSchema.optional(),
  harness_class: HarnessClassSchema.optional(),
  runtime_id: RegistryIdSchema.optional(),
  runtime_class: z.enum(["common", "product"]).optional(),
  tool_policy: NonEmptyStringSchema.optional(),
  network_policy: NonEmptyStringSchema.optional(),
  budgets: z.record(z.unknown()).optional(),
  benchmark_versions: z.record(RegistryIdSchema, NonEmptyStringSchema).default({}),
  grader_versions: z.record(RegistryIdSchema, NonEmptyStringSchema).default({}),
  config_match: z.record(JsonValueSchema).optional(),
  valid_from: IsoDateSchema.optional(),
  valid_to: IsoDateSchema.optional(),
  methodology_url: HttpUrlSchema,
}).strict().superRefine((protocol, context) => {
  if (protocol.effort_tier && protocol.effort_tier_rule) {
    context.addIssue({ code: "custom", path: ["effort_tier_rule"], message: "declare effort_tier or effort_tier_rule, not both" });
  }
  if (protocol.valid_from && protocol.valid_to && protocol.valid_from > protocol.valid_to) {
    context.addIssue({ code: "custom", path: ["valid_to"], message: "valid_to must not precede valid_from" });
  }
});

const SourceBaseSchema = z.object({
  id: RegistryIdSchema,
  name: NonEmptyStringSchema,
  url: HttpUrlSchema,
  data_url: HttpUrlSchema.optional(),
  license: NonEmptyStringSchema,
  kind: SourceKindSchema,
  attribution: NonEmptyStringSchema.optional(),
  notes: NonEmptyStringSchema.optional(),
  runner_benchmark_ids: z.array(RegistryIdSchema).optional(),
  protocols: z.array(SourceProtocolSchema).optional(),
});

const RedistributableBenchmarkIdsSchema = z.array(RegistryIdSchema).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Redistributable benchmark IDs must be unique." });
  }
});

export const SourceSchema = z.discriminatedUnion("redistributable", [
  SourceBaseSchema.extend({
    redistributable: z.literal(true),
    redistributable_benchmark_ids: RedistributableBenchmarkIdsSchema,
  }).strict(),
  SourceBaseSchema.extend({
    redistributable: z.literal(false),
    redistributable_benchmark_ids: z.array(RegistryIdSchema).max(0).optional(),
  }).strict(),
]);

export type SourceKind = z.infer<typeof SourceKindSchema>;
export type SourceProtocol = z.infer<typeof SourceProtocolSchema>;
export type Source = z.infer<typeof SourceSchema>;
