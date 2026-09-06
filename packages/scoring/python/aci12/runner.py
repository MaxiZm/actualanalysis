from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from time import monotonic

import numpyro

# Parallel CPU chains require the host device count to be set before JAX initializes.
numpyro.set_host_device_count(max(1, int(os.environ.get("ACI12_CHAINS", "4"))))

import jax  # noqa: E402
import numpy as np
from numpyro.diagnostics import effective_sample_size, summary
from numpyro.infer import MCMC, NUTS
from numpyro.infer.initialization import init_to_median

from .class_prior import production_export_issues, resolve_class_prior
from .model import aci_model
from .summarize import build_posterior_summary


# Convergence is judged on panel-calibrated estimands (what is published) plus the
# scale-free hyperparameters; raw Z/beta sit on an unidentified ridge by design.
DECLARED_PARAMETERS = {
    "Z_cal",
    "G_cal",
    "Agentic_cal",
    "Chat_cal",
    "Omega",
    "domain_scale",
    "cell_sigma",
    "effort_mean",
    "effort_sd",
    "effort_domain_sd",
    "run_noise",
    "class_rho",
}


def _energy_bfmi(extra: dict, chains: int) -> list[float | None]:
    """E-BFMI uses Hamiltonian (potential + kinetic) energy per chain.

    Potential energy alone measures a different quantity and must not serve as
    a fallback when the sampler has not collected its total energy.
    """
    energy = np.asarray(extra.get("energy", []), dtype=float)
    if energy.ndim != 2 or energy.shape[0] != chains or energy.shape[1] < 2:
        return [None] * chains
    values = []
    for chain in energy:
        if not np.isfinite(chain).all():
            values.append(None)
            continue
        denominator = np.var(chain, ddof=1)
        values.append(float(np.mean(np.diff(chain) ** 2) / denominator) if denominator > 0 else None)
    return values


def _diagnostics(samples: dict, extra: dict, chains: int) -> dict:
    shaped = {name: np.asarray(value) for name, value in samples.items() if np.asarray(value).ndim >= 2}
    table = summary(shaped, prob=0.9, group_by_chain=True)
    tracked = {}
    for name, values in table.items():
        if name not in DECLARED_PARAMETERS:
            continue
        rhat = np.asarray(values["r_hat"], dtype=float)
        ess = np.asarray(values["n_eff"], dtype=float)
        parameter = np.asarray(shaped[name], dtype=float)
        chain_draws = parameter.reshape((parameter.shape[0], parameter.shape[1], -1))
        flat = chain_draws.reshape((-1, chain_draws.shape[-1]))
        variance = np.nanvar(flat, axis=0)
        active = np.isfinite(variance) & (variance > 1e-12)
        if not np.any(active):
            continue
        lower = np.quantile(flat[:, active], 0.05, axis=0)
        upper = np.quantile(flat[:, active], 0.95, axis=0)
        active_draws = chain_draws[:, :, active]
        lower_tail = (active_draws <= lower).astype(float)
        upper_tail = (active_draws >= upper).astype(float)
        rhat = rhat.reshape(-1)[active]
        ess = ess.reshape(-1)[active]
        try:
            with np.errstate(all="ignore"):
                lower_ess = np.asarray(effective_sample_size(lower_tail), dtype=float)
                upper_ess = np.asarray(effective_sample_size(upper_tail), dtype=float)
            finite_tail = np.concatenate([lower_ess[np.isfinite(lower_ess)], upper_ess[np.isfinite(upper_ess)]])
            tail_ess = float(np.min(finite_tail)) if finite_tail.size else 0.0
        except (ValueError, FloatingPointError):
            tail_ess = 0.0

        rhat_value = float(np.nanmax(rhat)) if not np.isnan(rhat).all() else None
        bulk_value = float(np.nanmin(ess)) if np.isfinite(ess).any() else 0.0
        tail_value = float(tail_ess) if np.isfinite(tail_ess) else 0.0
        tracked[name] = {
            "rhat": rhat_value if rhat_value is None or np.isfinite(rhat_value) else None,
            "ess_bulk": bulk_value if np.isfinite(bulk_value) else 0.0,
            "ess_tail": tail_value,
        }
    divergences = int(np.asarray(extra.get("diverging", [])).sum())
    divergent_draws = np.asarray(extra.get("diverging", []))
    return {
        "parameters": tracked,
        "divergences": divergences,
        "divergence_fraction": divergences / max(1, divergent_draws.size),
        "ebfmi": _energy_bfmi(extra, chains),
        "ebfmi_energy": "hamiltonian",
    }


def run(input_path: Path, output_path: Path, posterior_path: Path, summary_path: Path) -> None:
    data = json.loads(input_path.read_text())
    inference = dict(data["inference"])
    # Developer overrides for quick local runs; production settings live in index-config.yaml.
    for key, env in (("chains", "ACI12_CHAINS"), ("warmup", "ACI12_WARMUP"), ("samples", "ACI12_SAMPLES")):
        if os.environ.get(env):
            inference[key] = int(os.environ[env])
    if os.environ.get("ACI12_PROGRESS"):
        data["progress_bar"] = True
    jax.config.update("jax_enable_x64", True)

    # A dense mass matrix over the hyperparameter block was tried and made the
    # sampler saturate its tree depth with a 0.009 step size (R-hat up to 2.9);
    # a diagonal mass matrix mixes well on this posterior. Dense adaptation is
    # available for experiments via ACI12_DENSE=1.
    dense_mass: list | bool = False
    if os.environ.get("ACI12_DENSE"):
        dense_sites = ["effort_mean", "effort_sd", "beta", "log_alpha", "family_sd", "cell_sigma",
                       "scale_a_indep", "scale_a_self", "mu_self", "omega_bar"]
        general_specific = data.get("trait_structure", "correlated") == "general_specific" and not data.get("one_trait_baseline", False)
        unit_traits = data.get("trait_structure", "correlated") in ("general_specific", "correlated_unit") and not data.get("one_trait_baseline", False)
        if general_specific:
            dense_sites.append("domain_scale")
        if unit_traits:
            dense_sites.append("effort_domain_sd")
        else:
            dense_sites.append("varsigma")
        if not general_specific and not data.get("one_trait_baseline", False):
            dense_sites.append("L_Omega")
        if resolve_class_prior(data).samples_class_rho:
            dense_sites.append("class_rho")
        dense_mass = [tuple(dense_sites)]

    kernel = NUTS(
        aci_model,
        target_accept_prob=float(inference.get("target_accept", 0.90)),
        dense_mass=dense_mass,
        init_strategy=init_to_median(),
    )
    mcmc = MCMC(
        kernel,
        num_warmup=int(inference.get("warmup", 2000)),
        num_samples=int(inference.get("samples", 2000)),
        num_chains=int(inference.get("chains", 4)),
        chain_method="parallel" if jax.local_device_count() >= int(inference.get("chains", 4)) else "sequential",
        progress_bar=bool(data.get("progress_bar", False)),
    )
    started = monotonic()
    mcmc.run(jax.random.PRNGKey(int(data.get("seed", 20260904))), data=data, extra_fields=("diverging", "potential_energy", "energy"))
    chain_samples = mcmc.get_samples(group_by_chain=True)
    jax.block_until_ready(chain_samples)
    elapsed = monotonic() - started
    flat_samples = mcmc.get_samples(group_by_chain=False)

    retained = int(inference.get("retained_draws", 8000))
    first_key = next(iter(flat_samples.values()))
    if first_key.shape[0] > retained:
        indices = np.linspace(0, first_key.shape[0] - 1, retained, dtype=int)
        flat_samples = {name: np.asarray(value)[indices] for name, value in flat_samples.items()}

    np.savez_compressed(posterior_path, **{name: np.asarray(value) for name, value in flat_samples.items()})
    posterior_summary = build_posterior_summary(data, {name: np.asarray(value) for name, value in flat_samples.items()})
    summary_path.write_text(json.dumps(posterior_summary, indent=2) + "\n")

    diagnostics = _diagnostics(chain_samples, mcmc.get_extra_fields(group_by_chain=True), int(inference.get("chains", 4)))
    diagnostics["elapsed_seconds"] = elapsed
    diagnostics["posterior_draws"] = int(next(iter(flat_samples.values())).shape[0])
    diagnostics["engine"] = "numpyro-nuts"
    diagnostics["inference"] = {key: inference.get(key) for key in ("chains", "warmup", "samples", "target_accept")}
    diagnostics["devices"] = int(jax.local_device_count())

    issues = []
    for name, values in diagnostics["parameters"].items():
        if values["rhat"] is None or values["rhat"] > float(inference.get("max_rhat", 1.01)):
            r = values["rhat"]; issues.append(f"{name}: rhat {r}")
        if values["ess_bulk"] < float(inference.get("min_ess", 400)):
            b = values["ess_bulk"]; issues.append(f"{name}: bulk ESS {b}")
        if values["ess_tail"] < float(inference.get("min_ess", 400)):
            t = values["ess_tail"]; issues.append(f"{name}: tail ESS {t}")
    # Monte Carlo standard error per published quantity (§6): scores are 10 x the
    # calibrated trait, so MCSE in display points is 10 * sd / sqrt(ESS_bulk).
    mcse_limit = float(inference.get("max_score_mcse", 0.3))
    for name in ("G_cal", "Z_cal", "Agentic_cal", "Chat_cal"):
        if name not in chain_samples:
            continue
        values = np.asarray(chain_samples[name], dtype=float)
        flat = values.reshape((-1,) + values.shape[2:])
        sd = np.nanstd(flat, axis=0)
        ess = np.asarray(effective_sample_size(values.reshape((values.shape[0], values.shape[1], -1))), dtype=float).reshape(sd.shape)
        with np.errstate(all="ignore"):
            mcse = 10.0 * sd / np.sqrt(np.maximum(ess, 1.0))
        finite = mcse[np.isfinite(mcse) & (sd > 1e-12)]
        worst = float(np.max(finite)) if finite.size else 0.0
        diagnostics.setdefault("mcse_display_points", {})[name] = worst
        if worst > mcse_limit:
            issues.append(f"{name}: MCSE {worst:.3f} display points exceeds {mcse_limit}")
    # zero divergences gate (§6)
    div = diagnostics["divergences"]
    div_frac = diagnostics["divergence_fraction"]
    finite_ebfmi = [value for value in diagnostics["ebfmi"] if value is not None]
    if div > 0 and float(inference.get("max_divergence_fraction", 0.0)) == 0.0:
        issues.append(f"divergences: {div} (method 1.2 requires zero)")
    elif div_frac > float(inference.get("max_divergence_fraction", 0.0)):
        issues.append(f"divergence fraction {div_frac}")
    if len(finite_ebfmi) != int(inference.get("chains", 4)):
        issues.append("E-BFMI unavailable: total Hamiltonian energy missing, non-finite, or constant")
    elif min(finite_ebfmi) < float(inference.get("min_ebfmi", 0.3)):
        issues.append(f"E-BFMI {min(finite_ebfmi)}")
    issues.extend(production_export_issues(data))

    class_spec = resolve_class_prior(data)
    if class_spec.enabled:
        diagnostics["experimental"] = True
        diagnostics["publishable"] = False
        diagnostics["class_prior"] = class_spec.public_dict()

    diagnostics["accepted"] = not issues
    diagnostics["issues"] = issues
    output_path.write_text(json.dumps(diagnostics, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the ACI 1.2.2 NumPyro model")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--posterior", required=True, type=Path)
    parser.add_argument("--summary", required=True, type=Path)
    arguments = parser.parse_args()
    run(arguments.input, arguments.output, arguments.posterior, arguments.summary)


if __name__ == "__main__":
    main()
