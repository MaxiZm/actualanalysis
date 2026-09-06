# Coverage delta · snapshot default vs `--refresh-input`

**CLI:** `tsx scripts/audit-benchmark-coverage.ts --compare work/coverage-expansion/ready-input.json --output docs/audits/coverage-expansion-2026-09-06/coverage-delta.json`  
**Baseline:** `docs/audits/1.4.3-effort-coverage/accepted-input.json` (924 observations, 673 cells)  
**Candidate:** `work/coverage-expansion/ready-input.json` (928 observations, 677 cells)

Machine-readable compare output: [`coverage-delta.json`](./coverage-delta.json).

## Gross totals

| Metric | Baseline | Candidate | Delta |
|---|---|---|---|
| Observations | 924 | 928 | **+4** |
| Unique cells | 673 | 677 | **+4** |
| Models | 110 | 110 | 0 |
| Systems | 131 | 131 | 0 |
| Benchmarks | 19 | 19 | 0 |
| Families | 16 | 16 | 0 |

Compare reports **4 added observation keys, 0 removed, 4 added cells**. Field corrections on existing keys are MathArena composite score refreshes of the **same** pinned protocol rows, not new coverage.

## Unique cells vs extra replications vs effort reassignment

| Class | Count | Interpretation |
|---|---|---|
| Unique new cells | **+4** | New `system_id` × `benchmark_id` pairs |
| Effort reassignment | **0** | No profile moves between `@std-common` and `@max-common` |
| Extra replications | **0** | Do not treat score updates or capture replays as independent repetitions |
| Protocol relabel of existing MathArena | **0** | Existing 55 rows keep `matharena-expected-performance-2026-09-05` |

Unique new cells (all MathArena):

1. `claude-3.5-sonnet@max-common` × `matharena-composite` (protocol `matharena`)
2. `claude-fable-5.1@max-common` × `matharena-composite` (protocol `matharena`)
3. `gpt-6-astra@max-common` × `matharena-composite` (protocol `matharena`)
4. `qwen-3.8-max@max-common` × `matharena-composite` (protocol `matharena`)

Rejected, not a cell: `grok-4.20` τ³-Banking (`k_trials: 4` in manual YAML; official headline is Pass^1; notes do not verify pass^1).

## Isolation

No `aa-*` or `critpt` protocols/benchmarks in the candidate public input.
