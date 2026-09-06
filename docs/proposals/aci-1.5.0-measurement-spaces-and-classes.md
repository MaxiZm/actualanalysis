# ActualAnalysis: measurement spaces, model classes, and evidence-supported ordering

**Status:** mathematical design proposal; no scorer implementation, fitted candidate, or production claim.  
**Date:** 2026-09-06.  
**Reference evidence:** accepted 1.4.3 input.  
**Design decision:** organize the method around a defined system, a task-dependent capability function, a measurement operator, and a valid class covariance. Use ordering and information geometry to determine what conclusions the evidence supports.

This document develops a class-based alternative to the earlier predecessor random-walk candidates. Those candidates remain separate experimental specifications. The present construction has different assumptions and must receive its own frozen evaluation before promotion.

## 1. Engineering objective

ACI should estimate how a specified AI system performs across a declared target distribution of tasks, and distinguish measured performance from extrapolation. Related models can provide information about each other, but relationships do not create observations or prove that every capability improved.

The mathematical requirements are:

1. The measured object has a precise identity and operating configuration.
2. Every score corresponds to an explicit functional of capability.
3. A benchmark contributes information only through its measurement model.
4. Class membership changes prior dependence through a valid probability model.
5. Coordinate changes cannot be mistaken for empirical gains.
6. Shared-benchmark dominance is translated into overall dominance only when the measurement geometry supports it.
7. The model identifies which additional evaluations would resolve an uncertainty.
8. Predictions are checked against new observations under realistic missingness and configuration changes.

Theorems can establish covariance validity, invariances, and implications of assumptions. They cannot establish that a class assignment, task distribution, or benchmark loading describes reality. Those require evidence.

## 2. Define the object before assigning a score

### 2.1 System space

Let a system be a tuple

\[
s=(m,e,h,t,b),
\]

where:

- \(m\) is an immutable release identity;
- \(e\) is a documented inference configuration;
- \(h\) is a harness and agent scaffold;
- \(t\) is a tool and interaction policy;
- \(b\) is an assigned resource-budget policy, when one is specified.

The valid system space \(\mathcal S\) is the subset of such tuples that actually exist. It is not an unrestricted Cartesian product: some releases do not support particular settings or tools.

Provider labels such as medium and high identify settings in a release-specific configuration space \(\mathcal E_m\). Equal labels across releases do not establish equal computation. Realized token consumption is an outcome of the task and policy; it is not interchangeable with an assigned budget.

The inference target must state which of these is intended:

| Target | Object being compared |
|---|---|
| Configured performance | Systems at their documented settings, even if their compute differs |
| Budget-controlled performance | Systems under a common assigned budget and evaluation protocol |
| Best feasible performance | The best supported policy under an explicit constraint set |

The current maximum-effort leaderboard is closest to configured performance. It is not automatically a comparison at equal compute.

### 2.2 Evidence records

Each observation has a typed record containing the system identity or its unresolved fields, exact condition and version, native statistic, uncertainty model, source protocol, evaluation date, task sample, and duplicate lineage.

Two reported numbers are not directly comparable merely because their benchmark names match. Compatibility is a relation on the complete records. A missing setting remains an uncertainty about the system identity, rather than becoming a verified maximum setting.

## 3. The capability space and its connection to reality

### 3.1 Capability as a function over tasks

Let \(\mathcal T\) be a measurable space of tasks, including the success criterion and relevant environment. For each task, define an operational utility \(u_t(y)\in[0,1]\) on an outcome \(y\). Examples include verified completion, a declared fractional rubric, or a preference win against a fixed reference distribution.

Define the capability function of system \(s\):

\[
r_s(t)=\mathbb E[u_t(Y_s(t))].
\]

For a declared probability measure \(Q\) over tasks, \(r_s\) belongs to the Hilbert space

\[
\mathcal H=L^2(\mathcal T,Q),\qquad
\langle f,g\rangle_Q=\int f(t)g(t)\,dQ(t).
\]

Bounded utilities ensure square integrability. The set of physically achievable capability functions is a subset of this space, not necessarily the entire space or a linear subspace. Formal addition of two functions does not construct a deployable model.

Two systems are equivalent for this evaluation population when their functions agree \(Q\)-almost everywhere. This is an equivalence relation on systems. It expresses indistinguishability for that target population, not identical weights or behavior on every possible task.

### 3.2 A score is a functional, not a universal property

For a profile \(u\) with task distribution \(Q_u\):

\[
V_u(s)=\int r_s(t)\,dQ_u(t).
\]

If \(Q_u\) has a square-integrable density \(w_u\) relative to \(Q\), this is the linear functional \(\langle w_u,r_s\rangle_Q\). It has an operational interpretation: expected utility for the declared sampling rule.

Five domain weights alone do not specify \(Q_u\). One must also specify how tasks are sampled inside each domain. Existing mixed native metrics do not automatically share a utility scale: dollars, time horizons, Arena ratings, and task accuracy need explicit interpretations. An Elo-type rating cannot simply be treated as a completion probability.

Until these utilities and task populations exist, the existing ACI should continue to be called a **relative latent index**. The functional framework defines the long-term empirical target; it does not retroactively turn the current score into an expected percentage of real-world success.

### 3.3 Finite approximation supported by the current data

The present dataset cannot identify an arbitrary task function for each release. The first computational approximation retains five latent coordinates \(z_s\in\mathbb R^5\) and the existing condition response model:

\[
\eta_{sb}=\beta_b+a_b^{\mathsf T}z_s+f_{s,F(b)}+e_{sb},
\qquad a_b=\alpha_b\lambda_b.
\]

This is a finite measurement model for transformed outcomes. It approximates aspects of the task-dependent function; it is not an assertion that reality has exactly five independent capabilities. Domain labels are hypotheses about measurement, and fixed cross-loadings require external content review and predictive tests.

The progression is therefore: operational tasks and outcomes define the target; a finite latent model estimates it with limited data; prediction on new tasks checks whether the approximation is useful.

### 3.4 Distance and stability have operational meanings

Define \(d_Q(s,t)=\|r_s-r_t\|_{L^2(Q)}\). This is a pseudometric on systems and a metric on their equivalence classes: distinct implementations may have distance zero for the declared task population. The triangle inequality follows from the \(L^2\) norm. It describes differences in task performance, not distance between model weights.

For an estimated capability function \(\widehat r_s\) and a profile density \(w_u\in L^2(Q)\), Cauchy–Schwarz gives

\[
|\widehat V_u(s)-V_u(s)|
\le \|w_u\|_{L^2(Q)}\,\|\widehat r_s-r_s\|_{L^2(Q)}.
\]

This is a stability bound, not an available error certificate. To use it empirically, prediction error must be estimated on task samples representative of \(Q\). A profile concentrated on a small part of the reference population can have large \(\|w_u\|\), magnifying uncertainty. Benchmarks that do not represent that population cannot certify the bound's unknown error term.

## 4. What should be a class, and what should be a group?

### 4.1 Model classes

Let \(c:\mathcal M\rightarrow\mathcal C\) assign releases to documented capability-transfer classes. In the first candidate, these classes form a partition: \(m\sim n\) exactly when \(c(m)=c(n)\). Equality of class labels is reflexive, symmetric, and transitive.

A class means that a shared latent component is scientifically plausible. It does not imply equal capabilities or guaranteed improvement with release date. Brand membership alone is insufficient. Class definitions must consider documented derivation, major architectural or training changes, and comparability of reference configurations. A doubtful release can have a singleton class.

Pairwise ancestry is not automatically an equivalence relation. In particular, taking the transitive closure of every vaguely related product can produce an unjustifiably broad class. A reviewed partition is a new input that must be justified independently of desired score movements.

Classes are not algebraic groups: there is no scientifically defined product, identity, or inverse that combines model releases. Giving them group notation would add no predictive support.

### 4.2 Real symmetry groups

Groups are useful for coordinate and labeling invariances.

**Relabeling.** Permuting release IDs and class IDs while permuting the associated data identically should only permute the output. A particular name or provider string must not change the mathematical score.

**Latent likelihood coordinates.** With fixed \(\lambda_b\), the observation likelihood admits a global positive scale and a domain translation:

\[
z'_s=c z_s+t,\quad c>0,\quad t\in\mathbb R^5,
\]

\[
\alpha'_b=\alpha_b/c,\qquad
\beta'_b=\beta_b-(\alpha_b/c)\lambda_b^{\mathsf T}t.
\]

Transform effort increments by the same global scale. Then \(\beta'_b+\alpha'_b\lambda_b^{\mathsf T}z'_s\) equals the original predictor. These affine transformations form a group under composition:

\[
(c,t)\circ(c',t')=(cc',t+ct'),\qquad
\mathrm{id}=(1,0),\qquad
(c,t)^{-1}=(c^{-1},-t/c).
\]

This is the positive affine group \(\mathbb R^5\rtimes\mathbb R_{>0}\). Proper priors select a coordinate convention and need not be invariant under the group. The practical purpose of this group is to expose likelihood non-identifiability and distinguish changes of coordinates from changes in predicted outcomes.

Arbitrary separate domain rescalings are generally **not** symmetries of the fixed-loading likelihood. They change the effective mixture in a condition. If loadings were unrestricted, a larger change-of-basis group could apply; it does not apply automatically here.

The panel-normalized display is invariant to positive affine changes of each domain when its scale floors are inactive. The display's larger invariance does not establish a larger invariance of the likelihood. Floor activation is a documented numerical exception to exact scaling invariance.

## 5. The class-based statistical family

### 5.1 General class and release components

For each release at a comparable standard reference configuration, define

\[
z_m=L_C u_{c(m)}+L_R v_m,
\qquad u_c,v_m\stackrel{\mathrm{ind}}\sim\mathcal N_5(0,I).
\]

Let \(B_C=L_CL_C^{\mathsf T}\) and \(B_R=L_RL_R^{\mathsf T}\). Both are positive semidefinite. The induced covariance is

\[
\operatorname{Cov}(z_m,z_n)
=\mathbf1[c(m)=c(n)]B_C+\mathbf1[m=n]B_R.
\]

Covariance identities and Gaussian distribution statements in sections 5–6 are conditional on the covariance and pooling parameters unless explicitly integrated over them. With random covariance parameters, the unconditional prior is generally a mixture, rather than one Gaussian with a fixed covariance.

This separates variation shared within a class from variation specific to a release. The covariance of the difference between two distinct class members is \(2B_R\), while their marginal covariance is \(B_C+B_R\). Thus the covariance of release differences need not equal the population covariance.

This is a multivariate hierarchical model, also expressible as a finite multi-output Gaussian process. Such covariance constructions are standard mathematical tools for transfer; their empirical benefit is not guaranteed. [Multi-task Gaussian process research](https://proceedings.neurips.cc/paper/2007/hash/66368270ffd51418ec58bd793f2d9b1b-Abstract.html) provides a relevant foundation.

Estimating both unrestricted matrices requires enough informative classes. They are not both freely estimated in the first candidate.

### 5.2 Smallest candidate nested in the existing baseline

Retain the current marginal trait covariance:

\[
\Omega\sim\operatorname{LKJ}(2),\quad
\sigma_k\sim\operatorname{LogNormal}(0,0.5),\quad
\Sigma=D_\sigma\Omega D_\sigma=L_\Sigma L_\Sigma^{\mathsf T}.
\]

Set \(B_C=\rho\Sigma\), \(B_R=(1-\rho)\Sigma\), with \(0\le\rho<1\). The canonical non-centered construction is

\[
\boxed{
z_m=L_\Sigma\left(\sqrt\rho\,u_{c(m)}+\sqrt{1-\rho}\,v_m\right).
}
\]

The initial development prior is \(\rho\sim\operatorname{Beta}(1,1)\), a uniform distribution on the dimensionless correlation fraction. This is an explicit starting prior, not a calibrated result. It adds one global pooling parameter to the baseline prior family. Compare it with the explicit fixed \(\rho=0\) baseline, and assess prior sensitivity before confirmation.

Both \(u\) and \(v\) are sampled; \(z\) is deterministic. No additional Normal density is placed on \(z_m\). All releases are inferred jointly. Class means are not computed from already fitted parent scores and then reused as priors for the same observations.

The class component and release residual need not each be well identified when observations are sparse. Monitor the identifiable total traits and pooling sensitivity as well as the coordinates; non-centering does not eliminate scientific ambiguity.

### 5.3 What the restricted candidate assumes

One \(\rho\) assumes a common relative degree of class similarity across domains and classes. The covariance of differences is proportional to \(\Sigma\), so level correlations and change correlations are tied in this restricted candidate. It avoids estimating another matrix, but this is a substantive restriction.

The general family in 5.1 permits different covariance of class levels and release differences. It should be expanded only if held-out domain-transfer evidence supports estimating that additional structure. Neither a more elaborate covariance nor a raw-unit variant is automatically more realistic.

### 5.4 One joint inference contract

Let \(\psi\) collect all retained effort, benchmark, source, family, cell, and run parameters. Let \(L_{\mathrm{base}}\) denote the complete retained observation likelihood. The new posterior, with respect to the sampled non-centered coordinates, is

\[
\begin{aligned}
p(u,v,\sigma,\Omega,\rho,\psi\mid\mathcal D)
\propto{}&L_{\mathrm{base}}\!\left(\mathcal D\mid z(u,v,\sigma,\Omega,\rho),\psi\right)\\
&\times p_{\mathrm{base}}(\psi,\sigma,\Omega)\,p(\rho)
\prod_c\phi_5(u_c)\prod_m\phi_5(v_m),
\end{aligned}
\]

where \(\phi_5\) is the standard five-dimensional Normal density and \(p_{\mathrm{base}}\) excludes the replaced independent trait densities. Standard traits use section 5.2; configured traits add the retained effort terms. The full likelihood preserves its native observation distributions and dependence structure.

No separate likelihood of benchmark wins is multiplied into this expression. Those wins are summaries of observations already present. No Jacobian is required merely for computing deterministic \(z\) from sampled \(u,v\). Changing the sampled variables would require a separate, correctly transformed density.

## 6. Properties that can be proved

### Proposition 1: valid covariance

Let \(H_{mc}=\mathbf1[c(m)=c]\). The covariance kernel over releases is

\[
K_\rho=(1-\rho)I+\rho HH^{\mathsf T}.
\]

For every real vector \(x\):

\[
x^{\mathsf T}K_\rho x
=(1-\rho)\sum_mx_m^2
+\rho\sum_c\left(\sum_{m:c(m)=c}x_m\right)^2\ge0.
\]

For \(\rho<1\), this is positive for nonzero \(x\). Hence \(K_\rho\) is positive definite. With release-major vector ordering, the full trait covariance is \(K_\rho\otimes\Sigma\), also positive definite when \(\Sigma\) is. The general family has covariance \(HH^{\mathsf T}\otimes B_C+I\otimes B_R\), which is positive semidefinite by the same argument. [Covariance-function theory](https://gaussianprocess.org/gpml/chapters/RW4.pdf) supplies the general criterion.

### Proposition 2: unchanged marginal scale

Every release, including a singleton, has

\[
\operatorname{Var}(z_m)=\rho\Sigma+(1-\rho)\Sigma=\Sigma.
\]

There is no marginal variance growth with release-chain depth or class size. This directly avoids the predecessor random-walk variance accumulation. It does not make the class assumption true.

### Proposition 3: exact independent baseline

At \(\rho=0\), each \(z_m=L_\Sigma v_m\) has the original independent-release prior. Unused class coordinates integrate out. This is an actual nested baseline, not an approximation obtained by making a parent-centered change scale arbitrarily large.

If every class is a singleton, the induced prior on \(z\) also equals the baseline for any fixed \(\rho\). Singleton observations therefore do not identify the pooling parameter through this prior alone.

### Proposition 4: finite and symmetric borrowing

For two class members, conditional on known \(\rho,\Sigma\) and a known trait vector \(z_p\):

\[
z_m\mid z_p\sim\mathcal N_5\left(\rho z_p,(1-\rho^2)\Sigma\right).
\]

If only the parent's outcomes are observed, its uncertainty propagates as

\[
\mathbb E[z_m\mid\mathcal D_p]=\rho\mathbb E[z_p\mid\mathcal D_p],
\]

\[
\operatorname{Var}(z_m\mid\mathcal D_p)
=(1-\rho^2)\Sigma+\rho^2\operatorname{Var}(z_p\mid\mathcal D_p),
\]

under the fixed-global, two-member conditioning just stated. With additional class observations or uncertain global parameters, use the full posterior instead. The model borrows toward a class-informed distribution, not a copied predecessor median.

### Proposition 5: no automatic successor bonus

Before observations, the difference between two class members is

\[
z_m-z_p\sim\mathcal N_5(0,2(1-\rho)\Sigma).
\]

For any nonzero contrast with positive variance, its prior probability of being positive is one half. Release date supplies no positive drift in this model. Permuting class members leaves the prior unchanged.

### Proposition 6: adding an unobserved catalog member does not add evidence

With fixed class assignments, fixed hyperpriors, and fixed panel membership, adding an unobserved release to a class leaves the marginal posterior of the existing parameters unchanged after integrating out its unused release coordinate. A display entry alone cannot improve the class evidence.

Changing the class definition, the panel, or the prior at the same time is a different operation and does not satisfy this invariance.

### Worked calculation: how a sparse release changes

In a one-domain illustration, fix the marginal variance to 1, the pooling fraction to \(\rho=0.8\), and a classmate's true trait to \(z_p=2\). These are hypothetical known values, not fitted Gemini values or recommended settings.

The sparse release has a conditional prior \(z_m\mid z_p\sim\mathcal N(1.6,0.36)\). If its own observation is \(y=z_m+\epsilon\), with \(\epsilon\sim\mathcal N(0,r)\), the exact update is

\[
\mathbb E[z_m\mid z_p,y]
=\frac{r(1.6)+0.36y}{r+0.36},
\qquad
\operatorname{Var}(z_m\mid z_p,y)=\frac{0.36r}{r+0.36}.
\]

Here and in this calculation, the second argument of a univariate Normal is its variance. For comparison, the independent \(\mathcal N(0,1)\) prior gives posterior mean \(y/(1+r)\).

| Own observation | Independent estimate | Class-informed estimate |
|---|---:|---:|
| No observation in this domain | 0.000 | 1.600 |
| \(y=2.5\), measurement variance \(r=0.25\) | 2.000 | 2.131 |
| \(y=-0.5\), measurement variance \(r=0.25\) | −0.400 | 0.361 |
| \(y=-0.5\), measurement variance \(r=0.001\) | −0.500 | −0.494 |

The first two rows show the intended mechanism: missing or sparse measurements can be interpreted using an informative relationship instead of only the population center. The third shows negative transfer when the relationship is misleading and contradictory evidence is imprecise. The fourth shows that sufficiently precise direct evidence can establish regression. For fixed parameters and an identified direction, the mean tends to \(y\) as \(r\) tends to zero.

Actual fits must propagate classmate uncertainty and infer both releases jointly. They cannot insert a published classmate score as if it were a known trait. A missing domain still has nonzero conditional variance; its borrowed estimate is not a measured result.

## 7. Effort and configuration must remain identifiable objects

For a release with a documented standard reference \(e_0(m)\), retain

\[
z_{m,e}=z_m+d_{m,e},\qquad d_{m,e_0(m)}=0.
\]

The minimum first experiment uses the existing signed standard/maximum effort prior and the existing observation assignments. It changes only the class prior. This isolates whether class information helps; it does not solve the missing-effort policy by assumption.

For two variable-effort releases, a maximum comparison observes the sum

\[
(z_m-z_p)+(d_{m,\max}-d_{p,\max}).
\]

Maximum-only observations cannot generally separate these terms. A richer effort-response surface requires matched configuration measurements. Do not identify effective compute from an ordered word label or impose positive effort effects on every domain.

A separately declared configuration-aware model can marginalize an unknown setting:

\[
p(y_i\mid\Theta,\text{metadata})
=\sum_{e\in\mathcal E_m}\pi_{ie}\,p(y_i\mid s=(m,e,h,t,b),\Theta).
\]

The supported setting set and probabilities must be justified. Rows from one evaluation batch share a setting when the protocol says so; the mixture should then be over the batch's joint likelihood. Where weights cannot be supported, use labeled scenarios rather than claiming an identified mixture. This is a separate candidate, not additional pseudo-evidence in the class experiment.

## 8. Measurement operators and information geometry

### 8.1 Benchmarks are measurements, not independent domain certificates

A linearized benchmark measures a projection \(a_b^{\mathsf T}z_s\). One measurement with positive loadings on all five coordinates still supplies only one projected direction before other information is introduced.

For a system's own observations, let \(A_s\) collect those rows and let \(R_s\) be their residual covariance in a stated linear-Gaussian approximation. Condition on the specified measurement parameters or marginalize nuisance effects consistently. Define

\[
J_s=A_s^{\mathsf T}R_s^{-1}A_s.
\]

The range of \(J_s\) is the measured subspace; its null space contains directions that those measurements do not identify. Small eigenvalues indicate weak directions even if the matrix has full rank. Counting positive domain loadings cannot replace this analysis.

Unknown source and condition parameters can reduce effective information. When a regular joint Fisher information matrix for traits and nuisance parameters is available, its nuisance-adjusted Schur complement provides the corresponding local information. The calculation must state its regularity and conditioning assumptions; an arbitrary Hessian from a heavy-tailed nonlinear posterior is not automatically a positive information matrix.

### 8.2 Separate own measurements from borrowed precision

In the linear-Gaussian approximation, let \(C_0\) be the system's conditional covariance given all permissible other evidence, before adding its own observations. Then

\[
C_{\mathrm{post}}=(C_0^{-1}+J_s)^{-1}.
\]

The eigenvalues of \(C_0^{1/2}J_sC_0^{1/2}\) show how much its own measurements constrain different directions relative to already borrowed information. This is an exact identity only in the stated Gaussian model; in the actual nonlinear fit, use refits and calibrated approximations.

For a target index direction \(w\), distinguish a precise estimate caused by \(w^{\mathsf T}C_0w\) already being small from one whose precision is substantially improved by the system's own observations. Neither should be disguised as a benchmark-count bonus or as a fabricated percentage of direct evidence.

## 9. A theorem about shared-benchmark dominance

### 9.1 The noiseless question

Consider the idealized case where matched benchmark differences measure \(Ad\) exactly, with \(d=z_A-z_B\), no model-specific residual differences, and common measurement parameters. Let the overall target difference be \(w^{\mathsf T}d\).

The implication

\[
Ad\ge0\quad\Longrightarrow\quad w^{\mathsf T}d\ge0
\quad\text{for every }d
\]

holds **if and only if**

\[
\boxed{w\in\operatorname{cone}\{a_1,\ldots,a_B\}},
\]

where the cone consists of nonnegative linear combinations of the measured row directions.

**Proof.** If \(w=A^{\mathsf T}q\) for \(q\ge0\), then \(w^{\mathsf T}d=q^{\mathsf T}Ad\ge0\). Conversely, if \(w\) is outside the finitely generated closed row cone, a separating hyperplane gives a \(d\) with \(Ad\ge0\) and \(w^{\mathsf T}d<0\). This is a form of Farkas' alternative. [Convex optimization reference](https://web.stanford.edu/~boyd/cvxbook/index.html).

This result concerns exact capability projections. Reported point estimates, uncertain loadings, effort mismatch, and benchmark-specific residuals require additional inference; they do not strengthen the implication automatically.

### 9.2 Concrete counterexample using the five shared loading rows

Use the accepted loading rows for DeepSWE 1.1, Terminal-Bench 4.0, MathArena, Finance Agent v2, and Arena Text. In an **illustrative equal-scale coordinate convention**, take

\[
d=(1.6,1,1,-5,1)^{\mathsf T}.
\]

Then:

| Shared condition | Loading projection \(\lambda_b^{\mathsf T}d\) |
|---|---:|
| DeepSWE 1.1 | +1.15 |
| Terminal-Bench 4.0 | +1.03 |
| MathArena | +1.00 |
| Finance Agent v2 | +0.01 |
| Arena Text | +0.13 |

Every projection is positive, but the equal-coordinate mean difference is \(-0.08\). All numbers above were checked with exact rational arithmetic against the accepted loading rows.

This is **not an estimate of the Gemini domain difference** and is not an assertion about the fitted panel scale. It proves that the broad logical claim can fail even with exact shared measurements. For actual ACI draws, use \(w_k\propto w_{uk}/s_{Pk}\) in raw coordinates and the actual measured directions, with all relevant uncertainty. Strict dominance also needs a positive margin, not just nonnegative projections.

Therefore, forcing overall order whenever one system wins every available shared benchmark would change the target or impose an additional assumption. An Elo bonus cannot remove this mathematical issue.

## 10. Empirical ordering, model-assisted ordering, and partial order

On operational task functions, define

\[
s\succeq_Q t\quad\Longleftrightarrow\quad r_s(x)\ge r_t(x)\text{ for }Q\text{-almost every }x.
\]

This is a partial order on the equivalence classes of task functions. If it holds, every nonnegative integrable task-weight functional on that support also favors \(s\). It need not hold merely because a few benchmark averages favor \(s\).

ACI should distinguish:

| Conclusion | Basis |
|---|---|
| Leads on shared measured conditions | Matched observations with their joint uncertainty |
| Higher estimated profile utility or latent index | Full posterior and declared target/profile assumptions |
| Robust superiority across declared assumptions | The conclusion survives prespecified source, configuration, class, and prior scenarios |
| Unresolved | Available evidence does not establish the selected practical margin |

Different matched subsets can produce cyclic comparisons. A pair-specific common-support comparison is useful, but it is not automatically one transitive global leaderboard.

## 11. Partial identification when the missing task mass is large

If the operational utility target is actually defined on \([0,1]\), and the measured representative strata carry known target probability mass \(q\), a simple bound is available. Suppose the weighted difference integrated over the measured strata is \(d_O\). The unmeasured contribution lies in \([-(1-q),1-q]\), so

\[
V(A)-V(B)\in[d_O-(1-q),\ d_O+(1-q)].
\]

This is an assumption-light identification bound for the stated target, not a posterior credible interval. Add sampling uncertainty in \(d_O\) appropriately. A class prior can sharpen a posterior within or around an expanded uncertainty analysis, but it cannot turn assumptions into measured task mass.

Benchmark count divided by 19 is **not** \(q\). The bound requires a real task-sampling definition and representativeness; current coverage counts do not supply it. This distinction prevents an attractive coverage percentage from being mistaken for evidence about all real-world tasks.

## 12. Scoring and calibration

The first class-prior experiment retains the baseline likelihood, fixed loadings, and profile transformations. Score comparisons use paired draws from the same joint posterior and keep the same practical margin and uncertainty requirements. Direct cells remain attached to actual system observations.

Specifically, for \(S\) retained joint draws and a one-point practical margin, report

\[
\widehat P_u(A>B+1)=\frac1S\sum_{j=1}^S
\mathbf1\!\left[I_{Au}^{(j)}-I_{Bu}^{(j)}>1\right].
\]

The practical-ordering diagnostic supports \(A\) only when this probability is at least 0.90, and supports \(B\) under the analogous reverse condition. Otherwise it is unresolved. The directional probability \(P(I_{Au}>I_{Bu})\) remains a separate quantity. These probability rules do not establish equivalence when neither direction passes, and they do not replace publication eligibility checks.

For a class-model candidate, keep the legacy own-data, family-share, and concentration approximations out of public experimental scorecards. They require revalidation under borrowing. Report observed cells, uncertainty, and clearly labeled model-sensitivity results instead of inheriting a familiar badge with an unsupported interpretation.

Compute domain/profile panel centers and scales inside each draw as before. Report raw traits, class/release covariance quantities, and panel changes alongside candidate score movement. Use the explicit cross-calibration accounting in the earlier revision-2 specification when comparing independently fitted candidates; its decomposition is descriptive and coordinate-dependent.

No class mean, best-performing sibling, newest-model label, or number of releases in a class is added to the displayed score. Cost-normalized performance is a separately declared target and does not silently enter the current capability index.

For a future operational utility score, a fixed positive affine display map can provide stable units without a refitted panel. Its task distribution, utility definitions, and anchor constants must be published. This is a separate score design, not an undocumented replacement for ACI.

## 13. Choose new evidence to resolve the uncertainty

Let \(x\) contain the relevant latent traits of both compared systems, with current covariance \(C\), and let the target difference be \(h^{\mathsf T}x\). For a possible new linear-Gaussian measurement

\[
y=a^{\mathsf T}x+\epsilon,\qquad\epsilon\sim\mathcal N(0,v),
\]

the reduction in target variance is

\[
\boxed{
\Delta V(a)=\frac{(h^{\mathsf T}Ca)^2}{v+a^{\mathsf T}Ca}.
}
\]

This follows from the Gaussian covariance update. For the actual nonlinear model, approximate it locally or estimate expected reduction using posterior predictive simulation. Include new family, source, task, and run uncertainty in the prediction; reported sampling SE alone is generally insufficient.

Select prospective evaluations by expected information for the unresolved target and a declared evaluation budget. High benchmark discrimination alone does not make a test informative for a particular pair or missing domain.

For Gemini, the apparent knowledge gap makes a matched knowledge evaluation a natural candidate for this calculation. Paired standard/maximum configurations on the same task sample would additionally help separate base capability from effort response. Neither is asserted to be optimal until the relevant covariance and costs are evaluated.

If the scientific question is performance at equal compute, assign comparable supported resource budgets prospectively. Simply conditioning on realized tokens after the fact does not identify the effect of compute.

## 14. What the present dataset can support

### 14.1 Observed structure

A read-only audit of the accepted 1.4.3 input found:

| Quantity | Count |
|---|---:|
| Observations | 924 |
| Releases | 110 |
| Effort-class systems | 131 |
| Conditions | 19 |
| Benchmark families | 16 |
| Source protocols | 19 |
| Releases with two fitted effort-class systems | 21 |
| Releases with any same-condition/protocol intersection across those effort classes | 18 |
| Such condition/protocol intersections, summed across releases | 42 |

The 42 intersections use the existing assigned effort classes. They include approximate and assumed assignments; they are not 42 randomized, compute-controlled experiments.

By largest domain loading there are six agentic, four code, five reasoning, two communication/professional, and two knowledge conditions. The two knowledge-dominant conditions are versions from the same SimpleQA family. Other conditions have knowledge cross-loadings, but they do not create independent direct knowledge instruments merely by touching that coordinate.

No reviewed capability-transfer class registry has been established by this audit. The amount of evidence identifying \(\rho\), or a richer covariance decomposition, is therefore currently unknown. Numerical row count does not answer that question.

This supports starting with a small nested class model and precise measurement diagnostics. It does not justify freely fitting a rich effort surface, class-specific correlation matrices, and unknown benchmark loadings simultaneously.

### 14.2 Selective reporting is a separate identification problem

Let \(Y\) denote potential results on a defined evaluation grid, \(R\) indicate which results are observed, and \(X\) contain recorded selection-relevant metadata. Distinguish whether a test was run, whether its result was published, and whether it met ACI's admission policy. A general observation model has the form

\[
p(Y,R\mid X,\theta,\gamma)
=p(Y\mid X,\theta)\,p(R\mid Y,X,\gamma).
\]

Inference integrates the unobserved results. Omitting the second factor requires an ignorability argument, such as missingness at random conditional on the recorded information, distinct outcome and selection parameters, and the corresponding prior factorization for Bayesian inference. Missingness at random does not mean random benchmark assignment. [Rubin's original missing-data analysis](https://academic.oup.com/biomet/article-abstract/63/3/581/270932) establishes the relevant conditions.

If unfavorable unreported results affect publication probability, observed scores and class relationships alone generally do not identify that selection process. A class model can propagate the resulting optimism as well as useful information. Adding more mathematical structure does not recover the unseen publication decisions.

The first class experiment must therefore declare its conditional ignorability assumption and evaluate prespecified selective-reporting scenarios. It should include masks concentrated on poor outcomes and missing domains, alongside ordinary masked results. These stress tests cannot establish that a chosen selection scenario is true. Prospective registered evaluations, independently selected task samples, and records of attempted but unpublished runs provide stronger evidence about the process.

Do not fit a flexible publication model and claim its parameters are identified merely because the optimizer or sampler returns values. A separate candidate needs externally supported selection information or explicit, reported sensitivity assumptions.

## 15. Minimum empirical program

### 15.1 Class construction and negative transfer

Freeze documented classes independently of preferred rankings. Include singleton and doubtful relationships. Test class omission and deliberate wrong-class stress scenarios. The Gaussian class model can borrow incorrectly; lowering global \(\rho\) does not detect every bad class. Heavy-tailed measurement residuals also do not solve false class membership.

Keep the motivating Gemini component out of hyperprior selection and confirmatory promotion evidence. It remains an illustrative posterior probe.

### 15.2 Primary prediction task

Use family-disjoint successor-domain masks on already calibrated conditions, retaining parent/classmate training evidence. Remove every source and effort observation for the target successor families. Record weak remaining cross-loadings. Generic interpolation and entirely unseen conditions are separate evaluation tasks.

Compare the independent baseline, the restricted class model, and only those additional candidates selected during development. Preserve grouping, future cutoffs, source effects, and all prior-selection history. A favorable Gemini rank change is not a performance metric.

### 15.3 Target external performance

Add fresh task samples that approximate declared usage domains and are not reused for model/benchmark selection. Check whether latent predictions transfer to them. For professional work, measure verified task outcomes rather than assuming preference ratings fully represent professional competence.

A benchmark loading is supported when its task content and predictive relationships are credible; a narrow posterior alone does not validate the domain name.

### 15.4 Calibration and failure cases

Evaluate proper predictive scores, coverage, false confident rankings, and performance under missingness, regressions, effort label shifts, shared optimistic sources, and false classes. Cluster the primary uncertainty over the original documented related-release components, before masking or class exclusions; do not treat several releases from one component as independent replications. Benchmark-family and protocol dependence require additional sensitivity checks. Few independent components can limit both precision and power.

Use simulation-based calibration for the inference implementation and misspecified simulations for scientific robustness. Existing numerical acceptance requirements remain necessary. Public candidate outputs remain experimental until empirical promotion criteria are locked and met.

## 16. Typed responsibilities for a future implementation

These are conceptual responsibilities, not implemented software classes:

| Object | Owns | Must not do |
|---|---|---|
| System specification | Release, configuration, harness, tools, budget identity | Treat missing settings as verified facts |
| Task population | Task sampling and utility definition | Infer task mass from benchmark count |
| Measurement specification | Native likelihood, transforms, sampling unit, dependence | Turn every percentage into a binomial count |
| Transfer class registry | Documentation, comparability, frozen membership | Choose classes to obtain desired ranks |
| Capability distribution | Class/release covariance and effort components | Add another prior on deterministic traits |
| Evidence geometry | Measured directions and target-relevant information | Treat prior precision as direct evidence |
| Score functional | Profile target and calibration edition | Change task weights or panel silently |
| Comparison result | Paired probabilities, margins, support, scenarios | Convert common-subset wins into universal dominance |
| Evaluation planner | Expected value of additional measurements | Favor tests merely because they improve a preferred score |

Separating these responsibilities makes invalid operations visible. It also makes future extensions testable: a change in task utility, class covariance, effort mapping, or source likelihood is identified as a change to a specific mathematical object.

## 17. What is established and what is not

| Claim | Status |
|---|---|
| The proposed class covariance is positive semidefinite | Proved by its construction |
| The restricted model preserves every release's marginal covariance | Proved conditional on its parameters |
| Zero pooling recovers the independent baseline | Proved |
| Adding an unobserved member supplies no evidence under fixed metadata | Proved by marginalization |
| The class prior gives no automatic successor advantage | Proved |
| Shared measured dominance implies a target ordering exactly when the target lies in the measurement cone, under stated idealized assumptions | Proved using a theorem of alternatives |
| The displayed loading counterexample has positive shared projections and negative equal-coordinate mean | Checked with exact arithmetic |
| The recorded dataset has 18 releases with assigned-class effort intersections | Checked from the accepted input |
| A proposed class reflects real capability transfer | Requires documentation and validation |
| One global pooling fraction is adequate | Unestablished |
| Effort labels identify comparable compute | Not established by labels |
| The five-domain index predicts all real-world tasks | Unestablished; requires defined task populations and external evaluation |
| The class model improves Gemini's ranking or overall predictive quality | No candidate fit has been run |

## 18. References and reproducibility

- [Accepted 1.4.3 input](../audits/1.4.3-effort-coverage/accepted-input.json), SHA-256 `e5d654f41019df63f9f78c28efcd8d83db9bf425bf63e4d2cadb3a166fe23578` — counts, assigned effort intersections, and fixed loading rows.
- [Current scoring mathematics](../scoring-math.md) and [methodology](../methodology.md) — retained measurement model and display definitions; exact frozen constants are in the accepted input.
- [Earlier related-release prior specification](aci-1.5.0-related-release-prior.md) — predecessor random-walk siblings, detailed baseline likelihood, and descriptive cross-calibration accounting. These are different candidates, not additional factors in the class model.
- [Earlier experiment-lock draft](aci-1.5.0-related-release-experiment-lock.md) — useful evaluation safeguards; it does not automatically preregister this new class candidate.
- [Rasmussen and Williams, covariance functions](https://gaussianprocess.org/gpml/chapters/RW4.pdf) — positive semidefinite covariance kernels and their construction.
- [Bonilla, Chai, and Williams, multi-task Gaussian process prediction](https://proceedings.neurips.cc/paper/2007/hash/66368270ffd51418ec58bd793f2d9b1b-Abstract.html) — covariance-based sharing across tasks and its assumptions.
- [Boyd and Vandenberghe, Convex Optimization](https://web.stanford.edu/~boyd/cvxbook/index.html) — cones, duality, and the theorem of alternatives used for the ordering result.
- [Rubin, Inference and missing data](https://academic.oup.com/biomet/article-abstract/63/3/581/270932) — conditions for ignoring the observation process in likelihood and Bayesian inference.

The file specifies a mathematical architecture and a small candidate within it. The proofs establish properties of that architecture; they do not certify the empirical assumptions. No production scoring, class registry, or published ranking has been changed.
