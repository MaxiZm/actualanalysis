import { describe, expect, it } from "vitest";
import { orgColor } from "./org-color";

describe("organization colors",()=>{it("is stable and keeps known vendors explicit",()=>{
  expect(orgColor("OpenAI")).toBe("var(--org-openai)");
  expect(orgColor("Other Lab")).toBe(orgColor("Other Lab"));
});});
