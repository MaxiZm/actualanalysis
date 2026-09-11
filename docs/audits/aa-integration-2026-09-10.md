# Artificial Analysis 2026-09-09 Harvested Data Integration & Delivery Audit

**Date:** 2026-09-11  
**Method Status:** Retained Production ACI 1.4.3 (Candidate v1.5 unpromoted)  
**Dataset Source:** `work/aa-models-swarm-2026-09-09/` (OpenAI, Google, Meta harvested swarm)  
**Deployment Target:** GitHub Pages (`https://maxizm.github.io/actualanalysis/`)  

---

## 1. Executive Summary & Policy Guardrails

This audit documents the integration of harvested Artificial Analysis (AA) intelligence benchmarks, cost, and speed observations from the 2026-09-09 swarm into `actualanalysis`.

### Core Guardrails & Boundary Principles
1. **Strict Display-Only Overlay Boundary:**  
   Attributed Artificial Analysis observations are strictly display overlays (`redistributable: false`). As mandated by repository policy, these observations **never** enter public Bayesian capability fits, CC-BY snapshots, public API endpoints (`/api/v1/results.json`, `/api/v1/models.json`), or bulk CSV downloads (`/api/v1/download/results.csv`).
2. **Method Retention (ACI 1.4.3):**  
   Candidate v1.5 remains unpromoted as preregistered validation gates are unmet (0 certified components vs $\ge 10$ floor, 28 UNSET tokens in lock draft, uncertified Gemini post-2024 exclusion provenance, and no confirmatory empirical SBC). Production method delivered is **ACI 1.4.3**.
3. **Storage & CI Lifecycle:**  
   `data/manual/{benchmarks-aa,cost-aa,speed-aa}.yaml` are gitignored to preserve clean license boundaries in the public Git tree. In CI, they are restored via the encrypted secret `AA_DISPLAY_DATA_GZIP_BASE64` executed by `scripts/restore-display-data.mjs`.

---

## 2. Admitted Target Models and Systems

The 2026-09-09 swarm collected observations for nine target model families and variants across multiple reasoning effort tiers:

- **OpenAI:**
  - `gpt-5.5` (efforts: `xhigh`, `high`, `medium`, `low`, `non-reasoning`)
  - `gpt-5.5-pro` (effort: `xhigh`)
  - `gpt-5.5-instant` (variants: `June 2026` / `06-26`, `May 2026` / `05-26`)
- **Google:**
  - `gemini-3.8-flash` (efforts: `high`, `medium`, `low`)
  - `gemini-3.7-flash` (efforts: `high`, `medium`, `low`)
- **Meta:**
  - `muse-spark-1.3` (efforts: `max`, `xhigh`)
  - `muse-spark-1.2` (effort: `xhigh`)
  - `muse-spark-1.1` (effort: `xhigh`)
  - `muse-spark` (effort: `high`)

---

## 3. Data Integration Breakdown

### A. Benchmarks (`data/manual/benchmarks-aa.yaml`)
- **Total observations:** 458 (247 preserved baseline observations + 211 admitted target model observations).
- **Benchmark Definitions:** 14 registered evaluation suites with complete metadata:
  `critpt`, `aa-briefcase`, `gdpval-aa-v2`, `aa-omniscience`, `gdp-pdf`, `aa-lcr-1.1`, `hle`, `scicode`, `automationbench-aa`, `terminalbench-v4-0`, `tau3-banking`, `terminalbench-v2-1`, `gpqa-diamond`, `ifbench`.

#### Admitted Observations by Benchmark
| Benchmark ID | Benchmark Name | Unit / Measure | Admitted Rows |
| :--- | :--- | :--- | :---: |
| `aa-omniscience` | AA Omniscience | percent (accuracy & hallucination) | 36 |
| `critpt` | CritPt Frontier Physics | percent (score) | 19 |
| `aa-lcr-1.1` | AA Long Context Reasoning v1.1 | percent (score) | 18 |
| `gpqa-diamond` | GPQA Diamond | percent (score) | 18 |
| `gdpval-aa-v2` | GDPval-AA v2 | elo (score) | 16 |
| `hle` | Humanity's Last Exam | percent (score) | 14 |
| `scicode` | SciCode v1.0.1 | percent (score) | 14 |
| `terminalbench-v2-1` | Terminal-Bench v2.1 | percent (score) | 13 |
| `aa-briefcase` | AA-Briefcase (Agents) | elo (score) | 12 |
| `gdp-pdf` | GDP.pdf (Document Work) | percent (all-pass) | 12 |
| `tau3-banking` | τ³-Banking | percent (score) | 12 |
| `automationbench-aa` | AutomationBench-AA | percent (score) | 12 |
| `terminalbench-v4-0` | Terminal-Bench v4.0 | percent (score) | 8 |
| `ifbench` | IFBench | percent (score) | 7 |
| **Total** | | | **211** |

#### Admitted Observations by Model
| Model ID | Admitted Rows | Reasoning Effort Coverage |
| :--- | :---: | :--- |
| `gpt-5.5` | 65 | xhigh, high, medium, low, non-reasoning |
| `gemini-3.8-flash` | 42 | high, medium, low |
| `gemini-3.7-flash` | 34 | high, medium, low |
| `gpt-5.5-instant` | 21 | June 2026 (06-26), May 2026 (05-26) |
| `muse-spark-1.3` | 20 | max, xhigh |
| `muse-spark-1.2` | 10 | xhigh |
| `muse-spark-1.1` | 10 | xhigh |
| `muse-spark` | 8 | high |
| `gpt-5.5-pro` | 1 | xhigh |
| **Total** | **211** | |

### B. Cost Observations (`data/manual/cost-aa.yaml`)
- **Total observations:** 109 (87 preserved baseline + 22 target model observations).
- Workloads covered: `aa-intelligence-index-v4.2` and `aa-intelligence-index-v4.3`.
- Preserved active workload configuration while admitting blended task costs across target configurations.

### C. Speed Observations (`data/manual/speed-aa.yaml`)
- **Total observations:** 86 (80 preserved baseline + 6 canonical target observations).
- Enforced canonical selection rule: highest declared reasoning effort or latest primary variant per model family to avoid UI noise:
  - `gpt-5.5`: `GPT-5.5 (xhigh)` (87.7 tps, 62.3s TTFT)
  - `gpt-5.5-pro`: `GPT-5.5 Pro (xhigh)` (retained baseline)
  - `gpt-5.5-instant`: `GPT-5.5 Instant (June 2026)` (134.9 tps, 1.15s TTFT)
  - `gemini-3.8-flash`: `Gemini 3.8 Flash (high)` (272.9 tps, 13.8s TTFT)
  - `gemini-3.7-flash`: `Gemini 3.7 Flash (high)` (297.3 tps, 9.42s TTFT)
  - `muse-spark-1.3`: `Muse Spark 1.3 (max)` (225.8 tps, 26.9s TTFT)
  - `muse-spark-1.2`: `Muse Spark 1.2 (xhigh)` (219.4 tps, 14.6s TTFT)

---

## 4. Excluded Rows and Rejection Rationales

A total of **223 candidate metrics** from the harvested swarm were explicitly excluded from ingestion. Every exclusion falls into one of seven verified categories:

| Exclusion Category | Count | Methodological & Policy Justification |
| :--- | :---: | :--- |
| `composite_indices` | 18 | `intelligence_index` composite values excluded. ActualAnalysis fits individual, reproducible benchmark constituents rather than vendor composite aggregates. |
| `omniscience_net_composite` | 18 | `omniscience_net_index` excluded. Omniscience is stored as separate native constituent dimensions: `accuracy` (%) and `hallucination` (%). |
| `redundant_normalized_elo` | 13 | Normalized fractions for GDPval (`gdpval_normalized`) excluded in favor of native Bradley-Terry Elo ratings (`gdpval-aa-v2`). |
| `sub_metrics_and_breakdowns` | 36 | Component rubric scores (e.g. `briefcase_rubric_pass_rate`, analytical quality, presentation Elo) excluded; overall benchmark score/Elo retained. |
| `unregistered_benchmarks` | 98 | Evaluations lacking formal registration or methodology documentation in the actualanalysis benchmark registry. |
| `speed_selection_rule_lower_efforts` | 7 | Speed measurements for secondary/lower reasoning effort tiers excluded to prevent clutter and retain a single canonical speed comparison per model. |
| `missing_null_telemetry` | 33 | Null or unmeasured scores in harvested payloads distinguished from zero and omitted. |
| **Total Excluded** | **223** | |

---

## 5. Verification & Validation Evidence

All changes were rigorously tested locally prior to deployment:

1. **Schema Integrity:**  
   `DisplayBenchmarkFileSchema`, `CostFileSchema`, and `SpeedFileSchema` validate cleanly. Date fields format strictly as `YYYY-MM-DD` (`IsoDateSchema`).
2. **Typecheck:**  
   `npm run typecheck` passes with zero errors across all workspaces (`@actualanalysis/web`, shared libraries, scoring tools).
3. **Test Suites:**  
   `npm test` and `@actualanalysis/web test` pass 100% (74/74 web tests passing, registry tests clean).
4. **Static Pages Production Build:**  
   `NODE_OPTIONS=--max-old-space-size=2048 npm run build:pages` generated all 240 static routes with zero build or hydration errors.
5. **Leakage Audit:**  
   Inspection of `work/pages-site/` confirmed:
   - Model pages (e.g. `/models/gpt-5.5/`, `/models/gemini-3.8-flash/`) correctly render attributed external evaluations, speed, and cost tables.
   - Public API (`api/v1/results.json`, `api/v1/models.json`) and downloads (`api/v1/download/results.csv`) contain zero AA rows or unredistributable data.
6. **Secret Packing Fidelity:**  
   `AA_DISPLAY_DATA_GZIP_BASE64` round-trip test confirms exact byte-for-byte fidelity with `scripts/restore-display-data.mjs`.

---

## 6. Publication Decision

- **Published Method:** Retained **ACI 1.4.3**.
- **Live Deployment:** GitHub Pages (`https://maxizm.github.io/actualanalysis/`).
- **Data Boundary:** Strictly maintained.
