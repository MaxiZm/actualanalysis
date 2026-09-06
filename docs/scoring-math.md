# ACI scoring math

Method **1.4.0** retains the correlated five-domain formula used in 1.3.2. It corrects reasoning metadata and configuration aliases, keeps paired posterior probabilities for preliminary systems, and strengthens numerical and predictive validation. Two alternative trait structures were evaluated and were not promoted. This release does not claim a predictive improvement from changing the formula.

The normative explanation and publication rules are in [methodology.md](methodology.md), executable constants are in `data/index-config.yaml`, and candidate selection records are in the [validation audit](audits/1.4-validation/). Historical specifications describe their named releases, not the current contract.

Version **1.4.3** changes observation assignment: `unreported_effort_policy: maximum` sends a missing source setting to the maximum system, preserving the missing source field and marking configuration uncertainty. Explicit effort settings keep their existing assignments. This policy changes which system receives evidence; it does not change benchmark scores, domain weights or the capability likelihood. Historical registries without the policy retain the standard fallback.

## Traits, effort and measurement

Let $m$ be a model snapshot, $s$ its effort-class system, $k$ a capability domain and $b$ a benchmark condition. In the retained `correlated` structure:

$$\epsilon_m\sim\mathcal N_5(0,I),\qquad \Omega\sim\operatorname{LKJ}(2),\qquad \sigma_k\sim\operatorname{LogNormal}(0,0.5)$$

$$Z_m^{std}=\operatorname{diag}(\sigma)L_\Omega\epsilon_m,\qquad L_\Omega L_\Omega^T=\Omega$$

Maximum-effort systems share the corresponding standard-effort traits and add signed domain-specific increments:

$$Z_{mk}^{max}=Z_{mk}^{std}+\delta_{mk},\qquad \delta_{mk}=\mu_\delta+s_{\delta k}h_{mk},\qquad h_{mk}\sim\mathcal N(0,1)$$

The priors are $\mu_\delta\sim\mathcal N(0.30,0.30)$ and $s_{\delta k}\sim\operatorname{HalfNormal}(0.30)$. Fixed-effort systems receive no increment. These gains remain in raw latent units. There is no imposed monotonicity by model name, release date, provider or Pro designation.

A cell predictor combines traits with the condition's declared loadings:

$$\eta_{sb}=\beta_b+\alpha_b\sum_k\lambda_{bk}Z_{sk}+f_{s,F(b)}+e_{sb}$$

Loadings sum to one, $\beta_b\sim\mathcal N(0,3)$, $\log\alpha_b\sim\mathcal N(0,0.6)$, and the cell residual is Student-t with four degrees of freedom and a condition-specific scale. The family effect $f$ is shared by related conditions for a system. Source-domain and protocol-condition offsets are added at the observation level, alongside run noise.

Counts use the declared chance/ceiling map and count likelihood; aggregate means with reported uncertainty use their continuous transformed likelihood. Source provenance, task repetition, measurement scale and lineage therefore matter. A result cannot be made independent by copying it into a second source file.

Raw domain spreads, correlations, source effects and effort increments can be weakly identified with sparse evidence. Fixed cross-loadings do not permit arbitrary separate rescaling of each domain without changing the likelihood. Priors regularize these coordinates; display calibration does not remove their assumptions.

## Display scales and comparisons

For each posterior draw, standardize domain traits on the fixed calibration panel $P$, combine the declared profile weights and standardize the resulting composite on the same panel:

$$\widetilde Z_{sk}=\frac{Z_{sk}-\mu_{Pk}}{\sigma_{Pk}},\qquad C_{su}=\sum_k w_{uk}\widetilde Z_{sk},\qquad I_{su}=50+10\frac{C_{su}-\mu_{Pu}}{\sigma_{Pu}}$$

Sample standard deviations use a numerical floor of 0.05. Mixed uses equal weights across five domains. Agentic uses 0.6 agentic, 0.3 software and 0.1 reasoning. Chat uses 0.1 software, 0.2 reasoning, 0.3 knowledge and 0.4 communication/professional. These are declared product weights, not empirically established universal utility weights.

The display reports posterior medians and 90% intervals. Preliminary systems stay visible and interleaved by median; unavailable evidence is not zero. Eligibility gates control published rank distributions, not whether a fitted median or paired probability exists.

Pairwise probabilities use joint draws: $P(I_{au}>I_{bu})$ preserves posterior dependence between systems. This is the directional probability shown in Compare. The posterior summary separately evaluates $P(I_{au}>I_{bu}+1)$ and marks its practical-ordering diagnostic unresolved unless one direction exceeds the one-point margin with at least 90% probability. A high probability of any gain does not necessarily establish a practically large gain. Preliminary status does not turn an uncomputed probability into a tie or remove an available paired comparison.

For benchmark display parameters, let $m_b$ and $s_b$ be the panel mean and standard deviation of the benchmark's trait projection in a draw. Calibrated location is $(-\beta_b/\alpha_b-m_b)/s_b$ and slope is $\alpha_b s_b$. Observed-versus-expected charts remove the fitted cell residual and exclude source-specific offsets; they are in-sample diagnostics, not validation on unseen evidence.

Expected-utility baskets are separate experimental estimands. Only utility-eligible conditions enter them; they do not determine Mixed, Agentic or Chat indexes.

## What validation established

The shared-capability candidate `general_specific` improved development results but failed its reserved test: grouped logit RMSE increased from 0.7808 to 0.7949 and CRPS worsened. It was rejected.

A later `correlated_unit` candidate retained free correlations while fixing marginal domain units and changing the effort parameterization. Its three prespecified repeated folds were exploratory after inspection of the earlier candidate. Across 262 unique held-out model-condition groups and 70 models, grouped RMSE was 0.610235 for the baseline and 0.610382 for the candidate; CRPS was 0.311415 versus 0.312293. All six fits passed numerical checks, but no useful predictive improvement was established; model-cluster 90% intervals for the metric differences included zero. This candidate was also not promoted.

Both evaluations held out complete model × condition groups, including effort settings and source reports. Predictions did not reuse fitted residuals from held-out cells or families. Metrics used transformed-scale predictive approximations. Their uncertainty and selection history matter; later overlapping folds are not untouched confirmation.

Production inference monitors calibrated Mixed, Agentic, Chat and domain quantities. E-BFMI uses total Hamiltonian energy; missing diagnostics cannot pass. Unit tests establish implementation behavior, and sampler checks establish numerical convergence of monitored quantities. Neither establishes that the index captures all real-world conversational or professional performance. Temporal generalization, whole-family extrapolation, posterior-rank simulation calibration and weight sensitivity remain open work.

## Implementation map

- `packages/ingest/src/observation-annotations.ts` and registry aliases preserve source protocols and reasoning configuration before deduplication.
- `packages/scoring/src/aci12.ts` prepares observations, assigns effort classes, deduplicates lineage, checks connected evidence and audits panel coverage.
- `packages/scoring/src/aci12-input.ts` and `numpyro.ts` map reviewed evidence into the indexed joint-model input and invoke Python.
- `packages/scoring/python/aci12/model.py` defines the likelihood, retained correlated prior and explicitly experimental candidates.
- `packages/scoring/python/aci12/runner.py` stores the posterior and enforces numerical thresholds on displayed estimands.
- `packages/scoring/python/aci12/summarize.py` derives profiles, paired probabilities, eligible rank distributions and evidence diagnostics. Variance reduction and family concentration are approximations, as described in the methodology.
- `packages/scoring/python/aci12/validate_predictive.py` runs grouped held-out comparisons. `packages/scoring/src/validation.ts` evaluates supplied validation results without inventing missing measurements.

Legacy Huber, benchmark-weight, anchor and bootstrap helpers remain for historical experiments. `runScoring` rejects current Bayesian method versions, so those helpers cannot publish a current release accidentally.
