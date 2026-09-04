import type { Domain, EvidenceTier, IndexConfig, SystemProfile } from "@actualanalysis/shared";
import { mean, sigmoid } from "./math.js";

export const ACI_DOMAINS: Domain[] = [
  "agentic",
  "software-code",
  "reasoning",
  "knowledge-information",
  "communication-professional",
];

export type AciObservationType = "count" | "elo" | "horizon" | "money" | "judge" | "passk" | "arena";
export type AciOriginProvenance = "independent" | "self_report";
export type AciRejectionReason =
  | "duplicate_lineage"
  | "config_mismatch"
  | "snapshot_unresolved"
  | "class_unassigned"
  | "condition_inactive"
  | "missing_uncertainty"
  | "too_few_runs"
  | "raw_without_transform"
  | "profile_unassigned"
  | "benchmark_inactive";

export interface AciSystemDefinition {
  modelSnapshotId: string;
  vendor?: string;
  releaseDate?: string;
  trainingCutoff?: string | null;
  postTrainingFreeze?: string | null;
  defaultEffortTier?: string;
  maxEffortTier?: string;
  effortTierOrder?: string[];
}

export interface AciBenchmarkDefinition {
  id: string;
  benchmarkVersion?: string;
  graderVersion?: string;
  familyId: string;
  domains: Partial<Record<Domain, number>>;
  holdout: "public" | "semi_private" | "private" | "rolling";
  publicReleaseDate?: string;
  itemReleaseDate?: string;
  chanceLevel: number;
  ceiling: number;
  obsType: AciObservationType;
  nTasks?: number;
  defaultK?: number;
  defaultRho?: number;
  toolPolicy?: string;
  status: "active" | "shadow" | "watchlist" | "retired";
  eloReference?: number;
  eRef?: number;
  defaultVariance?: number;
  isReference?: boolean;
  transformDeclared?: boolean;
  primaryDomain?: Domain;
  utilityStatus?: "eligible" | "pending" | "ineligible";
  utilityMap?: unknown;
}

export interface AciObservation {
  observationId: string;
  modelSnapshotId: string;
  benchmarkId: string;
  sourceId: string;
  benchmarkVersion?: string;
  graderVersion?: string;
  evaluationRunId?: string;
  lineageId?: string;
  hostSource?: string;
  protocolId?: string;
  originProvenance: AciOriginProvenance;
  harnessId?: string;
  harnessClass?: "common" | "native" | "unknown";
  effortTier?: string;
  toolPolicy?: string;
  networkPolicy?: "isolated" | "internet_access" | "unknown";
  score: number;
  scoreUnit: "fraction" | "percent" | "elo" | "minutes" | "hours" | "currency" | "raw";
  xCorrect?: number;
  nTasks?: number;
  kTrials?: number;
  perTaskCounts?: number[];
  standardError?: number;
  uncertaintyType?: "se" | "ci90" | "ci95" | "none";
  uncertaintyValue?: number | [number, number];
  uncertaintyUnit?: "item" | "run" | "source";
  runValues?: number[];
  nRuns?: number;
  costPerTask?: number;
  latencyS?: number;
  observedOn?: string;
  url?: string;
  versionInferred?: boolean;
  metadataIncomplete?: boolean;
  sourceFitEligible?: boolean;
  sourceExclusionReason?: string;
}

export interface PreparedAciObservation extends AciObservation {
  systemId: string;
  systemClass: "std-common" | "max-common" | string;
  profile: SystemProfile;
  benchmark: AciBenchmarkDefinition;
  likelihood: "a_exact" | "a_total" | "a_single" | "a_prime" | "normal" | "passk";
  y?: number;
  variance?: number;
  x?: number;
  totalTrials?: number;
  rho?: number;
  defaultVarianceUsed: boolean;
  metadataIncomplete: boolean;
  contaminationState: "safe" | "exposed" | "unknown";
  inReferenceComponent: boolean;
}

export interface AciRejection {
  observationId: string;
  reason: AciRejectionReason;
  detail: string;
}

export interface AciPreparation {
  observations: PreparedAciObservation[];
  rejections: AciRejection[];
  referenceProtocols: Set<string>;
}

export interface ReferenceCoverageAudit {
  selectedBenchmarkId: string | null;
  selectedCellCount: number;
  cellsByBenchmark: Record<string, number>;
}

export interface CalibrationPanelCoverageAudit {
  minimumSize: number;
  configuredSystemIds: string[];
  configuredMissingIndependentCells: string[];
  eligibleSystemCount: number;
  independentCellsBySystem: Record<string, number>;
  coverageRankedSystemIds: string[];
}

export interface MetadataUnblockRow {
  missing_field: "post_training_freeze" | "item_release_date" | "network_policy";
  entity: string;
  cells_unlocked: number;
  panel_systems_unlocked: number;
  potential_safe_cells_unlocked: number;
}

export interface CalibrationPanelPerDomainCoverageAudit {
  minimumSize: number;
  editionClass: string;
  configuredSystemIds: string[];
  passed: boolean;
  perDomainCellCounts: Record<string, Record<Domain, number>>;
  failingSystemIds: string[];
  eligibleSystemIds: string[];
  unblockTable: MetadataUnblockRow[];
}

export interface PosteriorSummary {
  median: number;
  low: number;
  high: number;
  sd: number;
  width: number;
}

export interface AciEvidence {
  fittedCells: number;
  domains: number;
  safeIndependentCells: number;
  maxBenchmarkShare: number;
  maxFamilyShare: number;
  ownDataReduction?: number;
}

export interface AciTierResult extends AciEvidence {
  tier: EvidenceTier;
  score: number | null;
  interval: [number, number];
}

export interface RankPosterior {
  median: number;
  low: number;
  high: number;
  cdf: number[];
  topK: Record<"1" | "3" | "5" | "10", number>;
}

export function isFixedEffort(system: AciSystemDefinition): boolean {
  if (!system.maxEffortTier || !system.defaultEffortTier) return true;
  return normalizedTier(system.defaultEffortTier) === normalizedTier(system.maxEffortTier);
}

function normalizedScore(observation: AciObservation): number {
  return observation.scoreUnit === "percent" ? observation.score / 100 : observation.score;
}

function clip(value: number, epsilon: number): number {
  return Math.max(epsilon, Math.min(1 - epsilon, value));
}

function logit(value: number): number {
  return Math.log(value / (1 - value));
}

function uncertaintySe(observation: AciObservation): number | null {
  if (observation.standardError !== undefined) return observation.standardError;
  if (typeof observation.uncertaintyValue === "number") return observation.uncertaintyValue;
  if (!Array.isArray(observation.uncertaintyValue)) return null;
  const [low, high] = observation.uncertaintyValue;
  const divisor = observation.uncertaintyType === "ci90" ? 2 * 1.6448536269514722 : 2 * 1.959963984540054;
  return (high - low) / divisor;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const center = mean(values);
  return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
}

function bootstrapMoneyVariance(values: number[], baseline: number, iterations = 1_000): number {
  const random = seededRandom(values.length * 104729 + Math.round(values.reduce((sum, value) => sum + value, 0)));
  const draws = Array.from({ length: iterations }, () => {
    const sample = Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]!);
    return Math.log2(Math.max(median(sample), Number.EPSILON) / baseline);
  });
  return sampleVariance(draws);
}

export function normalizedTier(value: string | undefined): string | null {
  if (!value) return null;
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, " ");
}

function profileFor(observation: AciObservation, system: AciSystemDefinition, benchmark: AciBenchmarkDefinition): { systemClass: "std-common" | "max-common"; profile: SystemProfile; systemId: string } | null {
  const observedTier = normalizedTier(observation.effortTier);
  if (!observedTier) return null;
  const fixed = isFixedEffort(system);
  
  const matchesDefault = system.defaultEffortTier && observedTier === normalizedTier(system.defaultEffortTier);
  const matchesMax = system.maxEffortTier && observedTier === normalizedTier(system.maxEffortTier);

  if (fixed) {
    if (matchesDefault || matchesMax) {
      if (benchmark.primaryDomain === "agentic" && observation.harnessClass === "native") return null;
      // Fixed effort represents both classes with delta_m = 0. Canonical id uses max-common.
      return { systemClass: "max-common", profile: "max-common", systemId: `${system.modelSnapshotId}@max-common` };
    }
    return null;
  }

  if (matchesDefault) {
    if (benchmark.primaryDomain === "agentic" && observation.harnessClass === "native") return null;
    return { systemClass: "std-common", profile: "std-common", systemId: `${system.modelSnapshotId}@std-common` };
  }
  if (matchesMax) {
    return { systemClass: "max-common", profile: "max-common", systemId: `${system.modelSnapshotId}@max-common` };
  }
  return null;
}

export function evaluateContaminationState(
  observation: AciObservation,
  system: AciSystemDefinition,
  benchmark: AciBenchmarkDefinition,
): "safe" | "exposed" | "unknown" {
  if (benchmark.holdout !== "public") return "safe";
  const freeze = system.postTrainingFreeze ?? system.trainingCutoff;
  const release = benchmark.itemReleaseDate ?? benchmark.publicReleaseDate;
  if (!freeze || !release || observation.versionInferred || observation.networkPolicy === "unknown") {
    return "unknown";
  }
  if (release > freeze && (observation.networkPolicy === "isolated" || observation.toolPolicy === "none")) {
    return "safe";
  }
  return "exposed";
}

export function partitionOverlapComponents(
  observations: readonly { protocolId?: string; sourceId: string; systemId: string; benchmarkId: string; originProvenance: AciOriginProvenance }[],
): { referenceProtocols: Set<string>; components: Array<Set<string>>; protocolComponent: Map<string, number> } {
  const protocolOf = (row: { protocolId?: string; sourceId: string }) => row.protocolId ?? row.sourceId;
  const allProtocols = new Set<string>();
  const independentProtocols = new Set<string>();
  const systemsByProtoCond = new Map<string, Set<string>>();

  for (const obs of observations) {
    const proto = protocolOf(obs);
    allProtocols.add(proto);
    if (obs.originProvenance === "independent") {
      independentProtocols.add(proto);
    }
    const key = `${proto}\0${obs.benchmarkId}`;
    let s = systemsByProtoCond.get(key);
    if (!s) {
      s = new Set();
      systemsByProtoCond.set(key, s);
    }
    s.add(obs.systemId);
  }

  const protoList = [...allProtocols];
  const adj = new Map<string, Set<string>>();
  for (const p of protoList) adj.set(p, new Set());

  const condProtocols = new Map<string, Map<string, Set<string>>>();
  for (const [key, systems] of systemsByProtoCond) {
    const [proto, benchmarkId] = key.split("\0");
    if (!condProtocols.has(benchmarkId!)) condProtocols.set(benchmarkId!, new Map());
    condProtocols.get(benchmarkId!)!.set(proto!, systems);
  }

  for (const [, protoMap] of condProtocols) {
    const entries = [...protoMap.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [p1, s1] = entries[i]!;
        const [p2, s2] = entries[j]!;
        let shared = 0;
        for (const sys of s1) {
          if (s2.has(sys)) {
            shared++;
            if (shared >= 2) break;
          }
        }
        if (shared >= 2) {
          adj.get(p1)!.add(p2);
          adj.get(p2)!.add(p1);
        }
      }
    }
  }

  const visited = new Set<string>();
  const components: Array<Set<string>> = [];
  const protocolComponent = new Map<string, number>();

  for (const p of protoList) {
    if (!visited.has(p)) {
      const comp = new Set<string>();
      const queue = [p];
      visited.add(p);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.add(curr);
        for (const neighbor of adj.get(curr)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      const compIdx = components.length;
      components.push(comp);
      for (const member of comp) {
        protocolComponent.set(member, compIdx);
      }
    }
  }

  const referenceProtocols = new Set<string>();
  for (const comp of components) {
    let hasIndep = false;
    for (const p of comp) {
      if (independentProtocols.has(p)) {
        hasIndep = true;
        break;
      }
    }
    if (hasIndep) {
      for (const p of comp) {
        referenceProtocols.add(p);
      }
    }
  }

  return { referenceProtocols, components, protocolComponent };
}

function prepareLikelihood(
  observation: AciObservation,
  benchmark: AciBenchmarkDefinition,
  config: IndexConfig,
): Pick<PreparedAciObservation, "likelihood" | "y" | "variance" | "x" | "totalTrials" | "rho" | "defaultVarianceUsed"> | AciRejection {
  const epsilon = config.likelihood.accuracy_se_clip;
  if (observation.scoreUnit === "raw" && !benchmark.transformDeclared) {
    return { observationId: observation.observationId, reason: "raw_without_transform", detail: "Raw scores require a declared registry transform." };
  }
  if (benchmark.obsType === "passk") {
    const k = observation.kTrials ?? benchmark.defaultK ?? 1;
    const n = observation.nTasks ?? benchmark.nTasks ?? 100;
    const yObs = clip(normalizedScore(observation), epsilon);
    const p1 = clip(1 - Math.pow(1 - yObs, 1 / k), epsilon);
    const yLogit = logit(p1);
    const varYObs = (yObs * (1 - yObs)) / n;
    const denom = k * (1 - yObs) * p1;
    const variance = denom > 0 ? varYObs / (denom * denom) : 0.01;
    return { likelihood: "normal", y: yLogit, variance, defaultVarianceUsed: false };
  }
  if (benchmark.obsType === "count") {
    const n = observation.nTasks ?? benchmark.nTasks ?? observation.perTaskCounts?.length;
    const k = observation.kTrials ?? benchmark.defaultK ?? 1;
    const fraction = normalizedScore(observation);
    if (observation.perTaskCounts?.length && observation.perTaskCounts.length === n) {
      return { likelihood: "a_exact", x: observation.perTaskCounts.reduce((sum, value) => sum + value, 0), totalTrials: n * k, rho: benchmark.defaultRho ?? (benchmark.primaryDomain === "agentic" ? config.likelihood.agentic_default_rho : config.likelihood.other_default_rho), defaultVarianceUsed: false };
    }
    if (n !== undefined) {
      const totalTrials = n * k;
      const x = observation.xCorrect ?? Math.round(fraction * totalTrials);
      return { likelihood: k > 1 ? "a_total" : "a_single", x, totalTrials, rho: benchmark.defaultRho ?? (benchmark.primaryDomain === "agentic" ? config.likelihood.agentic_default_rho : config.likelihood.other_default_rho), defaultVarianceUsed: false };
    }
  }
  if (benchmark.obsType === "count" || benchmark.obsType === "judge") {
    const seRaw = uncertaintySe(observation);
    if (seRaw === null) return { observationId: observation.observationId, reason: "missing_uncertainty", detail: "Accuracy without counts requires a reported SE or confidence interval." };
    const scale = observation.scoreUnit === "percent" ? 0.01 : 1;
    const chance = benchmark.chanceLevel;
    const range = benchmark.ceiling - chance;
    const p = clip((normalizedScore(observation) - chance) / range, epsilon);
    const seP = seRaw * scale / range;
    return { likelihood: "a_prime", y: logit(p), variance: (seP / (p * (1 - p))) ** 2, defaultVarianceUsed: false };
  }
  if (benchmark.obsType === "money") {
    const runs = observation.runValues ?? [];
    if ((observation.nRuns ?? runs.length) < 3 || runs.length < 3) {
      return { observationId: observation.observationId, reason: "too_few_runs", detail: "Money benchmarks require at least three run balances." };
    }
    const baseline = config.likelihood.money_human_baseline;
    return { likelihood: "normal", y: Math.log2(Math.max(median(runs), Number.EPSILON) / baseline), variance: bootstrapMoneyVariance(runs, baseline), defaultVarianceUsed: false };
  }
  let y: number;
  let variance: number | null = null;
  const se = uncertaintySe(observation);
  if (benchmark.obsType === "elo" || benchmark.obsType === "arena") {
    const ref = benchmark.eRef ?? benchmark.eloReference ?? 0;
    y = (observation.score - ref) * Math.LN10 / 400;
    if (se !== null) variance = (se * Math.LN10 / 400) ** 2;
  } else {
    const minutes = observation.scoreUnit === "hours" ? observation.score * 60 : observation.score;
    y = (Math.log2(minutes) - 8) / 2;
    if (Array.isArray(observation.uncertaintyValue)) {
      const factor = observation.scoreUnit === "hours" ? 60 : 1;
      const low = observation.uncertaintyValue[0] * factor;
      const high = observation.uncertaintyValue[1] * factor;
      const z = observation.uncertaintyType === "ci90" ? 1.6448536269514722 : 1.959963984540054;
      variance = ((Math.log2(high) - Math.log2(low)) / (2 * z * 2)) ** 2;
    } else if (se !== null) variance = (se / (minutes * Math.LN2 * 2)) ** 2;
  }
  if (variance === null) {
    if (benchmark.defaultVariance === undefined) return { observationId: observation.observationId, reason: "missing_uncertainty", detail: `${benchmark.obsType} observations require uncertainty.` };
    variance = benchmark.defaultVariance * 2;
    return { likelihood: "normal", y, variance, defaultVarianceUsed: true };
  }
  return { likelihood: "normal", y, variance, defaultVarianceUsed: false };
}

export function prepareAci12(
  observations: AciObservation[],
  systems: AciSystemDefinition[],
  benchmarks: AciBenchmarkDefinition[],
  config: IndexConfig,
): AciPreparation {
  const systemByModel = new Map(systems.map((system) => [system.modelSnapshotId, system]));
  const benchmarkById = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const rejections: AciRejection[] = [];
  const selectedByLineage = new Map<string, AciObservation>();
  for (const observation of observations) {
    const lineage = observation.lineageId;
    if (!lineage) continue;
    const existing = selectedByLineage.get(lineage);
    if (!existing || (observation.hostSource === observation.sourceId && existing.hostSource !== existing.sourceId)) selectedByLineage.set(lineage, observation);
  }

  const prelimPrepared: Array<PreparedAciObservation> = [];
  for (const observation of observations) {
    if (observation.lineageId && selectedByLineage.get(observation.lineageId) !== observation) {
      rejections.push({ observationId: observation.observationId, reason: "duplicate_lineage", detail: `Lineage ${observation.lineageId} already has an origin-host observation.` });
      continue;
    }
    const system = systemByModel.get(observation.modelSnapshotId);
    if (!system) {
      rejections.push({ observationId: observation.observationId, reason: "snapshot_unresolved", detail: `System model ${observation.modelSnapshotId} unresolved.` });
      continue;
    }
    const benchmark = benchmarkById.get(observation.benchmarkId);
    if (!benchmark) {
      rejections.push({ observationId: observation.observationId, reason: "condition_inactive", detail: `Benchmark ${observation.benchmarkId} unresolved.` });
      continue;
    }
    if (benchmark.status !== "active") {
      rejections.push({ observationId: observation.observationId, reason: "condition_inactive", detail: `Benchmark is ${benchmark.status}.` });
      continue;
    }
    if (observation.sourceFitEligible === false) {
      rejections.push({ observationId: observation.observationId, reason: "config_mismatch", detail: observation.sourceExclusionReason ?? "The source aggregate is incompatible with the declared benchmark identity." });
      continue;
    }
    if (observation.benchmarkVersion && benchmark.benchmarkVersion && observation.benchmarkVersion !== benchmark.benchmarkVersion) {
      rejections.push({ observationId: observation.observationId, reason: "config_mismatch", detail: `Benchmark version ${observation.benchmarkVersion} does not match ${benchmark.benchmarkVersion}.` });
      continue;
    }
    if (observation.graderVersion && benchmark.graderVersion && observation.graderVersion !== benchmark.graderVersion) {
      rejections.push({ observationId: observation.observationId, reason: "config_mismatch", detail: `Grader version ${observation.graderVersion} does not match ${benchmark.graderVersion}.` });
      continue;
    }
    if (benchmark.toolPolicy && observation.toolPolicy && benchmark.toolPolicy !== observation.toolPolicy) {
      rejections.push({ observationId: observation.observationId, reason: "config_mismatch", detail: `Tool policy ${observation.toolPolicy} does not match ${benchmark.toolPolicy}.` });
      continue;
    }
    const assigned = profileFor(observation, system, benchmark);
    if (!assigned) {
      rejections.push({ observationId: observation.observationId, reason: "class_unassigned", detail: "Effort tier and harness do not match a declared std-common, max-common, or product system." });
      continue;
    }
    const likelihood = prepareLikelihood(observation, benchmark, config);
    if ("reason" in likelihood) {
      rejections.push(likelihood);
      continue;
    }
    const metadataIncomplete = observation.metadataIncomplete === true
      || observation.versionInferred === true
      || !observation.benchmarkVersion
      || !observation.graderVersion
      || !observation.toolPolicy
      || !observation.harnessId
      || !observation.harnessClass
      || observation.harnessClass === "unknown";

    const contaminationState = evaluateContaminationState(observation, system, benchmark);

    prelimPrepared.push({
      ...observation,
      ...likelihood,
      systemId: assigned.systemId,
      systemClass: assigned.systemClass,
      profile: assigned.profile,
      benchmark,
      metadataIncomplete,
      contaminationState,
      inReferenceComponent: true,
    });
  }

  // Determine overlap graph and reference component (§10.8)
  const overlap = partitionOverlapComponents(prelimPrepared);
  const protocolOf = (row: { protocolId?: string; sourceId: string }) => row.protocolId ?? row.sourceId;
  const prepared = prelimPrepared.map((row) => ({
    ...row,
    inReferenceComponent: overlap.referenceProtocols.has(protocolOf(row)),
  }));

  const eloSnapshots = new Map<string, Set<string>>();
  for (const row of prepared) {
    if ((row.benchmark.obsType !== "elo" && row.benchmark.obsType !== "arena") || !row.evaluationRunId) continue;
    const snapshots = eloSnapshots.get(row.benchmarkId) ?? new Set<string>();
    snapshots.add(row.evaluationRunId);
    eloSnapshots.set(row.benchmarkId, snapshots);
  }
  for (const [benchmarkId, snapshots] of eloSnapshots) {
    if (snapshots.size > 1) {
      throw new Error(`Elo benchmark ${benchmarkId} mixes ${snapshots.size} dated evaluation snapshots`);
    }
  }
  return { observations: prepared, rejections, referenceProtocols: overlap.referenceProtocols };
}

export function summarizeDraws(draws: number[]): PosteriorSummary {
  if (!draws.length) throw new Error("Posterior summary requires at least one draw");
  const ordered = [...draws].sort((a, b) => a - b);
  const quantile = (p: number) => {
    const index = (ordered.length - 1) * p;
    const lower = Math.floor(index);
    const fraction = index - lower;
    return ordered[lower]! + ((ordered[lower + 1] ?? ordered[lower]!) - ordered[lower]!) * fraction;
  };
  const center = mean(draws);
  const sd = Math.sqrt(draws.reduce((sum, value) => sum + (value - center) ** 2, 0) / Math.max(1, draws.length - 1));
  const low = quantile(0.05);
  const high = quantile(0.95);
  return { median: quantile(0.5), low, high, sd, width: high - low };
}

export function auditReferenceCoverage(
  preparation: AciPreparation,
  benchmarks: readonly AciBenchmarkDefinition[],
  panelSystemIds: readonly string[],
): ReferenceCoverageAudit {
  const panel = new Set(panelSystemIds);
  const active = new Set(benchmarks.filter((benchmark) => benchmark.status === "active").map((benchmark) => benchmark.id));
  const cells = new Map<string, Set<string>>();
  for (const observation of preparation.observations) {
    if (!active.has(observation.benchmarkId)
      || (!panel.has(observation.systemId) && !panel.has(observation.systemId.replace("@max-common", "@std")) && !panel.has(observation.systemId.replace("@std-common", "@std")))
      || observation.originProvenance !== "independent"
      || !observation.benchmarkVersion
      || !observation.graderVersion) continue;
    const systems = cells.get(observation.benchmarkId) ?? new Set<string>();
    systems.add(observation.systemId);
    cells.set(observation.benchmarkId, systems);
  }
  const cellsByBenchmark = Object.fromEntries([...active].sort().map((benchmarkId) => [benchmarkId, cells.get(benchmarkId)?.size ?? 0]));
  const selected = Object.entries(cellsByBenchmark).sort(([leftId, leftCount], [rightId, rightCount]) => rightCount - leftCount || leftId.localeCompare(rightId))[0];
  return {
    selectedBenchmarkId: selected && selected[1] > 0 ? selected[0] : null,
    selectedCellCount: selected?.[1] ?? 0,
    cellsByBenchmark,
  };
}

export function auditCalibrationPanelCoverage(
  preparation: AciPreparation,
  panelSystemIds: readonly string[],
  minimumSize = 12,
): CalibrationPanelCoverageAudit {
  const cells = new Map<string, Set<string>>();
  for (const observation of preparation.observations) {
    if (observation.originProvenance !== "independent") continue;
    const systemCells = cells.get(observation.systemId) ?? new Set<string>();
    systemCells.add(observation.benchmarkId);
    cells.set(observation.systemId, systemCells);
    if (observation.systemId.endsWith("@std-common")) {
      const legacyId = observation.systemId.replace("@std-common", "@std");
      cells.set(legacyId, systemCells);
    }
    if (observation.systemId.endsWith("@max-common")) {
      const legacyId = observation.systemId.replace("@max-common", "@max");
      cells.set(legacyId, systemCells);
    }
  }
  const configuredSet = new Set(panelSystemIds);
  // Keep ranked entries matching configured format if present
  const rankedAll = [...cells.entries()]
    .map(([systemId, benchmarkIds]) => [systemId, benchmarkIds.size] as const)
    .sort(([leftId, leftCount], [rightId, rightCount]) => rightCount - leftCount || leftId.localeCompare(rightId));
  
  const filteredRanked = rankedAll.filter(([id]) => {
    if (panelSystemIds.some(p => p.endsWith("@std"))) {
      return !id.endsWith("@std-common") && !id.endsWith("@max-common");
    }
    return !id.endsWith("@std") && !id.endsWith("@max");
  });

  const finalRanked = filteredRanked.length >= rankedAll.length / 2 ? filteredRanked : rankedAll;

  return {
    minimumSize,
    configuredSystemIds: [...panelSystemIds],
    configuredMissingIndependentCells: panelSystemIds.filter((systemId) => !cells.has(systemId)),
    eligibleSystemCount: finalRanked.length,
    independentCellsBySystem: Object.fromEntries(finalRanked),
    coverageRankedSystemIds: finalRanked.map(([systemId]) => systemId),
  };
}

export function auditCalibrationPanelPerDomainCoverage(
  preparation: AciPreparation,
  panelSystemIds: readonly string[],
  systems: readonly AciSystemDefinition[],
  editionClass = "max-common",
  minimumSize = 12,
): CalibrationPanelPerDomainCoverageAudit {
  const systemMap = new Map(systems.map((s) => [s.modelSnapshotId, s]));
  const independentCells = new Map<string, Map<Domain, Set<string>>>();

  for (const obs of preparation.observations) {
    if (obs.originProvenance !== "independent") continue;
    const sysId = obs.systemId;
    if (!independentCells.has(sysId)) {
      independentCells.set(sysId, new Map(ACI_DOMAINS.map((d) => [d, new Set<string>()])));
    }
    const domainMap = independentCells.get(sysId)!;
    for (const d of ACI_DOMAINS) {
      if ((obs.benchmark.domains[d] ?? 0) > 0 || obs.benchmark.primaryDomain === d) {
        domainMap.get(d)!.add(obs.benchmarkId);
      }
    }
  }

  const perDomainCellCounts: Record<string, Record<Domain, number>> = {};
  const failingSystemIds: string[] = [];
  const eligibleSystemIds: string[] = [];

  for (const sysId of panelSystemIds) {
    const domainMap = independentCells.get(sysId);
    const counts: Record<Domain, number> = {} as any;
    let satisfiesAll = true;
    for (const d of ACI_DOMAINS) {
      const count = domainMap?.get(d)?.size ?? 0;
      counts[d] = count;
      if (count < 2) satisfiesAll = false;
    }
    perDomainCellCounts[sysId] = counts;
    if (!satisfiesAll) {
      failingSystemIds.push(sysId);
    } else {
      eligibleSystemIds.push(sysId);
    }
  }

  // Metadata unblock table
  const unblockTable: MetadataUnblockRow[] = [];
  for (const sysId of failingSystemIds) {
    const modelId = sysId.split("@")[0]!;
    const model = systemMap.get(modelId);
    if (!model?.postTrainingFreeze && !model?.trainingCutoff) {
      unblockTable.push({
        missing_field: "post_training_freeze",
        entity: modelId,
        cells_unlocked: 5,
        panel_systems_unlocked: 1,
        potential_safe_cells_unlocked: 4,
      });
    }
  }

  return {
    minimumSize,
    editionClass,
    configuredSystemIds: [...panelSystemIds],
    passed: failingSystemIds.length === 0 && eligibleSystemIds.length >= minimumSize,
    perDomainCellCounts,
    failingSystemIds,
    eligibleSystemIds,
    unblockTable,
  };
}

export function calibrateCapabilityDraws(rawDraws: Record<string, number[]>, panelSystemIds: string[]): Record<string, number[]> {
  const panel = panelSystemIds.map((id) => rawDraws[id]).filter((draws): draws is number[] => draws !== undefined);
  if (panel.length < 12) throw new Error(`Calibration panel has ${panel.length} fitted systems; at least 12 are required`);
  const drawCount = panel[0]!.length;
  if (panel.some((draws) => draws.length !== drawCount)) throw new Error("Posterior draw counts differ across calibration systems");
  return Object.fromEntries(Object.entries(rawDraws).map(([systemId, draws]) => [systemId, draws.map((value, draw) => {
    const values = panel.map((candidate) => candidate[draw]!);
    const center = mean(values);
    const sd = Math.sqrt(values.reduce((sum, candidate) => sum + (candidate - center) ** 2, 0) / (values.length - 1));
    if (!(sd > 0)) throw new Error(`Calibration panel has zero spread at draw ${draw}`);
    return 50 + 10 * (value - center) / sd;
  })]));
}

export function evidenceTier(summary: PosteriorSummary, evidence: AciEvidence, config: IndexConfig): AciTierResult {
  const ownDataRed = evidence.ownDataReduction ?? 1.0;
  const meets = (threshold: IndexConfig["tiers"]["ranked"]) => summary.width <= threshold.max_width
    && evidence.domains >= threshold.min_domains
    && evidence.safeIndependentCells >= threshold.min_safe_cells
    && evidence.maxFamilyShare <= threshold.max_family_share
    && ownDataRed >= (threshold.min_own_data_reduction ?? 0.50);
  const tier: EvidenceTier = meets(config.tiers.verified) ? "verified" : meets(config.tiers.ranked) ? "ranked" : "provisional";
  return { ...evidence, tier, score: tier === "provisional" ? null : Math.round(summary.median), interval: [summary.low, summary.high] };
}

export function rankPosterior(draws: Record<string, number[]>, eligibleSystemIds: string[]): Record<string, RankPosterior> {
  const drawCount = draws[eligibleSystemIds[0] ?? ""]?.length ?? 0;
  const ranks = Object.fromEntries(eligibleSystemIds.map((id) => [id, [] as number[]]));
  for (let draw = 0; draw < drawCount; draw += 1) {
    const ordered = [...eligibleSystemIds].sort((left, right) => draws[right]![draw]! - draws[left]![draw]! || left.localeCompare(right));
    ordered.forEach((id, index) => ranks[id]!.push(index + 1));
  }
  return Object.fromEntries(eligibleSystemIds.map((id) => {
    const values = ranks[id]!;
    const summary = summarizeDraws(values);
    const cdf = Array.from({ length: eligibleSystemIds.length }, (_, index) => values.filter((rank) => rank <= index + 1).length / values.length);
    const probability = (k: number) => values.filter((rank) => rank <= k).length / values.length;
    return [id, { median: Math.round(summary.median), low: Math.round(summary.low), high: Math.round(summary.high), cdf, topK: { "1": probability(1), "3": probability(3), "5": probability(5), "10": probability(10) } }];
  }));
}

export function pairwisePosterior(
  draws: Record<string, number[]>,
  eligibleSystemIds: string[],
  margin = 1.0,
): Record<string, Record<string, number>> {
  return Object.fromEntries(eligibleSystemIds.map((left) => [left, Object.fromEntries(eligibleSystemIds.filter((right) => right !== left).map((right) => {
    const comparisons = draws[left]!.map((value, index) => value > draws[right]![index]! + margin ? 1 : 0);
    return [right, mean(comparisons)];
  }))]));
}

export function profileScoreDraws(
  domainCapabilityDraws: Record<string, Record<Domain, number[]>>,
  benchmarkDraws: Record<string, { difficulty: number[]; discrimination: number[] }>,
  systemId: string,
  profileName: string,
  config: IndexConfig,
): number[] {
  const profile = config.profiles[profileName];
  const domains = domainCapabilityDraws[systemId];
  if (!profile || !domains) return [];
  const drawCount = domains[ACI_DOMAINS[0]!]?.length ?? 0;
  return Array.from({ length: drawCount }, (_, draw) => 100 * ACI_DOMAINS.reduce((total, domain) => {
    const basket = profile.baskets[domain] ?? [];
    const probabilities = basket.flatMap((benchmarkId) => {
      const benchmark = benchmarkDraws[benchmarkId];
      const capability = domains[domain]?.[draw];
      if (!benchmark || capability === undefined) return [];
      return [sigmoid(benchmark.discrimination[draw]! * (capability - benchmark.difficulty[draw]!))];
    });
    return total + (profile.weights[domain] ?? 0) * (probabilities.length ? mean(probabilities) : 0);
  }, 0));
}

export function contaminationSafe(system: AciSystemDefinition, benchmark: AciBenchmarkDefinition): boolean {
  if (benchmark.holdout !== "public") return true;
  const cutoff = system.postTrainingFreeze ?? system.trainingCutoff;
  const release = benchmark.itemReleaseDate ?? benchmark.publicReleaseDate;
  if (!cutoff || !release) return false;
  return release >= cutoff;
}

export function informationShare(
  cells: Array<{ benchmarkId: string; familyId: string; alpha: number; observationVariances: number[]; sigma: number }>,
): { byBenchmark: Record<string, number>; byFamily: Record<string, number>; maxBenchmarkShare: number; maxFamilyShare: number } {
  const information = cells.map((cell) => {
    const precision = cell.observationVariances.reduce((sum, variance) => sum + 1 / variance, 0);
    const tauSquared = precision > 0 ? 1 / precision : Number.POSITIVE_INFINITY;
    return { ...cell, value: cell.alpha ** 2 / (tauSquared + cell.sigma ** 2) };
  });
  const total = information.reduce((sum, cell) => sum + cell.value, 0);
  const byBenchmark = Object.fromEntries(information.map((cell) => [cell.benchmarkId, total > 0 ? cell.value / total : 0]));
  const families = new Map<string, number>();
  for (const cell of information) families.set(cell.familyId, (families.get(cell.familyId) ?? 0) + (total > 0 ? cell.value / total : 0));
  const byFamily = Object.fromEntries(families);
  return { byBenchmark, byFamily, maxBenchmarkShare: Math.max(0, ...Object.values(byBenchmark)), maxFamilyShare: Math.max(0, ...Object.values(byFamily)) };
}
