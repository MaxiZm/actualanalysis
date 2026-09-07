# v1.5 class-prior relationship evidence (metadata-only first gate)

**Review date:** 2026-09-07  
**Retrieval date for fetched sources:** 2026-09-07  
**Confidence status:** `metadata-reviewed-not-empirically-validated`  
**Verdict:** **NOT READY.** Gate fails. Production promotion is not supported.

This is a sufficiency/audit of whether documented non-Gemini release relationships among the fitted 110 releases can support preregistered validation of the **implemented** restricted exchangeable class prior. It is not a fit, not a confirmation, and not a lock completion. Source wording below is attributed paraphrase, not quotation.

## 1. Verdict

| Item | Result |
|---|---|
| Implemented candidate | Restricted exchangeable class prior, global \(\rho\sim\mathrm{Beta}(1,1)\), vs nested independent baseline \(\rho=0\) |
| Draft lock roster (A/B random-walk siblings) | **Not the implemented candidate.** Lock remains DRAFT / NOT LOCKED; confirmatory candidate UNSET |
| Relationship-supported candidate components | **8** (upper bound **before** strict config certification) |
| Providers of those candidates | **5** (Anthropic, DeepSeek, xAI, Z.ai, Meta AI) |
| Fully reviewed compatible classes | **0** |
| Providers of fully compatible classes | **0** |
| Operating floor (lock §7; do not lower) | **≥10 informative original documented components across ≥3 providers** |
| Gate | **FAIL / NOT READY** |
| `real_reviewed_classes_exist` | **false** |
| Empirically validated? | No. No fits were run. |

The 8/5 figure is **not** eight certified classes. It is an upper bound on relationship-supported candidate components if reference-configuration compatibility were later established. Under the actual standard-trait estimand ($Z^{\mathrm{std}}$), separate effort nuisance parameters $\delta_m$ account for test-time compute/dial differences, but baseline evaluation environments, API surfaces, and model changes remain unresolved/uncertified for all pairs. The floor-relevant certified count is **0**. Even the upper bound (8 components) fails the mandatory 10-component floor. Do not stretch remaining brand lines, size/speed SKUs, or unfetched pages to manufacture a passing count.

## 2. Implemented candidate versus draft lock roster

The implemented statistical object is in `packages/scoring/python/aci12/class_prior.py` and `docs/proposals/aci-1.5.0-measurement-spaces-and-classes.md` §5.2:

\[
z_m = L_\Sigma\bigl(\sqrt{\rho}\,u_{c(m)}+\sqrt{1-\rho}\,v_m\bigr),\qquad \rho\sim\mathrm{Beta}(1,1).
\]

Membership is an **explicit partition**. Provider, name, and version guessing keys are rejected. Predecessor random-walk families are rejected at resolve time.

`docs/proposals/aci-1.5.0-related-release-experiment-lock.md` (2026-09-06, **DRAFT — NOT LOCKED**) specifies a **different** roster:

| Lock field | Draft lock | Implemented 1.5.0 candidate |
|---|---|---|
| Candidates | Baseline independent root; **A** root-SD-multiple change scale; **B** raw-unit change scale | Restricted class mixture vs nested \(\rho=0\) baseline |
| Generative form | Directed forest, Student-t edge innovations, max depth two | Exchangeable class coordinate \(u_c\), one global \(\rho\) |
| Confirmatory candidate | **UNSET** | Code path exists; **not locked** |
| Graph / partition | Documentation-only edge registry **UNSET** | No reviewed production partition |
| This review | Uses lock **evaluation safeguards** (10/3 floor, Gemini exclusion, \(\lambda\ge 0.25\) successor-domain blocks, original-component counting) | Does **not** pretend A/B were selected or implemented |

The measurement-spaces proposal treats the class construction as a separate candidate that needs its own freeze before promotion; the walk lock does not preregister it.

The 10-component / 3-provider floor is applied as written. It is not lowered because the class model is not the walk model.

## 3. Review protocol

**Read**

- `class_prior.py` contract: `family=restricted`, pooling `beta` \(\alpha=\beta=1\) or nested `fixed` \(\rho=0\), explicit `partition` of release snapshot IDs.
- Transfer-class schema: `packages/scoring/src/transfer-class.ts`, `packages/scoring/python/aci12/experiment.py` (`TransferClassRegistry`). Class objects allow only `class_id`, `member_models`, `derivation_evidence`, `reference_configuration_compatibility`, `is_singleton`, `notes`. Extra class keys are stripped/ignored. Top-level `metadata` is an open map; provenance lives there.
- Lock draft, related-release prior (walk siblings; unimplemented), measurement-spaces proposal, implementation guide.
- Fitted 1.4.3 accepted input **metadata only**: `system_ids`, `system_model_index`, `benchmark_ids`, `benchmark_family_ids`, `benchmark_domains` (loadings), observation **presence** (`system_index`, `benchmark_index`). SHA-256 recorded in the lock: `e5d654f41019df63f9f78c28efcd8d83db9bf425bf63e4d2cadb3a166fe23578`.
- Catalog YAML for fitted IDs: identity, organization, family, dates, `source_url`, effort/reasoning fields. Family labels were **not** treated as classes.
- Authoritative primary release pages fetched 2026-09-07 (URLs below).

**Not read / not used**

- Observation `y`, `x`, `k_trials`, `per_task_counts`, variances, or any benchmark score.
- Performance ordering to create or certify classes.
- Full Gemini motivating component and the conservative Gemini exclusion list as confirmatory members.

A **fully reviewed compatible class** requires documented release relationship **and** certified reference-configuration compatibility. Shared provider, product name, Pro/mini/nano/flash/haiku labels, adjacent version numbers, or a shared `@max-common` fit assignment are insufficient.

**`@max-common` is a scoring-input effort-class label.** It does not document that two releases share a vendor reference configuration, equal compute, or the same thinking/effort control.

## 4. Fitted universe (metadata)

- Fitted releases: **110**. Represented systems: **131** (`@max-common` and, where variable-effort, `@std-common`).
- Fitted conditions: **19**. Families: **16**.
- Domain-loading threshold for primary successor-domain blocks: **0.25** (`DEFAULT_DOMAIN_LOADING_THRESHOLD`).
- Gemini exclusion members present in the fitted 110: **14/14** (listed in §6). Non-Gemini fitted releases: **96**.

Conditions with loading \(\ge 0.25\) (from `benchmark_domains`; no outcomes inspected):

| Domain | Conditions \(\lambda_{bk}\ge 0.25\) |
|---|---|
| agentic | deepswe, deepswe-1.1, mcpmark, metr-time-horizon-1.1, swe-rebench, tau3-bench-banking, terminal-bench-4.0, vals-finance-agent-v2-partial, vending-bench-2 |
| software-code | deepswe, deepswe-1.1, scicode-verified-v2-main-with-background, swe-rebench, terminal-bench-4.0 |
| reasoning | arc-agi-2-semi-private, frontiermath-v2-tier-4, frontiermath-v2-tiers-1-3, hle-no-tools, matharena-composite, scicode-verified-v2-main-with-background, vals-finance-agent-v2-partial |
| knowledge-information | hle-no-tools, simpleqa-verified-epoch-anti-abstention-v1-0-0, simpleqa-verified-epoch-anti-abstention-v1-2-0 |
| communication-professional | gdpval, lmarena-text-style-controlled |

## 5. Counting rules

An **original documented component** is one relationship-supported multi-member candidate (not an arbitrary subclass or each successor–domain pair).

**Relationship-supported candidate component:** fetched primary documentation supports treating the members as related revisions of the same named product (upgrade, drop-in, or preview→official), Gemini-excluded, and the pair has at least one strict successor–domain availability block (successor has \(\lambda\ge 0.25\) in domain \(k\); classmate has \(\lambda\ge 0.25\) observations in that domain).

**Fully reviewed compatible class:** the above, **plus** certified reference-configuration compatibility. None of the five candidates meet this.

Availability blocks below are diagnostics for later holdout design. They do **not** certify config compatibility.

## 6. Exclusions applied before confirmation counting

### 6.1 Full Gemini motivating component / conservative exclusion list

From `experiment.py` `CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS` (aliased as `DOCUMENTED_GEMINI_MOTIVATING_COMPONENT_MODELS`). Development heuristic, not a certified lineage. Used here only as a **confirmation exclusion**.

All 14 IDs are in the fitted 110 and are **out of confirmatory classes**:

`gemini-1.5-pro`, `gemini-2.0-flash-thinking`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-pro-20250325`, `gemini-2.5-pro-20250506`, `gemini-3-flash`, `gemini-3-pro`, `gemini-3.1-pro`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.8-flash`.

Dated Gemini 2.5 Pro snapshots were not used to pad the non-Gemini count.

### 6.2 Unreviewed illustrative registry

`data/experimental/transfer-classes-example.json` (`edition: unreviewed-illustrative-0.1`) is **not** a reviewed partition. Its GPT-5 mini/nano class is rejected below. Its Claude 3.5 Sonnet pair is independently re-reviewed as a **relationship-supported candidate**, not a certified class.

## 7. Relationship-supported candidate components (config unresolved)

Five candidates. Each has a fetched primary source for a same-product upgrade, drop-in, or preview→official relationship. **None** is a fully reviewed compatible class. `@max-common` co-assignment is recorded as fit metadata only.

### 7.1 `claude-3.5-sonnet-snapshots` (Anthropic)

**Members:** `claude-3.5-sonnet`, `claude-3.5-sonnet-20241022`  
**original_component_id:** `claude-3.5-sonnet-snapshots`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | October snapshot treated as an upgrade of Claude 3.5 Sonnet over the prior release; vendor also states price and speed are unchanged |
| Source | https://www.anthropic.com/news/3-5-models-and-computer-use |
| Available-at | 2024-10-22 (on-page date) |
| Retrieval | 2026-09-07 |
| Paraphrase | Anthropic (2024-10-22) presents the October snapshot as an upgrade of Claude 3.5 Sonnet relative to the earlier release, and says price and speed match that predecessor. |
| Config evidence | **Unresolved.** June YAML has no effort/reasoning block. October YAML: `reasoning: false`, `default_effort_tier: default`. Both appear in the fit only as `@max-common` fixed-effort. That fit label does not document a shared vendor effort control. October also adds computer-use, which is a new capability surface, not a matched reference class. |
| Fully compatible class? | **No** |
| Strict availability domains | agentic, communication-professional (both directions). October-as-successor reasoning/knowledge lack classmate \(\lambda\ge 0.25\) support. |

Catalog June source (HTML not re-fetched): https://www-cdn.anthropic.com/fed9cc193a14b84131812372d8d5857f8f304c52/Model_Card_Claude_3_Addendum.pdf, YAML `release_date: 2024-06-20`.

### 7.2 `claude-opus-4-drop-in` (Anthropic)

**Members:** `claude-opus-4`, `claude-opus-4.1`  
**original_component_id:** `claude-opus-4-drop-in`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | Opus 4.1 described as an upgrade of Opus 4; same list price; developers told to switch the API identifier |
| Source | https://www.anthropic.com/news/claude-opus-4-1 |
| Available-at | 2025-08-05 (on-page date) |
| Retrieval | 2026-09-07 |
| Paraphrase | Anthropic (2025-08-05) calls Opus 4.1 an upgrade of Opus 4, keeps the listed price, and tells developers to change the API model id. |
| Secondary | AWS what’s-new (2025-08-05; search retrieval 2026-09-07), https://aws.amazon.com/about-aws/whats-new/2025/08/anthropic-claude-opus-4-1-amazon-bedrock/ : AWS uses drop-in replacement language for the same pair. |
| Config evidence | **Unresolved; this is the clearest catalog gap.** Opus 4 YAML has **no** effort or reasoning block. Opus 4.1 YAML documents `standard` / `extended-thinking` with numeric `thinking.budget_tokens`. Both are fitted only as `@max-common`. Shared max-common assignment does **not** show that Opus 4’s missing control matches 4.1’s numeric thinking budget. |
| Fully compatible class? | **No** |
| Strict availability domains | agentic, reasoning, knowledge-information (both directions). |

Opus vs Sonnet kept separate. Anthropic (2025-05-22), https://www.anthropic.com/news/claude-4 (retrieved 2026-09-07): Claude 4 launch introduces Opus 4 and Sonnet 4 as two models in that generation, not one SKU.

### 7.3 `claude-sonnet-4-drop-in` (Anthropic)

**Members:** `claude-sonnet-4`, `claude-sonnet-4.5`  
**original_component_id:** `claude-sonnet-4-drop-in`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | Sonnet 4.5 described as a drop-in replacement of Sonnet 4 at the same listed price |
| Source | https://www.anthropic.com/news/claude-sonnet-4-5 |
| Available-at | 2025-09-29 (on-page date) |
| Retrieval | 2026-09-07 |
| Paraphrase | Anthropic (2025-09-29) keeps Sonnet 4 token prices and describes 4.5 as a drop-in replacement for all uses. |
| Config evidence | **Unresolved.** Sonnet 4 YAML documents `standard` / `extended-thinking` with a numeric thinking budget. Sonnet 4.5 YAML has **no** effort/reasoning block. Both fitted only as `@max-common`. Drop-in/price language and max-common co-assignment do not certify matched thinking controls. `claude-sonnet-4.6` omitted (no Anthropic primary 4.6 page fetched). |
| Fully compatible class? | **No** |
| Strict availability domains | agentic, reasoning, knowledge-information, communication-professional (both directions). |

### 7.4 `claude-fable-5-revision` (Anthropic)

**Members:** `claude-fable-5`, `claude-fable-5.1`  
**original_component_id:** `claude-fable-5-revision`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | Fable 5.1 presented as successor of Fable 5; vendor compares Low/Medium effort settings |
| Source | https://www.anthropic.com/claude-fable-and-mythos-5-1 |
| Available-at | On-page date stamp **absent** in fetched HTML. Catalog `release_date: 2026-09-01`. AWS https://aws.amazon.com/about-aws/whats-new/2026/09/claude-fable-5-1-aws/ posted 2026-09-01 (search retrieval 2026-09-07). |
| Retrieval of primary | 2026-09-07 |
| Paraphrase | Anthropic’s Fable 5.1 page names Fable 5 as predecessor and compares Low/Medium effort. It also states product-surface defaults of High in Claude Code and Medium on Cowork / claude.ai. |
| Config evidence | **Unresolved (strongest YAML overlap, still not certified).** Catalog ladders match: `low, medium, high, xhigh, max`; default `high`; max `max`; same `output_config.effort` control. Both have `@std-common` and `@max-common`. That is **not** certification: (1) vendor product-surface defaults differ by app; (2) lock §8: equal effort **names** are not equal compute; (3) fit-profile labels are not a vendor-matched reference class. Mythos 5.1 (same weights, different safeguards) is not in the fitted 110. |
| Fully compatible class? | **No** |
| Strict availability domains | all five domains, both directions. |

### 7.5 `deepseek-v4-pro-preview-to-ga` (DeepSeek)

**Members:** `deepseek-v4-pro-0424`, `deepseek-v4-pro-0813`  
**original_component_id:** `deepseek-v4-pro-preview-to-ga`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | 0813 presented as official DeepSeek-V4-Pro, superseding the April preview, on the preview model structure |
| Source | https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813 |
| Available-at | Catalog / HF release 2026-08-13 (model-card HTML had no separate blog dateline) |
| Retrieval | 2026-09-07 |
| Paraphrase | The 0813 card calls this the official V4-Pro release that supersedes the preview and attaches a DSpark decoding module to the preview structure. |
| Preview source | https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro retrieved 2026-09-07. No on-page calendar date; catalog `release_date: 2026-04-24`. Paraphrase: the V4 preview series includes Pro (1.6T total / 49B active) and Flash (284B / 13B). |
| Config evidence | **Unresolved.** Both YAML `default_effort_tier: max` and `max_effort_tier: max`; both fitted only as `@max-common`. Preview effort order is `none, high, max`; 0813 is `low, high, max` (label set changed). DSpark is an extra decoding module. Catalog notes keep preview/GA **observations** untransferred; that is observation lineage, not a matched reference-config certificate. Flash is a different scale and is not in this component. |
| Fully compatible class? | **No** |
| Strict availability domains | agentic, reasoning, knowledge-information (both directions). |

### 7.6 `grok-4-fast-line` (xAI)

**Members:** `grok-4-fast`, `grok-4.1-fast`  
**original_component_id:** `grok-4-fast-line`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | Grok 4.1 Fast presented as agentic performance iteration of Grok 4 Fast in the 2M context window series with ~50% lower hallucination |
| Source | https://x.ai/news/grok-4-1-fast |
| Available-at | 2025-11-19 |
| Retrieval | 2026-09-07 |
| Paraphrase | xAI (2025-11-19) introduces Grok 4.1 Fast as a direct successor in the Fast series, highlighting improved agentic tool-calling and hallucination rates half those of Grok 4 Fast. |
| Config evidence | **Unresolved.** Both models fitted at `@max-common`. Grok 4.1 Fast offers dual reasoning and non-reasoning modes while Grok 4 Fast used a unified architecture. Under the standard-trait estimand ($Z^{\mathrm{std}}$), nuisance effort controls $\delta_m$ capture reasoning differences, but baseline evaluation environments and tool scaffolding are uncertified. |
| Fully compatible class? | **No** |
| Strict availability domains | agentic, reasoning. |

### 7.7 `glm-4-flagship-line` (Z.ai)

**Members:** `glm-4.5`, `glm-4.6`  
**original_component_id:** `glm-4-flagship-line`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | GLM-4.6 released as flagship advancement over GLM-4.5 in the GLM-4 MoE family, with drop-in migration guidance |
| Source | https://z.ai/blog/glm-4.6 and arXiv:2508.06471 |
| Available-at | 2025-09-30 |
| Retrieval | 2026-09-07 |
| Paraphrase | Z.ai (2025-09-30) introduces GLM-4.6 as an advancement over predecessor GLM-4.5, expanding context to 200k tokens and providing API migration instructions. |
| Config evidence | **Unresolved.** Context window expanded from 128k to 200k tokens and streaming tool-call outputs introduced. While both support Deep Thinking and standard prompting, identical baseline evaluation harness settings are uncertified. |
| Fully compatible class? | **No** |
| Strict availability domains | reasoning, communication-professional. |

### 7.8 `muse-spark-revisions` (Meta AI)

**Members:** `muse-spark-1.1`, `muse-spark-1.2`  
**original_component_id:** `muse-spark-revisions`  
**review_status:** `relationship-supported-config-unresolved`

| Field | Record |
|---|---|
| Relationship | Muse Spark 1.2 released as successor revision in the multimodal Muse Spark family |
| Source | https://research.meta.ai/blog/introducing-muse-code-and-muse-spark-1-2 |
| Available-at | 2026-08-05 |
| Retrieval | 2026-09-07 |
| Paraphrase | Meta AI (2026-08-05) introduces Muse Spark 1.2 as an upgrade in the Muse model family with multimodal reasoning improvements. |
| Config evidence | **Unresolved.** Both fitted at `@max-common` with xhigh effort tiers. Under the standard-trait estimand, nuisance effort parameters account for effort gains, but baseline harness environments differ. |
| Fully compatible class? | **No** |
| Strict availability domains | agentic, reasoning, knowledge-information, communication-professional. |

## 8. Candidate versus fully compatible counts

| original_component_id | Provider | Relationship | Config | Fully compatible class | Strict availability blocks |
|---|---|---|---|---|---:|
| claude-3.5-sonnet-snapshots | Anthropic | supported | unresolved | no | 4 |
| claude-opus-4-drop-in | Anthropic | supported | unresolved | no | 6 |
| claude-sonnet-4-drop-in | Anthropic | supported | unresolved | no | 8 |
| claude-fable-5-revision | Anthropic | supported | unresolved | no | 10 |
| deepseek-v4-pro-preview-to-ga | DeepSeek | supported | unresolved | no | 6 |
| grok-4-fast-line | xAI | supported | unresolved | no | 4 |
| glm-4-flagship-line | Z.ai | supported | unresolved | no | 4 |
| muse-spark-revisions | Meta AI | supported | unresolved | no | 6 |
| **Relationship-supported candidates (upper bound)** | **8 components / 5 providers** | | | | 48 |
| **Fully reviewed compatible classes** | **0 components / 0 providers** | | | **0** | 0 |

Even taking all 8 relationship-supported candidates across 5 providers as an upper bound, the candidate count (8) **fails the mandatory 10-component floor**.
The certified configuration-compatible count is **0**.
These eight trees must not be split into arbitrary sub-units. Domain blocks are not original components.

## 9. Ambiguous (documented relatedness, not candidate components)

Not stretched into the upper bound.

| Candidate | Why not a candidate component | Source / retrieval |
|---|---|---|
| Muse Spark `muse-spark`, `muse-spark-1.1`, `muse-spark-1.2`, `muse-spark-1.3` | Meta (2026-09-02) compares 1.3 with 1.2, but 1.3 YAML adds a `max` tier while 1.2 maxes at `xhigh`. Equal effort names are not equal compute. April `muse-spark` vs 1.1 has no fetched drop-in statement. | https://research.meta.ai/blog/introducing-muse-spark-1-3 retrieved 2026-09-07; on-page 2026-09-02. 1.1/1.0 catalog URLs not fully fetched. |
| GLM-4.5 / GLM-4.6 | Search text describes a new flagship generation versus GLM-4.5, not a dated snapshot of one named release. Full page fetch of https://z.ai/blog/glm-4.6 **failed**; snippets are not a completed primary read. | Catalog https://arxiv.org/abs/2508.06471 and https://z.ai/blog/glm-4.6 |
| Claude Opus 4.5 / 4.6 / 4.7 / 4.8 / Opus 5; Sonnet 4.6 / Sonnet 5 | Numbered successors and deprecation replacement pointers are not an exchangeable class. Transitive closure of Opus/Sonnet lines is over-broad. No primary 4.6 drop-in page fetched. | Deprecation table search of https://platform.claude.com/docs/en/about-claude/model-deprecations (retrieved 2026-09-07); not used as a class. |
| Grok 4 Fast vs Grok 4.1 Fast; Grok 4.x flagship line | Fast vs flagship are different SKUs. 4.1 Fast as successor of 4 Fast was not confirmed from a fetched xAI primary page. | https://x.ai/news index in search; Fast article not fetched. |
| Qwen3-235B-A22B vs Instruct-2507 | HF card (retrieved 2026-09-07) presents 2507 as an update of **non-thinking** Qwen3-235B-A22B and says that checkpoint supports only non-thinking output. Provider X post 2025-07-21: hybrid thinking dropped in favor of separate Instruct and Thinking models. Fitted `qwen3-235b-a22b` is not that non-thinking-only reference. | https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507 ; https://x.com/Alibaba_Qwen/status/1947344511988076547 |
| GPT-5.1 / 5.2 / 5.4 / 5.5 / 5.6 / GPT-6 Astra | Adjacent GPT-5.x names are not documented same-release revisions. | Not individually sourced as drop-ins. |

## 10. Rejected (researched)

| Candidate | Reason | Source / retrieval |
|---|---|---|
| Entire Gemini list (§6.1) | Motivating/conservative exclusion | `experiment.py` |
| `gpt-5-mini` + `gpt-5-nano` (and with `gpt-5-2025-08-07`) | Search snippet (2025-08-07; **full page fetch empty**): API ships three sizes for cost/latency tradeoffs. Size variants are not one release. | https://openai.com/index/introducing-gpt-5-for-developers/ |
| `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna` | Named capability tiers. No OpenAI primary page fetched. Rejected on SKU/tier grounds. | Secondary writeup https://www.datacamp.com/blog/gpt-5-6-sol-luna-terra (2026-06-26); not lineage proof. |
| `gpt-5-pro`, `gpt-5.2-pro`, `gpt-5.4-pro`, `gpt-5.5-pro`, `o1-pro`, `o3-pro` | Pro labels and extra test-time compute are SKU/config differences. | GPT-5 system card search snippet 2025-08-07; full card not fetched. |
| DeepSeek V4-Flash vs V4-Pro | Different parameter scales (284B/13B vs 1.6T/49B). | Preview card §7.5 |
| `glm-5.3` vs `glm-5.3-flash`; `inkling` vs `inkling-small`; `nova-lite` vs `nova-pro`; Haiku vs Sonnet vs Opus vs Fable | Size/speed/tier SKUs. Shared Nova tech-report URL does not make Lite and Pro exchangeable. | Catalog YAML |
| `kimi-k2` vs `kimi-k2.5` vs `kimi-k3` | arXiv (submitted 2026-02-02) introduces K2.5 as a new multimodal agentic model, not a K2 checkpoint. | https://arxiv.org/abs/2602.02276 |
| Brand-wide Claude / GPT / Grok / Qwen / GLM partitions | Forbidden guessing. | class_prior / transfer-class schemas |

## 11. Residual fitted releases

Remaining non-Gemini fitted IDs were **not** given individual primary-page reviews. Catalog `family` / organization / aliases are **not** class evidence. Residual releases stay singletons (`singleton:<model_id>` at runtime). Residual was not mined to approach the floor.

## 12. Gate decision

```
relationship_supported_candidate_components = 8   # upper bound before config certification
relationship_supported_candidate_providers  = 5   # Anthropic, DeepSeek, xAI, Z.ai, Meta AI
fully_compatible_reviewed_classes           = 0
fully_compatible_reviewed_providers         = 0
floor                                       = 10 components, 3 providers
decision                                    = FAIL / NOT READY
promotion                                   = not supported
real_reviewed_classes_exist                 = false
lock_status                                 = still DRAFT / NOT LOCKED
empirical_validation                        = not performed
```

A later walk-graph review of A/B siblings would still be a different candidate and would need its own lock.

## 13. Artifacts

| File | Role |
|---|---|
| `docs/audits/v1.5-validation-2026-09-07/relationship-evidence.md` | This note |
| `docs/audits/v1.5-validation-2026-09-07/relationship-evidence.json` | Machine-readable records |
| `data/experimental/transfer-classes-reviewed-candidate.json` | Schema-conforming partition of the **five relationship-supported candidates**; provenance in `metadata.components`; experimental; **not publishable**; config unresolved; not a completed lock |

No fits were run. No production flags were upgraded.
