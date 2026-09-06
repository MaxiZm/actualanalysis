# Gemini 3.8 Flash — independent agentic/coding coverage audit

Fresh sources were retrieved on September 6, 2026, Moscow time (September 5, 21:28–21:31 UTC). Captures retain URLs, timestamps, request parameters and SHA-256 digests in `captures/manifest*.json`. This pass found **zero new independent measurements** and **one warranted scaffold-class correction affecting both Gemini 3.8 and Gemini 3.7**. It does not increase the count of distinct benchmark families.

## Actionable correction

The native Terminal-Bench 4.0 submissions for Gemini 3.8 high (19.09%, run `06850434-507d-4dbd-b74a-09d52519ee35`) and Gemini 3.7 high (11.21%, run `14f4da14-b86a-4dca-92d7-11178d4fe064`) both identify the [mini-SWE-agent repository](https://github.com/SWE-agent/mini-swe-agent) as their agent. Its primary README describes a model-agnostic, bash-only baseline usable through multiple providers. This is a common scaffold class, not a proprietary model-specific product agent. The native-source label had been confused with the harness class.

The fresh Terminal4 leaderboard has 18 submissions, exactly two using that verified mini-SWE-agent identity. The remaining 16 use Codex, Claude Code or Grok Build; their native classification is unchanged. We do not assert that all models use the same agent, or that an unreported mini-SWE-agent commit has been verified.

Current preparation rejects both detailed Gemini native rows as `class_unassigned` while admitting the metadata-poor Google 19.1% / 11.2% summaries. Those summaries inherit 330 trials from registry defaults. The correction preserves the native source's exact score, high effort and reported confidence interval; the Google rows remain display-only because no independent replicate identity is established. No extra variance, trial count or observation is manufactured.

`candidates.json` contains four replacement RawBenchmarkResult objects: two native rows with `harness_class: common`, and two vendor rows with `metadata.sample_only: true` plus `config.aci_fit_eligible: false`. `corrections.json` has their exact current raw-row fingerprints and full old rows, matched against `work/coverage-swarm/merged-records.json`. These are replacements, not four additions. All four pass RawBenchmarkResultSchema.

The assigned production fix changes `packages/ingest/src/adapters/tbench.ts` to classify the exact mini-SWE-agent name plus official repository URL as common, known product agent names as native and unknown/conflicting identities as unknown. `data/sources/tbench.yaml` no longer stamps all rows as native. No model names appear in this classification rule.

## Fresh source coverage

| Source | Checked scope | Gemini 3.8 result |
| --- | --- | --- |
| [DeepSWE](https://deepswe.datacurve.ai/) | All 70 v1.1 configurations and 29 v1 configurations | Exactly two v1.1 rows, high and medium, already present at full precision with 4 runs and reported intervals. No missing alias or run. |
| [Terminal-Bench 4.0](https://www.tbench.ai/) | All 18 native rows | Existing high row verified; correct its scaffold class as above. |
| [Terminal-Bench 2.1](https://www.tbench.ai/?version=2.1) | All 22 rows via site's public leaderboard-read API | No Gemini 3.8 row. Google 89.4% remains a vendor report, not an independently verified native submission. |
| [Terminal-Bench 2.0](https://www.tbench.ai/?version=2.0) | All 142 rows via site's public leaderboard-read API | No Gemini 3.8 row. |
| [Terminal-Bench Science](https://www.terminal-bench-science.ai/announcement) | All 9 unique native configurations | No Gemini 3.8 row. |
| [MCPMark](https://mcpmark.ai/leaderboard) | All 39 model rows plus 5 non-model category objects | No Gemini 3.8 alias or submission. |
| [SWE-rebench](https://swe-rebench.com/) | All 117 source model configurations, including historical windows | No Gemini 3.8 identity. No historical cohort is relabeled as a current run. |
| [OSWorld 2.0](https://osworld-v2.xlang.ai/) | All 40 native release/scope configurations | No Gemini 3.8 row. Google's pre-August partial maximum-of-three result remains a different condition. |
| [tau-bench](https://taubench.com/) | Current public standard, voice and legacy submission manifest | No Gemini 3.8 submission. Gemini 3.1 Flash Live is a different model. |
| [Vending-Bench 2](https://andonlabs.com/evals/vending-bench-2) | All 61 native configurations from the Svelte data module, not only ten initially rendered rows | No Gemini 3.8 row. |
| [SciCode-Verified](https://github.com/flyingwagner/scicode-verified) | Current README, complete repository tree and manuscript result table | No Gemini 3.8 row. Gemini 3.5 Flash cannot be reused. |
| [AutomationBench](https://github.com/zapier/AutomationBench) | Current public README | No Gemini 3.8 row. |
| [METR time horizons](https://metr.org/assets/benchmark_results_1_1.yaml) | Complete native benchmark-results file | No Gemini 3.8 identity. |
| [BenchCAD](https://benchcad.com/) | Current public leaderboard page | No Gemini 3.8 row. |
| [Snorkel Terminal4](https://snorkel.ai/leaderboard/terminal-bench-4-0/) | Full partner table and methodology | Confirms Gemini 3.8 high / mini-SWE-agent / 19.1%±3.4%; this is the same benchmark summary, not additional independent evidence. |

The Terminal website redirects old version URLs to a shared initial page containing the 4.0 table. Reading only that HTML would incorrectly reuse 4.0 rows for 2.1/2.0. This audit followed the public client script's explicit package and leaderboard parameters to retrieve each version's actual rows. Request provenance is recorded in `captures/manifest-terminal-data.json`.

An Andon radio experiment surfaced during search, but its changing listeners, donations and balances are not controlled, completed Vending-Bench trials. No radio metrics were imported as benchmark coverage.

## Fit-exclusion review and validation

`fit-audit-before.json` preserves the existing Gemini 3.8 admitted rows and rejection reasons. Two DeepSWE efforts and MathArena already fit. LiveBench, Terminal2.1, HLE Verified, GDP.PDF, CharXiv and pre-August OSWorld remain separate observed-only conditions; lack of source uncertainty or comparable protocols cannot be repaired by increasing nominal trial counts.

`replay-result.json` verifies all four fingerprints match exactly, the two detailed Terminal4 native rows are now admitted with high effort under `a_prime` using their source uncertainty, and no vendor summary remains admitted for these model/benchmark cells. The full preparation remains 881 observations: the correction changes evidence quality and configuration, not data volume.

Validation also covers source annotation preserving common/unknown classes and native classification for the three named product agents. Existing adapter behavior and the ingest TypeScript project are checked separately. No score ranking or model-specific ordering is imposed.

Final checks passed: 20 tests (3 scaffold regressions plus 17 existing adapter tests), ingest TypeScript validation, four RawBenchmarkResult schema validations, and the exact four-row preparation replay.
