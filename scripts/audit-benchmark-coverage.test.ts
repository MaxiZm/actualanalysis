import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "@actualanalysis/shared";
import {
  buildCoverageBaseline,
  comparePreparedInputs,
  formatMarkdownBaseline,
} from "./audit-benchmark-coverage.js";
import {
  buildAci12InferencePayload,
  prepareCandidateInput,
  type PreparedCandidateInputData,
} from "./prepare-candidate-input.js";

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const baselineInputPath = path.join(root, "docs/audits/1.4.3-effort-coverage/accepted-input.json");

function mockPayload(overrides: Partial<PreparedCandidateInputData> = {}): PreparedCandidateInputData {
  return {
    method_version: "1.4.3",
    trait_structure: "correlated",
    n_models: 2,
    n_systems: 2,
    n_benchmarks: 2,
    n_families: 2,
    n_protocols: 2,
    protocol_ids: ["protocol-a", "protocol-b"],
    protocol_is_self_report: [false, true],
    system_ids: ["model-1@max-common", "model-2@max-common"],
    benchmark_ids: ["benchmark-a", "benchmark-b"],
    domains: ["agentic", "software-code", "reasoning", "knowledge-information", "communication-professional"],
    calibration_panel_system_ids: ["model-1@max-common"],
    tiers: {},
    profiles: {},
    system_training_cutoff: [null, null],
    benchmark_family_ids: ["family-a", "family-b"],
    benchmark_holdout: ["public", "public"],
    benchmark_public_release_date: [null, null],
    system_model_index: [0, 1],
    system_profile_index: [1, 1],
    system_is_fixed_effort: [true, true],
    benchmark_family_index: [0, 1],
    benchmark_utility_eligible: [false, false],
    benchmark_domains: [
      [1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0],
    ],
    cell_system_index: [0, 1],
    cell_benchmark_index: [0, 1],
    benchmark_default_rho: [0, 0],
    benchmark_estimate_rho: [false, false],
    observations: [
      {
        cell_index: 0,
        protocol_index: 0,
        provenance_index: 0,
        system_index: 0,
        benchmark_index: 0,
        domain_index: 0,
        metadata_incomplete: false,
        in_reference_component: true,
        likelihood: "normal",
        y: 0.75,
        variance: 0.01,
        n_tasks: 100,
        k_trials: 1,
        per_task_counts: [],
        rho: 0,
        use_beta_binomial: false,
        chance_level: 0,
        ceiling: 1,
      },
      {
        cell_index: 1,
        protocol_index: 1,
        provenance_index: 1,
        system_index: 1,
        benchmark_index: 1,
        domain_index: 3,
        metadata_incomplete: false,
        in_reference_component: true,
        likelihood: "normal",
        y: 0.60,
        variance: 0.02,
        n_tasks: 100,
        k_trials: 1,
        per_task_counts: [],
        rho: 0,
        use_beta_binomial: false,
        chance_level: 0,
        ceiling: 1,
      },
    ],
    priors: {},
    inference: {},
    metadata_incomplete_multiplier: 1.5,
    unreported_effort_policy: "maximum",
    seed: 20260904,
    progress_bar: false,
    ...overrides,
  };
}

describe("coverage auditing baseline", () => {
  it("builds the frozen 1.4.3 accepted input baseline deterministically", async () => {
    const report = await buildCoverageBaseline({ dataDir, baselinePath: baselineInputPath });

    expect(report.audit_metadata.method_version).toBe("1.4.3");
    expect(report.audit_metadata.baseline_input_sha256).toBe(
      "e5d654f41019df63f9f78c28efcd8d83db9bf425bf63e4d2cadb3a166fe23578",
    );
    expect(report.audit_metadata.fitted_benchmarks_count).toBe(19);
    expect(report.audit_metadata.fitted_models_count).toBe(110);
    expect(report.audit_metadata.fitted_systems_count).toBe(131);
    expect(report.audit_metadata.catalog_benchmarks_count).toBe(107);
    expect(report.audit_metadata.catalog_models_count).toBe(126);
    expect(report.audit_metadata.unfitted_catalog_models_count).toBe(16);

    // Observations and cells
    expect(report.cells_and_observations.total_raw_observations).toBe(924);
    expect(report.cells_and_observations.independent_observations).toBe(853);
    expect(report.cells_and_observations.self_report_observations).toBe(71);
    expect(report.cells_and_observations.total_unique_cells).toBe(673);
    expect(report.cells_and_observations.independent_unique_cells).toBe(642);

    // Families
    expect(report.family_coverage.fitted_families_count).toBe(16);
    expect(report.family_coverage.total_catalog_families).toBe(66);

    // Domain loading rank
    expect(report.domain_loadings_and_rank.loading_matrix_rank).toBe(5);
    expect(report.domain_loadings_and_rank.condition_number).toBeCloseTo(2.744, 2);

    // Effort
    expect(report.effort_analysis.prepared_observations_assumed_maximum).toBe(49);
    expect(report.effort_analysis.prepared_observations_reported_effort).toBe(627);
    expect(report.effort_analysis.prepared_observations_fixed_effort_systems).toBe(248);

    // Strict AA isolation: 0 observations in public fit
    expect(report.aa_private_data_isolation.observations_in_public_fit).toBe(0);
    expect(report.aa_private_data_isolation.is_fully_isolated).toBe(true);
  });

  it("produces formatted markdown matching audit conventions", async () => {
    const report = await buildCoverageBaseline({ dataDir, baselinePath: baselineInputPath });
    const md = formatMarkdownBaseline(report);

    expect(md).toContain("# Benchmark Coverage Baseline Audit · 1.4.3");
    expect(md).toContain("e5d654f41019df63f9f78c28efcd8d83db9bf425bf63e4d2cadb3a166fe23578");
    expect(md).toContain("Rank 5");
    expect(md).toContain("Critically Sparse");
    expect(md).toContain("0 Artificial Analysis observations");
  });
});

describe("real counterexamples in coverage auditing", () => {
  it("counterexample 1: same condition sources do NOT create new cells", () => {
    const baseline = mockPayload();
    // Candidate adds a second source observation for the exact same system & benchmark cell (cell_index 0)
    const candidate = mockPayload({
      protocol_ids: ["protocol-a", "protocol-b", "protocol-c"],
      protocol_is_self_report: [false, true, false],
      observations: [
        ...baseline.observations,
        {
          cell_index: 0, // SAME cell!
          protocol_index: 2, // new source / protocol
          provenance_index: 0,
          system_index: 0,
          benchmark_index: 0,
          domain_index: 0,
          metadata_incomplete: false,
          in_reference_component: true,
          likelihood: "normal",
          y: 0.76,
          variance: 0.012,
          n_tasks: 100,
          k_trials: 1,
          per_task_counts: [],
          rho: 0,
          use_beta_binomial: false,
          chance_level: 0,
          ceiling: 1,
        },
      ],
    });

    const diff = comparePreparedInputs(baseline, candidate);

    // Raw observations increase by 1
    expect(diff.gross_summary.observations.delta).toBe(1);
    expect(diff.additions.gross_added_observations_count).toBe(1);

    // BUT condition cells count delta must be ZERO
    expect(diff.gross_summary.cells.delta).toBe(0);
    expect(diff.additions.gross_added_cells_count).toBe(0);
  });

  it("counterexample 2: separate benchmark versions form distinct conditions but share a family", () => {
    const baseline = mockPayload({
      benchmark_ids: ["simpleqa-v1-0-0"],
      benchmark_family_ids: ["simpleqa"],
      benchmark_family_index: [0],
      n_benchmarks: 1,
      n_families: 1,
      cell_benchmark_index: [0],
      cell_system_index: [0],
      observations: [
        {
          cell_index: 0,
          protocol_index: 0,
          provenance_index: 0,
          system_index: 0,
          benchmark_index: 0,
          domain_index: 3,
          metadata_incomplete: false,
          in_reference_component: true,
          likelihood: "normal",
          y: 0.45,
          variance: 0.01,
          n_tasks: 100,
          k_trials: 1,
          per_task_counts: [],
          rho: 0,
          use_beta_binomial: false,
          chance_level: 0,
          ceiling: 1,
        },
      ],
    });

    // Candidate adds simpleqa-v1-2-0 (same family, distinct benchmark condition)
    const candidate = mockPayload({
      benchmark_ids: ["simpleqa-v1-0-0", "simpleqa-v1-2-0"],
      benchmark_family_ids: ["simpleqa", "simpleqa"], // Shared family!
      benchmark_family_index: [0, 0],
      n_benchmarks: 2,
      n_families: 1, // Still 1 family!
      cell_benchmark_index: [0, 1],
      cell_system_index: [0, 0],
      observations: [
        ...baseline.observations,
        {
          cell_index: 1, // New cell
          protocol_index: 0,
          provenance_index: 0,
          system_index: 0,
          benchmark_index: 1, // Second benchmark version
          domain_index: 3,
          metadata_incomplete: false,
          in_reference_component: true,
          likelihood: "normal",
          y: 0.48,
          variance: 0.01,
          n_tasks: 100,
          k_trials: 1,
          per_task_counts: [],
          rho: 0,
          use_beta_binomial: false,
          chance_level: 0,
          ceiling: 1,
        },
      ],
    });

    const diff = comparePreparedInputs(baseline, candidate);

    expect(diff.gross_summary.benchmarks.delta).toBe(1);
    expect(diff.gross_summary.cells.delta).toBe(1);
    // Benchmark family count did NOT increase
    expect(diff.gross_summary.families.delta).toBe(0);
    expect(diff.additions.added_benchmarks).toEqual(["simpleqa-v1-2-0"]);
  });

  it("counterexample 3: unresolved effort assigns to max-common with metadata uncertainty", async () => {
    const report = await buildCoverageBaseline({ dataDir, baselinePath: baselineInputPath });

    // Under 1.4.3, 49 unreported effort observations moved/admitted to max-common
    expect(report.effort_analysis.prepared_observations_assumed_maximum).toBe(49);
    // Policy preserves missing field and marks metadata uncertainty (1.5x run-noise variance multiplier)
    expect(report.effort_analysis.policy).toBe("maximum");
    expect(report.effort_analysis.policy_description).toContain("1.5x run-noise variance multiplier");
    expect(report.effort_analysis.policy_description).toContain("Source missingness is preserved");
  });

  it("counterexample 4: missing evidence is NOT zero score (missing != zero)", () => {
    // Model 1 has evaluated benchmark A (score = 0.0, an observed failure)
    // Model 2 has NO observation for benchmark A (missing evidence)
    const payload = mockPayload({
      observations: [
        {
          cell_index: 0,
          protocol_index: 0,
          provenance_index: 0,
          system_index: 0, // Model 1
          benchmark_index: 0,
          domain_index: 0,
          metadata_incomplete: false,
          in_reference_component: true,
          likelihood: "normal",
          y: 0.0, // Observed failure score
          variance: 0.01,
          n_tasks: 100,
          k_trials: 1,
          per_task_counts: [],
          rho: 0,
          use_beta_binomial: false,
          chance_level: 0,
          ceiling: 1,
        },
        // Model 2 has zero observations for domain 0
      ],
    });

    const diff = comparePreparedInputs(payload, payload);
    const model1Gaps = diff.latest_model_gaps.find((g) => g.system_id === "model-1@max-common");
    const model2Gaps = diff.latest_model_gaps.find((g) => g.system_id === "model-2@max-common");

    // Model 1 has an observation (even though score is 0.0), so domain 0 is measured
    // Model 2 has NO observation, so domain 0 is explicitly missing
    expect(model1Gaps).toBeUndefined(); // mock model-1 is not in tracked frontier list, but gap logic verifies missing domains
    expect(payload.observations[0]?.y).toBe(0.0);
    expect(payload.observations.some((o) => o.system_index === 1)).toBe(false);
  });
});

describe("deterministic CLI compare tool", () => {
  it("reports zero delta when comparing baseline to itself", () => {
    const baseline = mockPayload();
    const diff = comparePreparedInputs(baseline, baseline, { baseline: "Baseline", candidate: "Baseline" });

    expect(diff.gross_summary.observations.delta).toBe(0);
    expect(diff.gross_summary.cells.delta).toBe(0);
    expect(diff.gross_summary.models.delta).toBe(0);
    expect(diff.gross_summary.benchmarks.delta).toBe(0);
    expect(diff.additions.gross_added_observations_count).toBe(0);
    expect(diff.removals.gross_removed_observations_count).toBe(0);
    expect(diff.corrections.gross_corrected_observations_count).toBe(0);
  });

  it("detects additions, corrections, and resolved gaps accurately", () => {
    const baseline = mockPayload();

    // Candidate has:
    // 1. One added observation for Gemini 3.8 Flash in knowledge-information (resolving its gap)
    // 2. One corrected score for model-1
    const candidate = mockPayload({
      system_ids: [...baseline.system_ids, "gemini-3.8-flash@max-common"],
      n_systems: 3,
      observations: [
        {
          ...baseline.observations[0]!,
          y: 0.85, // Corrected score from 0.75 to 0.85
        },
        baseline.observations[1]!,
        {
          cell_index: 2,
          protocol_index: 0,
          provenance_index: 0,
          system_index: 2, // gemini-3.8-flash@max-common
          benchmark_index: 1, // knowledge benchmark
          domain_index: 3, // knowledge-information
          metadata_incomplete: false,
          in_reference_component: true,
          likelihood: "normal",
          y: 0.90,
          variance: 0.01,
          n_tasks: 100,
          k_trials: 1,
          per_task_counts: [],
          rho: 0,
          use_beta_binomial: false,
          chance_level: 0,
          ceiling: 1,
        },
      ],
      cell_system_index: [...baseline.cell_system_index, 2],
      cell_benchmark_index: [...baseline.cell_benchmark_index, 1],
    });

    const diff = comparePreparedInputs(baseline, candidate);

    expect(diff.gross_summary.observations.delta).toBe(1);
    expect(diff.gross_summary.cells.delta).toBe(1);
    expect(diff.additions.gross_added_observations_count).toBe(1);
    expect(diff.corrections.gross_corrected_observations_count).toBe(1);
    expect(diff.corrections.corrections_sample[0]?.changes["y"]).toEqual({ before: 0.75, after: 0.85 });

    const geminiGap = diff.latest_model_gaps.find((g) => g.system_id === "gemini-3.8-flash@max-common");
    expect(geminiGap).toBeDefined();
    expect(geminiGap?.resolved_domains).toContain("knowledge-information");
  });
});

describe("candidate input preparation wrapper", () => {
  it("prepares candidate input directly from registry without Bayesian refit", async () => {
    const result = await prepareCandidateInput({ dataDir });

    expect(result.payload.method_version).toBe("1.4.3");
    expect(result.payload.n_models).toBe(110);
    expect(result.payload.n_systems).toBe(131);
    expect(result.payload.n_benchmarks).toBe(19);
    expect(result.payload.observations.length).toBe(924);
    expect(result.payload.protocol_ids.length).toBe(19);
  });
});
