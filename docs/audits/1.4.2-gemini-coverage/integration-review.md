# Independent release data QA — Gemini 3.8 coverage integration

**Pass: no material source-mapping, duplicated-evidence, effort, baseline-retention or numeric-admission blocker found in the final candidate integration.** This is a data-readiness review, not posterior convergence approval or proof that the resulting ranking represents an external ground truth.

Reviewed `integrate.ts`, the frozen native Arena and Vals captures, all 81 Vals candidates, the condition proposals and current registry definitions, and the generated `merged-records.json` / `preparation.json`. No production files were edited. Machine results and exact reviewed hashes are in `integration-review.json`; replay with `npx tsx work/gemini-38-coverage/review-integration.ts`.

## Baseline retention and source replacement

The baseline has **4,420 rows**. Exactly **402** rows are explicitly replaced: the complete **398-row older Arena cohort**, plus the independent and rounded vendor Terminal-Bench 4.0 copies for Gemini 3.7 and 3.8. Every correction matches its original baseline row, and no removal index repeats.

All **4,018 unreplaced rows** survive unchanged after applying the same current registry/metadata normalization used by integration. **489 additions** produce **4,507 merged rows** with no duplicate natural keys. The two Google-cited Finance/Harvey mirror proposals were absent from the old baseline; integration filters them only from the new vendor additions. They are not mistakenly counted as old-row deletions.

Arena contains one complete **400-configuration** source cohort, all pinned to **2 September 2026**, with every rating and confidence endpoint exactly matching the native embedded dataset. No older Arena date survives alongside it. The source's High configuration remains explicit for Gemini 3.8; aliases do not copy that score onto Medium or Low.

## Vals mapping and metric checks

All **40 Finance** and **41 Harvey** rows match the original model-keyed native `overall` entries for score, standard error, reported effort, available cost and latency. All model IDs resolve through exact existing aliases, including precise dated DeepSeek releases; unresolved source names are not guessed. The duplicate native `tasks` and `default.tasks` containers are identical and used once. Each mapped model/condition appears only once.

The [Finance Agent v2 source](https://www.vals.ai/benchmarks/fabv2) explicitly specifies three evaluations, mean-of-runs scores and SEM, and separate 27-task public, 450-task validation and 450-task test splits. The imported condition uses weighted partial credit on the **450-task test set**, with `judge` observations and native SEM in percentage-point units. All **38 admitted Finance rows** use `a_prime`, and independently recomputed delta-method variances match preparation. The SEM is converted once; it is not divided again by √3. No successes, 1,350-trial count likelihood, or invented run values were introduced. Two Inkling rows with continuous effort `0.99` remain excluded because no discrete registry mapping is verified.

Finance All-Pass is retained only in the primary row's metadata. **No separate All-Pass condition or result was registered/imported.** The [Harvey source](https://www.vals.ai/benchmarks/hlab) reports a mean of two judges' all-criteria-pass rates on held-out tasks, but does not establish independent model runs or the stderr sampling unit. All **41 Harvey rows remain observed-only**, with no invented task or run count. The Fable 5 / Opus 4.8 fallback remains explicit in metadata and excluded from fitting. The source-disclosed single zero-score Opus 5 fallback on Finance remains documented; the source says it did not change the aggregate.

Available Vals latency and cost values remain benchmark task measurements. They are not token throughput, TTFT, or Artificial Analysis cost per task.

## Prepared evidence

The candidate contains **921 valid fitting observations**. All transformed means and variances are finite, variances are positive, binary-count observations have valid integer totals, and no fitted source lineage repeats within the same model/condition/system. All configured calibration-panel members pass the existing coverage gate.

Gemini 3.8 has **six admitted observations across five distinct benchmark conditions**:

| Condition | Native effort | Prepared class | Likelihood |
|---|---|---|---|
| Finance Agent v2 partial credit | High | max-common | Aggregate score with native SEM |
| Text Arena style-controlled | High | max-common | Elo with native 95% CI |
| Terminal-Bench 4.0 | High | max-common | Aggregate score with native CI |
| DeepSWE 1.1 | Medium | std-common | Aggregate score with native SEM |
| DeepSWE 1.1 | High | max-common | Aggregate score with native SEM |
| MathArena composite | Unreported | std-common | Composite with native CI |

MathArena's effort is still unreported by its source; `std-common` is the existing registry-based classification, not a claim that MathArena explicitly evaluated Medium. Its metadata remains incomplete. Google's newly verified default of Medium does not overwrite any explicitly reported High or Medium measurement.

For Gemini Finance, the exact admitted mean is **61.435%**, native SEM **0.128 percentage points**, and logit variance **0.000029187812161261048**. The source SEM describes repeatability conditional on its fixed tasks. It does not cover uncertainty over new task populations, judge bias or missing immutable harness versions. These limitations remain disclosed and do not justify fabricating additional uncertainty measurements.

**21 automated checks passed.** Production posterior diagnostics, final UI rendering and deployment verification remain separate release checks.
