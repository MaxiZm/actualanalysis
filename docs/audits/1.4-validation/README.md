# ACI 1.4 predictive-validation record

**Decision: retain the correlated baseline with corrected evidence.** The general-specific replacement failed its reserved test. A subsequent unit-scaled correlated replacement showed negligible/mixed changes in explicitly exploratory repeated cross-validation. Neither candidate was promoted. See [the compact report](summary.md) and [the repeated-CV aggregate](correlated-unit-summary.json).

The accepted full-data release is separate from these candidate comparisons: [input](accepted-input.json), [sampler diagnostics](accepted-diagnostics.json), [paired posterior comparisons](accepted-pairs.json), and [release audit with replay commands](../1.4-release-audit.md). Its source observations and calibration panel match the frozen comparison input.

## Frozen data and records

[input.json](input.json) is the corrected, public scoring input used for every comparison. The source and effort metadata were fixed before these fits. The same input is used for both hypotheses within each comparison; these experiments therefore compare mathematical structures, not different evidence catalogs.

Input SHA-256:

```text
693620371a78e87742e2498ac1d06d26b6f9a66ab195ea180f57f1b54c507933
```

All reports retain numeric results, random seeds, row/group partition manifests, diagnostics, and hashes. Their `input_path` fields are normalized to the repository-relative path above; this metadata normalization does not alter the frozen input or numerical results.

| Record | Purpose |
|---|---|
| [development.json](development.json) | Original development comparison: correlated baseline versus general-specific, domain scale 0.5 |
| [development-sd025.json](development-sd025.json), [development-sd100.json](development-sd100.json), [sensitivity.json](sensitivity.json) | The predeclared 0.25/0.5/1.0 development sensitivity grid |
| [decision-lock.json](decision-lock.json) | Central scale 0.5 selected before candidate test results; promotion checks recorded before those results |
| [test-general-specific.json](test-general-specific.json) | Reserved test: both fits passed diagnostics, but grouped prediction error and CRPS worsened; candidate rejected |
| [correlated-unit-declaration.json](correlated-unit-declaration.json) | Separate measurement-unit hypothesis, fixed priors, three prespecified seeds, and explicit history of the rejected candidate |
| [correlated-unit-cv-20260907.json](correlated-unit-cv-20260907.json), [correlated-unit-cv-20260908.json](correlated-unit-cv-20260908.json), [correlated-unit-cv-20260909.json](correlated-unit-cv-20260909.json) | Every prespecified exploratory repeated-CV fold, including unfavorable results |
| [correlated-unit-summary.json](correlated-unit-summary.json) | Aggregate over unique model × benchmark groups, model-cluster uncertainty, and no-promotion assessment |

Each report also identifies the model implementation hash used at fit time:

| Experiment phase | Model source SHA-256 |
|---|---|
| Initial development comparison | `b4e7cc6eb3193aae2b03fec91cace1df6ba3da747aa87f7c770f08603ec65b3f` |
| General-specific sensitivities and reserved test | `73d56a66249cd99165078fd5d50f63fd39ce39b6423d7e5f1141b5d4d5523797` |
| Unit-scaled correlated repeated CV | `0da8e04b44c50ff6ec5ce04809b33356d2203511d2320e3db4607a549aec0185` |

The model file evolved while additional diagnostics and candidate branches were added. The repository retains the named model branches, and the commands below replay their specifications. Historical source hashes are preserved rather than rewritten to the latest hash; byte-identical historical source snapshots were not all retained. Exact posterior bits can also vary with JAX, hardware, and compilation. The archived results are the original records, not regenerated claims.

## Selection history and interpretation

1. General-specific scales 0.25, 0.5, and 1.0 were inspected only on the original development partition. All improved development predictions slightly. The central/default 0.5 scale was selected instead of choosing a tiny apparent gain from the grid.
2. The selected candidate was locked before its reserved-test results. It failed the pre-result rule requiring improved grouped RMSE and CRPS without material ordering/calibration loss. It was rejected and not retuned against that test.
3. A distinct unit-scaled correlated candidate retained unrestricted LKJ correlations and changed trait/effort measurement units. Its priors were fixed, without a new tuning grid. Seeds 20260907, 20260908, and 20260909 were recorded before candidate fold results. An original-development diagnostic was canceled before results; all three new folds were still run.
4. Those folds overlap each other and an already-inspected dataset. They are **exploratory repeated cross-validation, not independent confirmatory validation**. The aggregate changes did not justify promotion. The original rejection remains part of the record.

## Replay commands

Run these commands from the repository root with `uv` installed. They write fresh outputs under `work/validation-replay`, preserving the archived decision history. The frozen input and Python dependency lock are reused. No previous posterior is accepted by the validation runner.

```bash
export ACI_REPO_ROOT="$PWD"
mkdir -p "$ACI_REPO_ROOT/work/validation-replay"

aci_validate() {
  uv run --locked --directory "$ACI_REPO_ROOT/packages/scoring/python" \
    python -m aci12.validate_predictive \
    --input "$ACI_REPO_ROOT/docs/audits/1.4-validation/input.json" \
    --fit-seed 48219 --target-accept 0.98 "$@"
}
```

Original development and predeclared sensitivities:

```bash
aci_validate --output "$ACI_REPO_ROOT/work/validation-replay/development.json" \
  --split dev --split-seed 20260906 --structures baseline general_specific \
  --domain-specific-sd 0.5 --chains 2 --warmup 600 --samples 600

aci_validate --output "$ACI_REPO_ROOT/work/validation-replay/development-sd025.json" \
  --split dev --split-seed 20260906 --structures general_specific \
  --domain-specific-sd 0.25 --chains 2 --warmup 600 --samples 600

aci_validate --output "$ACI_REPO_ROOT/work/validation-replay/development-sd100.json" \
  --split dev --split-seed 20260906 --structures general_specific \
  --domain-specific-sd 1.0 --chains 2 --warmup 600 --samples 600
```

Reserved-test replay of the already-rejected, locked candidate:

```bash
aci_validate --output "$ACI_REPO_ROOT/work/validation-replay/test-general-specific.json" \
  --split test --split-seed 20260906 --structures baseline general_specific \
  --domain-specific-sd 0.5 --production --chains 4 --warmup 2000 --samples 2000
```

All three prespecified exploratory folds, with strict diagnostics despite shorter runs:

```bash
for ACI_CV_SEED in 20260907 20260908 20260909; do
  aci_validate \
    --output "$ACI_REPO_ROOT/work/validation-replay/correlated-unit-cv-$ACI_CV_SEED.json" \
    --split combined --split-seed "$ACI_CV_SEED" \
    --structures baseline correlated_unit --chains 2 --warmup 1000 --samples 1000 \
    --strict-diagnostics \
    --selection-history "$ACI_REPO_ROOT/docs/audits/1.4-validation/correlated-unit-declaration.json"
done
```

Rebuild the repeated-CV aggregate from those fresh outputs:

```bash
uv run --locked --directory "$ACI_REPO_ROOT/packages/scoring/python" python - <<'PY'
import json
import os
from pathlib import Path
from aci12.validate_predictive import repeated_cv_summary, write_report

folder = Path(os.environ["ACI_REPO_ROOT"]) / "work/validation-replay"
reports = [json.loads((folder / f"correlated-unit-cv-{seed}.json").read_text())
           for seed in (20260907, 20260908, 20260909)]
write_report(folder / "correlated-unit-summary.json",
             repeated_cv_summary(reports, "correlated_unit", seed=48221))
PY
```

The aggregate reconstruction computes metrics and uncertainty. The archived assessment additionally records the human decision from the complete selection history; replaying fits does not change that historical decision.

Focused leakage, metric, and aggregation tests:

```bash
uv run --locked --directory "$ACI_REPO_ROOT/packages/scoring/python" \
  python -m unittest discover -s tests -p test_predictive_validation.py -v
```

## Scope and limitations

- Holdout units are complete model × benchmark groups: all effort variants and source rows stay together. Development and test outcomes are both removed from the training likelihood. The original graph connectivity is preserved; held-out models retain at least two training benchmarks and held-out benchmarks at least five training models.
- Every comparison refits from priors using training outcomes only. Held-out predictions discard learned model-family and cell residuals, integrating fresh realizations instead. Protocol effects learned from other training models remain available; unseen protocol × benchmark interactions have zero mean and fresh uncertainty.
- Error metrics named `logit_*` refer to the declared transformed likelihood coordinates. Accuracy uses logits; Arena uses rescaled Elo; money/time keep declared logarithmic transforms. CRPS and predictive log density use approximate count-to-logit measurement variance. They are not claims that every benchmark is a probability.
- Pair ordering compares matching benchmark, protocol, and effort class. It does not count a model beating its own effort variant as an independent comparison.
- Repeated-CV aggregation first averages squared error/CRPS/log density across source, effort, and fold appearances within each unique model × benchmark group. Unique groups receive equal weight; whole models are bootstrapped across every fold together. Repeats are not counted as new independent groups.
- Model-cluster intervals preserve repeated-model dependence, but do not capture every benchmark or overlapping-training dependence. Random connected-cell validation measures interpolation, not temporal generalization, and cannot fully evaluate the sparsest models or benchmarks.
- Predicting held-out benchmark outcomes tests a measurement model. It does not establish a unique definition of intelligence or justify hard-coding a preferred ordering of named products.
