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
      pricing: source.pricing.map((price) => ({ ...price, privateSentinel: "restricted" })),
    };

    const dto = toPublicModelDto(tainted);
    const serialized = JSON.stringify(dto);

    expect(dto.id).toBe(source.id);
    expect(dto.pricing).toHaveLength(source.pricing.length);
    expect(serialized).not.toContain("aliases");
    expect(serialized).not.toContain("displayEconomics");
    expect(serialized).not.toContain("tokensPerSecond");
    expect(serialized).not.toContain("privateSentinel");
    expect(serialized).not.toContain("should never leak");
  });
});
