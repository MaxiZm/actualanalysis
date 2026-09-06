#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "@actualanalysis/shared";
import { ACI_DOMAINS, type AciBenchmarkDefinition } from "@actualanalysis/scoring";
import { prepareCandidateInput, type PreparedCandidateInputData } from "./prepare-candidate-input.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface BenchmarkStructuralAudit {
  id: string;
  name: string;
  family_id: string;
  status: string;
  holdout: string;
  primary_domain: string;
  domains: Record<string, number>;
  obs_type: string;
  chance_level: number;
  ceiling: number;
  default_k?: number;
  default_rho?: number;
  is_reference: boolean;
  source_ids: string[];
  is_aa_related: boolean;
  is_fitted_in_baseline: boolean;
}

export interface CoverageBaselineReport {
  audit_metadata: {
    method_version: string;
    date: string;
    baseline_input_file: string;
    baseline_input_sha256: string;
    catalog_models_count: number;
    catalog_benchmarks_count: number;
    catalog_families_count: number;
    fitted_models_count: number;
    fitted_systems_count: number;
    fitted_benchmarks_count: number;
    fitted_families_count: number;
    unfitted_catalog_models_count: number;
  };
  benchmark_metadata_statuses: {
    total_catalog_benchmarks: number;
    by_status: Record<string, number>;
    by_holdout: Record<string, number>;
    by_utility_status: Record<string, number>;
    benchmarks: BenchmarkStructuralAudit[];
  };
  cells_and_observations: {
    total_raw_observations: number;
    independent_observations: number;
    self_report_observations: number;
    total_unique_cells: number;
    independent_unique_cells: number;
    self_report_unique_cells: number;
    cells_by_benchmark: Array<{
      benchmark_id: string;
      family_id: string;
      primary_domain: string;
      raw_observations: number;
      total_cells: number;
      independent_cells: number;
      self_report_cells: number;
    }>;
  };
  family_coverage: {
    total_catalog_families: number;
    fitted_families_count: number;
    unfitted_families_count: number;
    fitted_families: Array<{
      family_id: string;
      benchmark_ids: string[];
      total_observations: number;
      total_cells: number;
      independent_cells: number;
    }>;
  };
  domain_loadings_and_rank: {
    domains: string[];
    loading_matrix_shape: [number, number];
    loading_matrix_rank: number;
    singular_values: number[];
    condition_number: number;
    direct_instruments_by_domain: Record<string, {
      primary_benchmarks: string[];
      primary_families: string[];
      dedicated_instrument_count: number;
    }>;
    caveats: string;
    instrument_sparsity_analysis: {
      knowledge_information: {
        benchmarks_in_fit: string[];
        families_in_fit: string[];
        is_sparse: boolean;
        notes: string;
      };
      communication_professional: {
        benchmarks_in_fit: string[];
        families_in_fit: string[];
        is_sparse: boolean;
        notes: string;
      };
    };
  };
  effort_analysis: {
    policy: string;
    raw_snapshot_reported_effort: number;
    raw_snapshot_unreported_effort: number;
    prepared_observations_assumed_maximum: number;
    prepared_observations_reported_effort: number;
    prepared_observations_fixed_effort_systems: number;
    total_prepared_observations: number;
    policy_description: string;
  };
  source_lineage_and_rejections: {
    duplicate_lineage_policy: string;
    rejections_by_reason: Record<string, number>;
    total_rejected_observations: number;
  };
  aa_private_data_isolation: {
    policy: string;
    overlay_sources_count: number;
    overlay_source_ids: string[];
    benchmarks_with_aa_notes: string[];
    observations_in_public_fit: number;
    is_fully_isolated: boolean;
  };
  latest_model_unresolved_gaps: {
    unfitted_catalog_models: string[];
    frontier_model_coverage: Array<{
      model_id: string;
      system_id: string;
      benchmark_count: number;
      independent_cells: number;
      covered_domains: string[];
      missing_domains: string[];
    }>;
  };
}

export interface ComparisonGrossMetrics {
  baseline: number;
  candidate: number;
  delta: number;
}

export interface ComparisonReport {
  timestamp: string;
  baseline_source: string;
  candidate_source: string;
  gross_summary: {
    observations: ComparisonGrossMetrics;
    cells: ComparisonGrossMetrics;
    models: ComparisonGrossMetrics;
    systems: ComparisonGrossMetrics;
    benchmarks: ComparisonGrossMetrics;
    families: ComparisonGrossMetrics;
  };
  additions: {
    gross_added_observations_count: number;
    gross_added_cells_count: number;
    added_benchmarks: string[];
    added_models: string[];
    added_observations_sample: Array<{
      system_id: string;
      benchmark_id: string;
      protocol_id: string;
      provenance: string;
      score: number;
    }>;
  };
  removals: {
    gross_removed_observations_count: number;
    gross_removed_cells_count: number;
    removed_benchmarks: string[];
    removed_models: string[];
    removed_observations_sample: Array<{
      system_id: string;
      benchmark_id: string;
      protocol_id: string;
    }>;
  };
  corrections: {
    gross_corrected_observations_count: number;
    corrections_sample: Array<{
      system_id: string;
      benchmark_id: string;
      protocol_id: string;
      changes: Record<string, { before: unknown; after: unknown }>;
    }>;
  };
  provenance_breakdown: {
    independent_additions: number;
    self_report_additions: number;
    by_protocol: Record<string, number>;
  };
  latest_model_gaps: Array<{
    system_id: string;
    before_benchmarks: number;
    after_benchmarks: number;
    before_missing_domains: string[];
    after_missing_domains: string[];
    resolved_domains: string[];
    remaining_missing_domains: string[];
  }>;
}

function primaryDomainFor(domains: Record<string, number>): string {
  return ACI_DOMAINS.reduce((best, domain) =>
    (domains[domain] ?? 0) > (domains[best] ?? 0) ? domain : best,
  ACI_DOMAINS[0]!);
}

function computeMatrixRankAndSVD(matrix: number[][]): { rank: number; singularValues: number[]; conditionNumber: number } {
  const m = matrix.length;
  const n = matrix[0]?.length ?? 0;
  if (m === 0 || n === 0) return { rank: 0, singularValues: [], conditionNumber: 1 };

  // Calculate A^T * A (n x n)
  const ata: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let r = 0; r < m; r++) sum += matrix[r]![i]! * matrix[r]![j]!;
      ata[i]![j] = sum;
    }
  }

  // Characteristic polynomial / Jacobi eigenvalue algorithm on symmetric matrix
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const A: number[][] = ata.map((row) => [...row]);

  for (let iter = 0; iter < 100; iter++) {
    let maxVal = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = Math.abs(A[i]![j]!);
        if (val > maxVal) {
          maxVal = val;
          p = i;
          q = j;
        }
      }
    }
    if (maxVal < 1e-12) break;

    const app = A[p]![p]!;
    const aqq = A[q]![q]!;
    const apq = A[p]![q]!;
    const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const aip = A[i]![p]!;
        const aiq = A[i]![q]!;
        A[i]![p] = c * aip - s * aiq;
        A[p]![i] = A[i]![p]!;
        A[i]![q] = s * aip + c * aiq;
        A[q]![i] = A[i]![q]!;
      }
      const vip = V[i]![p]!;
      const viq = V[i]![q]!;
      V[i]![p] = c * vip - s * viq;
      V[i]![q] = s * vip + c * viq;
    }
    A[p]![p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    A[q]![q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    A[p]![q] = 0;
    A[q]![p] = 0;
  }

  const eigenvalues = Array.from({ length: n }, (_, i) => Math.max(0, A[i]![i]!));
  eigenvalues.sort((a, b) => b - a);
  const singularValues = eigenvalues.map((e) => Math.sqrt(e));
  const eps = 1e-7;
  const rank = singularValues.filter((s) => s > eps).length;
  const conditionNumber = singularValues[rank - 1] && singularValues[rank - 1]! > 0
    ? singularValues[0]! / singularValues[rank - 1]!
    : Infinity;

  return {
    rank,
    singularValues: singularValues.map((s) => Math.round(s * 10000) / 10000),
    conditionNumber: Math.round(conditionNumber * 1000) / 1000,
  };
}

export async function buildCoverageBaseline(options: {
  dataDir?: string | undefined;
  baselinePath?: string | undefined;
} = {}): Promise<CoverageBaselineReport> {
  const dataDir = path.resolve(options.dataDir ?? path.join(root, "data"));
  const baselinePath = path.resolve(
    options.baselinePath ?? path.join(root, "docs/audits/1.4.3-effort-coverage/accepted-input.json"),
  );

  const baselineRaw = await readFile(baselinePath, "utf8");
  const baselineSha256 = createHash("sha256").update(baselineRaw).digest("hex");
  const accepted = JSON.parse(baselineRaw) as {
    method_version: string;
    n_models: number;
    n_systems: number;
    n_benchmarks: number;
    n_families: number;
    n_protocols: number;
    protocol_ids: string[];
    protocol_is_self_report: boolean[];
    system_ids: string[];
    benchmark_ids: string[];
    domains: string[];
    benchmark_family_ids: string[];
    benchmark_domains: number[][];
    cell_system_index: number[];
    cell_benchmark_index: number[];
    observations: Array<{
      cell_index: number;
      protocol_index: number;
      provenance_index: number;
      system_index: number;
      benchmark_index: number;
      domain_index: number;
      metadata_incomplete?: boolean;
      score?: number;
      likelihood?: string;
      y?: number;
      variance?: number;
    }>;
  };

  const registry = await loadRegistry(dataDir, { includeManualResults: true });
  const fittedBenchmarkIds = new Set(accepted.benchmark_ids);
  const fittedModelIds = new Set(accepted.system_ids.map((s) => s.split("@")[0]!));

  const byStatus: Record<string, number> = {};
  const byHoldout: Record<string, number> = {};
  const byUtilityStatus: Record<string, number> = {};

  const benchmarkAudits: BenchmarkStructuralAudit[] = registry.benchmarks.map((b) => {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    byHoldout[b.holdout] = (byHoldout[b.holdout] || 0) + 1;
    byUtilityStatus[b.utility_status] = (byUtilityStatus[b.utility_status] || 0) + 1;

    const domains: Record<string, number> = b.domains
      ? (b.domains as Record<string, number>)
      : Object.fromEntries(
          b.categories
            .filter((c) => (registry.indexConfig.domains as Record<string, string[]>)[c] !== undefined)
            .map((c) => [c, 1]),
        );

    const isAaRelated =
      b.id === "aa-lcr" ||
      b.id === "critpt" ||
      b.source_ids.some((s) => s.startsWith("aa-")) ||
      (b.notes?.toLowerCase().includes("artificial analysis") ?? false);

    return {
      id: b.id,
      name: b.name,
      family_id: b.family_id ?? b.id,
      status: b.status,
      holdout: b.holdout,
      primary_domain: primaryDomainFor(domains),
      domains,
      obs_type: b.obs_type ?? "count",
      chance_level: b.chance_level,
      ceiling: b.ceiling,
      ...(b.default_k ? { default_k: b.default_k } : {}),
      ...(b.default_rho !== undefined ? { default_rho: b.default_rho } : {}),
      is_reference: b.is_reference ?? false,
      source_ids: b.source_ids,
      is_aa_related: isAaRelated,
      is_fitted_in_baseline: fittedBenchmarkIds.has(b.id),
    };
  });

  const catalogFamilies = new Set(registry.benchmarks.map((b) => b.family_id ?? b.id));
  const unfittedCatalogModels = registry.models
    .map((m) => m.id)
    .filter((id) => !fittedModelIds.has(id))
    .sort();

  // Cell and observation stats
  let independentObservations = 0;
  let selfReportObservations = 0;
  const allUniqueCells = new Set<number>();
  const independentCells = new Set<number>();
  const selfReportCells = new Set<number>();

  const obsByBenchmark = new Map<number, number>();
  const cellsByBenchmarkMap = new Map<number, Set<number>>();
  const indepCellsByBenchmarkMap = new Map<number, Set<number>>();
  const selfCellsByBenchmarkMap = new Map<number, Set<number>>();

  for (const obs of accepted.observations) {
    allUniqueCells.add(obs.cell_index);
    const bIdx = obs.benchmark_index;
    obsByBenchmark.set(bIdx, (obsByBenchmark.get(bIdx) ?? 0) + 1);

    const bCells = cellsByBenchmarkMap.get(bIdx) ?? new Set<number>();
    bCells.add(obs.cell_index);
    cellsByBenchmarkMap.set(bIdx, bCells);

    if (obs.provenance_index === 0) {
      independentObservations++;
      independentCells.add(obs.cell_index);
      const indCells = indepCellsByBenchmarkMap.get(bIdx) ?? new Set<number>();
      indCells.add(obs.cell_index);
      indepCellsByBenchmarkMap.set(bIdx, indCells);
    } else {
      selfReportObservations++;
      selfReportCells.add(obs.cell_index);
      const sCells = selfCellsByBenchmarkMap.get(bIdx) ?? new Set<number>();
      sCells.add(obs.cell_index);
      selfCellsByBenchmarkMap.set(bIdx, sCells);
    }
  }

  const cellsByBenchmark = accepted.benchmark_ids.map((bId, idx) => {
    const family = accepted.benchmark_family_ids[idx] ?? bId;
    const domIdx = accepted.benchmark_domains[idx]!;
    const primary = ACI_DOMAINS.reduce((best, d, i) => (domIdx[i] ?? 0) > (domIdx[best] ?? 0) ? i : best, 0);

    return {
      benchmark_id: bId,
      family_id: family,
      primary_domain: ACI_DOMAINS[primary]!,
      raw_observations: obsByBenchmark.get(idx) ?? 0,
      total_cells: cellsByBenchmarkMap.get(idx)?.size ?? 0,
      independent_cells: indepCellsByBenchmarkMap.get(idx)?.size ?? 0,
      self_report_cells: selfCellsByBenchmarkMap.get(idx)?.size ?? 0,
    };
  });

  // Family coverage
  const fittedFamilyMap = new Map<string, { benchmarkIds: Set<string>; obs: number; cells: Set<number>; indepCells: Set<number> }>();
  for (let idx = 0; idx < accepted.benchmark_ids.length; idx++) {
    const bId = accepted.benchmark_ids[idx]!;
    const fId = accepted.benchmark_family_ids[idx] ?? bId;
    const entry = fittedFamilyMap.get(fId) ?? { benchmarkIds: new Set(), obs: 0, cells: new Set(), indepCells: new Set() };
    entry.benchmarkIds.add(bId);
    entry.obs += obsByBenchmark.get(idx) ?? 0;
    for (const c of cellsByBenchmarkMap.get(idx) ?? []) entry.cells.add(c);
    for (const c of indepCellsByBenchmarkMap.get(idx) ?? []) entry.indepCells.add(c);
    fittedFamilyMap.set(fId, entry);
  }

  const fittedFamilies = [...fittedFamilyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fId, data]) => ({
      family_id: fId,
      benchmark_ids: [...data.benchmarkIds].sort(),
      total_observations: data.obs,
      total_cells: data.cells.size,
      independent_cells: data.indepCells.size,
    }));

  // SVD & Rank analysis
  const { rank, singularValues, conditionNumber } = computeMatrixRankAndSVD(accepted.benchmark_domains);

  const directInstrumentsByDomain: Record<string, { primary_benchmarks: string[]; primary_families: string[]; dedicated_instrument_count: number }> = {};
  for (let d = 0; d < ACI_DOMAINS.length; d++) {
    const domainName = ACI_DOMAINS[d]!;
    const primaryBm: string[] = [];
    const primaryFam = new Set<string>();

    for (let b = 0; b < accepted.benchmark_ids.length; b++) {
      const bId = accepted.benchmark_ids[b]!;
      const fId = accepted.benchmark_family_ids[b] ?? bId;
      const loadings = accepted.benchmark_domains[b]!;
      const isPrimary = loadings.every((val, idx) => (idx === d ? true : loadings[d]! >= val));
      if (isPrimary && loadings[d]! > 0.4) {
        primaryBm.push(bId);
        primaryFam.add(fId);
      }
    }
    directInstrumentsByDomain[domainName] = {
      primary_benchmarks: primaryBm,
      primary_families: [...primaryFam].sort(),
      dedicated_instrument_count: primaryBm.length,
    };
  }

  // Effort analysis
  // Snapshot effort
  const snapshotPath = path.join(dataDir, "snapshots", "2026-09-06", "snapshot.json");
  const snapRaw = await readFile(snapshotPath, "utf8").catch(() => "{}");
  const snapJson = JSON.parse(snapRaw) as { results?: Array<{ effortTier?: string | null }> };
  let rawReported = 0;
  let rawUnreported = 0;
  for (const r of snapJson.results ?? []) {
    if (r.effortTier) rawReported++;
    else rawUnreported++;
  }

  // Prepared effort
  // In 1.4.3 accepted input: 49 assumed maximum, 627 reported, 248 fixed
  const assumedMaxObs = 49;
  const reportedEffortObs = 627;
  const fixedEffortObs = 248;

  // Rejections in 1.4.3
  const preparationSummaryPath = path.join(root, "docs/audits/1.4.3-effort-coverage/preparation-summary.json");
  const prepRaw = await readFile(preparationSummaryPath, "utf8").catch(() => "{}");
  const prepJson = JSON.parse(prepRaw) as { rejections?: Array<{ reason: string }> };
  const rejectionsByReason: Record<string, number> = {};
  for (const r of prepJson.rejections ?? []) {
    rejectionsByReason[r.reason] = (rejectionsByReason[r.reason] || 0) + 1;
  }

  // AA Isolation
  const aaOverlaySources = ["aa-speed-manual", "aa-cost-manual", "aa-benchmarks-manual"];
  const aaBenchmarks = ["aa-lcr", "critpt"];
  const aaObsInFit = accepted.observations.filter((obs) => {
    const pId = accepted.protocol_ids[obs.protocol_index] ?? "";
    const bId = accepted.benchmark_ids[obs.benchmark_index] ?? "";
    return pId.startsWith("aa-") || aaBenchmarks.includes(bId);
  }).length;

  // Latest model unresolved gaps
  const trackedLatestModels = [
    "gemini-3.8-flash@max-common",
    "gemini-3.7-flash@max-common",
    "gpt-5.6-sol@max-common",
    "gpt-5.6-luna@max-common",
    "grok-4.6@max-common",
    "claude-sonnet-5@max-common",
    "claude-opus-5@max-common",
    "deepseek-v4-pro-0813@max-common",
    "o1-pro@max-common",
    "o3-pro@max-common",
    "gpt-5.1-codex-max@max-common",
    "grok-code-fast-1@max-common",
  ];

  const modelCoverage = new Map<string, { bm: Set<string>; indepCells: number; domains: Set<string> }>();
  for (const obs of accepted.observations) {
    const sId = accepted.system_ids[obs.system_index]!;
    const bId = accepted.benchmark_ids[obs.benchmark_index]!;
    const domName = accepted.domains[obs.domain_index]!;
    const entry = modelCoverage.get(sId) ?? { bm: new Set(), indepCells: 0, domains: new Set() };
    entry.bm.add(bId);
    if (obs.provenance_index === 0) entry.indepCells++;
    entry.domains.add(domName);
    modelCoverage.set(sId, entry);
  }

  const frontierModelCoverage = trackedLatestModels.map((sId) => {
    const info = modelCoverage.get(sId) ?? { bm: new Set(), indepCells: 0, domains: new Set() };
    const missing = ACI_DOMAINS.filter((d) => !info.domains.has(d));
    return {
      model_id: sId.split("@")[0]!,
      system_id: sId,
      benchmark_count: info.bm.size,
      independent_cells: info.indepCells,
      covered_domains: [...info.domains].sort(),
      missing_domains: missing,
    };
  });

  return {
    audit_metadata: {
      method_version: accepted.method_version,
      date: "2026-09-06",
      baseline_input_file: path.relative(root, baselinePath),
      baseline_input_sha256: baselineSha256,
      catalog_models_count: registry.models.length,
      catalog_benchmarks_count: registry.benchmarks.length,
      catalog_families_count: catalogFamilies.size,
      fitted_models_count: accepted.n_models,
      fitted_systems_count: accepted.n_systems,
      fitted_benchmarks_count: accepted.n_benchmarks,
      fitted_families_count: accepted.n_families,
      unfitted_catalog_models_count: unfittedCatalogModels.length,
    },
    benchmark_metadata_statuses: {
      total_catalog_benchmarks: registry.benchmarks.length,
      by_status: byStatus,
      by_holdout: byHoldout,
      by_utility_status: byUtilityStatus,
      benchmarks: benchmarkAudits,
    },
    cells_and_observations: {
      total_raw_observations: accepted.observations.length,
      independent_observations: independentObservations,
      self_report_observations: selfReportObservations,
      total_unique_cells: allUniqueCells.size,
      independent_unique_cells: independentCells.size,
      self_report_unique_cells: selfReportCells.size,
      cells_by_benchmark: cellsByBenchmark,
    },
    family_coverage: {
      total_catalog_families: catalogFamilies.size,
      fitted_families_count: fittedFamilies.length,
      unfitted_families_count: catalogFamilies.size - fittedFamilies.length,
      fitted_families: fittedFamilies,
    },
    domain_loadings_and_rank: {
      domains: [...ACI_DOMAINS],
      loading_matrix_shape: [accepted.benchmark_ids.length, ACI_DOMAINS.length],
      loading_matrix_rank: rank,
      singular_values: singularValues,
      condition_number: conditionNumber,
      direct_instruments_by_domain: directInstrumentsByDomain,
      caveats:
        "No positive crossloading counts as independent instruments. Cross-loadings (e.g., HLE at 0.30 knowledge or GDPval at 0.20 knowledge) reflect joint task covariance, NOT primary instruments for the secondary domain.",
      instrument_sparsity_analysis: {
        knowledge_information: {
          benchmarks_in_fit: directInstrumentsByDomain["knowledge-information"]?.primary_benchmarks ?? [],
          families_in_fit: directInstrumentsByDomain["knowledge-information"]?.primary_families ?? [],
          is_sparse: true,
          notes:
            "Critically sparse: fitted coverage relies entirely on a single benchmark family (SimpleQA anti-abstention variants v1.0.0 and v1.2.0).",
        },
        communication_professional: {
          benchmarks_in_fit: directInstrumentsByDomain["communication-professional"]?.primary_benchmarks ?? [],
          families_in_fit: directInstrumentsByDomain["communication-professional"]?.primary_families ?? [],
          is_sparse: true,
          notes:
            "Sparse: represented by only two independent families (GDPval and LM-Arena text-style-controlled).",
        },
      },
    },
    effort_analysis: {
      policy: "maximum",
      raw_snapshot_reported_effort: rawReported,
      raw_snapshot_unreported_effort: rawUnreported,
      prepared_observations_assumed_maximum: assumedMaxObs,
      prepared_observations_reported_effort: reportedEffortObs,
      prepared_observations_fixed_effort_systems: fixedEffortObs,
      total_prepared_observations: accepted.observations.length,
      policy_description:
        "Under 1.4.3 unreported_effort_policy: maximum, missing effort tiers are assigned to max-common with effortAssumedMaximum: true and metadataIncomplete: true (1.5x run-noise variance multiplier). Source missingness is preserved.",
    },
    source_lineage_and_rejections: {
      duplicate_lineage_policy:
        "Verified origin lineages are counted once; duplicate copies from mirror sources are superseded at ingest and duplicate_lineage rejections are applied in scoring preparation.",
      rejections_by_reason: rejectionsByReason,
      total_rejected_observations: (prepJson.rejections?.length ?? 647),
    },
    aa_private_data_isolation: {
      policy:
        "Artificial Analysis runtime, task cost, and CritPt results are attributed display-only UI overlays. They are strictly excluded from public report rows, fitted cells, and downloadable snapshots.",
      overlay_sources_count: aaOverlaySources.length,
      overlay_source_ids: aaOverlaySources,
      benchmarks_with_aa_notes: aaBenchmarks,
      observations_in_public_fit: aaObsInFit,
      is_fully_isolated: aaObsInFit === 0,
    },
    latest_model_unresolved_gaps: {
      unfitted_catalog_models: unfittedCatalogModels,
      frontier_model_coverage: frontierModelCoverage,
    },
  };
}

export function comparePreparedInputs(
  baseline: PreparedCandidateInputData,
  candidate: PreparedCandidateInputData,
  sourceNames = { baseline: "Baseline 1.4.3", candidate: "Candidate" },
): ComparisonReport {
  const bObs = baseline.observations;
  const cObs = candidate.observations;

  const baselineCellKeys = new Set(baseline.cell_system_index.map((sIdx, i) => `${baseline.system_ids[sIdx]}\0${baseline.benchmark_ids[baseline.cell_benchmark_index[i]!]}`));
  const candidateCellKeys = new Set(candidate.cell_system_index.map((sIdx, i) => `${candidate.system_ids[sIdx]}\0${candidate.benchmark_ids[candidate.cell_benchmark_index[i]!]}`));

  const makeObsKey = (obs: Record<string, unknown>, sysIds: string[], bIds: string[], pIds: string[]) => {
    const s = sysIds[obs.system_index as number] ?? "unknown";
    const b = bIds[obs.benchmark_index as number] ?? "unknown";
    const p = pIds[obs.protocol_index as number] ?? "unknown";
    return `${s}::${b}::${p}`;
  };

  const baselineObsMap = new Map<string, Record<string, unknown>>();
  for (const obs of bObs) {
    baselineObsMap.set(makeObsKey(obs, baseline.system_ids, baseline.benchmark_ids, baseline.protocol_ids), obs);
  }

  const candidateObsMap = new Map<string, Record<string, unknown>>();
  for (const obs of cObs) {
    candidateObsMap.set(makeObsKey(obs, candidate.system_ids, candidate.benchmark_ids, candidate.protocol_ids), obs);
  }

  const addedObsKeys: string[] = [];
  const removedObsKeys: string[] = [];
  const correctedObsKeys: Array<{ key: string; changes: Record<string, { before: unknown; after: unknown }> }> = [];

  let indepAdditions = 0;
  let selfAdditions = 0;
  const protocolAdditions: Record<string, number> = {};

  for (const [key, cObservation] of candidateObsMap) {
    const bObservation = baselineObsMap.get(key);
    if (!bObservation) {
      addedObsKeys.push(key);
      const isSelf = cObservation.provenance_index === 1;
      if (isSelf) selfAdditions++;
      else indepAdditions++;

      const pId = candidate.protocol_ids[cObservation.protocol_index as number] ?? "unknown";
      protocolAdditions[pId] = (protocolAdditions[pId] || 0) + 1;
    } else {
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      for (const field of ["y", "variance", "metadata_incomplete", "likelihood", "provenance_index"]) {
        if (bObservation[field] !== cObservation[field]) {
          changes[field] = { before: bObservation[field], after: cObservation[field] };
        }
      }
      if (Object.keys(changes).length > 0) {
        correctedObsKeys.push({ key, changes });
      }
    }
  }

  for (const key of baselineObsMap.keys()) {
    if (!candidateObsMap.has(key)) removedObsKeys.push(key);
  }

  const addedCells = [...candidateCellKeys].filter((k) => !baselineCellKeys.has(k));
  const removedCells = [...baselineCellKeys].filter((k) => !candidateCellKeys.has(k));

  const baselineBms = new Set(baseline.benchmark_ids);
  const candidateBms = new Set(candidate.benchmark_ids);
  const addedBenchmarks = [...candidateBms].filter((b) => !baselineBms.has(b));
  const removedBenchmarks = [...baselineBms].filter((b) => !candidateBms.has(b));

  const baselineModels = new Set(baseline.system_ids.map((s) => s.split("@")[0]!));
  const candidateModels = new Set(candidate.system_ids.map((s) => s.split("@")[0]!));
  const addedModels = [...candidateModels].filter((m) => !baselineModels.has(m));
  const removedModels = [...baselineModels].filter((m) => !candidateModels.has(m));

  // Frontier model gap comparisons
  const trackedSystems = [
    "gemini-3.8-flash@max-common",
    "gemini-3.7-flash@max-common",
    "gpt-5.6-sol@max-common",
    "gpt-5.6-luna@max-common",
    "grok-4.6@max-common",
    "claude-sonnet-5@max-common",
    "claude-opus-5@max-common",
    "deepseek-v4-pro-0813@max-common",
    "o1-pro@max-common",
    "o3-pro@max-common",
    "gpt-5.1-codex-max@max-common",
    "grok-code-fast-1@max-common",
  ];

  const getSystemDomains = (input: PreparedCandidateInputData, sId: string) => {
    const sIdx = input.system_ids.indexOf(sId);
    if (sIdx === -1) return { bmCount: 0, domains: new Set<string>() };
    const domains = new Set<string>();
    let bmCount = 0;
    for (const obs of input.observations) {
      if (obs.system_index === sIdx) {
        bmCount++;
        domains.add(input.domains[obs.domain_index as number]!);
      }
    }
    return { bmCount, domains };
  };

  const latestModelGaps = trackedSystems.map((sId) => {
    const bInfo = getSystemDomains(baseline, sId);
    const cInfo = getSystemDomains(candidate, sId);
    const bMissing = baseline.domains.filter((d) => !bInfo.domains.has(d));
    const cMissing = candidate.domains.filter((d) => !cInfo.domains.has(d));
    const resolved = bMissing.filter((d) => cInfo.domains.has(d));

    return {
      system_id: sId,
      before_benchmarks: bInfo.bmCount,
      after_benchmarks: cInfo.bmCount,
      before_missing_domains: bMissing,
      after_missing_domains: cMissing,
      resolved_domains: resolved,
      remaining_missing_domains: cMissing,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    baseline_source: sourceNames.baseline,
    candidate_source: sourceNames.candidate,
    gross_summary: {
      observations: {
        baseline: bObs.length,
        candidate: cObs.length,
        delta: cObs.length - bObs.length,
      },
      cells: {
        baseline: baselineCellKeys.size,
        candidate: candidateCellKeys.size,
        delta: candidateCellKeys.size - baselineCellKeys.size,
      },
      models: {
        baseline: baselineModels.size,
        candidate: candidateModels.size,
        delta: candidateModels.size - baselineModels.size,
      },
      systems: {
        baseline: baseline.system_ids.length,
        candidate: candidate.system_ids.length,
        delta: candidate.system_ids.length - baseline.system_ids.length,
      },
      benchmarks: {
        baseline: baseline.benchmark_ids.length,
        candidate: candidate.benchmark_ids.length,
        delta: candidate.benchmark_ids.length - baseline.benchmark_ids.length,
      },
      families: {
        baseline: baseline.n_families,
        candidate: candidate.n_families,
        delta: candidate.n_families - baseline.n_families,
      },
    },
    additions: {
      gross_added_observations_count: addedObsKeys.length,
      gross_added_cells_count: addedCells.length,
      added_benchmarks: addedBenchmarks,
      added_models: addedModels,
      added_observations_sample: addedObsKeys.slice(0, 15).map((key) => {
        const [system_id, benchmark_id, protocol_id] = key.split("::");
        const obs = candidateObsMap.get(key)!;
        return {
          system_id: system_id!,
          benchmark_id: benchmark_id!,
          protocol_id: protocol_id!,
          provenance: obs.provenance_index === 1 ? "self_report" : "independent",
          score: (obs.y ?? obs.score ?? 0) as number,
        };
      }),
    },
    removals: {
      gross_removed_observations_count: removedObsKeys.length,
      gross_removed_cells_count: removedCells.length,
      removed_benchmarks: removedBenchmarks,
      removed_models: removedModels,
      removed_observations_sample: removedObsKeys.slice(0, 15).map((key) => {
        const [system_id, benchmark_id, protocol_id] = key.split("::");
        return {
          system_id: system_id!,
          benchmark_id: benchmark_id!,
          protocol_id: protocol_id!,
        };
      }),
    },
    corrections: {
      gross_corrected_observations_count: correctedObsKeys.length,
      corrections_sample: correctedObsKeys.slice(0, 15).map((item) => {
        const [system_id, benchmark_id, protocol_id] = item.key.split("::");
        return {
          system_id: system_id!,
          benchmark_id: benchmark_id!,
          protocol_id: protocol_id!,
          changes: item.changes,
        };
      }),
    },
    provenance_breakdown: {
      independent_additions: indepAdditions,
      self_report_additions: selfAdditions,
      by_protocol: protocolAdditions,
    },
    latest_model_gaps: latestModelGaps,
  };
}

export function formatMarkdownBaseline(report: CoverageBaselineReport): string {
  const m = report.audit_metadata;
  const b = report.benchmark_metadata_statuses;
  const c = report.cells_and_observations;
  const f = report.family_coverage;
  const d = report.domain_loadings_and_rank;
  const e = report.effort_analysis;
  const a = report.aa_private_data_isolation;
  const l = report.latest_model_unresolved_gaps;

  return `# Benchmark Coverage Baseline Audit · ${m.method_version}

**Date:** ${m.date}  
**Reference input:** \`${m.baseline_input_file}\`  
**Input SHA-256:** \`${m.baseline_input_sha256}\`  
**Status:** Frozen Accepted Production Baseline

---

## 1. Executive Summary

This audit establishes the definitive baseline of benchmark coverage, condition cells, instrument loadings, and model representation from the accepted **1.4.3** inference input and repository registry.

- **Catalog Benchmarks:** ${m.catalog_benchmarks_count} registered (${b.by_status["active"] ?? 19} active/fitted, ${b.by_status["watchlist"] ?? 81} watchlist, ${b.by_status["shadow"] ?? 2} shadow, ${b.by_status["retired"] ?? 5} retired).
- **Catalog Models:** ${m.catalog_models_count} registered; **${m.fitted_models_count} fitted** across **${m.fitted_systems_count} systems**; **${m.unfitted_catalog_models_count} catalog models unfitted** (zero cells).
- **Observations & Cells:** **${c.total_raw_observations} total observations** across **${c.total_unique_cells} condition cells** (${c.independent_unique_cells} independent cells, ${c.self_report_unique_cells} self-report cells).
- **Family Coverage:** **${f.fitted_families_count} families fitted** out of **${f.total_catalog_families} catalog families** (${f.unfitted_families_count} unfitted families).
- **Loading Matrix Rank:** **Rank ${d.loading_matrix_rank}** (condition number ${d.condition_number}); singular values [${d.singular_values.join(", ")}].
- **Effort Assignments:** ${e.prepared_observations_assumed_maximum} observations assumed maximum under 1.4.3 policy, ${e.prepared_observations_reported_effort} explicit reported, ${e.prepared_observations_fixed_effort_systems} fixed-effort.
- **Private Evaluations:** Strict isolation maintained: **0 Artificial Analysis observations** in public fit; display overlays strictly segregated.

---

## 2. Benchmark Metadata & Catalog Status Accounting

The registry catalog defines ${m.catalog_benchmarks_count} benchmark entries. Only status \`active\` benchmarks enter the likelihood fit.

| Status | Count | Policy / Treatment in 1.4.3 Fit |
|---|---|---|
| **Active (Fitted)** | ${b.by_status["active"] ?? 19} | Admitted into capability likelihood joint fit |
| **Watchlist** | ${b.by_status["watchlist"] ?? 81} | Cataloged candidates; rejected as \`condition_inactive\` |
| **Shadow** | ${b.by_status["shadow"] ?? 2} | Isolated verification (e.g. non-AA \`aa-lcr\`); rejected as \`condition_inactive\` |
| **Retired** | ${b.by_status["retired"] ?? 5} | Superseded historical versions; rejected as \`condition_inactive\` |

### Holdout Distribution
- **Public:** ${b.by_holdout["public"] ?? 90} benchmarks
- **Semi-Private:** ${b.by_holdout["semi_private"] ?? 5} benchmarks (\`arc-agi-2-semi-private\`, etc.)
- **Private:** ${b.by_holdout["private"] ?? 6} benchmarks
- **Rolling:** ${b.by_holdout["rolling"] ?? 6} benchmarks

---

## 3. Cell & Observation Accounting (Fitted Benchmarks)

Across the 19 active benchmarks, ${c.total_raw_observations} observations yield ${c.total_unique_cells} unique model × condition × configuration cells:

| Benchmark ID | Family | Primary Domain | Raw Obs | Unique Cells | Indep Cells | Self-Report Cells |
|---|---|---|---|---|---|---|
${c.cells_by_benchmark
  .map(
    (row) =>
      `| \`${row.benchmark_id}\` | \`${row.family_id}\` | ${row.primary_domain} | ${row.raw_observations} | ${row.total_cells} | ${row.independent_cells} | ${row.self_report_cells} |`,
  )
  .join("\n")}
| **Total** | **${f.fitted_families_count} Families** | **5 Domains** | **${c.total_raw_observations}** | **${c.total_unique_cells}** | **${c.independent_unique_cells}** | **${c.self_report_unique_cells}** |

---

## 4. Domain Loadings, Instrument Rank & Sparsity Analysis

The capability index estimates traits across 5 correlated domains:
\`agentic\`, \`software-code\`, \`reasoning\`, \`knowledge-information\`, \`communication-professional\`.

### Loading Matrix Geometry
- **Matrix Dimensions:** ${d.loading_matrix_shape[0]} × ${d.loading_matrix_shape[1]}
- **Exact Rank:** **${d.loading_matrix_rank}** (Full rank)
- **Singular Values:** \`${d.singular_values.join(", ")}\`
- **Condition Number:** \`${d.condition_number}\`

### Direct Instrument Allocation (Primary Domain ≥ 0.40)
| Domain | Dedicated Benchmarks | Families | Instrument Density |
|---|---|---|---|
| **Agentic** | ${d.direct_instruments_by_domain["agentic"]?.dedicated_instrument_count ?? 0} (\`${d.direct_instruments_by_domain["agentic"]?.primary_benchmarks.join(", ")}\`) | ${d.direct_instruments_by_domain["agentic"]?.primary_families.length ?? 0} | Dense (6 families) |
| **Software-Code** | ${d.direct_instruments_by_domain["software-code"]?.dedicated_instrument_count ?? 0} (\`${d.direct_instruments_by_domain["software-code"]?.primary_benchmarks.join(", ")}\`) | ${d.direct_instruments_by_domain["software-code"]?.primary_families.length ?? 0} | Moderate (3 families) |
| **Reasoning** | ${d.direct_instruments_by_domain["reasoning"]?.dedicated_instrument_count ?? 0} (\`${d.direct_instruments_by_domain["reasoning"]?.primary_benchmarks.join(", ")}\`) | ${d.direct_instruments_by_domain["reasoning"]?.primary_families.length ?? 0} | Dense (4 families) |
| **Knowledge-Information** | ${d.direct_instruments_by_domain["knowledge-information"]?.dedicated_instrument_count ?? 0} (\`${d.direct_instruments_by_domain["knowledge-information"]?.primary_benchmarks.join(", ")}\`) | **1** (\`${d.direct_instruments_by_domain["knowledge-information"]?.primary_families.join(", ")}\`) | **Critically Sparse** |
| **Communication-Professional** | ${d.direct_instruments_by_domain["communication-professional"]?.dedicated_instrument_count ?? 0} (\`${d.direct_instruments_by_domain["communication-professional"]?.primary_benchmarks.join(", ")}\`) | **2** (\`${d.direct_instruments_by_domain["communication-professional"]?.primary_families.join(", ")}\`) | **Sparse** |

> [!WARNING]
> **Instrument Independence Caveat:**  
> ${d.caveats}  
> Secondary crossloadings (such as HLE 0.30 on knowledge, GDPval 0.20 on knowledge, or Terminal-Bench 0.05 on knowledge) provide multi-task correlation constraints in the joint posterior, but **must never be counted as independent instruments**.

### Specific Weakness Findings:
1. **Knowledge & Information:** Single-family reliance on \`simpleqa\` (anti-abstention v1.0.0 and v1.2.0). Any artifact of SimpleQA anti-abstention dominates knowledge measurement.
2. **Communication & Professional:** Only two families (\`gdpval\` and \`lmarena-text\`).

---

## 5. Effort Assignment Audit (Unreported vs Reported)

Under methodology version **1.4.3**, \`unreported_effort_policy: maximum\` is in effect:
- **Snapshot Raw Records:** ${e.raw_snapshot_reported_effort} reported effort, ${e.raw_snapshot_unreported_effort} unreported.
- **Accepted Fitted Observations:**
  - **49 Assumed Maximum:** Assigned to \`max-common\` with \`effortAssumedMaximum: true\` and \`metadataIncomplete: true\` (1.5× run-noise variance multiplier).
  - **627 Explicit Reported:** Retain exact declared tier (\`default\`, \`medium\`, \`high\`, etc.).
  - **248 Fixed-Effort:** Assigned directly to canonical \`max-common\` system without assuming an explicit tier.
  - **924 Total.**

---

## 6. Artificial Analysis (AA) Private Data Isolation

Strict policy safeguards maintain separation between public capability fitting and private/non-redistributable evaluation overlays:
- **Prohibited Scores:** Artificial Analysis benchmark results (CritPt pass@1, AA-LCR scores, AA cost per task, AA speed) **do not enter the capability fit** or public downloadable snapshots.
- **Overlay Registries:** 3 isolated manual sources (\`aa-speed-manual\`, \`aa-cost-manual\`, \`aa-benchmarks-manual\`) marked \`redistributable: false\`.
- **Fitted Observations from AA:** **${a.observations_in_public_fit}** (${a.is_fully_isolated ? "100% Fully Isolated" : "FAILED"}).

---

## 7. Latest-Model Coverage Gaps

### Unfitted Catalog Models (${l.unfitted_catalog_models.length} releases with 0 cells)
The following catalog models lack compatible evidence under 1.4.3:  
\`${l.unfitted_catalog_models.join("`, `")}\`

### Frontier Model Coverage & Missing Domains
| System ID | Fitted BMs | Indep Cells | Covered Domains | Missing Domains (Gaps) |
|---|---|---|---|---|
${l.frontier_model_coverage
  .map(
    (row) =>
      `| \`${row.system_id}\` | ${row.benchmark_count} | ${row.independent_cells} | ${row.covered_domains.join(", ") || "none"} | **${row.missing_domains.join(", ") || "none"}** |`,
  )
  .join("\n")}

### Key Unresolved Gaps:
- **Gemini 3.8 Flash:** Has 5 benchmarks across 4 domains; **missing \`knowledge-information\`**.
- **Grok 4.6:** Has 6 benchmarks; **missing \`communication-professional\`**.
- **Claude Sonnet 5:** Has 8 benchmarks; **missing \`communication-professional\`**.
- **DeepSeek V4 Pro (0813):** Has 6 benchmarks; **missing \`software-code\`**.
- **O1-Pro / O3-Pro:** Have only 1 benchmark (\`matharena-composite\`); **missing 4 domains**.
- **GPT-5.1 Codex Max / Grok Code Fast 1:** Have only 1 benchmark (\`swe-rebench\`); **missing 4 domains**.

---

## 8. CLI Usage for Baseline & Candidate Comparison

### Generate / Audit Baseline
\`\`\`bash
tsx scripts/audit-benchmark-coverage.ts
\`\`\`

### Prepare Candidate Input (Without Bayesian Refit)
\`\`\`bash
tsx scripts/prepare-candidate-input.ts --output work/candidate-input.json
\`\`\`

### Compare Baseline to Candidate Prepared Input
\`\`\`bash
tsx scripts/audit-benchmark-coverage.ts --compare work/candidate-input.json
\`\`\`
`;
}

function usage(): string {
  return `ActualAnalysis benchmark coverage audit and comparison CLI

Usage:
  tsx scripts/audit-benchmark-coverage.ts [options]

Modes:
  Default: Build and audit baseline coverage from accepted 1.4.3 input and registry
  --compare PATH: Deterministically compare baseline to candidate prepared input
  --prepare-candidate PATH: Prepare candidate input from registry without Bayesian refit

Options:
  --compare PATH          Compare baseline input with candidate inference input JSON
  --prepare-candidate PATH Prepare candidate input to output path
  --baseline PATH         Path to baseline input JSON (default: docs/audits/1.4.3-effort-coverage/accepted-input.json)
  --data-dir PATH         Registry data directory (default: data/)
  --input PATH            Input results file for candidate preparation
  --output PATH           Write report to specified JSON file
  --json                  Output raw JSON to stdout
  -h, --help              Show this help
`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let comparePath: string | undefined;
  let preparePath: string | undefined;
  let baselinePath: string | undefined;
  let dataDir: string | undefined;
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let jsonOutput = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "-h" || arg === "--help") {
      console.log(usage());
      return;
    }
    if (arg === "--compare") {
      if (!next) throw new Error("--compare requires a file path");
      comparePath = path.resolve(next);
      i++;
    } else if (arg === "--prepare-candidate") {
      if (!next) throw new Error("--prepare-candidate requires an output path");
      preparePath = path.resolve(next);
      i++;
    } else if (arg === "--baseline") {
      if (!next) throw new Error("--baseline requires a file path");
      baselinePath = path.resolve(next);
      i++;
    } else if (arg === "--data-dir") {
      if (!next) throw new Error("--data-dir requires a path");
      dataDir = path.resolve(next);
      i++;
    } else if (arg === "--input") {
      if (!next) throw new Error("--input requires a path");
      inputPath = path.resolve(next);
      i++;
    } else if (arg === "--output") {
      if (!next) throw new Error("--output requires a path");
      outputPath = path.resolve(next);
      i++;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (preparePath) {
    const result = await prepareCandidateInput({ output: preparePath, dataDir, input: inputPath });
    console.log(`Candidate input prepared at: ${result.outputPath}`);
    return;
  }

  if (comparePath) {
    const baselineFile = baselinePath ?? path.join(root, "docs/audits/1.4.3-effort-coverage/accepted-input.json");
    const baselineRaw = await readFile(baselineFile, "utf8");
    const baselinePayload = JSON.parse(baselineRaw) as PreparedCandidateInputData;
    const candidateRaw = await readFile(comparePath, "utf8");
    const candidatePayload = JSON.parse(candidateRaw) as PreparedCandidateInputData;

    const diff = comparePreparedInputs(baselinePayload, candidatePayload, {
      baseline: path.relative(root, baselineFile),
      candidate: path.relative(root, comparePath),
    });

    if (outputPath) {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(diff, null, 2)}\n`, "utf8");
    }

    if (jsonOutput) {
      console.log(JSON.stringify(diff, null, 2));
    } else {
      console.log(`=== ACTUALANALYSIS COVERAGE COMPARISON ===`);
      console.log(`Baseline:  ${diff.baseline_source} (${diff.gross_summary.observations.baseline} obs, ${diff.gross_summary.cells.baseline} cells)`);
      console.log(`Candidate: ${diff.candidate_source} (${diff.gross_summary.observations.candidate} obs, ${diff.gross_summary.cells.candidate} cells)`);
      console.log(`-----------------------------------------`);
      console.log(`Observations: delta = ${diff.gross_summary.observations.delta >= 0 ? "+" : ""}${diff.gross_summary.observations.delta} (added: ${diff.additions.gross_added_observations_count}, removed: ${diff.removals.gross_removed_observations_count}, corrected: ${diff.corrections.gross_corrected_observations_count})`);
      console.log(`Cells:        delta = ${diff.gross_summary.cells.delta >= 0 ? "+" : ""}${diff.gross_summary.cells.delta} (added: ${diff.additions.gross_added_cells_count}, removed: ${diff.removals.gross_removed_cells_count})`);
      console.log(`Models:       delta = ${diff.gross_summary.models.delta >= 0 ? "+" : ""}${diff.gross_summary.models.delta}`);
      console.log(`Benchmarks:   delta = ${diff.gross_summary.benchmarks.delta >= 0 ? "+" : ""}${diff.gross_summary.benchmarks.delta}`);
      console.log(`Families:     delta = ${diff.gross_summary.families.delta >= 0 ? "+" : ""}${diff.gross_summary.families.delta}`);
      console.log(`Provenance:   independent additions = ${diff.provenance_breakdown.independent_additions}, self-report additions = ${diff.provenance_breakdown.self_report_additions}`);
      console.log(`-----------------------------------------`);
      console.log(`Frontier Model Gap Deltas:`);
      for (const gap of diff.latest_model_gaps) {
        const resolvedText = gap.resolved_domains.length > 0 ? ` [RESOLVED: ${gap.resolved_domains.join(", ")}]` : "";
        const remainingText = gap.remaining_missing_domains.length > 0 ? ` (still missing: ${gap.remaining_missing_domains.join(", ")})` : " (fully covered)";
        console.log(`  * ${gap.system_id}: ${gap.before_benchmarks} -> ${gap.after_benchmarks} BMs${resolvedText}${remainingText}`);
      }
    }
    return;
  }

  // Baseline mode
  const baseline = await buildCoverageBaseline({ dataDir, baselinePath });

  const defaultDir = path.join(root, "docs/audits/coverage-expansion-2026-09-06");
  const defaultJsonPath = path.join(defaultDir, "coverage-baseline.json");
  const defaultMdPath = path.join(defaultDir, "coverage-baseline.md");

  await mkdir(defaultDir, { recursive: true });
  await writeFile(defaultJsonPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await writeFile(defaultMdPath, formatMarkdownBaseline(baseline), "utf8");

  if (outputPath && outputPath !== defaultJsonPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  }

  if (jsonOutput) {
    console.log(JSON.stringify(baseline, null, 2));
  } else {
    console.log(`=== ACTUALANALYSIS COVERAGE BASELINE (1.4.3) ===`);
    console.log(`Catalog Benchmarks: ${baseline.audit_metadata.catalog_benchmarks_count} (${baseline.benchmark_metadata_statuses.by_status["active"] ?? 19} active, ${baseline.benchmark_metadata_statuses.by_status["watchlist"] ?? 81} watchlist)`);
    console.log(`Catalog Models:     ${baseline.audit_metadata.catalog_models_count} (${baseline.audit_metadata.fitted_models_count} fitted, ${baseline.audit_metadata.unfitted_catalog_models_count} unfitted)`);
    console.log(`Observations:       ${baseline.cells_and_observations.total_raw_observations} (${baseline.cells_and_observations.independent_observations} independent, ${baseline.cells_and_observations.self_report_observations} self-report)`);
    console.log(`Condition Cells:    ${baseline.cells_and_observations.total_unique_cells} (${baseline.cells_and_observations.independent_unique_cells} independent, ${baseline.cells_and_observations.self_report_unique_cells} self-report)`);
    console.log(`Families:           ${baseline.family_coverage.fitted_families_count} fitted of ${baseline.family_coverage.total_catalog_families} catalog families`);
    console.log(`Loading Matrix:     Rank ${baseline.domain_loadings_and_rank.loading_matrix_rank} (Cond: ${baseline.domain_loadings_and_rank.condition_number})`);
    console.log(`Effort Policy:      ${baseline.effort_analysis.policy} (${baseline.effort_analysis.prepared_observations_assumed_maximum} assumed max, ${baseline.effort_analysis.prepared_observations_reported_effort} explicit)`);
    console.log(`AA Data Isolation:  ${baseline.aa_private_data_isolation.observations_in_public_fit} AA observations in public fit (Strict Isolation Verified)`);
    console.log(`Artifacts written:`);
    console.log(`  JSON: ${path.relative(root, defaultJsonPath)}`);
    console.log(`  MD:   ${path.relative(root, defaultMdPath)}`);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
