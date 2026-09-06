# Coverage expansion 2026-09-06 — ingestion

Native worker count: **1** (this ingest lead only; no subagents).

No production ingest, Bayesian fit, publish, commit, or push.

## Endpoint checks (live, 2026-09-06)

29 official URLs requested. **28 returned HTTP 200.** One failed.

| Status | Count | Notes |
|---|---:|---|
| OK | 28 | Includes MCPMark after one SSL retry |
| Failed | 1 | `datasets-server.huggingface.co` SWE-rebench rows API HTTP 500; the public HTML leaderboard itself is healthy |

Checked: Epoch ECI + runs CSV, OpenRouter models, SWE-rebench HTML (+ HF dataset page), DeepSWE v1 and v1.1 JSON, OSWorld official-results JSON, Arena native overall, LiveBench CSV/categories, Scale HLE and SWE-Pro, MathArena models, METR YAML, Terminal-Bench 4.0, Terminal-Bench Science announcement, Vals fabv2/hlab/index, MCPMark, tau3 Banking, ARC models/evaluations JSON, Vending-Bench 2, AutomationBench README, DeepSWE homepage.

Replay of captured HTML/JSON through existing adapters: SWE-rebench native window 13/117, Terminal-Bench 4.0 18 rows (includes Grok 4.6, Gemini 3.8 Flash, GPT-6 Astra), Scale 76, MathArena 97 (GPT-6 Astra, Gemini 3.8 Flash), tau3 27, Arena native 400 rows cutoff 2026-09-02 (`gemini-3.8-flash-high`, `grok-4.6-high`; no GPT-6 Astra in that snapshot). MCPMark live still has no Grok 4.6 / Gemini 3.8 / GPT-6 rows.

## Chosen gap

Largest independently admissible public gain was **Datacurve DeepSWE**: registered source `datacurve` and conditions `deepswe` / `deepswe-1.1` already exist, but there was **no adapter**. The live JSON is authoritative, versioned, and carries GPT-6 Astra, Gemini 3.8 Flash, and Grok 4.6 with explicit effort.

MathArena also lowercases documented discrete effort tokens (`High`/`Max` → `high`/`max`). Non-tier parentheticals such as `Reasoning` stay unchanged.

## Adapter: `datacurve`

Feeds (never mixed):

- `https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json` → `deepswe` version `1`
- `https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json` → `deepswe-1.1` version `1.1`

Live capture 2026-09-06: v1.1 generated 2026-09-03, 70 rows, 113-task set; v1 generated 2026-06-20, 29 rows.

### Proposed admissions (alias-resolvable against current registry)

| Condition | Native rows | Alias-mapped | Unresolved identities |
|---|---:|---:|---:|
| DeepSWE v1.1 | 70 | 68 | 2 |
| DeepSWE v1 | 29 | 21 | 8 |

v1.1 mapped recent configurations include GPT-6 Astra (low/medium/high/xhigh/max), Gemini 3.8 Flash (medium/high), Grok 4.6 (low/medium/high/xhigh), plus GPT-5.6 Sol/Terra/Luna and Claude Fable 5 effort grids. Score is native `pass_at_1` (fraction). SE is `ci_half / 1.96`. 95% endpoints are retained. `n_items` is `n_tasks_attempted`, not the nominal 113 when they differ (v1 GPT-5.5 xhigh uses 111).

### Exclusions (left unresolved / not invented)

- Unsuffixed `deepseek-v4-pro` and `deepseek-v4-flash` are **not** assigned to 0424 or 0813.
- v1 unresolved names remain unresolved: `gpt-5-4-mini`, `kimi-k2-6`, `qwen3-7-max`, `glm-5-1`, `grok-build-0-1`, `qwen3-6-plus`, `minimax-m2-7`, plus unsuffixed DeepSeek V4 Pro.
- Missing `reasoning_effort` stays missing (v1.1: 1 row, `kimi-k2-7-code` `_default`; v1: 12 rows). `_default` in a config id is not an effort setting. Max effort is never inferred from an omitted field.
- MiniMax M3 v1 Wald interval: `uncertainty_unit: item`, **no** invented `n_runs`.
- Attempt counts are metadata only; no `x_correct` / binomial rewrite.
- v1 and v1.1 are separate conditions.
- No Artificial Analysis scores. Epoch AA-origin CritPt skip is unchanged.

Vals Finance/Harvey and Terminal-Bench Science remain public and useful; they were not adapted this round (Vals is Astro-encoded page props; Science is chart Flight without a stable row contract). Existing live adapters above already parse.

## Fixtures

Captured subsets of the official JSON, not invented scores:

- `packages/ingest/src/__tests__/fixtures/deepswe-v1.1.json` — GPT-6 Astra xhigh, Gemini 3.8 Flash high, Grok 4.6 xhigh, Kimi K3 max, unsuffixed DeepSeek V4 Pro max, unlabeled Kimi K2.7 Code `_default`
- `packages/ingest/src/__tests__/fixtures/deepswe-v1.json` — GPT-5.5 medium/high/xhigh, Wald MiniMax M3, unsuffixed DeepSeek V4 Pro, unlabeled Haiku 4.5

Semantics under test: version isolation, explicit effort vs omitted effort, Wald vs run-to-run CI, no DeepSeek release guess, fail-soft when one revision URL is down.

## Tests / typecheck

```
npm run test --workspace @actualanalysis/ingest
npm run typecheck --workspace @actualanalysis/ingest
```

Result: **98 tests passed**, ingest `tsc --noEmit` clean.

Registry YAML, scoring, UI, and snapshots were not modified.
