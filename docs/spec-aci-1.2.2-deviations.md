# ACI method 1.2.2 specification vs the 1.2.3 implementation

The normative 1.2.2 text supplied by the project owner (the "math, method 1.2.2" document) is the
reference for the model. Method 1.2.3 is that model made to run on the 2026-09-04 registry data.
Every place where the implementation departs from the 1.2.2 text is listed here with the reason;
`docs/methodology.md` states the rules actually enforced.

| §1.2.2 | Specification | 1.2.3 implementation | Why |
|---|---|---|---|
| §3.6 `class_unassigned` | an inherited effort tier that matches no system class is rejected | never rejected: fixed-effort models take every observation; variable-effort models map the tier to the nearer class; unknown/intermediate tiers are flagged `metadata_incomplete` (1.5× run noise) | 468 of 1,298 observations were rejected because only 15 of 88 models declare effort tiers; the flag keeps the spec's noise inflation without discarding evidence |
| §3.5 money | requires ≥ 3 run balances | also accepts a reported mean balance with SE (delta method on log₂) | public leaderboards publish mean ± SE, not per-run balances |
| §2.6 calibration panel | ≥ 2 independent cells in **every** domain per panel system | ≥ 1 independent cell in every domain and ≥ 2 in at least three; 16-system panel, ≥ 12 fitted | no fitted system satisfied the 1.2.2 rule; the audit now publishes every qualifying candidate |
| §11.2 admission, §2.4 protocols | active conditions need complete identity, grader, tool/network policy, a dated source protocol | only likelihood-critical fields (`obs_type`, `default_k`, domains) are mandatory; missing pins and missing protocols are inherited as `metadata_incomplete` | the 1.2.2 registry gates left 5 of 24 benchmarks active and 46 observations in the fit; §1 already says missing metadata is flagged, not rejected |
| §5.3 prior on $\varsigma_k$ | HalfNormal(1.5) | LogNormal(0, 0.5) | HalfNormal let the software-code and communication traits collapse (spread 0.14 / 0.13 vs 1.7); with LogNormal every domain is live and $\Omega$ is interpretable |
| §6 sampler | 2,000 + 2,000, target accept 0.9 | 2,000 + 3,000, target accept 0.98, diagonal mass matrix, R-hat/ESS/MCSE judged on $\tilde Z$, $G$ and scale-free hyperparameters | a dense block saturated the tree depth; 0.9 left 21 divergences, 0.95 left 3, 0.98 gives zero; raw $Z$/$\beta$ sit on the unidentified ridge by design |
| §8.2 tiers | Verified ≤ 8 points, Ranked ≤ 12; thresholds frozen after SBC | Verified ≤ 12, Ranked ≤ 20, concentration ≤ 0.50 / 0.80, family share ≤ 0.50 / 0.80; **interim**, not SBC-frozen | median 90 % width of a well-covered system is 13.5 points on this data; §12.1 SBC is not implemented yet, so the thresholds are calibrated by hand and marked as such |
| §8.2 domain point score | width ≤ 15 | width ≤ 20; own cells count only when the benchmark loads ≥ 0.25 on the domain | same width reasoning; a 5 % spill-over share is not domain evidence |
| §8.1 $R_s$ | Gaussian conditional of $Z_s$ given hyperparameters with own data removed | $1 - \operatorname{Var}(Q \mid \mathcal D)/\operatorname{Var}_{\text{prior}}$ with a fixed prior variance of 100 display points² | the exact conditional is not implemented; the proxy overstates $R_s$ for systems whose precision is borrowed through links |
| §10.1 LOO PIT residuals, §10.8 adversarial fit, §10.4 family refits | computed every run | published as `null`; cell residuals are posterior-median misfit / $\sigma_b$ | not implemented in this release; nothing pretends to be computed |
| §12 acceptance | SBC, stress tests, holdouts, invariance before release | not run; `validation.ts` contains comparators only | not implemented; a run is accepted on §6 convergence gates alone |
| §1.1 product runtimes | `product:<runtime>` systems | not represented; product runs enter as `max-common` with `harness` recorded | registry has no product runtime declarations yet |
| §7.3 basket eligibility | `utility_status = eligible` per condition | baskets are computed on all active conditions with the corrected-success map | utility admission (§11.3) is not implemented |
| publication | — | a run set is published when the mixed view ranks ≥ 1 system; profile views with no Ranked system are interval-only | the chat basket needs a published communication score, which no system has; blocking the whole release would hide the two publishable views |

Everything else in the 1.2.2 text (system classes std/max-common, single-system rule, five correlated traits
with LKJ(2), unpinned conditions, per-draw panel standardization, $t_4$ misfit mixture, source-domain and
protocol×condition effects, marginalized run noise for SE-only observations, practical-margin pairwise
comparisons, contamination states, zero-divergence gate, MCSE ≤ 0.3, run-artifact provenance) is implemented as written.
