# `@actualanalysis/scoring`

Pure TypeScript implementation of the ActualAnalysis Capability Index (ACI). The
engine has no database or network dependency; callers supply benchmark definitions,
model metadata, and raw result records.

```ts
import { coerceScoringInput, runScoring } from "@actualanalysis/scoring";

const run = runScoring(coerceScoringInput(payload, "agentic"));
```

`payload` may use the package's camelCase interfaces or the shared registries'
snake_case shapes. In particular, the adapter understands `accuracy`, `elo`,
`metr_horizon`, and `log_relative` transforms and the nested `data/index-config.yaml`
layout.

The full pass performs:

1. provenance-tier selection and chance/continuous-score normalization;
2. logit-scale cell-noise and harness-heterogeneity estimation;
3. reference-identified robust 2PL fitting with Adam;
4. discrimination, saturation, source, and holdout weighting;
5. public-outlier downweighting and the final refit;
6. two-model affine anchoring;
7. hierarchical benchmark/cell bootstrap uncertainty and rank probabilities;
8. public-private, leave-one-out, outlier, and mean-win-rate diagnostics; and
9. coverage gating with family-prior shrinkage for provisional models.

For benchmark additions between full method releases, use
`calibrateNewBenchmark(cells, frozenCapabilities)` to fit only the new difficulty and
discrimination.

## CLI

```sh
npm run score -- --input payload.yaml --kind mixed --pretty
npm run score -- --input payload.yaml --all --output runs.json
npm run score -- --input payload.yaml --kind mixed --eci-compatible
```

Use `--bootstrap N` for a quicker local smoke test. The versioned default remains 500.

## ECI ordering cross-check

`--eci-compatible` switches the fit to equal benchmark/cell weights, ordinary
unstandardized squared residuals, and the declared reference benchmark. It exists
only for ordering comparisons; it does not claim numeric equality between ACI's
logit 2PL parameters and ECI parameters.

The checked-in `test/fixtures/eci-synthetic-ordering.json` is deliberately synthetic
and gates Spearman rho at 0.99. It is not represented as real Epoch data. For the
real cross-check, obtain an attributed capability export from the MIT-licensed
`epoch-research/eci-public` repository, export this package's compatibility-mode
scores as `work/actualanalysis-eci-mode.json`, and run the repository utility:

```sh
python3 scripts/crosscheck/compare_ordering.py \
  work/actualanalysis-eci-mode.json \
  work/eci-public-capabilities.csv \
  --candidate-id modelId
```

The utility intersects canonical model ids and exits non-zero below rho 0.99. The
official source data remains out of tree rather than being mislabeled as a vendored
fixture.
