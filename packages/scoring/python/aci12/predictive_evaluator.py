"""Production-faithful predictive evaluator for ACI 1.5.0 validation.

Reuses exact NumPyro/aci12 observation likelihoods:
- normal / a_prime: Normal(location, sqrt(variance + omega^2))
- a_single: Binomial(n_tasks, q) where q = chance + (ceiling - chance) * sigmoid(location + omega * eps)
- a_total: Normal(total * q, sqrt(total * q * (1 - q) * [1 + (k - 1) * rho]))
- a_exact: Binomial or BetaBinomial per task with concentration (1 - rho) / rho

Integrates withheld shared cell, family, and protocol-condition effects jointly
instead of leaking learned held-out residuals or multiplying marginal predictives.
Conditioned on available training effects; deterministic Monte Carlo with error assessment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
import scipy.special as sp

from .experiment import (
    DEFAULT_DOMAIN_LOADING_THRESHOLD,
    DEFAULT_PREDICTION_STRATUM,
    base_model_id,
    select_primary_scoring_observations,
)


def _stable_seed(base_seed: int, identifier: str) -> int:
    """Derive a stable 31-bit seed invariant to Python hash seed randomization."""
    h = hashlib.sha256(identifier.encode("utf-8")).digest()
    offset = int.from_bytes(h[:8], byteorder="big") % (2**31 - 1)
    return (base_seed + offset) % (2**31 - 1)


def _sigmoid(x: np.ndarray | float) -> np.ndarray | float:
    return sp.expit(x)


def _log_beta(a: np.ndarray | float, b: np.ndarray | float) -> np.ndarray | float:
    return sp.gammaln(a) + sp.gammaln(b) - sp.gammaln(a + b)


def _log_comb(n: int | np.ndarray, k: int | np.ndarray) -> np.ndarray | float:
    return sp.gammaln(n + 1) - sp.gammaln(k + 1) - sp.gammaln(n - k + 1)


def observation_log_likelihood(
    obs: Mapping[str, Any],
    location: float | np.ndarray,
    omega: float | np.ndarray,
    run_eps: float | np.ndarray,
    rho_benchmark: float | np.ndarray = 0.0,
) -> np.ndarray | float:
    """Compute exact production observation log-likelihood for one observation row.

    Matches aci12.model.aci_model observation likelihoods exactly.
    """
    likelihood = obs.get("likelihood")
    chance = float(obs.get("chance_level", 0.0))
    ceiling = float(obs.get("ceiling", 1.0))

    if likelihood in ("normal", "a_prime"):
        y = float(obs.get("y", 0.0))
        variance = float(obs.get("variance", 0.0))
        total_var = np.maximum(variance + omega**2, 1e-12)
        return -0.5 * (np.log(2.0 * np.pi * total_var) + ((y - location) ** 2) / total_var)

    elif likelihood == "a_single":
        x = int(round(float(obs.get("x", 0.0))))
        n_tasks = int(obs.get("n_tasks", 1))
        linear = location + omega * run_eps
        prob = np.clip(chance + (ceiling - chance) * _sigmoid(linear), 1e-6, 1.0 - 1e-6)
        log_comb_val = _log_comb(n_tasks, x)
        return log_comb_val + x * np.log(prob) + (n_tasks - x) * np.log(1.0 - prob)

    elif likelihood == "a_total":
        x = float(obs.get("x", 0.0))
        n_tasks = float(obs.get("n_tasks", 1))
        k_trials = float(obs.get("k_trials", 1))
        linear = location + omega * run_eps
        prob = np.clip(chance + (ceiling - chance) * _sigmoid(linear), 1e-6, 1.0 - 1e-6)
        total = n_tasks * k_trials
        design_effect = 1.0 + (k_trials - 1.0) * rho_benchmark
        var = np.maximum(total * prob * (1.0 - prob) * design_effect, 1e-6)
        mu = total * prob
        return -0.5 * (np.log(2.0 * np.pi * var) + ((x - mu) ** 2) / var)

    elif likelihood == "a_exact":
        counts = np.asarray(obs.get("per_task_counts", []), dtype=float)
        k_trials = int(obs.get("k_trials", 1))
        linear = location + omega * run_eps
        prob = np.clip(chance + (ceiling - chance) * _sigmoid(linear), 1e-6, 1.0 - 1e-6)
        use_beta_binomial = bool(obs.get("use_beta_binomial", False))
        cell_rho = float(rho_benchmark)

        if use_beta_binomial:
            concentration = max((1.0 - cell_rho) / max(cell_rho, 1e-6), 1e-3)
            alpha_param = prob * concentration
            beta_param = (1.0 - prob) * concentration
            log_comb_k = _log_comb(k_trials, counts)
            log_terms = log_comb_k + _log_beta(counts + alpha_param, k_trials - counts + beta_param) - _log_beta(alpha_param, beta_param)
            return float(np.sum(log_terms))
        else:
            log_comb_k = _log_comb(k_trials, counts)
            log_terms = log_comb_k + counts * np.log(prob) + (k_trials - counts) * np.log(1.0 - prob)
            return float(np.sum(log_terms))

    else:
        raise ValueError(f"Unsupported observation likelihood: {likelihood!r}")


def sample_observation_predictive(
    obs: Mapping[str, Any],
    location: float | np.ndarray,
    omega: float | np.ndarray,
    run_eps: float | np.ndarray,
    rho_benchmark: float | np.ndarray,
    rng: np.random.Generator,
) -> float:
    """Sample a synthetic outcome in native units for calibration and interval scoring."""
    likelihood = obs.get("likelihood")
    chance = float(obs.get("chance_level", 0.0))
    ceiling = float(obs.get("ceiling", 1.0))

    if likelihood in ("normal", "a_prime"):
        variance = float(obs.get("variance", 0.0))
        total_sd = np.sqrt(max(variance + float(omega)**2, 1e-12))
        return float(rng.normal(float(location), total_sd))

    elif likelihood == "a_single":
        n_tasks = int(obs.get("n_tasks", 1))
        linear = float(location) + float(omega) * float(run_eps)
        prob = float(np.clip(chance + (ceiling - chance) * _sigmoid(linear), 1e-6, 1.0 - 1e-6))
        return float(rng.binomial(n_tasks, prob))

    elif likelihood == "a_total":
        n_tasks = float(obs.get("n_tasks", 1))
        k_trials = float(obs.get("k_trials", 1))
        linear = float(location) + float(omega) * float(run_eps)
        prob = float(np.clip(chance + (ceiling - chance) * _sigmoid(linear), 1e-6, 1.0 - 1e-6))
        total = n_tasks * k_trials
        design_effect = 1.0 + (k_trials - 1.0) * float(rho_benchmark)
        var = max(total * prob * (1.0 - prob) * design_effect, 1e-6)
        return float(rng.normal(total * prob, np.sqrt(var)))

    elif likelihood == "a_exact":
        counts = np.asarray(obs.get("per_task_counts", []), dtype=float)
        n_tasks = len(counts)
        k_trials = int(obs.get("k_trials", 1))
        linear = float(location) + float(omega) * float(run_eps)
        prob = float(np.clip(chance + (ceiling - chance) * _sigmoid(linear), 1e-6, 1.0 - 1e-6))
        use_beta_binomial = bool(obs.get("use_beta_binomial", False))
        cell_rho = float(rho_benchmark)

        if use_beta_binomial:
            concentration = max((1.0 - cell_rho) / max(cell_rho, 1e-6), 1e-3)
            alpha_param = prob * concentration
            beta_param = (1.0 - prob) * concentration
            p_draws = rng.beta(alpha_param, beta_param, size=n_tasks)
            draws = rng.binomial(k_trials, p_draws)
            return float(np.sum(draws))
        else:
            draws = rng.binomial(k_trials, prob, size=n_tasks)
            return float(np.sum(draws))

    else:
        raise ValueError(f"Unsupported observation likelihood: {likelihood!r}")


def observation_native_actual(obs: Mapping[str, Any]) -> float:
    """Extract the actual observed score in native units."""
    likelihood = obs.get("likelihood")
    if likelihood in ("normal", "a_prime"):
        return float(obs.get("y", 0.0))
    elif likelihood in ("a_single", "a_total"):
        return float(obs.get("x", 0.0))
    elif likelihood == "a_exact":
        return float(np.sum(np.asarray(obs.get("per_task_counts", []), dtype=float)))
    raise ValueError(f"Unknown likelihood {likelihood!r}")


def compute_interval_score_90(lower: float, upper: float, actual: float) -> float:
    """Winkler interval score at alpha=0.10 (90% interval). Lower is better."""
    width = upper - lower
    penalty_low = 20.0 * max(0.0, lower - actual)
    penalty_high = 20.0 * max(0.0, actual - upper)
    return width + penalty_low + penalty_high


@dataclass
class EvaluatorConfig:
    n_mc_draws: int = 50
    seed: int = 20260907
    stratum: str = DEFAULT_PREDICTION_STRATUM
    calculate_intervals: bool = True


@dataclass
class GroupEvaluation:
    group_id: str
    target_successor_model: str
    target_domain: str
    n_observations: int
    joint_lpd: float
    normalized_lpd: float
    mcse_lpd: float
    observation_ids: list[str] = field(default_factory=list)
    mean_coverage_90: float = 0.0
    mean_interval_score_90: float = 0.0


@dataclass
class PredictiveEvaluationResult:
    joint_lpd: float
    normalized_lpd: float
    mcse_lpd: float
    n_groups: int
    n_observations: int
    mean_coverage_90: float
    mean_interval_score_90: float
    groups: list[GroupEvaluation] = field(default_factory=list)
    observations: list[dict[str, Any]] = field(default_factory=list)
    diagnostics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ProductionPredictiveEvaluator:
    """Evaluates joint predictive density and native calibration on held-out groups."""

    def __init__(
        self,
        train_data: Mapping[str, Any],
        posterior_samples: Mapping[str, np.ndarray],
        config: EvaluatorConfig | None = None,
    ) -> None:
        self.train_data = train_data
        self.samples = {k: np.asarray(v) for k, v in posterior_samples.items()}
        self.config = config or EvaluatorConfig()

        # Validate posterior dimensions
        self.n_draws = self.samples["beta"].shape[0] if "beta" in self.samples else 0
        if self.n_draws == 0:
            raise ValueError("Posterior samples must contain non-empty beta site")

        self.n_benchmarks = int(train_data["n_benchmarks"])
        self.n_systems = int(train_data["n_systems"])
        self.n_families = int(train_data["n_families"])
        self.n_protocols = int(train_data.get("n_protocols", 1))
        self.system_ids = list(train_data["system_ids"])
        self.benchmark_ids = list(train_data["benchmark_ids"])
        self.benchmark_domains = np.asarray(train_data["benchmark_domains"], dtype=float)
        self.benchmark_family_index = np.asarray(train_data["benchmark_family_index"], dtype=int)
        self.metadata_factor = float(train_data.get("metadata_incomplete_multiplier", 1.5))

        # Index training presence and counts for conditional effects
        self._training_cell_counts: dict[tuple[int, int], int] = {}
        self._training_family_counts: dict[tuple[int, int], int] = {}
        self._training_cells: set[tuple[int, int]] = set()
        self._training_families: set[tuple[int, int]] = set()
        self._training_pairs: dict[tuple[int, int], int] = {}
        for row in train_data.get("observations", []):
            s = int(row["system_index"])
            b = int(row["benchmark_index"])
            f = int(self.benchmark_family_index[b])
            p = int(row.get("protocol_index", 0))
            self._training_cells.add((s, b))
            self._training_families.add((s, f))
            self._training_cell_counts[(s, b)] = self._training_cell_counts.get((s, b), 0) + 1
            self._training_family_counts[(s, f)] = self._training_family_counts.get((s, f), 0) + 1
            pair = (p, b)
            if pair not in self._training_pairs:
                self._training_pairs[pair] = len(self._training_pairs)

        # Map (system, benchmark) to cell_index in train_data if available
        self._cell_system_benchmark_to_index: dict[tuple[int, int], int] = {}
        if "cell_system_index" in train_data and "cell_benchmark_index" in train_data:
            cs = train_data["cell_system_index"]
            cb = train_data["cell_benchmark_index"]
            for c_idx, (s, b) in enumerate(zip(cs, cb)):
                self._cell_system_benchmark_to_index[(int(s), int(b))] = c_idx

    def evaluate_group(
        self,
        observations: Sequence[Mapping[str, Any]],
        group_id: str,
        target_successor_model: str = "",
        target_domain: str = "",
    ) -> GroupEvaluation:
        """Compute joint predictive log density for an observation group."""
        n_obs = len(observations)
        if n_obs == 0:
            raise ValueError(f"Group {group_id} has no observations")

        rng = np.random.default_rng(_stable_seed(self.config.seed, group_id))
        n_mc = self.config.n_mc_draws

        # Identify unique shared entities in this group
        cell_map: dict[tuple[int, int], list[int]] = {}
        family_map: dict[tuple[int, int], list[int]] = {}
        pair_map: dict[tuple[int, int], list[int]] = {}

        parsed_obs: list[dict[str, Any]] = []
        for idx, obs in enumerate(observations):
            # Fail-closed checks on system index
            if "train_system_index" in obs:
                sys_idx = int(obs["train_system_index"])
            elif "system_index" in obs:
                sys_idx = int(obs["system_index"])
            else:
                raise KeyError(f"Observation {idx} missing system index ('train_system_index' or 'system_index')")

            if not (0 <= sys_idx < self.n_systems):
                raise IndexError(f"Observation {idx} system index {sys_idx} out of bounds [0, {self.n_systems})")

            # Check system / model ID match if present
            if "system_id" in obs and obs["system_id"] != self.system_ids[sys_idx]:
                raise ValueError(
                    f"Observation {idx} system_id mismatch: expected {self.system_ids[sys_idx]!r}, got {obs['system_id']!r}"
                )

            # Fail-closed checks on benchmark index
            if "train_benchmark_index" in obs:
                bench_idx = int(obs["train_benchmark_index"])
            elif "benchmark_index" in obs:
                bench_idx = int(obs["benchmark_index"])
            else:
                raise KeyError(f"Observation {idx} missing benchmark index ('train_benchmark_index' or 'benchmark_index')")

            if not (0 <= bench_idx < self.n_benchmarks):
                raise IndexError(f"Observation {idx} benchmark index {bench_idx} out of bounds [0, {self.n_benchmarks})")

            if "benchmark_id" in obs and obs["benchmark_id"] != self.benchmark_ids[bench_idx]:
                raise ValueError(
                    f"Observation {idx} benchmark_id mismatch: expected {self.benchmark_ids[bench_idx]!r}, got {obs['benchmark_id']!r}"
                )

            fam_idx = int(self.benchmark_family_index[bench_idx])

            # Protocol index fail-closed
            proto_idx = int(obs.get("protocol_index", 0))
            if not (0 <= proto_idx < self.n_protocols):
                raise IndexError(f"Observation {idx} protocol index {proto_idx} out of bounds [0, {self.n_protocols})")

            # Provenance index: 0 (independent) or 1 (vendor/self-report)
            prov_idx = int(obs.get("provenance_index", 0))
            if prov_idx not in (0, 1):
                raise ValueError(f"Observation {idx} invalid provenance_index: {prov_idx} (must be 0 or 1)")

            # Domain index fail-closed
            expected_dom = int(np.argmax(self.benchmark_domains[bench_idx]))
            if "domain_index" in obs:
                domain_idx = int(obs["domain_index"])
                if not (0 <= domain_idx < 5):
                    raise IndexError(f"Observation {idx} domain index {domain_idx} out of bounds [0, 5)")
            else:
                domain_idx = expected_dom

            factor = self.metadata_factor if obs.get("metadata_incomplete", False) else 1.0

            parsed_obs.append({
                "obs": obs,
                "sys": sys_idx,
                "bench": bench_idx,
                "fam": fam_idx,
                "proto": proto_idx,
                "prov": prov_idx,
                "domain": domain_idx,
                "factor": factor,
            })

            cell_key = (sys_idx, bench_idx)
            cell_map.setdefault(cell_key, []).append(idx)
            family_key = (sys_idx, fam_idx)
            family_map.setdefault(family_key, []).append(idx)
            pair_key = (proto_idx, bench_idx)
            pair_map.setdefault(pair_key, []).append(idx)

        # Pre-extract posterior arrays
        z_samples = self.samples["Z"]  # (n_draws, n_systems, 5)
        beta_samples = self.samples["beta"]  # (n_draws, n_benchmarks)
        log_alpha_samples = self.samples["log_alpha"]  # (n_draws, n_benchmarks)
        alpha_samples = np.exp(log_alpha_samples)
        family_sd_samples = self.samples["family_sd"]  # (n_draws,)
        cell_sigma_samples = self.samples["cell_sigma"]  # (n_draws, n_benchmarks)
        run_noise_samples = self.samples["run_noise"]  # (n_draws, 2, 5)
        scale_xi_samples = self.samples.get("scale_xi")
        rho_samples = self.samples.get("rho")

        # Protocol effects
        is_self_report = np.asarray(self.train_data.get("protocol_is_self_report", [False] * self.n_protocols), dtype=bool)
        proto_z_samples = self.samples.get("proto_z")
        scale_a_self_samples = self.samples.get("scale_a_self")
        scale_a_indep_samples = self.samples.get("scale_a_indep")
        mu_self_samples = self.samples.get("mu_self")
        gamma_plus_samples = self.samples.get("gamma_plus")

        # Precompute projected trait locations per draw and per observation
        projected_base = np.zeros((self.n_draws, n_obs), dtype=np.float64)
        for i, item in enumerate(parsed_obs):
            s, b = item["sys"], item["bench"]
            lambdas = self.benchmark_domains[b]
            proj = np.sum(z_samples[:, s, :] * lambdas[None, :], axis=1)
            projected_base[:, i] = beta_samples[:, b] + alpha_samples[:, b] * proj

        # Add protocol effects
        proto_effects = np.zeros((self.n_draws, n_obs), dtype=np.float64)
        for i, item in enumerate(parsed_obs):
            p, d = item["proto"], item["domain"]
            if proto_z_samples is not None and p < proto_z_samples.shape[1]:
                pz = proto_z_samples[:, p, d]
                if is_self_report[p]:
                    mu = mu_self_samples[:, d] if mu_self_samples is not None else 0.0
                    gp = gamma_plus_samples[:, d] if gamma_plus_samples is not None else 0.0
                    sa = scale_a_self_samples if scale_a_self_samples is not None else 0.25
                    proto_effects[:, i] = mu + gp + sa * pz
                else:
                    sa = scale_a_indep_samples if scale_a_indep_samples is not None else 0.15
                    proto_effects[:, i] = sa * pz

        # Add training xi effects if available
        xi_effects = np.zeros((self.n_draws, n_obs), dtype=np.float64)
        xi_samples = self.samples.get("xi")
        for i, item in enumerate(parsed_obs):
            pair = (item["proto"], item["bench"])
            if pair in self._training_pairs and xi_samples is not None:
                p_idx = self._training_pairs[pair]
                if p_idx < xi_samples.shape[1]:
                    xi_effects[:, i] = xi_samples[:, p_idx]

        base_loc = projected_base + proto_effects + xi_effects

        # Monte Carlo integration over withheld effects and posterior draws
        draw_joint_lpd = np.zeros(self.n_draws, dtype=np.float64)
        predictive_samples_per_obs = [[] for _ in range(n_obs)]

        for s_idx in range(self.n_draws):
            fsd = float(family_sd_samples[s_idx])
            log_lik_mc = np.zeros(n_mc, dtype=np.float64)

            # Family effects: reuse trained if family truly has remaining training observations, else sample from prior jointly
            sampled_families: dict[tuple[int, int], np.ndarray] = {}
            for fam_key in family_map:
                if self._training_family_counts.get(fam_key, 0) > 0 and "family_z" in self.samples:
                    sys_i, fam_i = fam_key
                    val = fsd * float(self.samples["family_z"][s_idx, sys_i, fam_i])
                    sampled_families[fam_key] = np.full(n_mc, val)
                else:
                    sampled_families[fam_key] = rng.normal(0.0, max(fsd, 1e-6), size=n_mc)

            # Cell misfits: reuse trained if cell truly has remaining training observations, else sample from t4 mixture jointly
            sampled_cells: dict[tuple[int, int], np.ndarray] = {}
            for cell_key in cell_map:
                sys_i, bench_i = cell_key
                if (
                    self._training_cell_counts.get(cell_key, 0) > 0
                    and cell_key in self._cell_system_benchmark_to_index
                    and "cell_misfit" in self.samples
                ):
                    c_idx = self._cell_system_benchmark_to_index[cell_key]
                    val = float(self.samples["cell_misfit"][s_idx, c_idx])
                    sampled_cells[cell_key] = np.full(n_mc, val)
                else:
                    c_sigma = float(cell_sigma_samples[s_idx, bench_i])
                    # Cell tail mixture: t4 via normal / sqrt(gamma(2,2))
                    z_k = rng.normal(0.0, 1.0, size=n_mc)
                    kappa_k = rng.gamma(2.0, 0.5, size=n_mc)  # scipy/numpy gamma takes shape, scale; rate 2.0 => scale 0.5
                    sampled_cells[cell_key] = c_sigma * z_k / np.sqrt(np.maximum(kappa_k, 1e-6))

            # Sample withheld protocol x condition interactions
            sampled_pairs: dict[tuple[int, int], np.ndarray] = {}
            for pair_key in pair_map:
                if pair_key not in self._training_pairs and scale_xi_samples is not None:
                    p_i, b_i = pair_key
                    dom_i = int(np.argmax(self.benchmark_domains[b_i]))
                    s_xi = float(scale_xi_samples[s_idx, dom_i])
                    sampled_pairs[pair_key] = rng.normal(0.0, max(s_xi, 1e-6), size=n_mc)
                else:
                    sampled_pairs[pair_key] = np.zeros(n_mc)

            # Sample observation run_eps
            for i, item in enumerate(parsed_obs):
                b = item["bench"]
                cell_key = (item["sys"], b)
                fam_key = (item["sys"], item["fam"])
                pair_key = (item["proto"], b)

                loc_mc = (
                    base_loc[s_idx, i]
                    + sampled_families[fam_key]
                    + sampled_cells[cell_key]
                    + sampled_pairs[pair_key]
                )

                prov = item["prov"]
                dom = item["domain"]
                omega = float(run_noise_samples[s_idx, prov, dom]) * item["factor"]
                eps_mc = rng.normal(0.0, 1.0, size=n_mc)
                rho_b = float(rho_samples[s_idx, b]) if rho_samples is not None else 0.0

                for m in range(n_mc):
                    ll_row = observation_log_likelihood(
                        item["obs"],
                        location=loc_mc[m],
                        omega=omega,
                        run_eps=eps_mc[m],
                        rho_benchmark=rho_b,
                    )
                    log_lik_mc[m] += ll_row

                # Generate a predictive draw for intervals (1 per MCMC draw)
                if self.config.calculate_intervals:
                    pred_val = sample_observation_predictive(
                        item["obs"],
                        location=loc_mc[0],
                        omega=omega,
                        run_eps=eps_mc[0],
                        rho_benchmark=rho_b,
                        rng=rng,
                    )
                    predictive_samples_per_obs[i].append(pred_val)

            # Joint log likelihood for draw s_idx by integrating out Monte Carlo draws
            max_ll = np.max(log_lik_mc)
            draw_joint_lpd[s_idx] = max_ll + np.log(np.mean(np.exp(log_lik_mc - max_ll)))

        # Final joint LPD over all MCMC posterior draws
        max_draw = np.max(draw_joint_lpd)
        joint_lpd = float(max_draw + np.log(np.mean(np.exp(draw_joint_lpd - max_draw))))
        normalized_lpd = joint_lpd / float(n_obs)

        # MCSE computation via batching / sample variance of the densities
        lik_draws = np.exp(draw_joint_lpd - max_draw)
        mean_lik = np.mean(lik_draws)
        var_lik = np.var(lik_draws, ddof=1) if len(lik_draws) > 1 else 0.0
        # Effective sample size approx
        ess = min(float(self.n_draws), 1000.0)
        mcse_lpd = float(np.sqrt(var_lik / ess) / max(mean_lik, 1e-12)) if mean_lik > 0 else 0.0

        # Compute interval scores and coverage per observation
        coverages = []
        interval_scores = []
        for i, item in enumerate(parsed_obs):
            actual = observation_native_actual(item["obs"])
            if self.config.calculate_intervals and predictive_samples_per_obs[i]:
                preds = np.asarray(predictive_samples_per_obs[i])
                lo, hi = np.quantile(preds, [0.05, 0.95])
                cov = 1.0 if lo <= actual <= hi else 0.0
                is_score = compute_interval_score_90(lo, hi, actual)
                coverages.append(cov)
                interval_scores.append(is_score)
            else:
                coverages.append(0.0)
                interval_scores.append(0.0)

        mean_cov = float(np.mean(coverages)) if coverages else 0.0
        mean_is = float(np.mean(interval_scores)) if interval_scores else 0.0

        obs_ids = [str(obs.get("observation_id", f"{group_id}_{idx}")) for idx, obs in enumerate(observations)]

        return GroupEvaluation(
            group_id=group_id,
            target_successor_model=target_successor_model,
            target_domain=target_domain,
            n_observations=n_obs,
            joint_lpd=joint_lpd,
            normalized_lpd=normalized_lpd,
            mcse_lpd=mcse_lpd,
            observation_ids=obs_ids,
            mean_coverage_90=mean_cov,
            mean_interval_score_90=mean_is,
        )

    def evaluate_eval_spec(
        self,
        eval_spec: Mapping[str, Any],
    ) -> PredictiveEvaluationResult:
        """Evaluate primary target observations partitioned by condition or successor-domain blocks."""
        primary_rows = select_primary_scoring_observations(dict(eval_spec))
        target_model = str(eval_spec.get("target_successor_model", ""))
        target_domain = str(eval_spec.get("target_domain", ""))

        if not primary_rows:
            # Fall back to all held_out_observations if primary is empty
            primary_rows = list(eval_spec.get("held_out_observations", []))

        if not primary_rows:
            return PredictiveEvaluationResult(
                joint_lpd=0.0,
                normalized_lpd=0.0,
                mcse_lpd=0.0,
                n_groups=0,
                n_observations=0,
                mean_coverage_90=0.0,
                mean_interval_score_90=0.0,
                diagnostics={"empty": True},
            )

        # Group observations by condition (model x condition) for joint evaluation
        by_condition: dict[str, list[dict[str, Any]]] = {}
        for row in primary_rows:
            b_id = str(row.get("benchmark_id", f"cond_{row.get("benchmark_index", 0)}"))
            by_condition.setdefault(b_id, []).append(row)

        group_evals: list[GroupEvaluation] = []
        total_obs = 0
        total_lpd = 0.0

        for cond_id, cond_rows in sorted(by_condition.items()):
            gid = f"{target_model}::{target_domain}::{cond_id}" if target_model else cond_id
            geval = self.evaluate_group(
                cond_rows,
                group_id=gid,
                target_successor_model=target_model,
                target_domain=target_domain,
            )
            group_evals.append(geval)
            total_obs += geval.n_observations
            total_lpd += geval.joint_lpd

        norm_lpd = total_lpd / float(total_obs) if total_obs > 0 else 0.0
        avg_mcse = float(np.mean([g.mcse_lpd for g in group_evals])) if group_evals else 0.0
        mean_cov = float(np.mean([g.mean_coverage_90 for g in group_evals])) if group_evals else 0.0
        mean_is = float(np.mean([g.mean_interval_score_90 for g in group_evals])) if group_evals else 0.0

        return PredictiveEvaluationResult(
            joint_lpd=total_lpd,
            normalized_lpd=norm_lpd,
            mcse_lpd=avg_mcse,
            n_groups=len(group_evals),
            n_observations=total_obs,
            mean_coverage_90=mean_cov,
            mean_interval_score_90=mean_is,
            groups=group_evals,
            diagnostics={
                "target_successor_model": target_model,
                "target_domain": target_domain,
                "n_conditions": len(group_evals),
            },
        )


def evaluate_paired_models(
    train_data: Mapping[str, Any],
    eval_spec: Mapping[str, Any],
    candidate_npz_path: Path | str,
    baseline_npz_path: Path | str,
    config: EvaluatorConfig | None = None,
) -> dict[str, Any]:
    """Perform paired joint evaluation between candidate and baseline posteriors."""
    cand_samples = np.load(candidate_npz_path)
    base_samples = np.load(baseline_npz_path)
    cfg = config or EvaluatorConfig()

    cand_evaluator = ProductionPredictiveEvaluator(train_data, cand_samples, cfg)
    base_evaluator = ProductionPredictiveEvaluator(train_data, base_samples, cfg)

    cand_res = cand_evaluator.evaluate_eval_spec(eval_spec)
    base_res = base_evaluator.evaluate_eval_spec(eval_spec)

    paired_groups: list[dict[str, Any]] = []
    for cand_g, base_g in zip(cand_res.groups, base_res.groups):
        if cand_g.group_id != base_g.group_id:
            raise ValueError(f"Mismatched group IDs: {cand_g.group_id} != {base_g.group_id}")
        diff_lpd = cand_g.normalized_lpd - base_g.normalized_lpd
        diff_cov = cand_g.mean_coverage_90 - base_g.mean_coverage_90
        diff_is = cand_g.mean_interval_score_90 - base_g.mean_interval_score_90
        paired_groups.append({
            "group_id": cand_g.group_id,
            "target_successor_model": cand_g.target_successor_model,
            "target_domain": cand_g.target_domain,
            "n_observations": cand_g.n_observations,
            "candidate_normalized_lpd": cand_g.normalized_lpd,
            "baseline_normalized_lpd": base_g.normalized_lpd,
            "delta_normalized_lpd": diff_lpd,
            "candidate_coverage_90": cand_g.mean_coverage_90,
            "baseline_coverage_90": base_g.mean_coverage_90,
            "delta_coverage_90": diff_cov,
            "candidate_interval_score_90": cand_g.mean_interval_score_90,
            "baseline_interval_score_90": base_g.mean_interval_score_90,
            "delta_interval_score_90": diff_is,
        })

    return {
        "candidate": cand_res.to_dict(),
        "baseline": base_res.to_dict(),
        "paired_groups": paired_groups,
        "delta_joint_lpd": cand_res.joint_lpd - base_res.joint_lpd,
        "delta_normalized_lpd": cand_res.normalized_lpd - base_res.normalized_lpd,
        "delta_coverage_90": cand_res.mean_coverage_90 - base_res.mean_coverage_90,
        "delta_interval_score_90": cand_res.mean_interval_score_90 - base_res.mean_interval_score_90,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Production-faithful predictive evaluator")
    parser.add_argument("--train-input", required=True, help="Path to train input JSON")
    parser.add_argument("--eval-spec", required=True, help="Path to eval spec JSON")
    parser.add_argument("--posterior-npz", help="Path to single model posterior NPZ")
    parser.add_argument("--candidate-npz", help="Path to candidate posterior NPZ (paired mode)")
    parser.add_argument("--baseline-npz", help="Path to baseline posterior NPZ (paired mode)")
    parser.add_argument("--mc-draws", type=int, default=50, help="Monte Carlo integration draws")
    parser.add_argument("--seed", type=int, default=20260907, help="Deterministic seed")
    parser.add_argument("--output", required=True, help="Path to write evaluation results JSON")
    args = parser.parse_args()

    with open(args.train_input) as f:
        train_data = json.load(f)
    with open(args.eval_spec) as f:
        eval_spec = json.load(f)

    cfg = EvaluatorConfig(n_mc_draws=args.mc_draws, seed=args.seed)

    if args.candidate_npz and args.baseline_npz:
        results = evaluate_paired_models(
            train_data,
            eval_spec,
            args.candidate_npz,
            args.baseline_npz,
            config=cfg,
        )
    elif args.posterior_npz:
        samples = np.load(args.posterior_npz)
        evaluator = ProductionPredictiveEvaluator(train_data, samples, config=cfg)
        res = evaluator.evaluate_eval_spec(eval_spec)
        results = res.to_dict()
    else:
        raise ValueError("Must provide either --posterior-npz or both --candidate-npz and --baseline-npz")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote evaluation results to {out_path}")


if __name__ == "__main__":
    main()
