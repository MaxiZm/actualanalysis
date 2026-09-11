import { z } from "zod";

import {
  INDEX_KINDS,
  type ExternalEvaluationRecord,
  type ExternalMeasure,
  type ExternalScoreUnit,
  type SiteData,
  type SpeedRecord,
} from "./data";

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

const displayDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const displayScoreUnit = z.enum(["percent", "elo"]);
const displayMeasure = z.enum([
  "score",
  "accuracy",
  "hallucination",
  "all-pass",
]);

export const DisplayBenchmarkDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    version: z.string().min(1),
    n_items: z.number().int().positive().optional(),
    repeats: z.number().int().positive().optional(),
    scoring: z.string().min(1),
    methodology_url: z.string().url(),
    harness_url: z.string().url(),
    grader_version: z.string().min(1),
    score_unit: displayScoreUnit.optional(),
    source_url: z.string().url().optional(),
  })
  .strict();

export const DisplayBenchmarkObservationSchema = z
  .object({
    model_id: z.string().min(1),
    system_id: z.string().min(1).optional(),
    benchmark_id: z.string().min(1),
    version: z.string().min(1).optional(),
    score: z.number().finite(),
    score_unit: displayScoreUnit,
    measure: displayMeasure.optional(),
    configuration: z.string().min(1),
    observed_on: displayDate,
    source_url: z.string().url(),
    redistributable: z.literal(false),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.score_unit === "percent" && (row.score < 0 || row.score > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "percent scores must be in [0, 100]",
        path: ["score"],
      });
    }
    if (row.score_unit === "elo" && row.score < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elo scores must be finite and at least 0",
        path: ["score"],
      });
    }
  });

export const DisplayBenchmarkFileSchema = z
  .object({
    redistributable: z.literal(false),
    warning: z.string().min(1),
    retrieved_on: displayDate.optional(),
    benchmark: DisplayBenchmarkDefinitionSchema.optional(),
    benchmarks: z.array(DisplayBenchmarkDefinitionSchema).optional(),
    observations: z.array(DisplayBenchmarkObservationSchema),
  })
  .strict();

export type DisplayBenchmarkFile = z.infer<typeof DisplayBenchmarkFileSchema>;
export type DisplayBenchmarkObservation = z.infer<
  typeof DisplayBenchmarkObservationSchema
>;

export function parseDisplayBenchmarkFile(
  value: unknown,
): DisplayBenchmarkFile | null {
  const parsed = DisplayBenchmarkFileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function benchmarkCatalog(
  file: DisplayBenchmarkFile,
): Map<string, z.infer<typeof DisplayBenchmarkDefinitionSchema>> {
  const catalog = new Map<
    string,
    z.infer<typeof DisplayBenchmarkDefinitionSchema>
  >();
  if (file.benchmark) catalog.set(file.benchmark.id, file.benchmark);
  for (const definition of file.benchmarks ?? []) {
    catalog.set(definition.id, definition);
  }
  return catalog;
}

function modelSystemIds(model: SiteData["models"][number]): Set<string> {
  const ids = new Set<string>();
  if (model.system?.id) ids.add(model.system.id);
  for (const kind of INDEX_KINDS) {
    const systemId = model.indexes[kind]?.systemId;
    if (systemId) ids.add(systemId);
  }
  return ids;
}

function observationMatchesSystem(
  row: DisplayBenchmarkObservation,
  model: SiteData["models"][number],
): boolean {
  if (!row.system_id) return true;
  return modelSystemIds(model).has(row.system_id);
}

function nativeChartValues(row: DisplayBenchmarkObservation): {
  rawScore: number;
  score: number;
  scoreUnit: ExternalScoreUnit;
} {
  if (row.score_unit === "percent") {
    return {
      rawScore: row.score,
      score: row.score / 100,
      scoreUnit: "percent",
    };
  }
  return { rawScore: row.score, score: row.score, scoreUnit: "elo" };
}

/**
 * Adds isolated, non-redistributable external benchmark observations to UI
 * data. Callers serving public JSON or snapshot assets must continue using
 * the unmodified SiteData. Missing files are represented as null.
 */
export function withDisplayBenchmarks(
  data: SiteData,
  file: DisplayBenchmarkFile | null,
): SiteData {
  if (!file) return data;
  const catalog = benchmarkCatalog(file);
  const evaluationsByModel = new Map<string, ExternalEvaluationRecord[]>();
  const results = file.observations.flatMap((row) => {
    const model = data.models.find((item) => item.id === row.model_id);
    if (!model || !observationMatchesSystem(row, model)) return [];
    const definition = catalog.get(row.benchmark_id);
    const registryBenchmark = data.benchmarks.find(
      (item) => item.id === row.benchmark_id,
    );
    const measure = (row.measure ?? "score") as ExternalMeasure;
    const native = nativeChartValues(row);
    const version = row.version ?? definition?.version ?? "unspecified";
    const evaluation: ExternalEvaluationRecord = {
      benchmarkId: row.benchmark_id,
      benchmarkName:
        definition?.name ?? registryBenchmark?.name ?? row.benchmark_id,
      version,
      measure,
      score: row.score,
      scoreUnit: row.score_unit,
      configuration: row.configuration,
      ...(row.system_id ? { systemId: row.system_id } : {}),
      observedOn: row.observed_on,
      sourceUrl: row.source_url,
      methodologyUrl:
        definition?.methodology_url ??
        registryBenchmark?.harnessUrl ??
        row.source_url,
      ...(definition?.harness_url
        ? { harnessUrl: definition.harness_url }
        : {}),
      ...(definition?.grader_version
        ? { graderVersion: definition.grader_version }
        : {}),
      ...(definition?.scoring ? { scoring: definition.scoring } : {}),
      nItems: definition?.n_items ?? registryBenchmark?.nItems ?? null,
      ...(definition?.repeats ? { repeats: definition.repeats } : {}),
      ...(registryBenchmark ? { internalSlug: registryBenchmark.slug } : {}),
      redistributable: false,
    };
    const existing = evaluationsByModel.get(model.id) ?? [];
    existing.push(evaluation);
    evaluationsByModel.set(model.id, existing);
    if (!registryBenchmark) return [];
    return [
      {
        id: `aa:${row.model_id}:${row.benchmark_id}:${measure}:${row.configuration}`,
        modelSlug: model.slug,
        benchmarkSlug: registryBenchmark.slug,
        rawScore: native.rawScore,
        score: native.score,
        scoreUnit: native.scoreUnit,
        predicted: null,
        predictedNative: null,
        observedLogit: null,
        predictedLogit: null,
        standardError: null,
        residualZ: null,
        sourceKind: "independent" as const,
        sourceName: "Artificial Analysis",
        sourceUrl: row.source_url,
        harness: definition?.grader_version ?? "Artificial Analysis",
        config: {
          evaluation_configuration: row.configuration,
          ...(row.system_id ? { system_id: row.system_id } : {}),
          measure,
          version,
        },
        nItems: definition?.n_items ?? registryBenchmark.nItems,
        observedOn: row.observed_on,
        used: true,
        displayOnly: true,
        sourceLicense: "Non-redistributable",
      },
    ];
  });
  return {
    ...data,
    models: data.models.map((model) => {
      const evaluations = evaluationsByModel.get(model.id);
      return evaluations?.length
        ? { ...model, externalEvaluations: evaluations }
        : model;
    }),
    results: [...results, ...data.results],
  };
}
