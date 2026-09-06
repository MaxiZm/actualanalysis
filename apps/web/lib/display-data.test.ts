import { describe, expect, it } from "vitest";

import {
  FIXTURE_SITE_DATA,
  costPerTaskSuiteLabel,
  costPerTaskWorkloadLabel,
} from "./data";
import {
  withDisplaySpeed,
  withDisplayCost,
  withDisplayBenchmarks,
  DisplayCostFileSchema,
  DisplayBenchmarkFileSchema,
  DisplaySpeedFileSchema,
  parseDisplayBenchmarkFile,
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
  it("compares only the selected task suite even when historical measurements are newer", () => {
    const file = DisplayCostFileSchema.parse(load("cost-aa.yaml"));
    const model = FIXTURE_SITE_DATA.models[0]!;
    const current = {
      ...file.observations[0]!,
      model_id: model.id,
      workload: "aa-intelligence-index-v4.2",
      observed_on: "2026-09-04",
      usd_per_task: 0.3,
    };
    const data = withDisplayCost(FIXTURE_SITE_DATA, {
      ...file,
      active_workload: current.workload,
      metric: { ...file.metric, version: "4.2" },
      observations: [
        current,
        {
          ...current,
          workload: "aa-intelligence-index-v4.1.1",
          observed_on: "2026-09-05",
          usd_per_task: 0.1,
        },
      ],
    });
    expect(data.models[0]?.costPerTask).toMatchObject({
      usdPerTask: 0.3,
      workload: "aa-intelligence-index-v4.2",
      version: "4.2",
    });
    expect(costPerTaskSuiteLabel(data.models)).toBe("AA 4.2");
  });
  it("does not fill missing current-suite costs from historical rows or a prior overlay", () => {
    const file = DisplayCostFileSchema.parse(load("cost-aa.yaml"));
    const model = FIXTURE_SITE_DATA.models[0]!;
    const historicalFile = {
      ...file,
      observations: [{ ...file.observations[0]!, model_id: model.id }],
    };
    const historical = withDisplayCost(FIXTURE_SITE_DATA, historicalFile);
    expect(historical.models[0]?.costPerTask).toBeTruthy();
    const current = withDisplayCost(historical, {
      ...historicalFile,
      active_workload: "aa-intelligence-index-v4.2",
      metric: { ...file.metric, version: "4.2" },
    });
    expect(current.models[0]?.costPerTask).toBeNull();
    expect(historical.models[0]?.costPerTask).toBeTruthy();
  });
  it("requires an explicit workload when an archive contains different task suites", () => {
    const file = DisplayCostFileSchema.parse(load("cost-aa.yaml"));
    const [first, second] = FIXTURE_SITE_DATA.models;
    const data = withDisplayCost(FIXTURE_SITE_DATA, {
      ...file,
      observations: [
        { ...file.observations[0]!, model_id: first!.id },
        {
          ...file.observations[0]!,
          model_id: second!.id,
          workload: "aa-intelligence-index-v4.2",
        },
      ],
    });
    expect(data.models.some((model) => model.costPerTask)).toBe(false);
  });
  it("labels legacy single-suite measurements with their actual version", () => {
    expect(
      costPerTaskWorkloadLabel({ workload: "aa-intelligence-index-v4.1.1" }),
    ).toBe("AA 4.1.1");
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
    expect(data.results.filter((row) => !row.displayOnly)).toEqual(
      FIXTURE_SITE_DATA.results,
    );
    expect(data.models[0]?.indexes).toEqual(FIXTURE_SITE_DATA.models[0]?.indexes);
    expect(data.models[0]?.indexes.mixed?.coverageCount).toBe(
      FIXTURE_SITE_DATA.models[0]?.indexes.mixed?.coverageCount,
    );
  });
});

describe("versioned external benchmark overlay", () => {
  const model = FIXTURE_SITE_DATA.models[0]!;
  const registryBenchmark = FIXTURE_SITE_DATA.benchmarks[0]!;
  const baseObservation = {
    model_id: model.id,
    configuration: "Model A (max)",
    observed_on: "2026-09-06",
    source_url: "https://artificialanalysis.ai/evaluations/aa-briefcase",
    redistributable: false as const,
  };

  it("accepts native Elo and separate accuracy/hallucination percent measures", () => {
    const file = DisplayBenchmarkFileSchema.parse({
      redistributable: false,
      warning: "Display only",
      benchmarks: [
        {
          id: "aa-briefcase",
          name: "AA-Briefcase",
          version: "index-v4.2",
          n_items: 91,
          repeats: 1,
          scoring: "Combined Elo",
          methodology_url:
            "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
          harness_url: "https://github.com/ArtificialAnalysis/Stirrup",
          grader_version: "3-judge panel",
          score_unit: "elo",
        },
        {
          id: "aa-omniscience",
          name: "AA-Omniscience",
          version: "index-v4.2",
          n_items: 6000,
          repeats: 1,
          scoring: "Accuracy and hallucination as separate measures",
          methodology_url:
            "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
          harness_url:
            "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
          grader_version: "GPT-5.6 Luna (medium reasoning)",
          score_unit: "percent",
        },
      ],
      observations: [
        {
          ...baseObservation,
          benchmark_id: "aa-briefcase",
          score: 1665,
          score_unit: "elo",
        },
        {
          ...baseObservation,
          benchmark_id: "aa-omniscience",
          score: 67,
          score_unit: "percent",
          measure: "accuracy",
        },
        {
          ...baseObservation,
          benchmark_id: "aa-omniscience",
          score: 12,
          score_unit: "percent",
          measure: "hallucination",
        },
      ],
    });
    const data = withDisplayBenchmarks(FIXTURE_SITE_DATA, file);
    expect(data.models[0]?.externalEvaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          benchmarkId: "aa-briefcase",
          score: 1665,
          scoreUnit: "elo",
          measure: "score",
          configuration: "Model A (max)",
          redistributable: false,
        }),
        expect.objectContaining({
          benchmarkId: "aa-omniscience",
          measure: "accuracy",
          score: 67,
          scoreUnit: "percent",
        }),
        expect.objectContaining({
          benchmarkId: "aa-omniscience",
          measure: "hallucination",
          score: 12,
        }),
      ]),
    );
    expect(data.results.some((row) => row.id.includes("aa-briefcase"))).toBe(
      false,
    );
    expect(data.models[0]?.indexes.mixed?.coverageCount).toBe(
      FIXTURE_SITE_DATA.models[0]?.indexes.mixed?.coverageCount,
    );
  });

  it("rejects out-of-range percent and negative Elo while allowing Elo above 100", () => {
    expect(
      parseDisplayBenchmarkFile({
        redistributable: false,
        warning: "Display only",
        observations: [
          { ...baseObservation, benchmark_id: "aa-briefcase", score: 101, score_unit: "percent" },
        ],
      }),
    ).toBeNull();
    expect(
      parseDisplayBenchmarkFile({
        redistributable: false,
        warning: "Display only",
        observations: [
          { ...baseObservation, benchmark_id: "aa-briefcase", score: -1, score_unit: "elo" },
        ],
      }),
    ).toBeNull();
    expect(
      parseDisplayBenchmarkFile({
        redistributable: false,
        warning: "Display only",
        observations: [
          { ...baseObservation, benchmark_id: "aa-briefcase", score: 1665, score_unit: "elo" },
        ],
      }),
    ).not.toBeNull();
  });

  it("keeps a system-matched configuration and drops a mismatched system_id", () => {
    const mixed = model.indexes.mixed;
    if (!mixed) throw new Error("fixture mixed index is missing");
    const scored = {
      ...FIXTURE_SITE_DATA,
      models: [
        {
          ...model,
          system: {
            id: "model-a:max",
            profile: "max",
            tier: "ranked" as const,
            aciG: null,
            domains: {},
            baskets: {},
            evidence: null,
          },
          indexes: {
            mixed: { ...mixed, systemId: "model-a:max" },
            ...(model.indexes.agentic ? { agentic: model.indexes.agentic } : {}),
            ...(model.indexes.chat ? { chat: model.indexes.chat } : {}),
          },
        },
        ...FIXTURE_SITE_DATA.models.slice(1),
      ],
    };
    const file = DisplayBenchmarkFileSchema.parse({
      redistributable: false,
      warning: "Display only",
      observations: [
        {
          ...baseObservation,
          benchmark_id: registryBenchmark.id,
          system_id: "model-a:max",
          score: 12.6,
          score_unit: "percent",
        },
        {
          ...baseObservation,
          benchmark_id: registryBenchmark.id,
          system_id: "model-a:low",
          configuration: "Model A (low)",
          score: 4,
          score_unit: "percent",
        },
      ],
    });
    const data = withDisplayBenchmarks(scored, file);
    expect(data.models[0]?.externalEvaluations).toHaveLength(1);
    expect(data.models[0]?.externalEvaluations?.[0]).toMatchObject({
      systemId: "model-a:max",
      configuration: "Model A (max)",
      score: 12.6,
    });
    expect(data.results.filter((row) => row.displayOnly)).toHaveLength(1);
  });

  it("failsofts a missing or malformed private file without mutating site data", () => {
    expect(parseDisplayBenchmarkFile(undefined)).toBeNull();
    expect(parseDisplayBenchmarkFile({ redistributable: false })).toBeNull();
    const absent = withDisplayBenchmarks(FIXTURE_SITE_DATA, null);
    expect(absent.results).toBe(FIXTURE_SITE_DATA.results);
    expect(absent.models[0]).toBe(FIXTURE_SITE_DATA.models[0]);
    expect(absent.models[0]?.externalEvaluations).toBeUndefined();
  });
});
