# Model aliases · coverage expansion 2026-09-06

Live DataCurve + MathArena ingest (`live-datacurve-matharena.json`, `/tmp/actualanalysis-coverage-live-ingest.log`) had **53 unmapped names**. Aliases added only for cataloged immutable releases with primary-source identity. No new model YAML, no effort edits, no undated DeepSeek V4 names.

## Admitted (3 aliases)

| Captured label | Target | Collision (normalized) | Live gain | Evidence |
|---|---|---|---|---|
| `Claude-Opus-4.0` | `claude-opus-4` | `claude-opus-4-0` unused | 1 MathArena cell | MathArena `Claude-Opus-4.0 (Think)` dated 2025-05-22 ([matharena.ai/models](https://matharena.ai/models)). Anthropic Claude 4 (2025-05-22) snapshot `claude-opus-4-20250514`; convenience alias `claude-opus-4-0`; “opus 4.0” is that snapshot, not Opus 4.1. [news](https://www.anthropic.com/news/claude-4), [IDs](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions) |
| `Gemini 2.5 Pro (05-06)` | `gemini-2.5-pro-20250506` | `gemini-2-5-pro-05-06` unused | 1 MathArena cell | MathArena label dated 2025-05-06. Google API id `gemini-2.5-pro-preview-05-06` (I/O edition). Not Mar 25 experimental or Jun 17 `gemini-2.5-pro`. [blog](https://blog.google/products-and-platforms/products/gemini/gemini-2-5-pro-updates/), [DeepMind card](https://deepmind.google/technologies/gemini/) |
| `Grok 4 Fast R` | `grok-4-fast` | `grok-4-fast-r` unused | 1 MathArena cell | MathArena model page display `Grok 4 Fast R`, endpoint `grok-4-fast-reasoning`, date 2025-09-19. Euler page: “Fast R” = Fast Reasoning. Same xAI Grok 4 Fast release; R is mode, not a second checkpoint. [model](https://matharena.ai/models/xai_grok_4_fast_reasoning), [Euler](https://matharena.ai/euler/), [xAI](https://x.ai/news/grok-4-fast) |

Resolver load of the catalog throws on cross-id collisions; these three keys were free and each maps once.

## Unresolved (50 names / groups)

Left unmapped on purpose:

- **DeepSeek V4 undated:** `DeepSeek-v4-Pro`, `deepseek-v4-pro`, `DeepSeek-v4-Flash`, `deepseek-v4-flash` — 0424 vs 0813 (and Flash 0731 vs Vision-Exp) must not share a label.
- **DeepSeek other uncataloged / distinct SKUs:** R1, R1-0528, R1-Distill 1.5B/14B/32B/70B, V3, V3-03-24, v3.1, v3.2-Exp, v3.2-Speciale (Speciale ≠ cataloged V3.2).
- **Uncataloged or different SKU:** Falcon-H1R-7B; gemini-2.0-flash/pro (≠ flash-thinking); GLM 4.5 Air/V; GLM 5.1 / glm-5-1; GPT OSS 20B; gpt-4o (MathArena 2024-08-06 ≠ `gpt-4o-2024-11-20`); gpt-5-4-mini; Grok 3 Mini; grok-build-0-1; K2-Think; Kimi K2 Thinking; Kimi K2.6 / kimi-k2-6; minimax-m2-7; NVIDIA-Nemotron-3-Super (≠ Ultra); QED-Nano; Qwen3-30B-A3B / 2507-Think / 4B-2507-Think; qwen3-6-plus; qwen3-7-max; Qwen3-VL-235B Instruct; Qwen3.5 2B/4B/9B/27B/35B-A3B; Qwen3.6-35B; QwQ-32B / Preview; Step 3.5/3.7 Flash.
