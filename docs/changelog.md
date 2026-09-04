# Method changelog

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
