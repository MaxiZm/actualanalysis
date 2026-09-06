# ActualAnalysis 1.5.0 proposal: partial pooling across related model releases

**Status:** theoretical candidate; not implemented, fitted, validated, or approved for publication.  
**Draft date:** 2026-09-06; revision 2 following methodological review.  
**Reference baseline:** published method 1.4.3, with evidence through 2026-09-05.  
**Proposed change:** replace the independent standard-effort capability prior for eligible related releases with a conditional predecessor prior.  
**Intended outcome:** improve capability estimation and uncertainty calibration when related releases have unequal benchmark coverage.  
**Scope:** this document specifies two sibling prior models and an evaluation design. Neither has been implemented or evaluated. The [experiment-lock draft](aci-1.5.0-related-release-experiment-lock.md) records the required decisions and unresolved prerequisites; it is not an executed preregistration.

**Revision 2:** one canonical non-centered generative form; root-scale and raw-unit siblings; explicit identification and effort risks; mandatory calibration accounting; Gemini excluded from promotion evidence; domain-transfer validation and hard diversity gates.

## 1. Motivation

ActualAnalysis estimates five capability domains from an incomplete collection of benchmark observations. The Mixed, Agentic, and Chat indexes are transformations of the same joint posterior.

Under 1.4.3, each release receives a separate zero-centered population prior, conditional on shared domain scales and correlations. A sparsely evaluated release can therefore have an unmeasured domain pulled toward the population distribution even when a documented related release has strong evidence in that domain.

This behavior is mathematically compatible with Bayesian inference. Whether it gives useful estimates depends on whether the population prior is a suitable starting point for that release. If related releases tend to retain many capabilities, explicitly representing their relationship may improve the estimates.

Gemini 3.7 Flash and Gemini 3.8 Flash prompted this investigation. That makes the pair a development example, not independent evidence that the proposed prior is needed or correct. The observed ordering is unresolved, and either genuine domain differences or effort differences could be responsible. Section 17 preserves the baseline facts without specifying a desired candidate outcome. The pair and its connected release component are excluded from promotion metrics.

The proposal introduces this assumption:

> For a documented, eligible predecessor–successor relationship, the successor's standard-effort capabilities initially resemble the predecessor's, with uncertain positive or negative changes in each domain. The observations update both releases jointly.

This is an assumption about related releases. It must be tested across improvements, regressions, and unrelated model pairs. It is not a rule requiring newer models to rank higher.

## 2. What changes and what remains the reference baseline

The experiment compares the no-edge baseline with two sibling release priors: A uses changes relative to root-domain scales; B uses changes in raw latent units. Both use one reviewed relationship registry and the same retained measurement model. This tests both the transfer hypothesis and the substantive choice of units. Prior-predictive work precedes selection of a confirmatory candidate.

| Component | Candidate specification |
|---|---|
| Capability domains | Same five domains as 1.4.3 |
| Releases without an eligible parent | Retain the baseline multivariate Normal prior |
| Releases with an eligible parent | Use a conditional Student-t change prior |
| Maximum-effort gains | Retain the baseline signed effort model |
| Benchmark conditions and loadings | Retain the frozen baseline registry |
| Benchmark family effects and cell residuals | Retain the baseline model |
| Source effects and run discrepancy | Retain the baseline model |
| Observation admission, effort assignment, and transforms | Retain the baseline policies for the primary comparison |
| Calibration panel and profile weights | Retain the frozen baseline definitions |
| Pairwise probabilities | Continue to use paired draws from one joint posterior |
| Direct evidence counts | Count only the selected system's own admitted observations |
| Publication | Candidate outputs remain experimental until validation and gate review are complete |

Separate proposals concerning unknown-effort mixtures, alternative likelihoods, domain loadings, source selection, and evidence-gate redesign are outside this primary experiment. They must not be introduced silently into the same candidate comparison.

## 3. Notation and distribution conventions

Normal distributions use standard deviation as their second argument. Gamma distributions use shape and rate. Student-t distributions use degrees of freedom, location, and **scale**; their scale is not generally their standard deviation.

| Symbol | Meaning |
|---|---|
| \(m\) | Model release |
| \(s\) | Release evaluated at an effort-class system |
| \(k\in\{1,\ldots,5\}\) | Capability domain |
| \(b\) | Benchmark condition |
| \(F(b)\) | Benchmark family containing condition \(b\) |
| \(p\) | Source protocol |
| \(i\) | Observation |
| \(G\) | Fixed, reviewed directed forest of release relationships |
| \(\pi(m)\) | Parent release of non-root release \(m\) |
| \(\mathcal R\) | Roots: releases without an eligible parent |
| \(\mathcal C\) | Children: releases with an eligible parent |
| \(Z_m^{\mathrm{std}}\) | Five-dimensional standard-effort capability vector |
| \(q_{mk}\) | Dimensionless unit-scale Student-t innovation, derived from sampled Normal/Gamma variables |
| \(W_{mk}\) | Raw standard-effort child-minus-parent change |
| \(\Delta_{mk}=W_{mk}/\sigma_k\) | Derived change relative to the root-domain scale |
| \(\delta_{mk}\) | Maximum-effort increment within a release, in raw latent units |
| \(\sigma_k\) | Root-population scale for domain \(k\) |
| \(\tau_k\) | Candidate A change scale in dimensionless root-SD multiples |
| \(\tau_k^{\mathrm{raw}}\) | Candidate B change scale in raw latent units |
| \(\chi_k\) | Effective raw edge scale: \(\sigma_k\tau_k\) in A; \(\tau_k^{\mathrm{raw}}\) in B |
| \(\Omega\) | Correlation matrix of root capabilities |
| \(\mathcal D\) | Admitted observations |
| \(\Theta\) | All unknown quantities in the joint model |

The domains, in implementation order, are:

1. Agentic.
2. Software and code.
3. Reasoning.
4. Knowledge and information.
5. Communication and professional work.

The distinction between \(W\) and \(\delta\) is essential: the first represents a raw change between releases; the second represents a raw effort change within one release. \(q\) is dimensionless, and \(\Delta=W/\sigma\) is a derived reporting quantity. Section 5 is the sole generative contract.

## 4. Relationship eligibility

### 4.1 The relationship graph

The primary candidate conditions on a fixed directed forest \(G\). Every release has at most one parent, and the graph has no cycles. A root has no eligible parent; a parent may have multiple children.

The graph is selected using documented model relationships and configuration comparability. It is not inferred by searching for edges that produce preferred rankings.

For an edge \(\pi(m)\rightarrow m\), require:

1. Documentation supports treating the releases as related revisions or successors for the purpose of capability transfer. The relationship need not imply identical weights, architecture, or training data.
2. Both endpoints refer to identifiable model releases rather than a moving alias containing several unknown versions.
3. Their standard-effort reference classes are sufficiently comparable to justify a prior on their difference.
4. The parent precedes the child in a documented release or revision ordering. An unresolved ordering does not establish an edge.
5. The relationship and its rationale are recorded before candidate evaluation outcomes are inspected.

A shared provider, similar product name, adjacent version number, or higher benchmark score is insufficient on its own. A distillation, modality expansion, architecture change, or changed default effort may weaken the transfer assumption and requires explicit review.

If documentation is insufficient or a parent is ambiguous, the primary candidate leaves the release as a root. Multiple-parent and probabilistically uncertain graphs are separate future candidates.

For the initial retrospective experiment, eligible endpoints belong to the frozen release catalog. The intended primary graph has **maximum depth two edges**. Traverse documented chronological relationships before inspecting outcomes; if the next documented edge would exceed depth two, mark that edge excluded by the depth policy and make its child a new root. Archive every excluded edge. This creates an explicit, testable truncation assumption; do not silently reconnect an ancestor. Deeper chains and unmeasured historical trunks are stress tests or separately declared candidates, not primary inputs.

### 4.2 Registry contract

Each relationship record should include:

| Field | Purpose |
|---|---|
| Parent release ID | Exact parent identity |
| Child release ID | Exact child identity |
| Relationship type | Documented revision, successor, or other approved category |
| Evidence references | Sources supporting the relationship |
| Documentation available-at time | Supports prospective replay without future metadata |
| Review rationale | Why capability transfer is plausible |
| Standard-effort compatibility | How the two reference effort classes compare |
| Known material changes | Reasons transfer may fail |
| Eligibility decision and edition | Reproducible graph construction |

Model-development relationships are distinct from observation lineages. A release edge expresses a prior assumption; an observation lineage identifies duplicated or dependent evaluation evidence. Neither replaces the other.

### 4.3 Gemini relationship status

The Gemini pair motivated model selection after its outcomes were inspected. This document does **not** establish its relationship eligibility. Any documented edge may be used in a labeled development/probe fit, but neither this pair nor its connected release component contributes to confirmatory promotion metrics or change-scale tuning. Future documentation-only graph review does not erase prior exposure to the anomaly. Section 18 specifies a separate confirmatory graph and exclusion record.

## 5. Capability prior: one canonical generative form

### 5.1 Root hyperparameters and sampled root coordinates

Both siblings retain:

\[
\Omega\sim\operatorname{LKJ}(2),\qquad
L_\Omega L_\Omega^{\mathsf T}=\Omega,\qquad
\sigma_k\sim\operatorname{LogNormal}(0,0.5),\qquad
D_\sigma=\operatorname{diag}(\sigma).
\]

Each root has a sampled coordinate \(\epsilon_r\sim\mathcal N_5(0,I)\). Its trait vector is deterministic under the canonical construction in 5.3. The induced root covariance is \(\Sigma_0=D_\sigma\Omega D_\sigma\); there is no additional density on the deterministic root trait.

### 5.2 Sibling candidates and units

| Quantity | A: root-scale changes | B: raw-unit changes |
|---|---|---|
| Change-scale prior | \(\tau_k\sim\operatorname{HalfNormal}(h_A)\) | \(\tau_k^{\mathrm{raw}}\sim\operatorname{HalfNormal}(h_B)\) |
| Hyperprior units | \(h_A\): dimensionless root-SD multiples | \(h_B\): raw latent units |
| Effective raw edge scale | \(\chi_k=\sigma_k\tau_k\) | \(\chi_k=\tau_k^{\mathrm{raw}}\) |
| Initial development reference | \(h_A=0.35\), dimensionless root-SD multiples | \(h_B=0.35\), raw latent units |

The equal initial numbers are bookkeeping reference values, **not matched prior strength**. Both require prior-predictive justification before any confirmatory lock. At a root-scale median of one, the raw scales may look numerically similar, but their joint distributions and coupling to inferred \(\sigma\) differ.

Five scales enter each sibling's joint posterior. They have independent priors with a common fixed hyperprior scale; there is no further learned hierarchy pooling those five scales. A shared prior family and joint computation do not establish that each domain scale is identified by data.

A couples allowable release movement to root-population heterogeneity. B removes that explicit multiplication but remains dependent on the raw-coordinate identification and discrimination priors of the measurement model. B is a different scientific prior, not an invariant correction or a universally preferable parameterization.

### 5.3 Canonical non-centered construction

For each child-domain pair, sample \(u_{mk}\sim\mathcal N(0,1)\) and \(\kappa_{mk}\sim\operatorname{Gamma}(2,2)\), independently conditional on the declared hyperparameters. Gamma uses shape and **rate**.

**The following is the single canonical generative statement for either sibling:**

\[
\boxed{
\begin{aligned}
Z_r^{\mathrm{std}}&=D_\sigma L_\Omega\epsilon_r,
&&r\in\mathcal R,\\
q_{mk}&=u_{mk}/\sqrt{\kappa_{mk}},
&&m\in\mathcal C,\\
\chi_k&=
\begin{cases}
\sigma_k\tau_k,& A,\\
\tau_k^{\mathrm{raw}},& B,
\end{cases}\\
W_{mk}&=\chi_k q_{mk},\\
Z_{mk}^{\mathrm{std}}&=Z_{\pi(m),k}^{\mathrm{std}}+W_{mk}.
\end{aligned}
}
\]

Construct traits in topological order. \(Z\), \(q\), \(W\), and the reporting quantity \(\Delta=W/\sigma\) are deterministic. Only the declared priors on sampled coordinates and hyperparameters, plus the observation likelihood, enter the sampling density. Do not multiply a derived change by \(\sigma\) again; its raw scale is already in \(\chi\).

The induced conditional law is \(W_{mk}\sim t_4(0,\chi_k)\). This identity explains the distribution; it is **not an additional sampling instruction**. A child has no independent Normal root prior in addition to its edge.

### 5.4 Centered equivalence and Jacobians

A centered implementation with \(Z_m\) as a sampled parameter and a correctly normalized conditional Student-t density can represent the same probability model. The previous centered equation was not a different statistical model. Mixing that density with the canonical coordinate priors would change the model or double-count the prior.

No additional change-of-variables term is needed when sampling the canonical Normal/Gamma coordinates and deterministically transforming them to traits. If a future implementation instead expresses a centered density in new coordinates, the appropriate Jacobian must be included. For the marginal edge transformation \(W=\chi q\), with \(\chi>0\), the joint transformation preserving the scale has determinant \(\prod_{mk}\chi_k\). Thus evaluating the centered edge density at \(W=\chi q\) as a density in \(q\) requires the corresponding sum of log scales. This explanatory identity is not another term in the canonical sampler. [Stan's change-of-variables guidance](https://mc-stan.org/docs/stan-users-guide/reparameterization.html) distinguishes deterministic transformations from transformed densities.

### 5.5 Independence of change directions

Conditional on scales, \(q_{mk}\) is independent across edges and domains. The model permits simultaneous gains, but has no prior correlation that automatically transfers evidence for a software gain into a positive reasoning or knowledge change. Any posterior connection arises through shared measurements, parent uncertainty, effort, or learned global quantities.

Correlated changes could improve prediction if supported by data. That is an empirical hypothesis, not established by correlation of capability levels. A correlated-change or common-change-factor model is deferred as a separate candidate; a full additional correlation matrix is not silently added to A or B.

## 6. Interpretation, identification, and prior calibration

### 6.1 Signed changes and conditional dispersion

For fixed scales, \(q\) has a Student-t distribution with four degrees of freedom and unit scale. Its mean is zero and its variance is two. Consequently:

\[
\mathbb E[W_{mk}\mid\chi_k]=0,\qquad
P(W_{mk}>0\mid\chi_k)=\tfrac12,\qquad
\operatorname{Var}(W_{mk}\mid\chi_k)=2\chi_k^2.
\]

The raw change SD is \(\sqrt2\chi_k\). In A this equals \(\sqrt2\sigma_k\tau_k\); in B it equals \(\sqrt2\tau_k^{\mathrm{raw}}\). The scales in 5.2 are not display points.

For A, a fixed \(\tau_k=0.35\) in dimensionless root-SD multiples gives an SD of approximately 0.495 root-SD multiples. A hyperprior \(h_A=0.35\) in the same units instead has \(\mathbb E[\tau_k]=h_A\sqrt{2/\pi}\) and \(\mathbb E[\tau_k^2]=h_A^2\). At fixed \(\sigma\), integrating over this hyperprior gives \(\operatorname{Var}(W)=2\sigma_k^2h_A^2\). The average conditional SD and the marginal SD are different summaries; multiplying a median scale by a mean scale is only an illustration, not a prior-predictive calculation. B has the corresponding raw-unit expression \(2h_B^2\).

### 6.2 Why change scales can be weakly identified

Observed parent–child discrepancies can be explained by trait changes, effort differences, family effects, cell residuals, source effects, or sampling/run error. The available edges do not supply independent, directly observed changes for every domain. Several edges in one tree, or many rows from one protocol, are not independent replications of an innovation distribution.

For two variable-effort relatives, conditional on the global scales, the prior variance of the maximum-effort difference in one domain includes:

\[
\operatorname{Var}(W_{mk}+\delta_{mk}-\delta_{\pi(m),k})
=2\chi_k^2+2s_{\delta k}^2.
\]

This holds for the primary prior's conditionally independent innovation and effort coordinates. Maximum-only outcomes often constrain their sum much better than either component. Standard/maximum observations at compatible configurations are needed to separate them. Additional measurement effects introduce further ambiguity.

Report prior and posterior distributions of \(\tau\), \(\chi\), \(\sigma\), effort scales, and their posterior dependence, stratified by domain. Report informative edges, distinct trees, matched effort settings, and domain coverage. Do not describe a narrow conditional posterior as proof of identification. Hyperprior and edge-removal sensitivity are necessary, and an uninformative domain scale must be labeled as substantially prior-dependent.

### 6.3 Root-scale coupling is a scientific assumption

In A, a more heterogeneous root population permits larger raw successor changes through \(\chi=\sigma\tau\). If root knowledge spread is large, the same dimensionless change prior is broader in raw knowledge units. This may or may not describe version changes well. In B, root heterogeneity and raw edge scale have separate priors, although the likelihood can still correlate them in the posterior.

Both variants inherit weak raw-scale identification from the latent measurement model. Raw trait changes across independent fits are coordinate-dependent; display normalization does not resolve all cross-loading and scale assumptions. Section 13 specifies what comparisons can be reported responsibly.

### 6.4 Prior predictive justification before confirmatory outcomes

The initial values \(h_A=0.35\) in dimensionless root-SD multiples and \(h_B=0.35\) in raw latent units are **unjustified development references until these checks are run**. Use a declared historical development set of documented pairs excluding the motivating Gemini component. No confirmatory child outcomes may enter this process.

Generate full prior predictive simulations with the graph, root scales, innovations, effort, and the fixed panel definition. Record raw changes, derived root-relative changes, predicted benchmark changes, and draw-wise domain/profile score differences. Also inspect calibration-floor activation and graph depth. Translate the prior into display differences using the simulated panel for each draw, not a fitted Gemini panel SD.

A complementary check may condition on a historical training posterior and simulate future children with unobserved innovations. Label that as a historical posterior-predictive forecast, not an unconditional prior predictive. Keep its training evidence separate from confirmation. [Stan's predictive-check guidance](https://mc-stan.org/docs/stan-users-guide/posterior-predictive-checks.html) explains these distinct replications.

Use prior predictive and historical development evidence to justify or revise the scales and choose a confirmatory candidate before opening the test. Archive every attempted setting and the selection rule. Outcome-sensitivity runs after a lock are descriptive and cannot be used to retune against the same test.

### 6.5 Parent uncertainty and graph depth

Before observing a child's or its descendants' outcomes, conditional on all global scales and permissible other evidence:

\[
\operatorname{Var}(Z_{mk}^{\mathrm{std}}\mid\mathcal D_{\mathrm{available}},\text{globals})
=\operatorname{Var}(Z_{\pi(m),k}^{\mathrm{std}}\mid\mathcal D_{\mathrm{available}},\text{globals})+2\chi_k^2.
\]

The innovation must remain unobserved and independent of that evidence under the stated conditioning. This is not a general full-posterior variance decomposition after child outcomes arrive. Marginalizing uncertain global parameters adds further uncertainty.

Before observing outcomes, at depth \(d\):

\[
\operatorname{Cov}(Z_m^{\mathrm{std}}\mid\text{globals})
=\Sigma_0+2d\operatorname{diag}(\chi_1^2,\ldots,\chi_5^2).
\]

For A this is the previously stated \(\Sigma_0+2dD_\sigma\operatorname{diag}(\tau^2)D_\sigma\). For B the added covariance is \(2d\operatorname{diag}((\tau^{\mathrm{raw}})^2)\). Roots retain the interpretation of \(\sigma,\Omega\); they are not the marginal scales and correlations of all graph nodes. The primary graph's depth cap is two; deeper graphs are explicit stress scenarios.

### 6.6 Tail flexibility, relationship errors, and directional drift

Student-t tails allow large signed changes; they do not provide a false-edge detector. No relationship indicator or independent-root mixture appears in A or B. Agreeing observations in some domains do not validate transferring a different unmeasured domain. A false edge can still produce overconfident borrowing.

The change-scale prior is shared across eligible providers and relationship types. Its exchangeability assumption may fit some groups poorly. Zero-centered innovations can also be misspecified when selected successors have systematic positive drift. Inspect signed change distributions across **all** development edges and held-out predictive residuals by provider, relationship type, and domain. A posterior with mostly positive changes is a prompt to test the zero-drift predictive assumption, not itself a proof that the prior is wrong or calibrated. Correlated changes, drift, provider-specific scales, and false-edge mixtures remain separate hypotheses.

### 6.7 Posterior feedback

Although the generative graph has a direction, evidence can update parents and siblings through joint inference. Future child data must be excluded from historical forecasts. Edge deletion also refits global scales; its result cannot be attributed solely to a local borrowing link.

## 7. Effort model

Retain the 1.4.3 signed effort model:

\[
\mu_\delta\sim\mathcal N(0.30,0.30),\qquad
s_{\delta k}\sim\operatorname{HalfNormal}(0.30),\qquad
h_{mk}\sim\mathcal N(0,1),
\]

\[
\delta_{mk}=\mu_\delta+s_{\delta k}h_{mk},
\qquad
Z_{mk}^{\max}=Z_{mk}^{\mathrm{std}}+\delta_{mk}.
\]

For a fixed or pooled-effort release, the system uses \(Z_m^{\mathrm{std}}\) and no increment is applied, including when the identifier ends in `@max-common`.

For two variable-effort related releases:

\[
Z_{mk}^{\max}-Z_{\pi(m),k}^{\max}
=W_{mk}+\delta_{mk}-\delta_{\pi(m),k}.
\]

The relationship prior concerns standard-effort capabilities. It does not force equal maximum-effort capabilities or equal effort gains. This distinction matters for the Gemini example, where the motivating comparisons are at maximum effort.

For the primary comparison, retain baseline effort assignment: missing effort maps to assumed maximum for variable-effort releases, explicit settings keep their documented mappings, and incomplete configuration metadata retains its noise adjustment. No missing setting is converted into a verified maximum setting by the relationship model.

If the standard-effort reference is not comparable across a proposed edge, omit that edge. Equal names such as medium or high do not establish equal token budgets or equal effective computation. The estimand remains capability at a documented configuration, not capability per unit compute. Record actual effort settings, available token/latency evidence, missing-effort assignments, and whether the relationship is being justified at standard or maximum effort. Linking a separately defined common compute budget would require another parameterization.

For Gemini, Google documents higher token use on some complex tasks and configurable thinking levels. This supports an **effort-comparability concern**, not a measured decomposition into capability change and effort gain. Preserve this concern in eligibility review and the dedicated unchanged-standard-trait / shifted-effort stress scenario. [Google migration guidance](https://ai.google.dev/gemini-api/docs/latest-model).

## 8. Benchmark response model

For each condition, retain fixed nonnegative loadings:

\[
\lambda_{bk}\ge0,\qquad\sum_{k=1}^{5}\lambda_{bk}=1.
\]

For system \(s\) and benchmark condition \(b\):

\[
\eta_{sb}
=\beta_b+\alpha_b\sum_k\lambda_{bk}Z_{sk}
+f_{s,F(b)}+e_{sb}.
\]

The priors remain:

\[
\beta_b\sim\mathcal N(0,3),\qquad
\log\alpha_b\sim\mathcal N(0,0.6),
\]

\[
\tau_{\mathrm{family}}\sim\operatorname{HalfNormal}(0.25),\qquad
f_{sF}=\tau_{\mathrm{family}}v_{sF},\qquad
v_{sF}\sim\mathcal N(0,1),
\]

\[
\tau_b^{\mathrm{cell}}\sim\operatorname{HalfNormal}(0.30),\qquad
e_{sb}\sim t_4(0,\tau_b^{\mathrm{cell}}).
\]

The release-change scale \(\tau_k\), family scale \(\tau_{\mathrm{family}}\), and cell scale \(\tau_b^{\mathrm{cell}}\) are different parameters. The family effect remains indexed by effort-class system, as in the baseline. The proposed release edge does not share family or cell residuals automatically.

## 9. Source effects and run discrepancy

For observation \(i\), with protocol \(p_i\), declared primary domain \(d_i\), and provenance \(v_i\in\{\mathrm{ind},\mathrm{self}\}\):

\[
\ell_i=\eta_{s_i b_i}+a_{p_i d_i}+\xi_{p_i b_i}.
\]

Retain:

\[
A_{\mathrm{ind}}\sim\operatorname{HalfNormal}(0.15),\qquad
A_{\mathrm{self}}\sim\operatorname{HalfNormal}(0.25),
\qquad
\mu_{\mathrm{self},k}\sim\mathcal N(0.15,0.15),
\]

\[
a_{pk}=
\begin{cases}
A_{\mathrm{ind}}z_{pk}, & p\text{ independently reported},\\
\mu_{\mathrm{self},k}+A_{\mathrm{self}}z_{pk}, & p\text{ self-reported},
\end{cases}
\qquad z_{pk}\sim\mathcal N(0,1).
\]

For protocol-condition interactions:

\[
X_k\sim\operatorname{HalfNormal}(0.20),\qquad
\xi_{pb}=X_{d^*(b)}z_{pb},\qquad z_{pb}\sim\mathcal N(0,1),
\]

where \(d^*(b)=\arg\max_k\lambda_{bk}\), with ties resolved by the existing domain order.

For run discrepancy:

\[
\bar\omega_v\sim\operatorname{HalfNormal}(0.30),\qquad
\zeta_{vk}\sim\mathcal N(0,0.40),\qquad
\omega_{vk}=\bar\omega_v\exp(\zeta_{vk}),
\]

\[
\widetilde\omega_i=M_i\omega_{v_i d_i},\qquad
M_i=
\begin{cases}
1.5,&\text{incomplete or approximate configuration metadata},\\
1,&\text{otherwise}.
\end{cases}
\]

The multiplier changes the run-discrepancy standard deviation. It is not a direct multiplier on the final score interval.

## 10. Observation likelihoods and transforms

The development reference is the frozen 1.4.3 accepted input: 924 observations, 110 releases, 131 systems, and 19 fitted conditions. Its likelihood counts are 464 transformed accuracy/judge means, 154 other continuous observations, 272 single-trial count observations, and 34 repeated-total observations. Validation fits use explicitly recorded subsets, and confirmation excludes the motivating Gemini component as specified in section 18. For every comparison, the baseline and sibling candidates receive exactly the same permitted observations.

### 10.1 Continuous measurements

For a prepared transformed measurement \(y_i\) and sampling variance \(V_i\):

\[
y_i\sim\mathcal N\!\left(\ell_i,\sqrt{V_i+\widetilde\omega_i^2}\right).
\]

The baseline transformations are retained:

| Measurement | Transformed location | Prepared sampling variance |
|---|---|---|
| Accuracy or judge mean \(r_i\), in fractions | \(p_i=\operatorname{clip}((r_i-g_b)/(c_b-g_b),0.005,0.995)\); \(y_i=\operatorname{logit}(p_i)\) | \([\mathrm{SE}(r_i)/((c_b-g_b)p_i(1-p_i))]^2\) |
| Elo/Arena rating \(R_i\) | \((R_i-R_{0b})\ln(10)/400\) | \([\mathrm{SE}(R_i)\ln(10)/400]^2\) |
| Time horizon \(t_i\), minutes | \((\log_2 t_i-8)/2\) | \([\mathrm{SE}(t_i)/(2t_i\ln2)]^2\) |
| Aggregate balance \(B_i\), with reported SE | \(\log_2(B_i/63000)\) | \([\mathrm{SE}(B_i)/(B_i\ln2)]^2\) |

A reported central interval \([L,U]\) is converted with \(\mathrm{SE}=(U-L)/(2z)\), using \(z=1.64485362695\) for 90% and \(z=1.95996398454\) for 95%. A time-horizon interval instead gives:

\[
V_i=\left(\frac{\log_2 U-\log_2 L}{4z}\right)^2.
\]

When at least three individual balances are supplied, retain the baseline log-median statistic and the variance of 1,000 seeded bootstrap log-median draws. This candidate does not resolve the separate issue of comparing mean and median balance statistics.

Only the already configured, flagged fallback variances for Elo/time are retained, at twice their configured value. Missing uncertainty does not receive a new universal fallback.

### 10.2 Single-trial counts

For a run deviation \(r_i^{\mathrm{run}}\sim\mathcal N(0,1)\):

\[
q_i=g_{b_i}+(c_{b_i}-g_{b_i})
\operatorname{logistic}(\ell_i+\widetilde\omega_i r_i^{\mathrm{run}}),
\]

\[
x_i\sim\operatorname{Binomial}(n_i,q_i).
\]

Retain the baseline numerical clipping of \(q_i\) to \([10^{-6},1-10^{-6}]\). Explicit counts retain precedence. The baseline reconstruction of a count from a rounded mean and denominator remains an approximation; this experiment does not alter it.

### 10.3 Repeated totals

For \(n_i\) tasks, \(K_i\) trials per task, and \(N_i=n_iK_i\):

\[
D_i=1+(K_i-1)\rho_{b_i},
\]

\[
x_i\sim\mathcal N\!\left(
N_iq_i,
\sqrt{\max\{N_iq_i(1-q_i)D_i,10^{-6}\}}
\right).
\]

Retain each condition's fixed \(\rho_b\) from the accepted input. No new correlation estimate, per-task likelihood branch, or pass-at-k branch is introduced in the primary comparison.

## 11. Canonical posterior and evidence use

Let \(\vartheta\) contain \(\sigma,\Omega\), the chosen sibling's change scales, root coordinates \(\epsilon\), child coordinates \(u,\kappa\), and all retained sampled effort/measurement quantities \(\psi\). Compute \(Z(\vartheta,G)\) exclusively through section 5.3 and the effort model. In those sampled coordinates:

\[
\begin{aligned}
p(\vartheta\mid\mathcal D,G,j)\propto{}&
p(\sigma,\Omega)\,p_j(\text{change scales})\,p(\psi)\\
&\times\prod_{r\in\mathcal R}\mathcal N_5(\epsilon_r;0,I)\\
&\times\prod_{m\in\mathcal C}\prod_k
\mathcal N(u_{mk};0,1)\operatorname{Gamma}(\kappa_{mk};2,2)\\
&\times\prod_{i\in\mathcal D}
p(y_i\text{ or }x_i\mid Z(\vartheta,G),\psi),
\end{aligned}
\]

where \(j\in\{A,B\}\). This is the only normative sampler density. The centered conditional Student-t law in section 5 is an induced distributional identity, not a second target factor.

Every admitted observation appears once. Do not add densities on deterministic root/child traits or derived innovations. Do not combine child root and edge priors, use full-data parent posteriors as fresh priors for the same data, insert parent medians as constants, or add wins computed from the existing benchmark rows as extra likelihood evidence.

A centered implementation can be equivalent if it uses different sampled coordinates and the correct density transformation. The risk is inconsistent coordinates, Jacobians, or duplicate factors; the centered mathematical identity is not intrinsically incorrect. Pairwise summaries must preserve the dependence of releases in this joint fit.

## 12. Relationship to matched comparisons and Elo

For matched continuous measurements from parent and child, under the same benchmark and the same additive protocol effects:

\[
d_b=y_{m,b}-y_{\pi(m),b}.
\]

At standard effort, the model implies a location difference:

\[
\ell_{m,b}-\ell_{\pi(m),b}
=\alpha_b\lambda_b^{\mathsf T}W_m
+f_{m,F(b)}-f_{\pi(m),F(b)}
+e_{m,b}-e_{\pi(m),b}.
\]

System indices on the family and cell terms are abbreviated here to their matched release systems. At maximum effort, the capability difference additionally includes \(\delta_m-\delta_{\pi(m)}\).

The benchmark intercept and truly shared additive protocol offsets cancel. Different protocols or declared source domains require their differences to remain in the expression. Measurement covariance also matters:

\[
\operatorname{Var}(y_{m,b}-y_{\pi(m),b})
=\operatorname{Var}(y_{m,b})+\operatorname{Var}(y_{\pi(m),b})
-2\operatorname{Cov}(y_{m,b},y_{\pi(m),b}).
\]

The original observation likelihood already contains these comparisons. Merely rewriting it in difference coordinates, while preserving all information and assumptions, does not change the posterior. The proposed change comes from the related-release prior.

A separately fitted Bradley–Terry model could serve as another candidate or diagnostic. It is not an additive correction in this specification. Shared-subset wins also do not establish superiority on every unmeasured domain, and pair-specific overlap comparisons may form cycles.

## 13. Display calibration

Retain the fixed baseline calibration panel \(P\), its eligibility requirements, and the 0.05 scale floor. For each posterior draw:

\[
\mu_{Pk}=\operatorname{mean}_{s\in P}Z_{sk},\qquad
s_{Pk}=\max\{\operatorname{sd}_{s\in P}(Z_{sk};\mathrm{ddof}=1),0.05\},
\]

\[
\widetilde Z_{sk}=\frac{Z_{sk}-\mu_{Pk}}{s_{Pk}}.
\]

For profile \(u\):

\[
C_{su}=\sum_k w_{uk}\widetilde Z_{sk},
\]

\[
\mu_{Pu}=\operatorname{mean}_{s\in P}C_{su},\qquad
s_{Pu}=\max\{\operatorname{sd}_{s\in P}(C_{su};\mathrm{ddof}=1),0.05\},
\]

\[
\boxed{I_{su}=50+10\frac{C_{su}-\mu_{Pu}}{s_{Pu}}}.
\]

| Domain | Mixed | Agentic | Chat |
|---|---:|---:|---:|
| Agentic | 0.20 | 0.60 | 0.00 |
| Software and code | 0.20 | 0.30 | 0.10 |
| Reasoning | 0.20 | 0.10 | 0.20 |
| Knowledge and information | 0.20 | 0.00 | 0.30 |
| Communication and professional | 0.20 | 0.00 | 0.40 |

Domain outputs remain \(50+10\widetilde Z_{sk}\). Report posterior medians and 5th/95th percentiles. The index is relative to the panel, is not a percentage, and is not bounded by 0 and 100.

Panel membership and weights remain fixed, but its fitted traits can change under the candidate. As a result, scores of releases outside a particular relationship can also move. Candidate-versus-baseline reports must distinguish local changes from changes in the fitted calibration scale. Posterior domain medians cannot simply be added to obtain an exact decomposition of a composite posterior median.


### 13.1 Mandatory calibration accounting

Every candidate-versus-baseline and edge-ablation report must include raw standard/maximum trait posterior means, medians, intervals, and their units; root scales and correlations; effective edge scales; and the posterior panel domain/profile centers and SDs. Raw means are diagnostics, not coordinate-invariant measures of improvement: free trait scales and discrimination can change between fits.

Keep official scores computed with each draw's own panel normalization. In addition, use the following **descriptive cross-calibration accounting**. Let fits 0 and 1 denote the two compared fits. For each fit \(y\), freeze \(\bar A_y\) to the recorded posterior mean panel centers and floored SDs for every domain and profile. Define \(F_u(Z;\bar A_y)\) to be the same calibration formula evaluated with these deterministic constants, and calculate:

\[
T_{xy}=\mathbb E_{\text{fit }x}[F_u(Z_s;\bar A_y)],
\qquad x,y\in\{0,1\}.
\]

Report all four entries, then the symmetric accounting terms:

\[
L_{su}=\tfrac12[(T_{10}-T_{00})+(T_{11}-T_{01})],
\]

\[
C_{su}=\tfrac12[(T_{01}-T_{00})+(T_{11}-T_{10})],
\qquad L_{su}+C_{su}=T_{11}-T_{00}.
\]

\(L\) summarizes changing the trait distribution with each frozen calibration held in turn; \(C\) summarizes changing the calibration constants with each trait distribution held in turn. Here \(C_{su}\) is an accounting symbol local to this subsection, not the composite variable or legacy concentration diagnostic.

For the official posterior-mean score shift \(\Delta\bar I\), additionally report:

\[
Q_{su}=\Delta\bar I-(L_{su}+C_{su}).
\]

This remainder includes the difference between random, dependent draw-wise calibration and deterministic plug-in calibration. Report the official median shift separately; medians are nonlinear and do not inherit the decomposition of means.

The identity is exact for the stated plug-in quantities only. \(L\) is a coordinate-conditional diagnostic, not a causal local effect or a uniquely identified panel-adjusted capability change. A different anchoring convention can change the allocation. Do not silently affine-align independent fits and claim the result is invariant, particularly with fixed cross-loadings. Native-scale benchmark predictions provide an additional check when raw-coordinate shifts are ambiguous.

Use the same accounting for edge deletion, alongside changes in all global scales. Record Monte Carlo uncertainty and the extraction rule for frozen constants; these cross-fit accounting terms are not paired draws from one posterior and must not be presented as having ordinary paired-posterior credible intervals.

## 14. Pairwise and release-change summaries

For two systems from the same posterior:

\[
P(A>B)\approx\frac1D\sum_{d=1}^{D}
\mathbf1[I_A^{(d)}>I_B^{(d)}].
\]

Retain the one-point practical-ordering diagnostic:

\[
P(A>B+1),\qquad P(B>A+1).
\]

An ordering remains unresolved unless one direction reaches the baseline 0.90 threshold. A useful supplementary quantity is:

\[
P(|I_A-I_B|\le1),
\]

which describes practical similarity under the declared one-point convention. It must not be confused with a lack of information.

For every release edge, summarize:

- Raw changes \(W_{mk}\) and derived root-relative changes \(\Delta_{mk}=W_{mk}/\sigma_k\), with intervals and directional probabilities.
- Effective raw edge scales \(\chi_k\) and the selected sibling’s hyperprior units.
- Maximum-effort changes including the difference in effort increments.
- Changes in each displayed index, using paired draws.
- Direct evidence available for each endpoint and domain.

These probabilities are conditional on the model and frozen graph. Borrowing can increase their precision and their dependence on assumptions simultaneously. They do not become more empirical merely because an interval narrows. Keep the 0.90 practical-ordering threshold and the extrapolation explanation visible; no threshold is relaxed for related releases. The probabilities do not average over graph eligibility or alternative assumptions.

## 15. Evidence accounting and publication safeguards

### 15.1 Direct coverage stays direct

Coverage remains:

\[
\operatorname{Coverage}(s)
=\frac{\#\{b:\text{an admitted fitted cell }(s,b)\text{ exists}\}}
{\#\{b:\text{condition fitted in the run}\}}.
\]

The frozen baseline denominator is 19. A parent's cell never enters its child's numerator. The child's independent-source count, family count, and direct domain-support counts also exclude parent observations.

In the motivating example, a release edge would not change 3.8's maximum-effort direct coverage from 5/19. Its parent's SimpleQA evidence would not become a 3.8 SimpleQA result.

### 15.2 Preserve extrapolation labels

For experimental summaries, retain the baseline requirement for an individual domain median to be published: at least two own-system cells with loading at least 0.25, a 90% interval width at most 20, and the existing precision proxy threshold. If these requirements fail, any displayed inferred estimate remains marked extrapolated.

Borrowing can narrow an interval, but cannot satisfy a missing direct-cell requirement. Where useful, explain that the extrapolation draws on related-release evidence in addition to population structure.

### 15.3 Legacy gates do not become evidence-attribution measurements

The baseline quantity

\[
R_s=\operatorname{clip}\left(1-\frac{\operatorname{Var}(I_{s,\mathrm{Mixed}})}{100},0,1\right)
\]

still measures posterior precision relative to a fixed reference variance. It does not measure how much the child's own evidence contributed. Relationship borrowing makes that distinction more consequential.

The baseline family-share and concentration diagnostics are also local approximations. Their independent-system precision assumptions do not automatically describe the graph prior. Retain them only in internal audit artifacts for historical comparison. Exclude legacy precision, family-share, concentration, and inherited Verified/Ranked badges from any public candidate scorecard. They must not imply that a borrowed estimate is mostly supported by the child’s own tests.

The following legacy values are retained in this technical document for **internal audit comparison only**, not as candidate publication criteria:

| Gate | Verified | Ranked |
|---|---:|---:|
| Mixed 90% interval width | \(\le12\) | \(\le20\) |
| Domains touched by positive-loading own cells | \(\ge4\) | \(\ge3\) |
| Safe independent own cells under baseline metadata rules | \(\ge2\) | \(\ge1\) |
| Maximum family information-share proxy | \(\le0.50\) | \(\le0.80\) |
| Legacy \(R_s\) precision proxy | \(\ge0.70\) | \(\ge0.50\) |
| Legacy concentration proxy | \(\le0.50\) | \(\le0.80\) |

Passing these legacy calculations is not sufficient to promote a candidate run or claim that borrowing is validated. Final production gate changes must be specified and evaluated before publication; they are not supplied with calibrated thresholds by this proposal.

### 15.4 No-evidence releases

A hypothetical estimate obtained entirely through a release edge must not create ranked eligibility for a release without the required own evidence. Catalog visibility and a model-derived estimate are separate from sufficient evidence for publication.

## 16. Required borrowing diagnostics

### 16.1 Remove the child's own observations

Let \(\mathcal D_{-m}\) remove all observations for release \(m\), including every effort class. Keep the reviewed graph and all other permitted evidence.

\[
R^{\mathrm{own}}_{su}
=1-
\frac{\operatorname{Var}(I_{su}\mid\mathcal D,G)}
{\operatorname{Var}(I_{su}\mid\mathcal D_{-m},G)}.
\]

This compares precision with and without the release's own evidence. It is conditional on remaining information, which may include relatives. It is not an exact additive fraction of knowledge attributable to direct data.

Record negative values rather than clipping them away. Also record changes in median, interval width, and pairwise probabilities; variance alone can miss a large location change. If a variance denominator is numerically unstable, mark the diagnostic unavailable and investigate.

### 16.2 Remove the incoming relationship

Define \(G^{-m}\) by removing \(\pi(m)\rightarrow m\) and making \(m\) a root with the baseline root prior. Leave any child edges below \(m\) in place and disclose them. Refit the same observations under this altered graph.

For each profile:

\[
S^{\mathrm{edge}}_{su}
=\operatorname{median}(I_{su}\mid\mathcal D,G)
-\operatorname{median}(I_{su}\mid\mathcal D,G^{-m}).
\]

Record interval and probability changes, the raw latent changes, all four cross-calibration entries and their accounting terms from 13.1, and changes in \(\tau\) or \(\tau^{\mathrm{raw}}\), \(\chi\), \(\sigma\), \(\Omega\), effort scales, and panel centers/SDs. Edge deletion refits all these quantities; with few edges, their movement may dominate the score change. This is full-refit sensitivity, not the isolated effect of one relationship. The same applies to the own-observation knockout, whose precision ratio must never be labeled an evidence share.

The complete no-edge baseline is a separate comparison. For an internal node, removing its incoming edge does not make it independent of all relatives.

### 16.3 Sibling and hyperprior sensitivity

Fit A and B as separate development candidates. The exploratory A grid is \(h_A\in\{0.20,0.35,0.50,0.80\}\), in dimensionless root-SD multiples. B requires its own raw-unit prior-predictive justification; do not copy the A grid and call it matched. Its initial development reference is \(h_B=0.35\) raw latent units, with any additional attempted values archived before their outcomes are read.

Candidate selection may use the declared non-Gemini historical development set and prior-predictive checks. Freeze the chosen model and scales before confirmation. Sensitivity runs performed on a locked test are descriptive only: their winners cannot replace the locked model on that same test. If neither sibling is selected beforehand, confirmatory selection requires a separately locked multiple-comparison design; opening two tests and reporting only the winner is not confirmation.

A large edge scale remains parent-centered and is not the no-edge model. Always fit the baseline explicitly. Publish adverse sensitivity results alongside favorable ones.

### 16.4 Relationship, effort, and excluded-evidence sensitivity

Use the same evidence-admission rules for each compared fit. Inspect disputed-edge exclusions, self-report removal, influential-source removal, and a prespecified explicit-effort-only analysis. Do not silently reinterpret missing effort to obtain a desired release change.

**LiveBench is an explicit Gemini robustness probe.** Its display-only result favors 3.7 and must be shown beside the fitted-intersection comparison. Review benchmark-version, sampling, uncertainty, and configuration limitations before any quantitative admission. If those remain unresolved, it is a qualitative contradictory observation; do not fabricate an SE, count, or pairwise vote. Any newly justified likelihood belongs to a separately declared admission sensitivity run with the same changed evidence for baseline and candidates. It cannot modify the frozen primary experiment retrospectively.

## 17. Gemini diagnostic case

The following are baseline 1.4.3 observations and summaries, not candidate results.

### 17.1 Shared maximum-profile fitted conditions

| Condition | Gemini 3.7 Flash | Gemini 3.8 Flash |
|---|---:|---:|
| DeepSWE 1.1 | 65.27% | 73.83% |
| Terminal-Bench 4.0 | 11.21% | 19.09% |
| MathArena composite | 29.90% | 35.20% |
| Finance Agent v2 | 59.04% | 61.44% |
| Arena Text | 1490.93 | 1493.85 |

MathArena effort is unreported and assigned to assumed maximum for both. Higher reported point estimates do not imply that every individual difference is decisively established. Arena's small rating difference particularly requires joint uncertainty to be considered.

The shared fitted intersection is not the complete displayed catalog. The display-only LiveBench result favors 3.7: 78.83 versus 75.83. It remains excluded from this candidate's likelihood under the frozen baseline admission policy.

### 17.2 Baseline posterior summaries

| Quantity | Gemini 3.7 Flash | Gemini 3.8 Flash |
|---|---:|---:|
| Mixed median | 62.14 | 61.79 |
| Mixed 90% interval | 57.74–66.99 | 56.46–67.80 |
| Agentic median | 59.04 | 61.23 |
| Knowledge domain median | 64.64 | 58.26 |
| Maximum-effort direct fitted conditions | 9 | 5 |

The Mixed posterior gives 3.7 approximately 52.8% probability of exceeding 3.8. This is an unresolved ordering under the baseline practical-ordering rule.

3.7 has fitted SimpleQA evidence and additional ARC/FrontierMath evidence. None of 3.8's fitted maximum-effort conditions reaches the 0.25 loading threshold for direct knowledge support. Both knowledge medians are extrapolated under the baseline publication rules, with materially weaker direct support for 3.8.

### 17.3 Illustrative probe and competing explanations

This pair is excluded from promotion evidence and change-scale tuning. A development probe may show how A and B redistribute uncertainty, provided relationship eligibility is separately documented. The expected report has no required ordering direction.

Several explanations remain possible: genuine differences in unmeasured domains; an inappropriate independent-release prior; an inappropriate related-release prior; changed effort responses; uncertain effort assignment; source or benchmark residuals; and panel recalibration. The shared maximum-effort results do not identify which explanation is correct.

Google's migration guidance reports increased token use for some complex tasks and allows lower effort to reduce consumption. That makes computational-regime comparability a concrete concern; it does not prove the difference belongs in either the standard trait or the effort increment. [Google's description](https://ai.google.dev/gemini-api/docs/latest-model).

Do not transfer the published 64.64 knowledge score directly to 3.8. The model acts on raw standard-effort traits, includes uncertain maximum-effort increments, and recalibrates jointly. Required probe outputs include relationship documentation, raw and calibrated changes, change/effort posterior dependence, direct coverage, LiveBench context, edge deletion, and sensitivity results. A rank reversal, no reversal, or increased uncertainty can all occur; none alone supports promotion.

## 18. Validation design and confirmation separation

### 18.1 Frozen development and confirmation records

The 1.4 experiments and Gemini anomaly have already been inspected. They are development context. The Gemini pair and its underlying connected documented release component are excluded from hyperprior tuning and all confirmatory training and scoring. A full development fit may include them solely as a labeled posterior probe.

Freeze a **documentation-only confirmatory graph** for other components, the historical development set, fresh/reserved outcomes, availability cutoffs, depth policy, and exclusions before opening confirmatory results. Record actual review timestamps; do not backdate eligibility or pretend later review makes an inspected anomaly untouched. A previously known pair may be evaluated prospectively on genuinely future outcomes, but this proposal keeps Gemini out of the promotion dataset entirely.

The graph manifest must distinguish underlying documented components from the depth-truncated model forest. Cluster related releases together **before depth truncation** so that new roots created by the depth cap cannot manufacture independent validation units. Graph selection is an explicit field in the [experiment-lock draft](aci-1.5.0-related-release-experiment-lock.md).

### 18.2 Primary task: missing substantial domain evidence

The primary score evaluates **successor-domain transfer on already calibrated conditions**, not generic interpolation. For a selected successor \(m\) and target domain \(k\), define target conditions with \(\lambda_{bk}\ge0.25\). Remove every successor observation, at every effort and source, in every family containing one of those target conditions. Score the held-out target conditions only. Conditions below the loading threshold removed by family grouping are not silently added to the primary score.

Retain legitimate parent evidence and other models' calibration evidence. The successor's remaining small cross-loadings may still carry information about \(k\); report them explicitly. Describe this as absence of **substantial direct target-domain support**, not literally zero information. Include a stricter separate stratum removing every positive-loading target-domain successor condition.

Primary evaluation excludes:

- Easy random cell holdouts with substantial same-domain successor training support.
- Scored successor conditions whose family still has successor training observations.
- Completely new benchmark conditions without a separate training-only calibration protocol.
- The motivating Gemini component and every development-only/tuned outcome.
- Display-only evidence lacking an admitted likelihood.

Mask eligibility is determined from metadata and availability, not candidate success. Apply identical masks and evidence subsets to baseline, A, and B. The primary score cannot be dominated by ordinary same-family interpolation.

### 18.3 Secondary tasks and prospective replay

Report random model–condition masks, whole-family masks, very sparse multi-domain masks, and completely unobserved successors as separate secondary tasks. Entirely inferred releases do not acquire publication eligibility.

For prospective evaluation, freeze predictions at each cutoff using only observations and relationship documentation available then. Later outcomes cannot revise the parent or global scales used in the recorded forecast. Prior-predictive development and graph selection must use a separate permitted history.

### 18.4 Integrate effects at the right prediction level

Remove every withheld successor outcome, including repeated sources and effort variants. Re-estimate all global parameters on training data. Integrate new cell residuals and unobserved system–family effects. A family effect may be conditioned on training only when legitimate evidence for that same system–family exists; the primary family-disjoint masks intentionally remove such evidence for target families.

Apply the equivalent rule to unobserved protocol effects and run deviations. Shared effects within a held-out block are integrated jointly, not independently redrawn for each report. Completely new conditions require training-only calibration of their unknown intercept and slope and remain outside the primary metric. [Stan's structured cross-validation guidance](https://mc-stan.org/docs/stan-users-guide/cross-validation.html).

### 18.5 Primary score and weights

For a held-out model–condition group \(g\) containing \(n_g\) admitted source/effort observations, use:

\[
\ell_{jg}=\frac{1}{n_g}\log p_j(\mathcal D_g\mid\mathcal D_{\mathrm{train}},G),
\]

with the group's joint predictive density and all required shared latent variables integrated. The division prevents source multiplicity from automatically multiplying the group's weight. \(n_g\) counts admitted observation rows, not benchmark tasks. Fix the grouping and normalization before seeing results.

Compare \(d_g=\ell_{\mathrm{candidate},g}-\ell_{\mathrm{baseline},g}\) on exactly the same outcomes. Average repeated appearances of a group within its declared stratum, then average groups within successor-domain blocks, blocks within underlying documented components, and components equally. Archive the resulting weights. Other scientifically justified weights require a new pre-result lock.

Report proper predictive scores, interval coverage/width, native-scale errors, and stratified performance by domain, remaining coverage, provider, relationship type, graph depth, and regression status. CRPS values on incompatible measurement units cannot be pooled without a predeclared transformation or normalization. Latent ACI is not an observed target; full-data ACI ranks are stability references only.

### 18.6 Diversity and uncertainty are hard gates

**Proposed operating floor:** promotion requires at least ten informative underlying documented components across at least three providers, with enough evaluable primary blocks to estimate the locked uncertainty criterion. These numbers are declared minimum design requirements, not a theorem guaranteeing statistical power. They must be finalized with a precision/power assessment before confirmation; two or three trees can support only exploratory conclusions.

A component is informative only if it contributes an eligible primary successor-domain block with calibrated target outcomes and permitted parent evidence. Report counts and primary weights by component/provider. Use component-cluster uncertainty, accounting for repeated masks; report leave-one-component and leave-one-provider-out results. Shared global or protocol effects may create remaining dependence, which must be assessed rather than assuming trees are perfectly independent.

Promotion requires the locked predictive-improvement criterion and the locked noninferiority/calibration safeguards to survive the specified component/provider exclusions. If evidence diversity or deletion checks fail, a positive overall mean log-score difference is insufficient. The uncertainty method, required precision, numeric margins, and resampling design remain explicit unresolved lock fields until evaluated on development-only evidence.

### 18.7 Latent ranks and model dependence

Use simulations with known traits to evaluate latent rank calibration. Use real held-out measurements to evaluate observable predictions and their probabilities. Narrower paired score intervals caused by a relation prior are not by themselves evidence of better empirical support. Check whether false confident improvements increase in regression and effort-shift cases.

## 19. Simulation and stress testing

### 19.1 Prior predictive checks

Generate roots, graph innovations, effort gains, and observations before conditioning on outcomes. Inspect plausible domain differences, benchmark performance, score spreads, and maximum-effort changes.

Check shallow and deep graphs. Pay particular attention to accumulated variance, sparse roots, extreme Student-t innovations, domain-scale uncertainty, and the effects of normalizing on a small calibration panel.

### 19.2 Simulation-based calibration

Generate complete synthetic datasets from the candidate's own generative model and fit them independently. Check posterior ranks and interval coverage for domain changes, calibrated scores, and paired score differences. This assesses the inference algorithm under the assumed model. It does not prove the relationship assumption holds for real releases. [Stan's simulation-based calibration guidance](https://mc-stan.org/docs/stan-users-guide/simulation-based-calibration.html) explains the distinction.

### 19.3 Misspecification stress scenarios

Generate additional cases that violate the proposed assumptions:

1. A child regresses in an unmeasured domain while improving on shared benchmarks.
2. A documented product successor has substantially different capabilities.
3. A source selectively publishes stronger successor results.
4. Parent and child use materially different effort settings despite similar labels.
5. Several related releases share an optimistic source effect.
6. A long chain contains an abrupt architecture or training change.
7. A parent has sparse evidence or an influential erroneous result.
8. Unrelated releases are incorrectly linked.
9. **Effort label shift:** standard-effort traits remain unchanged, but the same reported label or assumed-maximum assignment corresponds to more computation for the successor.
10. Correlated domain changes, provider-specific change scales, or systematic positive release drift violate the zero-centered independent-innovation assumption.

Measure false confident improvements, interval undercoverage, and sensitivity to disputed edges. Good calibration when simulating from the candidate itself cannot replace these stress tests.

## 20. Numerical inference and acceptance

The canonical target is designed for joint posterior sampling with NumPyro NUTS, consistent with the current implementation stack. The non-centered construction is mandatory for this candidate definition but does not guarantee good geometry. References to Stan explain statistical parameterization; no Stan program is part of the current scorer.

Retain at least the baseline numerical acceptance requirements:

| Diagnostic | Requirement |
|---|---:|
| Chains | 4 |
| Maximum monitored R-hat | 1.01 |
| Minimum bulk and tail ESS | 400 |
| Divergent transitions | 0 |
| Minimum E-BFMI per chain | 0.3 |
| Maximum monitored score MCSE | 0.3 display points |

The reference production run used 4,000 warm-up iterations and 5,000 post-warm-up draws per chain, with target acceptance 0.999. These settings are a starting computational reference, not evidence that the candidate will pass.

Monitor the new sibling-specific scales, effective raw scales, innovations, effort/innovation posterior dependence, and raw traits as well as calibrated scores. Monitor Monte Carlo error for decisive pairwise probabilities separately from score MCSE. Diagnose funnels near small change scales, long-chain dependence, and large innovations. Numerical failures require investigation rather than relaxed acceptance thresholds.

Compute diagnostics on the full chain-structured samples. If draws are reduced for stored summaries, retain paired draw identity across every release and profile. E-BFMI continues to use total Hamiltonian energy.

## 21. Limiting cases and conceptual verification

The following checks define intended mathematical behavior for a future implementation:

| Case | Expected behavior |
|---|---|
| Graph has no edges | Recovers the baseline capability prior; unused change scales can be omitted |
| Change scales approach zero | Related standard-effort traits approach equality; maximum-effort differences can remain |
| Child has strong contradictory direct data | Posterior can support a large signed change |
| Child has no direct data and no observed descendants | Conditional uncertainty includes both parent uncertainty and innovation uncertainty |
| Parent posterior is broad | Its uncertainty propagates into the child |
| Incoming edge is removed | Child receives the baseline root prior; descendant edges, if retained, still connect it to relatives |
| Change scale is made very large | Does not equal the no-edge baseline |
| Child has no knowledge cell | Direct knowledge coverage remains unchanged by borrowing |
| Child receives one new observation | The observation enters once; no derived-win likelihood is added |
| Root and child observations are fitted jointly | Parent estimates may change after child evidence arrives |

Posterior medians need not be monotone under arbitrary increases in a single benchmark score because traits, residuals, scales, and calibration are jointly estimated. This proposal does not claim a dominance theorem.

## 22. Promotion criteria and unresolved experiment lock

The [experiment-lock draft](aci-1.5.0-related-release-experiment-lock.md) is **not locked**. It must contain actual documentation graph records, prior-predictive justification, development selection history, the candidate selected for confirmation, disjoint outcome manifests, and numeric decision tolerances before confirmation starts. Unfilled fields cannot be interpreted as passed checks.

Promotion requires every condition:

1. Documentation-only graph construction and the pre-truncation component/exclusion manifest are frozen before confirmation.
2. The selected candidate and hyperprior units/scales are justified on non-Gemini development evidence and prior predictives, with all attempted settings archived.
3. Numerical checks pass under the canonical target.
4. The primary family-disjoint missing-domain predictive metric meets the locked improvement rule; easy interpolation cannot substitute for this result.
5. **The component/provider diversity floor, required uncertainty precision, and leave-component/provider-out safeguards pass as hard gates.** A result from a handful of trees remains exploratory.
6. Regression, false-edge, and unchanged-standard-trait / shifted-effort stress tests satisfy the locked coverage and false-confidence tolerances.
7. Raw traits, effort changes, effective edge scales, and complete calibration accounting accompany calibrated score changes.
8. Every adverse sensitivity result is disclosed. No post-test switch to the winning hyperprior or sibling is made without a new confirmation dataset.
9. Candidate publication uses direct coverage and explicit support labels; legacy gate values/badges are absent from public candidate scorecards.

The diversity operating floor in section 18.6 does not replace the remaining numerical tolerances or a power assessment. If any prerequisite is unavailable, continue development or retain the baseline; do not claim a production improvement. Gemini's ordering has zero weight in this decision.

## 23. Known limitations

- Relationship eligibility can introduce documentation and provider bias. Post-anomaly edge selection cannot supply independent confirmation.
- A couples innovation scale to root heterogeneity; B instead depends directly on the raw latent coordinate convention. Neither scaling choice is neutral.
- Five change scales may remain prior-dominated. Shared source/family effects and maximum-only evidence weaken identification of release changes versus effort gains.
- One change-scale distribution across providers may overshrink one group and undershrink another.
- Independent innovation directions omit possible correlated changes. Their predictive value must be tested rather than assumed from baseline capability correlations.
- Zero-centered innovations may mismatch systematic release drift or selection of commercially successful successors.
- Student-t tails permit large departures but do not detect false edges or safely infer an unmeasured regression.
- Identical effort labels do not establish identical compute regimes. Configured capability and compute-normalized capability are different estimands.
- The two-edge depth cap truncates documented chains and changes the prior at new roots. It is an explicit operating assumption; truncation does not create independent validation components.
- Posterior feedback can move ancestors, siblings, and global scales. Edge deletion is not an isolated local intervention.
- Fitted panel normalization can move unrelated scores. Cross-calibration accounting is descriptive and coordinate-conditional, not a unique causal decomposition.
- Full-data ACI ranks are not empirical ground truth, and narrow relationship-conditioned probabilities can be sensitive to weakly supported assumptions.
- The model retains baseline uncertainties about source comparability, missing effort, fixed loadings, repeated totals, and selective reporting. The contrary display-only LiveBench observation remains visible in the Gemini probe.
- Few genuinely informative components limit generalization even when a clustered interval appears narrow.

## 24. Required output schema and reproducibility

### 24.1 Run artifacts

Archive input hashes; original and depth-truncated graph manifests; source documentation and availability timestamps; development/confirmation separation and exclusions; prior-predictive reports; candidate/scaling choices and their units; all attempted settings; exact masks and weights; numeric decision rules; sampler diagnostics; and promotion/rejection history.

### 24.2 Mandatory release and comparison fields

| Field group | Required contents |
|---|---|
| Run identity | Baseline/candidate IDs, A/B/no-edge label, input/graph hashes, training cutoff, development or confirmation role |
| Graph | Parent/root, original component ID, truncated-tree ID, depth, eligibility rationale, excluded-edge reasons |
| Raw capability | Standard and maximum trait posterior means, medians, intervals, coordinate convention |
| Release changes | Raw \(W\), derived \(W/\sigma\), intervals, directional probabilities |
| Scales | Prior and posterior \(\tau\) or \(\tau^{\mathrm{raw}}\), \(\chi\), \(\sigma\), \(\Omega\), effort scales; units and sensitivity |
| Panel | Domain and profile center/SD posterior means, intervals, numerical floors and floor-hit rates |
| Scores | Native draw-wise calibrated means, medians, intervals, pairwise probabilities and explicit assumption scope |
| Calibration accounting | Frozen-calibration extraction rule, four \(T_{xy}\) entries, \(L,C,Q\) from 13.1, MC uncertainty and coordinate caveat |
| Evidence | Own cells/families/sources, substantial domain support, remaining weak cross-loadings, extrapolation label |
| Ablations | Own-observation precision ratio, incoming-edge removal, all global-scale and panel changes, no-edge baseline |
| Validation | Primary/secondary stratum, observed predictive score, group/block/component weights, tree/provider counts, deletion safeguards |
| Missing diagnostics | Explicit unavailable status and reason, never zero |

Raw means and scale accounting are mandatory companions to any candidate-versus-baseline index-movement table, including the Gemini development probe. They do not independently prove capability improvement; native-scale predictions and held-out outcomes provide the empirical check.

### 24.3 Public candidate scorecards

Label all outputs experimental. Show direct support, extrapolation, posterior uncertainty, and model dependence. Omit legacy precision-share, family-share, concentration values and legacy Verified/Ranked badges. Technical audit files may retain those numbers for historical comparison with clear names. Do not publish an edge-removal shift as a causal relationship effect or an own-data precision ratio as a percentage of evidence.

## 25. Reference baseline and sources

### 25.1 ActualAnalysis evidence

The accepted 1.4.3 input is pinned to implementation commit `fb2994c680cd2c24cd3a7f5553c0e097516dc41e`.

Its SHA-256 is:

```text
e5d654f41019df63f9f78c28efcd8d83db9bf425bf63e4d2cadb3a166fe23578
```

- [Accepted 1.4.3 inference input](https://github.com/MaxiZm/actualanalysis/blob/fb2994c680cd2c24cd3a7f5553c0e097516dc41e/docs/audits/1.4.3-effort-coverage/accepted-input.json).
- [Baseline model and likelihood](https://github.com/MaxiZm/actualanalysis/blob/fb2994c680cd2c24cd3a7f5553c0e097516dc41e/packages/scoring/python/aci12/model.py).
- [Baseline summaries, calibration, and gates](https://github.com/MaxiZm/actualanalysis/blob/fb2994c680cd2c24cd3a7f5553c0e097516dc41e/packages/scoring/python/aci12/summarize.py).
- [Baseline numerical acceptance](https://github.com/MaxiZm/actualanalysis/blob/fb2994c680cd2c24cd3a7f5553c0e097516dc41e/packages/scoring/python/aci12/runner.py).
- [Local 1.4.3 effort and coverage audit](../audits/1.4.3-effort-coverage/README.md).
- [Local earlier candidate-validation summary](../audits/1.4-validation/summary.md).
- [Local 2026-09-06 source observations](../../data/snapshots/2026-09-06/results.csv).
- [Local 2026-09-06 published snapshot](../../data/snapshots/2026-09-06/snapshot.json); Gemini posterior quantities above use Mixed run `17c60fe7-1141-4917-8975-d0209ed1a799`, method 1.4.3. The snapshot also contains older runs, which must not be mixed into this comparison.

### 25.2 Statistical foundations

The proposal's release graphs, independent Student-t innovations, scale siblings, and initial hyperpriors are design choices. The following sources support methodology or the named product context; none validates A or B as an ActualAnalysis improvement.

- [Stan: hierarchical partial pooling](https://mc-stan.org/learn-stan/case-studies/pool-binary-trials.html) — sharing information while retaining individual variation.
- [Stan: held-out evaluation and cross-validation](https://mc-stan.org/docs/stan-users-guide/cross-validation.html) — evaluating predictive distributions and matching splits to structured prediction tasks.
- [Stan: simulation-based calibration](https://mc-stan.org/docs/stan-users-guide/simulation-based-calibration.html) — checking inference under a specified generative model.
- [Stan: reparameterization and changes of variables](https://mc-stan.org/docs/stan-users-guide/reparameterization.html) — density coordinates and Jacobians.
- [Stan: posterior and prior predictive checks](https://mc-stan.org/docs/stan-users-guide/posterior-predictive-checks.html) — distinguishing prior simulation from conditional forecasts.
- [Google: Gemini 3.8 Flash migration guidance](https://ai.google.dev/gemini-api/docs/latest-model), accessed 2026-09-06 — task-dependent token use and thinking-level guidance; a rolling page that should be archived at the time of any future experiment lock.
- [Wainer: a Bayesian Bradley–Terry model for comparing algorithms across datasets](https://jmlr.org/papers/v24/22-0907.html) — background for a possible separate pairwise candidate, not the likelihood specified here.

## 26. Authoritative model and status

The canonical non-centered construction is **section 5.3**, with sibling-specific scales in section 5.2. The sampler target is **section 11**. Other conditional laws in this document are explanatory identities, not additional factors. Effort and measurement definitions remain in sections 7–10, and calibration/reporting in sections 13–16.

A and B are development candidates. Initial references are \(h_A=0.35\) in dimensionless root-SD multiples and \(h_B=0.35\) in raw latent units; neither is a calibrated production choice. The separate [experiment-lock draft](aci-1.5.0-related-release-experiment-lock.md) is incomplete until its graph, prior-predictive report, cohorts, manifests, and numerical decision tolerances are recorded.

**No candidate has been fitted or promoted. Gemini is an illustrative posterior probe excluded from promotion evidence. The scorer and published results are unchanged.**

