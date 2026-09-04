import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Registry } from "@actualanalysis/shared";
import type { RawResult } from "@actualanalysis/ingest";
import { selectPreferredResults } from "@actualanalysis/ingest";
import type { DatabaseWriter } from "./client.js";
import { benchmarks, models, pricing, results, sources, speed } from "./schema.js";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function configHash(config: unknown): string {
  return createHash("sha256").update(stable(config)).digest("hex");
}

export function resultObservationKey(row: {
  model_id?: string | undefined;
  benchmark_id?: string | undefined;
  source_id: string;
  evaluation_run_id?: string | undefined;
  lineage_id?: string | undefined;
  observed_on: string;
  score: number;
  score_unit: string;
  config: unknown;
  id?: string | undefined;
}): string {
  return configHash(row.id ? { source_id: row.source_id, id: row.id } : {
    model_id: row.model_id,
    benchmark_id: row.benchmark_id,
    source_id: row.source_id,
    evaluation_run_id: row.evaluation_run_id,
    lineage_id: row.lineage_id,
    observed_on: row.observed_on,
    score: row.score,
    score_unit: row.score_unit,
    config: row.config,
  });
}

export interface SeedSummary {
  models: number;
  benchmarks: number;
  sources: number;
  manualResults: number;
  speed: number;
}

export function sourceSeedValues(row: Registry["sources"][number]) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    license: row.license ?? null,
    attribution: row.attribution ?? null,
    kind: row.kind,
    redistributable: row.redistributable,
    redistributableBenchmarkIds: row.redistributable_benchmark_ids ?? [],
    protocols: row.protocols ?? [],
  };
}

/** Idempotently synchronizes the version-controlled registries into Postgres. */
export async function seedRegistry(db: DatabaseWriter, registry: Registry): Promise<SeedSummary> {
  for (const row of registry.models) {
    const values = {
      id: row.id,
      slug: row.id,
      name: row.name,
      org: row.organization,
      family: row.family,
      releaseDate: row.release_date ?? null,
      openWeights: row.open_weights,
      license: row.license ?? null,
      reasoningConfig: row.reasoning_config ?? {},
      reasoning: row.reasoning ?? null,
      weightsDate: row.weights_date ?? null,
      trainingCutoff: row.training_cutoff ?? null,
      defaultEffortTier: row.default_effort_tier ?? null,
      maxEffortTier: row.max_effort_tier ?? null,
      effortTierOrder: row.effort_tier_order ?? [],
      aliases: row.aliases ?? [],
      contextLength: row.context_length ?? null,
      maxOutput: row.max_output ?? null,
      sourceUrl: row.source_url ?? null,
      metadataSources: row.metadata_sources ?? [],
      status: row.status ?? "active",
      paramsTotalB: row.params_total_b ?? null,
      paramsActiveB: row.params_active_b ?? null,
      modality: row.modality ?? "text",
      sizeClass: row.size_class ?? "unknown",
    };
    await db.insert(models).values(values).onConflictDoUpdate({ target: models.id, set: values });
  }

  for (const row of registry.benchmarks) {
    const values = {
      id: row.id,
      slug: row.id,
      name: row.name,
      version: row.version,
      tags: row.tags,
      categories: row.categories,
      chanceLevel: row.chance_level ?? 0,
      holdout: row.holdout,
      transform: row.transform ?? { type: "accuracy" },
      nItems: row.n_items ?? null,
      harnessUrl: row.harness_url ?? null,
      status: row.status ?? "active",
      graderVersion: row.grader_version ?? null,
      familyId: row.family_id ?? null,
      domains: row.domains ?? {},
      ceiling: row.ceiling ?? 1,
      obsType: row.obs_type ?? null,
      publicReleaseDate: row.public_release_date ?? null,
      defaultK: row.default_k ?? null,
      defaultRho: row.default_rho ?? null,
      toolPolicy: row.tool_policy ?? null,
      defaultVariance: row.default_variance ?? null,
      isReference: row.is_reference ?? false,
      metadataSources: row.metadata_sources ?? [],
    };
    await db.insert(benchmarks).values(values).onConflictDoUpdate({ target: benchmarks.id, set: values });
  }

  for (const row of registry.sources) {
    const values = sourceSeedValues(row);
    await db.insert(sources).values(values).onConflictDoUpdate({ target: sources.id, set: values });
  }

  const includeSamples = process.env.INCLUDE_SAMPLE_DATA === "1";
  const manualResults = registry.results.filter((row) => includeSamples || !row.sample_only);
  for (const row of manualResults) {
    const hash = configHash(row.config);
    const observationKey = resultObservationKey(row);
    await db
      .insert(results)
      .values({
        modelId: row.model_id,
        benchmarkId: row.benchmark_id,
        sourceId: row.source_id,
        score: row.score,
        scoreUnit: row.score_unit,
        provenance: row.provenance,
        se: row.se ?? null,
        nItems: row.n_items ?? null,
        kSamples: row.k_samples ?? null,
        benchmarkVersion: row.benchmark_version ?? null,
        graderVersion: row.grader_version ?? null,
        evaluationRunId: row.evaluation_run_id ?? null,
        lineageId: row.lineage_id ?? null,
        originProvenance: row.origin_provenance ?? null,
        hostSource: row.host_source ?? null,
        protocolId: row.protocol_id ?? null,
        versionInferred: row.version_inferred ?? false,
        metadataIncomplete: row.metadata_incomplete ?? false,
        xCorrect: row.x_correct ?? null,
        kTrials: row.k_trials ?? null,
        perTaskCounts: row.per_task_counts ?? null,
        uncertaintyType: row.uncertainty_type ?? null,
        uncertaintyValue: row.uncertainty_value ?? null,
        uncertaintyUnit: row.uncertainty_unit ?? null,
        nRuns: row.n_runs ?? null,
        runValues: row.run_values ?? null,
        costPerTask: row.cost_per_task ?? null,
        latencyS: row.latency_s ?? null,
        config: row.config,
        configHash: hash,
        observationKey,
        harness: row.harness ?? null,
        harnessClass: row.harness_class ?? null,
        effortTier: row.effort_tier ?? null,
        toolPolicy: row.tool_policy ?? null,
        observedOn: row.observed_on,
        url: row.url,
        metadata: { notes: row.notes ?? null, sample_only: row.sample_only },
      })
      .onConflictDoUpdate({
        target: results.observationKey,
        set: {
          score: row.score,
          scoreUnit: row.score_unit,
          provenance: row.provenance,
          se: row.se ?? null,
          nItems: row.n_items ?? null,
          kSamples: row.k_samples ?? null,
          benchmarkVersion: row.benchmark_version ?? null,
          graderVersion: row.grader_version ?? null,
          evaluationRunId: row.evaluation_run_id ?? null,
          lineageId: row.lineage_id ?? null,
          originProvenance: row.origin_provenance ?? null,
          hostSource: row.host_source ?? null,
          protocolId: row.protocol_id ?? null,
          versionInferred: row.version_inferred ?? false,
          metadataIncomplete: row.metadata_incomplete ?? false,
          xCorrect: row.x_correct ?? null,
          kTrials: row.k_trials ?? null,
          perTaskCounts: row.per_task_counts ?? null,
          uncertaintyType: row.uncertainty_type ?? null,
          uncertaintyValue: row.uncertainty_value ?? null,
          uncertaintyUnit: row.uncertainty_unit ?? null,
          nRuns: row.n_runs ?? null,
          runValues: row.run_values ?? null,
          costPerTask: row.cost_per_task ?? null,
          latencyS: row.latency_s ?? null,
          config: row.config,
          harness: row.harness ?? null,
          harnessClass: row.harness_class ?? null,
          effortTier: row.effort_tier ?? null,
          toolPolicy: row.tool_policy ?? null,
          observedOn: row.observed_on,
          url: row.url,
          metadata: { notes: row.notes ?? null, sample_only: row.sample_only },
        },
      });
  }

  for (const row of registry.manualSpeed.observations) {
    await db
      .insert(speed)
      .values({
        modelId: row.model_id,
        provider: row.provider,
        workload: row.workload,
        ttftS: row.ttft_s,
        tokensPerS: row.tokens_per_s,
        observedOn: row.observed_on,
        sourceId: "aa-speed-manual",
        redistributable: false,
      })
      .onConflictDoNothing();
  }

  return {
    models: registry.models.length,
    benchmarks: registry.benchmarks.length,
    sources: registry.sources.length,
    manualResults: manualResults.length,
    speed: registry.manualSpeed.observations.length,
  };
}

export interface PersistIngestSummary {
  benchmarkResults: number;
  pricing: number;
  skippedUnmapped: number;
  superseded: number;
}

export function resultGroupKey(record: Extract<RawResult, { record_type: "benchmark_result" }>): string {
  return stable({
    model: record.model_id,
    benchmark: record.benchmark_id,
  });
}

/** Persists resolved adapter output while retaining lower-provenance observations. */
export async function persistIngestRecords(
  db: DatabaseWriter,
  recordsToPersist: readonly RawResult[],
): Promise<PersistIngestSummary> {
  const mapped = recordsToPersist.filter((record) =>
    record.record_type === "pricing"
      ? record.model_id !== undefined
      : record.model_id !== undefined && record.benchmark_id !== undefined,
  );
  const benchmarkRecords = mapped.filter(
    (record): record is Extract<RawResult, { record_type: "benchmark_result" }> =>
      record.record_type === "benchmark_result" && record.model_id !== undefined && record.benchmark_id !== undefined,
  );
  const priceRecords = mapped.filter(
    (record): record is Extract<RawResult, { record_type: "pricing" }> =>
      record.record_type === "pricing" && record.model_id !== undefined,
  );

  const rowIds = new Map<string, string>();
  for (const row of benchmarkRecords) {
    const hash = configHash(row.config);
    const observationKey = resultObservationKey(row);
    const [saved] = await db
      .insert(results)
      .values({
        modelId: row.model_id!,
        benchmarkId: row.benchmark_id!,
        sourceId: row.source_id,
        score: row.score,
        scoreUnit: row.score_unit,
        provenance: row.provenance,
        se: row.se ?? null,
        nItems: row.n_items ?? null,
        kSamples: row.k_samples ?? null,
        benchmarkVersion: row.benchmark_version ?? null,
        graderVersion: row.grader_version ?? null,
        evaluationRunId: row.evaluation_run_id ?? null,
        lineageId: row.lineage_id ?? null,
        originProvenance: row.origin_provenance ?? null,
        hostSource: row.host_source ?? null,
        protocolId: row.protocol_id ?? null,
        versionInferred: row.version_inferred ?? false,
        metadataIncomplete: row.metadata_incomplete ?? false,
        xCorrect: row.x_correct ?? null,
        kTrials: row.k_trials ?? null,
        perTaskCounts: row.per_task_counts ?? null,
        uncertaintyType: row.uncertainty_type ?? null,
        uncertaintyValue: row.uncertainty_value ?? null,
        uncertaintyUnit: row.uncertainty_unit ?? null,
        nRuns: row.n_runs ?? null,
        runValues: row.run_values ?? null,
        costPerTask: row.cost_per_task ?? null,
        latencyS: row.latency_s ?? null,
        config: row.config,
        configHash: hash,
        observationKey,
        harness: row.harness ?? null,
        harnessClass: row.harness_class ?? null,
        effortTier: row.effort_tier ?? null,
        toolPolicy: row.tool_policy ?? null,
        observedOn: row.observed_on,
        url: row.source_url,
        metadata: row.metadata,
        supersededBy: null,
      })
      .onConflictDoUpdate({
        target: results.observationKey,
        set: {
          score: row.score,
          scoreUnit: row.score_unit,
          provenance: row.provenance,
          se: row.se ?? null,
          nItems: row.n_items ?? null,
          kSamples: row.k_samples ?? null,
          benchmarkVersion: row.benchmark_version ?? null,
          graderVersion: row.grader_version ?? null,
          evaluationRunId: row.evaluation_run_id ?? null,
          lineageId: row.lineage_id ?? null,
          originProvenance: row.origin_provenance ?? null,
          hostSource: row.host_source ?? null,
          protocolId: row.protocol_id ?? null,
          versionInferred: row.version_inferred ?? false,
          metadataIncomplete: row.metadata_incomplete ?? false,
          xCorrect: row.x_correct ?? null,
          kTrials: row.k_trials ?? null,
          perTaskCounts: row.per_task_counts ?? null,
          uncertaintyType: row.uncertainty_type ?? null,
          uncertaintyValue: row.uncertainty_value ?? null,
          uncertaintyUnit: row.uncertainty_unit ?? null,
          nRuns: row.n_runs ?? null,
          runValues: row.run_values ?? null,
          costPerTask: row.cost_per_task ?? null,
          latencyS: row.latency_s ?? null,
          config: row.config,
          harness: row.harness ?? null,
          harnessClass: row.harness_class ?? null,
          effortTier: row.effort_tier ?? null,
          toolPolicy: row.tool_policy ?? null,
          observedOn: row.observed_on,
          url: row.source_url,
          metadata: row.metadata,
          supersededBy: null,
        },
      })
      .returning({ id: results.id });
    if (saved) rowIds.set(observationKey, saved.id);
  }

  for (const row of priceRecords) {
    await db
      .insert(pricing)
      .values({
        modelId: row.model_id!,
        sourceId: row.source_id,
        provider: row.provider,
        inputPerM: row.input_per_million,
        outputPerM: row.output_per_million,
        cacheReadPerM: row.cache_read_per_million ?? null,
        cacheWritePerM: row.cache_write_per_million ?? null,
        contextLength: row.context_length ?? null,
        maxOutput: row.max_output ?? null,
        fetchedAt: new Date(row.fetched_at),
      })
      .onConflictDoUpdate({
        target: [pricing.modelId, pricing.provider],
        set: {
          sourceId: row.source_id,
          inputPerM: row.input_per_million,
          outputPerM: row.output_per_million,
          cacheReadPerM: row.cache_read_per_million ?? null,
          cacheWritePerM: row.cache_write_per_million ?? null,
          contextLength: row.context_length ?? null,
          maxOutput: row.max_output ?? null,
          fetchedAt: new Date(row.fetched_at),
        },
      });
  }

  const selection = selectPreferredResults(benchmarkRecords);
  const keptByGroup = new Map<string, string>();
  for (const record of selection.kept) {
    if (record.record_type !== "benchmark_result" || !record.model_id || !record.benchmark_id) continue;
    const id = rowIds.get(resultObservationKey(record));
    const groupKey = resultGroupKey(record);
    if (id && !keptByGroup.has(groupKey)) keptByGroup.set(groupKey, id);
  }
  let superseded = 0;
  for (const record of selection.superseded) {
    if (record.record_type !== "benchmark_result" || !record.model_id || !record.benchmark_id) continue;
    const rowId = rowIds.get(resultObservationKey(record));
    const parentId = keptByGroup.get(resultGroupKey(record));
    if (!rowId || !parentId) continue;
    await db.update(results).set({ supersededBy: parentId }).where(eq(results.id, rowId));
    superseded += 1;
  }

  return {
    benchmarkResults: benchmarkRecords.length,
    pricing: priceRecords.length,
    skippedUnmapped: recordsToPersist.length - mapped.length,
    superseded,
  };
}
