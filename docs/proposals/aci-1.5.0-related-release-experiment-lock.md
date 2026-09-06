# ActualAnalysis 1.5.0 related-release experiment: lock draft

**Status:** DRAFT — NOT LOCKED; no candidate has been implemented or fitted.  
**Date:** 2026-09-06.  
**Method specification:** [Related-release prior, revision 2](aci-1.5.0-related-release-prior.md).  
**Purpose:** specify what must be fixed before a confirmatory evaluation can support changing the production prior.

This file records proposed design decisions and unresolved fields. It is not an executed preregistration, an accepted graph, or evidence of predictive superiority. No confirmation outcome may be inspected while its candidate, graph, split, metric, or decision rule remains open.

## 1. Decision and scope

The decision is whether a reviewed relationship prior improves prediction of a successor's missing substantial domain evidence, with calibrated uncertainty, compared with the 1.4.3 independent-release prior.

The decision does not depend on making Gemini 3.8 Flash exceed Gemini 3.7 Flash. That pair motivated development after its outcomes were inspected. Its underlying documented component is excluded from hyperprior tuning and confirmatory training/scoring. A separate full-data development fit may include it as an illustrative posterior probe.

Keep the measurement likelihood, effort priors, admissibility rules, domain loadings, profile weights, and calibration definition the same for each candidate on a given split. The model relationship prior is the experimental change.

## 2. Candidate roster

| Candidate | Specification | Role |
|---|---|---|
| Baseline | All releases use the retained independent root prior | Required comparator |
| A | Effective raw edge scale is root scale times a dimensionless change scale | Development sibling |
| B | Effective raw edge scale has its own raw-unit prior | Development sibling |

Both siblings use the single non-centered Normal/Gamma construction in method section 5.3 and the sampler target in section 11. Do not add a density on deterministic traits or combine root and edge priors for a child. A correctly implemented centered representation can be equivalent, but is not the canonical implementation contract for this experiment.

Initial development references are 0.35 **dimensionless root-SD multiples** for A's hyperprior scale and 0.35 **raw latent units** for B's. These numbers are not matched prior strength and are not calibrated choices. Both require prior-predictive work.

Student-t tails permit large changes. Neither sibling includes an independent-root mixture or a false-edge indicator. Neither adds correlated innovations, positive drift, provider-specific change scales, or a revised effort model.

**Candidate selected for confirmation:** UNSET. Select one on permitted historical development evidence before opening confirmation. If both are to be tested as confirmatory candidates, lock an explicit multiple-comparison and selection procedure first. A post-test switch to the winning sibling invalidates a single-candidate confirmation claim on that test.

## 3. Evidence and graph records

The development starting input is the 1.4.3 accepted input with SHA-256:

```text
e5d654f41019df63f9f78c28efcd8d83db9bf425bf63e4d2cadb3a166fe23578
```

Every fit uses an archived permitted subset and its own hash; confirmation does not silently reuse all 924 development-reference observations.

| Required record | Current status |
|---|---|
| Historical non-Gemini development cohort and cutoff | UNSET |
| Documentation-only edge registry, including rejected/ambiguous edges | UNSET |
| Source references, archived documentation, available-at and review timestamps | UNSET |
| Original documented component IDs before depth truncation | UNSET |
| Depth-truncated model forest and its hash | UNSET |
| Motivating/development-component exclusion manifest | UNSET |
| Prospective or genuinely untouched confirmation outcomes | UNSET |
| Training, target, and calibration-only observation manifests | UNSET |
| Input and mask hashes for each fit | UNSET |

Eligibility depends on exact release identity, documented relation, chronology, and standard-effort comparability. Equal effort names do not establish equal compute budgets. Outcome ordering, provider reputation, or naming similarity cannot establish an edge.

The proposed maximum model-graph depth is **two edges**. Apply the documented chronological truncation rule in method section 4 and record the resulting new roots. Use the original connected documentation components for uncertainty and exclusion decisions so that graph truncation cannot manufacture independent validation units.

Gemini documentation reviewed after the motivating anomaly remains development context. Do not backdate the review or relabel that anomaly as untouched evidence.

## 4. Prior-predictive and identification prerequisites

Before selecting scales or a confirmatory candidate:

1. Simulate full prior predictive datasets and panel-calibrated differences for A and B using declared metadata and no confirmation outcomes.
2. Report raw changes, root-relative changes, domain/profile display differences, predicted benchmark outcomes, graph depth, and calibration-floor rates.
3. Separately simulate historical posterior-predictive successors using a declared non-Gemini training history; identify this as conditional forecasting rather than prior prediction.
4. Examine whether the prior allows plausible regressions, domain-specific changes, and the scale of changes in historical related pairs outside the motivating component.
5. Record prior/posterior change-scale distributions and their dependence on root scales, effort scales, and residual scales. Count informative matched configurations and independent documented components by domain.
6. Examine signed innovations across all development edges for provider heterogeneity, correlated changes, and systematic drift. Do not use the Gemini pair to set the center or dispersion.

**Prior-predictive report and artifact hash:** UNSET.  
**Selected scale values, units, and rationale:** UNSET.  
**Complete candidate/scale search history:** UNSET.

A's exploratory sensitivity grid is 0.20, 0.35, 0.50, and 0.80, all in dimensionless root-SD multiples. B requires a separately justified raw-unit set; its initial reference is 0.35 raw latent units. Archive every tried setting. Development can select among declared alternatives; sensitivity on the final test is descriptive and cannot retune the same test.

## 5. Primary evaluation cohort

The primary task is prediction of **substantial missing successor-domain evidence on already calibrated conditions**.

For successor \(m\) and target domain \(k\):

1. Identify target conditions with loading at least 0.25 on \(k\).
2. Remove every successor observation from every family containing any target condition, across all sources and effort settings.
3. Score only the target conditions, not every additional condition removed by family closure.
4. Retain legitimate parent observations and other releases' training-only condition calibration evidence.
5. Record all remaining smaller cross-loadings into the target domain. They provide some indirect information and must not be described as zero evidence.

Predefine a stricter secondary stratum that removes every positive-loading target-domain successor condition. Generic random holdouts, easy same-family interpolation, and entirely unseen benchmark conditions are secondary tasks; they cannot substitute for primary domain-transfer success.

**Eligible successor-domain block manifest:** UNSET.  
**Availability-based selection rule and sample-size assessment:** UNSET.  
**Prospective prediction cutoff(s):** UNSET.

Selection uses metadata and evidence availability, not candidate results. Evaluate improved, regressed, and unevenly changed successors. Completely new benchmark conditions require a separate calibration/cold-start protocol and are excluded from the primary score.

## 6. Scoring and aggregation

For each held-out model–condition group, compute the log of its **joint** predictive density, divided by the number of admitted observation rows in that group. Integrate effects shared by held-out rows jointly. This counts neither benchmark task totals nor repeated source rows as independent groups.

Use paired candidate-minus-baseline scores on identical targets. Average repeated appearances of each group within the declared stratum, then groups within successor-domain blocks, blocks within original documented components, and components equally. Archive all resulting weights.

Primary score: mean normalized held-out log predictive density difference under this aggregation. Report its uncertainty, interval calibration, and prespecified regression/sparse-domain safeguards. CRPS or native errors on incompatible scales must be stratified or normalized by a predeclared rule.

For held-out effects, integrate new cell and missing system–family effects. Do not reuse a fitted residual learned from withheld outcomes. Protocol and run effects follow the same training-availability rule. A source label being known does not make its withheld outcomes available for training.

**Numerical predictive-improvement rule:** UNSET.  
**Calibration/noninferiority tolerances, with uncertainty treatment:** UNSET.  
**Component-cluster uncertainty method and precision requirement:** UNSET.  
**Repeated-mask handling and complete score weights:** UNSET.

Raw full-data ACI rankings are not ground truth. Assess latent ranking calibration on simulations with known traits and real-world prediction on held-out observations. Record ranking stability separately.

## 7. Hard diversity and generalization gates

The proposed operating floor is **at least ten informative original documented components across at least three providers**. An informative component supplies an eligible primary block with target outcomes and permitted parent evidence. A positive average over two or three informative trees remains exploratory.

These are minimum design requirements, not proof of adequate statistical power. Finalize them with a development-only precision/power assessment before opening confirmation. Do not lower them after observing a favorable but concentrated result.

Report component/provider counts and weights, repeated appearances, possible dependence through shared protocols, and effective sample size limitations. Component resampling does not automatically resolve all shared global dependence.

Required leave-one-component and leave-one-provider-out safeguards must be fixed numerically before confirmation. Promotion requires those safeguards as well as the aggregate criterion. A result attributable to one component or provider fails the promotion decision even when the total mean improves.

**Precision/power report:** UNSET.  
**Final operating floor, confirmed or revised before test:** UNSET.  
**Deletion-sensitivity decision rules:** UNSET.

## 8. Required stress scenarios

Run simulation-based calibration under each candidate, then separately test misspecification:

- Unmeasured-domain regression despite gains on shared tests.
- A false relationship or abrupt architecture/training change.
- An erroneous or weakly measured parent.
- Source selection and shared optimistic reporting.
- Correlated domain changes, provider heterogeneity, and systematic drift.
- Deep chains beyond the primary depth cap.
- **Unchanged standard traits with shifted effective computation under the same effort label**, including missing settings assigned to maximum.

Record false confident improvements, interval undercoverage, and predictive errors. Set numerical failure tolerances and simulation sizes using development work before evaluating confirmation.

**Simulation design, seeds, size, and failure tolerances:** UNSET.

The Gemini probe must include the contrary display-only LiveBench result. It remains qualitative unless a separately reviewed likelihood can be justified; no invented uncertainty or derived win is admitted to the primary fit. Any admission sensitivity changes the evidence identically for the baseline and candidate and is labeled secondary.

## 9. Mandatory movement reports

Every candidate-versus-baseline and edge-removal score comparison includes:

1. Raw standard/maximum trait posterior means, medians, intervals, and coordinate conventions.
2. Root, change, effective raw edge, and effort scales, including changes after an ablation.
3. Domain/profile panel centers and SDs, uncertainty, and floor-hit rates.
4. Native draw-wise calibrated means/medians/intervals and paired probabilities.
5. The four frozen cross-calibration expectations and symmetric trait/calibration accounting terms defined in method section 13.1, plus the native-mean remainder and Monte Carlo uncertainty.
6. Own direct support, extrapolation labels, source/effort comparability, and uncomputed-diagnostic reasons.

The cross-calibration identity is exact for its specified plug-in means only. It is not a unique causal subtraction of panel stretch, does not decompose posterior medians, and does not make raw-coordinate comparisons invariant. These qualifications must accompany its interpretation.

The own-observation variance ratio is never an evidence share. Edge-removal shifts refit the whole model and are never labeled an isolated causal edge effect. A large hyperprior scale is never used as a substitute for the explicitly fitted no-edge baseline.

## 10. Numerical requirements

Retain four chains, maximum monitored R-hat 1.01, minimum bulk/tail ESS 400, zero divergences, minimum E-BFMI 0.3, and maximum monitored score MCSE 0.3 display points. Monitor new scales, innovations, raw traits, and effort/change dependence. Define pairwise-probability Monte Carlo precision before making threshold decisions.

The canonical non-centered target is the NumPyro candidate specification. No extra prior factors on deterministic traits or changes are permitted. A future alternative parameterization must demonstrate equivalence and correct density/Jacobian handling; it cannot silently change the experiment.

**Sampler implementation revision and tests:** UNSET.  
**Run settings, seeds, and probability-MCSE requirement:** UNSET.

## 11. Publication contract

All development/probe outputs are experimental. Parent cells never enter child coverage, source counts, or direct domain support. Borrowed estimates retain extrapolation labels, and relation-conditioned paired probabilities retain an explicit assumption scope and the existing 0.90 practical-ordering threshold.

Public candidate scorecards omit legacy precision-share, family-share, concentration measures and inherited Verified/Ranked badges. Internal audit artifacts may retain clearly named legacy calculations. A proposed replacement publication policy must itself be specified and assessed before production promotion.

**Validated publication policy:** UNSET.

## 12. Lock completion and decision record

The lock is complete only when all UNSET fields have actual values or an explicitly justified exclusion, the candidate and graph are fixed, required evidence diversity is feasible, and the record is timestamped before confirmation outcomes are opened. A hash without those decisions is not a complete lock.

The eventual result must be one of:

- **Promote:** every predeclared predictive, calibration, diversity, numerical, and publication condition passes.
- **Retain baseline:** the candidate fails or improvement is not established.
- **Exploratory only:** insufficient independent components, unresolved assumptions, or an incomplete confirmation design prevents a production claim.

Record all adverse results, sensitivity runs, deviations, and opened outcomes. A post-test method change requires a new confirmation dataset. Gemini rank reversal has no role in this decision.

## 13. Review disposition

| Review issue | Disposition |
|---|---|
| Root-SD versus raw-unit changes | A and B are explicit siblings with different priors and units |
| Weakly identified five-domain scales | Prior/posterior scale diagnostics, effort-confounding checks, and prior-predictive prerequisites |
| Independent innovations | First-class predictive limitation; correlated changes are separate candidates/stress scenarios |
| Student-t robustness | Described only as tail flexibility; no false-edge mixture claim |
| Standard/max effort mismatch | Eligibility requirement, documented token-use concern, and unchanged-standard-trait / shifted-effort stress test |
| Centered versus non-centered target | One canonical sampler; centered equivalence and Jacobian qualifications retained accurately |
| Calibration feedback | Mandatory raw/panel outputs and explicit plug-in accounting with a remainder |
| Gemini selection bias | Motivating component excluded from tuning and confirmation |
| Small number of trees | Hard diversity/precision/deletion gates, not narrative caveats |
| Primary task diluted by interpolation | Primary family-disjoint successor-domain masks; interpolation is secondary |
| LiveBench contrary evidence | Explicit qualitative/admission-sensitivity probe with no invented likelihood |
| Legacy gates and graph depth | Public legacy badges removed; depth cap and pre-truncation clustering declared |

This draft changes the experimental specification only. The scoring implementation, registry, and published results remain unchanged.
