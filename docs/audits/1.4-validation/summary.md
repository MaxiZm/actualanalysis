# Predictive model audit: retain the correlated baseline

Neither tested structural replacement established a predictive improvement. Keep the existing correlated model with corrected source evidence and effort metadata. Do not claim a new structure is closer to reality merely because a preferred model pair changes order.

## Frozen general-specific candidate

Three predeclared development scales (0.25, 0.5, 1.0) improved development performance. The central 0.5 setting was locked before candidate test results, avoiding selection of a tiny development-only advantage. It then failed the promotion rule on the reserved test (92 observations, 56 model × benchmark groups):

| Measure | Correlated baseline | General-specific |
|---|---:|---:|
| Grouped transformed-score RMSE | 0.780787 | 0.794891 |
| Pooled transformed-score RMSE | 0.807072 | 0.819458 |
| Predictive CRPS | 0.413787 | 0.420745 |
| Matching-benchmark/protocol/effort ordering | 93/109 | 93/109 |
| Nominal 90% predictive coverage | 92.39% | 91.30% |

The grouped RMSE increase was +0.014104, with a model-cluster 90% bootstrap interval of [+0.000735, +0.027968]. Both four-chain, 2,000-warmup/2,000-sample fits passed strict diagnostics. This candidate was rejected; it was not retuned on the opened test.

## Unit-scaled correlated candidate

A separate, explicitly exploratory candidate retained unrestricted LKJ correlations while fixing marginal trait units and using dimensionless shared/domain effort effects. No hyperparameter grid was searched. Three seeds (20260907, 20260908, 20260909) were specified before running any candidate fold. Each held out the complete 20% model × benchmark groups, including every effort and source row. The earlier test rejection and all candidate-selection history are retained.

Across all three folds, 548 observation appearances covered 262 distinct model × benchmark groups and 70 models. Repeated appearances were averaged within their group; the bootstrap resampled entire models across all folds together.

| Equal-group aggregate | Correlated baseline | Unit-scaled correlated | Candidate minus baseline, 90% interval |
|---|---:|---:|---:|
| Transformed-score RMSE | 0.610235 | 0.610382 | +0.000147 [−0.004695, +0.004737] |
| Predictive CRPS | 0.311415 | 0.312293 | +0.000878 [−0.001261, +0.002901] |
| Predictive log density | −0.745987 | −0.751742 | −0.005755 [−0.011789, +0.000529] |

The first fold improved slightly; the second and third worsened. All six fits passed strict diagnostics (R-hat ≤ 1.01, ESS ≥ 400, zero divergences, E-BFMI ≥ 0.3). The aggregate changes are negligible and do not justify promotion.

These overlapping folds use an already-inspected dataset. They are **exploratory repeated cross-validation, not independent confirmatory validation**.

## What the validation protects

Training never receives held-out outcomes or a saved full-data posterior. All effort variants and source repetitions of each held-out model × benchmark stay together. Training connectivity is preserved. Predictions discard learned model-family/cell residuals and integrate fresh residual realizations. Reported uncertainty includes approximate count-to-logit measurement error; money/time and Arena retain their declared transformed coordinates.

Source files and retained results:

- `packages/scoring/python/aci12/validate_predictive.py`
- `packages/scoring/python/tests/test_predictive_validation.py` — 16 focused tests passed.
- `test-general-specific.json`, `decision-lock.json`, and development sensitivity reports.
- `correlated-unit-declaration.json`, all three per-fold reports/logs, and `correlated-unit-summary.json`.
