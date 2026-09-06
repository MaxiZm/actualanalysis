# Maximum-effort coverage policy · 1.4.3

Unreported effort now maps to the maximum profile for every eligible benchmark result. This implements the requested convention that an evaluator's published result without a specified effort represents its maximum-effort submission. The source value remains missing and the interface labels the interpretation **Max assumed**.

Gemini 3.8 Flash's maximum-profile Coverage increases from **4/19 to 5/19** because MathArena now joins DeepSWE v1.1, Arena Text, Terminal-Bench 4.0 and Finance Agent v2 in that profile. The explicit Medium DeepSWE observation remains in the standard profile. Across the catalog, **21 model releases gain direct maximum-profile coverage**; GPT-5.6 Sol changes from 10/19 to 11/19 and GPT-5.5 from 12/19 to 13/19.

## What changed

- `unreported_effort_policy: maximum` is recorded in the current registry, inference input and published run metadata. Historical registries without the field retain the standard fallback; old snapshots are not relabelled.
- Forty-six already-admitted observations move from standard to maximum. Three previously unassigned GPT-6 Astra observations become eligible when its reported maximum is known but its API default is not.
- Explicit source settings, including default, disabled/none, Medium, High, xHigh and numeric effort, remain distinct. Missing-marker strings do not hide an explicit setting in the source configuration.
- Raw scores, source configuration, uncertainty and likelihood measurements are preserved. The existing `metadata_incomplete` flag and 1.5× run-noise adjustment remain active for the new assumption. An absent effort field is not filled with a fabricated High value.
- Benchmark membership, profile weights, prior distributions, calibration panel, likelihood rules and source-compatibility checks are unchanged. A result without usable statistical uncertainty remains observed-only; the effort policy does not create a new count denominator.

This is a declared convention, not confirmation that every evaluator used its actual maximum. It can assign an unreported lower-effort run to maximum. The uncertainty label preserves that distinction; no new predictive superiority on unseen evaluations is claimed.

## Evidence and verification

[Assignment audit](assignment-audit.json) lists every moved and newly admitted observation, along with per-model coverage changes. Its historical control has the same 921 numerical observations, system assignments and uncertainty flags as the actual 1.4.2 preparation. The updated preparation has 924 observations and retains all previous eligible observations. Explicit effort assignments do not change, and no model loses maximum-profile coverage.

The reader now also recognizes one already-reported numeric `compute_effort: 0.99` in an Inkling vendor row. This changes only the extracted description; its raw source field, fitted system and numeric likelihood remain unchanged. See [source-field extraction](source-field-extraction.json).

The [before/after summary](audit-summary.json) compares the committed source evidence and maximum-profile scores against baseline commit `bbd3fee608692b8c16659a076c209169c9f0333c`. The [executed notebook](audit.ipynb) checks all 46 moved observations, the unchanged measured values, Gemini's five maximum-profile cells, its separate explicit Medium run, every reported coverage gain, unchanged modeling choices and accepted numerical diagnostics.

The initial numerical attempt had two divergent steps and was rejected without changing the database or snapshots. The retry increased warm-up from 3,000 to 4,000 iterations and target acceptance from 0.995 to 0.999. Samples, retained draws, prior distributions and the acceptance thresholds were not relaxed. Rejected diagnostics are preserved in `rejected-numerics.json`.

The [accepted input](accepted-input.json), [diagnostics](accepted-diagnostics.json), [preparation audit](preparation-summary.json), [moved-observation trace](moved-observations.json) and [Gemini preparation](focal-preparation.json) make the change inspectable. All previously collected factual source rows retain their values and configurations. This release collects no new external benchmark measurements.

Application checks cover missing values and explicit settings, historical policy replay, alias/configuration precedence, unit preservation, source-versus-assumed UI labels, the actual fitted coverage counter, mobile layout and the published static site. Check outcomes are recorded in `release-checks.json`.

Accepted refit: 12,000 retained draws, zero divergences, maximum R-hat 1.00176, minimum ESS 2,619, minimum E-BFMI 0.826 and maximum displayed-score Monte Carlo error 0.197. Local verification passed 309 unit tests, 24 desktop/mobile browser tests and three static-publication browser tests, plus type checking and lint. The public index resources retain the same 110 estimated models in all three modes, while the visible catalog retains all 126 models.
