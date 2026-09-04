import { describe, expect, it } from "vitest";

import { FIXTURE_SITE_DATA } from "./data";
import {
  withDisplaySpeed,
  withDisplayCost,
  withDisplayBenchmarks,
  DisplayCostFileSchema,
  DisplayBenchmarkFileSchema,
  DisplaySpeedFileSchema,
} from "./display-data";

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

describe("source-backed display registries", () => {
  const common = {
    model_id: "model-a",
    provider: "AA",
    configuration: "Model A (max)",
    observed_on: "2026-09-05",
    source_url: "https://example.com/model",
    redistributable: false as const,
  };
  const load = (filename: string) =>
    filename === "speed-aa.yaml"
      ? {
          redistributable: false,
          warning: "Display only",
          observations: [
            {
              ...common,
              ttft_s: 0.2,
              tokens_per_s: 85,
              workload: "source-default",
            },
          ],
        }
      : filename === "cost-aa.yaml"
        ? {
            redistributable: false,
            warning: "Display only",
            metric: {
              id: "aa-cost-per-task",
              name: "AA cost per task",
              definition: "Weighted cost per AA task",
              methodology_url: "https://example.com/method",
              suite: ["Example task"],
            },
            observations: [
              {
                ...common,
                usd_per_task: 0.25,
                workload: "aa-intelligence-index-v4.1.1",
              },
            ],
          }
        : {
            redistributable: false,
            warning: "Display only",
            observations: [
              {
                model_id: common.model_id,
                benchmark_id: "critpt",
                score: 12.6,
                score_unit: "percent",
                configuration: common.configuration,
                observed_on: common.observed_on,
                source_url: common.source_url,
                redistributable: false,
              },
            ],
          };
  it("retains a partial runtime measurement without inventing the missing metric", () => {
    const model = FIXTURE_SITE_DATA.models[0]!;
    const row = DisplaySpeedFileSchema.parse(load("speed-aa.yaml"))
      .observations[0]!;
    const data = withDisplaySpeed(FIXTURE_SITE_DATA, [
      { ...row, model_id: model.id, ttft_s: null, tokens_per_s: 85 },
    ]);
    expect(data.models[0]?.speed).toMatchObject({
      ttftSeconds: null,
      tokensPerSecond: 85,
    });
  });
  it("preserves zero task cost and does not mutate the public source data", () => {
    const file = DisplayCostFileSchema.parse(load("cost-aa.yaml"));
    const model = FIXTURE_SITE_DATA.models[0]!;
    const data = withDisplayCost(FIXTURE_SITE_DATA, {
      ...file,
      observations: [
        { ...file.observations[0]!, model_id: model.id, usd_per_task: 0 },
      ],
    });
    expect(data.models[0]?.costPerTask?.usdPerTask).toBe(0);
    expect(data.models[0]?.costPerTask?.redistributable).toBe(false);
    expect(FIXTURE_SITE_DATA.models[0]?.costPerTask).toBeUndefined();
  });
  it("converts AA percentages once, retains provenance, and supplies no fitted prediction", () => {
    const file = DisplayBenchmarkFileSchema.parse(load("benchmarks-aa.yaml"));
    const model = FIXTURE_SITE_DATA.models[0]!;
    const benchmark = FIXTURE_SITE_DATA.benchmarks[0]!;
    const data = withDisplayBenchmarks(FIXTURE_SITE_DATA, {
      ...file,
      observations: [
        {
          ...file.observations[0]!,
          model_id: model.id,
          benchmark_id: benchmark.id,
          score: 12.6,
        },
      ],
    });
    expect(data.results[0]).toMatchObject({
      score: 0.126,
      rawScore: 12.6,
      predicted: null,
      residualZ: null,
      displayOnly: true,
      sourceName: "Artificial Analysis",
    });
    expect(
      FIXTURE_SITE_DATA.results.some((row) => row.id.startsWith("aa:")),
    ).toBe(false);
  });
});
