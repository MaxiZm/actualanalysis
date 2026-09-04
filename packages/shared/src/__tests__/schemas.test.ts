import { describe, expect, it } from "vitest";
import { IsoDateSchema } from "../schemas/common.js";
import { SourceSchema } from "../schemas/source.js";

describe("common schemas", () => {
  it("rejects normalized but impossible calendar dates", () => {
    expect(IsoDateSchema.safeParse("2025-02-29").success).toBe(false);
    expect(IsoDateSchema.safeParse("2024-02-29").success).toBe(true);
  });
});

describe("source redistribution policy", () => {
  const source = {
    id: "example-source",
    name: "Example source",
    url: "https://example.com/source",
    license: "CC-BY-4.0",
    kind: "runner" as const,
  };

  it("requires an explicit benchmark allowlist for redistributable sources", () => {
    expect(SourceSchema.safeParse({ ...source, redistributable: true }).success).toBe(false);
    expect(SourceSchema.safeParse({
      ...source,
      redistributable: true,
      redistributable_benchmark_ids: ["benchmark-a"],
    }).success).toBe(true);
    expect(SourceSchema.safeParse({
      ...source,
      redistributable: true,
      redistributable_benchmark_ids: [],
    }).success).toBe(true);
  });

  it("rejects duplicate permissions and permissions on a restricted source", () => {
    expect(SourceSchema.safeParse({
      ...source,
      redistributable: true,
      redistributable_benchmark_ids: ["benchmark-a", "benchmark-a"],
    }).success).toBe(false);
    expect(SourceSchema.safeParse({
      ...source,
      redistributable: false,
      redistributable_benchmark_ids: ["benchmark-a"],
    }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...source, redistributable: false }).success).toBe(true);
  });

  it("validates dated source protocols and their effort rule", () => {
    const protocol = {
      protocol_id: "example-v1",
      benchmark_ids: ["benchmark-a"],
      provenance: "independent" as const,
      effort_tier_rule: "provider_default" as const,
      harness_id: "example-harness",
      harness_class: "common" as const,
      tool_policy: "none",
      benchmark_versions: { "benchmark-a": "v1" },
      grader_versions: { "benchmark-a": "grader-v1" },
      valid_from: "2026-01-01",
      methodology_url: "https://example.com/method",
    };
    expect(SourceSchema.safeParse({ ...source, redistributable: false, protocols: [protocol] }).success).toBe(true);
    expect(SourceSchema.safeParse({
      ...source,
      redistributable: false,
      protocols: [{ ...protocol, effort_tier: "medium" }],
    }).success).toBe(false);
  });
});
