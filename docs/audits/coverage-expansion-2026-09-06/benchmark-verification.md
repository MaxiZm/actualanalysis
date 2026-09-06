# Benchmark verification · 2026-09-06

Machine-readable companion: [`benchmark-verification.json`](benchmark-verification.json).

**Native worker count: 1.** `spawn_subagent` was not used. Access date: **2026-09-06**.

Scope: all **107** `data/benchmarks/*.yaml` and **30** `data/sources/*.yaml`. HTTP 200 alone was not treated as verification; version, task count, or metric had to be identifiable from official text. Fit weights, pending versions, adapters, models, observations, ingest, scoring, UI, and snapshots were not changed. AA-origin scores were not copied under author sources.

## Counts

| Status | Benchmarks | Sources |
|---|---:|---:|
| checked | 38 | 30 |
| blocked | 69 | 0 |
| not-yet-verified | 0 | 0 |
| **total** | **107** | **30** |

Fitted 19/19 checked. YAML file IDs match JSON IDs 107/30. YAML fixes: 4 existing benchmark files (notes/metadata_sources only). Fetch issues: 11 URLs in JSON `failures`. Registry tests: `npm test --workspace @actualanalysis/shared` — 4 files / **30/30 passed**.

## YAML fixes applied

Only independently verified note/source-pin edits. No `obs_type`, `n_items`, `default_k`, status, or domain-weight changes.

| File | Change |
|---|---|
| `data/benchmarks/vending-bench-2.yaml` | Stale “not fitted” note corrected; official metadata_source added. `$63,000` transform unchanged. |
| `data/benchmarks/metr-time-horizon-1.1.yaml` | Official TH1.1 suite size 228 documented in notes. `n_items` left null (horizon likelihood). |
| `data/benchmarks/tau3-bench-banking.yaml` | Official 97-task / 698-document pins added. `default_k` 4 unchanged. |
| `data/benchmarks/gdpval.yaml` | Notes now state 1320/220 split and pairwise win-rate metric. `obs_type`/`n_items` unchanged. |

## Fitted 19 — checked (prior pass, retained)

`arc-agi-2-semi-private` 120 pass@2; `deepswe`/`deepswe-1.1` 113; FrontierMath T4 **41** private / T1–3 **285** private; `gdpval` 1320/220 pairwise (openai.com HTML failed); `hle-no-tools` 2500 public pin `5a81a4c…`; LMArena style-control 2024-08-29 (1400 Elo is internal ACI); MathArena IRT freeze 2026-09-05; MCPMark **127** / k=4; METR TH1.1 p50, suite **228**; SciCode-Verified v2 64/287 with-background; Epoch SimpleQA Verified 1000-question **accuracy** (keep 1.0.0 vs 1.2.0); SWE-rebench **111**; τ³ banking **97** / Pass^1 vs `default_k` 4; Terminal-Bench 4.0 **66**; FABv2 private 450 partial; Vending-Bench 2 money / ~$63k human.

## Additional checked (prior + this finish)

Prior: `gpqa-diamond` 198; `livebench-2026` via CSV (homepage thin); `harvey-legal-agent-vals-all-pass`; `mrcr-v2-1m-8-needle`; `osworld-2.0` 108 binary vs partial; `arc-agi-3` RHAE, n=55 unconfirmed; `terminal-bench-science-0.1` 70.

This finish (12 remaining, all attempted):

| ID | Result |
|---|---|
| `automationbench-public-1.0.6` | GitHub README 600 public tasks; `task_completed_correctly` vs `partial_credit`. CHANGELOG 1.0.6 = 2026-07-31. Release tag v1.0.6 **404**. Watchlist. |
| `automationbench-public` | Same 600-task public set; retired July umbrella is not a distinct live pin. |
| `benchcad` | 17,900 parts; vendor with-tools voxel IoU on **1,000**-file subset. IoU×exec%, not accuracy. Watchlist. |
| `critpt` | Pin `17c2545` README: 70 scored challenges, 5×70 mean accuracy. `critpt.com` SSL EOF. Watchlist; do not copy AA README rows. |
| `healthbench-professional` | Official PDF HTTP 200: **525** examples; length-adjusted primary score. Watchlist. `source_ids` still vendor-model-cards. |
| `livecodebench-v6-pro` | Homepage stale (300+, 2023–24). GitHub README: `release_v6` = **1055** (May 2023–Apr 2025), n=10. Retired until harness commit. |
| `minebench-spatial-bt` | Leaderboard SPA “Loading…”. FAQ: pairwise BT rating, not accuracy. `n_items` null. Watchlist. |
| `osworld-2.0-2026.06.24-full` | `official-results.json`: v2026.06.24 default full, datasetSize **108**, `binaryAccuracy`. Date 2026-06-26 not on homepage. Watchlist. |
| `osworld-2.0-2026.08.08-offline` | GitHub tag v2026.08.08 live; JSON has `datasetScope=offline`. `n_items` null. YAML “82 offline” not recovered from JSON. Watchlist. |
| `scicode-verified` | Primary site is original SciCode **80/338**, not Verified v2 64/287. Retired 338-count correctly split. |
| `simpleqa-verified` | Kaggle SPA title-only. arXiv:2509.07968 confirms 1000-prompt **F1**. Keep split from Epoch accuracy 1.0.0/1.2.0. Retired. |
| `swe-bench-pro-public` | Scale + arXiv: public **731** of 1865; resolve rate. Retired. |

## Blocked (69)

Unchanged. Vendor-unspecified model-card conditions (Google/OpenAI/Anthropic/xAI/Meta/DeepSeek/Kimi/Qwen harness URLs) and `aa-lcr` (AA origin; licensing restrictions persist). Independent version/task-count/metric confirmation is not available. Each retains its original `block_reason`. Do not promote. Do not duplicate AA scores under author sources.

Includes knowledge/professional vendor rows such as `jobbench-rubric-2026`, `hle-verified-1811-google-202609`, `gdp-pdf-google-202609`, `healthbench-professional-length-adjusted-gpt54`, and HLE-with-tools vendor reports.

## Sources (30/30 checked)

AA manuals remain `redistributable: false`. Epoch/LMArena/SWE-rebench stay CC-BY-4.0. Andon Labs has no redistribution grant. Remaining 11 this pass: AutomationBench GitHub (CHANGELOG MIT; YAML still “See upstream license”); BenchCAD homepage (licenses not restated); CritPt GitHub pin (`critpt.com` SSL fail); Kaggle catalog landing (not a grant); LiveBench homepage thin / CSV ok; LiveCodeBench homepage stale vs GitHub v6; MineBench FAQ vs SPA leaderboard; OpenRouter GET `/models` 200; OSWorld homepage + JSON; Snorkel marketing homepage (not a TB mirror); Terminal-Bench-Science announcement 70 tasks / Apache-2.0 citation. No source YAML edited. `epoch-frontiermath-v2` appears in accepted-input protocols but not as a YAML protocol; it was not invented here.

## Remaining admission blockers

Do not fit the 69 blocked vendor/AA-origin rows. Watchlist/retired checked rows still lack pins the fit contract wants (grader/date/tool_policy/protocol): AutomationBench 1.0.6 has no release tag; HealthBench Professional has no pinned grader or per-run uncertainty; OSWorld dated splits have no per-run denominators; LiveCodeBench v6 is retired until a harness commit; SimpleQA Kaggle F1 must not merge into Epoch accuracy. Active fitted rows already in-registry still emit `metadata_incomplete` warnings (not test failures), including GDPval (no YAML protocol; Gold-220 vs Full-1320 still conflated), METR horizon (`n_items` null), τ³ banking (`default_k` 4 vs live Pass^1), Vending-Bench 2 (aggregate mean/SEM only).

## What was not done

No fit-weight expansion, no watchlist promotion, no adapter/model/observation/ingest/scoring/UI/snapshot edits, no commits/pushes/publication.
