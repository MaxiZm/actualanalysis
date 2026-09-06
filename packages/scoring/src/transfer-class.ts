import { createHash } from "node:crypto";
import { z } from "zod";

export const KNOWN_BRAND_TERMS = new Set([
  "openai",
  "anthropic",
  "google",
  "meta",
  "deepseek",
  "mistral",
  "qwen",
  "alibaba",
  "xai",
  "microsoft",
  "cohere",
  "amazon",
]);

export const FORBIDDEN_GUESSING_KEYS = new Set([
  "guess_providers",
  "provider_classes",
  "infer_from_name",
  "by_provider",
  "provider",
  "guess",
  "auto_partition",
]);

export const NON_PUBLISHABLE_METADATA = {
  is_experimental: true,
  is_publishable: false,
  confirmatory_criteria_locked: false,
  real_reviewed_classes_exist: false,
  notice:
    "UNREVIEWED ILLUSTRATIVE EXAMPLE ONLY. Do not use for production ranking or publication. " +
    "Confirmatory promotion criteria are not locked, and reviewed capability-transfer " +
    "classes have not been certified.",
} as const;

export const SystemSpecificationSchema = z.object({
  modelId: z.string().min(1),
  inferenceConfiguration: z.union([z.record(z.unknown()), z.string()]).optional(),
  harness: z.string().optional(),
  toolPolicy: z.string().optional(),
  budgetPolicy: z.union([z.record(z.unknown()), z.string()]).optional(),
  unresolvedFields: z.array(z.string()).default([]),
  operatingTarget: z
    .enum(["configured_performance", "budget_controlled", "best_feasible"])
    .default("configured_performance"),
});
export type SystemSpecification = z.infer<typeof SystemSpecificationSchema>;

export const TaskPopulationSchema = z.object({
  populationId: z.string().min(1),
  description: z.string().min(1),
  utilityDefinition: z.string().min(1),
  samplingRule: z.string().min(1),
  domainWeights: z.record(z.number().min(0)),
  isVerifiedTaskMass: z.boolean().default(false),
  verifiedTaskMassQ: z.number().min(0).max(1).optional(),
});
export type TaskPopulation = z.infer<typeof TaskPopulationSchema>;

export const MeasurementSpecificationSchema = z.object({
  benchmarkId: z.string().min(1),
  nativeMetric: z.enum(["elo", "horizon", "count", "accuracy", "money"]),
  nativeScale: z.string().min(1),
  likelihoodFamily: z.enum(["normal", "a_single", "a_total", "a_exact"]),
  samplingUnit: z.string().default("task"),
  dependenceStructure: z.string().default("independent"),
});
export type MeasurementSpecification = z.infer<typeof MeasurementSpecificationSchema>;

export const TransferClassSchema = z.object({
  classId: z.string().min(1),
  memberModels: z.array(z.string().min(1)).min(1),
  derivationEvidence: z.string().default(""),
  referenceConfigurationCompatibility: z.string().default(""),
  isSingleton: z.boolean().default(false),
  notes: z.string().optional(),
});
export type TransferClass = z.infer<typeof TransferClassSchema>;

export const TransferClassRegistrySchema = z.object({
  edition: z.string().default("unreviewed-illustrative-0.1"),
  singletonFallback: z.boolean().default(true),
  classes: z.array(TransferClassSchema),
  metadata: z.record(z.unknown()).default({}),
});
export type TransferClassRegistry = z.infer<typeof TransferClassRegistrySchema>;

// Grok class_prior contract schemas
export const GrokPoolingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("beta"),
    alpha: z.number().positive(),
    beta: z.number().positive(),
  }),
  z.object({
    kind: z.literal("fixed"),
    value: z.number().min(0).max(1),
  }),
]);
export type GrokPooling = z.infer<typeof GrokPoolingSchema>;

export const GrokPartitionItemSchema = z.object({
  class_id: z
    .string()
    .min(1)
    .refine((id) => !id.startsWith("singleton:"), {
      message: "class_id must not use singleton: prefix",
    }),
  model_ids: z
    .array(
      z
        .string()
        .min(1)
        .refine((m) => !m.includes("@"), {
          message: "model_ids must be release snapshot IDs without @",
        })
    )
    .min(1),
});
export type GrokPartitionItem = z.infer<typeof GrokPartitionItemSchema>;

export const GrokClassPriorContractSchema = z.object({
  enabled: z.literal(true),
  family: z.literal("restricted"),
  edition: z.string().min(1),
  pooling: GrokPoolingSchema,
  partition: z.array(GrokPartitionItemSchema),
  registry_sha256: z.string().optional(),
  notes: z.string().optional(),
  review: z.string().optional(),
  source: z.string().optional(),
});
export type GrokClassPriorContract = z.infer<typeof GrokClassPriorContractSchema>;

export interface RegistryValidationReport {
  valid: boolean;
  issues: string[];
  warnings: string[];
  totalClasses: number;
  multiMemberClasses: number;
  singletonsAdded: string[];
  isPartition: boolean;
  frozenHash: string;
  metadata: typeof NON_PUBLISHABLE_METADATA;
}

export function computeRegistryHash(registry: TransferClassRegistry): string {
  const canonicalClasses = [...registry.classes]
    .map((c) => ({
      class_id: c.classId,
      member_models: [...c.memberModels].map((m) => m.split("@")[0]!.trim()).sort(),
      derivation_evidence: c.derivationEvidence.trim(),
      reference_configuration_compatibility: c.referenceConfigurationCompatibility.trim(),
      is_singleton: c.isSingleton,
    }))
    .sort((a, b) => a.class_id.localeCompare(b.class_id));

  const payload = {
    edition: registry.edition,
    singleton_fallback: registry.singletonFallback,
    classes: canonicalClasses,
  };

  const encoded = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(encoded, "utf8").digest("hex");
}

export function validateTransferClassRegistry(
  input: unknown,
  knownModels?: readonly string[],
): RegistryValidationReport {
  const parsed = TransferClassRegistrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      warnings: [],
      totalClasses: 0,
      multiMemberClasses: 0,
      singletonsAdded: [],
      isPartition: false,
      frozenHash: "",
      metadata: NON_PUBLISHABLE_METADATA,
    };
  }

  const registry = parsed.data;
  const issues: string[] = [];
  const warnings: string[] = [];
  const seenModels = new Map<string, string>();
  let multiMemberCount = 0;

  for (const c of registry.classes) {
    const isMulti = c.memberModels.length > 1 && !c.isSingleton;
    if (isMulti) multiMemberCount += 1;

    for (const m of c.memberModels) {
      const cleanM = m.split("@")[0]!.trim();
      if (seenModels.has(cleanM)) {
        issues.push(
          `Partition violation: model '${cleanM}' is assigned to multiple classes ('${seenModels.get(cleanM)}' and '${c.classId}').`
        );
      } else {
        seenModels.set(cleanM, c.classId);
      }
    }

    if (isMulti) {
      const evidence = c.derivationEvidence.trim();
      if (!evidence || evidence.length < 10) {
        issues.push(
          `Class '${c.classId}' lacks documented derivation evidence. Capability transfer classes cannot be guessed or purely nominal.`
        );
      }

      const words = new Set(
        c.classId.toLowerCase().replace(/[-_]/g, " ").split(/\s+/).filter(Boolean)
      );
      const isBrandOnly = [...words].every((w) => KNOWN_BRAND_TERMS.has(w));
      if (isBrandOnly && evidence.toLowerCase().includes("shared brand")) {
        issues.push(
          `Class '${c.classId}' appears to be a guessed brand class without documented architectural or training lineage.`
        );
      }

      if (!c.referenceConfigurationCompatibility.trim()) {
        warnings.push(
          `Class '${c.classId}' has unstated reference configuration comparability.`
        );
      }
    }
  }

  const singletonsAdded: string[] = [];
  if (registry.singletonFallback && knownModels) {
    for (const m of knownModels) {
      const cleanM = m.split("@")[0]!.trim();
      if (!seenModels.has(cleanM)) {
        singletonsAdded.push(cleanM);
      }
    }
  }

  const frozenHash = computeRegistryHash(registry);
  const valid = issues.length === 0;

  return {
    valid,
    issues,
    warnings,
    totalClasses: registry.classes.length,
    multiMemberClasses: multiMemberCount,
    singletonsAdded,
    isPartition: issues.every((i) => !i.startsWith("Partition violation")),
    frozenHash,
    metadata: NON_PUBLISHABLE_METADATA,
  };
}
