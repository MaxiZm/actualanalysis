import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchJson } from "../lib/http.js";
import { booleanAt, numberAt, rowsFromUnknown, stringAt, type TabularRow } from "../lib/tabular.js";
import { benchmarkResult, dateOnly } from "./helpers.js";

export const ARC_MODELS_URL = "https://arcprize.org/media/data/models.json";
export const ARC_EVALUATIONS_URL = "https://arcprize.org/media/data/evaluations.json";
export const ARC_LEADERBOARD_URL = "https://arcprize.org/leaderboard";

const DATASETS: ReadonlyMap<string, {
  benchmark: string;
  benchmarkId: string;
  nItems?: number;
}> = new Map([
  ["v2_Semi_Private", { benchmark: "ARC-AGI-2 semi-private", benchmarkId: "arc-agi-2-semi-private", nItems: 120 }],
  ["v3_Semi_Private", { benchmark: "ARC-AGI-3", benchmarkId: "arc-agi-3" }],
] as const);

interface ArcIdentity {
  model: string;
  profile?: string;
  providerAdapter: boolean;
}

function arcModelIdentity(displayName: string): ArcIdentity {
  let model = displayName.trim();
  const providerAdapter = /\s+-\s+Provider Adapter(?=\s|$)/i.test(model);
  model = model.replace(/\s+-\s+Provider Adapter(?=\s|$)/i, "").trim();
  const suffix = /\s+\(([^)]+)\)$/.exec(model);
  const profile = suffix?.[1];
  let profileWasStripped = false;
  if (suffix && profile && /(?:^|[\s,])(?:none|minimal|low|medium|high|xhigh|max|refine\.?|think(?:ing)?|reasoning|effort|\d+k)(?:$|[\s,])/i.test(profile)) {
    model = model.slice(0, suffix.index).trim();
    profileWasStripped = true;
  }
  return {
    model,
    ...(profileWasStripped && profile ? { profile } : {}),
    providerAdapter,
  };
}

function modelMap(payload: unknown): Map<string, TabularRow> {
  const models = new Map<string, TabularRow>();
  for (const row of rowsFromUnknown(payload)) {
    const id = stringAt(row, ["id"]);
    if (id) models.set(id, row);
  }
  return models;
}

/** Joins ARC Prize's official model registry to its semi-private evaluation rows. */
export class ArcPrizeAdapter implements IngestAdapter {
  readonly id = "arcprize";
  readonly failSoft = true;

  constructor(
    private readonly modelsUrl = ARC_MODELS_URL,
    private readonly evaluationsUrl = ARC_EVALUATIONS_URL,
  ) {}

  async ingest(context: AdapterContext) {
    const modelsUrl = context.env.ACTUALANALYSIS_ARC_MODELS_URL ?? this.modelsUrl;
    const evaluationsUrl = context.env.ACTUALANALYSIS_ARC_EVALUATIONS_URL ?? this.evaluationsUrl;
    const warnings: AdapterWarning[] = [];
    const records: RawResult[] = [];

    const [modelsPayload, evaluationsPayload] = await Promise.all([
      fetchJson(context, modelsUrl),
      fetchJson(context, evaluationsUrl),
    ]);
    const models = modelMap(modelsPayload);
    const evaluations = rowsFromUnknown(evaluationsPayload);

    for (const evaluation of evaluations) {
      const datasetId = stringAt(evaluation, ["datasetId"]);
      const definition = datasetId ? DATASETS.get(datasetId) : undefined;
      if (!definition || booleanAt(evaluation, ["display"]) === false) continue;
      const rawModelId = stringAt(evaluation, ["modelId"]);
      const score = numberAt(evaluation, ["score"]);
      const modelRow = rawModelId ? models.get(rawModelId) : undefined;
      const displayName = modelRow ? stringAt(modelRow, ["displayName", "name"]) : undefined;
      if (!rawModelId || score === undefined || !displayName) {
        warnings.push({
          code: "partial",
          message: `Skipped ${datasetId ?? "unknown dataset"} evaluation without a joined model or finite score`,
          url: evaluationsUrl,
        });
        continue;
      }
      const identity = arcModelIdentity(displayName);
      const resultsUrl = stringAt(evaluation, ["resultsUrl"]);
      const costPerTask = numberAt(evaluation, ["costPerTask"]);
      records.push(benchmarkResult({
        model: identity.model,
        benchmark: definition.benchmark,
        benchmark_id: definition.benchmarkId,
        source_id: "arcprize",
        score,
        score_unit: "fraction",
        ...(definition.nItems ? { n_items: definition.nItems } : {}),
        ...(costPerTask !== undefined && costPerTask >= 0 ? { cost_per_task: costPerTask } : {}),
        ...(identity.profile ? { effort_tier: identity.profile } : {}),
        config: {
          arc_model_id: rawModelId,
          model_group: modelRow ? stringAt(modelRow, ["modelGroup"]) ?? null : null,
          model_type: modelRow ? stringAt(modelRow, ["modelType"]) ?? null : null,
          evaluation_profile: identity.profile ?? null,
          provider_adapter: identity.providerAdapter,
          data_subset: datasetId,
        },
        harness: identity.providerAdapter ? "ARC Prize provider-adapter harness" : "ARC Prize standard harness",
        observed_on: dateOnly(context.now()),
        source_url: ARC_LEADERBOARD_URL,
        provenance: "independent",
        metadata: {
          arc_model_id: rawModelId,
          reported_display_name: displayName,
          provider: modelRow ? stringAt(modelRow, ["providerId"]) ?? null : null,
          model_release_date: modelRow ? stringAt(modelRow, ["modelReleaseDate"])?.slice(0, 10) ?? null : null,
          results_url: resultsUrl ? new URL(resultsUrl, ARC_LEADERBOARD_URL).toString() : null,
          cost_usd: numberAt(evaluation, ["cost"]) ?? null,
          cost_per_task_usd: costPerTask ?? null,
        },
      }));
    }

    if (records.length === 0) warnings.push({
      code: "parse_failed",
      message: "ARC Prize model/evaluation datasets contained no joined semi-private leaderboard rows",
      url: evaluationsUrl,
    });
    return output(this.id, context, records, warnings);
  }
}
