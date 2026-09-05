import { z } from "zod";

import type { SiteData, SpeedRecord } from "./data";

export const DisplaySpeedObservationSchema = z
  .object({
    model_id: z.string().min(1),
    provider: z.string().min(1),
    ttft_s: z.number().finite().nonnegative().nullable(),
    tokens_per_s: z.number().finite().positive().nullable(),
    configuration: z.string().optional(),
    workload: z.enum(["1k", "10k", "100k", "source-default"]),
    observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    source_url: z.string().url(),
    redistributable: z.literal(false),
  })
  .strict();

export const DisplaySpeedFileSchema = z
  .object({
    redistributable: z.literal(false),
    warning: z.string().min(1),
    methodology_url: z.string().url().optional(),
    selection: z.string().optional(),
    definitions: z.record(z.string()).optional(),
    observations: z.array(DisplaySpeedObservationSchema),
  })
  .strict();

export type DisplaySpeedObservation = z.infer<
  typeof DisplaySpeedObservationSchema
>;

const workloadPriority: Record<DisplaySpeedObservation["workload"], number> = {
  "10k": 0,
  "1k": 1,
  "100k": 2,
  "source-default": 3,
};

function preferredObservation(
  left: DisplaySpeedObservation,
  right: DisplaySpeedObservation,
): DisplaySpeedObservation {
  const workloadOrder =
    workloadPriority[left.workload] - workloadPriority[right.workload];
  if (workloadOrder !== 0) return workloadOrder < 0 ? left : right;
  return right.observed_on.localeCompare(left.observed_on) > 0 ? right : left;
}

function toSpeedRecord(observation: DisplaySpeedObservation): SpeedRecord {
  return {
    provider: observation.provider,
    tokensPerSecond: observation.tokens_per_s,
    ttftSeconds: observation.ttft_s,
    workload:
      observation.workload === "source-default"
        ? "Source default workload"
        : `${observation.workload} input`,
    ...(observation.configuration
      ? { configuration: observation.configuration }
      : {}),
    observedOn: observation.observed_on,
    sourceUrl: observation.source_url,
    redistributable: false,
  };
}

/**
 * Adds the isolated display-only speed registry to UI data. Callers serving
 * public JSON or snapshot assets must continue using the unmodified SiteData.
 */
export function withDisplaySpeed(
  data: SiteData,
  observations: readonly DisplaySpeedObservation[],
): SiteData {
  const preferredByModel = new Map<string, DisplaySpeedObservation>();
  for (const observation of observations) {
    const current = preferredByModel.get(observation.model_id);
    preferredByModel.set(
      observation.model_id,
      current ? preferredObservation(current, observation) : observation,
    );
  }

  return {
    ...data,
    models: data.models.map((model) => {
      const observation = preferredByModel.get(model.id);
      return observation
        ? { ...model, speed: toSpeedRecord(observation) }
        : model;
    }),
  };
}

export const DisplayCostFileSchema = z
  .object({
    redistributable: z.literal(false),
    warning: z.string().min(1),
    active_workload: z.string().min(1).optional(),
    metric: z
      .object({
        id: z.literal("aa-cost-per-task"),
        name: z.string(),
        version: z.string().min(1).optional(),
        definition: z.string(),
        methodology_url: z.string().url(),
        suite: z.array(z.string()),
      })
      .strict(),
    observations: z.array(
      z
        .object({
          model_id: z.string().min(1),
          provider: z.string().min(1),
          usd_per_task: z.number().finite().nonnegative(),
          configuration: z.string().min(1),
          workload: z.string().min(1),
          observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          source_url: z.string().url(),
          redistributable: z.literal(false),
        })
        .strict(),
    ),
  })
  .strict();

export type DisplayCostFile = z.infer<typeof DisplayCostFileSchema>;

export function withDisplayCost(
  data: SiteData,
  file: DisplayCostFile | null,
): SiteData {
  if (!file) return data;
  // Legacy files are safe only when every row measures the same workload.
  // Mixed archives must explicitly select one suite before any comparison.
  const workloads = new Set(file.observations.map((row) => row.workload));
  const activeWorkload =
    file.active_workload ??
    (workloads.size === 1 ? file.observations[0]?.workload : undefined);
  const byModel = new Map<string, DisplayCostFile["observations"][number]>();
  for (const row of file.observations) {
    if (row.workload !== activeWorkload) continue;
    const previous = byModel.get(row.model_id);
    if (!previous || row.observed_on > previous.observed_on)
      byModel.set(row.model_id, row);
  }
  return {
    ...data,
    models: data.models.map((model) => {
      const row = byModel.get(model.id);
      return row
        ? {
            ...model,
            costPerTask: {
              usdPerTask: row.usd_per_task,
              provider: row.provider,
              configuration: row.configuration,
              workload: row.workload,
              ...(file.metric.version ? { version: file.metric.version } : {}),
              observedOn: row.observed_on,
              sourceUrl: row.source_url,
              definition: file.metric.definition,
              methodologyUrl: file.metric.methodology_url,
              redistributable: false as const,
            },
          }
        : model.costPerTask
          ? { ...model, costPerTask: null }
          : model;
    }),
  };
}

export const DisplayBenchmarkFileSchema = z
  .object({
    redistributable: z.literal(false),
    warning: z.string().min(1),
    benchmark: z
      .object({
        id: z.string(),
        version: z.string(),
        n_items: z.number().int().positive(),
        repeats: z.number().int().positive(),
        scoring: z.string(),
        methodology_url: z.string().url(),
        harness_url: z.string().url(),
        grader_version: z.string(),
      })
      .strict()
      .optional(),
    observations: z.array(
      z
        .object({
          model_id: z.string().min(1),
          benchmark_id: z.string().min(1),
          score: z.number().finite().min(0).max(100),
          score_unit: z.literal("percent"),
          configuration: z.string().min(1),
          observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          source_url: z.string().url(),
          redistributable: z.literal(false),
        })
        .strict(),
    ),
  })
  .strict();

export function withDisplayBenchmarks(
  data: SiteData,
  file: z.infer<typeof DisplayBenchmarkFileSchema> | null,
): SiteData {
  if (!file) return data;
  const results = file.observations.flatMap((row) => {
    const model = data.models.find((item) => item.id === row.model_id);
    const benchmark = data.benchmarks.find(
      (item) => item.id === row.benchmark_id,
    );
    return model && benchmark
      ? [
          {
            id: `aa:${row.model_id}:${row.benchmark_id}`,
            modelSlug: model.slug,
            benchmarkSlug: benchmark.slug,
            rawScore: row.score,
            score: row.score / 100,
            scoreUnit: row.score_unit,
            predicted: null,
            predictedNative: null,
            observedLogit: null,
            predictedLogit: null,
            standardError: null,
            residualZ: null,
            sourceKind: "independent" as const,
            sourceName: "Artificial Analysis",
            sourceUrl: row.source_url,
            harness: "Artificial Analysis",
            config: { evaluation_configuration: row.configuration },
            nItems: benchmark.nItems,
            observedOn: row.observed_on,
            used: true,
            displayOnly: true,
            sourceLicense: "Non-redistributable",
          },
        ]
      : [];
  });
  return { ...data, results: [...results, ...data.results] };
}
