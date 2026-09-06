# Gemini 3.8 Flash: independent reasoning, knowledge and Arena coverage

One new fitted benchmark is supported: **Text Arena, overall, style-controlled, High effort**. The official 2 September 2026 snapshot contains Gemini 3.8 Flash High at **1493.847474085215 Elo**, with native **95% CI [1485.29040995021, 1502.4045382202198]** and **5,125 votes**. The corresponding aggregate standard error is **4.365849048471891 Elo**. The source calls the result preliminary; that label and the native model key `skimaki-kwc6` are retained. [Official leaderboard](https://arena.ai/leaderboard/text/overall), [release changelog](https://arena.ai/company/leaderboard-changelog), [CI methodology](https://arena.ai/blog/arena-rank).

The omission had two causes. The official Hugging Face `latest` export remains dated **1 September**, before this result appeared, and the exact source label `gemini-3.8-flash-high` was missing from the registry aliases. Punctuation itself is already handled: `gemini-3-8-flash` and `gemini-3.8-flash` both resolve to the same registered model. An alias alone cannot recover a row absent from the export.

The complete native 2 September cohort has **400 model configurations**, compared with 398 previously. The two added source labels are Gemini 3.8 Flash High and Claude Fable 5.1 Max. Existing models' ratings also changed (maximum absolute change **3.474893666157641 Elo**), so the payload replaces the entire previous Arena cohort instead of mixing daily fitted scales. All 90 previously mapped rows remain mapped; the two new aliases yield **92 mapped rows covering 82 models**. The existing Gemini 3.7 Flash High row now also retains its explicit High setting under the parent's independently verified alias correction.

## Integration files

- `arena-full-cohort.json`: complete 400-row `RawBenchmarkResult[]`, including unresolved names for audit; integrate this whole source snapshot.
- `arena-mapped-cohort.json`: the same source snapshot restricted to registered models.
- `candidates.json`: only the one new Gemini 3.8 Flash High row; do not append it to old Arena rows if integrating the complete cohort.
- `arena-corrections.json`: exact SHA-256 fingerprints of all 398 old Arena rows to replace, using the unchanged `work/coverage-swarm/merged-records.json` replay as baseline.
- `alias-proposals.json`: the two exact source-declared effort aliases. No alias to an unrelated release or pending model ID.
- `source-manifest.json`, `captures/arena-text.html`, and `arena-native-snapshot.json`: source URLs, retrieval times, hashes and the entire original native dataset. Native cutoff is **2026-09-02T21:00:00.000Z**.
- `source-checks.json`, `gpqa-readiness.json`, `quality-check.json`: source inventory and numeric checks.

The adapter now checks the official native page alongside the full Hugging Face export. It uses the complete native cohort when newer, or if the export is unavailable. It rejects missing/duplicate entries, invalid numeric intervals, partial tables, and other leaderboard categories or style-control settings. A malformed native page leaves a valid complete Hub export available. Source-declared effort is recognized only for the exact trusted source URL, benchmark and registered model base plus one of that model's declared effort tiers. No page JavaScript is executed by the parser.

## Other named sources checked

| Source | Native checks | Gemini 3.8 result |
|---|---|---|
| [Epoch original runs](https://epoch.ai/data/benchmarks.csv) | All **1,679** native CSV rows, plus GPQA, SimpleQA and FrontierMath methodology pages; search normalized punctuation and all native model/config fields | **Zero rows**, including GPQA Diamond, SimpleQA native revisions 1.0.0/1.2.0, FrontierMath v2 Tiers 1–3 and Tier 4. No source-supported new admission. |
| [MathArena full catalog](https://matharena.ai/models) | Complete model catalog and competition manifest page | **35.2% ±1.8 percentage points (95% CI)**, already included in 1.4.1. No duplicate added or selective composite refresh. The composite remains included, per user request. |
| [Scale HLE](https://labs.scale.com/leaderboard/humanitys_last_exam) | Complete native page payload | **Zero Gemini 3.8 matches**. Google's separate verified 1,811-question HLE score is a different condition and is not relabelled as Scale HLE. |
| [ARC Prize](https://arcprize.org/leaderboard) | Native `models.json`, `evaluations.json`, v2 and v3 leaderboard JSON | **Zero Gemini 3.8 matches**. No ARC-AGI-3 RHAE value is treated as accuracy. |
| [Arena public model catalog](https://arena.ai/leaderboard/text/overall) | Embedded model configurations as well as scored overall entries | High has the scored Text result. Medium and Low appear as selectable WebDev configurations, without scored Text entries; they are not assigned the High score. |

These are absences in the retrieved public sources, not claims that no private evaluation exists. ECI projections, older Gemini releases, and overlapping MathArena components were not used to manufacture coverage.

## GPQA readiness, separately scoped

Epoch provides a genuine native `stderr`, and [its methodology](https://epoch.ai/benchmarks/about) explains repeated sampling and standard errors of mean accuracy. These can support an aggregate Gaussian likelihood without inventing binary success counts or assuming every run used 16 repetitions. The refreshed parser yields 158 mapped rows covering 77 models, including **82 rows / 48 models on native revision 1.0.11**, all with positive native SE. The original 1.4.1 registry note claiming no mapped independent observations was stale.

However, native task revisions range from 1.0.0 to 1.0.11, and [Epoch documents a prompt-format change at 1.0.6](https://epoch.ai/benchmarks/gpqa-diamond). Any future fitted promotion should pin/review the native condition and use the reported uncertainty, rather than pool all revisions into an assumed N=198 count. **No broad GPQA promotion is part of this Gemini-focused refresh**, because Gemini 3.8 has no native Epoch GPQA row.

## Validation and replay

All 400 native ratings, exact CI endpoints and vote counts match the captured source; no duplicate source configurations exist. The old cohort is removed as one overlapping source snapshot. No `n_runs` or `x_correct` was fabricated; Arena votes are retained as source sample metadata, with Elo likelihood variance supplied by the reported CI. The complete native page SHA-256 is `01ac4a6fa6eabca237c0dc10c47fd992ba6e1bdb1bd522995ebdfe3f1317dc07`.

Focused native-fallback and existing adapter tests passed: **25 tests**. Ingest TypeScript checking passed. See `tests.log` and `typecheck.log`. To regenerate integration payloads against the frozen captures, run `npx tsx work/gemini-38-coverage/reasoning/build.ts`; fetching is separate in `fetch.mjs`, `fetch-arena.mjs` and `finalize.mjs`. The build explicitly adds only the two proposal aliases in a temporary in-memory registry and does not write shared registry files.
