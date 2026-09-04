# ECI ordering cross-check

Run ActualAnalysis with ECI-compatible unweighted squared loss, export its model
scores, then compare them to an `eci-public` capability export:

```bash
python3 scripts/crosscheck/compare_ordering.py \
  work/actualanalysis-eci-mode.json \
  work/eci-public-capabilities.csv
```

The check requires at least three overlapping canonical model IDs and fails when
Spearman rank correlation is below 0.99. Source data is deliberately not vendored
here; obtain it from the MIT-licensed `epoch-research/eci-public` repository and
preserve its attribution.
