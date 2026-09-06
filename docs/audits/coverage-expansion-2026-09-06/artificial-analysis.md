# Artificial Analysis Intelligence Benchmarking & Private Evaluations Audit

**Date:** 2026-09-06  
**Auditor:** Gemini Agent (Artificial Analysis Adoption & Investigation Owner)  
**Orchestration:** Codex  
**Registry Owner:** Grok  
**Public Evidence Owner:** Gemini (Public Observation Additions)  
**Native Worker Swarm Count:** 1 native worker (`5c30f6ae-44b6-4864-ada9-1d17b9ee5293`, Independent Benchmark Researcher)  
**Live Research Source:** [Artificial Analysis Intelligence Benchmarking Methodology](https://artificialanalysis.ai/methodology/intelligence-benchmarking)

---

## 1. Executive Summary & Policy Guardrails

This audit provides an exhaustive investigation of the current **Artificial Analysis (AA) Intelligence Index v4.2** and AA's suite of standalone, private real-world evaluations. 

### Core Architectural & Data Policy Principles
1. **Strict Display-Only Boundary:** Attributed Artificial Analysis observations are display-only overlays. As mandated by repository policy (`README.md` lines 5 and 99), they **must never** enter public Bayesian capability fits, CC-BY snapshots, downloads, or API bulk exports.
2. **Admission Blocker on `data/manual/benchmarks-aa.yaml`:**
   - The existing schema (`DisplayBenchmarkFileSchema` in `apps/web/lib/display-data.ts`) strictly enforces a **single benchmark metadata block** and requires `score_unit: "percent"` with numerical values bounded in `[0, 100]`.
   - The current Index v4.2 includes Elo-rated evaluations (**AA-Briefcase** and **GDPval-AA v2**, both scaled around ~1000–1400+), which fail Zod validation.
   - Multiple constituent benchmarks are unmapped in `data/benchmarks/*.yaml` (which is owned exclusively by Grok), and explicit registry policies prohibit direct AA ingestion for specific benchmarks (e.g., `data/benchmarks/aa-lcr.yaml` forbids AA scores; `data/benchmarks/gdpval.yaml` commands *"Never ingest GDPval-AA"*).
   - Therefore, new AA index candidates are staged separately in the gitignored path `work/coverage-expansion/aa/benchmarks-candidate.yaml`.
3. **No Mimicked or Guessed Evaluations:** Authoritative, independently published non-AA author results are cataloged as first-class alternatives. Where exact runs or evaluator configurations are unpublished, results are marked explicitly unavailable.

---

## 2. Artificial Analysis Intelligence Index Version History

Artificial Analysis has iterated rapidly on its composite Intelligence Index since 2024. Below is the complete chronological audit of version transitions:

| Version | Period | Major Structural & Methodological Changes |
| :--- | :--- | :--- |
| **v1.0 – v2.0** | Jan 2024 – Aug 2025 | Baseline academic evaluation suite (MMLU, GSM8K, MATH, HumanEval). |
| **v2.1** | Aug 2025 | Added IFBench and AIME 2025; retired MATH-500 and AIME 2024. |
| **v2.2** | Aug 2025 – Sep 2025 | Added Artificial Analysis Long Context Reasoning (AA-LCR). |
| **v3.0** | Sep 2025 – Dec 2025 | Added Terminal-Bench Hard and τ²-Bench Telecom; added MMLU-Pro and LiveCodeBench; updated weightings. |
| **v4.0** | Jan 2026 | Replaced academic test suite with real-world evaluations: added **GDPval-AA** (knowledge work), **AA-Omniscience** (knowledge/hallucination), and **CritPt** (frontier physics reasoning). Removed MMLU-Pro, LiveCodeBench, and AIME 2025. Established 4 categories at 25% equal weight. |
| **v4.0.1** | Jan 2026 | Refined Terminal-Bench Hard to 44 tasks, dropping tasks with broken external runtime dependencies. |
| **v4.0.2** | Jan – Feb 2026 | Re-anchored GDPval-AA Elo scores following sandbox robustness and code execution fixes. |
| **v4.0.3** | Feb – Mar 2026 | Updated AA-Omniscience grader to Gemini 3 Flash Preview (Reasoning) following legacy deprecations. |
| **v4.0.4** | Mar – Jun 2026 | Updated GDPval-AA grader to Gemini 3.1 Pro Preview following model deprecations. |
| **v4.1** | Jun – Aug 2026 | Upgraded to **GDPval-AA v2** (re-baselined human expert anchor at 1000, 3-judge panel, 250 turns). Replaced Terminal-Bench Hard with **Terminal-Bench v2.1**; replaced τ²-Bench Telecom with **τ³-Banking**. Removed IFBench. Emphasized agentic weighting (Agents 34%, Coding 24%, Scientific Reasoning 24%, General 18%). Upgraded cost accounting with cache hit rates. |
| **v4.1.1** | Aug – Sep 2026 | Pinned τ³-Banking to upstream `tau2-bench v1.0.1` dataset and grader. Upgraded grader model for HLE, AA-LCR, and AA-Omniscience to **GPT-5.6 Luna (medium)**. |
| **v4.2** *(Current)* | **Sep 2026 – Present** | Added **AA-Briefcase** (15%) to Agents; added **GDP.pdf** (10%) to General; removed GPQA Diamond; upgraded AA-LCR to **v1.1** (clarified prompt, corrected 16 answer keys, GPT-5.6 Luna judge); upgraded SciCode to **v1.0.1** (regraded). Rebalanced category weights to 30/20/30/20 across 10 evaluations. |

---

## 3. Comprehensive Audit of Index v4.2 Constituents (10 Benchmarks)

The current Intelligence Index v4.2 combines 10 distinct evaluations spanning four core categories, totaling 100% weight:
- **Agents (30%)**
- **Coding (20%)**
- **General (30%)**
- **Scientific Reasoning (20%)**

### Constituent Summary Matrix

| Benchmark | Category | Index Wt | Questions / Tasks | Repeats | Response Type | Scoring Metric | Grader Engine | Tools |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :---: |
| **AA-Briefcase** | Agents | 15% | 91 tasks (4 scenarios) | 1 | File outputs | Combined Elo (rubric + analytical + presentation) | 3-judge panel (Opus 4.8, GPT-5.5, Gemini 3.1 Pro) | Yes (Code) |
| **GDPval-AA v2** | Agents | 10% | 220 tasks | 1 | File outputs | Bradley-Terry Elo anchored to human 1000 | 3-judge frontier panel | Yes (6 tools) |
| **τ³-Banking** | Agents | 5% | 97 tasks | 5 | Dual agent simulation | pass@1 backend DB state | GPT-5.4 Mini (medium) | Yes (DB/Tools) |
| **Terminal-Bench v2.1** | Coding | 10% | 89 tasks | 3 | Terminal interaction | pass@1 test suite pass/fail | Programmatic test suite | No (Bash CLI) |
| **SciCode (v1.0.1)** | Coding | 10% | 288 subproblems | 3 | Python code | pass@1 subproblems with background | Programmatic unit tests | No |
| **AA-Omniscience** | General | 15% | 6,000 questions | 1 | Open answer | Accuracy (10%) + Non-Hallucination (5%) | GPT-5.6 Luna (medium) | No |
| **GDP.pdf** | General | 10% | 100 tasks (500 attempts) | 5 | Free-form answer | All-pass headline; Mean Pass secondary | GPT-5.6 Luna (medium) | No |
| **AA-LCR v1.1** | General | 5% | 100 questions | 3 | Open answer | pass@1 Equality Checker | GPT-5.6 Luna (medium) | No |
| **Humanity's Last Exam** | Sci Reasoning | 10% | 2,158 questions | 1 | Open answer | pass@1 text-only subset | GPT-5.6 Luna (medium) | No |
| **CritPt** | Sci Reasoning | 10% | 70 challenges | 5 | Python / SymPy / Number | pass@1 official grading server | Official CritPt grading server | No |

---

### Detailed Benchmark Profiles

#### 1. AA-Briefcase (15% · Agents)
- **Concept & Source:** Evaluates models on multi-week knowledge work projects simulating complex business scenarios, built by industry practitioners.
- **Scale & Inputs:** 91 tasks across 4 scenarios; 2–5 tasks per simulated week. Uses realistic artifacts (Slack exports, financial models, PDFs, interview transcripts).
- **Execution Scaffold:** Stirrup agent harness in an offline E2B Linux container (Python 3.13, document stack, Pandoc, LibreOffice, Chromium). Maximum **500 turns** per task. Tools: `code_exec`, `finish`, `abandon_task_finish`, `view_image` (for vision models).
- **Grading & Metric:** Rubric checks (atomic pass/fail) plus pairwise comparative grading (Analytical Quality and Presentation Quality). Graded by a balanced 3-judge panel: **Claude Opus 4.8** (max effort), **GPT-5.5** (high reasoning), and **Gemini 3.1 Pro Preview** (high reasoning). Scores are aggregated via Bradley-Terry maximum likelihood into an overall Elo.
- **Contamination Controls:** Scenarios mix real, augmented, and proprietary synthetic files.

#### 2. GDPval-AA v2 (10% · Agents)
- **Concept & Source:** Adaptation of OpenAI's GDPval benchmark (arXiv:2510.04374), assessing economically valuable work across 44 occupations.
- **Dataset:** 220 gold tasks from `openai/gdpval` with corrected Office document relationships.
- **Execution Scaffold:** Stirrup harness in an E2B container equipped with 419 Python packages and TeX Live. Up to **250 turns**. Six exposed tools: Web Fetch, Web Search (Brave API), View Image, Code Exec, Finish, Abandon Task.
- **Grading & Metric:** Pairwise Bradley-Terry Elo blindly judged by a frontier 3-judge panel, anchored to human experts at 1000. Normalized into the Index via $	ext{clamp}((	ext{Elo} - 500) / 2000)$.
- **Differences from Paper:** Upgraded sandbox, panel judging instead of single judge, and early-exit support.

#### 3. τ³-Banking (5% · Agents)
- **Concept & Source:** Fintech customer-support domain from Sierra's τ-Knowledge framework (arXiv:2603.04370), evaluating agents coordinating retrieval over ~700 policy documents (~195k tokens, 21 categories) with multi-step account actions.
- **Dataset & Implementation:** Evaluates all 97 tasks with 5 repeats using upstream `tau2-bench v1.0.1`.
- **Harness & Scaffold:** BM25 lexical search and grep (`bm25_grep`) enabled within the τ-Bench harness. Execution bounded to **200 simulation steps**.
- **Grading & Metric:** pass@1 evaluated against **actual backend database state mutations** (e.g., whether a dispute record was created) rather than conversational prose. Uses **GPT-5.4 Mini** (medium reasoning) for user simulation and NL assertions.

#### 4. Terminal-Bench v2.1 (10% · Coding)
- **Concept & Source:** Verified refresh of Stanford / Laude Institute Terminal-Bench (arXiv:2601.11868).
- **Dataset & Implementation:** 89 curated tasks across software engineering, system administration, data processing, and security.
- **Execution Scaffold:** Evaluated using Terminus 2 harness in an E2B sandbox with 3 repeats. Limits: max 250 planning episodes and 7,200s timeout per task.
- **Grading & Metric:** pass@1 scored programmatically against bash verification test suites.

#### 5. SciCode v1.0.1 (10% · Coding)
- **Concept & Source:** Scientist-curated coding benchmark across 16 scientific subdisciplines (arXiv:2407.13168).
- **Dataset & Implementation:** 288 subproblems (test set) across 80 main problems, run with 3 repeats. Prompts include scientist-annotated background context.
- **Grading & Metric:** pass@1 on subproblems scored by executing test cases under SciCode v1.0.1 regraded harness.

#### 6. AA-Omniscience (15% · General)
- **Concept & Source:** Proprietary factual knowledge and hallucination benchmark (arXiv:2511.13029).
- **Dataset & Implementation:** 6,000 questions covering 42 topics (Business, Law, Medicine, Humanities, STEM). Single-turn open answer.
- **Grading & Metric:** Evaluated with **GPT-5.6 Luna (medium)** into `CORRECT`, `INCORRECT`, `PARTIAL_ANSWER`, or `NOT_ATTEMPTED`. Contributes two distinct components:
  1. **Accuracy (10% Index weight):** Proportion of correct answers.
  2. **Non-Hallucination Rate (5% Index weight):** $1 - 	ext{hallucination rate}$, rewarding calibrated abstention over incorrect guesses.

#### 7. GDP.pdf (10% · General)
- **Concept & Source:** Adaptation of Surge AI's benchmark (arXiv:2607.11192) evaluating grounded reasoning over complex professional PDFs.
- **Dataset & Scale:** 100 tasks across 10 domains, grounded in 4,592 PDF pages. Evaluated with 5 repeats (500 total attempts) across 1,275 atomic criteria.
- **Document Pipeline:** Source PDFs processed with LiteParse + OCR. Models receive extracted text and rendered composite images (72–150 DPI, 2–4 pages per composite). Models answer in a single turn without tools.
- **Grading & Metric:** **GPT-5.6 Luna (medium)** judges each criterion independently.
  - **All-pass rate (Headline):** Share of attempts where all criteria pass.
  - **Mean Pass (Secondary):** Task-macro average of criterion satisfaction.
- **Difference from Surge AI:** Uses LiteParse OCR + composite images instead of proprietary API document loaders, and GPT-5.6 Luna instead of Gemini 3.5 Flash.

#### 8. AA-LCR v1.1 (5% · General)
- **Concept & Source:** Artificial Analysis Long Context Reasoning benchmark across ~230 long documents in 7 domains.
- **Scale:** 100 questions requiring ~100k input tokens each (minimum 128k context window).
- **Changes in v1.1:** Adds a clarified system prompt, corrects 16 answer keys, and grades with **GPT-5.6 Luna (medium)** equality checker. 3 repeats, pass@1.

#### 9. Humanity's Last Exam (HLE) (10% · Scientific Reasoning)
- **Concept & Source:** Multidisciplinary frontier benchmark by CAIS (arXiv:2501.14249v2).
- **Subset & Implementation:** Uses the **2,158 text-only questions** from the May 2025 revision (of 2,500 total questions). Single repeat.
- **Grading & Metric:** pass@1 evaluated via equality checker prompt using **GPT-5.6 Luna (medium)**.
- **Known Bias Disclosure:** Authors note adversarial curation against GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, and o1, which may bias comparisons against non-curation models.

#### 10. CritPt (10% · Scientific Reasoning)
- **Concept & Source:** Research-level physics reasoning benchmark (arXiv:2509.26574, `critpt.com`).
- **Dataset & Implementation:** 70 challenge problems created by 50+ physicists across 11 subfields. 5 repeats per question.
- **Scaffold & Grader:** Two-step parsing (reasoning step followed by code/expression formatting). Responses are graded on the official, private CritPt grading server with pass@1 scoring.

---

## 4. Standalone Private Real-World Evaluations

Beyond Index v4.2, Artificial Analysis operates standalone leaderboards for complex agentic workflows:

| Benchmark | Domain | Scale | Split Type | Scaffold / Harness | Primary Metric |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Harvey LAB-AA** | Legal Operations | 120 tasks | Private (Harvey dataset) | Stirrup (200 turns, sandbox) | Criterion pass rate & All-pass |
| **APEX-Agents-AA** | Financial & Management Consulting | 452 tasks | Public subset (`mercor/apex-agents`) | Stirrup + Archipelago + MCP | pass@1 across rubric |
| **AutomationBench-AA** | Enterprise SaaS Automation | 657 tasks | Private held-out (Zapier v1.0) | Multi-turn REST API environment | Objective completion (0 on guardrail break) |
| **AA-AnalystAgent** | Quantitative Data Analysis | 80 tasks | Private held-out (14 domains) | Stirrup sandbox (Python 3.12, 100 turns) | **pass^5** (correct on all 5 repeats) |
| **ITBench-AA** | SRE & Kubernetes Diagnostics | 59 scenarios | Hybrid (40 public + 19 private) | Stirrup (`run_shell` + `finish`) | Precision at full recall |
| **EnterpriseOps-Gym-AA** | Enterprise Operations & ERP | 1,117 tasks | Oracle mode (ServiceNow 8 domains) | Stirrup + MCP gym servers + SQLite | Strict pass@1 state verification |
| **IFBench** | Instruction Following | 294 questions | Public (`allenai/IFBench_test`) | Single turn, loose mode | Prompt-level accuracy pass@1 |
| **MLCR-AA** | Clinical Medical Reasoning | 60 questions | Private held-out (expert tiers) | Multi-document synthesis | Pass rate (concise, complete, accurate) |

---

## 5. Independent Contamination Protections vs. Reality

Artificial Analysis emphasizes private test sets and held-out splits to mitigate test-set contamination. However, **private != guaranteed leakage prevention**. A rigorous evaluation reveals five critical failure modes:

1. **Pre-Training Corpus Ingestion:**
   - Private tasks frequently ground themselves in real-world artifacts (e.g., SEC 10-K filings, municipal budgets, arXiv papers, clinical trial protocols, open-source repositories).
   - While the *questions* may be private, the *grounding facts and documents* reside in standard web crawls (Common Crawl, RefinedWeb), allowing models to recall factual patterns without genuine multi-document reasoning.
2. **Synthetic Data Generation & Teacher Distillation Priors:**
   - High-volume private benchmarks (e.g., AA-Omniscience, EnterpriseOps-Gym synthetic DB seeds) rely on frontier models (GPT-4o, GPT-5, Gemini Pro) for data generation, verification, or rubric writing.
   - Models trained or fine-tuned on synthetic data generated by the same model families share latent distributional representations, inflating benchmark scores artificially.
3. **Prompt and Solution Extraction:**
   - Agentic environments with tool execution (`code_exec`, `run_shell`) or multi-turn conversational loops are susceptible to prompt injection, memory inspection, and exfiltration if network isolation or sandbox scrubbing fails.
4. **Judge Model Symmetry & Systematic Grader Biases:**
   - Evaluators like AA-Briefcase, GDPval-AA v2, and MLCR-AA rely on LLM judges (GPT-5.5, Gemini 3.1 Pro, Opus 4.8).
   - Frontier models frequently exhibit length bias, stylistic favoritism, and self-enhancement bias when grading outputs generated by models from their own lineage.
5. **Evaluation API Retention & Lack of Zero-Knowledge Verification:**
   - Submissions sent to third-party grading APIs (such as CritPt or provider endpoints) risk being logged, cached, or incorporated into RLHF telemetry unless strict zero-data-retention agreements are cryptographically verifiable.

---

## 6. Overlap & Gap Analysis with ActualAnalysis Registry

Comparing the 10 AA Index v4.2 benchmarks against the actualanalysis registry (`data/benchmarks/*.yaml`):

| Benchmark | ActualAnalysis Registry ID | Registry Status | Gap / Alignment Analysis |
| :--- | :--- | :---: | :--- |
| **CritPt** | `critpt` | `watchlist` | **Exact Match.** Supported as isolated display overlay in `data/manual/benchmarks-aa.yaml` (113 models). |
| **SciCode** | `scicode-verified-v2-main-with-background` | `active` | **Condition Mismatch.** Registry tracks 64 whole-problem pass@1 under SciCode-Verified v2; AA tracks 288 subproblem pass@1 under SciCode v1.0.1. |
| **τ³-Banking** | `tau3-bench-banking` | `active` | **Conceptual Match.** Both use 97 items; AA uses 5 repeats and GPT-5.4 Mini, while registry specifies `default_k: 4`. |
| **Terminal-Bench 2.1**| `terminal-bench-2.1` | `watchlist` | **Exact ID Match.** Registry holds vendor-reported watchlist; AA runs Terminus 2 with 3 repeats. |
| **HLE** | `hle-no-tools` | `active` | **Subset Mismatch.** Registry uses CAIS 2,500-question full split; AA uses 2,158 text-only subset with GPT-5.6 Luna judge. |
| **AA-LCR v1.1** | `aa-lcr` | `shadow` | **Policy Blocked.** `data/benchmarks/aa-lcr.yaml` notes explicitly: *"Artificial Analysis scores themselves are prohibited; this entry permits only non-AA runs."* |
| **GDPval-AA v2** | `gdpval` | `active` | **Policy Blocked.** `data/benchmarks/gdpval.yaml` notes explicitly: *"Never ingest GDPval-AA."* |
| **AA-Briefcase** | *None* | `unmapped` | **Missing from Registry.** Grok owns registry additions. Uses Elo scale (~1000–1400+), incompatible with percent schema. |
| **AA-Omniscience** | *None* | `unmapped` | **Missing from Registry.** Grok owns registry additions. Composite index requires dual-component representation. |
| **GDP.pdf** | `gdp-pdf-google-202609` | `watchlist` | **Variant Mismatch.** Registry contains only a Google model card entry; general Surge AI GDP.pdf is unmapped. |

---

## 7. Admission Blocker Analysis for `benchmarks-aa.yaml`

As instructed: *"You may update ONLY data/manual/benchmarks-aa.yaml if its existing schema/access policy supports new readable exact AA displays; otherwise stage private candidate separately in existing ignored work/coverage-expansion/aa and document admission blocker."*

### Architectural Blockers Identified:
1. **Schema Singularity (`DisplayBenchmarkFileSchema`):**
   ```typescript
   export const DisplayBenchmarkFileSchema = z.object({
     redistributable: z.literal(false),
     warning: z.string().min(1),
     benchmark: z.object({
       id: z.string(),
       version: z.string(),
       n_items: z.number().int().positive(),
       repeats: z.number().int().positive(),
       scoring: z.string(),
       methodology_url: z.string().url(),
       harness_url: z.string().url(),
       grader_version: z.string(),
     }).strict().optional(),
     observations: z.array(DisplayBenchmarkObservationSchema),
   }).strict();
   ```
   The schema permits only a **single optional benchmark definition** at the root. Adding observations for 10 distinct benchmarks cannot be described by this schema.
2. **Scale Constraint on Elo Benchmarks:**
   `DisplayBenchmarkObservationSchema` specifies:
   ```typescript
   score: z.number().finite().min(0).max(100),
   score_unit: z.literal("percent"),
   ```
   AA-Briefcase and GDPval-AA v2 report Elo ratings (~1000–1400+). Placing these scores in `benchmarks-aa.yaml` triggers fatal Zod validation errors.
3. **UI Overlay Drop Rule:**
   `withDisplayBenchmarks` in `apps/web/lib/display-data.ts` discards rows whose `benchmark_id` is missing from `data.benchmarks`. Adding `aa-briefcase` or `aa-omniscience` observations would result in silent drops.
4. **Data Policy Prohibitions:**
   Existing files `data/benchmarks/aa-lcr.yaml` and `data/benchmarks/gdpval.yaml` contain hard directives barring AA runs.

### Resolution:
Staged the candidate multi-benchmark manifest in the gitignored location:
[`work/coverage-expansion/aa/benchmarks-candidate.yaml`](file:///Users/mzalik/Documents/Projects/actualanalysis/work/coverage-expansion/aa/benchmarks-candidate.yaml)

---

## 8. Authoritative Independently Published Non-AA Alternatives

Where proprietary AA data cannot enter the public fit, the following authoritative author and independent sources provide redistributable alternatives:

| Benchmark | Primary Authoritative Paper | Repository / Leaderboard | Published Author Results Summary |
| :--- | :--- | :--- | :--- |
| **CritPt** | [arXiv:2509.26574](https://arxiv.org/abs/2509.26574) | [CritPt-Benchmark/CritPt](https://github.com/CritPt-Benchmark/CritPt) | Base models: GPT-5 (high) achieves ~4.0%; with tools: ~10%. PhD physics experts achieve ~65%; non-experts ~34%. |
| **SciCode / SciCode-Verified** | [arXiv:2407.13168](https://arxiv.org/abs/2407.13168) & [arXiv:2608.01655](https://arxiv.org/abs/2608.01655) | [SciCode Leaderboard](https://scicode-bench.github.io/#experiment-results) & [flyingwagner/scicode-verified](https://github.com/flyingwagner/scicode-verified) | Original SciCode main problem resolve rate: Claude 3.5 Sonnet ~4.6%, o1-preview ~7.7%. SciCode-Verified v2 provides 64 corrected whole-problem pass@1. |
| **τ-bench / τ3-bench** | [arXiv:2603.04370](https://arxiv.org/abs/2603.04370) | [sierra-research/tau2-bench](https://github.com/sierra-research/tau2-bench) | Official Sierra benchmark testing policy retrieval and tool execution against backend database state. |
| **Terminal-Bench v2.1** | [arXiv:2601.11868](https://arxiv.org/abs/2601.11868) | [tbench.ai Leaderboard](https://tbench.ai/leaderboard/terminal-bench/2.1) | Stanford / Laude Institute 89-task benchmark; evaluated with bash verification suites. |
| **GDPval** | [arXiv:2510.04374](https://arxiv.org/abs/2510.04374) | [openai/gdpval](https://huggingface.co/datasets/openai/gdpval) | 220 gold tasks public, 1,320 full suite; evaluated via blind human expert pairwise judgment. |
| **GDP.pdf** | [arXiv:2607.11192](https://arxiv.org/abs/2607.11192) | [surgeai/GDP.pdf](https://huggingface.co/datasets/surgeai/GDP.pdf) | Surge AI 100-task benchmark over 4,592 PDF pages; original harness evaluates raw PDF with Gemini 3.5 Flash judge. |
| **Humanity's Last Exam** | [arXiv:2501.14249v2](https://arxiv.org/abs/2501.14249v2) | [Scale AI HLE Leaderboard](https://labs.scale.com/leaderboard/humanitys_last_exam) | 2,500-question multidisciplinary exam curated by CAIS and Scale AI. |

---

## 9. Phased Implementation Roadmap

1. **Step 1 (Grok — Registry Audit):**
   Audit `data/benchmarks/` to formally register `aa-briefcase`, `aa-omniscience`, and `gdp-pdf` (with appropriate domain weights and chance levels), and resolve the restrictive ingestion notes on `aa-lcr` and `gdpval`.
2. **Step 2 (Architecture & UI — Schema Evolution):**
   Evolve `DisplayBenchmarkFileSchema` in `apps/web/lib/display-data.ts` to support multi-benchmark manifests and mixed metric scales (`percent` and `elo`), while ensuring strict non-redistributable flags remain immutable.
3. **Step 3 (AA Ownership — Candidate Promotion):**
   Once schema and registry gates open, promote `work/coverage-expansion/aa/benchmarks-candidate.yaml` to `data/manual/benchmarks-aa.yaml`, restoring full 10-benchmark display coverage.
4. **Step 4 (Public Ingestion — Gemini):**
   Ingest independently published author results (SciCode-Verified, CAIS HLE, Stanford Terminal-Bench, Sierra τ3-bench) into public observation stores to enrich the Bayesian capability fit without licensing friction.
