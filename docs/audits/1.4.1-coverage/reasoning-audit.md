# Reasoning and knowledge coverage audit — 2026-09-05

**Integration-ready: 128 registered-model rows and 127 exact old-row replacement/removal actions.** These are principally more faithful replacements, not 128 new independent measurements. There are 10 newly covered model–benchmark pairs after collapsing the two SimpleQA revisions for this count. The frozen baseline is `work/review-140/merged-records.json` (4,222 rows, repository baseline `ee2f2c9`).

| Source | Fresh native rows checked | Registered rows after verified mappings | Submitted rows |
|---|---:|---:|---:|
| Epoch FrontierMath v2 private, both subsets | 164 | 130 | 3: two additions, one unsupported-configuration guard |
| Epoch SimpleQA native revisions | 78 | 62 | 62 replacing 69 unspecified ECI rows |
| MathArena full rolling catalog | 96 scored | 55 | 55 replacing every old composite row |
| ARC Prize v2/v3 | 263 | 225 | 6 Luna configurations |
| Scale HLE no-tools | 51 | 45 | 2 native uncertainty corrections |

652 native source rows were checked, plus all 37 existing Epoch HLE mirror rows. All 128 candidates pass `RawResultSchema`. There are 135 source rows without a registered identity (92 source/name combinations, 87 distinct native labels) retained in `unregistered-candidates.json`; these are unresolved identities, not fabricated scores. `source-row-comparison.json` preserves each checked run/configuration and field difference.

## Deliverables and integration

- `candidates.json`: only registered-model `RawResult[]`, exact native uncertainty and configuration retained.
- `corrections.json`: full old row, its array index and SHA256 of sorted-key JSON, action, reason, and replacement references. Apply these removals before adding candidates. It removes **all 49** old MathArena rows and **all 69** generic Epoch SimpleQA rows. Do not retain older mirror/manual versions alongside replacements.
- `matharena-full-snapshot.json`, `simpleqa-native-runs.json`: complete native source snapshots including unmapped rows.
- `matharena-component-manifest.json`: all 41 publisher catalog cards, with source capture/hash and deprecation flags. Eight nonaggregate cards are active; aggregate cards are not additional independent evidence.
- `alias-proposals.json`: narrowly scoped verified mappings. `registry-proposals.json` records implemented SimpleQA revisions/protocols.
- `source-manifest.json` and `captures/`: timestamps, URLs, statuses and SHA256 of captured bytes. `audit.ipynb` executes artifact and hash checks.

## Material findings

**MathArena:** production ingestion used the homepage, which exposes only featured results. It now uses the complete models catalog. Forty-three of the 49 existing point estimates change in the frozen refresh; uncertainty is refreshed for all 49. Sol is 64.3 ±3.1 and GPT-5.5 is 61.0 ±2.5 percentage points. These are publisher 95% bootstrap intervals. Sol cost is explicitly invalid upstream and remains missing. The adapter no longer invents four independent composite runs. The source metric is IRT expected performance, so root will use a continuous measurement with native uncertainty. [Full catalog](https://matharena.ai/models)

The captured publisher component catalog marks 31 of 41 cards deprecated, including older final-answer competitions/AIME and Euler. The current active components are March/June ArXivLean plus April–June BrokenArXiv and ArXivMath. The user-retained composite is preserved; no standalone AIME2025, GSM8K, LiveCodeBench or SWE-bench Pro is added. The catalog freezes membership and publisher deprecation state, but does not supply immutable per-output revisions or exact IRT weights. [Competition catalog](https://matharena.ai/competitions)

**Source-specific identities:** DeepSeek V4 Pro dated April24 maps only to registered 0424 Preview, never 0813. MathArena Claude3.5 dated October22 maps to the October model, correcting the broad June alias. Gemini2.5Pro May6 stays separate from June stable. Grok Fast R is a reasoning endpoint, confirmed by its native model page. The o1 and Gemini Flash pages confirm unversioned API endpoints; exact checkpoints and conflicting family release dates remain marked incomplete. [Grok endpoint](https://matharena.ai/models/xai_grok_4_fast_reasoning), [o1 endpoint](https://matharena.ai/models/openai_o1), [Gemini endpoint](https://matharena.ai/models/gemini_gemini_flash_2_5)

**SimpleQA:** the native export contains 12 task1.0.0 and 66 task1.2.0 runs. The submitted registered subset is 11 and 51 respectively (53 distinct models, previously51). They retain actual mean accuracy, item SE, run ID, native configuration and task revision. Separate registry IDs prevent pooling; generic ECI condition is retired and default ingestion no longer falls back to its best-per-model projection. Partial runs exist, e.g. April24 DeepSeek Pro 0.46993987975951906; no 1,000-item count is invented. [Native runs](https://epoch.ai/data/benchmarks.csv)

The current CSV labels even older runs anti-abstention, while Epoch announces a prompt change on August27. The historical prompt text and production judge revision therefore remain explicitly unresolved. UI labels name native task revisions. Accuracy treats abstentions as unsuccessful and differs from Google/Kaggle F1. An older linked gist is captured as historical scorer evidence only, not falsely pinned as the current judge. [Epoch methodology](https://epoch.ai/benchmarks/simple-qa-verified)

**FrontierMath:** all 128 existing native v2 rows match original scores, SE and run/revision identity. Two missing April24 DeepSeek rows are recovered. The source also exposes Sol `promax` / “pro,max”, distinct from ordinary max; that unsupported configuration is preserved for observation only until its system identity is verified. No v1/public subset is relabelled as private v2. [Original runs](https://epoch.ai/data/benchmarks.csv)

**ARC:** all 263 existing native v2/v3 scores and denominators match the fresh export. Six July30 Luna configurations regain their existing canonical model: ARC Prize explicitly describes a price reduction, not newly named weights. Native configurations remain distinct and benchmark-specific costs stay metadata, never Artificial Analysis Cost of Intelligence. Four `Claude4.7` rows remain unresolved: release-date agreement alone is insufficient proof of exact identity. ARC3 RHAE stays observed-only and is never treated as binomial accuracy. [Luna result page](https://arcprize.org/results/openai-gpt-5-6-luna-2026-07-30), [ARC data](https://arcprize.org/media/data/evaluations.json)

**HLE:** all 51 native Scale means and intervals match the baseline. Fable46.5 ±2 may be compatible with coarser source rounding; it is not grounds for rejecting the condition. Kimi24.37 ±1.81 does not support the assumed n2500 count variance. Both candidates retain mean and CI/1.96 approximate SE, remove n_items, and keep fit eligibility for a continuous measurement. Exact benchmark/grader revision remains incomplete. A later merged-input audit found that all 37 unchanged ECI HLE values are transformed mirrors: each equals max(0,(native Scale fraction−0.048)/0.952). Five values are clipped to zero. Epoch documents chance/error rescaling and best-over-configurations selection. These are not raw accuracy and must be removed, not fitted again or inverted after clipping. The Epoch adapter now blocks this HLE projection. See duplicate-corrections.json for all 37 exact removals and epoch-hle-chance-transform.json for every native counterpart. [Scale no-tools leaderboard](https://labs.scale.com/leaderboard/humanitys_last_exam)

## Additional merged-input corrections

`duplicate-corrections.json` supplies 47 further exact baseline removals: 37 chance-adjusted HLE projections, five Scale native/manual copies, four ARC native/manual copies matched by the native thinking-budget/Base-LLM profile, and one ambiguous Grok4.5 ECI ARC mirror. All counterpart native rows are already present. Distinct ARC configurations with tied scores remain distinct. These 47 supplement the original127 actions; they do not replace that original payload. [Epoch preprocessing](https://epoch.ai/data/eci-documentation/data)

## Verification and limits

Owned adapter tests: 12 passed. The shared adapter suite subsequently had one unrelated SWE-rebench fixture failure after concurrent source changes; root owns that final integration check. Ingest typecheck passed. The registry suite passed six checks and failed only its pre-existing exact total expectation (29 versus31 after two explicit revision additions); root owns the final registry count update. Initial CI/count incompatibility quarantines for two Scale rows were withdrawn after reviewing source precision; final candidates preserve observations with uncertainty instead. No ranking fit, score tuning or publication was performed in this subtask.

Replay the payload against frozen parsed sources with `npx tsx work/coverage-swarm/reasoning/build-payloads.ts`; rebuild catalog metadata with `python3 work/coverage-swarm/reasoning/build-component-manifest.py`. `parse-captures.ts` reparses archived bytes but resolves through the current repository registry, so newly accepted aliases can intentionally change mapped counts. Fetch scripts are acquisition history, not deterministic replay. Do not rerun them to reproduce the frozen audit.
