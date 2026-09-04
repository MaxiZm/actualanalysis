import { describe, expect, it } from "vitest";

import { FIXTURE_SITE_DATA } from "./data";
import { withDisplaySpeed } from "./display-data";

describe("display-only speed overlay", () => {
  it("prefers a 10k observation and preserves the non-redistributable boundary", () => {
    const model = FIXTURE_SITE_DATA.models[0]!;
    const data = withDisplaySpeed(FIXTURE_SITE_DATA, [
      {
        model_id: model.id,
        provider: "Independent probe",
        ttft_s: 0.2,
        tokens_per_s: 80,
        workload: "1k",
        observed_on: "2026-09-04",
        source_url: "https://example.com/1k",
        redistributable: false,
      },
      {
        model_id: model.id,
        provider: "Attributed manual source",
        ttft_s: 0.6,
        tokens_per_s: 55,
        workload: "10k",
        observed_on: "2026-09-03",
        source_url: "https://example.com/10k",
        redistributable: false,
      },
    ]);

    expect(data.models[0]?.speed).toEqual({
      provider: "Attributed manual source",
      tokensPerSecond: 55,
      ttftSeconds: 0.6,
      workload: "10k input",
      observedOn: "2026-09-03",
      sourceUrl: "https://example.com/10k",
      redistributable: false,
    });
    expect(data.models[0]).not.toBe(FIXTURE_SITE_DATA.models[0]);
  });

  it("does not mutate models without a matching observation", () => {
    const data = withDisplaySpeed(FIXTURE_SITE_DATA, []);
    expect(data.models).not.toBe(FIXTURE_SITE_DATA.models);
    expect(data.models[0]).toBe(FIXTURE_SITE_DATA.models[0]);
  });
});
