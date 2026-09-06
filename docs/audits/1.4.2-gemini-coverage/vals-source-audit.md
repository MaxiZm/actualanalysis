# Native Vals coverage audit — 2026-09-06

**Ready: 40 Finance Agent v2 partial-credit candidates and 41 Harvey all-pass observations.** Both cohorts were captured from native page data updated September 4. Source values and conditions pass schema and direct-capture checks; no production files were changed.

Finance Agent v2 uses **450 private test tasks**, separately from 27 public and 450 validation tasks. Its primary outcome is weighted partial credit with mandatory checks. The source explicitly reports three runs and their mean's standard error. Gemini 3.8 Flash is **61.435%, SEM 0.128 percentage points**, with high effort and a 65,536-token output cap. The common harness provides six financial-research tools; tasks time out at two hours. GPT-5.4, Gemini 3.1 Pro and Sonnet 4.6 judge responses. Published SEM measures repeatability on this fixed task collection; it does not estimate uncertainty over new tasks. One Opus 5 refusal fallback to Opus 4.8 had an already-zero score and reportedly no aggregate effect. These facts support a Gaussian partial-credit condition, with incomplete exact harness/judge revisions retained. [Native Finance Agent v2](https://www.vals.ai/benchmarks/fabv2)

Harvey's native result for Gemini is **10% all-pass, reported stderr 2.415 points**, high effort. Its separate criteria-pass rate is 90.187%. Evaluation uses held-out tasks, disabled internet, file/shell tools, and the mean of two judges' pass rates. The generic page `dataset_type: public` does not identify the evaluated split. Two graders do not establish two model-generation runs; the stderr formula and sampling unit remain unverified. Thus every Harvey candidate is observed-only. Fable 5's published result includes four Opus 4.8 fallback tasks; the hybrid is explicitly recorded. [Native Harvey evaluation](https://www.vals.ai/benchmarks/hlab)

## Integration

- Import `finance-candidates.json` (40 rows) with the first condition in `benchmark-proposals.json`; `source-proposals.json` supplies `vals`. The prospective domain weights are 0.35 agentic, 0.25 reasoning, 0.20 knowledge, 0.20 professional communication, agreed before fitting.
- `harvey-candidates.json` contains 41 observed-only rows. `candidates.json` combines these two files (81 rows).
- `corrections.json` replaces the two Google-cited Gemini mirrors. Do not retain the native and mirrored values as separate measurements.
- `all-pass-optional-display-only.json` contains 40 strict Finance all-pass rows. They are optional; the same values are already preserved in primary-row metadata. This correlated outcome must not be another fitted observation.
- `unmapped-rows.json` preserves the remaining 17 Finance and 17 Harvey rows without guessed registry identities. In particular, unsuffixed DeepSeek V4 Pro is not silently assigned to August 0813; Qwen hosted Max is not assigned to open weights. No registry aliases were changed.
- Thirty mapped Finance rows have explicit discrete source effort values. Inkling's continuous `0.99` remains unmapped and excluded from fitting; missing effort stays missing. Class admission still depends on each model's verified registry configuration.
- `capture-manifest.json` pins complete local source captures; these are audit evidence, not redistributable page content. Benchmark cost and latency are source-specific task measurements, never AA cost, generation throughput, or TTFT.

## Reproduction and validation

Run `python3 work/gemini-38-coverage/vals/decode.py`, then `npx tsx work/gemini-38-coverage/vals/build.ts` and `npx tsx work/gemini-38-coverage/vals/qa.ts` from the repository root. The decoder uses Python's standard library. The native `tasks` and `default.tasks` containers are identical and counted once. All 81 integration rows match captured means, standard errors, efforts, machine condition identifiers and available configuration exactly. Every model/condition and lineage is unique. No success counts, repeated-run scores, default efforts or missing model releases were invented.

An independent scoring review also passed: see `math-review.md`.
