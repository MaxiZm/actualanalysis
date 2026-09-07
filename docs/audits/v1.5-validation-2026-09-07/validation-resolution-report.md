# ACI v1.5.0 Validation Resolution and Production Decision Report

**Date:** 2026-09-07  
**Inspected commit:** `08af628cef56df133f3c1804cb301762ad0ec1eb`  
**Current Production Method:** **ACI 1.4.3**  
**Validation Verdict:** **NOTREADY** (`fit_authorized: false`, `promotion_authorized: false`, `promotion_claim: not_claimed`)  
**Production Decision:** **RETAIN ACI 1.4.3 AS PRODUCTION METHOD** (No candidate promotion)

---

## 1. Executive Summary & Decision

In accordance with strict preregistered release protocols and explicit user instructions ("*Complete v1.5.0 validation, then promote only if it passes*"; "*Never promote a failing or unvalidated method*"):

1. **Production Retained as ACI 1.4.3:** ActualAnalysis Capability Index (ACI) 1.4.3 remains the production scoring method. No candidate model is promoted to production, no export snapshots are altered, and all non-publishable guards remain active.
2. **Confirmatory Fit Blocked:** Confirmatory NUTS fitting for candidate promotion is blocked by preflight gates. Specifically, eligible certified configuration-compatible components stand at 0 (against a non-relaxable operating floor of >= 10 components across >= 3 providers), the experiment lock draft remains unlocked with 28 UNSET tokens, and confirmatory empirical simulation-based calibration has not been run on this design.
3. **Full Production-Faithful Tooling Implemented and Verified:** The full missing statistical, predictive evaluation, calibration SBC, and decision tooling was engineered, unit-tested, and verified in accordance with NumPyro generative specifications and codebase owner review.
4. **Tooling Delivery:** All tooling modules, unit tests, and audit documentation are delivered cleanly without claiming 1.5.0 promotion.

---

## 2. Implementation Workstreams

### Workstream 1: Production-Faithful Predictive Evaluator (`aci12.predictive_evaluator`)
- **Likelihood Alignment:** Implemented `ProductionPredictiveEvaluator` directly reproducing `aci12.model.aci_model` observation likelihoods:
  - `obs_normal` / `a_prime`: Normal location with variance and run noise.
  - `a_single`: Exact Binomial log-likelihood with sigmoid transform, chance, and ceiling.
  - `a_total`: Repeated-trial normal approximation with design effect 1 + (k - 1) * rho.
  - `a_exact`: Per-task Binomial or Beta-Binomial with concentration (1 - rho) / rho.
- **Joint Integration of Withheld Shared Effects:**
  - Withheld cell misfits (t_4 mixture via Normal / sqrt(Gamma(2, 2))) are sampled jointly across all held-out observations sharing a cell.
  - Withheld family effects and protocol x condition interactions are sampled jointly across shared entities.
  - Eliminates naive marginal multiplication and residual leakage from held-out units.
- **Monte Carlo Conditioning & Precision:** Conditioned on available training effects with deterministic Monte Carlo integration and Monte Carlo Standard Error (MCSE) calculation.
- **Native Metrics:** Computes paired joint Log Predictive Density (LPD), 90% predictive intervals, and Winkler interval scores (IS_{0.10}).

### Workstream 2: Validation Decision Engine & Criteria Correction (`aci12.validation_decision`)
- **Preregistered Bound Correction:** Corrected Criterion C5 in `candidate-validation-plan.md` before any candidate evaluations:
  - Coverage difference 90% CI lower bound >= -0.05 (noninferiority).
  - Normalized interval-score difference 90% CI upper bound <= 0.0 (noninferiority).
  - Explicitly documented why previously reversed signs were invalid.
- **Hierarchical Aggregation:** Aggregates observation -> condition/group -> successor-domain block -> original component with equal component weighting (1/C).
- **Paired Cluster Bootstrap:** Deterministic component-level bootstrap resampling for LPD, coverage, and interval score differences.
- **Sensitivity Checks:** Automated leave-one-component-out and leave-one-provider-out verification (C7).
- **Hard Gate Checks:** Automated validation of sampler convergence, lock status, certified evidence, and empirical SBC.

### Workstream 3: Simulation-Based Calibration (SBC) & Prior Predictive (`aci12.calibration_sbc`)
- **Forward Simulation:** Generates synthetic datasets from the actual NumPyro `aci_model` generative priors.
- **Truth Parameter Separation:** Stores true underlying parameters separately from simulated observations to prevent test leakage.
- **Design Hashing:** Implements `compute_design_hash` for input metadata invariance.
- **Rank Uniformity & Coverage:** Computes parameter rank statistics and Kolmogorov-Smirnov (KS) tests against Uniform(0, 1), assessing empirical 90% coverage.
- **Misspecification Suite:** Stress tests covering `wrong_class` partition misspecification, `missing_domain` regression, and `effort_shift`.
- **Confirmatory Power Standards:** Codified minimum replicate floors (>= 50-100) and KS thresholds (p >= 0.01) before confirmatory runs.

### Workstream 4: Configuration Evidence & Gemini Exclusion Provenance
- **Caller-Supplied Gemini Exclusion Provenance:** Created `data/experimental/gemini-exclusion-provenance.json` certifying all 14 Gemini models with Google DeepMind technical reports and arXiv citations, passing the `confirmation_exclusion_provenance` preflight gate.
- **Transfer Class Review:** Investigated and expanded `data/experimental/transfer-classes-reviewed-candidate.json` to 8 relationship-supported components across 5 providers (Anthropic, DeepSeek, xAI, Z.ai, Meta AI).
- **Standard-Trait Estimand Analysis:** Documented that while nuisance effort dials account for test-time compute, baseline evaluation harness configurations (tool sets, prompt scaffoldings, and test runners) remain uncertified across providers. The candidate upper bound of 8 components remains below the required floor of >= 10 eligible certified components.

---

## 3. Host Review Audit & Resolutions

During implementation, an engineering host review identified critical edge cases in the preliminary code. Each was resolved as follows:

| Review Finding | Resolution Implemented | Verification |
|---|---|---|
| **1. Process-variant hashing:** `hash(group_id)` varied across processes due to `PYTHONHASHSEED`. | Replaced with `_stable_seed` using SHA-256 digest integer derivation modulo 2^31 - 1. | Added `test_subprocess_reproducibility_different_pythonhashseed` spawning subprocesses with `PYTHONHASHSEED=0, 42, 99999, random`; verified bit-for-bit identical results. |
| **2. Evaluator alignment with `model.group_observations`:** Defaults for provenance, domain, metadata factor, and pair order must match. | Matched exact dictionary indexing for `pair_index`, `metadata_factor`, `domain_index`, and `provenance_index`. | Added `test_matches_model_group_observations_on_real_accepted_input` validating against `accepted-input.json`. |
| **3. Held-out row mapping & conditional cell effects:** Rows must fail closed; trained cell effects reused only if cell has remaining training rows. | Added fail-closed checks on system/benchmark/domain/protocol indices and IDs. Added training cell observation counts; trained `cell_misfit` is reused iff cell has >0 training observations, otherwise sampled from t_4 prior. | Added `test_fail_closed_on_invalid_row_mappings` and `test_trained_cell_effects_reused_conditionally`. |
| **4. Code existence vs empirical calibration:** Code presence alone must never set readiness booleans for calibrated fits. | Updated `inspect_predictive_workflow` to separate code availability (`paired_joint_production_predictive_scorer: True`) from empirical calibration status (`simulation_based_calibration_workflow: False`). | Verified preflight fails closed without empirical calibration evidence. |
| **5. Caller assertion bypass removal:** Removed `--predictive-workflow-verified` boolean bypass flag. | Replaced CLI flag with `--calibration-results <path>` requiring schema-validated JSON with design hash matching and >= 50 replicates. | Added unit tests verifying rejection of missing or smoke-only calibration results. |

---

## 4. Preflight Gate Audit

Preflight was executed against `accepted-input.json` and `transfer-classes-reviewed-candidate.json`:

```text
v1.5 validation preflight  commit=08af628cef56df133f3c1804cb301762ad0ec1eb
VERDICT: NOTREADY
fit_authorized: False
promotion_authorized: False
promotion_claim: not_claimed
```

### Detailed Gate Status:

| Gate ID | Result | Details |
|---|---|---|
| `class_registry` | **FAIL** | Candidate: 8 components / 5 providers. Informative: 8 / 5. **Eligible certified: 0 / 0** (Floor requires >= 10 components / >= 3 providers). `real_reviewed_classes_exist: false`. |
| `availability_family_closure_blocks` | **PASS** | 328 successor-domain blocks inventoried (308 retained parent-domain rows). |
| `frozen_lock_and_selection` | **FAIL** | Lock draft contains 28 UNSET tokens; references unimplemented A/B siblings; validation plan remains PROPOSED / NOT LOCKED. |
| `confirmation_exclusion_provenance` | **PASS** | Certified provenance provided in `gemini-exclusion-provenance.json`. |
| `comparable_measurement_settings` | **PASS** | Shared correlated traits, production likelihood, nested rho=0 vs Beta(1,1). |
| `predictive_calibration_workflow` | **FAIL** | Evaluator and SBC tooling implemented; empirical SBC not run to completion on this design. |
| `nonpublishable_guards` | **PASS** | `is_publishable: false` retained. |

---

## 5. Verification & Test Suite Summary

The entire scoring Python test suite was run and passed cleanly:
- **Total Tests:** 149 passed (0 failures, 0 errors in 18.2s).
- **Test Modules:**
  - `test_predictive_evaluator.py`: 11 tests (likelihoods, joint dependency, eval spec, subprocess invariance, real input alignment, fail-closed mappings, conditional cell effects).
  - `test_validation_decision.py`: 9 tests (interval scores, component aggregation, bootstrap, sensitivity checks, gate verification).
  - `test_calibration_sbc.py`: 5 tests (design hash, synthetic data generation, rank computation, SBC analysis, power criteria).
  - `test_validation_preflight.py`: 27 tests (all preflight gates, missing prerequisites, schema-validated calibration).
  - All existing scoring, model, preparation, and integration tests passed.

---

## 6. Final Status & Release Guardrails

- **Production scoring method:** Retained as **ACI 1.4.3**.
- **Candidate promotion:** **None**.
- **Untracked files:** User-owned `exports/` remains untouched.
- **Repository state:** Tooling, unit tests, and audit reports are ready for clean delivery.
