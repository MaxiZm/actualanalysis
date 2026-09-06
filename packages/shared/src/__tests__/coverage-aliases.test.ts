import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AliasCollisionError, AliasResolver } from "../aliases.js";
import { loadRegistry } from "../registry.js";

const dataDir = fileURLToPath(new URL("../../../../data/", import.meta.url));

const ADMITTED = [
  { label: "Claude-Opus-4.0", id: "claude-opus-4" },
  { label: "Gemini 2.5 Pro (05-06)", id: "gemini-2.5-pro-20250506" },
  { label: "Grok 4 Fast R", id: "grok-4-fast" },
] as const;

const AMBIGUOUS = [
  "DeepSeek-v4-Pro",
  "deepseek-v4-pro",
  "DeepSeek-v4-Flash",
  "deepseek-v4-flash",
  "DeepSeek-v3.2-Exp",
  "DeepSeek-v3.2-Speciale",
  "gpt-4o",
  "GLM 5.1",
  "glm-5-1",
  "Kimi K2 Thinking",
  "Kimi K2.6",
  "kimi-k2-6",
  "GPT OSS 20B",
  "gemini-2.0-flash",
  "GLM 4.5 Air",
  "qwen3-7-max",
] as const;

describe("coverage aliases for live MathArena/DataCurve names", () => {
  it("resolves each admitted exact alias to one cataloged release", async () => {
    const registry = await loadRegistry(dataDir);
    for (const { label, id } of ADMITTED) {
      expect(registry.modelAliases.resolveId(label), label).toBe(id);
      expect(registry.modelAliases.resolveId(id), id).toBe(id);
      expect(registry.modelAliases.resolve(label)?.id).toBe(id);
    }
  });

  it("leaves ambiguous or uncataloged feed names unresolved", async () => {
    const registry = await loadRegistry(dataDir);
    for (const label of AMBIGUOUS) {
      expect(registry.modelAliases.resolveId(label), label).toBeUndefined();
    }
  });

  it("rejects undated DeepSeek V4 aliases that would collide across checkpoints", () => {
    expect(
      () => new AliasResolver([
        { id: "deepseek-v4-pro-0424", aliases: ["DeepSeek-v4-Pro"] },
        { id: "deepseek-v4-pro-0813", aliases: ["deepseek-v4-pro"] },
      ]),
    ).toThrow(AliasCollisionError);
    expect(
      () => new AliasResolver([
        { id: "deepseek-v4-flash-0731", aliases: ["DeepSeek-v4-Flash"] },
        { id: "deepseek-v4-flash-vision-exp", aliases: ["deepseek-v4-flash"] },
      ]),
    ).toThrow(AliasCollisionError);
  });
});
