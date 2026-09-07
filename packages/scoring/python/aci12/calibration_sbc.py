"""Simulation-Based Calibration (SBC) and Prior Predictive Tooling for ACI 1.5.0.

Implements:
- Forward simulation from actual NumPyro aci_model generative priors.
- Separate storage of synthetic ground truth parameters and observed datasets.
- Design hashing for exact reproducibility.
- Correct-spec SBC with rank statistics and empirical interval coverage checks.
- Misspecification stress tests:
  * wrong_class: partition misspecification
  * missing_domain: missing domain measurements
  * effort_shift: effort gain distribution shift
- Bounded smoke mode for unit tests and local development.
- Preregistered confirmatory replication and statistical power criteria.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

import jax
import jax.numpy as jnp
import numpy as np
import scipy.stats as stats
from numpyro.infer import MCMC, NUTS, Predictive
from numpyro.infer.initialization import init_to_median

from .class_prior import resolve_class_prior
from .experiment import base_model_id, sanitize_for_strict_json, strict_json_dumps
from .model import aci_model, group_observations


@dataclass(frozen=True)
class SBCPowerCriteria:
    min_replications: int = 100
    mcmc_chains: int = 4
    mcmc_warmup: int = 1000
    mcmc_samples: int = 1000
    nominal_coverage_level: float = 0.90
    min_acceptable_coverage: float = 0.85
    max_acceptable_coverage: float = 0.95
    ks_p_value_threshold: float = 0.01


DEFAULT_SBC_POWER_CRITERIA = SBCPowerCriteria()


def compute_design_hash(data: Mapping[str, Any]) -> str:
    """Compute deterministic SHA-256 hash of design metadata, effort mappings, and observation structure (excluding outcomes)."""
    top_level_keys = (
        "n_models", "n_systems", "n_benchmarks", "n_families", "n_protocols",
        "system_ids", "benchmark_ids", "benchmark_family_ids", "benchmark_family_index",
        "benchmark_domains", "trait_structure", "class_prior", "priors",
        # Effort mappings:
        "system_is_fixed_effort", "system_profile_index", "system_model",
        "system_model_index", "profile_effort", "effort_domain_index", "unreported_effort_policy",
        "calibration_panel_system_ids", "cell_system_index", "cell_benchmark_index",
    )
    design_dict: dict[str, Any] = {k: data[k] for k in top_level_keys if k in data}

    # Include structural observation properties, excluding outcomes (y, x, score, per_task_counts values)
    obs_structure = []
    for obs in data.get("observations", []):
        raw_ptc = obs.get("per_task_counts")
        ptc_len = len(raw_ptc) if raw_ptc is not None else None
        obs_structure.append({
            "cell": obs.get("cell_index", obs.get("cell")),
            "protocol": obs.get("protocol_index", obs.get("protocol")),
            "provenance": obs.get("provenance_index", obs.get("provenance")),
            "system": obs.get("system_index"),
            "benchmark": obs.get("benchmark_index"),
            "domain": obs.get("domain_index", obs.get("domain")),
            "likelihood": obs.get("likelihood"),
            "n_tasks": obs.get("n_tasks"),
            "k_trials": obs.get("k_trials"),
            "chance_level": obs.get("chance_level"),
            "ceiling": obs.get("ceiling"),
            "use_beta_binomial": obs.get("use_beta_binomial"),
            "variance": obs.get("variance"),
            "per_task_len": ptc_len,
            "is_effort": obs.get("is_effort"),
            "effort_domain": obs.get("effort_domain"),
            "in_reference_component": obs.get("in_reference_component"),
            "metadata_incomplete": obs.get("metadata_incomplete"),
        })
    design_dict["observation_structure"] = obs_structure

    serialized = json.dumps(sanitize_for_strict_json(design_dict), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def generate_synthetic_dataset(
    design_data: Mapping[str, Any],
    seed: int = 20260907,
    misspecification: str = "none",
    misspecification_kwargs: Mapping[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Generate synthetic ground truth and observations from the aci_model prior.

    Returns:
        (synthetic_input_data, ground_truth_parameters)
    """
    data_copy = copy.deepcopy(dict(design_data))
    data_copy["seed"] = seed
    kwargs = misspecification_kwargs or {}

    rng_key = jax.random.PRNGKey(seed)
    # Use Predictive to sample from prior (obs sites unconditioned)
    prior_predictive = Predictive(aci_model, num_samples=1)

    # If design has observations, strip obs fields to draw synthetic observation data
    synthetic_template = copy.deepcopy(data_copy)
    raw_obs = synthetic_template.get("observations", [])
    if not raw_obs:
        raise ValueError("design_data must contain template observations for structure")

    # To let Predictive sample obs sites, set condition_observations to False
    stripped_template = copy.deepcopy(synthetic_template)
    stripped_template["condition_observations"] = False
    for obs in stripped_template["observations"]:
        obs.pop("y", None)
        obs.pop("x", None)
        raw_ptc = obs.get("per_task_counts")
        if raw_ptc is not None:
            obs["n_tasks"] = len(raw_ptc)
            obs.pop("per_task_counts", None)

    # Generative misspecification before outcome sampling:
    if misspecification == "effort_shift":
        shift = float(kwargs.get("shift_amount", 1.0))
        stripped_template["priors"] = dict(stripped_template.get("priors") or {})
        base_effort_mean = float(stripped_template["priors"].get("effort_mean", 0.30))
        stripped_template["priors"]["effort_mean"] = base_effort_mean + shift

    prior_draws = prior_predictive(rng_key, data=stripped_template)

    # Flatten prior draws
    truth: dict[str, Any] = {}
    for k, v in prior_draws.items():
        arr = np.asarray(v)
        truth[k] = arr[0] if arr.ndim > 0 and arr.shape[0] == 1 else arr

    # Populate synthetic observations from sampled sites
    synthetic_obs = copy.deepcopy(raw_obs)
    grouped = group_observations(stripped_template)

    normal_idx = 0
    single_idx = 0
    total_idx = 0

    normal_draws = truth.get("obs_normal")
    single_draws = truth.get("obs_single")
    total_draws = truth.get("obs_total")

    for i, obs in enumerate(synthetic_obs):
        lik = obs.get("likelihood")
        if lik in ("normal", "a_prime") and normal_draws is not None:
            val = float(normal_draws[normal_idx])
            obs["y"] = val
            obs["score"] = val
            normal_idx += 1
        elif lik == "a_single" and single_draws is not None:
            val = int(round(float(single_draws[single_idx])))
            obs["x"] = val
            obs["score"] = val / float(obs.get("n_tasks", 1))
            single_idx += 1
        elif lik == "a_total" and total_draws is not None:
            val = float(total_draws[total_idx])
            obs["x"] = val
            tot = float(obs.get("n_tasks", 1)) * float(obs.get("k_trials", 1))
            obs["score"] = val / tot
            total_idx += 1
        elif lik == "a_exact":
            exact_site = f"obs_exact_{i}"
            if exact_site in truth:
                counts = [int(x) for x in truth[exact_site]]
                obs["per_task_counts"] = counts
                obs["n_tasks"] = len(counts)
                tot = float(len(counts)) * float(obs.get("k_trials", 1))
                obs["score"] = float(sum(counts)) / tot if tot > 0 else 0.0

    # Apply data-structure misspecifications if requested
    if misspecification == "wrong_class":
        # Scramble class prior partition in synthetic_input_data
        cp = synthetic_template.get("class_prior")
        if cp and isinstance(cp.get("partition"), list) and len(cp["partition"]) > 1:
            permuted = list(cp["partition"])
            permuted = permuted[1:] + permuted[:1]
            synthetic_template["class_prior"]["partition"] = permuted
    elif misspecification == "missing_domain":
        # Remove observations for a specific domain
        target_domain = int(kwargs.get("drop_domain_index", 0))
        synthetic_obs = [obs for obs in synthetic_obs if int(obs.get("domain_index", -1)) != target_domain]

    synthetic_template["observations"] = synthetic_obs
    synthetic_template["condition_observations"] = True
    synthetic_template["design_hash"] = compute_design_hash(synthetic_template)

    # Ensure ground truth arrays are serializable
    clean_truth: dict[str, Any] = {}
    for k, v in truth.items():
        if isinstance(v, np.ndarray):
            clean_truth[k] = v.tolist()
        elif isinstance(v, (np.floating, np.integer)):
            clean_truth[k] = v.item()
        else:
            clean_truth[k] = v

    return synthetic_template, clean_truth


def run_sbc_replication(
    design_data: Mapping[str, Any],
    replication_id: int,
    seed: int,
    warmup: int = 500,
    samples: int = 500,
    chains: int = 2,
    monitored_parameters: Sequence[str] = ("effort_mean", "family_sd", "cell_sigma"),
) -> dict[str, Any]:
    """Run a single SBC replication: draw prior truth, fit MCMC, compute rank statistics."""
    synthetic_data, truth = generate_synthetic_dataset(design_data, seed=seed)

    kernel = NUTS(aci_model, target_accept_prob=0.90, init_strategy=init_to_median())
    mcmc = MCMC(
        kernel,
        num_warmup=warmup,
        num_samples=samples,
        num_chains=chains,
        progress_bar=False,
    )
    fit_key = jax.random.PRNGKey(seed + 1000)
    mcmc.run(fit_key, data=synthetic_data)
    posterior_samples = mcmc.get_samples(group_by_chain=False)

    ranks: dict[str, int] = {}
    coverages_90: dict[str, bool] = {}

    total_draws = samples * chains

    for param in monitored_parameters:
        if param not in truth or param not in posterior_samples:
            continue
        true_val = np.asarray(truth[param])
        post_draws = np.asarray(posterior_samples[param])

        if true_val.ndim == 0:
            true_scalar = float(true_val)
            rank = int(np.sum(post_draws < true_scalar))
            lo, hi = np.quantile(post_draws, [0.05, 0.95])
            ranks[param] = rank
            coverages_90[param] = bool(lo <= true_scalar <= hi)
        elif true_val.ndim == 1:
            # For 1D vector parameters, monitor the mean across elements
            true_mean = float(np.mean(true_val))
            post_means = np.mean(post_draws, axis=1)
            rank = int(np.sum(post_means < true_mean))
            lo, hi = np.quantile(post_means, [0.05, 0.95])
            ranks[f"{param}_mean"] = rank
            coverages_90[f"{param}_mean"] = bool(lo <= true_mean <= hi)

    return {
        "replication_id": replication_id,
        "seed": seed,
        "total_draws": total_draws,
        "ranks": ranks,
        "coverage_90": coverages_90,
    }


def analyze_sbc_results(
    replication_results: Sequence[Mapping[str, Any]],
    criteria: SBCPowerCriteria = DEFAULT_SBC_POWER_CRITERIA,
) -> dict[str, Any]:
    """Analyze collection of SBC replications for rank uniformity and nominal coverage."""
    n_rep = len(replication_results)
    if n_rep == 0:
        return {"passed": False, "reason": "No replications provided"}

    # Aggregate ranks and coverage by parameter
    ranks_by_param: dict[str, list[int]] = {}
    cov_by_param: dict[str, list[bool]] = {}
    total_draws = replication_results[0].get("total_draws", 1000)

    for rep in replication_results:
        for p, r in rep.get("ranks", {}).items():
            ranks_by_param.setdefault(p, []).append(int(r))
        for p, c in rep.get("coverage_90", {}).items():
            cov_by_param.setdefault(p, []).append(bool(c))

    param_summaries: dict[str, Any] = {}
    all_passed = True

    for p, rank_list in ranks_by_param.items():
        arr_ranks = np.asarray(rank_list, dtype=float)
        # Uniform KS test: normalized ranks strictly in (0, 1) using (rank + 0.5) / (total_draws + 1)
        norm_ranks = (arr_ranks + 0.5) / float(total_draws + 1.0)
        ks_stat, ks_p = stats.kstest(norm_ranks, "uniform")

        cov_list = cov_by_param.get(p, [])
        emp_cov = float(np.mean(cov_list)) if cov_list else 0.0

        cov_ok = criteria.min_acceptable_coverage <= emp_cov <= criteria.max_acceptable_coverage
        ks_ok = ks_p >= criteria.ks_p_value_threshold

        param_passed = cov_ok and ks_ok
        if not param_passed:
            all_passed = False

        param_summaries[p] = {
            "n_replications": len(rank_list),
            "empirical_coverage_90": emp_cov,
            "coverage_acceptable": cov_ok,
            "ks_statistic": float(ks_stat),
            "ks_p_value": float(ks_p),
            "ks_uniform_acceptable": ks_ok,
            "passed": param_passed,
        }

    replications_sufficient = n_rep >= criteria.min_replications

    return {
        "passed": all_passed and replications_sufficient,
        "replications_count": n_rep,
        "min_replications_required": criteria.min_replications,
        "replications_sufficient": replications_sufficient,
        "parameter_summaries": param_summaries,
        "power_criteria": asdict(criteria),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="ACI 1.5.0 Calibration & SBC Tool")
    parser.add_argument("--design-template", required=True, help="Path to template input JSON")
    parser.add_argument("--output", required=True, help="Path to write output results JSON")
    parser.add_argument("--mode", choices=["smoke", "simulate", "sbc"], default="smoke")
    parser.add_argument("--replications", type=int, default=2)
    parser.add_argument("--seed", type=int, default=20260907)
    parser.add_argument("--misspecification", choices=["none", "wrong_class", "missing_domain", "effort_shift"], default="none")
    args = parser.parse_args()

    with open(args.design_template) as f:
        design = json.load(f)

    if args.mode == "simulate":
        synthetic, truth = generate_synthetic_dataset(
            design,
            seed=args.seed,
            misspecification=args.misspecification,
        )
        out_data = {
            "synthetic_data": synthetic,
            "ground_truth": truth,
            "design_hash": synthetic.get("design_hash"),
            "misspecification": args.misspecification,
        }
    elif args.mode in ("smoke", "sbc"):
        is_smoke = args.mode == "smoke"
        reps = 2 if is_smoke else args.replications
        warmup = 50 if is_smoke else 500
        samples = 50 if is_smoke else 500
        chains = 1 if is_smoke else 2

        results = []
        for r_idx in range(reps):
            rep_res = run_sbc_replication(
                design,
                replication_id=r_idx,
                seed=args.seed + r_idx * 17,
                warmup=warmup,
                samples=samples,
                chains=chains,
            )
            results.append(rep_res)

        analysis = analyze_sbc_results(results)
        analysis["smoke_mode"] = is_smoke
        out_data = analysis

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out_data, indent=2) + "\n", encoding="utf-8")
    print(f"Calibration SBC results written to {out_path}")


if __name__ == "__main__":
    main()
