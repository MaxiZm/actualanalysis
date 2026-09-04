import { describe, expect, it } from "vitest";

import { rateLimitedFixtureJson, rateLimitedResponse } from "./api";

describe("fixture API limiter", () => {
  it("adds CORS and rate headers, then returns 429 after the fixed window limit", async () => {
    const request = new Request("https://actualanalysis.test/api/v1/models", {
      headers: { "x-forwarded-for": "203.0.113.84" },
    });

    let response = rateLimitedFixtureJson(request, []);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");

    for (let requestNumber = 2; requestNumber <= 121; requestNumber += 1) {
      response = rateLimitedFixtureJson(request, []);
    }

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    const body = await response.json();
    expect(body.meta.published).toBe(false);
    expect(body.meta.disclaimer).toContain("synthetic fixture data");
  });

  it("applies the same public headers to downloadable response bodies", async () => {
    const request = new Request("https://actualanalysis.test/api/v1/download/results.csv", {
      headers: { "x-forwarded-for": "203.0.113.85" },
    });
    const response = rateLimitedResponse(request, "model_id,score\nmodel-a,0.5\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=actualanalysis-results.csv",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("119");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.text()).toContain("model-a,0.5");
  });
});
