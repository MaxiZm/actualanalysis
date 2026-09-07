# ACI v1.5.0 Validation Resolution and Production Decision Report

**Date:** 2026-09-07  
**Inspected commit:** `85350674d1779327d2eb77aa53464d6a3ad31d5d` (dynamic HEAD)  
**Current Production Method:** **ACI 1.4.3**  
**Validation Verdict:** **NOTREADY** (`fit_authorized: false`, `promotion_authorized: false`, `promotion_claim: not_claimed`)  
**Production Decision:** **RETAIN ACI 1.4.3 AS PRODUCTION METHOD** (No candidate promotion)

---

## 1. Executive Summary & Decision

In accordance with strict preregistered release protocols and explicit user instructions ("*Complete v1.5.0 validation, then promote only if it passes*"; "*Never promote a failing or unvalidated method*"):

1. **Production Retained as ACI 1.4.3:** ActualAnalysis Capability Index (ACI) 1.4.3 remains the production scoring method. No candidate model is promoted to production, no export snapshots are altered, and all non-publishable guards remain active.
2. **Confirmatory Fit Blocked:** Confirmatory NUTS fitting for candidate promotion is blocked by preflight gates. Specifically, eligible certified configuration-compatible components stand at 0 (against a non-relaxable operating floor of >= 10 components across >= 3 providers), the experiment lock draft remains unlocked with 28 UNSET tokens, Gemini exclusion provenance lacks confirmatory certification for post-2024 models, and confirmatory empirical simulation-based calibration has not been run on this design.
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
- **Joint Block Estimand & Shared-Family Integration:**
  - Implemented `scoring_mode="block_joint"` (default), evaluating successor-domain blocks simultaneously in a single joint evaluation, integrating shared family effects $u_{s, f}$ jointly across conditions within the block.
  - Provided `scoring_mode="condition_marginal_composite"` with explicit diagnostics for comparison.
  - Withheld cell misfits ($t_4$ mixture via Normal / sqrt(Gamma(2, 2))) are sampled jointly across held-out observations sharing a cell; trained cell misfits are reused conditionally only if the cell has remaining training observations.
- **Monte Carlo Conditioning & Precision:** Conditioned on available training effects with deterministic Monte Carlo integration and Monte Carlo Standard Error (MCSE) calculation.
- **Native Metrics:** Computes paired joint Log Predictive Density (LPD), 90% predictive intervals, and Winkler interval scores ($IS_{0.10}$).

### Workstream 2: Validation Decision Engine & Criteria Correction (`aci12.validation_decision`)
- **Preregistered Bound Correction:** Corrected Criterion C5 in `candidate-validation-plan.md` before any candidate evaluations:
  - Coverage difference 90% CI lower bound >= -0.05 (noninferiority).
  - Normalized interval-score difference 90% CI upper bound <= 0.0 (noninferiority).
  - Explicitly documented why previously reversed signs were invalid.
- **Hierarchical Aggregation:** Aggregates observation -> condition/group -> successor-domain block -> original component with equal component weighting ($1/C$).
- **Fail-Closed Condition Scale Validation:** CLI enforces `validate_condition_scales` requiring finite positive normalization scales for every condition, eliminating silent fallback to 1.0.
- **Paired Cluster Bootstrap:** Deterministic component-level bootstrap resampling for LPD, coverage, and interval score differences.
- **Sensitivity Checks:** Automated leave-one-component-out and leave-one-provider-out verification (C7).
- **Hard Gate Checks:** Automated validation of sampler convergence, lock status, certified evidence, and empirical SBC.

### Workstream 3: Simulation-Based Calibration (SBC) & Prior Predictive (`aci12.calibration_sbc`)
- **Authentic Forward Simulation via Unconditioned Sites:**
  - Updated `aci12.model.aci_model` to inspect `condition_observations = data.get("condition_observations", True)`. When `False`, passes `obs=None` to `obs_normal`, `obs_single`, `obs_total`, and `obs_exact_{i}`, allowing `Predictive(aci_model)` to draw real non-zero synthetic observations from the prior.
  - When `condition_observations=True` (ordinary conditioned fitting), `model.py` fails closed if `per_task_counts` is missing.
- **Truth Parameter Separation:** Stores true underlying parameters separately from simulated observations to prevent test leakage.
- **Comprehensive Design Hashing:** `compute_design_hash` hashes design metadata, effort mappings (`system_is_fixed_effort`, `system_profile_index`, etc.), and structural observation properties (cell, protocol, provenance, system, benchmark, domain, likelihood, n_tasks, k_trials, noise variance), strictly excluding outcome values (`y`, `x`, `score`, `per_task_counts`).
- **Generative Misspecification Stress Tests:**
  - `effort_shift`: Shifts generative prior `effort_mean` before outcome draws, returning the unshifted prior on the fitting template for authentic misspecification testing.
  - `wrong_class`: Partition misspecification.
  - `missing_domain`: Missing domain measurements.
- **Rank Uniformity & Strict Discrete Normalization:** Normalized ranks are strictly bounded in $(0, 1)$ via $(r + 0.5) / (L + 1.0)$ for standard uniform KS testing.
- **Confirmatory Power Standards:** Prespecified criteria requiring >= 100 replications, 4 chains x 1,000 warmup x 1,000 samples, empirical 90% coverage in $[0.85, 0.95]$, KS $p \ge 0.01$, and sampler diagnostics ($R\text{-hat} \le 1.01$, $\text{ESS} \ge 400$, 0 divergences).

### Workstream 4: Configuration Evidence & Gemini Exclusion Provenance
- **Honest Exclusion Provenance:** `data/experimental/gemini-exclusion-provenance.json` records `"confirmatory_certified": false` with documented rationale that cited 2024 publications do not document post-2024 Gemini releases (2.5, 3.x). Preflight fails closed on this gate without truthy-string bypasses.
- **Transfer Class Review:** Investigated and expanded `data/experimental/transfer-classes-reviewed-candidate.json` to 8 relationship-supported components across 5 providers (Anthropic, DeepSeek, xAI, Z.ai, Meta AI). All 8 remain marked `UNRESOLVED` for reference-configuration compatibility.
- **Standard-Trait Estimand Analysis:** The candidate upper bound of 8 components remains below the required floor of >= 10 eligible certified components.

---

## 3. Independent & Host Review Audit Resolutions

All 7 confirmed findings from independent and host audits were fully resolved:

| Review Finding | Resolution Implemented | Verification |
|---|---|---|
| **1. SBC Zero-Observation Conditioning:** `Predictive` echoed zero placeholders due to `obs != None`. | Updated `model.py` to set `obs=None` when `condition_observations=False`. Fails closed when conditioned and counts missing. | `test_synthetic_data_generation_unconditioned_nondegenerate`, `test_exact_likelihood_fails_closed_when_conditioned_without_counts`. |
| **2. Candidate Operating Floor:** 8 components < 10 floor; 0 certified compatible. | Retained preflight gate failure; no post-hoc floor relaxation or synthetic promotion. | `inspect_class_registry` reports `FAIL` (4 issues). |
| **3. Gemini Exclusion Provenance:** 2024 citations do not cover 2025-2026 models. | Set `confirmatory_certified: false` in metadata; documented citation limits. | `inspect_exclusion_provenance` reports `FAIL` (1 issue). |
| **4. Shared-Family Joint Estimand:** Marginal predictive multiplication across conditions. | Implemented `scoring_mode="block_joint"` integrating shared family effects $u_{s,f}$ jointly across conditions in the successor block. | `test_shared_family_block_joint_vs_marginal_composite` verified joint LPD > marginal product. |
| **5. Preflight Audit Integrity:** Stale bypasses in `preflight.json`. | Dynamically resolve commit from HEAD; regenerated `preflight.json` and `preflight.md` reflecting true failure states. | CLI run outputs `NOTREADY`, `fit_authorized: false`, 12 missing prerequisites. |
| **6. Condition Scale Fallback in CLI:** Silent fallback to 1.0. | Enforced `validate_condition_scales` in `validation_decision.py:main()`, raising `ValueError` on missing or non-positive scales. | `test_cli_fails_closed_on_missing_or_invalid_condition_scale`. |
| **7. Discrete Rank Normalization:** Exceeded 1.0 when $r=L$. | Normalization updated to $(r + 0.5) / (L + 1.0)$, strictly in $(0, 1)$. | Unit test passing with Uniform KS test. |
| **8. Calibration Gate Fail-Closed Contract:** Gate allowed missing sampler, bogus parameters, NaN metrics, and missing design hash. | Enforced mandatory `sampler_diagnostics` ($0.95 \le R\text{-hat} \le 1.01$, $\text{ESS} \ge 400$, 0 divergences), strict per-parameter and top-level integer replication floor ($\ge 100$), finite bounded metrics, non-empty design hash matching input, code identity matching inspected commit, and required monitored parameter presence including `class_rho` for class candidate. Updated `calibration_sbc.py` to emit compatible per-replication and aggregate sampler diagnostics. | 10 comprehensive fail-closed regression tests in `TestInspectPredictiveWorkflowFailClosed` verifying host review reproduction, missing sampler, nonfinite metrics, out-of-range metrics, missing/mismatched design hash and code identity, incomplete replications, and missing monitored parameters. |

---

## 4. Preflight Gate Audit

Preflight was executed against `accepted-input.json` and `transfer-classes-reviewed-candidate.json`:

```text
v1.5 validation preflight
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
| `confirmation_exclusion_provenance` | **FAIL** | `confirmatory_certified` is false; post-2024 Gemini models lack primary technical report documentation. |
| `comparable_measurement_settings` | **PASS** | Shared correlated traits, production likelihood, nested rho=0 vs Beta(1,1). |
| `predictive_calibration_workflow` | **FAIL** | Evaluator and SBC tooling implemented; empirical SBC not run to completion on this design. |
| `nonpublishable_guards` | **PASS** | `is_publishable: false` retained. |

**Missing Prerequisites:** 12  
**Verdict:** NOTREADY  
**Decision:** RETAIN BASELINE (ACI 1.4.3)

---

## 5. Verification & Test Suite Summary

- **Python Unit Test Suite:** 164 tests passed (0 failures, 0 errors in 16.6s).
  - `test_calibration_sbc.py`: 9 tests (deterministic design hashing with observation structure and effort mappings, truth separation, misspecification modes, bounded smoke SBC with sampler diagnostics, nondegenerate unconditioned outcomes, seed sensitivity, conditioned exact fail-closed).
  - `test_predictive_evaluator.py`: 12 tests (likelihoods, joint dependency, eval spec, block_joint vs condition_marginal_composite, shared family effects, subprocess reproducibility across PYTHONHASHSEED, model alignment, fail-closed row mappings, conditional cell effects).
  - `test_validation_decision.py`: 10 tests (bootstrap reproducibility, component aggregation, ambiguous provider rejection, condition scale validation, C5 coverage bound, C5 interval score bound, C6 diversity floor, gate verification, CLI fail-closed).
  - `test_validation_preflight.py`: 37 tests (all preflight gates, missing prerequisites, schema-validated calibration results, and 10 fail-closed regression tests covering missing sampler diagnostics, nonfinite metrics, out-of-range diagnostics, bogus parameters, missing/mismatched design hash and code identity, incomplete replications, and class candidate monitored parameters).
  - All existing scoring, model, preparation, and integration tests passed.
- **TypeScript / Web Test Suite:** 33 tests passed (0 failures, 0 errors in 2.8s) via Vitest and workspace suites.

---

## 6. Final Status & Release Guardrails

- **Production scoring method:** Strictly retained as **ACI 1.4.3**.
- **Candidate promotion:** **None** (unvalidated candidate cannot be promoted).
- **Untracked files:** User-owned `exports/` remains untouched.
- **Repository state:** Cleanly tested, audited, and ready for commit, push, and deployment.
