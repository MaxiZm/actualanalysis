> Integration update: the two proposed Google mirrors were replaced by native Vals measurements. Finance partial credit is fitted where eligible; Harvey remains observed-only. The other five Google conditions remain observed-only. See vals-source-audit.md.

# Gemini 3.8 Flash: first-party coverage audit

**Seven additional reported conditions are ready for display; no new fitted measurement is claimed. A source-backed default-effort correction is material: Gemini 3.8 Flash defaults to medium, while the registry currently says high.** Scope is the ordinary Flash API model, not Flash Cyber. Baseline is the 2026-09-05 public snapshot (12 rows, nine distinct benchmark IDs). Review date: 2026-09-06 Europe/Moscow; capture timestamps retain UTC.

The score grain is model release × benchmark version/subset × metric × harness/configuration × source lineage. The [Google evaluation PDF](https://deepmind.google/models/evals-methodology/gemini-3-8-flash/) was freshly downloaded, hashed and visually checked, including its image-only final table. `candidates.json` contains seven schema-valid RawBenchmarkResult rows; `benchmark-proposals.json` describes their separate conditions. No sample size, repeat count, thinking level, standard error or integer numerator is fabricated. Proposed registry holdout/access fields are deliberately omitted because this bounded Google-source review does not verify the benchmark owners' access policies.

| Missing condition | Score | Provenance | Fit decision |
| --- | ---: | --- | --- |
| LVBench static, 1024 frames | 87.1% | Google self-computed | Display; missing revision, effort, grader and uncertainty |
| LVBench agentic | 87.8% | Google self-computed | Display; table/methodology conflict on tools |
| BioMysteryBench human-solvable | 88.8% | Google self-computed | Display; preserve subset and terminal/allowlisted-internet protocol |
| BioMysteryBench human-difficult | 56.5% | Google self-computed | Display; separate subset, missing uncertainty |
| LABBench2 macro-average of 11 subtasks | 86.2% | Google self-computed | Display; a macro-average is not a pooled binary accuracy |
| Vals Finance Agent v2 | 61.4% | Google mirror of Vals.AI | Display; native condition needs confirmation |
| Harvey Legal Agent Benchmark all-pass | 10.0% | Google mirror of Vals.AI | Display; distinct from Harvey LAB-AA criterion pass rate |

Scores appear in the [model-card table](https://deepmind.google/models/model-cards/gemini-3-8-flash/). The two Vals results are also explicitly shown and linked on the [Google Flash page](https://deepmind.google/models/gemini/flash/) to [Finance Agent v2](https://www.vals.ai/benchmarks/fabv2) and [Harvey LAB](https://www.vals.ai/benchmarks/hlab). Native Vals pages were not independently audited here; copied results must never count as additional independent runs. All seven are new benchmark IDs relative to this snapshot. The two BioMystery subsets share one family, as do both LVBench settings.

LVBench is a real documentation conflict: the table distinguishes agentic and static results, while the methodology describes LVBench without tools. The 87.8 row therefore retains only its agentic label; no tool configuration or frame count is transferred from the static protocol. LABBench2 is explicitly an equal macro-average over DbQA2, FigQA2-img, FigQA2-pdf, LitQA3, PatentQA, ProtocolQA2, SourceQuality, SuppQA2, TableQA2-img, TableQA2-pdf and TrialQA. BioMystery uses a terminal, biology tools, Python/R and internet restricted to the benchmark authors' allowlist. Missing sample and uncertainty information makes all five new Google measurements unsuitable for an exact count likelihood.

## Metadata corrections

The [Generate Content migration guide](https://ai.google.dev/gemini-api/docs/generate-content/latest-model), [Generate Content thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [Interactions thinking guide](https://ai.google.dev/gemini-api/docs/thinking), and [Google Cloud developer guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-flash) agree: supported thinking levels are low, medium, high; **medium is default**, high is maximum, and minimal is invalid. This is a documented correction, not an inference from benchmark scores. `model-metadata-proposals.json` also proposes multimodal classification: the [API model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) confirms text, image, video, audio and PDF input, text output, 1,048,576 input tokens and 65,536 output tokens. The numerical limits already match the registry.

Do not automatically assign medium to unknown vendor runs: the evaluation PDF specifies default **sampling** settings, which is not an explicit per-benchmark thinking-level statement. DeepSWE alone explicitly identifies high thinking. Gemini 3.7's medium default appears in the same official tables and merits a separate registry correction by the integrator. The model card's knowledge cutoff is month-granular March 2026, with some domains retaining January 2025 information; no exact training-freeze day can be derived.

## Existing rows and admissibility

`existing-admission-audit.json` records every Google-origin condition already present. None can safely be promoted solely from this fresh source. HLE-Verified identifies the full 1,811-item composition, but not judge/prompt, exact effort or uncertainty. CharXiv has a no-tool label but lacks full run metadata. GDP.PDF is all-pass and cannot borrow a criterion-level denominator. Terminal-Bench 2.1 identifies Terminus 2 but not a repeat count or exact run conditions. OSWorld uses pre-August tasks, partial rewards and the maximum of three runs; that is not the mean binary metric of another OSWorld condition. DeepSWE already has independent native high/medium runs, while Google's rounded 73.7 remains its separately attributed self-computed claim.

`corrections.json` identifies the existing Google Terminal-Bench 4.0 row that is mislabeled self-report: Google explicitly took it from the official leaderboard. Prefer the native full-precision observation and preserve the Google citation as a mirror. The PDF mentions GDM-MRCR v2 in methodology but provides no Gemini 3.8 score in its results; no value is inferred from Gemini 3.7. The launch blog's CyberGym/CWE-Bench results belong to **Gemini 3.8 Flash Cyber**, a separate model, and were not imported as ordinary Flash evidence.

