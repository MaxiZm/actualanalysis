# Evidence and coverage audit · 1.4.1

This release integrates **887 reviewed additions and replacements** from native benchmark feeds and first-party model documentation. It corrects source identities, transformed scores, duplicate reports and incompatible benchmark conditions. The capability formula, prior distributions, profile weights and 16-system calibration panel are unchanged.

The [before/after inventory](audit-summary.json) reports site evidence separately from fitted observations. More rows do not necessarily mean more independent evidence: some replace rounded values, recover a model alias, or split previously mixed conditions. New documented cells include Muse Spark 1.3 and DeepSeek V4 Flash Vision Exp. Models without a verified measurement remain visible without an invented score.

## Recovered coverage

| Source | Before | Reviewed capture |
|---|---:|---:|
| Arena | 63 mapped configurations | 90 mapped configurations from all 398 overall rows |
| LiveBench | 27 rounded model rows | 44 mapped models from the 54-row source |
| Vending-Bench 2 | 10 configurations | 49 mapped configurations from all 61 native rows |
| MathArena | 49 configurations | 55 mapped configurations from the 96-row catalog |
| SimpleQA | 69 unversioned ECI projections | 62 native runs in two separate task revisions |
| GPQA | 178 ECI projections | 159 native display observations for 77 registered models |

Version-specific benchmark cells are not interchangeable. The combined source audits also cover FrontierMath, ARC Prize, HLE, MCPMark, SWE-rebench, DeepSWE, OSWorld, Terminal-Bench, Terminal-Bench Science, tau3 Banking, METR, AutomationBench, SciCode-Verified and vendor-reported specialist tests. This is a substantial bounded audit, not a claim that every historical score or model has been independently reproduced.

## Material corrections

- Epoch's [ECI preprocessing](https://epoch.ai/data/eci-documentation/data) changes some score scales. All 37 HLE projections match the original Scale result after floor subtraction/rescaling; they were incorrectly treated as additional raw-accuracy evidence. GPQA similarly subtracts chance performance. Both projection sets are removed in favor of native measurements.
- A publisher's batch identifier cannot collapse different models. Lineage selection now scopes identity to the model and condition, while preserving native configurations. Verified manual copies and mirrors are counted once. Equal scores from distinct configurations alone do not prove a duplicate.
- DeepSWE v1/v1.1, SimpleQA task revisions, OSWorld release/subset/metric combinations, and AutomationBench versions are separate. SWE-rebench uses one common 111-task window and tools scaffold. The corrected SciCode-Verified condition uses 64 whole problems, with background and the pinned evaluator.
- MathArena uses its reported bootstrap uncertainty as a continuous estimate. LiveBench, MRCR and OSWorld aggregates remain observed-only where evaluated denominators or uncertainty are unresolved. No nominal task count is converted into invented repeated-trial successes.
- Sixteen model metadata updates verify context limits, modality or reasoning controls. Source-specific configurations remain distinct from documented API defaults.

Detailed working evidence is preserved in the [reasoning audit](reasoning-audit.md), [agentic audit](agentic-audit.md), [supplemental condition corrections](condition-corrections.md), [vendor audit](vendor-audit.md), [correction inventory](correction-inventory.json), [source capture hashes](source-manifests.json) and [frozen MathArena component catalog](matharena-components.json). Historical observations remain in source files or database history; corrected current publication inventories exclude superseded rows.

## Numerical validation

The final dataset supplies **881 fitting observations for 108 model releases and 126 directly observed effort systems**. The fit contains 127 systems, including one inferred configuration without direct observations. All 18 preparation checks pass, including valid variances/counts, separate revisions, unchanged calibration-panel eligibility and absence of known normalized projections or duplicate lineages.

The first numerical attempt failed the existing acceptance checks and made no database or snapshot changes. Sampling precision was increased to four chains, 3,000 warm-up iterations, 5,000 samples per chain and target acceptance 0.995, retaining 12,000 draws. Acceptance still requires zero divergences, R-hat ≤1.01, effective sample size ≥400, E-BFMI ≥0.3 and Monte Carlo error ≤0.3 display points.

The [executed notebook](audit.ipynb) validates the pinned [accepted input](accepted-input.json), [accepted diagnostics](accepted-diagnostics.json), [preparation checks](readiness.json) and before/after inventory using Python's standard library. The [rejected numerical diagnostics](rejected-numerics.json) remain visible. This release establishes source and numerical checks; it does not claim a new out-of-sample predictive improvement or a proven ordering for close models.

## Runtime measurements and limits

Speed/TTFT was refreshed for 85 models and all 113 existing CritPt display measurements were rechecked against exact AA configurations. The task-cost chart uses **AA 4.2**, with 31 available models; 66 historical AA 4.1.1 measurements are retained separately and never mixed into that chart. These attributed private overlays remain outside the fit, public bulk APIs and repository data releases.

Unknown model-release aliases, unsupported effort settings, missing sampling uncertainty and vendor-specific graders remain explicit limitations. In particular, hosted Qwen 3.8 Max results were not transferred to the separately released open-weight 2.4T checkpoint. The [inventory](audit-summary.json) lists models that still lack source-backed site evidence.
