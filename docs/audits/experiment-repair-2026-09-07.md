# Experiment-prepare repair · 2026-09-07

**Baseline:** production commit [`a208898`](https://github.com/MaxiZm/actualanalysis/commit/a2088982ff848372d97ccb9f3569074fddf3365f).  
**Scope:** experiment preparation, the class-prior model guard, their regression tests, and the method reference. No commit, push, or deploy.  
**Status:** development tooling only. `is_experimental: true`, `is_publishable: false`. This does not certify transfer classes, does not fit 1.5.0, and does not claim improved predictions.

Frozen 1.4.3 input used for optional regressions: [1.4.3-effort-coverage/accepted-input.json](1.4.3-effort-coverage/accepted-input.json).

## Changes versus a208898

| # | a208898 defect | Repair |
|---|---|---|
| 1 | Gemini exclusion compacted train `system_index` / rebuilt train cells; eval rows kept original indexes. Qwen 3.8 Max reasoning holdouts used `system_index` 121, out of range of the post-exclusion train map. Stale `cell_index` pointed at a different train cell space. | Eval rows keep `system_id` / `model_id` / `benchmark_id`, `original_*` indexes, `train_system_index` / `train_model_index`, `train_benchmark_index`, and `prediction_index`. **`system_index` is the train index**; **`original_system_index` is original**; **`benchmark_index` is unchanged** (conditions not compacted). `index_semantics` documents this. `cell_index` is removed from eval (`original_cell_index` kept). Excluded target fails closed. Cell-less target systems remain in train `system_ids`. Input is deep-copied. |
| 2 | `wrong_class` appended the target onto another class (duplicate partition) or invented `unrelated_distant_model` (absent partner → independent kernel). | Target is moved out of its old class; other members stay; `is_singleton` follows member count. Explicit observed partner (`wrong_class_partner` / `--wrong-class-partner`). Fail closed if omitted, absent, excluded, or already in the target's class. No provider/name inference. |
| 3 | `poor_outcome` sorted remaining successor raw `y` (30%). Count rows often have no `y`; scales differ by condition; Gemini/held-out leakage possible. | In-condition control peers after holdout and Gemini exclusion. Continuous use `y`; counts use success rate. Count and continuous never crossed. Empty `a_exact` / invalid `k` / out-of-range successes: no score, no fabricated denom. Masked rows keep cutoff/score/metric/`n_control_peers`/`n_unique_control_models`. Cutoff unit is all in-condition control **observation rows** (not independent samples; not partitioned by \(k\); matched effort+protocol distinct-model count is diagnostic only). Mask if score ≤ peer 25th percentile. `<2` peers or invalid score → keep and record. |
| 4 | `held_out_families` used `benchmark_family_ids[family_index]`. Those ids are condition-aligned (length 19), not unique-family (length 16). Reasoning holdouts could name `deepswe` and miss `matharena-composite`. | Validated zip of `benchmark_family_ids` × `benchmark_family_index` → index-to-name map. Unique names sorted. |
| 5 | Enabled class pooling also accepted `correlated_unit`, combining pooling with changed marginal scales and effort parameterization. | `model.py` now permits enabled class pooling only with `correlated` (including its omitted-field default), and rejects the one-trait baseline. Trace regressions check early rejection of unit, general-specific, and unknown structures, unchanged non-class behavior, and the exact zero-pooling baseline. |
| 6 | Target conditions used loading ≥ 0.5 or argmax, so HLE (0.30 knowledge) was not a knowledge target. | Default `domain_loading_threshold=0.25`. Family closure removes every successor source/effort row in any family that contains a target condition. **Score only loading ≥ 0.25 target conditions.** `held_out_observations` is the training-removal union, not the default score. Explicit `primary_target_observations` + count and `family_closure_observations` + count; `select_primary_scoring_observations` / `is_default_prediction_row` / `default_prediction_stratum`. Threshold and primary scoring rule frozen on the manifest. |

Hashes still use `sanitize_for_strict_json` + `json.dumps(..., sort_keys=True, allow_nan=False)`.

## Evidence (tests)

`uv run --frozen --directory packages/scoring/python python -m unittest tests.test_experiment -v` (24 OK). Worker-only full discover: 94 OK. After integrating the model guard, the main checkout passed **97 tests** with `uv run --frozen python -m unittest discover -s tests` (11.298 s).

| Test | What it checks |
|---|---|
| `test_input_immutability_and_eval_indexes_after_gemini_exclusion` | Input unchanged; `system_index` is train; `original_system_index` original; `benchmark_index` = `train_benchmark_index`; no eval `cell_index` |
| `test_excluded_target_fails_closed_and_cell_less_target_is_preserved` | Gemini target fails closed; cell-less target kept in `system_ids` |
| `test_wrong_class_requires_observed_partner_and_off_diagonal_pooling` | Missing/absent/excluded/same-class partner fail; no duplicate target; classmate kept as singleton; `pooling_kernel` off-diagonal > 0 |
| `test_poor_outcome_within_condition_peers_counts_and_affine_invariance` | Masked eval rows keep cutoff/score/metric/`n_control_peers`/`n_unique_control_models`; affine + Gemini exclusion; control reference is observation rows, not independent samples |
| `test_count_metric_rejects_invalid_metadata_and_preserves_normalization` | Empty `a_exact` does not fall back to `x`; invalid `k`; out-of-range counts; valid pass-1 normalization |
| `test_primary_score_excludes_same_family_subthreshold_condition` | Same-family 0.8 + 0.1: both removed from train; only 0.8 in `primary_target_observations`; union is removal set |
| `test_family_index_name_map_is_zip_of_condition_aligned_ids` | Zip map; length and inconsistent-name failures |
| `test_loading_threshold_holds_out_hle_knowledge_family_closure` | HLE 0.30 knowledge held out at 0.25; `threshold=0` rejected |
| `test_real_accepted_input_qwen_reasoning_and_gpt52_knowledge` | Frozen accepted input: Qwen original 121 ≥ train `n_systems`; `matharena-composite` not `deepswe`; GPT-5.2 knowledge primary-scores every `hle-no-tools` target row |
| `test_cli_wrong_class_partner_and_threshold_roundtrip` | CLI partner + 0.25 threshold; train hash matches manifest; non-publishable |

## Remaining issues

- Confirmatory criteria are still unlocked; Gemini exclusions remain a development heuristic unless caller-supplied provenance is passed.
- `poor_outcome` cutoff uses all in-condition control **observation rows**. Unique-model counts and matched effort+protocol strata are reported; they are not the cutoff and are not independent samples.
- `poor_outcome` with fewer than two in-condition control peers does not mask (recorded, not invented).
- No NUTS candidate was run against the 924-row payload.

## Independent integration verification

The CLI prepared both holdouts from the frozen 924-observation input. Qwen 3.8 Max reasoning produced 3 primary held-out observations; GPT-5.2 knowledge produced 6, including both HLE rows. Both training payloads contain 112 systems after Gemini exclusion. Every evaluation row resolves to the correct training system through its stable ID and remapped index; no evaluation row retains a training `cell_index`. Neither payload retains successor observations from the removed families. Qwen’s family list contains `matharena-composite` and excludes `deepswe`. Production configuration and snapshots were not modified.
