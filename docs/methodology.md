# How the index works

**ActualAnalysis Capability Index · version 1.3.2 · calibration edition 2026a**

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

Models whose declared default and maximum effort are equal have one fitted system. Models without a declared dial are currently treated the same way. That is a metadata limitation, not proof that the provider exposes no dial. Lower and intermediate observed effort settings are assigned to the nearest declared class; ambiguous assignment is flagged.

A result preserves its source, date, metric, benchmark version, harness and reasoning settings when reported. Dated source protocols can supply missing fields. Unresolved provenance pins are labelled `metadata_incomplete` and receive 1.5 times the run-noise scale. Explicitly incompatible harnesses, inactive conditions, duplicate lineages and observations without a usable likelihood are excluded.

Version 1.3.2 preserves original evaluation run IDs, reported uncertainty and exact effort configurations. FrontierMath v1 launch scores are excluded from the v2 conditions. Native source rows and confirmed mirrors share a lineage, so copying a result does not add evidence.

Repeated reports of the same result are not independent evidence. The source table keeps audit history, while comparison tables show one selected current result per model and benchmark. For a compact table, source priority is followed by highest explicitly reported effort, latest observation and stable identity. The selected score keeps its own uncertainty; errors are never borrowed from another configuration. Results from different harnesses are not automatically controlled comparisons.

Version 1.3.1 retires SWE-bench Pro Public and LiveCodeBench v6 Pro from fitting and current public exports. GSM8K and standalone AIME 2025 are not included. **MathArena composite remains included**, including its constituent competitions; AIME 2025 is not removed from that composite. The software-code utility basket now contains SWE-rebench, DeepSWE and SciCode Verified.

## Sparse evidence and close comparisons

Missing tests are not counted as failures, and benchmark count is not an explicit score penalty. The model estimates unmeasured domains from its learned relationships and priors, with wider uncertainty. Four strong reasoning results do not establish a gain in code, knowledge or communication. Adding or removing evidence can therefore move a Mixed median in either direction.

For GPT-5.5 and GPT-5.5 Pro, the audit corrected mixed FrontierMath revisions, duplicated observations and missing Pro effort metadata. The matched xhigh results favor Pro on both FrontierMath v2 subsets but slightly favor GPT-5.5 on ARC-AGI-2. The model applies the same method to both; it does not enforce an ordering based on the Pro name. Use uncertainty and matched configurations to interpret small median differences.

## Joint statistical model

A single Bayesian model estimates five correlated capability traits alongside benchmark and source effects:

$$\eta_{sb}=\beta_b+\alpha_b\sum_k\lambda_{bk}Z_{sk}+f_{s,F(b)}+e_{sb}$$

The benchmark loadings $\lambda_{bk}$ are declared in its registry entry and sum to one. Positive discrimination $\alpha_b$ controls how strongly the benchmark separates systems. The intercept $\beta_b$ shifts its expected score. A shared family effect $f$ accounts for related tests, and a Student-t cell effect $e$ allows a model to perform unusually well or poorly on an individual benchmark.

The observation predictor also includes source-domain and protocol-condition offsets. Source reports have partially pooled noise and vendor-report effects. Capability traits use an LKJ(2) correlation prior; trait spreads use LogNormal(0, 0.5). Benchmark intercepts use Normal(0, 3), log discrimination uses Normal(0, 0.6), and cell residuals use four degrees of freedom. The full configured constants appear below.

No benchmark is fixed as an anchor. Priors regularize the raw latent coordinates; the published quantities are identified by draw-wise panel standardization. The optional raw-panel soft pin is **not enabled** in this release.

## Matching a score to its measurement

For counted success rates, the predictor is mapped through chance and ceiling:

$$q=g+(c-g)\operatorname{logistic}(\eta)$$

Single-trial task counts use a binomial likelihood. Repeated tasks use a beta-binomial when per-task counts are available, or a normal approximation with a within-task correlation correction. When only an aggregate mean and a reported SE or confidence interval are available, the transformed continuous likelihood preserves that uncertainty, even if the registry lists a nominal task-set size. It does not round that mean into an invented number of successes. Exact reported counts take precedence. Rates without reported uncertainty use the available-count approximation; an unspecified “±” is not silently interpreted as a standard error. Pass-at-k observations are converted to a per-attempt estimate with uncertainty propagated through the transform.

Elo, time horizons, money and rubric scores require their declared continuous transform and usable uncertainty. A percentage printed next to a metric does not make that metric binomial accuracy.

- **CritPt:** [70 research-level physics challenges](https://github.com/CritPt-Benchmark/CritPt), evaluated by Artificial Analysis over five repeats per question. The displayed result is mean pass@1, not best-of-five. These remain 70 distinct questions, not 350 independent items. The attributed AA observations are visible in Compare and model pages; they do not enter the public fit.
- **ARC-AGI-3:** its [Relative Human Action Efficiency](https://docs.arcprize.org/methodology) is a continuous action-efficiency metric. Version 1.3.0 removes it from fitting and preserves observed scores until a suitable likelihood and uncertainty are available.
- **DeepSWE:** reported scores use 113 software tasks. The source’s unspecified “±” is not treated as a known confidence level. Incomplete dataset and harness revision pins remain flagged; canonical expectations need not reproduce every source row.
- **AutomationBench:** the [600-task public strict pass rate](https://github.com/zapier/AutomationBench) is separate from partial-credit rewards and the harder private leaderboard.
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

The production run uses four NUTS chains, 2,000 warm-up iterations and 3,000 samples per chain, target acceptance 0.98, and 8,000 retained draws. It must pass zero divergences, R-hat ≤ 1.01, bulk and tail effective sample size ≥ 400, E-BFMI ≥ 0.3, and maximum score Monte Carlo error ≤ 0.3 display points on the declared calibrated estimands.

The fixed 16-system panel must retain at least 12 fitted members. Each configured panel system needs independent evidence in every domain and at least two cells in three domains. Publication also requires an accepted joint run and at least one rankable Mixed system.

Passing sampler diagnostics establishes numerical convergence of the monitored quantities, not external validity. Simulation calibration, temporal and family holdouts, adversarial vendor-report refits, PSIS-LOO residuals and benchmark-adjusted exposure gaps have **not been established for this release**. Their configuration targets are future validation criteria, not passed checks. Uncomputed diagnostics are null. Profile weight sensitivity and out-of-sample ranking quality remain open validation work.

## Runtime, sources and reproducibility

Speed is median output tokens per second. TTFT is latency to the first output chunk and may include reasoning time, depending on the provider. Tooltips state the measured model variant, source workload and observation date. Different effort settings can have very different latency. Source-default workload means the page did not pin an input length; it is not presented as a controlled 10k-token measurement.

Context is the source-reported token limit, with exact vendor overrides where available. Price is per million tokens; blended price uses three input tokens for each output token. These are operating characteristics, not capability inputs.

Artificial Analysis runtime, task-cost and CritPt observations are an isolated display-only overlay, excluded from the fit, downloadable snapshots and public bulk APIs. Missing measurements remain missing.

**AA cost per task** is the weighted-average USD spent per task in [Artificial Analysis’s Intelligence Index suite](https://artificialanalysis.ai/methodology/intelligence-benchmarking). It includes input, cache, reasoning and answer token expenditure. It is neither the total cost to run the suite nor a price for an arbitrary user request. Our cost chart compares this externally measured cost with our own selected capability index; the two use different task weights.

Runtime and task cost use one exact published configuration per model release, preferring its highest available reasoning setting. If that configuration has no speed or latency measurement, another faster setting is not silently substituted. The source link exposes the configuration. Output throughput is standardized to AA’s tokenization; TTFT measures the first returned token, which can be a reasoning token. The displayed date is retrieval date, because the payload does not publish a measurement window. Registry configuration, raw eligible source evidence, run metadata and accepted summaries are versioned separately from that overlay.

Expected-utility baskets are a separate experimental output. They are evaluated only for explicitly utility-eligible count conditions, use the same intercept-plus-loaded-traits predictor as the fit, and are withheld if required evidence is missing. They do not supply the Chat index.
