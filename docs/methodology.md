# How the index works

**ActualAnalysis Capability Index · version 1.4.2 · calibration edition 2026a**

The index estimates model capability from published benchmark evidence. It is a relative comparison, not a percentage of tasks a model will solve. Price, output speed and context are shown beside capability and do not change it.

## Reading the leaderboard

The main number is the posterior median. **±** is the larger distance from that median to either endpoint of the 90% credible interval, rounded upward to one decimal place. This compact symmetric envelope contains the original interval; hover or focus the number to see its exact endpoints.

A **star (*)** means the estimate is preliminary. Every model stays in the list when the score profile changes. Preliminary estimates are interleaved by their displayed median; they are never sent to a separate group. Missing evidence is not a score of zero.

The leaderboard’s **#** is the position in the current sorted and filtered view. The default order is the displayed median, highest first, across all evidence tiers. Similar point estimates do not establish a meaningful ordering. Published statistical ranks and their 90% intervals remain restricted to eligible systems in the downloadable data; those subset ranks are not used as list positions.

## Mixed, Agentic and Chat

All three views now use the same type of scale: **50 is the calibration-panel mean; 10 points is one panel standard deviation**. Scores can be below 0 or above 100. They are not capped percentages.

| Capability domain | Mixed | Agentic | Chat |
|---|---:|---:|---:|
| Agentic: tools, terminals and computer use | 20% | 60% | 0% |
| Software and code | 20% | 30% | 10% |
| Reasoning | 20% | 10% | 20% |
| Knowledge and information | 20% | 0% | 30% |
| Communication and professional work | 20% | 0% | 40% |

Each posterior draw first standardizes every domain on the fixed panel. It then combines the domain traits using the selected weights and standardizes the resulting composite on that same panel:

$$\widetilde Z_{sk}=\frac{Z_{sk}-\mu_{Pk}}{\sigma_{Pk}},\qquad C_{su}=\sum_k w_{uk}\widetilde Z_{sk}$$

$$I_{su}=50+10\frac{C_{su}-\mu_{Pu}}{\sigma_{Pu}}$$

Here $s$ is a model system, $u$ is the selected view, and $P$ is the calibration panel. Standardization is repeated inside each draw so uncertainty in the scale is propagated.

The weights are declared product choices, not learned measures of universal usefulness. Chat emphasizes information and communication, but available professional and preference evidence remains limited. Strong performance on this index does not guarantee usefulness in a particular workflow. Changing the panel or these weights requires a new method or calibration edition.

## Models, effort and source evidence

The unit of analysis is a model snapshot at a declared effort class. `std-common` represents default effort under a common evaluation harness; `max-common` represents the highest declared effort. The default leaderboard uses `max-common`.

Models whose declared default and maximum effort are equal have one fitted system. Models without a documented maximum, including numeric thinking budgets without a universal maximum, retain a pooled configuration; this is a metadata limitation, not proof that the provider exposes no dial. With a documented variable dial and maximum but unknown default, only explicitly matched maximum-effort results enter the maximum system. A default is never invented. Lower and intermediate observed effort settings are assigned to the nearest declared class and flagged as approximate, including settings below the default.

A result preserves its source, date, metric, benchmark version, harness and reasoning settings when reported. Dated source protocols can supply missing fields. Unresolved provenance pins are labelled `metadata_incomplete` and receive 1.5 times the run-noise scale. Explicitly incompatible harnesses, inactive conditions, duplicate lineages and observations without a usable likelihood are excluded.

Version 1.3.2 preserves original evaluation run IDs, reported uncertainty and exact effort configurations. FrontierMath v1 launch scores are excluded from the v2 conditions. Native source rows and confirmed mirrors share a lineage, so copying a result does not add evidence.

Version 1.4.0 corrects the documented reasoning controls for GPT-5.6 Sol, Terra and Luna. It also restores their named Arena configurations and GPT-5.5 high. Explicit effort suffixes are preserved before alias deduplication, so two settings do not collapse into one result. The underlying benchmark measurements are unchanged by this method release.

Version 1.4.1 expands and audits the evidence. Arena preserves the complete publication, original model labels and every distinct configuration; a publisher's batch ID cannot collapse different models into one observation. Vending-Bench includes its full native table, with each configuration's actual repeat count and standard error. SWE-rebench compares one declared 111-task window, rather than giving each model a different historical task set.

Version 1.4.2 recovers Gemini 3.8 Flash's explicit High result from the newer official Arena table. Because Arena ratings share a fitted scale, the complete dated cohort replaces the older export. Its exact published confidence interval supplies the uncertainty. Terminal-Bench's shared mini-SWE-agent results retain their native run uncertainty and common harness identity; a rounded vendor citation of that same run does not count twice. Documented medium-default and high-maximum settings for Gemini 3.7/3.8 remain separate from the actual effort reported by each evaluator.

DeepSWE v1 and v1.1 are separate conditions. Native SimpleQA task revisions 1.0.0 and 1.2.0 are also separate, with their reported item errors and evaluation IDs. SciCode-Verified v2 uses 64 whole problems with background under the pinned corrected evaluator; the original SciCode task count is inapplicable. Lower-level subproblem scores are retained as context and do not become additional independent evidence.

Epoch's ECI export contains preprocessed scores, not necessarily raw benchmark accuracy. In HLE it subtracts a 4.8% floor and rescales the remainder. Those transformed copies are excluded in favor of the source's original estimates. A second website quoting the same measurement does not strengthen the result.

MathArena's composite is a continuous expected-performance estimate. We use its published bootstrap interval and freeze the current component manifest together with the table. LiveBench's equal-category composite, MRCR's sequence-match ratios and OSWorld's published aggregate means remain visible without entering the fit where sampling uncertainty or evaluated denominators are unresolved. OSWorld release dates, full versus offline subsets, strict completion and partial reward remain distinct. A nominal task-set size does not justify inventing a binomial sample size.

[Finance Agent v2](https://www.vals.ai/benchmarks/fabv2) contributes its native weighted partial-credit mean on 450 private Test tasks, averaged over three runs. The reported SEM is in percentage points and enters the continuous logit likelihood directly, without another division by √3 or reconstructed success counts. Its run uncertainty describes repeatability on those fixed tasks, not generalization to a new task population. The existing learned run discrepancy and incomplete-metadata adjustment remain in force because exact harness and judge revisions are unavailable. Domain loadings were fixed before fitting from the task definition: 35% agentic, 25% reasoning, 20% knowledge and 20% professional communication. These are declared modeling judgments. All-Pass and category scores describe the same runs and do not add independent fitted evidence.

Harvey Legal Agent, MineBench, LVBench, BioMysteryBench and LABBench2 extend the visible evidence for Gemini 3.8. They remain observed-only where sampling units, revision identity or evaluator conditions are unresolved. The two LVBench settings and two BioMystery subsets stay separate. More visible benchmark rows do not by themselves justify a narrower capability interval.

Repeated reports of the same result are not independent evidence. The source table keeps audit history, while comparison tables show one selected current result per model and benchmark. For a compact table, source priority is followed by highest explicitly reported effort, latest observation and stable identity. The selected score keeps its own uncertainty; errors are never borrowed from another configuration. Results from different harnesses are not automatically controlled comparisons.

Version 1.3.1 retires SWE-bench Pro Public and LiveCodeBench v6 Pro from fitting and current public exports. GSM8K and standalone AIME 2025 are not included. **MathArena composite remains included** as published: excluding standalone AIME does not alter the composite. Its owner can deprecate competitions, so the frozen manifest records which components were active at capture. The software-code utility basket now contains SWE-rebench, DeepSWE v1.1 and SciCode-Verified v2.

## Sparse evidence and close comparisons

Missing tests are not counted as failures, and benchmark count is not an explicit score penalty. The joint model estimates five correlated traits. Evidence in measured domains can inform unmeasured domains through the learned population correlations, but it does not become direct evidence in those domains. Sparse communication and professional evidence remains a limitation, and adding or removing evidence can move a median in either direction. Four strong reasoning results do not establish a measured gain in code, knowledge or communication.

For GPT-5.5 and GPT-5.5 Pro, the audit corrected mixed FrontierMath revisions, duplicated observations and missing Pro effort metadata. The matched xhigh results favor Pro on both FrontierMath v2 subsets but slightly favor GPT-5.5 on ARC-AGI-2. The model applies the same method to both; it does not enforce an ordering based on the Pro name. Use uncertainty and matched configurations to interpret small median differences.

The former GPT-5.6 Sol / GPT-5.5 Chat reversal combined a missing Arena alias, pooled Sol reasoning settings and a weakly identified communication trait. The old paired 90% interval spanned −21.4 to +13.2 points for Sol minus GPT-5.5; it did not establish that GPT-5.5 was better. Pairwise probabilities now remain available for preliminary fitted models as well as ranked ones. They are calculated from the same joint posterior draws, preserving correlation between the two estimates. A small median difference is not a demonstrated winner.

## Correlated capability traits and effort

Version 1.4.0 retains the correlated five-domain structure used by 1.3.2. The release corrects source configuration and comparison reporting, and strengthens validation. It does **not** claim a demonstrated improvement from a new capability formula.

For each model snapshot $m$, the standard-effort trait vector is drawn from a multivariate normal distribution:

$$\epsilon_m\sim\mathcal N_5(0,I),\quad \Omega\sim\operatorname{LKJ}(2),\quad \sigma_k\sim\operatorname{LogNormal}(0,0.5),\qquad Z_m^{std}=\operatorname{diag}(\sigma)L_\Omega\epsilon_m$$

Here $L_\Omega L_\Omega^T=\Omega$. The estimated correlations can be positive or negative. The raw domain spreads are learned; the display scale is subsequently standardized on the calibration panel. There is no separate shared-capability factor in the retained production structure.

Variable-effort models share their standard-effort traits with the corresponding maximum-effort system and receive a domain-specific increment:

$$Z^{max}_{mk}=Z^{std}_{mk}+\delta_{mk},\qquad \delta_{mk}=\mu_\delta+s_{\delta k}h_{mk},\qquad h_{mk}\sim\mathcal N(0,1)$$

The configured priors are $\mu_\delta\sim\mathcal N(0.30,0.30)$ and $s_{\delta k}\sim\operatorname{HalfNormal}(0.30)$. Gains are signed, not forced positive. Fixed-effort systems receive no increment. These increments remain in raw latent units, so the same raw gain can correspond to different displayed gains across domains. Weakly measured effort effects and domain spreads must be interpreted through their intervals.

Two replacement structures remain experimental: `general_specific` adds a positively correlated common factor with shrunk domain departures, while `correlated_unit` fixes marginal domain units but retains the unrestricted correlation matrix. Neither met the evidence required for promotion. Their rationale, fixed evaluation plans and unsuccessful results are retained in the [validation audit](https://github.com/MaxiZm/actualanalysis/tree/main/docs/audits/1.4-validation). No release date, Pro label or provider imposes a required score ordering.

## Joint statistical model

A single Bayesian likelihood estimates the capability traits alongside benchmark and source effects:

$$\eta_{sb}=\beta_b+\alpha_b\sum_k\lambda_{bk}Z_{sk}+f_{s,F(b)}+e_{sb}$$

The benchmark loadings $\lambda_{bk}$ are declared in its registry entry and sum to one. Positive discrimination $\alpha_b$ controls how strongly the benchmark separates systems. The intercept $\beta_b$ shifts its expected score. A shared family effect $f$ accounts for related tests, and a Student-t cell effect $e$ allows a model to perform unusually well or poorly on an individual benchmark.

The observation predictor also includes source-domain and protocol-condition offsets. Source reports have partially pooled noise and vendor-report effects. Benchmark intercepts use Normal(0, 3), log discrimination uses Normal(0, 0.6), and cell residuals use four degrees of freedom. The full configured constants appear below. Source effects, family dependence and robust cell residuals are retained in version 1.4.0; they are not replaced by a raw average of percentages from tests of different difficulty.

No benchmark is fixed as an anchor. Priors regularize the raw coordinates, and published scores use draw-wise panel standardization. With fixed cross-loadings, separate raw domain rescaling can change a benchmark’s effective trait mixture; one benchmark slope cannot generally absorb five different rescalings. Panel normalization does not remove that modeling assumption. The optional raw-panel soft pin is **not enabled** in this release.

## Matching a score to its measurement

For counted success rates, the predictor is mapped through chance and ceiling:

$$q=g+(c-g)\operatorname{logistic}(\eta)$$

Single-trial task counts use a binomial likelihood. Repeated tasks use a beta-binomial when per-task counts are available, or a normal approximation with a within-task correlation correction. When only an aggregate mean and a reported SE or confidence interval are available, the transformed continuous likelihood preserves that uncertainty, even if the registry lists a nominal task-set size. It does not round that mean into an invented number of successes. Exact reported counts take precedence. Rates without reported uncertainty use the available-count approximation; an unspecified “±” is not silently interpreted as a standard error. Pass-at-k observations are converted to a per-attempt estimate with uncertainty propagated through the transform.

Elo, time horizons, money and rubric scores require their declared continuous transform and usable uncertainty. A percentage printed next to a metric does not make that metric binomial accuracy.

- **CritPt:** [70 research-level physics challenges](https://github.com/CritPt-Benchmark/CritPt), evaluated by Artificial Analysis over five repeats per question. The displayed result is mean pass@1, not best-of-five. These remain 70 distinct questions, not 350 independent items. The attributed AA observations are visible in Compare and model pages; they do not enter the public fit.
- **ARC-AGI-3:** its [Relative Human Action Efficiency](https://docs.arcprize.org/methodology) is a continuous action-efficiency metric. Version 1.3.0 removes it from fitting and preserves observed scores until a suitable likelihood and uncertainty are available.
- **DeepSWE:** v1 and v1.1 each identify a 113-task suite, but actual scored attempts vary when provider or verifier failures are excluded. The native source defines a 95% run-to-run confidence interval, which is preserved with its actual repeat count. One documented interrupted run uses an item-level interval instead. No full-suite denominator is fabricated, and each revision is fitted separately.
- **AutomationBench:** the [600-task public strict pass rate](https://github.com/zapier/AutomationBench) is separate from partial-credit rewards and the harder private leaderboard. Previously mislabeled July results are assigned to the pinned v1.0.6 source condition; public v3 remains separate. These reported aggregates are observed-only while compatible sampling uncertainty remains unresolved.
- **Terminal-Bench-Science 0.1:** [native-agent results on 70 tasks, three trials each](https://www.terminal-bench-science.ai/announcement) are visible as source evidence and remain outside common-harness fitting.
- **BenchCAD:** the [with-tools 1,000-file voxel-IoU subset](https://benchcad.com/) is kept distinct from the full 17,900-part benchmark. These continuous scores are not fitted as task counts.
- **HealthBench Professional:** [length-adjusted rubric scores](https://deploymentsafety.openai.com/gpt-5-6) remain observed-only until compatible uncertainty and grader pins are available.

FrontierMath v2 Tier 4 and Terminal-Bench 4.0 retain their own versioned registry entries. Adding more tests improves an index only when their conditions and measurements are comparable.

## Publication and coverage

A system receives an overall evidence tier using the following gates, all of which must pass:

| Requirement | Verified | Ranked |
|---|---:|---:|
| Mixed 90% interval width | ≤ 12 | ≤ 20 |
| Represented domains | ≥ 4 | ≥ 3 |
| Safe independent cells | ≥ 2 | ≥ 1 |
| Largest family information share | ≤ 0.50 | ≤ 0.80 |
| Variance-reduction proxy | ≥ 0.70 | ≥ 0.50 |
| Family concentration diagnostic | ≤ 0.50 | ≤ 0.80 |

Otherwise the system is preliminary. Agentic and Chat additionally require a composite interval no wider than 20 points and at least two direct cells for each domain carrying 15% or more of that view's weight. A qualifying direct cell loads at least 25% on the domain. These checks gate published ranks; they do not hide preliminary medians.

The variance-reduction quantity is a proxy, $\max(0,\min(1,1-\operatorname{Var}(I)/100))$, using panel variance 100 as a reference. It is not a full prior-versus-posterior refit. The concentration diagnostic approximates variance inflation after dropping each family using local Gaussian precision and up to 200 posterior draws.

A safe cell is independently reported and either held out, or publicly released after the known training cutoff. Unknown training dates do not make public evidence safe. Private and semi-private labels describe the reported holdout, not an independent guarantee against leakage.

Coverage is the number of distinct fitted benchmarks for the selected model system divided by the number fitted in the latest run. It is separate from certainty, source quality and the overall evidence tier.

## Understanding the charts

Hover or focus a point to see the model and exact values. Select a point to highlight it across comparison charts. Overlapping labels are omitted from scatter plots; the tooltip supplies the full name. Values and source links are available in the tables as well.

Fractions and percentages share a percent axis; minute and hour reports share an hour axis. The source tables retain their original units.

**Observed versus expected** compares native source scores with the posterior median prediction after removing the cell misfit, then applying the inverse measurement transform. It retains the estimated family effect and excludes source-specific offsets. The diagonal means equality. Departures can reveal specialization, configuration differences, weak coverage or model misspecification. They are not corrected by forcing points onto the diagonal. This is an in-sample diagnostic, not a held-out accuracy guarantee.

Benchmark parameter cards report calibrated coordinates. Let $m_b$ and $s_b$ be the panel mean and standard deviation of $\sum_k\lambda_{bk}Z_{sk}$ in a draw. The reported location is $(-\beta_b/\alpha_b-m_b)/s_b$ and slope is $\alpha_b s_b$. The previous raw negative intercept was incorrectly labelled “difficulty”; multiplying it by the slope again also corrupted basket predictions.

Ranked charts show medians and intervals. A cost frontier connects non-dominated models under the chosen price and capability estimate; it ignores uncertainty in the frontier itself.

## Inference and validation limits

The production run uses four NUTS chains, 3,000 warm-up iterations and 5,000 samples per chain, target acceptance 0.995, and 12,000 retained draws. It must pass zero divergences, R-hat ≤ 1.01, bulk and tail effective sample size ≥ 400, E-BFMI ≥ 0.3, and maximum score Monte Carlo error ≤ 0.3 display points on the declared calibrated estimands. Version 1.4.1 increases sampling precision for the revised evidence; the model, priors, profile weights, panel and acceptance thresholds are unchanged.

The fixed 16-system panel must retain at least 12 fitted members. Each configured panel system needs independent evidence in every domain and at least two cells in three domains. Publication also requires an accepted joint run and at least one rankable Mixed system.

Sampler checks explicitly monitor Mixed, Agentic and Chat composites as well as domain traits. E-BFMI now uses total Hamiltonian energy, including kinetic energy; the old potential-energy-only ratio was not the specified diagnostic. Empty validation inputs cannot report a passed check, and unavailable rank validation remains null.

Version 1.4 evaluated two candidate structures on the same corrected evidence. Complete model × benchmark groups, including effort settings and source reports, were removed from fitting. Held-out predictions did not reuse their fitted cell or family residuals. The first, shared-factor candidate was rejected on its reserved test: grouped logit RMSE increased from 0.7808 to 0.7949, and predictive CRPS also worsened.

The subsequent equal-unit correlated candidate was examined in three prespecified repeated cross-validation folds. Across 262 unique held-out groups from 70 models, grouped RMSE was 0.610235 for the retained baseline and 0.610382 for the candidate; CRPS was 0.311415 versus 0.312293. All six fits passed their numerical checks, but the candidate did not establish a useful predictive gain. Model-cluster 90% intervals for the metric differences included zero. These overlapping folds were exploratory after inspection of the earlier candidate, not an untouched confirmation. Neither candidate was promoted. Exact reports and selection history are in the [validation audit](https://github.com/MaxiZm/actualanalysis/tree/main/docs/audits/1.4-validation).

These tests assess missing-condition prediction within the available evidence graph, using transformed-scale predictive approximations. Passing sampler diagnostics establishes numerical convergence of monitored quantities, not external validity. Simulation calibration, temporal and whole-family holdouts, adversarial vendor-report refits, PSIS-LOO residuals and benchmark-adjusted exposure gaps remain unestablished. Their configured targets are not passed checks. Profile weight sensitivity, broader conversational usefulness and out-of-sample ranking quality remain open validation work.

## Runtime, sources and reproducibility

Speed is median output tokens per second. TTFT is latency to the first output chunk and may include reasoning time, depending on the provider. Tooltips state the measured model variant, source workload and observation date. Different effort settings can have very different latency. Source-default workload means the page did not pin an input length; it is not presented as a controlled 10k-token measurement.

Context is the source-reported token limit, with exact vendor overrides where available. Price is per million tokens; blended price uses three input tokens for each output token. These are operating characteristics, not capability inputs.

Artificial Analysis runtime, task-cost and CritPt observations are an isolated display-only overlay, excluded from the fit, downloadable snapshots and public bulk APIs. Missing measurements remain missing.

**AA cost per task** is the weighted-average USD spent per task in [Artificial Analysis’s Intelligence Index suite](https://artificialanalysis.ai/methodology/intelligence-benchmarking). It includes input, cache, reasoning and answer token expenditure. It is neither the total cost to run the suite nor a price for an arbitrary user request. Our cost chart compares this externally measured cost with our own selected capability index; the two use different task weights.

The current cost chart uses **AA 4.2** throughout. Older 4.1.1 observations are retained separately and never used as fallback points on a 4.2 chart. A model with no measurement for the selected suite has no cost point; an older suite's cost is not a comparable substitute. The 2026-09-05 audit also rechecked all 113 existing CritPt display measurements against their exact AA configurations.

Runtime and task cost use one exact published configuration per model release, preferring its highest available reasoning setting. If that configuration has no speed or latency measurement, another faster setting is not silently substituted. The source link exposes the configuration. Output throughput is standardized to AA’s tokenization; TTFT measures the first returned token, which can be a reasoning token. The displayed date is retrieval date, because the payload does not publish a measurement window. Registry configuration, raw eligible source evidence, run metadata and accepted summaries are versioned separately from that overlay.

Expected-utility baskets are a separate experimental output. They are evaluated only for explicitly utility-eligible count conditions, use the same intercept-plus-loaded-traits predictor as the fit, and are withheld if required evidence is missing. They do not supply the Chat index.
