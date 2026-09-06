# ActualAnalysis as implemented · 2026-09-07

**Commit:** [`a2088982ff848372d97ccb9f3569074fddf3365f`](https://github.com/MaxiZm/actualanalysis/commit/a2088982ff848372d97ccb9f3569074fddf3365f) (`Add experimental measurement spaces and benchmark coverage audit`, 2026-09-07).  
**Production method:** ActualAnalysis Capability Index **1.4.3**, taxonomy/calibration edition **2026a**, data cutoff **2026-09-05**, default profile **`max-common`**.  
**Deployed fit:** snapshot `data/snapshots/2026-09-06/` generated `2026-09-06T10:36:35.130Z`.  
**This document:** a standalone implementation reference. It describes code, registry, and the published 1.4.3 posterior at a208898. It does **not** promote experimental 1.5.0 geometry or class priors. Experimental `experiment.py` `prepare` behavior in this working copy includes the post-a208898 repairs in [§14.2](#142-experiment-prepare-repairs-relative-to-a208898); those repairs do not change the deployed 1.4.3 fit.

Public methodology copy: [methodology.md](methodology.md). Executable constants: [../data/index-config.yaml](../data/index-config.yaml). Math companion: [scoring-math.md](scoring-math.md). 1.4.3 effort-policy audit: [audits/1.4.3-effort-coverage/README.md](audits/1.4.3-effort-coverage/README.md).

## Contents

1. [Scope and production versus experimental](#1-scope-and-production-versus-experimental)
2. [Deployed snapshot status](#2-deployed-snapshot-status)
3. [End-to-end dataflow](#3-end-to-end-dataflow)
4. [Registry resolution: source, model, system, effort](#4-registry-resolution-source-model-system-effort)
5. [Independent conditions versus families](#5-independent-conditions-versus-families)
6. [Admission, deduplication, provenance](#6-admission-deduplication-provenance)
7. [Likelihood classes, denominators, metadata inflation](#7-likelihood-classes-denominators-metadata-inflation)
8. [Correlated five-domain prior and signed effort](#8-correlated-five-domain-prior-and-signed-effort)
9. [Benchmark, family, cell, source, and protocol effects](#9-benchmark-family-cell-source-and-protocol-effects)
10. [NUTS inference and numerical gates](#10-nuts-inference-and-numerical-gates)
11. [Draw-wise panel standardization, ranks, and tiers](#11-draw-wise-panel-standardization-ranks-and-tiers)
12. [Snapshot, public DTO, and attributed AA isolation](#12-snapshot-public-dto-and-attributed-aa-isolation)
13. [Refresh candidate 928/677 versus deployed 924/673](#13-refresh-candidate-928677-versus-deployed-924673)
14. [Experimental measurement geometry and class prior](#14-experimental-measurement-geometry-and-class-prior) ([prepare repairs §14.2](#142-experiment-prepare-repairs-relative-to-a208898))
15. [Current limitations](#15-current-limitations)
16. [Reproduction commands](#16-reproduction-commands)
17. [Code-reference index](#17-code-reference-index)
18. [Caveats about documentation drift](#18-caveats-about-documentation-drift)

---

## 1. Scope and production versus experimental

Production ACI 1.4.3 estimates five correlated capability traits from published benchmark evidence and publishes Mixed, Agentic, and Chat views on a panel scale (mean 50, sd 10). Price, speed, and context are operating characteristics; they do not enter the likelihood. The unit of analysis is a **model snapshot at a declared effort class**. Missing tests are not scored as zero.

Two layers exist in this commit and must not be conflated:

| Layer | Status | Enters public leaderboard / snapshot / bulk DTO? |
|---|---|---|
| Correlated five-domain NumPyro model, `unreported_effort_policy: maximum` | **Deployed** 1.4.3 / 2026a | Yes |
| `general_specific` and `correlated_unit` trait structures | Implemented, **rejected** on reserved/exploratory holdouts | No |
| Restricted related-release class-prior mixture | Implemented behind `class_prior.enabled` | No; runner marks `experimental` / `publishable: false` |
| Measurement-information geometry, cone tests, partial-ID bounds | Implemented in Python + tests | No; diagnostics only |
| Predecessor random-walk / Student-t change prior | **Proposal only** ([proposals/aci-1.5.0-related-release-prior.md](proposals/aci-1.5.0-related-release-prior.md)) | No |
| Certified transfer classes / confirmatory promotion lock | Explicitly **not** locked | No |

The production trait structure is `correlated` ([../data/index-config.yaml](../data/index-config.yaml)). Enabling `class_prior` on a production export is rejected by `production_export_issues` in [../packages/scoring/python/aci12/class_prior.py](../packages/scoring/python/aci12/class_prior.py).

---

## 2. Deployed snapshot status

Inspected files: [../data/snapshots/2026-09-06/snapshot.json](../data/snapshots/2026-09-06/snapshot.json), the dated CSVs, and the frozen fit input [audits/1.4.3-effort-coverage/accepted-input.json](audits/1.4.3-effort-coverage/accepted-input.json).

### 2.1 Joint posterior (one fit, three views)

| Field | Value |
|---|---|
| Method / editions | 1.4.3, taxonomy 2026a, calibration 2026a |
| Trait structure | `correlated` |
| Unreported-effort policy | `maximum` |
| Seed | `20260904` |
| Engine | `numpyro-nuts` |
| Chains / warmup / samples / retained | 4 / 4000 / 5000 / 12 000 |
| Target accept | 0.999 |
| Devices | 4 |
| Elapsed | 653.2 s |
| Divergences | 0 |
| E-BFMI (Hamiltonian) | 0.826, 0.889, 0.875, 0.899 |
| Worst R-hat among declared sites | 1.00176 (`run_noise`) |
| Minimum bulk ESS among declared sites | 2619 (`cell_sigma`) |
| Worst display-point MCSE | 0.197 (`Z_cal`) |
| Accepted | `true` for Mixed, Agentic, and Chat |

Latest Mixed run id `17c60fe7-1141-4917-8975-d0209ed1a799` (`2026-09-06T10:24:49.835Z`); Agentic `90b027c8-…`; Chat `284dad50-…`. The three views share one posterior; diagnostics are duplicated per kind.

### 2.2 Fitted graph versus catalog

| Quantity | Deployed fit | Snapshot catalog / on-disk registry |
|---|---:|---|
| Fitted observations | **924** | 1517 result rows in snapshot (includes observed-only / non-fit) |
| Fitted cells (`system × condition`) | **673** | 673 used Mixed cells |
| Fitted model releases | **110** | 126 model YAML / snapshot models |
| Represented systems | **131** (110 `@max-common` + 21 `@std-common`) | same 131 scored systems |
| Fitted benchmark **conditions** | **19** | 102 snapshot benchmarks; **107** YAML files |
| Fitted **families** | **16** | family ids on those 19 conditions |
| Protocols in the fit | **19** | 30 source YAML files |
| Likelihood mix | 464 `a_prime`, 272 `a_single`, 154 `normal`, 34 `a_total`, 0 `a_exact` | — |
| `metadata_incomplete` | 897 of 924 | — |
| Independent / self-report provenance | 853 / 71 | — |
| In overlap-graph reference component | 924 / 924 | — |
| Fixed-effort represented systems | 88 | — |
| Mixed evidence tiers | 18 verified, 70 ranked, 43 provisional | catalog retains all 126 models |

`systems_prepared_for_fit` in [audits/1.4.3-effort-coverage/preparation-summary.json](audits/1.4.3-effort-coverage/preparation-summary.json) is **129**: unique system ids that have at least one prepared observation. The NumPyro payload still **represents 131** systems, because a variable-effort model with a documented default contributes `@std-common` even if that class currently has no cell. Two represented systems therefore have zero fitted cells.

Fitted conditions, in payload order:

`arc-agi-2-semi-private`, `deepswe`, `deepswe-1.1`, `frontiermath-v2-tier-4`, `frontiermath-v2-tiers-1-3`, `gdpval`, `hle-no-tools`, `lmarena-text-style-controlled`, `matharena-composite`, `mcpmark`, `metr-time-horizon-1.1`, `scicode-verified-v2-main-with-background`, `simpleqa-verified-epoch-anti-abstention-v1-0-0`, `simpleqa-verified-epoch-anti-abstention-v1-2-0`, `swe-rebench`, `tau3-bench-banking`, `terminal-bench-4.0`, `vals-finance-agent-v2-partial`, `vending-bench-2`.

Families (16): `arc-agi`, `deepswe` (v1 and v1.1), `frontiermath` (Tier 4 and Tiers 1–3), `gdpval`, `hle`, `lmarena-text`, `matharena-composite`, `mcpmark`, `metr-time-horizon`, `scicode-verified`, `simpleqa` (1.0.0 and 1.2.0), `swe-rebench`, `tau3-bench-banking`, `terminal-bench`, `vals-finance-agent-v2`, `vending-bench`.

Snapshot benchmark status among the 102 exported rows: 19 `active`, 81 `watchlist`, 2 `shadow`. Active membership of the fit matches those 19 ids. Snapshot `runs` retains historical method versions (1.0.0 through 1.4.3); publication uses the latest 1.4.3 triple.

### 2.3 Calibration panel

Sixteen configured `@max-common` systems, all present in the fitted graph ([../data/index-config.yaml](../data/index-config.yaml)):

`gpt-4.1`, `gpt-5-2025-08-07`, `gpt-5.2`, `claude-opus-4.5`, `claude-sonnet-4`, `claude-opus-4.1`, `claude-opus-4.6`, `claude-fable-5`, `gemini-3-pro`, `gemini-3.1-pro`, `deepseek-v3.2`, `kimi-k3`, `grok-4.5`, `glm-5.2`, `qwen-3.8-max`, `muse-spark-1.1`.

Publication requires at least 12 fitted panel members and independent evidence in every domain, with at least two cells in three domains ([../packages/scoring/src/aci12.ts](../packages/scoring/src/aci12.ts) `auditCalibrationPanelPerDomainCoverage`). The 1.4.3 preparation reports no missing panel systems.

---

## 3. End-to-end dataflow

```
registry YAML (data/models, data/benchmarks, data/sources, data/index-config.yaml)
        + adapter ingest / manual results
        → alias resolution, metadata annotation, lineage harmonization
        → preferred-result selection (comparison tables)
        → coerceAci12RegistryInput + prepareAci12
        → indexed NumPyro payload (aci12-input.json)
        → uv run python -m aci12.runner  (NUTS)
        → diagnostics + posterior npz + summary JSON
        → persist three index kinds (mixed/agentic/chat) or refuse the set
        → optional snapshot export (CSV/JSON; AA overlay excluded)
        → web SiteData; public DTO allowlist; attributed AA display overlay
```

Concrete stages:

1. **Ingest.** [../packages/ingest/src/](../packages/ingest/src/) adapters emit `RawResult` rows. [../packages/ingest/src/observation-annotations.ts](../packages/ingest/src/observation-annotations.ts) calls lineage harmonization. [../scripts/pipeline.ts](../scripts/pipeline.ts) can replay a saved record file (`--input`) instead of fetching.
2. **Preparation.** [../packages/scoring/src/aci12-input.ts](../packages/scoring/src/aci12-input.ts) maps registry rows to `AciObservation`. [../packages/scoring/src/aci12.ts](../packages/scoring/src/aci12.ts) `prepareAci12` assigns effort class, likelihood, contamination, and lineage uniqueness.
3. **Indexation.** [../packages/scoring/src/numpyro.ts](../packages/scoring/src/numpyro.ts) (and the identical builder in [../scripts/prepare-candidate-input.ts](../scripts/prepare-candidate-input.ts)) builds integer indexes for models, systems, conditions, families, cells, and protocols.
4. **Fit.** [../packages/scoring/python/aci12/model.py](../packages/scoring/python/aci12/model.py) + [runner.py](../packages/scoring/python/aci12/runner.py). Default `requireAccepted` is true: a failed numerical gate throws and nothing is published.
5. **Summary.** [../packages/scoring/python/aci12/summarize.py](../packages/scoring/python/aci12/summarize.py) standardizes draws, applies tier gates, computes ranks on eligible systems only, and emits cell misfit diagnostics.
6. **Persistence.** [../scripts/pipeline.ts](../scripts/pipeline.ts) `assessRunSet` / `planPersistence`: all three kinds must exist; Mixed must have at least one non-provisional ranked system. `--dry-run` writes nothing; `--skip-score` is ingest-only and cannot `--commit-snapshot`.
7. **Display.** [../apps/web/lib/snapshot-data.ts](../apps/web/lib/snapshot-data.ts) rebuilds coverage from used cells. [../apps/web/lib/public-dto.ts](../apps/web/lib/public-dto.ts) allowlists public fields. [../apps/web/lib/display-data.ts](../apps/web/lib/display-data.ts) attaches non-redistributable AA speed/cost/CritPt overlays for the site only.

Legacy `runScoring` / bootstrap in [../packages/scoring/src/score.ts](../packages/scoring/src/score.ts) **rejects** current Bayesian method versions and cannot publish 1.4.3.

---

## 4. Registry resolution: source, model, system, effort

### 4.1 Identities

| Object | Identity | Notes |
|---|---|---|
| Model snapshot | YAML `id` under [../data/models/](../data/models/) | 126 catalog releases |
| System | `{modelId}@{std-common\|max-common}` | Canonical fixed-effort id is `@max-common` |
| Benchmark **condition** | YAML `id` under [../data/benchmarks/](../data/benchmarks/) | Version + grader pins live on the condition |
| Family | `family_id`, else prefix inference in `inferredFamily` | Prefixes: `swe-bench`, `terminal-bench`, `arc-agi`, `frontiermath`, `livebench`, `livecodebench`, `metr-time-horizon`, `vending-bench`, `osworld` |
| Protocol | `protocol_id` else `source_id` | Used for source offsets and the overlap graph |
| Cell | `(systemId, benchmarkId)` | Multiple sources may share a cell |
| Lineage | `lineage_id` | Native row and confirmed mirrors share one lineage |

Domain loadings \(\lambda_{bk}\) are declared on the condition and must sum to 1. If omitted, categories are mapped through `config.domains` and split equally among matched domains ([../packages/scoring/src/aci12-input.ts](../packages/scoring/src/aci12-input.ts) `categoryDomains`).

### 4.2 Effort reading

[../packages/shared/src/effort.ts](../packages/shared/src/effort.ts) `readReportedEffort` walks `effort_tier` then config keys `reasoning_effort`, `thinking_level`, `effort_tier`, `compute_effort`, `evaluation_profile`. Missing-marker strings (`unknown`, `unreported`, `n/a`, `—`, …) never override an explicit value. Numeric `compute_effort: 0.99` is preserved as `"0.99"`. The source field is not rewritten when the index assumes maximum.

Canonicalization ([../packages/scoring/src/aci12.ts](../packages/scoring/src/aci12.ts)): first token of the lowercased string, then synonyms (`high`/`thinking`/`extended` → `high`; `xhigh`/`extra-high` → `xhigh`; `max`/`maximum`/`ultra` → `max`; `default`/`standard`/`std` → `default`). Rank order: `none < minimal < low < medium < high < xhigh < max`.

### 4.3 Class assignment (`profileFor`) and unreported = max

`isFixedEffort` is true when default and max canonical tiers are equal, or when max/default is missing **unless** a documented dial exists with unknown default (`max` present, multi-valued `effort_tier_order`, no default). Fixed-effort models contribute one system, id `@max-common`, with \(\delta_m=0\).

For variable effort, with `unreported_effort_policy: maximum` (production 1.4.3):

- Missing observed tier → `@max-common`, `approximate=true`, `effortAssumedMaximum=true`.
- Observed equals documented default, or token `default` → `@std-common`.
- Observed equals documented max → `@max-common`.
- Intermediate ranked tiers map to the nearer endpoint and are approximate.
- Native-agentic observations (`primaryDomain === "agentic"` and `harnessClass === "native"`) cannot support `@std-common` or a pooled fixed-effort system.

Historical registries **without** the field retain the previous standard fallback; old snapshots are not relabelled ([audits/1.4.3-effort-coverage/README.md](audits/1.4.3-effort-coverage/README.md)). The UI labels the assumption **Max assumed**. Approximate / assumed assignments set `metadataIncomplete` and keep the 1.5× run-noise factor. This is a declared index policy, not verification of the evaluator’s setting.

1.4.3 moved 46 already-admitted observations from standard to maximum and newly admitted 3 GPT-6 Astra rows whose maximum is known but whose API default is not. Explicit Medium/High/xHigh/default/numeric settings did not change. Gemini 3.8 Flash maximum-profile coverage became 5/19 (MathArena joins the max profile); its explicit Medium DeepSWE run stays on standard.

---

## 5. Independent conditions versus families

A **condition** is one fitted benchmark id: DeepSWE v1 and v1.1 are two conditions; FrontierMath v2 Tier 4 and Tiers 1–3 are two; SimpleQA Epoch 1.0.0 and 1.2.0 are two. Admission, version/grader/tool-policy matching, Elo snapshot uniqueness, and coverage counts operate at condition grain. Coverage for a system is **distinct used fitted conditions / 19** ([../apps/web/lib/snapshot-data.ts](../apps/web/lib/snapshot-data.ts) `computeCoverage`; leaderboard title: “benchmarks fitted in this run have a used cell”).

A **family** groups related conditions for residual dependence. Shared families in the deployed 19: `deepswe`, `frontiermath`, `simpleqa`. Information share and the concentration diagnostic \(c_{sF}\) use family, not condition. A system can have two SimpleQA cells and still have those cells counted as one family for `max_family_share` and the drop-family precision diagnostic.

**Independent provenance** is a third axis: `origin_provenance === "independent"` (index 0) versus `self_report` (index 1). Safe cells require independent provenance **and** contamination-safe holdout timing ([§6](#6-admission-deduplication-provenance)). Independent does not mean “different family.”

Cell counts by family in the deployed 673: FrontierMath 107, LMArena 84, ARC-AGI 77, HLE 59, SimpleQA 59, DeepSWE 51, MathArena 50, Vending-Bench 41, Finance Agent v2 38, τ³ 26, MCPMark 26, METR 15, SWE-rebench 11, GDPval 11, Terminal-Bench 10, SciCode-Verified 8.

Primary-domain cell counts (argmax loading): reasoning 293, agentic 156, communication-professional 95, software-code 70, knowledge-information 59. **Only SimpleQA is a primary/argmax knowledge family** (`knowledge-information` 0.95 on both Epoch revisions). HLE (`family_id: hle`) is a **reasoning-primary** instrument (0.65 reasoning / 0.30 knowledge). Its 59 cells therefore count as reasoning under argmax. The 0.30 share still meets the domain-cell gate \(n_{sk}\) (loading \(\ge 0.25\)), so HLE is a *secondary* knowledge contributor, not a second independent knowledge-primary condition.

If “two fitted knowledge families” is used, it means **families that supply at least one cell with knowledge loading \(\ge 0.25\)** (SimpleQA + HLE), not two independent primary-domain knowledge instruments. Secondary cross-loading does not repair independent knowledge coverage: HLE remains one reasoning-family cell in information-share and \(c_{sF}\); it does not add a second knowledge-argmax condition; and a 0.30 spillover is not direct evidence that the knowledge trait was measured on its own. Knowledge \(n_{sk}\) on the 131 represented systems is 0 / 1 / \(\ge 2\) for 44 / **57** / 30: one-cell is the **modal** bin, and **101/131 have at most one** qualifying knowledge cell.

---

## 6. Admission, deduplication, provenance

### 6.1 `prepareAci12` rejection reasons

Defined in [../packages/scoring/src/aci12.ts](../packages/scoring/src/aci12.ts): `duplicate_lineage`, `config_mismatch`, `snapshot_unresolved`, `class_unassigned`, `condition_inactive`, `missing_uncertainty`, `too_few_runs`, `raw_without_transform`, `profile_unassigned`, `benchmark_inactive`.

Active checks, in order:

1. Lineage: if `lineage_id` is set, keep the origin-host row (`host_source === source_id`) over copies.
2. Model snapshot must exist.
3. Benchmark must exist and `status === "active"` (shadow/watchlist/retired → `condition_inactive`).
4. `sourceFitEligible === false` (from `config.aci_fit_eligible`) → `config_mismatch`.
5. Observation version / grader / tool policy must match the condition when both are present.
6. Effort/harness must assign a declared class.
7. Likelihood constructor must succeed (usable transform and uncertainty).
8. Elo/arena conditions may not mix dated `evaluation_run_id` snapshots (throws).

`metadataIncomplete` is true if the source flag is set, the assignment is approximate, version was inferred, or any of benchmark version, grader, tool policy, harness id, or harness class is missing/`unknown`.

### 6.2 Lineage before the scorer

[../packages/ingest/src/lib/lineage.ts](../packages/ingest/src/lib/lineage.ts):

- Native independent rows with a run id (or ARC model id) get a lineage digest that includes model, condition, and config. A publisher batch id cannot collapse different models.
- Mirrors and manual transcriptions attach only when model, condition, compatible config/effort, and score match **one** native origin (manual percent tolerance 0.00051).
- `selectLineageObservations` keeps the highest-priority row per `(model, benchmark, lineage)`: origin-host, then non-manual, then independent, then latest date.

Copying a result into a second file does not add evidence.

### 6.3 Overlap graph / reference component

`partitionOverlapComponents` connects protocols that share at least two systems on the same condition. A connected component that contains any independent protocol is the **reference component**. All 924 deployed observations are in it. Self-report protocols in the fit are `epoch` and `vendor-model-cards`.

### 6.4 Contamination

For public holdout: `safe` if post-training freeze (else training cutoff) and item/public release dates exist, version is not inferred, network is known, **and** release is after freeze with isolated network or `tool_policy: none`. Missing dates/network → `unknown`. Non-public holdout is treated as `safe` for this flag (private/semi-private describe reported holdout, not a leakage guarantee). Unknown training dates do not make public evidence safe.

The **safe independent cell** count used by tiers requires independent provenance and this contamination-safe predicate (summarize uses freeze/cutoff versus item/public release; it does not re-check network at summary time).

---

## 7. Likelihood classes, denominators, metadata inflation

Constants ([../data/index-config.yaml](../data/index-config.yaml) `likelihood`):

| Key | Value | Role |
|---|---:|---|
| `accuracy_se_clip` | 0.005 | Clip rates into \((\varepsilon,1-\varepsilon)\) before logit |
| `metadata_incomplete_multiplier` | 1.5 | Multiplies run-noise scale \(\omega\) |
| `agentic_default_rho` | 0.2 | Within-task correlation when \(k>1\) and \(\rho\) not declared |
| `other_default_rho` | 0 | Same for non-agentic |
| `money_human_baseline` | 63 000 | Vending-Bench 2 strong-human USD reference (`log_relative` `reference_value: 63000`). GDPval is pairwise win rate, not a money metric. |

Chance/ceiling map for count-like predictors:

\[
q = g + (c-g)\,\operatorname{logistic}(\eta)
\]

with \(g=\) `chance_level`, \(c=\) `ceiling`.

### 7.1 Task denominator versus run denominator

A registry `n_items` is a **task-set size**, not a run count. [../packages/scoring/src/aci12.ts](../packages/scoring/src/aci12.ts) `prepareLikelihood`:

- If `per_task_counts` length equals \(n\): `a_exact` with \(x=\sum\) counts, `totalTrials = n·k`, optional beta-binomial when \(\rho>0\) or \(\rho\) is estimated (≥5 systems with per-task counts on that condition).
- Else if \(n\) is known **and** (`x_correct` is present **or** no usable SE): `a_single` (\(k=1\)) or `a_total` (\(k>1\)), with \(x = x\_correct\) else \(\operatorname{round}(\text{fraction}·n·k)\).
- Else if a reported SE/CI exists for `count`/`judge`: **`a_prime`**. The mean is mapped through chance/ceiling and logit; variance is the delta-method SE on that logit. The code **does not** invent successes from `score × n` when a real SE is available.
- Pass@k (`obsType: passk`): convert \(y_{\text{obs}}\) to per-attempt \(p_1=1-(1-y)^{1/k}\), then normal-on-logit with delta-method variance. None of the deployed 19 conditions uses `obs_type: passk`. ARC-AGI-2 is `count` with `default_k: 1`; its notes treat published pass@2 as **one counted outcome per task**, not two trials (`tool_policy: arc-grid-pass-at-2`).
- Elo/arena: \(y=(s-E_{\text{ref}})\ln 10/400\); SE mapped by the same factor.
- Horizon: minutes \(\mapsto (\log_2 m - 8)/2\); CI on log2 scale.
- Money (Vending-Bench 2): \(\log_2(\text{median run balances}/63000)\) with 1000-iteration bootstrap variance if ≥3 run values; else mean and SE via \(\operatorname{Var}(\log_2)=\bigl(\mathrm{SE}/(s\ln 2)\bigr)^2\). The 63 000 divisor is the published Vending-Bench strong-human baseline, not GDPval.

CI to SE: width \(/ (2z)\) with \(z_{90}=1.6448536269514722\), \(z_{95}=1.959963984540054\).

### 7.2 Observation model (NumPyro)

Predictor for observation \(i\):

\[
\eta_i^{\text{obs}} = \eta_{\text{cell}(i)} + a_{p(i),k(i)} + \xi_{p(i),b(i)}
\]

\[
\omega_i = \omega^{\text{run}}_{\text{prov}(i),k(i)}\cdot f_i,\qquad f_i\in\{1,1.5\}
\]

- `obs_normal` / `a_prime`: \(y \sim \mathcal N(\eta^{\text{obs}},\sqrt{v+\omega^2})\).
- `a_single`: \(\varepsilon\sim\mathcal N(0,1)\), \(q=g+(c-g)\sigma(\eta^{\text{obs}}+\omega\varepsilon)\), \(x\sim\mathrm{Binomial}(n_{\text{tasks}},q)\).
- `a_total`: same \(q\), then \(x \sim \mathcal N\bigl(nkq,\ \sqrt{nkq(1-q)\,[1+(k-1)\rho_b]}\bigr)\) (design-effect normal approximation).
- `a_exact`: per-row site; binomial or BetaBinomial with concentration \((1-\rho)/\rho\).

No `a_exact` rows are in the deployed 924. \(\rho_b\) is the condition default unless estimated (`Beta(2,5)`) for conditions with per-task counts on ≥5 systems.

---

## 8. Correlated five-domain prior and signed effort

Domains, in order: `agentic`, `software-code`, `reasoning`, `knowledge-information`, `communication-professional`.

Production (`trait_structure: correlated`, `class_prior` absent):

\[
\epsilon_m \sim \mathcal N_5(0,I),\quad
L_\Omega \sim \operatorname{LKJCholesky}(5,2),\quad
\Omega = L_\Omega L_\Omega^\top
\]

\[
\sigma_k \sim \operatorname{LogNormal}(0,0.5),\qquad
Z_m^{\mathrm{std}} = \operatorname{diag}(\sigma)\,L_\Omega\,\epsilon_m
\]

(`varsigma` in code is \(\sigma_k\); `trait_spread_lognormal_sd: 0.5`. The unused `trait_spread_sd: 1.5` applies only if the lognormal sd is 0.)

Signed effort increment, **not** constrained positive:

\[
\mu_\delta \sim \mathcal N(0.30,0.30),\quad
s_{\delta k} \sim \operatorname{HalfNormal}(0.30),\quad
h_{mk}\sim\mathcal N(0,1)
\]

\[
\delta_{mk}=\mu_\delta + s_{\delta k}h_{mk},\qquad
Z_{mk}^{\max}=Z_{mk}^{\mathrm{std}}+\delta_{mk}
\]

Fixed-effort systems use \(Z^{\mathrm{std}}\) even at `@max-common`. Variable-effort `@std-common` uses \(Z^{\mathrm{std}}\); `@max-common` uses \(Z^{\max}\). Increments are in raw latent units; displayed domain points are panel-standardized later, so the same \(\delta\) is not a constant display-point gain.

Rejected alternatives (still in `model.py`, not production):

- `general_specific`: shared factor \(g_m\) plus shrunk domain departures; reserved grouped-logit RMSE 0.7808 → 0.7949, CRPS worsened ([audits/1.4-validation/](audits/1.4-validation/)).
- `correlated_unit`: \(\sigma_k=1\), different effort parameterization; three exploratory folds, RMSE 0.610235 vs 0.610382, CRPS 0.311415 vs 0.312293; difference intervals included 0. Not promoted.

Optional `priors.panel_pin_sd` soft pin is **0** (disabled).

---

## 9. Benchmark, family, cell, source, and protocol effects

Cell predictor ([../packages/scoring/python/aci12/model.py](../packages/scoring/python/aci12/model.py)):

\[
\eta_{sb}
= \beta_b
+ \alpha_b \sum_k \lambda_{bk} Z_{sk}
+ f_{s,F(b)}
+ e_{sb}
\]

with \(\alpha_b=\exp(\log\alpha_b)\). Deterministic `difficulty` in the posterior is \(-\beta_b\) (raw), **not** the published location.

### 9.1 Configured priors

From [../data/index-config.yaml](../data/index-config.yaml) `priors` as sampled in `aci_model`:

| Symbol / site | Prior | Config key | Default in code if missing |
|---|---|---|---|
| \(\beta_b\) | \(\mathcal N(0,3)\) | `difficulty_sd` | 3.0 |
| \(\log\alpha_b\) | \(\mathcal N(0,0.6)\) | `log_discrimination_sd` | 0.6 |
| Family scale | \(\operatorname{HalfNormal}(0.25)\) | `family_sd` | 0.25 |
| \(f_{sF}\) | scale × \(\mathcal N(0,1)\) | — | — |
| Cell scale \(\sigma_b^{\text{cell}}\) | \(\operatorname{HalfNormal}(0.30)\) per condition | `cell_misfit_sd` | 0.30 |
| Cell tail | \(\kappa\sim\mathrm{Gamma}(2,2)\) (shape, rate), \(e=\sigma_b z/\sqrt{\kappa}\) | `cell_df: 4` | Student-t 4 |
| Independent protocol scale | \(\operatorname{HalfNormal}(0.15)\) | `sigma_a_indep` | 0.15 |
| Self-report protocol scale | \(\operatorname{HalfNormal}(0.25)\) | `sigma_a_self` | 0.25 |
| Self-report mean \(\mu^{\text{self}}_k\) | \(\mathcal N(0.15,0.15)\) per domain | `self_report_mean/sd` | 0.15 |
| Protocol×condition \(\xi\) | \(\operatorname{HalfNormal}(0.20)\) × \(\mathcal N(0,1)\) | `sigma_xi` | 0.20 |
| Run-noise bar | \(\operatorname{HalfNormal}(0.30)\) for 2 provenances | `run_noise_sd` | 0.30 |
| Run-noise domain log | \(\mathcal N(0,0.40)\) | `run_noise_domain_sd` | 0.40 |

Self-report protocols: \(a_{pk}=\mu^{\text{self}}_k + \sigma^{\text{self}} z_{pk}\). Independent: \(a_{pk}=\sigma^{\text{indep}} z_{pk}\). `adversarial_offset` (extra \(\gamma_+\)) is off in production.

Unused-in-this-structure config keys (`capability_sd`, `domain_sd`, `product_*`, `harness_sd`, `effort_gain_*`, `effort_domain_gain_sd`) belong to other candidates or legacy helpers; they are not the production sampling sites above.

### 9.2 Published benchmark cards

Per draw, with panel projection \(t_b=\sum_k\lambda_{bk}Z_{\cdot k}\) on the panel, \(m_b=\mathrm{mean}(t_b)\), \(s_b=\max(\mathrm{sd}(t_b),0.05)\):

\[
\text{location}=\frac{-\beta_b/\alpha_b-m_b}{s_b},\qquad
\text{slope}=\alpha_b s_b
\]

(`summarize.py` uses posterior `difficulty` \(=-\beta\), so `difficulty/discrimination` equals \(-\beta/\alpha\).) `alpha_unidentified` if the 90% width of \(\log(\text{slope})\) exceeds \(\log 4\) (`diagnostics.max_log_alpha_width` \(=1.38629436112\)).

Observed-versus-expected charts use \(\eta_{\text{cell}}-e_{sb}\) (family kept, source offsets dropped). In-sample diagnostic only.

---

## 10. NUTS inference and numerical gates

[../packages/scoring/python/aci12/runner.py](../packages/scoring/python/aci12/runner.py): NumPyro `NUTS` with `init_to_median`, diagonal mass (dense mass only if `ACI12_DENSE=1`; previously saturated tree depth). Extra fields: `diverging`, `potential_energy`, `energy`. Retained draws: linspace downsample to 12 000. `jax_enable_x64` on. Host device count from `ACI12_CHAINS` (default 4) **before** JAX import.

Developer overrides `ACI12_CHAINS`, `ACI12_WARMUP`, `ACI12_SAMPLES`, `ACI12_PROGRESS` exist for local runs; production settings live in index-config.

Declared convergence sites: `Z_cal`, `G_cal`, `Agentic_cal`, `Chat_cal`, `Omega`, `domain_scale`, `cell_sigma`, `effort_mean`, `effort_sd`, `effort_domain_sd`, `run_noise`, `class_rho`. Production correlated fits do not sample `domain_scale`, `effort_domain_sd`, or `class_rho`.

Gates (config `inference` plus code):

| Gate | Threshold | 1.4.3 accepted value |
|---|---|---|
| Divergences | 0 (`max_divergence_fraction: 0`) | 0 |
| R-hat | ≤ 1.01 | ≤ 1.00176 |
| Bulk and tail ESS | ≥ 400 | min bulk 2619 |
| E-BFMI | ≥ 0.3, Hamiltonian energy, all chains finite | min 0.826 |
| Score MCSE | \(10\cdot\mathrm{sd}/\sqrt{\mathrm{ESS}}\le 0.3\) display points on `G_cal`, `Z_cal`, `Agentic_cal`, `Chat_cal` | max 0.197 |
| Class prior | must be disabled for production export | disabled |

E-BFMI uses total Hamiltonian energy; missing/non-finite energy **fails**, with no potential-energy fallback. Empty validation inputs cannot pass. The first 1.4.3 numerical attempt (warmup 3000, target 0.995) had two divergences and was rejected; the published retry is 4000 / 0.999 ([audits/1.4.3-effort-coverage/README.md](audits/1.4.3-effort-coverage/README.md)).

Configured `acceptance.*` simulation/temporal/test-retest targets in index-config are **not** executed as passed checks in this release. Grouped holdouts live in [../packages/scoring/python/aci12/validate_predictive.py](../packages/scoring/python/aci12/validate_predictive.py) (hold out every effort/source row of a model×condition; do not reuse cell/family residuals). PSIS-LOO, exposure-gap refit, and adversarial self-report refit are stored as `null` on every system.

---

## 11. Draw-wise panel standardization, ranks, and tiers

### 11.1 Display scale

For each posterior draw, with panel \(P\) (\(|P|\ge 12\)) and floor \(0.05\):

\[
\widetilde Z_{sk}=\frac{Z_{sk}-\mu_{Pk}}{\sigma_{Pk}},\qquad
C_{su}=\sum_k w_{uk}\widetilde Z_{sk},\qquad
I_{su}=50+10\frac{C_{su}-\mu_{Pu}}{\sigma_{Pu}}
\]

Domain cards use \(50+10\widetilde Z\). Mixed \(G\) is the equal-weight mean of \(\widetilde Z\), then panel-standardized. Sample sd uses `ddof=1`.

Declared product weights ([../data/index-config.yaml](../data/index-config.yaml); also coding/research profiles exist but are not the three published views):

| Domain | Mixed (`general`) | Agentic | Chat |
|---|---:|---:|---:|
| Agentic | 0.20 | 0.60 | 0 |
| Software-code | 0.20 | 0.30 | 0.10 |
| Reasoning | 0.20 | 0.10 | 0.20 |
| Knowledge-information | 0.20 | 0 | 0.30 |
| Communication-professional | 0.20 | 0 | 0.40 |

Weights are product choices, not learned utility. Baskets under each profile are expected-utility **experiments**: intercept + loaded traits, utility-eligible count/passk conditions only, withheld if any required basket member is missing. They do **not** supply Chat.

UI compact \(\pm\) ([../apps/web/components/score-value.tsx](../apps/web/components/score-value.tsx)): larger distance from the displayed median (or `robustScore` if `score` is null) to either 90% endpoint, **ceiled** to one decimal. Hover shows exact endpoints. Star `*` marks preliminary; preliminary rows stay interleaved by median.

### 11.2 Pairwise probabilities and ranks

Joint-draw directional probability \(P(I_a>I_b)\) is computed for **all** fitted pairs, including preliminary systems. Practical ordering uses margin `practical_margin: 1.0` and threshold 0.90:

\[
\hat P(I_a>I_b+1)\ge 0.90 \;\Rightarrow\; a\text{ leads};\quad
\text{else if reverse}\;\Rightarrow\; b\text{ leads};\quad
\text{else unresolved}.
\]

Unresolved is not equivalence. Statistical **ranks** and 90% rank intervals are computed only on **eligible** systems (non-provisional Mixed; Agentic/Chat also require that view’s `index_profiles.published`). The leaderboard `#` column is the filtered-view sort position, not those subset ranks.

### 11.3 Evidence tiers (production `summarize.py`)

Variance-reduction proxy \(R_s=\max(0,\min(1,1-\mathrm{Var}(I)/100))\). Family concentration \(c_{sF}\) is the 90th percentile, over up to 200 draws, of the Gaussian-precision drop in \(G\) after removing family \(F\); the system gate uses \(\max_F c_{sF}\). Information share for family/benchmark uses \(\alpha^2/(\tau^2+2\sigma_{\text{cell}}^2)\) with \(\tau^2\) from observation precisions.

| Gate | Verified | Ranked |
|---|---:|---:|
| Mixed 90% width | ≤ 12 | ≤ 20 |
| Represented domains (any positive loading) | ≥ 4 | ≥ 3 |
| Safe independent cells | ≥ 2 | ≥ 1 |
| Max family information share | ≤ 0.50 | ≤ 0.80 |
| \(R_s\) | ≥ 0.70 | ≥ 0.50 |
| \(\max c_{sF}\) | ≤ 0.50 | ≤ 0.80 |

Otherwise **provisional**. Domain publication additionally needs \(n_{sk}\ge 2\) cells with loading \(\ge 0.25\), width ≤ 20, \(R_s\ge 0.5\). Agentic/Chat composites need Mixed non-provisional, composite width ≤ 20, and \(n_{sk}\ge 2\) on every domain with weight ≥ 0.15.

Deployed Mixed: 18 verified, 70 ranked, 43 provisional among 131 systems. Knowledge-information \(n_{sk}\) is 0 / 1 / ≥2 for 44 / **57** / 30 systems: a one-cell knowledge trait is the modal case.

The TypeScript helper `evidenceTier` in `aci12.ts` omits the concentration gate; **publication uses Python `summarize.py`**.

---

## 12. Snapshot, public DTO, and attributed AA isolation

Snapshot contract ([../data/snapshots/README.md](../data/snapshots/README.md), `snapshot.json`):

- License mixed; redistributability is per source.
- Data policy: on-site audit of evidence; non-redistributable rows are display-only.
- Exclusions: speed observations are never included; rows absent from the publication inventory stay in database history only.
- Latest Mixed/Agentic/Chat diagnostics `accepted: true`.

Public API/DTO ([../apps/web/lib/public-dto.ts](../apps/web/lib/public-dto.ts)) allowlists id, slug, name, organization, family, release, open-weights, license, context, indexes (score, CI, ranks, coverage counts, flags, pairwise), system summary, and public pricing fields. Tests assert that `aliases`, `displayEconomics`, `costPerTask`, `externalEvaluations`, `aa-briefcase`, and throughput fields **do not serialize**.

Artificial Analysis runtime, task-cost, and benchmark overlays are **attributed display-only** ([../apps/web/lib/display-data.ts](../apps/web/lib/display-data.ts)): `redistributable: false`, isolated manuals `aa-speed-manual`, `aa-cost-manual`, `aa-benchmarks-manual`. [../scripts/prepare-candidate-input.ts](../scripts/prepare-candidate-input.ts) `isForbiddenAaRecord` drops `aa-*` sources/protocols/benchmarks and `critpt` from candidate public inputs. Coverage audits assert zero AA observations in the public fit. GDPval YAML states **never ingest GDPval-AA**; [../data/benchmarks/aa-lcr.yaml](../data/benchmarks/aa-lcr.yaml) forbids AA scores of the public LCR set. Current cost chart uses AA 4.2 only; 4.1.1 is not a fallback point. `data/manual/speed-aa.yaml` is excluded from snapshots by design. Missing private overlay files fail soft (`parseDisplayBenchmarkFile` → `null`).

The current **external evaluation catalog** UI ([../apps/web/components/external-evaluations.tsx](../apps/web/components/external-evaluations.tsx), schema in `display-data.ts`) is a versioned multi-evaluation overlay, not a CritPt-only percent table:

| Interface | Implementation |
|---|---|
| Native units | `score_unit`: `percent` (must be in \([0,100]\)) or `elo` (finite, \(\ge 0\); values above 100 are valid). Percent charts as fraction; Elo stays native. |
| Measure separation | `measure`: `score` (default), `accuracy`, `hallucination` (“Lower is better”), `all-pass`. Accuracy and hallucination on the same condition are distinct rows, not a blended index. |
| Attribution | Each row keeps `configuration`, optional `system_id` (dropped if it does not match the model’s fitted systems), `version` (row, else catalog, else `unspecified`), `source_url`, methodology/harness/grader from the catalog definition. |
| Retrieval date | `observed_on` is the overlay retrieval date (`YYYY-MM-DD`); optional file-level `retrieved_on`. The payload does not publish AA’s measurement window, so this **is not** the model’s evaluation run date ([methodology.md](methodology.md)). |
| Catalog vs results | Unmapped AA ids still attach to `model.externalEvaluations`. They enter `SiteData.results` only when a registry benchmark id exists; otherwise they stay model-page display and never become fit cells. |

Evaluations the overlay is built to show, matching Index v4.2 naming in [audits/coverage-expansion-2026-09-06/artificial-analysis.md](audits/coverage-expansion-2026-09-06/artificial-analysis.md) and the schema tests: **AA-Briefcase** (native Elo), **GDPval-AA v2** (native Elo; not the fitted OpenAI GDPval condition), **AA-Omniscience** (separate accuracy and hallucination percents), **GDP.pdf** (all-pass headline vs mean-pass secondary), **AA-LCR v1.1** (AA scores prohibited from the public `aa-lcr` fit entry), **CritPt** (watchlist overlay; mean pass@1 on 70 challenges × 5 repeats, not 350 items). No scores are copied here.

Row inventory, verified from the local deployment overlay on 2026-09-07: **280** observations across six evaluations—CritPt **113**, AA-Briefcase **78**, GDPval-AA v2 **80**, AA-Omniscience **3**, GDP.pdf **3**, and AA-LCR v1.1 **3**. The five newer evaluations contribute **167** observations. The source YAML is gitignored and restored through the deployment secret; these counts can be checked locally but cannot be reconstructed from the public repository alone. This reference includes no private score table.

---

## 13. Refresh candidate 928/677 versus deployed 924/673

[audits/coverage-expansion-2026-09-06/coverage-delta.md](audits/coverage-expansion-2026-09-06/coverage-delta.md) compares frozen 1.4.3 input to a `--refresh-input` candidate (`work/coverage-expansion/ready-input.json`). **The candidate is not deployed.**

| Metric | Deployed 1.4.3 | Refresh candidate | Delta |
|---|---:|---:|---:|
| Observations | 924 | 928 | +4 |
| Cells | 673 | 677 | +4 |
| Models / systems / conditions / families | 110 / 131 / 19 / 16 | same | 0 |

The four new cells are MathArena `@max-common` for `claude-3.5-sonnet`, `claude-fable-5.1`, `gpt-6-astra`, `qwen-3.8-max`. No effort reassignment and no extra replications. MathArena score refreshes of already-pinned protocols are not new coverage. `grok-4.20` × `tau3-bench-banking` was **rejected** (manual `k_trials: 4` without verified Pass^1; registry `default_k: 4` is not used as a stand-in). Candidate public input contains no `aa-*` or `critpt` protocols.

---

## 14. Experimental measurement geometry and class prior

**Not deployed.** Proposal texts: [proposals/aci-1.5.0-measurement-spaces-and-classes.md](proposals/aci-1.5.0-measurement-spaces-and-classes.md), [proposals/aci-1.5.0-related-release-prior.md](proposals/aci-1.5.0-related-release-prior.md), [proposals/aci-1.5.0-related-release-experiment-lock.md](proposals/aci-1.5.0-related-release-experiment-lock.md). The first two remaining predecessor-walk siblings are **not implemented**. Confirmatory criteria are not locked; `real_reviewed_classes_exist: false`.

### 14.1 What the code actually runs

| Capability | Module | Runnable without production NUTS? |
|---|---|---|
| \(J_s=A^\top R^{-1}A\), optional PSD Schur nuisance reduction | [../packages/scoring/python/aci12/geometry.py](../packages/scoring/python/aci12/geometry.py) `compute_information_matrix` | Yes |
| Effective rank, condition number, range/null bases | `analyze_information` | Yes |
| Target support \(\|P_{\mathrm{range}}w\|^2/\|w\|^2\) | `target_support_diagnostic` | Yes |
| Borrowed precision \(C_{\mathrm{post}}=(C_0^{-1}+J_s)^{-1}\) | `borrowed_precision_decomposition` | Yes |
| Cone membership + Farkas certificate (NNLS) | `evaluate_cone_membership` | Yes |
| Paired-draw \(P(A>B+1)\) at 0.90 | `paired_draw_comparison` | Yes (also used conceptually in production summary) |
| Partial ID \([d_O-(1-q),d_O+(1-q)]\); **rejects** \(n/19\) as \(q\) unless explicitly unverified | `partial_identification_bounds` | Yes |
| Expected Gaussian reduction \(\Delta V=(h^\top C a)^2/(v+a^\top C a)\) | `expected_variance_reduction` | Yes |
| Transfer-class registry validation + SHA-256 freeze | [../packages/scoring/src/transfer-class.ts](../packages/scoring/src/transfer-class.ts), `experiment.TransferClassRegistry` | Yes |
| Restricted class prior \(z_m=L_\Sigma(\sqrt{\rho}u_{c(m)}+\sqrt{1-\rho}v_m)\) | [../packages/scoring/python/aci12/class_prior.py](../packages/scoring/python/aci12/class_prior.py) + `model.py` | Only inside experimental MCMC |
| Family-disjoint successor-domain holdouts, Gemini development exclusions | [../packages/scoring/python/aci12/experiment.py](../packages/scoring/python/aci12/experiment.py) `prepare` | Prepares files; does not fit. Post-a208898 repairs in [§14.2](#142-experiment-prepare-repairs-relative-to-a208898) |
| Fail-closed candidate MCMC | `experiment run-candidate` | Dev sampler defaults 1×20×20 |

Geometry assumptions recorded in code: linear-Gaussian local approximation; conditioned on point measurement parameters; diagonal residual variance unless a full \(R\) is supplied; benchmark count is not target task mass.

Directed transfer in the **implemented** restricted family is exchangeable class pooling, not a predecessor random walk. \(\rho\sim\mathrm{Beta}(\alpha,\beta)\) (locked development prior \(\mathrm{Beta}(1,1)\)) or fixed \(\rho\in[0,1)\). \(\rho=0\) omits class coordinates and matches the production trait prior. Partition membership is explicit; provider/name guessing keys are rejected. Fitted releases missing from the partition become `singleton:<id>`. Guardrails: class prior requires `correlated` LKJ traits; `general_specific` / one-trait baseline raise; production export fails if enabled.

Illustrative unreviewed registry: [../data/experimental/transfer-classes-example.json](../data/experimental/transfer-classes-example.json) (`edition: unreviewed-illustrative-0.1`). Gemini holdout list in `experiment.py` is a **development heuristic**, not a certified lineage.

Tests that exist: [../packages/scoring/python/tests/test_geometry.py](../packages/scoring/python/tests/test_geometry.py), `test_experiment.py`, `test_class_prior.py`, `test_runner_diagnostics.py`, plus [../packages/scoring/test/transfer-class.test.ts](../packages/scoring/test/transfer-class.test.ts). These prove implementation behavior on toys/fixtures, not a published 1.5.0 index.

`run-candidate` fails closed without `--dev-mode`, without enabled `class_prior`, and (unless `--allow-unfrozen-dev-run`) without `manifest.json` `train_data_hash`. Outputs are stamped `is_experimental` / `is_publishable: false`. Summaries force every system `tier: provisional` when the class prior is on.

These repairs do **not** certify transfer classes, do **not** produce a fitted 1.5.0 posterior, and do **not** claim improved predictions.

### 14.2 Experiment prepare repairs relative to a208898

Production 1.4.3 in this document remains the a208898 snapshot. `prepare` in `experiment.py` was repaired after that commit. Audit: [audits/experiment-repair-2026-09-07.md](audits/experiment-repair-2026-09-07.md). Flags stay `is_experimental` / `is_publishable: false`. Input JSON is deep-copied; hashes use strict JSON (`allow_nan=False`, sorted keys).

**1. Held-out indexes after Gemini exclusion.** a208898 kept original `system_index` / `cell_index` on eval rows after compacting train systems, so Qwen 3.8 Max (`original_system_index` 121 on the frozen 924-row input) was out of range of the post-exclusion train map. Train cells are rebuilt only from remaining training rows, so a held-out `cell_index` must not be read as a train cell. Eval rows now carry stable `system_id` / `model_id` / `benchmark_id`, `original_*` indexes, `train_system_index` / `train_model_index`, `train_benchmark_index`, and `prediction_index`. **`system_index` is the train index** (same as `train_system_index`, valid against `train_data["system_ids"]`). **`original_system_index` is the original input index.** **`benchmark_index` is unchanged** because conditions are not compacted; `train_benchmark_index` equals it. `index_semantics` and `index_mappings.condition` record this. `cell_index` is stripped from eval rows (`original_cell_index` retained). An excluded target fails closed. A cell-less target system is preserved in `train_data.system_ids`.

**2. `wrong_class`.** a208898 either duplicated the target into another class or invented `unrelated_distant_model`, which is not an observed release and yields no off-diagonal pooling. The target is now removed from its old class (other members kept; singleton flags follow member count). An explicit observed partner is required (`wrong_class_partner` / `--wrong-class-partner`). Fail closed if the partner is omitted, absent, Gemini-excluded, or already in the target's class. Provider/name inference is not used.

**3. `poor_outcome`.** a208898 ranked the successor's remaining raw `y` (30%), which is undefined for count likelihoods and incomparable across conditions. The mask now uses in-condition control peers after holdout and Gemini exclusion. `normal` / `a_prime` use `y`; `a_single` / `a_total` / `a_exact` use a success rate from `x` or `per_task_counts`. Count and continuous scores are never crossed. Empty `a_exact` counts, `k_trials<=0`, and out-of-range successes return no score (no fabricated denominators). Masked eval rows keep cutoff/score/metric/`n_control_peers`/`n_unique_control_models`. A row is masked if its score is at or below the peer 25th percentile (ties at the cutoff are masked). Fewer than two control peers, or a missing comparable score, leaves the row in training and records `insufficient_peer_data` / `uncomparable`. The cutoff unit is **all remaining in-condition control observation rows** of the same metric family, not distinct releases or independent samples; normalized counts with different \(k\) are comparable pass-1 rates and are not partitioned by \(k\). Matched effort+protocol distinct-model aggregation is recorded as a diagnostic and is **not** the cutoff. The rule and control-reference definition are on the manifest. Affine-invariant within a condition/metric group.

**4. Family names.** `benchmark_family_ids` is condition-aligned (length `n_benchmarks`). `benchmark_family_index` is the unique family index per condition. a208898 used `benchmark_family_ids[family_index]`, so a reasoning holdout could list `deepswe` and omit `matharena-composite`. The index→name map is the validated zip of those two arrays; unique names are sorted.

**6. Loading threshold and family closure.** a208898 used loading ≥ 0.5 or argmax, so HLE's 0.30 knowledge loading was not a knowledge target. Default `domain_loading_threshold` is **0.25** (`DEFAULT_DOMAIN_LOADING_THRESHOLD`), matching the production \(n_{sk}\) gate and the 1.5.0 successor-domain plan (lock draft: identify targets at 0.25, remove every successor family row, **score only the target conditions**). Every successor observation in every family that contains a target condition is held out (all sources and efforts). `held_out_observations` is the **training-removal union**, not the default score. Primary scoring rows are `primary_target_observations` (`select_primary_scoring_observations`, `default_prediction_stratum: primary_target`, `is_default_prediction_row`). Family-closure rows are `family_closure_observations` with their own count. The threshold, primary scoring rule, and family map are on the manifest. `--domain-loading-threshold` exists so the freeze is reviewable; default 0.25 remains required.

---

## 15. Current limitations

1. **69 blocked registry conditions.** [audits/coverage-expansion-2026-09-06/benchmark-verification.md](audits/coverage-expansion-2026-09-06/benchmark-verification.md): of 107 benchmark YAML files, 38 checked and **69 blocked** (vendor-unspecified model-card conditions and AA-origin `aa-lcr`). Independent version/task-count/metric confirmation is unavailable. Do not promote; do not copy AA scores under author sources. Watchlist/retired checked rows still lack pins the fit wants (AutomationBench 1.0.6 release tag, HealthBench grader/uncertainty, OSWorld per-run denominators, LiveCodeBench v6 harness commit, SimpleQA Kaggle F1 versus Epoch accuracy).

2. **Knowledge coverage is thin, and HLE does not make a second knowledge instrument.** Only SimpleQA is knowledge-primary/argmax. HLE is reasoning-primary with a 0.30 knowledge cross-load that qualifies at the \(n_{sk}\) gate (\(\ge 0.25\)) but is not a second independent primary-domain knowledge family. Calling SimpleQA and HLE “two fitted knowledge families” means only that both supply \(\ge 0.25\) knowledge loading. Among 131 represented systems, knowledge \(n_{sk}\) is 0 / 1 / \(\ge 2\) for 44 / 57 / 30: one-cell is **modal**, not “most,” and **101/131 have at most one** qualifying knowledge cell. Secondary loading does not repair independent coverage: it does not add a knowledge-argmax condition, does not split HLE out of the reasoning family for \(c_{sF}\)/information share, and does not convert correlated trait borrowing into a measured knowledge test. Chat still puts 0.30 weight on this domain. Communication-professional is unpublished for 121/131 systems.

3. **GDPval 1320 / 220 / metric.** [../data/benchmarks/gdpval.yaml](../data/benchmarks/gdpval.yaml): official identity is 1 320 full-set tasks and a 220-task public gold subset; primary metric is blinded expert **pairwise win rate**, not binomial accuracy. Registry still has `obs_type: count`, `n_items: 1320`, and one condition that conflates Gold-220 with Full-1320. Notes were updated; `obs_type`/`n_items` were **not** changed. No YAML protocol pin; openai.com HTML failed on 2026-09-06 (counts confirmed from arXiv:2510.04374). Never ingest GDPval-AA. Eleven fitted GDPval cells inherit `metadata_incomplete`.

4. **τ³ `default_k` versus Pass^1.** [../data/benchmarks/tau3-bench-banking.yaml](../data/benchmarks/tau3-bench-banking.yaml): 97 tasks, `default_k: 4`, live headline Pass^1. [../scripts/prepare-candidate-input.ts](../scripts/prepare-candidate-input.ts) `applyOfficialTau3HeadlineTrials` accepts \(k=1\) or notes matching Pass^1; otherwise **rejects** rather than silently using `default_k=4`. The grok-4.20 manual row was rejected on that rule. Fitted τ³ rows still carry metadata-incomplete warnings.

5. **Source incompleteness.** 897/924 fitted observations are `metadata_incomplete` (missing harness/grader/version/tool policy, approximate effort, or assumed maximum). Self-report protocols remain in the graph (`vendor-model-cards`, `epoch`). `epoch-frontiermath-v2` appears as a fit protocol without a YAML protocol file. Snapshot exports 102 of 107 benchmark YAML files.

6. **Sparse communication/professional and software evidence.** Utility baskets include LiveBench, GDPval, and Arena; several basket members are not utility-eligible or not fitted. Adding a cell can move a median either way through correlations; four strong reasoning results are not a measured knowledge or communication gain.

7. **Open validation.** Simulation calibration, temporal/family holdouts, adversarial vendor refits, PSIS-LOO, benchmark-adjusted exposure gaps, profile-weight sensitivity, and out-of-sample ranking quality are configured or discussed, not passed production checks. Predictive tests assess missing-condition prediction on the available graph, on the transformed scale.

8. **Effort policy risk.** Unreported → maximum can assign a lower-effort unpublished setting to max. The 1.5× noise flag records that uncertainty; it does not verify the evaluator.

---

## 16. Reproduction commands

Inspected from parser/`--help` strings in source. **Do not run NUTS or live network ingest to “reproduce” this document.** Expensive sampling is the 4×4000×5000 NumPyro job (~11 minutes on the accepted 1.4.3 hardware). `ACI12_*` env vars can silently shrink a local run; they are not the published settings. Invoke TypeScript CLIs with **`npx tsx`** (local `tsx` from this repo), not a global `tsx`. `npm run pipeline` / `npm run score` / `npm run ingest` already wrap the workspace binary.

### 16.1 Minimal help inspection (cheap; no fit, no network)

These only print usage:

```
npx tsx packages/scoring/src/cli.ts --help
npx tsx scripts/pipeline.ts --help
npx tsx packages/ingest/src/cli.ts --help
npx tsx scripts/prepare-candidate-input.ts --help
npx tsx scripts/audit-benchmark-coverage.ts --help
uv run --frozen python -m aci12.runner --help
uv run python -m aci12.experiment --help
```

### 16.2 Command templates (not executed here)

Scoring CLI — [../packages/scoring/src/cli.ts](../packages/scoring/src/cli.ts). Calls `runScoring`, which **does not** publish method 1.4.3.

```
npm run score -- score --input payload.yaml [--output run.json]
  -i, --input PATH     file or - for stdin
  -o, --output PATH
      --kind mixed|agentic|chat
      --all
      --bootstrap N    (legacy; default 500)
      --eci-compatible
      --pretty
  -h, --help
```

Pipeline — [../scripts/pipeline.ts](../scripts/pipeline.ts). `--dry-run` cannot combine with `--commit-snapshot`. `--input` cannot combine with live sources.

```
npm run pipeline -- --all [--commit-snapshot]
npm run pipeline -- epoch openrouter swe-rebench
npm run pipeline -- --input work/resolved-records.json
  --all | explicit adapter names
  --input PATH          replay RawResult[] (no live fetch)
  --data-dir PATH       default data/
  --ingest-output PATH
  --bootstrap N
  --dry-run             no Postgres/snapshot writes
  --skip-score          ingest only (cannot combine with --commit-snapshot)
  --commit-snapshot
  -h, --help
```

Ingest — [../packages/ingest/src/cli-options.ts](../packages/ingest/src/cli-options.ts). Unknown flags error. `all` expands to registered adapter ids.

```
npm run ingest -- <source|all> [--dry-run] [--json] [--data-dir PATH] [--unmapped PATH] [--output PATH]
  --help | -h
```

Candidate input — [../scripts/prepare-candidate-input.ts](../scripts/prepare-candidate-input.ts). `--refresh-input` may use a fallback capture path if live fetch is unavailable; it is still not the deployed 924-row input.

```
npx tsx scripts/prepare-candidate-input.ts --output <path> [options]
  -o, --output PATH     required
  -i, --input PATH      results JSON or snapshot.json; default latest snapshot
  -d, --data-dir PATH
      --seed N          default 20260904
      --refresh-input   merge snapshot with fresh ingest (default sources: manual,datacurve,matharena)
      --sources LIST    requires --refresh-input
  -h, --help
```

Coverage audit — [../scripts/audit-benchmark-coverage.ts](../scripts/audit-benchmark-coverage.ts).

```
npx tsx scripts/audit-benchmark-coverage.ts [options]
  --compare PATH
  --prepare-candidate PATH
  --baseline PATH       default docs/audits/1.4.3-effort-coverage/accepted-input.json
  --data-dir PATH
  --input PATH
  --output PATH
  --json
  -h, --help
```

Production NumPyro runner — [../packages/scoring/python/aci12/runner.py](../packages/scoring/python/aci12/runner.py). Invoked by `runAci12Nuts` from `packages/scoring/python/` with a 60-minute default timeout (`acceptance.max_runtime_minutes`). **Do not run against the 924-row payload to check this document.**

```
uv run --frozen python -m aci12.runner --input PATH --output PATH --posterior PATH --summary PATH
```

Experimental 1.5.0 tooling — [../packages/scoring/python/aci12/experiment.py](../packages/scoring/python/aci12/experiment.py). `diagnose-geometry` and `validate-registry` do not run NUTS. `run-candidate` is development-only and non-publishable.

```
uv run python -m aci12.experiment validate-registry --registry PATH [--models-file PATH]
uv run python -m aci12.experiment diagnose-geometry --input PATH [--target-system ID]
    [--target-weights 0.2,0.2,0.2,0.2,0.2] [--raw-observations] [--use-source-variances] [--output PATH]
uv run python -m aci12.experiment prepare --input PATH --target-model ID --output-dir DIR
    [--registry PATH] [--target-domain reasoning]
    [--domain-loading-threshold 0.25]
    [--stress-mask none|poor_outcome|missing_domain]
    [--scenario none|omission|wrong_class] [--wrong-class-partner MODEL_ID]
    [--include-gemini-in-confirmation] [--allow-unreviewed-confirmation]
    [--confirmatory] [--gemini-component-metadata PATH] [--seed 42]
uv run python -m aci12.experiment run-candidate --input PATH --output-dir DIR --dev-mode
    [--allow-unfrozen-dev-run] [--chains 1] [--warmup 20] [--samples 20] [--progress]
```

Frozen JSON/CSV under `docs/audits/` and `data/snapshots/` can be read without sampling. Python tests live in `packages/scoring/python/tests/`; this write-up did not execute that suite. A green unit run is not a new accepted posterior.

---

## 17. Code-reference index

Relative to this file.

| Concern | Path |
|---|---|
| Public methodology | [methodology.md](methodology.md) |
| Scoring math | [scoring-math.md](scoring-math.md) |
| Changelog 1.4.3 | [changelog.md](changelog.md) |
| Executable constants | [../data/index-config.yaml](../data/index-config.yaml) |
| Observation prep, effort, likelihood, panel audits | [../packages/scoring/src/aci12.ts](../packages/scoring/src/aci12.ts) |
| Registry → ACI observations | [../packages/scoring/src/aci12-input.ts](../packages/scoring/src/aci12-input.ts) |
| Indexed payload + `uv` launch | [../packages/scoring/src/numpyro.ts](../packages/scoring/src/numpyro.ts) |
| Joint model | [../packages/scoring/python/aci12/model.py](../packages/scoring/python/aci12/model.py) |
| NUTS + gates | [../packages/scoring/python/aci12/runner.py](../packages/scoring/python/aci12/runner.py) |
| Panel scale, tiers, ranks | [../packages/scoring/python/aci12/summarize.py](../packages/scoring/python/aci12/summarize.py) |
| Grouped predictive holdout | [../packages/scoring/python/aci12/validate_predictive.py](../packages/scoring/python/aci12/validate_predictive.py) |
| Effort field parser | [../packages/shared/src/effort.ts](../packages/shared/src/effort.ts) |
| Lineage | [../packages/ingest/src/lib/lineage.ts](../packages/ingest/src/lib/lineage.ts) |
| Pipeline persistence rules | [../scripts/pipeline.ts](../scripts/pipeline.ts) |
| Candidate 928 builder / AA forbid / τ³ Pass^1 | [../scripts/prepare-candidate-input.ts](../scripts/prepare-candidate-input.ts) |
| Coverage audit CLI | [../scripts/audit-benchmark-coverage.ts](../scripts/audit-benchmark-coverage.ts) |
| Frozen 924-row input | [audits/1.4.3-effort-coverage/accepted-input.json](audits/1.4.3-effort-coverage/accepted-input.json) |
| Accepted diagnostics | [audits/1.4.3-effort-coverage/accepted-diagnostics.json](audits/1.4.3-effort-coverage/accepted-diagnostics.json) |
| Published snapshot | [../data/snapshots/2026-09-06/snapshot.json](../data/snapshots/2026-09-06/snapshot.json) |
| Public DTO allowlist | [../apps/web/lib/public-dto.ts](../apps/web/lib/public-dto.ts) |
| AA overlay schema | [../apps/web/lib/display-data.ts](../apps/web/lib/display-data.ts) |
| External evaluation UI | [../apps/web/components/external-evaluations.tsx](../apps/web/components/external-evaluations.tsx) |
| Vending-Bench money transform | [../data/benchmarks/vending-bench-2.yaml](../data/benchmarks/vending-bench-2.yaml) |
| Coverage from used cells | [../apps/web/lib/snapshot-data.ts](../apps/web/lib/snapshot-data.ts) |
| Compact ± | [../apps/web/components/score-value.tsx](../apps/web/components/score-value.tsx) |
| Geometry | [../packages/scoring/python/aci12/geometry.py](../packages/scoring/python/aci12/geometry.py) |
| Class prior | [../packages/scoring/python/aci12/class_prior.py](../packages/scoring/python/aci12/class_prior.py) |
| Experimental runner | [../packages/scoring/python/aci12/experiment.py](../packages/scoring/python/aci12/experiment.py) |
| TS transfer-class schema | [../packages/scoring/src/transfer-class.ts](../packages/scoring/src/transfer-class.ts) |
| Illustrative classes | [../data/experimental/transfer-classes-example.json](../data/experimental/transfer-classes-example.json) |
| GDPval registry | [../data/benchmarks/gdpval.yaml](../data/benchmarks/gdpval.yaml) |
| τ³ registry | [../data/benchmarks/tau3-bench-banking.yaml](../data/benchmarks/tau3-bench-banking.yaml) |
| 69 blocked / 19 fitted check | [audits/coverage-expansion-2026-09-06/benchmark-verification.md](audits/coverage-expansion-2026-09-06/benchmark-verification.md) |
| 928 vs 924 | [audits/coverage-expansion-2026-09-06/coverage-delta.md](audits/coverage-expansion-2026-09-06/coverage-delta.md) |
| 1.4 structure rejection | [audits/1.4-validation/](audits/1.4-validation/) |

---

## 18. Caveats about documentation drift

[methodology.md](methodology.md) still describes the **rejected** 1.4.3 first sampler (warmup 3 000, target accept 0.995) in the inference section, while [../data/index-config.yaml](../data/index-config.yaml) and the published snapshot use **4 000 / 0.999**. Trust config + `accepted-diagnostics.json` + `snapshot.json` for the deployed run. Methodology remains correct on the unreported-effort policy, panel equations, and tier table.

`packages/scoring/python/aci12/__init__.py` still labels the package “method 1.2.1”; the payload `method_version` is 1.4.3. Legacy `coverage.ts` bootstrap coverage is not the published \(n_{\text{cells}}/19\) counter.

This reference inspected repository state at `a208898`. It did not execute NUTS, live adapters, or HTTP verification. Private overlay payloads and credentials are out of scope.
