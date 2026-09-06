# Benchmark Coverage Baseline Audit · 1.4.3

**Date:** 2026-09-06  
**Reference input:** `docs/audits/1.4.3-effort-coverage/accepted-input.json`  
**Input SHA-256:** `e5d654f41019df63f9f78c28efcd8d83db9bf425bf63e4d2cadb3a166fe23578`  
**Status:** Frozen Accepted Production Baseline

---

## 1. Executive Summary

This audit establishes the definitive baseline of benchmark coverage, condition cells, instrument loadings, and model representation from the accepted **1.4.3** inference input and repository registry.

- **Catalog Benchmarks:** 107 registered (19 active/fitted, 81 watchlist, 2 shadow, 5 retired).
- **Catalog Models:** 126 registered; **110 fitted** across **131 systems**; **16 catalog models unfitted** (zero cells).
- **Observations & Cells:** **924 total observations** across **673 condition cells** (642 independent cells, 68 self-report cells).
- **Family Coverage:** **16 families fitted** out of **66 catalog families** (50 unfitted families).
- **Loading Matrix Rank:** **Rank 5** (condition number 2.744); singular values [2.2275, 1.8785, 1.4298, 1.2611, 0.8117].
- **Effort Assignments:** 49 observations assumed maximum under 1.4.3 policy, 627 explicit reported, 248 fixed-effort.
- **Private Evaluations:** Strict isolation maintained: **0 Artificial Analysis observations** in public fit; display overlays strictly segregated.

---

## 2. Benchmark Metadata & Catalog Status Accounting

The registry catalog defines 107 benchmark entries. Only status `active` benchmarks enter the likelihood fit.

| Status | Count | Policy / Treatment in 1.4.3 Fit |
|---|---|---|
| **Active (Fitted)** | 19 | Admitted into capability likelihood joint fit |
| **Watchlist** | 81 | Cataloged candidates; rejected as `condition_inactive` |
| **Shadow** | 2 | Isolated verification (e.g. non-AA `aa-lcr`); rejected as `condition_inactive` |
| **Retired** | 5 | Superseded historical versions; rejected as `condition_inactive` |

### Holdout Distribution
- **Public:** 90 benchmarks
- **Semi-Private:** 5 benchmarks (`arc-agi-2-semi-private`, etc.)
- **Private:** 6 benchmarks
- **Rolling:** 6 benchmarks

---

## 3. Cell & Observation Accounting (Fitted Benchmarks)

Across the 19 active benchmarks, 924 observations yield 673 unique model × condition × configuration cells:

| Benchmark ID | Family | Primary Domain | Raw Obs | Unique Cells | Indep Cells | Self-Report Cells |
|---|---|---|---|---|---|---|
| `arc-agi-2-semi-private` | `arc-agi` | reasoning | 214 | 77 | 76 | 16 |
| `deepswe` | `deepswe` | software-code | 22 | 15 | 15 | 0 |
| `deepswe-1.1` | `deepswe` | software-code | 64 | 36 | 36 | 0 |
| `frontiermath-v2-tier-4` | `frontiermath` | reasoning | 52 | 48 | 48 | 4 |
| `frontiermath-v2-tiers-1-3` | `frontiermath` | reasoning | 79 | 59 | 59 | 3 |
| `gdpval` | `gdpval` | communication-professional | 11 | 11 | 0 | 11 |
| `hle-no-tools` | `hle` | reasoning | 77 | 59 | 41 | 28 |
| `lmarena-text-style-controlled` | `lmarena-text` | communication-professional | 92 | 84 | 84 | 0 |
| `matharena-composite` | `matharena-composite` | reasoning | 55 | 50 | 50 | 0 |
| `mcpmark` | `mcpmark` | agentic | 37 | 26 | 25 | 2 |
| `metr-time-horizon-1.1` | `metr-time-horizon` | agentic | 15 | 15 | 15 | 0 |
| `scicode-verified-v2-main-with-background` | `scicode-verified` | software-code | 8 | 8 | 8 | 0 |
| `simpleqa-verified-epoch-anti-abstention-v1-0-0` | `simpleqa` | knowledge-information | 11 | 11 | 11 | 0 |
| `simpleqa-verified-epoch-anti-abstention-v1-2-0` | `simpleqa` | knowledge-information | 51 | 48 | 48 | 0 |
| `swe-rebench` | `swe-rebench` | software-code | 11 | 11 | 11 | 0 |
| `tau3-bench-banking` | `tau3-bench-banking` | agentic | 27 | 26 | 26 | 1 |
| `terminal-bench-4.0` | `terminal-bench` | agentic | 13 | 10 | 10 | 3 |
| `vals-finance-agent-v2-partial` | `vals-finance-agent-v2` | agentic | 38 | 38 | 38 | 0 |
| `vending-bench-2` | `vending-bench` | agentic | 47 | 41 | 41 | 0 |
| **Total** | **16 Families** | **5 Domains** | **924** | **673** | **642** | **68** |

---

## 4. Domain Loadings, Instrument Rank & Sparsity Analysis

The capability index estimates traits across 5 correlated domains:
`agentic`, `software-code`, `reasoning`, `knowledge-information`, `communication-professional`.

### Loading Matrix Geometry
- **Matrix Dimensions:** 19 × 5
- **Exact Rank:** **5** (Full rank)
- **Singular Values:** `2.2275, 1.8785, 1.4298, 1.2611, 0.8117`
- **Condition Number:** `2.744`

### Direct Instrument Allocation (Primary Domain ≥ 0.40)
| Domain | Dedicated Benchmarks | Families | Instrument Density |
|---|---|---|---|
| **Agentic** | 5 (`mcpmark, metr-time-horizon-1.1, tau3-bench-banking, terminal-bench-4.0, vending-bench-2`) | 5 | Dense (6 families) |
| **Software-Code** | 4 (`deepswe, deepswe-1.1, scicode-verified-v2-main-with-background, swe-rebench`) | 3 | Moderate (3 families) |
| **Reasoning** | 5 (`arc-agi-2-semi-private, frontiermath-v2-tier-4, frontiermath-v2-tiers-1-3, hle-no-tools, matharena-composite`) | 4 | Dense (4 families) |
| **Knowledge-Information** | 2 (`simpleqa-verified-epoch-anti-abstention-v1-0-0, simpleqa-verified-epoch-anti-abstention-v1-2-0`) | **1** (`simpleqa`) | **Critically Sparse** |
| **Communication-Professional** | 2 (`gdpval, lmarena-text-style-controlled`) | **2** (`gdpval, lmarena-text`) | **Sparse** |

> [!WARNING]
> **Instrument Independence Caveat:**  
> No positive crossloading counts as independent instruments. Cross-loadings (e.g., HLE at 0.30 knowledge or GDPval at 0.20 knowledge) reflect joint task covariance, NOT primary instruments for the secondary domain.  
> Secondary crossloadings (such as HLE 0.30 on knowledge, GDPval 0.20 on knowledge, or Terminal-Bench 0.05 on knowledge) provide multi-task correlation constraints in the joint posterior, but **must never be counted as independent instruments**.

### Specific Weakness Findings:
1. **Knowledge & Information:** Single-family reliance on `simpleqa` (anti-abstention v1.0.0 and v1.2.0). Any artifact of SimpleQA anti-abstention dominates knowledge measurement.
2. **Communication & Professional:** Only two families (`gdpval` and `lmarena-text`).

---

## 5. Effort Assignment Audit (Unreported vs Reported)

Under methodology version **1.4.3**, `unreported_effort_policy: maximum` is in effect:
- **Snapshot Raw Records:** 973 reported effort, 544 unreported.
- **Accepted Fitted Observations:**
  - **49 Assumed Maximum:** Assigned to `max-common` with `effortAssumedMaximum: true` and `metadataIncomplete: true` (1.5× run-noise variance multiplier).
  - **627 Explicit Reported:** Retain exact declared tier (`default`, `medium`, `high`, etc.).
  - **248 Fixed-Effort:** Assigned directly to canonical `max-common` system without assuming an explicit tier.
  - **924 Total.**

---

## 6. Artificial Analysis (AA) Private Data Isolation

Strict policy safeguards maintain separation between public capability fitting and private/non-redistributable evaluation overlays:
- **Prohibited Scores:** Artificial Analysis benchmark results (CritPt pass@1, AA-LCR scores, AA cost per task, AA speed) **do not enter the capability fit** or public downloadable snapshots.
- **Overlay Registries:** 3 isolated manual sources (`aa-speed-manual`, `aa-cost-manual`, `aa-benchmarks-manual`) marked `redistributable: false`.
- **Fitted Observations from AA:** **0** (100% Fully Isolated).

---

## 7. Latest-Model Coverage Gaps

### Unfitted Catalog Models (16 releases with 0 cells)
The following catalog models lack compatible evidence under 1.4.3:  
`a-x-k2`, `agnes-2-5-pro-alpha`, `agnes-2-5-pro-beta`, `apodex-1-1`, `deepseek-v4-flash-vision-exp`, `gpt-5.2-codex`, `jt-4-1-flash-236b-a21b`, `k2-horizon-375b-a23b`, `ling-3-0-flash`, `mimo-v2-omni-0327`, `motif-3`, `nex-n2-pro`, `quasar-438b`, `qwen3.8-2.4t-a95b`, `qwen3.8-flash-next`, `solar-open2-250b`

### Frontier Model Coverage & Missing Domains
| System ID | Fitted BMs | Indep Cells | Covered Domains | Missing Domains (Gaps) |
|---|---|---|---|---|
| `gemini-3.8-flash@max-common` | 5 | 5 | agentic, communication-professional, reasoning, software-code | **knowledge-information** |
| `gemini-3.7-flash@max-common` | 9 | 9 | agentic, communication-professional, knowledge-information, reasoning, software-code | **none** |
| `gpt-5.6-sol@max-common` | 11 | 13 | agentic, communication-professional, knowledge-information, reasoning, software-code | **none** |
| `gpt-5.6-luna@max-common` | 9 | 13 | agentic, communication-professional, knowledge-information, reasoning, software-code | **none** |
| `grok-4.6@max-common` | 6 | 6 | agentic, knowledge-information, reasoning, software-code | **communication-professional** |
| `claude-sonnet-5@max-common` | 8 | 9 | agentic, knowledge-information, reasoning, software-code | **communication-professional** |
| `claude-opus-5@max-common` | 12 | 12 | agentic, communication-professional, knowledge-information, reasoning, software-code | **none** |
| `deepseek-v4-pro-0813@max-common` | 6 | 9 | agentic, communication-professional, knowledge-information, reasoning | **software-code** |
| `o1-pro@max-common` | 1 | 1 | reasoning | **agentic, software-code, knowledge-information, communication-professional** |
| `o3-pro@max-common` | 1 | 3 | reasoning | **agentic, software-code, knowledge-information, communication-professional** |
| `gpt-5.1-codex-max@max-common` | 1 | 1 | agentic | **software-code, reasoning, knowledge-information, communication-professional** |
| `grok-code-fast-1@max-common` | 1 | 1 | agentic | **software-code, reasoning, knowledge-information, communication-professional** |

### Key Unresolved Gaps:
- **Gemini 3.8 Flash:** Has 5 benchmarks across 4 domains; **missing `knowledge-information`**.
- **Grok 4.6:** Has 6 benchmarks; **missing `communication-professional`**.
- **Claude Sonnet 5:** Has 8 benchmarks; **missing `communication-professional`**.
- **DeepSeek V4 Pro (0813):** Has 6 benchmarks; **missing `software-code`**.
- **O1-Pro / O3-Pro:** Have only 1 benchmark (`matharena-composite`); **missing 4 domains**.
- **GPT-5.1 Codex Max / Grok Code Fast 1:** Have only 1 benchmark (`swe-rebench`); **missing 4 domains**.

---

## 8. CLI Usage for Baseline & Candidate Comparison

### Generate / Audit Baseline
```bash
tsx scripts/audit-benchmark-coverage.ts
```

### Prepare Candidate Input (Without Bayesian Refit)
```bash
tsx scripts/prepare-candidate-input.ts --output work/candidate-input.json
```

### Compare Baseline to Candidate Prepared Input
```bash
tsx scripts/audit-benchmark-coverage.ts --compare work/candidate-input.json
```
