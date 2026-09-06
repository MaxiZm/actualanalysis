# v1.5 validation preflight · 2026-09-07

**Inspected commit:** `08af628cef56df133f3c1804cb301762ad0ec1eb`  
**Machine-readable twin:** [preflight.json](preflight.json)  
**Plan (proposed, not locked):** [candidate-validation-plan.md](candidate-validation-plan.md)  
**Declared lock guide inspected:** [aci-1.5.0-related-release-experiment-lock.md](../../proposals/aci-1.5.0-related-release-experiment-lock.md)  
**Registry accepted via CLI:** [transfer-classes-reviewed-candidate.json](../../../data/experimental/transfer-classes-reviewed-candidate.json) (metadata-reviewed candidate partition; `metadata.components` is a dict of component objects; keys are not identity)  
**Input for availability inventory:** [1.4.3 accepted-input.json](../1.4.3-effort-coverage/accepted-input.json) (observation presence; `y`/`x` not used for cohort selection)

This run is metadata-only. No NUTS, no confirmatory fit.

## Verdict

**NOTREADY**

| Authorization | Value |
|---|---|
| `fit_authorized` | `false` |
| `promotion_authorized` | `false` |
| `promotion_claim` | `not_claimed` |
| `no_fit_reasons` | class registry insufficient; plan/lock unlocked |

Strong gate: insufficient class registry **or** unlocked plan ⇒ no confirmatory fit and no promotion. The 10/3 floor applies to **eligible** certified classes and is not relaxed. JSON booleans do not certify. `real_reviewed_classes_exist` remains JSON `false` and was not forced. Nonpublishable guards were not stripped.

| Layer | Meaning | Actual final registry |
|---|---|---:|
| candidate | relationship-supported `metadata.components` upper bound | **5 components / 2 providers** (Anthropic, DeepSeek) |
| informative | availability-qualified; not certified | **5 / 2** |
| eligible | certified configuration-compatible; **floor applies here** | **0 / 0** |
| floor | 10 components / 3 providers | not met |

`@max-common` co-assignment is not matched settings. Schema-valid with `real_reviewed_classes_exist: false` still fails. Passing unit tests or MCMC convergence is not validation success. A 5/2 candidate upper bound cannot satisfy the eligible floor.

## Candidate actually implemented (not the old draft)

| Role | This validation | 2026-09-06 lock draft |
|---|---|---|
| Candidate | Restricted class prior, global \(\rho\sim\mathrm{Beta}(1,1)\), correlated LKJ traits with **unchanged marginals** | Unimplemented random-walk siblings A (root-SD scale) and B (raw-unit scale); selected candidate **UNSET** |
| Baseline | Nested independent prior: `class_prior` disabled or `pooling.kind=fixed, value=0` (ρ=0 / all-singleton) | Independent root prior (same production baseline) |
| Experimental change | Class pooling only | Predecessor edge prior |

Comparable measurement settings for the implemented pair **pass** this preflight: same correlated traits, same production likelihood, same signed effort prior. Random-walk A/B are not this candidate.

## Gates

| Gate | Result | What was inspected |
|---|---|---|
| Class registry | **FAIL** (4 issues) | Edition `metadata-reviewed-candidate-2026-09-07`. Schema-valid; frozen hash `283844ab88091e20e647165bdf62c0cfdfc27106abb5855847b85e056c58cada`. Canonical provenance is `metadata.components` (dict values; dict keys are not `original_component_id`). Five relationship-supported components (`review_status: relationship-supported-config-unresolved`, `relationship_supported: true`, `config_compatibility_status: unresolved`, `fully_compatible_reviewed_class: false`). `real_reviewed_classes_exist` is JSON `false` and is not forced. Counts: candidate 5/2, informative 5/2, eligible **0**. Floor 10/3 applies to eligible, not the 5/2 upper bound. `@max-common` is not matched settings. |
| Availability family-closure blocks | **PASS** | Loading ≥ 0.25 then family closure, using repaired `prepare` identification (`build_family_index_name_map`, threshold 0.25). **328** successor–domain blocks from row presence; **308** have retained parent-domain rows. By domain: agentic 72, software-code 29, reasoning 86, knowledge-information 69, communication-professional 72. This is **not** 328 independent original components. |
| Frozen lock and selection | **FAIL** (5 issues) | Lock draft: DRAFT, **28 UNSET** tokens, random-walk roster mismatch. Plan markdown is PROPOSED / NOT LOCKED. No frozen prepare manifest. |
| Confirmation exclusion provenance | **FAIL** | No caller-supplied certified metadata. The conservative Gemini development list is a heuristic and is not confirmatory provenance. |
| Comparable measurement settings | **PASS** | Restricted Beta(1,1) vs nested ρ=0; correlated traits; `production_export_issues` still flags enabled class priors as nonpublishable. |
| Predictive / calibration workflow | **FAIL** | Production likelihoods exist in `model.py`. `validate_predictive.py` is a transformed-normal interpolation CV and is **not** production-faithful for this experiment. No paired joint successor-domain scorer, SBC, or prior-predictive workflow. |
| Nonpublishable guards | **PASS** | `is_publishable: false`, `confirmatory_criteria_locked: false`, `real_reviewed_classes_exist: false` retained. |

**12** missing prerequisites are listed in [preflight.json](preflight.json). All were reported; none were bypassed with truthy strings.

## What is implemented versus missing

Implemented at 08af628: restricted class prior; nested ρ=0 baseline; class prior requires correlated LKJ traits; unchanged effort/likelihood; publication blocked; family-disjoint 0.25 holdouts with primary vs family-closure split; confirmatory exclusion requires caller provenance; registry schema freeze; geometry diagnostics; interpolation CV approx; unit tests of **implementation**, not confirmation.

Not implemented: random-walk A/B; certified config-compatible classes; lock for this candidate; certified exclusion artifact; frozen eligible-block manifest; production-faithful paired joint predictive score; prior-predictive and precision/power; SBC suite; leave-one-component / leave-one-provider confirmation; publication policy.

## Next needed input

1. Reviewed class-registry JSON via `--registry` (research-worker output; not a private agent path) with canonical `metadata.components` (`original_component_id`, provider, member_models, source refs, `review_status`), certified configuration-compatible classes meeting 10/3, and `metadata.real_reviewed_classes_exist: true` as JSON boolean. Do not force that flag. Schema-valid + `false` still fails. The candidate 5/2 partition inspected here is not that certified registry.
2. Complete lock JSON for the **implemented** restricted class-prior candidate (not A/B), frozen prepare manifest, and locked plan JSON. Prospective numerical criteria are already proposed in the plan; they are not a completed lock. The plan remains **NOT LOCKED**.
3. Caller-supplied confirmatory exclusion metadata with non-heuristic provenance, `member_models`, and `confirmatory_certified: true` (JSON boolean).
4. **After** those metadata gates pass: implement paired joint predictive scoring that reuses production likelihoods, then calibration/SBC. Do not start expensive fits or strip export guards to skip a missing registry.

CLI (metadata only; no NUTS). `uv --directory` changes cwd, so repo-relative paths must not be used with that flag.

From the repository root, with `PYTHONPATH` and `uv --project` so paths stay relative to the repo:

```text
PYTHONPATH=packages/scoring/python uv run --frozen --project packages/scoring/python \
  python -m aci12.validation_preflight \
  --input docs/audits/1.4.3-effort-coverage/accepted-input.json \
  --registry data/experimental/transfer-classes-reviewed-candidate.json \
  --lock docs/proposals/aci-1.5.0-related-release-experiment-lock.md \
  --plan docs/audits/v1.5-validation-2026-09-07/candidate-validation-plan.md \
  --output docs/audits/v1.5-validation-2026-09-07/preflight.json
```

Or `cd` into the scoring package and pass absolute repository paths:

```text
cd packages/scoring/python
uv run --frozen python -m aci12.validation_preflight \
  --input /ABS/REPO/docs/audits/1.4.3-effort-coverage/accepted-input.json \
  --registry /ABS/REPO/data/experimental/transfer-classes-reviewed-candidate.json \
  --lock /ABS/REPO/docs/proposals/aci-1.5.0-related-release-experiment-lock.md \
  --plan /ABS/REPO/docs/audits/v1.5-validation-2026-09-07/candidate-validation-plan.md \
  --output /ABS/REPO/docs/audits/v1.5-validation-2026-09-07/preflight.json
```

Replace `/ABS/REPO` with the repository root. The inspected worktree root for this run was `/Users/mzalik/Documents/Projects/actualanalysis-grok-v15-validation`.
