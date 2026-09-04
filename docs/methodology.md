# ActualAnalysis Capability Index methodology

Method version: **1.2.2**  
Taxonomy edition: **2026a**  
Calibration edition: **2026a**

This document summarizes the normative scoring contract implemented by the repository. The resolved constants, calibration panel, benchmark baskets, and publication thresholds live in `data/index-config.yaml` and are stored with every run.

## 1. Unit of analysis

A system is a model snapshot at a declared system class:

- `std-common` is the provider default effort tier under a common harness.
- `max-common` is the provider highest exposed effort tier under a common harness.
- `product:<runtime-version>` is the product-wrapped system under its declared runtime.

**Single-system rule for fixed-effort models**: If a model snapshot has no variable effort dial (default effort tier equals max effort tier), exactly one system represents that model, carrying both class labels (`std-common` and `max-common`) with $\delta_m \equiv 0$. It appears once in rankings, once in the panel, and its observations are never duplicated.

Observation metadata is inherited from a dated source protocol before class assignment. Row-level fields override inherited fields only when the row states them. Missing metadata is flagged `metadata_incomplete` and fitted with 1.5× residual run noise; declared incompatibilities use the closed rejection reasons (`config_mismatch`, `duplicate_lineage`, `snapshot_unresolved`, `class_unassigned`, `condition_inactive`, `missing_uncertainty`, `too_few_runs`, `raw_without_transform`).

## 2. Observation likelihoods

Counted accuracy uses the raw sampling process with chance level $, ceiling $\eta$, and latent value $\theta$:
```text
q = g + (\eta - g) \sigma(\theta)
```

- Per-task counts use a beta-binomial with within-task correlation $\rho$.
- Total task counts use the normal approximation with design effect  + (k - 1)\rho$.
- Single trial counts use a binomial likelihood.
- Pass@k observations map through the delta method on  = 1 - (1 - y)^{1/k}$.
- Continuous observations (Elo, METR horizons, money, reported SE) use normal likelihoods with reported or declared uncertainty.

## 3. Joint latent model

One joint NumPyro model fits all systems, domains, benchmarks, and protocols:

```text
\eta_{sb} = \beta_b + \alpha_b \sum_{k=1}^K \lambda_{bk} Z_{sk} + f_{s, F(b)} + e_{sb}
```

- **System traits**: Five-dimensional trait vector {(m, \text{std-common})} \sim \mathcal{N}(0, \operatorname{diag}(\varsigma)\Omega\operatorname{diag}(\varsigma))$ with LKJ(2) correlation matrix $\Omega$.
- **System links**: {(m, \text{max-common})} = Z_{(m, \text{std-common})} + \delta_m$, with $\delta_m \equiv 0$ for fixed-effort models and partially pooled $\delta_m \sim \mathcal{N}(\mu_\delta, \operatorname{diag}(\sigma_\delta^2))$ for variable-effort models.
- **Unpinned condition parameters**: Condition intercepts $\beta_b \sim \mathcal{N}(0, 3^2)$ and log-discriminations $\ln \alpha_b \sim \mathcal{N}(0, 0.6^2)$. No benchmark is pinned; identification is established through the calibration panel.
- **Misfit scale mixture**: Cell misfit {sb} \sim t_4(0, \sigma_b^2)$ parameterized as a scale mixture with $\kappa_{sb} \sim \text{Gamma}(2, 2)$.
- **Observation predictor**: $\ell_r = \eta_{s(r)b(r)} + a_{p(r), k(b)} + \xi_{p(r), b} + \epsilon_r$, accounting for source-domain effects {p, k}$, protocol-condition interaction $\xi_{p, b}$, and run noise $\omega_{p, k}$.

## 4. Inference and convergence

The production fit uses NUTS: four chains, 2,000 warm-up iterations, 2,000 samples per chain, target acceptance 0.9, and full draw retention. Acceptance requires:
- **Zero divergences** ($\text{divergences} = 0$)
- R-hat $\le 1.01$ on all declared estimands
- Bulk and tail ESS $\ge 400$
- E-BFMI $\ge 0.3$ per chain
- MCSE $\le 0.3$ display points on scores and $\le 0.02$ on pairwise comparisons.

## 5. Published score scales

Three distinct score scales are published with explicit units:

1. **ACI-G** (Unit: *relative equal-domain index, mean 50, sd 10 over 2026a calibration panel*):
   The equal-domain composite  = \frac{1}{K} \sum_{k=1}^K \tilde{Z}_{sk}$, standardized to mean 50 and sd 10 across the calibration panel.
2. **ACI-Domain** (Unit: *relative domain index, mean 50, sd 10 over 2026a calibration panel*):
   Standardized domain trait $\tilde{Z}_{sk} = (Z_{sk} - \mu_{Pk}) / \varsigma_{Pk}$, scaled to mean 50 and sd 10.
3. **ACI-Basket** (Unit: *expected normalized utility % on utility-eligible conditions*):
   Expected normalized utility across declared task baskets using predictive outcomes on common-runtime conditions:
   ```text
   T_{s, u} = 100 \sum_F w_{uF} \sum_{b \in F} w_{ub|F} \mathbb{E}[U_b(Y^\star_{sb}) \mid \mathcal{D}]
   ```

## 6. Evidence and publication tiers

Publication status is determined by strict evidence gates:

| Tier | 90% Width | Domains | Safe Cells | Max Family Share | Min Own-Data Reduction $ | Publication |
|---|---:|---:|---:|---:|---:|---|
| Verified | ≤ 8 | ≥ 4 | ≥ 2 | ≤ 0.35 | ≥ 0.70 | score, rank, pairwise |
| Ranked | ≤ 12 | ≥ 3 | ≥ 1 | ≤ 0.55 | ≥ 0.50 | score, rank, pairwise |
| Provisional | otherwise | — | — | — | — | interval only |

- **Official concentration gate**: Evaluated via analytic Gaussian precision drop {sF} = 1 - V_s / V_s^{(-F)}$ using fixed panel scaling $. Verified requires $\max_F Q_{0.90}(c_{sF}) \le 0.35$; Ranked requires $\le 0.55$.
- **Domain point score rule**: Requires {sk} \ge 2$ own-profile fitted cells, interval width $\le 15$, and own-data variance reduction (\tilde{Z}_{sk}) \ge 0.50$. Otherwise, the domain is published as an extrapolated interval.
- **Basket publication rule**: Requires a published domain point score for every domain carrying $\ge 15\%$ of the profile utility weight.

## 7. Rankings and diagnostics

- **Practical margin**: Pairwise comparisons evaluate $\mathbb{P}(G_s > G_{s'} + 1.0) \ge 0.90$. A pair is marked unresolved if neither system reaches 0.90.
- **Overlap graph (§10.8)**: Protocols sharing $\ge 2$ systems on $\ge 1$ condition form edges. Protocols outside the reference component count at half weight.
- **Adversarial self-report fit (§10.8)**: Any system shifting > 3.0 points under non-negative self-report bias $\gamma_k^+$ is blocked from Verified.
- **Contamination state (§10.2)**: Classified as `safe`, `exposed`, or `unknown`. Unknown is never safe.
- **Exposure gap (§10.3)**: ^{\text{gap}} = \bar{r}_{s, \text{exposed}} - \bar{r}_{s, \text{safe}}$, disambiguated from $.
- **PSIS-LOO PIT residuals (§10.1)**: Marginalized pointwise log-likelihood residuals flag cell outliers.

## 8. Release acceptance and verification (§12)

Before any run is published, the release suite must pass:
1. **Simulation-Based Calibration (§12.1)**: Bias < 1 point, 90% coverage in [0.87, 0.93].
2. **Holdout validation (§12.3)**: Stratified cell, temporal, and family holdouts with coverage in [0.85, 0.95].
3. **Calibration panel audit (§2.6)**: Every panel system must have $\ge 2$ independent cells in all 5 domains; failure emits a metadata unblock table.
4. **Pipeline invariance (§12.6)**: Observation permutation, system label permutation, and reseed equivalence.
