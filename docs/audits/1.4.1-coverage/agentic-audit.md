# Agentic and software coverage audit — 2026-09-05

176 source-backed candidate/replacement rows across 66 registered models are ready for integration. Another 152 real source measurements are retained for explicit separate conditions or unresolved model releases; they are not safe to pool into the currently registered conditions. The main coverage recovery is Vending-Bench 2: its native data contains 61 configurations while the initial HTML exposes only ten.

Scope: registered models in snapshot `2026-09-05`; baseline raw replay `work/review-140/merged-records.json`, HEAD `ee2f2c9`. The observation grain is model release × benchmark task/grader version × harness × reasoning/retrieval/tool configuration × measurement lineage. Missing measurements remain absent. No artificial zero, effort-by-score choice, highest-score-only filtering, or benchmark-version equivalence is assumed.

## Integration

- `candidates.json` is a validated `RawResult[]`: all 176 rows have unambiguous registered model IDs and currently compatible benchmark versions. This includes replacements, not 176 newly measured cells.
- `corrections.json` identifies 196 exact old rows using their entire old object, baseline index, and SHA-256 of recursively key-sorted compact JSON. Apply the exact fingerprint removals first. Add each candidate only once, keyed by `metadata.audit_candidate_id`. Several rounded/manual/mirrored old rows legitimately resolve to the same replacement.
- `replacement_candidate_id` points into either candidate or review-only files. When it points to `review-only.json`, retain the measurement only in its proposed separate condition; do not add it to the original fitted benchmark. `action: separate_condition` explicitly requests that boundary.
- `review-only.json` is also schema-valid. All rows carry `config.aci_fit_eligible: false`, a review reason, the exact reported benchmark version and source identity. Unmapped model releases do not have a guessed `model_id`.
- `registry-proposals.json` describes actual SciCode-Verified v2, AutomationBench public 1.0.6, DeepSWE 1.1 and separate OSWorld conditions. Existing source redistribution policies must remain intact. Source captures are audit evidence, not a license to republish entire pages or proprietary tables.
- Regenerate the artifacts with `node node_modules/tsx/dist/cli.mjs work/coverage-swarm/agentic/build.ts`. `RawResultSchema` validates every candidate and review row, and duplicate correction fingerprints fail the build. Native Vending literals are parsed through Acorn without executing downloaded JavaScript.

## Source coverage

| Source | Native rows checked | Compatible rows supplied | Separate condition / unresolved | Baseline rows corrected |
|---|---:|---:|---:|---:|
| Terminal-Bench 4.0 | 18 | 18 | 0 | 18 |
| Terminal-Bench Science 0.1 | 9 unique | 9 | 0 | 6 |
| DeepSWE v1 | 29 | 22 | 7 unmapped | — |
| DeepSWE v1.1 | 70 | 0 | 70 | 35 native/mirror rows moved to separate condition |
| OSWorld 2.0 | 40 | 6 Aug-08 full | 34 other release/subset | 21 |
| MCPMark legacy | 39 | 35 | 4 unmapped | 39 |
| SWE-rebench | 117 configurations | 11 same current cohort | 2 current unmapped; historical windows preserved separately | 16 |
| tau3 Banking | 29 submissions; 27 standard banking | 26 | 1 unmapped banking | 47 |
| METR Horizon 1.1 | 26 | unchanged | 0 | 0 |
| Vending-Bench 2 | 61 | 49 | 12 unmapped | 14 |
| AutomationBench public 1.0.6 | 10 | 0 | 10 | 0; existing quarantines unchanged |
| Actual SciCode-Verified | 12 | 0 pending registry condition | 12 | 0; baseline has no rows |
| Snorkel Terminal-Bench mirror | 14 displayed | 0 additional | same benchmark mirror | 0 |
| BenchCAD native homepage | 3 existing model values crosschecked | unchanged | vendor harness-specific values | 0 |

Of the 176 compatible candidates, 62 have no matching old-row replacement and 114 replace old source records. Distinct model/benchmark coverage is lower than configuration count because all meaningful effort and provider configurations are retained. A candidate can also repair previously lost model mapping: SWE-rebench supplies eleven registered models in the shared task cohort where the public snapshot exposed only six.

## Findings and evidence

**High confidence, high severity — Vending HTML truncates coverage.** The [native page](https://andonlabs.com/evals/vending-bench-2) has a 10-row initial display and 51 more rows. Its public Svelte data bundle contains all 61 `runs.vb2` configurations, including Fable 5.1, five Fable 5 effort settings, Opus 4.8 High/Max, Kimi K3 through both Fireworks and Moonshot, and Muse Spark 1.1. 49 map to 42 registered model releases. The chart's generic five-run heading is not a reliable row count: native `num_final_values` is 4, 5 or 6. `final_value_sem` and the rendered tooltip confirm standard error of the mean. Keep negative balances as measured losses. Arena and geometric-mean results are separate and excluded. Initial ten score/rounded-SE pairs match the prior table; full precision is now retained. Captures: `vending-data.js`, `vending-node.js`, `vending-native-runs.json`.

**High confidence, high severity — DeepSWE versions were mixed.** Both [v1](https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json) and [v1.1](https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json) remain available. The registered benchmark is v1, with 29 native configurations, not the live v1.1 table's 70. 35 prior rows match specific v1.1 scores and move to a separate condition. New v1 rows preserve every configuration, actual attempted-task counts, scored attempts, harness and reported confidence interval. Provider/verifier/network failures are excluded upstream, so do not infer a full 113×4 denominator. MiniMax M3 v1 explicitly uses a binomial Wald interval because its paused/resumed run invalidates a run-to-run CI; that exception is labeled `uncertainty_unit: item`, with no invented run count. Other rows use the native run-to-run CI method.

**High confidence, high severity — OSWorld rows span incompatible releases.** [Official results JSON](https://osworld-v2.xlang.ai/static/data/leaderboard/official-results.json) has 6 Aug-08/full, 11 Aug-08/offline, and 23 June-24/full rows. Omitted row-level versions default to June-24, not the current task manifest. Only the six Aug-08/full rows are supplied as compatible candidates. All 40 retain binary completion; partial score is metadata. Do not pool step budgets or the offline subset, and do not translate a provider's partial score into strict completion. Source gives no reliable repeated-run count.

**High confidence, high severity — MCPMark effort labels were lost.** The [legacy native table](https://mcpmark.ai/leaderboard) identifies `gpt-5.2-2025-12-11` separately from submission `gpt-5-2-high`, and both Gemini 3 Pro High/Low use the same API model ID. The old adapter read effort only from a narrow API-name suffix list. The adapter now reads explicit submission suffixes and preserves all configurations, even when Medium scores above High. Unknown defaults remain unknown. Native pass@1 SD is divided by √4 for SE; pass@4 and pass^4 are not substituted. New standalone regression tests and the existing adapter suite pass (19 tests), plus ingest TypeScript validation. Five extra Flight objects are categories, not model results: 39 is the correct row count, not 44. MCPMark Verified is a separate evaluation and was not mislabeled legacy v1.2.0.

**High confidence, high severity — SWE-rebench needs a shared task window and native aliases.** [Source data](https://swe-rebench.com/leaderboard) contains 117 historical model/scaffold configurations with many time windows and zero-length placeholder ranges. The current displayed common cohort is May 15–July 1, 2026: 111 tasks, 17 configurations, of which 13 are model releases and four are standalone agents. Eleven model releases map to the registry. Exact resolved rate and SEM, ReAct tools scaffold and effort are retained. The source release date resolves DeepSeek V4 Pro to the April-24 Preview, not August's release. No older-window score is added to this condition. Historical source items are saved in `swe-historical-windows.json`; version/harness-commit metadata remain incomplete. The ongoing adapter should parse native rows and pin the chosen common window rather than stripping organization prefixes from rendered labels.

**High confidence, medium severity — tau3 rounded/manual duplicates conceal grader and retrieval.** [Native submission manifest](https://sierra-tau-bench-public.s3.us-west-2.amazonaws.com/submissions/manifest.json) and its submission files expose exact pass^1, dates, effort, retrieval and `tau2-bench 1.0.1`. Older runs were regraded on July 15, 2026; source notes explicitly say pre-1.0.1 results are not equivalent. The 26 mapped standard banking rows replace 47 rounded/manual duplicates. Four trials and the 97-task scope are preserved. AllTools, terminal retrieval, Qwen embeddings and text-embedding retrieval remain explicit conditions. Two custom non-banking submissions and one unregistered Grok 4.2 identity are not fitted as registered models.

**High confidence, medium severity — three Science rows were missing.** [Terminal-Bench Science announcement](https://www.terminal-bench-science.ai/announcement) now exposes nine distinct configurations in chart data. GLM 5.3, Grok 4.6 and GPT-5.6 Luna were absent from the six-row baseline. The chart repeats each configuration; source ID deduplication prevents double counting. Exact values replace rounded existing rows. Seventy tasks and three trials are documented; effort and uncertainty are not supplied and stay unknown.

**High confidence, material new condition — actual SciCode-Verified is distinct from original SciCode.** The [paper](https://arxiv.org/html/2608.04975v1#S3.T1) and [pinned source repository](https://github.com/flyingwagner/scicode-verified/tree/ddab4a92f8d80a7113ab946628e994b52354d838) define v2 on 64 main problems / 287 cumulative subproblems. The registry's 338 came from original SciCode and is inapplicable. Raw baseline has zero `scicode-verified` observations. Proposed rows use with-background main-problem pass@1, with subproblem accuracy only as metadata. Eight registered models have unambiguous current-harness rows. Two DeepSeek Preview rows average three earlier-harness runs and cannot join the single-run common condition. Non-preview DeepSeek Flash and Seed 2.1 Pro still need exact model identities. Reasoning is enabled, but numeric effort tiers are unreported.

**High confidence, material boundary — AutomationBench 1.0.6 must stay version-specific.** A [pinned README](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/README.md) publishes ten public strict-completion scores, including previously absent Gemini 3.5/3.6 Flash. The repository's changelog/version pins identify v1.0.6 and describe task/grader changes. All ten are proposed under `1.0.6-public`; no equivalence to later tasks or the private leaderboard is asserted. Existing provider rows quarantined during 1.4 stay quarantined.

**No score discrepancy established — METR and initial Vending leaders.** All 26 [METR p50 estimates](https://metr.org/assets/benchmark_results_1_1.yaml) match the raw baseline exactly. Preserve the asymmetric published CIs, original minutes and task/scaffold metadata; these are horizon estimates, not accuracy. `metr-verification.json` records every check. The ten initial Vending rendered values agree at displayed precision; new work expands coverage and precision rather than claiming those ten scores were wrong.

**High confidence — BenchCAD remains self-reported, condition-specific.** The [native homepage](https://benchcad.com/) explicitly labels Opus 5 agentic 0.821 and Fable 5.1 0.843 as vendor-reported 1,000-file voxel-IoU with Python tools, not independent regrading. Fable 5 is not published there; Mythos 5 must not be renamed. Existing three self-report rows are not promoted to independent evidence. Exact effort Max can be added for Opus 5 and Fable 5.1; Astra's effort is not stated on this page. The full benchmark's IoU × execution metric is not this vendor subset metric.

## Reproducibility and remaining uncertainty

All successful source fetches are recorded in `captures/manifest*.json` with URLs, timestamps and SHA-256; immutable commits are used where available. `build.ts`, `parse-vending.mjs`, schema validation, and the verification JSONs form the reproducible companion. The data quality skill was applied to source grain, uniqueness, missingness, units, version boundaries, model release mapping and lineage. Primary captures, not search summaries or model-name expectations, authorize accepted measurements.

No formula improvement or published ranking movement is claimed here. Better coverage can change a posterior after integration, but comparative validity depends on the separate conditions and uncertainty described above. Missing older aliases or current top models without compatible benchmark runs remain explicitly unresolved; their absence is not a zero result.

## Ongoing ingestion fixes delivered

`packages/ingest/src/adapters/mcpmark.ts` now preserves explicit submission effort. New `adapters/vending.ts` follows the public site's current Svelte route/data imports and statically parses its `vb2` data through Acorn, so future ingestion reads all model configurations. Register/export `VendingBenchAdapter` (`id: andonlabs`) and add Acorn as a direct ingest dependency during integration. The adapter retains losses, provider variants, per-row SEM and actual run counts; it never imports or executes source JavaScript. Native replay matches all 61 configurations exactly (`vending-adapter-replay.json`).

LiveBench's independent companion is at `work/coverage-swarm/livebench/`: 44 mapped configurations, 17 new relative to the 27-row manual baseline, ten unresolved labels. A new `LiveBenchAdapter` computes equal-category means and explicitly remains observed-only. The parent is handling registration and separate benchmark conditions. The runtime agent owns the OSWorld/SWE-rebench adapters to prevent source version/window errors from recurring.

Final bounded validation: nine new regression tests pass across MCPMark, Vending and LiveBench; ingest TypeScript validation passes. The prior existing adapter suite also passed all 17 tests after the MCPMark change. No model-name ordering constraints were added.
