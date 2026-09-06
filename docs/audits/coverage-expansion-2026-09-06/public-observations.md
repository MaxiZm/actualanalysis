# Public observation refresh · 2026-09-07

**Command:** `tsx scripts/prepare-candidate-input.ts --refresh-input --sources=manual,datacurve,matharena --output work/coverage-expansion/ready-input.json`  
**Baseline:** latest snapshot default prepare / accepted 1.4.3 input (`924` observations, `673` cells)  
**Candidate:** refreshed merge (`928` observations, `677` cells)  
**Live feeds:** Datacurve + MathArena + manual adapters (`fallback used: false`)  
**AA isolation:** `0` Artificial Analysis rows in selected records or fitted protocols

Gitignored work artifacts (not published):

| File | Contents |
|---|---|
| `work/coverage-expansion/fresh-raw-capture.json` | `1520` raw adapter records |
| `work/coverage-expansion/selected-merged-records.json` | `1573` lineage-kept public records after capture-replay dedup |
| `work/coverage-expansion/ready-input.json` | Prepared ACI 1.4.3 inference input |
| `work/coverage-expansion/rejections.json` | Scoring rejections, capture-replay supersessions, provenance/lineage supersessions |

## Cell vs replication accounting

Gross audit compare (`tsx scripts/audit-benchmark-coverage.ts --compare work/coverage-expansion/ready-input.json`): **+4 observations**, **+4 cells**. Those two numbers match. There is **no leftover pool of “extra replications.”**

| Kind | Count | What it is |
|---|---|---|
| **Unique new cells** | **+4** | New model × benchmark × profile pairs |
| **Effort reassignment cells** | **0** | No std-common ↔ max-common moves |
| **Extra replications** | **0** | Capture-replay merge collapsed historical/fresh copies of the same source/config/run; conflicting explicit run/lineage/version/effort identities are not unioned |
| **Pinned-protocol MathArena updates** | **field corrections on existing cells** | Same `matharena-expected-performance-2026-09-05` rows; newer composite scores supersede. Not new cells and not independent repetitions |

### Unique new cells (4 MathArena)

- `claude-3.5-sonnet@max-common` × `matharena-composite`
- `claude-fable-5.1@max-common` × `matharena-composite`
- `gpt-6-astra@max-common` × `matharena-composite`
- `qwen-3.8-max@max-common` × `matharena-composite`

`grok-4.20@max-common` × `tau3-bench-banking` is **not** admitted. Manual `data/manual/results/taubench.yaml` sets `k_trials: 4` without verifying the official Pass^1 headline; registry `default_k: 4` is not used as a stand-in. Rejected as unverifiable.

## Dedup evidence

- HLE Kimi K2.5 / Claude Fable 5.1: still **one** Scale row and **one** vendor row each (no doubled Scale copies).
- Luna ARC: still **11** rows, all `arcprize-arc2-standard-2025` (no parallel `arcprize` protocol copies).
- Existing MathArena: **55** rows keep pinned protocol `matharena-expected-performance-2026-09-05`. The 4 new models use source protocol `matharena` because they have no historical pin.

## Policy notes

- Default prepare (no `--refresh-input`) is unchanged: latest snapshot still yields **924 / 673**.
- Refresh normalizes snapshot camelCase to `RawBenchmarkResult`, merges fresh `manual,datacurve,matharena` records by stable source/config/run identity (preserving pinned protocol metadata), then alias-resolves, annotates, and lineage-selects before `coerceAci12RegistryInput`.
- `source_url` is preserved as `url`; provenance, versions, and uncertainty/run fields are passed through.
- Non-redistributable Artificial Analysis rows (`aa-*`, `critpt`, `aa-lcr`) are excluded before coerce.
