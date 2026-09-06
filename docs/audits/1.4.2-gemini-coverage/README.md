# Gemini 3.8 Flash coverage · 1.4.2

Gemini 3.8 Flash now has **18 distinct reported benchmark conditions, up from nine**, and **five fitted conditions across configurations, up from three**. Its displayed maximum-effort profile has four directly fitted cells. MathArena's unreported effort remains approximate in the standard profile; it is not reassigned to High to inflate coverage. The update recovers missing native Arena evidence and adds independently measured Finance Agent v2 results. It also corrects Terminal-Bench provenance and documents additional specialist tests. Counts here exclude the separate Artificial Analysis display overlay.

The capability formula, prior distributions, profile weights, frozen 16-system calibration panel and numerical settings are unchanged. This release adds and corrects evidence; it does not claim a newly validated prediction formula or impose a desired model ordering.

## Evidence added and corrected

| Evidence | Decision |
|---|---|
| Arena Text, overall, style-controlled, High | Add Gemini's native result with its exact 95% interval; replace the entire older Arena cohort so daily rating scales are not mixed. |
| Finance Agent v2, private Test, partial credit | Add 40 mapped source configurations; 38 enter the continuous likelihood with published run SEM. Two unsupported numeric effort settings remain observed-only. |
| Terminal-Bench 4.0 | Recognize the shared official mini-SWE-agent harness for Gemini 3.7/3.8 and preserve native run uncertainty. Retire rounded vendor mirrors. |
| Harvey Legal Agent | Add 41 native source results for inspection; unresolved uncertainty units keep this condition outside the fit. |
| LVBench static and agentic; BioMysteryBench human-solvable and human-difficult; LABBench2 macro-average | Add five distinct Google-reported conditions. Preserve subset and metric definitions; absent sampling uncertainty prevents admission. |
| MineBench spatial construction | Add the exact ordinary Gemini 3.8 Flash public rating and interval, with source-declared High configuration. Observe only; this focused capture does not calibrate a new fitted benchmark. |

[Arena](https://arena.ai/leaderboard/text/overall) had a newer official publication than its Hugging Face latest export. The adapter now validates both feeds and chooses the newer complete compatible cohort. All 90 previously mapped configurations remain available; Gemini 3.8 Flash High and Fable 5.1 Max bring the mapped count to 92. Tests cover incomplete tables, incompatible leaderboard settings, invalid intervals, duplicate names and endpoint failure.

[Finance Agent v2](https://www.vals.ai/benchmarks/fabv2) uses 450 private Test tasks and three runs. Its partial-credit mean and SEM are continuous measurements, not integer correctness counts. Gemini's mean is 61.435% with SEM 0.128 percentage points at High effort. The Gaussian logit variance is 0.00002918781216. SEM is not divided by √3 a second time. The current learned run-discrepancy term and incomplete-provenance adjustment remain enabled. Finance All-Pass and category results are retained as secondary metadata, without extra fitted observations. Domain loadings were fixed from task content before fitting: 35% agentic, 25% reasoning, 20% knowledge and 20% professional communication.

The documented API default for Gemini 3.7/3.8 is Medium; High is the maximum. This correction does not assign Medium to an evaluator that failed to report its actual setting. Unknown effort remains approximate under the existing assignment policy. Gemini's AA High/Google API throughput and TTFT were refreshed from its exact live page; the display overlay now covers 86 models, up from 85. Vals workload cost and latency are separate measurements and never replace AA task cost or TTFT.

## Validation and reproducibility

The [independent integration review](integration-review.md) checks all 4,507 replay records. All 4,018 unreplaced baseline rows survive. The 402 explicit removals are the complete 398-row older Arena cohort and four Terminal rows. The 489 additions include full native cohorts and their unmapped source rows for local audit; 181 mapped rows are persisted in the curated source registry. Ninety-four historical manual rows are marked superseded with reasons. This is replacement-aware coverage, not 489 new independent benchmarks.

The accepted fit uses 921 observations, 110 model releases and 19 benchmark conditions. Four chains retain 12,000 draws with zero divergences, maximum R-hat 1.0033, minimum monitored ESS 1823 and maximum display Monte Carlo error 0.299 points. Existing acceptance checks pass.

See [before/after coverage and scores](audit-summary.json), [accepted input](accepted-input.json), [accepted diagnostics](accepted-diagnostics.json), [preparation](preparation-summary.json), and the [executed notebook](audit.ipynb). The notebook independently checks condition counts, SEM units, fixed modeling choices, numerical acceptance and the displayed uncertainty intervals. Source captures are pinned by [hashes](source-manifests.json); raw website payloads and private benchmark tasks are not redistributed.

The [Arena and reasoning review](arena-and-reasoning-audit.md), [agentic review](agentic-audit.md), [Google review](vendor-audit.md), [Vals source review](vals-source-audit.md), and [independent Finance math review](finance-math-review.md) preserve source scope and decisions. Baseline is commit `ce4aca316969131365a13a5fa5226fced3a13dd5`. The local review/release date is 6 September 2026 in Moscow; source and snapshot cutoffs retain their UTC dates.

## Remaining limits

Finance's three-run SEM measures repeatability on its fixed tasks; it does not measure generalization to new tasks, and its exact per-run scores, evaluated harness commit and judge revisions are unavailable. The source's disclosed Opus fallback remains recorded. Harvey's two judges do not establish two independent model runs, and its hybrid Fable fallback is disclosed.

Google's LVBench table and tool-methodology text conflict, so the agentic label does not establish a verified tool protocol. Macro-averages and subset scores do not borrow an unrelated task denominator. Public Epoch, Scale HLE and ARC feeds had no Gemini 3.8 observations at capture; earlier Gemini releases and private evaluations were not substituted. Unresolved model-release aliases are not guessed, and GPQA task revisions remain pending separate admission review.

Assessment: usable with these stated limitations. Source validation and sampler convergence are established here; predictive accuracy on unseen evaluations and a proven ordering for close models are not established by this data refresh.
