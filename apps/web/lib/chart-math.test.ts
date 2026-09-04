import { describe, expect, it } from "vitest";
import { organizationColorIndex, paretoFrontier } from "./chart-math";

describe("chart math", () => {
  it("keeps only non-dominated low-cost high-score points", () => {
    const points=[{id:"cheap",x:1,y:8},{id:"dominated",x:2,y:7},{id:"frontier",x:3,y:10}];
    expect(paretoFrontier(points).map(point=>point.id)).toEqual(["cheap","frontier"]);
  });

  it("assigns organizations to stable palette slots", () => {
    expect(organizationColorIndex("OpenAI")).toBe(organizationColorIndex("OpenAI"));
    expect(organizationColorIndex("OpenAI")).toBeLessThan(5);
  });
});
