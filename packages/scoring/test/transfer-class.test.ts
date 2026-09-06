import { describe, expect, it } from "vitest";
import {
  computeRegistryHash,
  GrokClassPriorContractSchema,
  GrokPoolingSchema,
  GrokPartitionItemSchema,
  NON_PUBLISHABLE_METADATA,
  SystemSpecificationSchema,
  TaskPopulationSchema,
  MeasurementSpecificationSchema,
  validateTransferClassRegistry,
  type TransferClassRegistry,
} from "../src/transfer-class.js";

describe("transfer class validation and Grok contract schemas", () => {
  it("validates a synthetic multi-class registry and computes frozen hash", () => {
    const registry: TransferClassRegistry = {
      edition: "unreviewed-synthetic-0.1",
      singletonFallback: true,
      classes: [
        {
          classId: "synthetic-series-alpha",
          memberModels: ["synth-alpha-v1", "synth-alpha-v2"],
          derivationEvidence: "Documented continuous checkpoint update of identical transformer base.",
          referenceConfigurationCompatibility: "Matched standard temperature and prompt harness.",
          isSingleton: false,
        },
      ],
      metadata: {},
    };

    const report = validateTransferClassRegistry(registry, [
      "synth-alpha-v1",
      "synth-alpha-v2",
      "synth-beta-isolated",
    ]);

    expect(report.valid).toBe(true);
    expect(report.multiMemberClasses).toBe(1);
    expect(report.isPartition).toBe(true);
    expect(report.singletonsAdded).toEqual(["synth-beta-isolated"]);
    expect(report.frozenHash).toHaveLength(64);
    expect(report.metadata.is_experimental).toBe(true);
    expect(report.metadata.is_publishable).toBe(false);
  });

  it("detects partition violation when model appears in multiple classes", () => {
    const registry: TransferClassRegistry = {
      edition: "unreviewed-synthetic-0.1",
      singletonFallback: true,
      classes: [
        {
          classId: "class-1",
          memberModels: ["synth-m1", "synth-m2"],
          derivationEvidence: "Documented architectural derivation",
          referenceConfigurationCompatibility: "Equal",
          isSingleton: false,
        },
        {
          classId: "class-2",
          memberModels: ["synth-m2", "synth-m3"],
          derivationEvidence: "Documented architectural derivation",
          referenceConfigurationCompatibility: "Equal",
          isSingleton: false,
        },
      ],
      metadata: {},
    };

    const report = validateTransferClassRegistry(registry);
    expect(report.valid).toBe(false);
    expect(report.isPartition).toBe(false);
    expect(report.issues.some((i) => i.includes("Partition violation"))).toBe(true);
  });

  it("rejects guessed brand classes without architectural lineage", () => {
    const registry: TransferClassRegistry = {
      edition: "unreviewed-brand-test",
      singletonFallback: true,
      classes: [
        {
          classId: "openai",
          memberModels: ["m1", "m2"],
          derivationEvidence: "shared brand models",
          referenceConfigurationCompatibility: "Unknown",
          isSingleton: false,
        },
      ],
      metadata: {},
    };

    const report = validateTransferClassRegistry(registry);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.includes("guessed brand class"))).toBe(true);
  });

  it("validates Grok class_prior contract schema", () => {
    // Valid beta pooling contract
    const validBetaContract = {
      enabled: true as const,
      family: "restricted" as const,
      edition: "unreviewed-illustrative-0.1",
      pooling: { kind: "beta" as const, alpha: 1.0, beta: 1.0 },
      partition: [
        { class_id: "synthetic-pair", model_ids: ["m1", "m2"] },
      ],
      registry_sha256: "abc123hash",
      notes: "Testing Grok contract schema",
    };
    expect(GrokClassPriorContractSchema.parse(validBetaContract)).toBeDefined();

    // Valid fixed pooling contract (exact nested baseline)
    const validFixedContract = {
      enabled: true as const,
      family: "restricted" as const,
      edition: "unreviewed-illustrative-0.1",
      pooling: { kind: "fixed" as const, value: 0.0 },
      partition: [],
    };
    expect(GrokClassPriorContractSchema.parse(validFixedContract)).toBeDefined();

    // Reject singleton: prefix in partition class_id
    expect(() =>
      GrokPartitionItemSchema.parse({
        class_id: "singleton:m1",
        model_ids: ["m1"],
      })
    ).toThrow(/singleton:/);

    // Reject @ in partition model_ids
    expect(() =>
      GrokPartitionItemSchema.parse({
        class_id: "valid-class",
        model_ids: ["m1@max-common"],
      })
    ).toThrow(/@/);

    // Reject non-restricted family
    expect(() =>
      GrokClassPriorContractSchema.parse({
        ...validBetaContract,
        family: "random_walk",
      })
    ).toThrow();
  });
});
