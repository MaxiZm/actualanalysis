# ActualAnalysis 1.5.0 candidate validation plan

**Status:** PROPOSED — NOT LOCKED.  
**Date:** 2026-09-07.  
**Inspected commit:** `08af628cef56df133f3c1804cb301762ad0ec1eb` (97 existing tests at inspection; preflight tests added in this phase).  
**Production method:** ACI 1.4.3. Production config and snapshots are not changed by this plan.  
**This document:** prospective design for the **implemented** restricted class-prior candidate. It is not a complete experiment lock, not a preregistration, and not evidence of predictive superiority.

Confirmation must not open while this plan remains unlocked. Preflight verdict at this phase is **NOTREADY**. Unit tests, MCMC diagnostics, and two illustrative classes are not validation success.

---

## 1. Candidate choice versus the 2026-09-06 lock draft

The [related-release experiment-lock draft](../../proposals/aci-1.5.0-related-release-experiment-lock.md) is **DRAFT — NOT LOCKED**. Its confirmatory roster is:

| Draft candidate | Specification | Status at 08af628 |
|---|---|---|
| Baseline | Independent root prior | Production 1.4.3 trait prior |
| A | Dimensionless root-SD change scale (random-walk / predecessor edge) | **Not implemented** |
| B | Raw-unit edge scale (random-walk / predecessor edge) | **Not implemented** |
| Selected for confirmation | UNSET | Cannot be used |

Those siblings remain proposal-only ([related-release prior](../../proposals/aci-1.5.0-related-release-prior.md)). They are **not** the confirmatory candidate for this validation.

**Implemented candidate (this plan):** restricted exchangeable class pooling on production correlated LKJ traits,

\[
z_m = L_\Sigma\bigl(\sqrt{\rho}\,u_{c(m)}+\sqrt{1-\rho}\,v_m\bigr),\qquad
\rho\sim\mathrm{Beta}(1,1),
\]

with \(u_c,v_m\sim\mathcal N_5(0,I)\) independent. Marginal trait covariance remains \(\Sigma=D_\sigma\Omega D_\sigma\). Effort priors, observation likelihoods, panel calibration, and domain loadings are unchanged. Partition membership is explicit; provider/name guessing is rejected. Fitted releases missing from the partition become `singleton:<id>`. Enabled class pooling requires `trait_structure: correlated`; `correlated_unit`, `general_specific`, and the one-trait baseline are rejected.

**Implemented nested baseline:** the same measurement model with class pooling off: `class_prior` absent/`enabled: false`, or `pooling.kind=fixed` with `value=0` (ρ=0 / all-singleton). At ρ=0 class coordinates are omitted and stochastic sites match the production trait prior.

This isolates whether **class information** helps. It does not test predecessor random walks, signed drift, false-edge mixtures, or a revised effort model.

A post-test switch from this candidate to A/B, or from Beta(1,1) to a tuned ρ prior, invalidates a single-candidate confirmation claim.

---

## 2. What is implemented versus missing

### Implemented at 08af628 (tooling, not a passed validation)

- Restricted class prior and nested ρ=0 baseline (`class_prior.py`, `model.py`).
- `production_export_issues` blocks publication of enabled class-prior fits. Experimental outputs carry `is_experimental: true`, `is_publishable: false`, `confirmatory_criteria_locked: false`, `real_reviewed_classes_exist: false`. **Do not strip these guards to export.**
- `experiment.prepare` family-disjoint successor-domain holdouts: target conditions at declared loading **≥ 0.25**, family closure of every successor source/effort row, **score only primary target conditions**. `held_out_observations` is the training-removal union.
- Confirmatory Gemini exclusion requires caller-supplied provenance; `CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS` is a development heuristic only.
- Transfer-class registry schema validation and SHA-256 freeze.
- Measurement-geometry diagnostics.
- `validate_predictive.py` grouped interpolation CV on a **transformed-normal / logit approximation**. Count rows use a half-count continuity correction. Structures are `baseline` / `general_specific` / `correlated_unit`, **not** `class_prior`. This module is **not** automatically production-faithful for the present experiment.
- Unit tests of implementation behavior (97 at the inspected commit).

### Missing (block confirmation)

- Reviewed documentation-only class registry with `original_component_id`, declared providers, and observed non-Gemini multi-member classes. The file `data/experimental/transfer-classes-example.json` is unreviewed illustrative (two classes) and cannot satisfy the independent-component floor.
- Complete lock for **this** candidate (the 2026-09-06 draft still has UNSET fields and the wrong roster).
- Certified motivating-component exclusion provenance (not the heuristic list).
- Frozen eligible successor-domain block manifest after the reviewed registry arrives.
- Production-faithful paired joint predictive score on primary-target groups that reuses `aci12.model` observation families (`obs_normal`, binomial `a_single`, design-effect `a_total`, `a_exact`) and integrates shared held-out effects jointly.
- Prior-predictive report; development-only precision/power assessment; simulation-based calibration with locked failure tolerances.
- Leave-one-original-component and leave-one-provider-out confirmation workflow.
- Validated publication policy.

Until those exist, preflight is **NOTREADY**. No expensive confirmatory fit. No promotion.

---

## 3. Evidence rules (metadata, not outcomes)

1. **Registry via CLI.** Accept a reviewed registry JSON with `--registry`. External research-worker output will be integrated later. Do not require a private agent path. Do not research class relationships or select classes from candidate scores.
2. **Observed non-Gemini members only.** Unobserved/fake catalog ids, singleton fallbacks, and Gemini-excluded releases do not create pooling classes or independent components.
3. **Canonical provenance is `registry.metadata.components`.** TransferClass objects are strict (`class_id`, `member_models`, `derivation_evidence`, `reference_configuration_compatibility`, `is_singleton`, `notes`). Original-component identity (`original_component_id`, `provider`, `member_models`, source refs, `review_status`) lives under `metadata.components`, not extra per-class keys and not a top-level `original_components` array. Independent units are those declared component ids **before** any depth truncation. Arbitrary slices of one documented tree count as one component. Class ids are not a substitute.
4. **Declared providers only.** Provider identity is a `metadata.components` field. Names, brands, and model YAML organization guesses are not used. `@max-common` is a scoring-input effort label, not matched vendor settings.
5. **Three counts, not one.** Report **candidate** (relationship-supported upper bound), **informative** (availability-qualified diagnostic), and **eligible** (certified configuration-compatible reviewed classes) separately. The 10/3 floor applies to **eligible**. Do not conflate a 5-component / 2-provider candidate upper bound with eligible count 0. JSON booleans, including `real_reviewed_classes_exist`, do **not** certify classes; do not force those flags. Metadata review alone is not certification.
6. **Availability-based cohort construction.** Identify target conditions at loading ≥ 0.25, apply family closure, and count blocks from **observation presence** (`system_index`, `benchmark_index`). Do **not** read `y` / `x` / `per_task_counts` to select the cohort. Score only primary target conditions.
7. **Operating floor (not relaxable):** at least **ten eligible** certified original documented components across at least **three** providers. Candidate/informative counts are not a substitute. A positive average over two or three trees remains exploratory. Do not lower the floor after a concentrated favorable result.
8. **Motivating Gemini component** is excluded from hyperprior tuning and confirmatory training/scoring, using caller-supplied frozen provenance.
9. **Truthy-string bypass is forbidden.** `real_reviewed_classes_exist`, `confirmatory_criteria_locked`, `locked`, and `confirmatory_certified` must be actual JSON `true`. Strings `"true"` / `"yes"` / `"1"` fail closed. Actual JSON `false` on a schema-valid registry still fails; do not rewrite it to pass.

---

## 4. Prospective numerical criteria (fixed before candidate outcomes)

These rules are declared **now**, before any candidate posterior or confirmation outcome is opened. They cannot be retuned on the confirmation set. Numeric fields still marked “requires development-only assessment” must be filled on **non-Gemini historical development evidence** before the plan can be locked. Until then the plan stays **NOT LOCKED**. The **form** of each rule is already fixed so a weak confirmation result cannot rewrite it.

### C1. Primary estimand

For each eligible successor–domain block, compute the **joint** predictive log density of the primary-target observation group under the **production** observation model in `packages/scoring/python/aci12/model.py`. Divide by the number of admitted rows in that group. Shared cell, family, protocol, and run effects that are not identified from training are integrated jointly. Do not reuse a residual learned from withheld outcomes. Do not substitute `validate_predictive.py`’s transformed-normal mixture.

### C2. Pairing

\(d_g=\ell_{\mathrm{candidate},g}-\ell_{\mathrm{baseline},g}\) on identical targets. Baseline is the nested independent model (ρ=0 / disabled class prior) with the same correlated traits, likelihood, effort priors, and holdout masks.

### C3. Aggregation (fixed)

Average repeated appearances of a group within the declared stratum; then groups within successor-domain blocks; then blocks within original documented components; then **original components equally**. Do not weight by row count, task totals, or class-partition cardinality.

### C4. Predictive improvement (proposed-fixed)

Promotion requires the 90% **component-cluster** interval for the component-equal mean of \(d_g\) to lie **entirely above 0**. A positive point estimate, a mean over two classes, or MCMC convergence of ρ is insufficient. No post-hoc margin shrinkage.

A development-only precision/power assessment must still show that this interval rule is feasible at the 10/3 floor **before lock completion**. That assessment cannot use confirmation outcomes and cannot lower C4 to “mean > 0.”

### C5. Calibration / noninferiority (corrected before outcomes; proposed-fixed)

On primary-target groups:

- 90% predictive-interval coverage: \(\mathrm{cov}_\mathrm{cand}\ge\mathrm{cov}_\mathrm{base}-0.05\), and the component-cluster 90% bootstrap interval for \(\mathrm{cov}_\mathrm{cand}-\mathrm{cov}_\mathrm{base}\) has **lower bound \(\ge -0.05\)**. (Corrected: the previous bound required upper bound \(\ge 0\), which was backwards and permitted arbitrarily imprecise estimates with severe coverage loss to pass).
- 90% interval score (lower better; normalized by supplied finite positive training-only condition scales): the component-cluster 90% bootstrap interval for \(\mathrm{IS}_\mathrm{cand}-\mathrm{IS}_\mathrm{base}\) has **upper bound \(\le 0\)** unless a scientifically justified prespecified margin already exists. (Corrected: the previous bound required lower bound \(\le 0\), which was backwards and permitted arbitrarily imprecise degraded interval scores to pass).

These tolerances are declared before candidate outcomes. They are not tuned on confirmation.

### C6. Diversity floor (already declared)

≥10 **eligible** certified original documented components and ≥3 providers. Candidate/informative counts are not a substitute. Not relaxable.

### C7. Deletion safeguards (proposed-fixed)

Leave-one-original-component-out and leave-one-provider-out must each still satisfy C4. A result driven by one component or provider fails even if the pooled mean improves.

### C8. Sampler (already declared)

Four chains; max R-hat 1.01; min bulk/tail ESS 400; zero divergences; min E-BFMI 0.3; max monitored score MCSE 0.3 display points. Monitor `class_rho`, innovations, raw traits, and effort/change dependence. Convergence is a numerical gate, not predictive success.

### C9. Holdout geometry (already implemented)

Loading ≥ 0.25; family closure of all successor source/effort rows; score only primary target conditions; remaining cross-loadings recorded and not described as zero evidence.

### C10. Publication

`production_export_issues` and nonpublishable flags remain until a full Promote decision. Stripping guards to export is forbidden. Public candidate scorecards omit legacy Verified/Ranked badges while experimental.

### Still UNSET before a complete lock

Prior-predictive artifact hash; complete candidate/scale search history (this candidate’s Beta(1,1) is the locked development prior, not a search over A/B scales); eligible block manifest after reviewed registry delivery; input/mask hashes for each fit; simulation design, seeds, size, and false-confidence tolerances; pairwise-probability MCSE requirement; validated publication policy; development-only precision/power report confirming C4–C7 at the 10/3 floor.

---

## 5. Decision record (eventual; not now)

The only admissible terminal results after a **complete** lock and unopened confirmation outcomes are:

- **Promote:** every predeclared predictive, calibration, diversity, numerical, and publication condition passes.
- **Retain baseline:** the candidate fails or improvement is not established.
- **Exploratory only:** fewer than 10 **eligible** certified original components, fewer than 3 eligible providers, unresolved assumptions, or an incomplete confirmation design. A 5/2 candidate upper bound is exploratory only.

This phase cannot return Promote. Preflight **NOTREADY** is Exploratory only / not started.

Gemini rank reversal has no role in the decision.

---

## 6. Phase boundary

This phase prepares the preflight framework, tests, and metadata review. It does **not** implement the production-faithful joint scorer, does **not** run NUTS on the 924-row payload, and does **not** select a favorable class subset.

If and only if a later preflight returns **READY** (reviewed registry, locked plan for this candidate, certified exclusion provenance, 10/3 floor met on availability blocks, comparable settings, and the production-faithful scorer in place), further confirmatory work may proceed under separate authorization. Until then: **no fit, no promotion.**
