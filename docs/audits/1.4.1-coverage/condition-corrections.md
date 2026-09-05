# Final condition audit — 2026-09-05

`final-condition-corrections.json` supplies 22 additional exact baseline removals. Its fingerprints do not overlap the earlier 196 corrections. All replacement measurements were already supplied in `candidates.json` or `review-only.json`; remove old rows and retain each native candidate once, rather than inserting another copy.

| Source / benchmark | Checked remaining rows | Separate condition | Native replacement | Quarantine |
| --- | ---: | ---: | ---: | ---: |
| Epoch DeepSWE | 4 | 3 | 0 | 1 |
| Epoch OSWorld 2.0 | 9 | 5 | 2 | 2 |
| Meta Muse Spark 1.1 OSWorld 2.0 | 1 | 0 | 0 | 1 |
| AutomationBench manual public | 8 | 8 | 0 | 0 |
| Total | 22 | 16 | 2 | 4 |

## DeepSWE

Three full-precision Epoch values exactly identify the native v1.1 configurations: Gemini 3.7 Flash medium (0.6548672566371682), Claude Opus 5 max (0.7364864864864865), and Claude Fable 5 xhigh (0.6991150442477876). They must not remain as versionless or v1 observations alongside the native v1.1 results. The primary captures are `captures/deepswe-live-v1.json` and `captures/deepswe-live-v1.1.json` from the benchmark's versioned public endpoints.

Gemini 3.5 Flash's Epoch value 0.3738938053097345 matches neither captured version. Its verified native v1 medium value is 0.2831858407079646 and native v1.1 high is 0.3606194690265487. Quarantine the mirror without changing either valid native result. This audit does not infer that ECI's historical or standardized values are interchangeable with native raw pass rates.

All 39 baseline DeepSWE rows now have exact correction coverage across the original and supplemental artifacts. Native v1 and v1.1 remain distinct conditions; the supplemental removal does not invalidate either version.

## OSWorld 2.0

The native `official-results.json` explicitly assigns versions and scopes; rows without a release use the file's June 24 default, rather than the current August release. Only `binaryAccuracy` is matched; `partialScore` is not substituted.

The Sol 27.34% and Opus 5 31.43% mirrors match August 8 / full / max / 500 steps and are replaced by already supplied native rows. Sonnet 4.6 9.3%, MiniMax M3 4.6%, Qwen 3.7 Plus 2.8%, Opus 4.7 18.2%, and Opus 4.8 20.6% identify June 24 conditions and must not fit as August results.

GPT-5.5's June value of 13% appears at 150, 300 and 500 steps. Kimi 2.6's June 4.6% appears at 300 and 500 steps, and that model is not registered. Quarantine those unresolved mirrors; do not select a step budget by score. Their distinct native rows remain available for the separate June observed-only condition.

The [Muse Spark 1.1 evaluation report](https://ai.meta.com/static-resource/muse-spark-1-1-evaluation-report/) is dated July 9, 2026. Sections 5.1 and 5.2.1 describe xhigh API evaluation, 108 workflows, GUI-only use, batched actions and a 500-step limit, but do not explicitly identify the June 24 dataset or grader release. July publication rules out the August 8 condition; it does not prove the exact June revision. The 14.2% self-report row is quarantined for version uncertainty. Its numeric value was not re-extracted from the report's image table in this supplemental pass.

The three remaining baseline Anthropic vendor OSWorld rows (Opus 5 39.6%, Fable 5.1 41.7%, Fable 5 36.1%) belong to the vendor agent's modified-task/grader audit. They are deliberately outside this supplemental correction file; they must be covered by that agent's separate condition or quarantine before fitting.

## AutomationBench

All eight remaining manual values, model labels and reasoning efforts exactly match the public leaderboard at immutable repository commit `4a8e1061254004d9dac807054eed33fad7d1ff14`. The captured README defines 600 public tasks and strict `task_completed_correctly`; the accompanying changelog and project metadata identify package v1.0.6. The README notes that Fable 5's score follows the July stricter classifier, but does not pin every evaluation's grader revision. Therefore retain the measurements in the explicit `1.0.6-public` observed-only source snapshot condition, not a generic July condition or latest v3. No new independent measurement is created by replacing the previous manual copy.

## Validation

The generator `finalize-corrections.mjs` checks unique source matches where a single candidate is supplied, rejects overlap with prior corrections and requires exactly 22 unique fingerprints. Every old row is retained in full. Replaying the two correction lists covers all baseline DeepSWE and AutomationBench rows and all OSWorld rows except the three Anthropic rows owned by the vendor audit. No shared registry, model configuration or production snapshot was changed by this supplemental pass.
