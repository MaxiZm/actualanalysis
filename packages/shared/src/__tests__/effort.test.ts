import { describe, expect, it } from "vitest";
import { readReportedEffort } from "../effort.js";

describe("source-reported effort", () => {
  it.each([undefined, null, "", " ", "unknown", "not_reported", "N/A", "—"])("recognizes a missing marker without overriding a reported setting: %s", (effort_tier) => {
    expect(readReportedEffort({ effort_tier })).toBeUndefined();
    expect(readReportedEffort({ effort_tier, config: { thinking_level: "medium" } })).toBe("medium");
  });
  it.each(["none", "disabled", "default", "medium", "high", "xhigh", "max", "0.99"])("preserves an explicit setting: %s", (effort_tier) => {
    expect(readReportedEffort({ effort_tier })).toBe(effort_tier);
  });
  it("retains numeric compute effort and dedicated source precedence", () => {
    expect(readReportedEffort({ config: { compute_effort: 0.99 } })).toBe("0.99");
    expect(readReportedEffort({ effort_tier: "high", config: { reasoning_effort: "medium" } })).toBe("high");
  });
});
