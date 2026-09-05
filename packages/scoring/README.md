# ACI scoring

The current index uses one Bayesian NumPyro fit for Mixed, Agentic and Chat.
TypeScript validates source evidence, reasoning settings and lineage; Python
fits five correlated capability traits, effort increments and benchmark/source
effects. All published views come from the same posterior.

The normative equations and limits are in [methodology](../../docs/methodology.md).
Versioned constants are in `data/index-config.yaml`. Version 1.4.0 retains
`trait_structure: correlated`, the LKJ model used by 1.3.2. Reasoning metadata,
configuration aliases, paired probabilities for preliminary systems and numerical
diagnostics are corrected. A replacement capability formula has not demonstrated
a useful predictive improvement.

## Fit and reproduce

Install the locked Python environment with `uv sync --frozen` in the `python`
subdirectory. From the repository root:

```sh
npm run pipeline -- --all --dry-run
npm run pipeline -- --input work/reviewed-records.json --commit-snapshot
```

Publication requires `DATABASE_URL`. A dry run writes its exact indexed input,
posterior, summary and diagnostics under `work/pipeline/<timestamp>/` without
changing the database. Only a complete, accepted three-view run can publish.
The input can also be replayed directly from `packages/scoring/python`:

```sh
uv run --frozen python -m aci12.runner \
  --input /absolute/path/aci12-input.json \
  --output /absolute/path/diagnostics.json \
  --posterior /absolute/path/posterior.npz \
  --summary /absolute/path/summary.json
```

## Predictive validation

The experimental `general_specific` candidate failed its reserved test. A later
`correlated_unit` candidate was evaluated in three prespecified exploratory
repeated folds and did not establish a useful gain. Neither is the production
method. Their results, input hashes and selection history are preserved in the
[validation audit](../../docs/audits/1.4-validation/).

`aci12.validate_predictive` partitions complete model × benchmark groups,
including every effort setting and source report. Development and final test
rows are both excluded from training. Held-out predictions never reuse fitted
cell or family residuals. Fix the candidate using development results before
opening the final test partition.

```sh
uv run --frozen python -m aci12.validate_predictive \
  --input /absolute/path/aci12-input.json \
  --output /absolute/path/development.json --split dev \
  --structures baseline general_specific --domain-specific-sd 0.5 \
  --target-accept 0.98
```

Use `--split test --production` only after recording the candidate decision.
The report contains the split, input/code hashes, sampler checks, proper
predictive scores, matched-configuration ordering and clustered uncertainty.
Development and reserved-test results must be distinguished from later exploratory
repeated cross-validation on the inspected dataset. The predictive scores use
transformed-scale approximations and test missing benchmark prediction within
the connected evidence graph. They do not establish temporal generalization or
universal intelligence.

Run Python regressions with `uv run --frozen python -m unittest discover -s tests`.
They are also part of GitHub CI. `npm test` runs TypeScript evidence and pipeline
checks. Legacy Huber/anchor/bootstrap helpers reproduce historical experiments;
`runScoring` rejects current Bayesian release versions.
