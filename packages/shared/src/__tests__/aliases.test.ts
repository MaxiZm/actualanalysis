import { describe, expect, it } from "vitest";
import { AliasCollisionError, AliasResolver, normalizeAlias } from "../aliases.js";

describe("AliasResolver", () => {
  it("normalizes declared names and aliases", () => {
    const resolver = new AliasResolver([
      { id: "gpt-5", name: "GPT-5", aliases: ["openai/gpt-5", "GPT 5"] },
    ]);
    expect(normalizeAlias("  GPT–5  ")).toBe("gpt-5");
    expect(resolver.resolveId("OPENAI/GPT-5")).toBe("gpt-5");
    expect(resolver.resolve("gpt 5")?.id).toBe("gpt-5");
    expect(resolver.resolve("not-a-model")).toBeUndefined();
  });

  it("rejects ambiguous normalized aliases", () => {
    expect(
      () => new AliasResolver([
        { id: "one", aliases: ["same name"] },
        { id: "two", aliases: ["same-name"] },
      ]),
    ).toThrow(AliasCollisionError);
  });
});

