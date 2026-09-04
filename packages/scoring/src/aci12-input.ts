import type { Benchmark, Domain, IndexConfig, Model } from "@actualanalysis/shared";
import { ACI_DOMAINS, prepareAci12, type AciBenchmarkDefinition, type AciObservation, type AciPreparation, type AciSystemDefinition } from "./aci12.js";

export interface Aci12RegistryResult {
  id?: string | undefined;
  model_id: string;
  benchmark_id: string;
  source_id: string;
  benchmark_version?: string | undefined;
  grader_version?: string | undefined;
  evaluation_run_id?: string | undefined;
  score: number;
  score_unit: AciObservation["scoreUnit"];
  provenance: "independent" | "mirror" | "self_report" | "manual";
  config?: Record<string, unknown> | undefined;
  se?: number | undefined;
  n_items?: number | undefined;
  k_trials?: number | undefined;
  x_correct?: number | undefined;
  per_task_counts?: number[] | undefined;
  uncertainty_type?: AciObservation["uncertaintyType"] | undefined;
  uncertainty_value?: AciObservation["uncertaintyValue"] | undefined;
  uncertainty_unit?: AciObservation["uncertaintyUnit"] | undefined;
  n_runs?: number | undefined;
  run_values?: number[] | undefined;
  cost_per_task?: number | undefined;
  latency_s?: number | undefined;
  harness?: string | undefined;
  harness_class?: AciObservation["harnessClass"] | undefined;
  effort_tier?: string | undefined;
  tool_policy?: string | undefined;
  network_policy?: AciObservation["networkPolicy"] | undefined;
  lineage_id?: string | undefined;
  host_source?: string | undefined;
  protocol_id?: string | undefined;
  version_inferred?: boolean | undefined;
  metadata_incomplete?: boolean | undefined;
  origin_provenance?: AciObservation["originProvenance"] | undefined;
  observed_on?: string | undefined;
  url?: string | undefined;
}

export interface CoercedAci12Input {
  systems: AciSystemDefinition[];
  benchmarks: AciBenchmarkDefinition[];
  observations: AciObservation[];
  preparation: AciPreparation;
  config: IndexConfig;
}

function categoryDomains(benchmark: Benchmark, config: IndexConfig): Partial<Record<Domain, number>> {
  if (benchmark.domains) {
    const declared = Object.fromEntries(ACI_DOMAINS.flatMap((domain) => benchmark.domains?.[domain] === undefined ? [] : [[domain, benchmark.domains[domain]]])) as Partial<Record<Domain, number>>;
    const total = Object.values(declared).reduce((sum, value) => sum + (value ?? 0), 0);
    if (Math.abs(total - 1) > 1e-9) throw new Error(`Benchmark ${benchmark.id} domain shares must sum to 1`);
    return declared;
  }
  const matched = ACI_DOMAINS.filter((domain) => benchmark.categories.some((category) => config.domains[domain]?.includes(category)));
  if (!matched.length) throw new Error(`Benchmark ${benchmark.id} has no category in taxonomy ${config.taxonomy_edition}`);
  return Object.fromEntries(matched.map((domain) => [domain, 1 / matched.length]));
}

function inferredFamily(id: string): string {
  for (const prefix of ["swe-bench", "terminal-bench", "arc-agi", "frontiermath", "livebench", "livecodebench", "metr-time-horizon", "vending-bench", "osworld"]) {
    if (id.startsWith(prefix)) return prefix;
  }
  return id;
}

function observationType(benchmark: Benchmark): AciBenchmarkDefinition["obsType"] {
  if (benchmark.obs_type) return benchmark.obs_type;
  if (benchmark.transform.type === "elo") return "elo";
  if (benchmark.transform.type === "metr_horizon") return "horizon";
  if (benchmark.transform.type === "log_relative") return "money";
  return "count";
}

function effortFrom(result: Aci12RegistryResult): string | undefined {
  if (result.effort_tier) return result.effort_tier;
  for (const key of ["reasoning_effort", "evaluation_profile", "effort_tier"]) {
    const value = result.config?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function toolPolicyFrom(result: Aci12RegistryResult): string | undefined {
  if (result.tool_policy) return result.tool_policy;
  const tools = result.config?.tools;
  if (tools === false) return "none";
  if (tools === true || (Array.isArray(tools) && tools.length > 0)) return "tools";
  return undefined;
}

function networkPolicyFrom(result: Aci12RegistryResult): AciObservation["networkPolicy"] {
  if (result.network_policy) return result.network_policy;
  const net = result.config?.network_policy ?? result.config?.network;
  if (net === "isolated" || net === false || net === "none") return "isolated";
  if (net === "internet_access" || net === true || net === "internet") return "internet_access";
  return "unknown";
}

function originProvenance(result: Aci12RegistryResult): AciObservation["originProvenance"] {
  if (result.origin_provenance) return result.origin_provenance;
  return result.provenance === "independent" ? "independent" : "self_report";
}

export function coerceAci12RegistryInput(payload: {
  models: Model[];
  benchmarks: Benchmark[];
  results: Aci12RegistryResult[];
  config: IndexConfig;
}): CoercedAci12Input {
  const systems: AciSystemDefinition[] = payload.models.map((model) => ({
    modelSnapshotId: model.id,
    vendor: model.organization,
    ...(model.release_date ? { releaseDate: model.release_date } : {}),
    ...(model.training_cutoff === undefined ? {} : { trainingCutoff: model.training_cutoff }),
    ...(model.post_training_freeze === undefined ? {} : { postTrainingFreeze: model.post_training_freeze }),
    ...(model.default_effort_tier ? { defaultEffortTier: model.default_effort_tier } : {}),
    ...(model.max_effort_tier ? { maxEffortTier: model.max_effort_tier } : {}),
    ...(model.effort_tier_order ? { effortTierOrder: model.effort_tier_order } : {}),
  }));
  const benchmarks: AciBenchmarkDefinition[] = payload.benchmarks.map((benchmark) => {
    const domains = categoryDomains(benchmark, payload.config);
    const primaryDomain = ACI_DOMAINS.reduce((best, domain) => (domains[domain] ?? 0) > (domains[best] ?? 0) ? domain : best, ACI_DOMAINS[0]!);
    return {
      id: benchmark.id,
      benchmarkVersion: benchmark.version,
      ...(benchmark.grader_version ? { graderVersion: benchmark.grader_version } : {}),
      familyId: benchmark.family_id ?? inferredFamily(benchmark.id),
      domains,
      primaryDomain,
      holdout: benchmark.holdout,
      ...(benchmark.public_release_date ? { publicReleaseDate: benchmark.public_release_date } : {}),
      ...(benchmark.item_release_date ? { itemReleaseDate: benchmark.item_release_date } : {}),
      chanceLevel: benchmark.chance_level,
      ceiling: benchmark.ceiling,
      obsType: observationType(benchmark),
      ...(benchmark.n_items ? { nTasks: benchmark.n_items } : {}),
      ...(benchmark.default_k ? { defaultK: benchmark.default_k } : {}),
      ...(benchmark.default_rho === undefined ? {} : { defaultRho: benchmark.default_rho }),
      ...(benchmark.tool_policy ? { toolPolicy: benchmark.tool_policy } : {}),
      status: benchmark.status,
      ...(benchmark.transform.type === "elo" ? { eloReference: benchmark.transform.reference_elo } : {}),
      ...(benchmark.E_ref !== undefined ? { eRef: benchmark.E_ref } : {}),
      ...(benchmark.default_variance ? { defaultVariance: benchmark.default_variance } : {}),
      isReference: benchmark.is_reference || benchmark.id === payload.config.reference_benchmark,
      transformDeclared: true,
      ...(benchmark.utility_status ? { utilityStatus: benchmark.utility_status } : {}),
      ...(benchmark.utility_map ? { utilityMap: benchmark.utility_map } : {}),
    };
  });
  const observations: AciObservation[] = payload.results.map((result, index) => {
    const effortTier = effortFrom(result);
    const toolPolicy = toolPolicyFrom(result);
    const networkPolicy = networkPolicyFrom(result);
    const kTrials = result.k_trials;
    return {
      observationId: result.id ?? `${result.model_id}:${result.benchmark_id}:${result.source_id}:${index}`,
      modelSnapshotId: result.model_id,
      benchmarkId: result.benchmark_id,
      sourceId: result.source_id,
      ...(result.benchmark_version ? { benchmarkVersion: result.benchmark_version } : {}),
      ...(result.grader_version ? { graderVersion: result.grader_version } : {}),
      ...(result.evaluation_run_id ? { evaluationRunId: result.evaluation_run_id } : {}),
      ...(result.lineage_id ? { lineageId: result.lineage_id } : {}),
      ...(result.host_source ? { hostSource: result.host_source } : {}),
      ...(result.protocol_id ? { protocolId: result.protocol_id } : {}),
      originProvenance: originProvenance(result),
      ...(result.harness ? { harnessId: result.harness } : {}),
      ...(result.harness_class ? { harnessClass: result.harness_class } : {}),
      ...(effortTier ? { effortTier } : {}),
      ...(toolPolicy ? { toolPolicy } : {}),
      ...(networkPolicy ? { networkPolicy } : {}),
      score: result.score,
      scoreUnit: result.score_unit,
      ...(result.x_correct === undefined ? {} : { xCorrect: result.x_correct }),
      ...(result.n_items ? { nTasks: result.n_items } : {}),
      ...(kTrials ? { kTrials } : {}),
      ...(result.per_task_counts ? { perTaskCounts: result.per_task_counts } : {}),
      ...(result.se === undefined ? {} : { standardError: result.se }),
      ...(result.uncertainty_type ? { uncertaintyType: result.uncertainty_type } : result.se === undefined ? {} : { uncertaintyType: "se" as const }),
      ...(result.uncertainty_value === undefined ? {} : { uncertaintyValue: result.uncertainty_value }),
      ...(result.uncertainty_unit ? { uncertaintyUnit: result.uncertainty_unit } : {}),
      ...(result.run_values ? { runValues: result.run_values } : {}),
      ...(result.n_runs ? { nRuns: result.n_runs } : {}),
      ...(result.cost_per_task === undefined ? {} : { costPerTask: result.cost_per_task }),
      ...(result.latency_s === undefined ? {} : { latencyS: result.latency_s }),
      ...(result.observed_on ? { observedOn: result.observed_on } : {}),
      ...(result.url ? { url: result.url } : {}),
      ...(result.version_inferred ? { versionInferred: true } : {}),
      ...(result.metadata_incomplete ? { metadataIncomplete: true } : {}),
      ...(result.config?.aci_fit_eligible === false ? { sourceFitEligible: false } : {}),
      ...(typeof result.config?.aci_exclusion_reason === "string" ? { sourceExclusionReason: result.config.aci_exclusion_reason } : {}),
    };
  });
  return { systems, benchmarks, observations, preparation: prepareAci12(observations, systems, benchmarks, payload.config), config: payload.config };
}
