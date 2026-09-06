# Finance Agent v2 — independent admission and likelihood review

**Verdict: the native overall partial-credit condition is defensible for admission with its reported run SEM, explicit source configuration and incomplete-metadata flag.** This adds evidence; it does not establish an improvement in the scoring formula or prove that the resulting ranking is closer to an external ground truth. Do not fit All-Pass or category subscores as additional independent observations of these same runs.

This review is bounded to `fabv2-native.json`, the captured primary Vals page, current likelihood implementation and the proposed domain weights. The completed vendor cohort and condition proposal were also checked directly; the conclusions below apply to one native `default.tasks.overall` row per resolved model configuration.

## Source checks

The [Vals Finance Agent v2 methodology](https://www.vals.ai/benchmarks/fabv2) describes a shared six-tool harness, a two-hour task limit, three runs per model and mean-of-runs scores with standard errors. The leaderboard uses the **450-task private Test split**. The separate 450-task Validation split and 27 public samples are not its denominator.

The primary score is dealbreaker-gated, severity-weighted partial credit. All-Pass requires every check to pass. A three-model LLM jury evaluates responses. The source discloses one Opus 5 refusal fallback to Opus 4.8 among 1,350 run-task outcomes; that outcome already scored zero, leaving the reported accuracy unchanged.

The source's `default.tasks` and duplicate root `tasks` are identical. There are 57 unique model configurations, all with finite positive overall `stderr`, and nine category subscores. Every All-Pass score is at most its corresponding overall partial-credit score. There are no conflicting non-null `reasoning_effort` and `compute_effort` values; 20 rows provide neither.

## Units and uncertainty

Store native `accuracy` and `stderr` together in percentage-point units: `score_unit: percent`, `se: stderr`, `uncertainty_type: se`, `uncertainty_unit: run`, `n_runs: 3`, and `n_items: 450`. `stderr` is already a standard error of the reported mean; **do not divide it by √3 again**. The 450 tasks describe a fixed test set, not 450 independent benchmark replicates. Three runs do not justify fabricating task-level binary counts or 1,350 independent Bernoulli observations.

For Gemini 3.8 Flash, the native row is 61.435% with SEM 0.128 percentage points and explicitly reported high effort. Thus:

- Mean fraction: p = 0.61435.
- SEM in fraction units: s = 0.00128.
- Logit mean: log(p / (1 − p)).
- Delta-method logit variance: [s / {p(1 − p)}]² = **0.00002918781216**.

The current `obs_type: judge` → `a_prime` path implements exactly that unit conversion and variance calculation. The registered observation must remain `judge`, not `count`; multiplying a partial-credit mean by a task count cannot recover a valid integer success count.

All 57 means lie between 15.601% and 61.435%, well away from the transform's clipping boundaries. The largest local transformed SEM is approximately 0.087. This supports a local logit Gaussian approximation of an aggregate expected credit score; it does not imply that individual rubric outcomes follow a Bernoulli distribution. A lower bound of zero is the rubric's score range, not an independently measured random-guess rate.

## Limits of the Gaussian approximation

The reported SEM is estimated from only three runs. Per-run values are unavailable, so this review cannot recompute the estimator or establish its exact sampling distribution. Treating its estimate as perfectly known would understate uncertainty. It also does not cover new-task generalization, judge bias, task/rubric selection, provider drift or all harness variability.

The current posterior likelihood combines the source variance with a learned positive run-discrepancy variance (`variance + omega²`) and source/protocol/model-family effects. That is more defensible than using the small source SEM as the entire observation error. Retain those terms and the incomplete-metadata inflation; do not special-case this benchmark or Gemini to get a tighter posterior. A future robust likelihood or uncertain-SEM model would require separate predictive validation rather than an ad hoc multiplier chosen after seeing ranks.

Set `metadata_incomplete: true`: the page identifies the jury models and common harness but does not give complete immutable grader, prompt, dependency and per-model run revision pins. The Opus fallback deserves an explicit source note. Its published zero outcome provides a reason to retain the measured aggregate, not permission to erase the fallback history.

## Conditions, efforts and domains

Use a distinct native Vals v2 / private Test / overall partial-credit condition. Do not silently overwrite the existing Google-cited observed-only condition, and do not treat a rounded Google citation as an independent replicate. Preserve the secondary All-Pass score and category breakdown in metadata or display-only records with fitting disabled. Likewise, do not duplicate `default.tasks.overall` through the source's root `tasks` alias.

`default` names the source's default harness view; it does not mean default model reasoning effort. Copy non-null `reasoning_effort`, or the explicit `compute_effort` when that is the published field, retaining both raw configuration fields in metadata/config. Unreported tiers remain unreported. Inkling's numeric `0.99` is not equivalent to `high` or `max`; keep its original value and do not assign a supported endpoint without separate model metadata.

The proposed fixed loadings are reasonable as a declared content-based judgment: **agentic 0.35, software 0, reasoning 0.25, knowledge 0.20, communication/professional 0.20**. They sum to one, emphasize multi-step tool use and financial analysis, and give professional answer construction a smaller contribution. No software-code loading is needed merely because tools execute code. These weights are not empirically identified by the source, and the taxonomy does not prove precise percentages. Fix them before fitting, disclose them, and avoid tuning them to promote any model. The old Google-cited 0.5/0.5 configuration should remain separate.

## Admission checklist

1. One mapped configuration → one native overall observation; source model release and provider remain explicit.
2. Partial-credit Gaussian likelihood uses the published SEM in percentage points and `n_runs: 3`; no reconstructed counts or variance.
3. All-Pass, categories, duplicate source objects and rounded citations do not add fitted evidence.
4. Common harness, partial-credit metric, private Test split and exact effort fields are explicit; missing revision pins remain flagged.
5. The final cohort's preparation must select `a_prime` with finite variance, retain source/run discrepancy terms, and pass existing connectivity and calibration checks.

No production code or registry file was edited by this review.

## Completed cohort check

All 40 proposed Finance rows exactly match native overall scores and SEMs, use percentage units, three runs and 450 Test tasks, and preserve the original effort fields. None supplies reconstructed counts or invented per-run arrays. All 40 model IDs and lineage IDs are unique. All optional 40 All-Pass rows explicitly disable fitting. The native partial-credit condition is `obs_type: judge`, its proposed domain weights sum to one, and every Finance row retains `metadata_incomplete: true`. The two numeric Inkling effort rows remain fit-ineligible. The disclosed Opus fallback is present in metadata. No source or mathematical admission blocker remains; final calibration/connectivity and posterior diagnostics remain the production fit's responsibility.
