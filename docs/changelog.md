# Changelog

## 1.4.1 — 2026-09-05

- Audit independent benchmark feeds and first-party model cards in parallel. Integrate 887 reviewed additions and replacements, with exact configurations, original source links and explicit measurement boundaries. Newly documented evidence includes Muse Spark 1.3 and DeepSeek V4 Flash Vision Exp.
- Recover complete source tables: Arena grows from 63 to 90 mapped configurations, LiveBench from 27 to 44 mapped models, and Vending-Bench from 10 to 49 mapped configurations. Preserve native effort labels, provider variants, actual repeat counts and source uncertainty.
- Remove 37 normalized HLE projections and 178 normalized GPQA projections from raw-accuracy comparisons. Replace GPQA with 159 native display observations; remove verified duplicate copies and fix the source-batch lineage bug.
- Separate DeepSWE v1/v1.1, native SimpleQA revisions, OSWorld releases/subsets and AutomationBench versions. Admit corrected SciCode-Verified v2 whole-problem results. Keep aggregates with unresolved sampling uncertainty observable without inventing counts.
- Correct model context limits and documented reasoning controls. Refresh speed/TTFT for 85 models, recheck all 113 CritPt display observations, and show task costs from AA 4.2 consistently. Historical AA 4.1.1 costs remain separate.
- Refit the existing correlated-domain method with the same priors, profile weights and calibration panel. Increase numerical sampling precision while retaining the existing acceptance checks. This data release does not claim a new validated capability formula.

See the [coverage audit and executed checks](https://github.com/MaxiZm/actualanalysis/tree/main/docs/audits/1.4.1-coverage) for source scope, corrections, accepted inference and remaining gaps.

## 1.4.0 — 2026-09-05

- Correct GPT-5.6 Sol, Terra and Luna reasoning metadata; restore their explicitly named Arena configurations and GPT-5.5 high before alias deduplication. Preserve every original measurement. Unknown defaults are not invented, and approximate effort assignments carry extra uncertainty.
- Publish joint-posterior pairwise probabilities for preliminary fitted systems. Compare now shows the probability even when the ordering is unresolved; model names and release dates do not impose a ranking.
- Add reproducible model × benchmark holdouts that remove every effort setting and source copy together. Evaluate predictive error, proper distribution scores, uncertainty calibration and matched-configuration ordering with model-cluster uncertainty.
- Reject two experimental formula replacements: the shared-capability variant worsened the original held-out test; the equal-unit correlated variant showed no aggregate improvement over three prespecified exploratory folds. Retain the correlated-trait formula and profile weights. This release does not claim a validated formula improvement.
- Monitor convergence and Monte Carlo error for Chat and Agentic as well as Mixed. Compute E-BFMI from total Hamiltonian energy; incomplete validation inputs cannot pass as successful checks.
- Keep rejected experiments in database audit history and exclude them from public snapshots. Remove the full comparison matrix from header search data to reduce every exported page's payload.

See the [release audit](https://github.com/MaxiZm/actualanalysis/blob/main/docs/audits/1.4-release-audit.md) and [reproducible validation](https://github.com/MaxiZm/actualanalysis/tree/main/docs/audits/1.4-validation) for the accepted fit, comparison results and limitations.

## 1.3.2 — 2026-09-05

- Correct FrontierMath revision identity and private task-set sizes. Read original Epoch runs with exact reasoning settings, run IDs and reported uncertainty; select the latest run per configuration instead of the highest score.
- Preserve reported SE for aggregate means instead of inventing success counts from the registry task-set size. Correct GPT-5.5 Pro default/high and maximum/xhigh metadata.
- Deduplicate confirmed source copies by observation lineage while preserving distinct evaluation configurations. Current exports follow the accepted run’s evidence inventory; earlier erroneous rows remain in audit history.
- Expand the catalog from 88 to 126 model releases, covering all 58 unique releases in the first 100 published AA configurations. Keep models with no fitted estimate visible in every profile.
- Add attributed CritPt physics results, AA cost per task, and configuration-matched speed and latency measurements. Add index-versus-task-cost charts to Leaderboard and Compare. The AA overlay remains separate from the public fit and bulk downloads.
- Keep each displayed benchmark score with its own configuration and uncertainty; never borrow a smaller standard error from another run.
- Quarantine new publisher observations whose task version, metric or subset cannot be matched; do not improve coverage by pooling incompatible tests.

The corrected fit covers 108 models and 19 benchmark conditions, with 8,000 retained draws, zero divergences and maximum monitored R-hat 1.003. GPT-5.5 Pro’s maximum-effort Mixed median is 68.3 versus 64.9 for GPT-5.5; uncertainty remains substantial.

## 1.3.1 — 2026-09-05

- Retire SWE-bench Pro Public and LiveCodeBench v6 Pro from the joint fit, public benchmark list and current exports. GSM8K and standalone AIME 2025 are absent. MathArena composite remains intact, including its AIME 2025 component.
- Use SWE-rebench, DeepSWE and SciCode Verified for the software-code utility basket. Preserve the calibration panel and evidence gates.
- Order all model estimates together by their displayed median in Mixed, Agentic and Chat. Preliminary status is shown with an asterisk and uncertainty; it does not hide or demote a model. List positions include every model; eligible-subset statistical ranks remain export metadata.
- Replace the Ranked models count with the total model count. Remove the Ranked only control and ignore its legacy URL filter.
- Explain score-profile weights beside the switch. Keep the chosen head-to-head pair stable when the profile changes and accent its active metric.
- Rebuild Capability and Price & speed around one interactive chart and a compact, searchable model table. Add metric selection, runtime column sorting and visible measurement coverage.
- Rebuild benchmark comparison as a source-linked results table with configuration details, reported-model counts and explicit missing values. Raw benchmark results do not depend on a score profile.
- Remove duplicate navigation underlines, isolate active-control animations and close mobile navigation after selection.

The new joint fit passed all configured sampler checks with 8,000 retained draws, zero divergences, maximum monitored R-hat 1.003 and minimum monitored effective sample size 1,475. It fits 19 benchmark conditions; the public evidence catalogue contains 27.

## 1.3.0 — 2026-09-04

This release aligns the three capability views and rebuilds the comparison interface.

- Mixed, Agentic and Chat use weighted domain composites on the same panel-relative 50/10 scale. Chat no longer uses a basket percentage as its index. All available preliminary medians are visible by default; published ranks retain evidence and uncertainty gates.
- Fix the basket predictor: use the benchmark intercept once and apply all domain loadings. Only explicitly utility-eligible conditions can enter utility baskets. Incomplete baskets are withheld.
- Normalize fractional and percentage reports onto the same chart scale; use percentage-point differences in Compare and consistent units for time horizons.
- Report calibrated benchmark location and slope instead of mislabelling the raw negative intercept as difficulty. Compute expected cell values from the median of the derived draw-wise predictor.
- Enforce the configured family information-share gate. Remove the invalid exposure-gap calculation that compared raw values across different benchmarks.
- Remove ARC-AGI-3 from fitting: RHAE is a continuous efficiency score, not a binomial success rate. Observed results remain available.
- Add 25 cited observations across AutomationBench public, Terminal-Bench-Science 0.1, HealthBench Professional and the BenchCAD agentic 1k subset. Only compatible AutomationBench public observations enter the fit; other new conditions remain observed-only.
- Add Gemini 3.8 Flash's official input/output limits and reasoning tiers. Its preliminary index is visible in all views.
- Replace native selection controls with searchable Cult UI popovers and command menus. Unify navigation, dialogs, checkboxes, tooltips and control spacing; remove the blinking snapshot indicator.
- Rebuild Compare around a two-model summary and a compact source-results table. Separate capability, runtime and benchmark exploration. Add pointer and keyboard chart tooltips and remove colliding scatter labels.
- Show numeric uncertainty as ± with exact intervals on focus. Use corporate logos and attributed, variant-specific runtime measurements. Preserve missing values and display-only data boundaries.
- Render Changelog from this document so 1.2.3 and future entries cannot silently disappear. Rewrite methodology to distinguish implemented diagnostics from validation that has not been performed.

The new joint fit passed the configured sampler checks with 8,000 retained draws and no divergences. This is a numerical acceptance result; held-out predictive validation and profile-weight sensitivity are not yet established.

### Corrections to earlier release descriptions

Some 1.2.2 and 1.2.3 notes below described specification targets as completed validation. Full prior/refit variance reduction, PSIS-LOO, adversarial refits and simulation/holdout acceptance were not implemented as claimed. Raw-panel soft pinning was optional and disabled in the accepted 1.2.3 fit. Version 1.3.0 documents the actual behavior and leaves unavailable diagnostics null.

## 1.2.3 — 2026-09-04

- First method-1.2 run that actually executes on the registry data: 1,181 of 1,298 observations across 95 systems and 20 benchmarks enter the joint fit (1.2.2 admitted 46).
- Observations are never rejected for an unknown or intermediate effort tier. A model without a declared effort dial is a fixed-effort system that takes every observation; a variable-effort model maps the observed tier to the nearer of its default/max tiers; approximate assignments are flagged `metadata_incomplete` (1.5× run noise).
- Money benchmarks accept a reported mean balance with a standard error (delta method on log2) when per-run balances are not published.
- Registry admission for active benchmarks now follows §1: only likelihood-critical fields (`obs_type`, `default_k`, domains) are mandatory; missing provenance pins and missing source protocols are inherited as `metadata_incomplete` instead of blocking the run. Seventeen benchmarks with ≥8 independent results were promoted from `watchlist`.
- Calibration-panel rule: every domain needs ≥1 independent cell and at least three domains need ≥2 (1.2.2 required ≥2 in all five, which no fitted system satisfied). The panel is 16 systems from nine vendors released between April 2025 and July 2026, and the audit now publishes every qualifying candidate.
- Identification is imposed inside the model: the calibration panel's per-domain mean and standard deviation are pinned (soft factor, sd 0.02) so the raw posterior of Z, β and α is identified and R-hat/ESS on them are meaningful. Published scales still standardize on the panel per draw.
- Observation likelihoods are vectorized by family (normal, single-trial binomial, multi-trial normal approximation, exact per-task counts); the protocol×condition interaction ξ_pb (§3) is now in the likelihood.
- Per-cell evidence (`observed_logit`, predicted logit, misfit, z) is computed from the posterior instead of being emitted as zeros; the concentration gate uses each cell's observation variance; diagnostics that are not computed in this release (`loo_max_delta`, `adversarial_shift`) are published as null rather than 0.
- Run artifacts labelled 1.2.x are rejected unless they carry the NumPyro NUTS diagnostics (`engine`, `accepted`, `posterior_draws`, `elapsed_seconds`, `divergences`) and a posterior path. The 2026-09-04 snapshot that presented a relabelled 1.0.0 fit as a 1.2.2 run was removed; placeholder speed rows were removed.
- Trait spread per domain uses a LogNormal(0, 0.5) prior instead of HalfNormal: with HalfNormal the software-code and communication traits collapsed (spread 0.14 and 0.13 against 1.7 for agentic) and every domain score in them was extrapolated; with LogNormal all five domains are live (1.59 / 0.42 / 1.93 / 0.82 / 0.36) and code correlates 0.3–0.4 with the other domains instead of 0.
- Panel standardization stays per draw (§5.1). With the HalfNormal prior the per-draw panel spread collapsed in weak domains and produced 60–95-point intervals; the LogNormal prior removes the cause, so no constant-scale workaround is used.
- SWE-bench Pro, SWE-rebench and DeepSWE are software-code-primary (0.70 code / 0.25 agentic / 0.05 reasoning); previously 0.45 code / 0.50 agentic left the code trait identified only by LiveCodeBench.
- Tier thresholds calibrated to the observed interval widths (median 13.5 points for well-covered systems): Verified ≤ 12 points, ≥ 4 domains, ≥ 2 safe cells, family share ≤ 0.50, R_s ≥ 0.70, concentration ≤ 0.50; Ranked ≤ 20 points, ≥ 3 domains, ≥ 1 safe cell, family share ≤ 0.80, R_s ≥ 0.50, concentration ≤ 0.80; domain point scores need ≥ 2 cells with domain share ≥ 0.25, width ≤ 20 and R_s ≥ 0.5. On the 2026-09-04 data this yields 1 verified, 69 ranked and 25 provisional systems.
- NUTS: 4 chains × 2,000 warm-up + 3,000 samples, target acceptance 0.98, diagonal mass matrix (a dense block saturated the tree depth), convergence judged on the panel-calibrated estimands, Monte Carlo SE of every score ≤ 0.3 display points; the accepted run has zero divergences, R-hat ≤ 1.009, ESS ≥ 877, E-BFMI ≥ 0.98 and takes about 6.5 minutes on a laptop CPU.
- A run set is published when the mixed view ranks at least one system; a profile view in which no system reaches Ranked (currently chat, because the communication domain is thin) is published as intervals only instead of blocking the whole release.
- Reasoning basket of every profile uses `matharena-composite` instead of `gpqa-diamond` (no independent GPQA results in the registry; a missing basket member made every basket unpublishable).
- NUTS runs its chains in parallel on CPU devices; `ACI12_CHAINS/WARMUP/SAMPLES` environment overrides exist for development runs only.

## 1.2.2 — 2026-09-04

- Replaced pinned reference benchmark with fully unpinned condition intercepts and discriminations identified per draw over the calibration panel.
- Correlated latent capability traits $Z_{sk}$ using LKJ(2) correlation matrix across the 5 capability domains.
- Implemented single-system rule: models with fixed effort (default equals max effort) are represented by exactly one system carrying both class labels with $\delta_m \equiv 0$.
- Enforced calibration panel selection rule (§2.6): every panel system must have $\ge 2$ independent cells in all 5 domains; emits metadata unblock table upon failure.
- Published three distinct score scales with explicit unit descriptions: ACI-G (equal-domain composite), ACI-Domain, and ACI-Basket (expected normalized utility % on utility-eligible conditions).
- Implemented exact Gaussian conditional machinery for own-data variance reduction $R_s(Q)$ and panel-scaled precision-drop concentration gate ($c_{sF}$).
- Added comprehensive diagnostics (§10): PSIS-LOO PIT residuals, exposure gap $E_s^{\text{gap}}$, difficulty drift, overlap graph and reference component partitioning, and adversarial fit release gate.
- Enforced practical margin $\delta=1.0$ in pairwise comparisons with unresolved state.
- Enforced release acceptance gates (§12): zero divergences, SBC prior/posterior recovery, holdout validation, and pipeline invariance.

## 1.2.1 — 2026-09-04

- Added versioned, dated source protocols for provenance, effort, harness, tool-policy, benchmark-version, and grader-version inheritance.
- Made row-level declarations override protocol fields and marked inferred versions and unresolved protocol metadata as `metadata_incomplete` instead of inventing rejection reasons.
- Restricted scoring rejections to the normative closed list and allowed unknown agentic harnesses to enter the std profile with inflated run noise; a declared native harness remains incompatible with std.
- Replaced the fixed HLE reference with the active benchmark having the greatest independent, version-matched calibration-panel coverage, recorded in calibration edition 2026a.
- Kept publication fail-closed when the frozen panel lacks eligible evidence.

## 1.2.0 — 2026-09-04

- Replaced the three separately weighted robust-loss fits with one joint five-domain NumPyro model.
- Defined systems as model snapshots at declared `std` or `max` effort profiles and stopped score-based configuration selection.
- Added count-aware beta-binomial/binomial likelihoods and direct normal-scale likelihoods for Elo, horizons, money, and reported-SE scores.
- Added provenance offsets, partially pooled run noise, named harness effects, family effects, and heavy-tailed cell misfit.
- Replaced fixed score anchors and the hierarchical bootstrap with a draw-wise frozen-panel display map and posterior rank distributions.
- Added Verified, Ranked, and Provisional evidence gates plus domain and task-profile publication gates.
- Made incomplete panel/profile metadata a hard publication failure rather than falling back to the 1.1 scorer.

## 1.1.0 — 2026-09-04

- Added a 0.15-logit noise floor and a 0.25 cross-harness prior when fewer than ten independent pairs exist.
- Rebalanced benchmark weights by category, removed discrimination double-weighting, and capped every benchmark at 15%.
- Promoted seven benchmarks with sufficient model coverage and made canonical configuration selection deterministic without dropping tied cells.
- Withheld point scores, ranks, and pairwise comparisons for provisional models.
- Changed anchors to GPT-4.1 = 40 and Claude Opus 5 = 100 with coverage and raw-gap publication guards.
- Standardized residuals with benchmark leave-one-out variance and changed optimizer convergence to gradient/update stationarity.

## 1.0.0 — 2026-09-04

- Initial three-index design: Mixed, Agentic, and Chat.
- Added logit-scale chance correction and declared continuous transforms.
- Added robust 2PL fitting, quality weights, hierarchical bootstrap uncertainty, and two-anchor presentation scaling.
- Added public/private, leave-one-out, residual, ordinal, and coverage diagnostics.
- Added source-tier supersession and fixed-parameter calibration policy for newly introduced benchmarks.
- Added guarded three-index snapshot publication and a fresh-database round-trip verifier.
- Fixed the presentation scale at Gemini 2.5 Pro = 100 and Claude Opus 5 = 110, a broadly covered pair whose fitted order is stable across all three indexes.
- Added strict uncertainty eligibility, deterministic canonical-configuration selection, exact-run atomic snapshots, and published input/config/registry hashes.
- Bootstrap runs now require 500 valid refits, use only observed temporary reference benchmarks, and publish invalid-draw reason counts.
