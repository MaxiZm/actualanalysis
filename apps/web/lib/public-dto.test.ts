import { describe, expect, it } from "vitest";

import { MODELS } from "./data";
import { toPublicModelDto } from "./public-dto";

describe("public model DTO", () => {
  it("allowlists nested snapshot fields and strips display-only sentinels", () => {
    const source = MODELS[0];
    if (!source) throw new Error("fixture model is missing");
    const tainted = {
      ...source,
      aliases: ["private/display-alias"],
      displayEconomics: { provider: "should never leak" },
      costPerTask: {
        usdPerTask: 1.234567,
        definition: "private task cost",
        provider: "AA",
        configuration: "high",
        workload: "AA suite",
        observedOn: "2026-09-05",
        sourceUrl: "https://example.com",
        methodologyUrl: "https://example.com/method",
        redistributable: false as const,
      },
      externalEvaluations: [
        {
          benchmarkId: "aa-briefcase",
          benchmarkName: "AA-Briefcase",
          version: "index-v4.2",
          measure: "score" as const,
          score: 1665,
          scoreUnit: "elo" as const,
          configuration: "Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)",
          observedOn: "2026-09-06",
          sourceUrl: "https://artificialanalysis.ai/evaluations/aa-briefcase",
          methodologyUrl:
            "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
          nItems: 91,
          redistributable: false as const,
        },
      ],
      pricing: source.pricing.map((price) => ({
        ...price,
        privateSentinel: "restricted",
      })),
    };

    const dto = toPublicModelDto(tainted);
    const serialized = JSON.stringify(dto);

    expect(dto.id).toBe(source.id);
    expect(dto.pricing).toHaveLength(source.pricing.length);
    expect(serialized).not.toContain("aliases");
    expect(serialized).not.toContain("displayEconomics");
    expect(serialized).not.toContain("costPerTask");
    expect(serialized).not.toContain("externalEvaluations");
    expect(serialized).not.toContain("aa-briefcase");
    expect(serialized).not.toContain("private task cost");
    expect(serialized).not.toContain("tokensPerSecond");
    expect(serialized).not.toContain("privateSentinel");
    expect(serialized).not.toContain("should never leak");
  });
});
