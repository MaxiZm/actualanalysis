import { describe, expect, it } from "vitest";
import { comparisonUnit, comparisonValue } from "./format";

describe("source units on a shared chart", () => {
  it("puts DeepSWE fraction and percent reports on the same axis", () => {
    expect(comparisonValue(0.74, "fraction")).toBe(
      comparisonValue(74, "percent"),
    );
    expect(comparisonValue(0.117, "fraction")).toBeCloseTo(11.7);
    expect(comparisonUnit("fraction")).toBe(comparisonUnit("percent"));
  });
  it("compares time horizons consistently without changing other metrics", () => {
    expect(comparisonValue(180, "minutes")).toBe(comparisonValue(3, "hours"));
    expect(comparisonUnit("minutes")).toBe("hours");
    expect(comparisonValue(1530, "elo")).toBe(1530);
    expect(comparisonUnit("raw")).not.toBe(comparisonUnit("percent"));
  });
});
