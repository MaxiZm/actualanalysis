# Vendor evidence audit — 2026-09-05

167 schema-valid candidate records cover 22 registered models and 66 reported benchmark conditions. This is **additional display evidence**, not 167 automatically admitted fitting observations. Sixty-five new condition proposals preserve important version, subset, metric and grading differences. All new-condition records carry `aci_fit_eligible: false` until integration review. GPQA alone uses its existing registry identity. No excluded SWE-bench Pro, GSM8K, LiveCodeBench or standalone AIME2025 rows were added; MathArena remains untouched.

The replay baseline is `work/review-140/merged-records.json` at HEAD `ee2f2c9`, with126 registered models. Only this vendor work directory was edited. The parent owns all registry, scoring, snapshot and deployment changes.

## Integration files

- `candidates.json`:167 strict RawResult records, all with primary source URLs, source capture path, self-report provenance, exact reported metric/configuration, and no invented standard errors or correct-item counts.
- `benchmark-proposals.json`:65 distinct conditions; recommended observed-only until native benchmark definitions can establish compatibility.
- `corrections.json`:8 exact baseline rows with indices, full original row, SHA256 match, actionable patch and evidence. Three Anthropic OSWorld rows require a separate modified task/grader condition; two BenchCAD rows need modified-protocol annotations; one Fable55.8 Terminal4.0 row has an unsupported product-default→run-effort inference; two Kimi AA citations need mirror lineage.
- `model-metadata-proposals.json`:21 proposals/verifications,16 with changes. Includes GLM5.3max support, Grok4.6exact effort policy, Fable/Opus/Sonnet supported efforts and default, OpenAI exact context/output and Kimi/Qwen context corrections.
- `capture-manifest.json` plus `captures/`:raw first-party READMEs, HTML, PDF reports, inspected numeric charts and factual transcriptions for pages where direct HTTP capture was403. Failed captures are recorded, never represented as successfully archived.
- `validation.json`:all167 candidates passed RawResultSchema, registry/model IDs, local captures, numeric range, lineage uniqueness, excluded benchmark policy, new-condition fit guard and provenance checks.

Reproduce the artifacts with `python work/coverage-swarm/vendors/build_candidates.py`, `node work/coverage-swarm/vendors/model_metadata.mjs`, `python work/coverage-swarm/vendors/build_corrections.py`, then `npx tsx work/coverage-swarm/vendors/validate.ts`.

## High-value additions

Muse Spark1.3 and DeepSeek V4 Flash Vision Exp each gain10 source-backed cells from zero public cells. Muse1.3 reports75.4DeepSWEv1.1,88.8Terminal2.1,49.6Automation publicv3 and98.1MRCR512K–1M sequence-match ratio. DeepSeekVision reports83.9Terminal2.1 and59.3DeepSWE, but its modelcard does not specify the DeepSWE revision, so that cell remains separately identified.

GLM5.3 adds7 rows, including66.9DeepSWEv1.1,88.2Terminal2.1,28.3Terminal3.0 average over3rollouts and48.2Automationv1.0.6. GLM5.3Flash adds5 rows including63.4DeepSWEv1.1 and48.8Automationv1.0.6. These do not represent the publicv3 or unversioned Automation task set. The GLM5.3README explicitly verifies low/high/max with defaultmax; Flash states the same.

Google provides a particularly useful same-publisher HLE-Verified comparison: Gemini3.8Flash54.9, Gemini3.7Flash53.6, Opus5 54.4, Sonnet5 31.0, Sol54.5, Terra51.1. Google says all six were self-computed using the1,811-item Verified set (668verified original items and1,143revised). Content filters block a substantial share for Sonnet5 and a small number for Opus5. These scores must not enter the original2,500-item/o3-mini HLE condition. Per-cell selected effort and judge are not pinned in the published methodology, so do not treat them as precise max-effort replicated runs.

## Corrections that matter to ranking

1. OpenAI Astra scores are **maximum across effort settings**, not necessarily the highest effort setting. Preserve unknown selected effort. Sol API/Codex/Work is distinguished from the Chat variant in the source footnote; do not treat API benchmark values as measurements of the Chat product variant.
2. Anthropic's August OSWorld results use modified tasks and grading, according to OpenAI's explicit footnote3. Existing strict41.7Fable5.1/36.1Fable5/39.6Opus5 do not become canonical08.08 scores merely because the metric is binary. The8.31pp gap between Opus5 vendor strict39.6 and native canonical max31.43 is a **protocol difference**, not a new model gain.
3. OpenAI's Astra72.6/Sol65.7 OSWorld values are08.08 **offline subset partial scores**. Google's own59.0Gemini3.8Flash is **pre-08.08 partial, maximum of3runs**. Meta1.2uses06.24; Meta1.3uses08.08. Each is separated in proposals.
4. MRCRv2 reports a continuous sequence-matcher ratio. Current registry `mrcr-v2-1m-8-needle` declares `obs_type: count` despite notes describing a continuous score. Do not synthesize integer successes or binomial uncertainty from these values. New MRCR candidates explicitly name metric and token bin.
5. HLE with tools vs no tools, original vs Verified, and GPT4o vs GPT5.6Luna-medium judges are different conditions. GLM's tools+Luna judge and Qwen's GPT4o values are preserved independently.
6. Grok4.6supports low/medium/high(default)/xhigh. Its published High benchmark scores are default-class measurements; xhigh is the model's strongest effort. GLM5.3supports low/high/max with defaultmax. Fable5.1/Fable5/Opus5/Sonnet5 support low/medium/high/xhigh/max with API defaulthigh. Product settings are not measurements of evaluation effort.
7. Qwen3.8-2.4T-A95B README presents scores for the separately hosted **Qwen3.8-Max** successor. No Max scores were assigned to the open checkpoint. QwenFlashNext is also distinct from hosted QwenFlash. The open2.4T model therefore correctly remains without a verified own benchmark cell in this batch.
8. OpenAI HealthBench Professional is length-adjusted, unclipped, with GPT5.4grading. OpenAI explicitly re-evaluated Claude models, with Opus5fallback for Fable5.1 refusals. These are not automatically comparable to Anthropic's own HealthBench values.
9. Gemini3.8Flash primary card gives73.7DeepSWEv1.1; Astra's competitor table gives73.8. Prefer the native Datacurve source when its exact run exists; do not count the OpenAI mirror as a second independent result.

## Coverage and uncertainty limits

This audit is deliberately conservative about provenance: vendor cards stay self-report even where the publisher ran competitors. Explicitly copied AA/Datacurve/VALS/APEX/ALE rows were omitted, and existing KimiAAcopies were flagged for mirror lineage. The parent/native benchmark agents should deduplicate source-equivalent rows across this batch and their independent fetches. An identical number on a second website is not independent confirmation.

GLM5.2README was reviewed and captured; a benchmark-specific max-effort parameter is reported, but the complete API support/default list was not verified here. Full Muse1.2/1.3supported API effort lists and defaults were not verified by the release/report, only the actual xhigh/max evaluation configurations. DeepSeek code-agent config is assigned only where the source footnote applies; general-agent or multimodal effort is not guessed.

No source-backed own score was found for the openQwen2.4T model; other zero-cell models outside the named vendor scope remain for independent-agent or benchmark-source coverage. The audit does not claim every registered model or every historical value has been verified. It adds no AA speed/cost measurements; the parent owns live AA4.2runtime/pricing/physics collection.
