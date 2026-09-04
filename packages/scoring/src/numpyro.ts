import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Domain, IndexConfig } from "@actualanalysis/shared";
import { ACI_DOMAINS, type AciBenchmarkDefinition, type AciPreparation, type AciSystemDefinition, isFixedEffort, normalizedTier } from "./aci12.js";

export interface NutsDiagnostics {
  parameters: Record<string, { rhat: number | null; ess_bulk: number; ess_tail: number }>;
  divergences: number;
  divergence_fraction: number;
  ebfmi: number[];
  elapsed_seconds: number;
  posterior_draws: number;
  accepted: boolean;
  issues: string[];
}

export interface NutsRunResult {
  diagnostics: NutsDiagnostics;
  summary: Aci12PosteriorOutput;
  inputPath: string;
  posteriorPath: string;
  diagnosticsPath: string;
  summaryPath: string;
}

export interface Aci12PosteriorOutput {
  method_version: "1.2.2";
  scales?: {
    aci_g: { unit: string; description: string };
    aci_domain: { unit: string; description: string };
    aci_basket: { unit: string; description: string };
  };
  systems: Record<string, {
    model_id: string;
    profile: string;
    system_class?: "std-common" | "max-common" | string;
    raw: { median: number; low: number; high: number; sd: number; width: number };
    display: { median: number; low: number; high: number; sd: number; width: number };
    aci_g?: { median: number; low: number; high: number; sd: number; width: number };
    tier: "verified" | "ranked" | "provisional";
    evidence: Record<string, number | null>;
    domains: Record<string, {
      median: number;
      low: number;
      high: number;
      sd: number;
      width: number;
      published: boolean;
      extrapolated: boolean;
      r_s?: number;
      n_sk?: number;
    }>;
    baskets?: Record<string, {
      median: number;
      low: number;
      high: number;
      sd: number;
      width: number;
      published: boolean;
      missing_benchmarks: string[];
    }>;
    task_profiles: Record<string, {
      median: number;
      low: number;
      high: number;
      sd: number;
      width: number;
      published: boolean;
      missing_benchmarks: string[];
    }>;
  }>;
  views: Record<string, Record<string, {
    score: number | null;
    ci_low: number;
    ci_high: number;
    rank: number | null;
    rank_low: number | null;
    rank_high: number | null;
    rank_cdf: number[];
    top_k: Record<string, number>;
    pairwise: Record<string, number>;
    pairwise_unresolved?: Record<string, boolean>;
  }>>;
  benchmarks: Record<string, Record<string, number | boolean>>;
  cells: Array<Record<string, string | number | boolean>>;
  diagnostics?: Record<string, unknown>;
}

function primaryDomain(benchmark: AciBenchmarkDefinition): Domain {
  return benchmark.primaryDomain ?? ACI_DOMAINS.reduce((best, domain) =>
    (benchmark.domains[domain] ?? 0) > (benchmark.domains[best] ?? 0) ? domain : best,
  ACI_DOMAINS[0]!);
}

function runProcess(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ACI NumPyro runner exited ${code}: ${stderr.trim()}`)));
  });
}

export async function runAci12Nuts(options: {
  preparation: AciPreparation;
  systems: AciSystemDefinition[];
  benchmarks: AciBenchmarkDefinition[];
  config: IndexConfig;
  outputDirectory: string;
  seed?: number;
  progressBar?: boolean;
  requireAccepted?: boolean;
}): Promise<NutsRunResult> {
  const observedSystemIds = [...new Set(options.preparation.observations.map((row) => row.systemId))].sort();
  const modelIds = [...new Set(observedSystemIds.map((id) => id.slice(0, id.lastIndexOf("@"))))].sort();

  // Represented systems under 1.2.2:
  // - For fixed effort models: single system representing both classes, canonical id: `${id}@max-common`
  // - For variable effort models: `${id}@std-common` and `${id}@max-common`
  const representedSystemIds = modelIds.flatMap((id) => {
    const definition = options.systems.find((system) => system.modelSnapshotId === id);
    if (!definition) return [];
    if (isFixedEffort(definition)) {
      return [`${id}@max-common`];
    }
    const ids: string[] = [];
    if (definition.defaultEffortTier) ids.push(`${id}@std-common`);
    if (definition.maxEffortTier && normalizedTier(definition.maxEffortTier) !== normalizedTier(definition.defaultEffortTier)) {
      ids.push(`${id}@max-common`);
    }
    return ids;
  });

  const systemIndex = new Map(representedSystemIds.map((id, index) => [id, index]));
  const modelIndex = new Map(modelIds.map((id, index) => [id, index]));
  const representedBenchmarkIds = [...new Set(options.preparation.observations.map((row) => row.benchmarkId))].sort();
  const benchmarks = representedBenchmarkIds.map((id) => options.benchmarks.find((benchmark) => benchmark.id === id)!).filter(Boolean);
  const benchmarkIndex = new Map(benchmarks.map((benchmark, index) => [benchmark.id, index]));
  const familyIds = [...new Set(benchmarks.map((benchmark) => benchmark.familyId))].sort();
  const familyIndex = new Map(familyIds.map((id, index) => [id, index]));
  const cells = [...new Set(options.preparation.observations.map((row) => `${row.systemId}\0${row.benchmarkId}`))].sort();
  const cellIndex = new Map(cells.map((key, index) => [key, index]));

  // Protocols
  const protocolOf = (row: { protocolId?: string; sourceId: string }) => row.protocolId ?? row.sourceId;
  const protocolIds = [...new Set(options.preparation.observations.map(protocolOf))].sort();
  const protocolIndex = new Map(protocolIds.map((id, index) => [id, index]));
  const protocolIsSelfReport = protocolIds.map((pId) => {
    const sample = options.preparation.observations.find((r) => protocolOf(r) === pId);
    return sample?.originProvenance === "self_report";
  });

  const domainIndex = new Map(ACI_DOMAINS.map((domain, index) => [domain, index]));
  const estimateRhoByBenchmark = new Map(benchmarks.map((benchmark) => [
    benchmark.id,
    new Set(options.preparation.observations
      .filter((row) => row.benchmarkId === benchmark.id && row.perTaskCounts?.length)
      .map((row) => row.systemId)).size >= 5,
  ]));

  const data = {
    method_version: "1.2.2",
    n_models: modelIds.length,
    n_systems: representedSystemIds.length,
    n_benchmarks: benchmarks.length,
    n_families: familyIds.length,
    n_protocols: protocolIds.length,
    protocol_ids: protocolIds,
    protocol_is_self_report: protocolIsSelfReport,
    system_ids: representedSystemIds,
    benchmark_ids: benchmarks.map((benchmark) => benchmark.id),
    domains: ACI_DOMAINS,
    calibration_panel_system_ids: options.config.calibration_panel,
    tiers: options.config.tiers,
    profiles: options.config.profiles,
    system_training_cutoff: representedSystemIds.map((id) => {
      const def = options.systems.find((system) => system.modelSnapshotId === id.slice(0, id.lastIndexOf("@")));
      return def?.postTrainingFreeze ?? def?.trainingCutoff ?? null;
    }),
    benchmark_family_ids: benchmarks.map((benchmark) => benchmark.familyId),
    benchmark_holdout: benchmarks.map((benchmark) => benchmark.holdout),
    benchmark_public_release_date: benchmarks.map((benchmark) => benchmark.itemReleaseDate ?? benchmark.publicReleaseDate ?? null),
    system_model_index: representedSystemIds.map((id) => modelIndex.get(id.slice(0, id.lastIndexOf("@")))!),
    system_profile_index: representedSystemIds.map((id) => id.endsWith("@max-common") || id.endsWith("@max") ? 1 : 0),
    system_is_fixed_effort: representedSystemIds.map((id) => {
      const def = options.systems.find((system) => system.modelSnapshotId === id.slice(0, id.lastIndexOf("@")));
      return def ? isFixedEffort(def) : false;
    }),
    benchmark_family_index: benchmarks.map((benchmark) => familyIndex.get(benchmark.familyId)!),
    benchmark_domains: benchmarks.map((benchmark) => ACI_DOMAINS.map((domain) => benchmark.domains[domain] ?? 0)),
    cell_system_index: cells.map((key) => systemIndex.get(key.split("\0")[0]!)!),
    cell_benchmark_index: cells.map((key) => benchmarkIndex.get(key.split("\0")[1]!)!),
    benchmark_default_rho: benchmarks.map((benchmark) => benchmark.defaultRho ?? (primaryDomain(benchmark) === "agentic" ? options.config.likelihood.agentic_default_rho : options.config.likelihood.other_default_rho)),
    benchmark_estimate_rho: benchmarks.map((benchmark) => estimateRhoByBenchmark.get(benchmark.id) ?? false),
    observations: options.preparation.observations.map((row) => ({
      cell_index: cellIndex.get(`${row.systemId}\0${row.benchmarkId}`)!,
      protocol_index: protocolIndex.get(protocolOf(row))!,
      provenance_index: row.originProvenance === "self_report" ? 1 : 0,
      system_index: systemIndex.get(row.systemId)!,
      benchmark_index: benchmarkIndex.get(row.benchmarkId)!,
      domain_index: domainIndex.get(primaryDomain(row.benchmark))!,
      metadata_incomplete: row.metadataIncomplete,
      in_reference_component: row.inReferenceComponent ?? true,
      likelihood: row.likelihood,
      ...(row.y === undefined ? {} : { y: row.y }),
      ...(row.variance === undefined ? {} : { variance: row.variance }),
      ...(row.x === undefined ? {} : { x: row.x }),
      n_tasks: row.nTasks ?? row.benchmark.nTasks ?? 1,
      k_trials: row.kTrials ?? row.benchmark.defaultK ?? 1,
      per_task_counts: row.perTaskCounts ?? [],
      rho: row.rho ?? 0,
      use_beta_binomial: row.likelihood === "a_exact"
        && ((row.rho ?? 0) > 0 || (estimateRhoByBenchmark.get(row.benchmarkId) ?? false)),
      chance_level: row.benchmark.chanceLevel,
      ceiling: row.benchmark.ceiling,
    })),
    priors: options.config.priors,
    inference: options.config.inference,
    metadata_incomplete_multiplier: options.config.likelihood.metadata_incomplete_multiplier,
    seed: options.seed ?? 20260904,
    progress_bar: options.progressBar ?? false,
  };

  await mkdir(options.outputDirectory, { recursive: true });
  const inputPath = path.join(options.outputDirectory, "aci12-input.json");
  const diagnosticsPath = path.join(options.outputDirectory, "aci12-diagnostics.json");
  const posteriorPath = path.join(options.outputDirectory, "aci12-posterior.npz");
  const summaryPath = path.join(options.outputDirectory, "aci12-summary.json");
  await writeFile(inputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  const pythonRoot = fileURLToPath(new URL("../python/", import.meta.url));
  await runProcess("uv", ["run", "python", "-m", "aci12.runner", "--input", inputPath, "--output", diagnosticsPath, "--posterior", posteriorPath, "--summary", summaryPath], pythonRoot);
  const diagnostics = JSON.parse(await readFile(diagnosticsPath, "utf8")) as NutsDiagnostics;
  if ((options.requireAccepted ?? true) && !diagnostics.accepted) {
    throw new Error(`ACI 1.2.2 posterior failed convergence: ${diagnostics.issues.slice(0, 8).join("; ")}`);
  }
  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as Aci12PosteriorOutput;
  return { diagnostics, summary, inputPath, posteriorPath, diagnosticsPath, summaryPath };
}
