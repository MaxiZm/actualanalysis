from __future__ import annotations

import jax.numpy as jnp
from jax.nn import sigmoid
import numpy as np
import numpyro
import numpyro.distributions as dist


def _halfnormal(name: str, scale: float, shape=()):
    return numpyro.sample(name, dist.HalfNormal(scale).expand(shape).to_event(len(shape)))


def group_observations(data: dict) -> dict:
    """Split the observation list into vectorized groups by likelihood family.

    Every group carries parallel index arrays so the model can evaluate all
    observations of one family with a single sample site instead of one site per
    row (which made JIT compilation and NUTS intractable at ~1,000 rows).
    """
    observations = data["observations"]
    metadata_factor = float(data.get("metadata_incomplete_multiplier", 1.5))
    domains = np.argmax(np.asarray(data["benchmark_domains"], dtype=float), axis=1) if data["n_benchmarks"] else np.zeros(0, dtype=int)

    # protocol x condition pairs for the xi_pb interaction term
    pair_index: dict[tuple[int, int], int] = {}
    pair_domain: list[int] = []
    for row in observations:
        key = (int(row.get("protocol_index", 0)), int(row["benchmark_index"]))
        if key not in pair_index:
            pair_index[key] = len(pair_index)
            pair_domain.append(int(domains[key[1]]))

    groups: dict[str, dict[str, list]] = {
        name: {"index": [], "cell": [], "protocol": [], "provenance": [], "domain": [], "factor": [], "pair": [],
               "y": [], "variance": [], "x": [], "n_tasks": [], "k_trials": [], "chance": [], "ceiling": []}
        for name in ("normal", "a_single", "a_total")
    }
    exact_rows: list[dict] = []
    for index, row in enumerate(observations):
        likelihood = row["likelihood"]
        # a_prime = accuracy with a reported SE, already on the logit scale (y, variance)
        target = groups.get("normal" if likelihood in ("a_prime", "normal") else likelihood)
        entry = {
            "index": index,
            "cell": int(row["cell_index"]),
            "protocol": int(row.get("protocol_index", 0)),
            "provenance": int(row["provenance_index"]),
            "domain": int(row["domain_index"]),
            "factor": metadata_factor if row.get("metadata_incomplete", False) else 1.0,
            "pair": pair_index[(int(row.get("protocol_index", 0)), int(row["benchmark_index"]))],
        }
        if likelihood == "a_exact":
            exact_rows.append({**entry, **row})
            continue
        if target is None:
            raise ValueError(f"Unknown likelihood {likelihood!r} for observation {index}")
        for key, value in entry.items():
            target[key].append(value)
        target["y"].append(float(row.get("y", 0.0)))
        target["variance"].append(float(row.get("variance", 0.0)))
        target["x"].append(float(row.get("x", 0.0)))
        target["n_tasks"].append(int(row.get("n_tasks", 1)))
        target["k_trials"].append(int(row.get("k_trials", 1)))
        target["chance"].append(float(row.get("chance_level", 0.0)))
        target["ceiling"].append(float(row.get("ceiling", 1.0)))
    return {"groups": groups, "exact": exact_rows, "n_pairs": len(pair_index), "pair_domain": pair_domain}


def aci_model(data: dict) -> None:
    """Joint five-domain ACI 1.2 model; all indexes are derived from this fit."""
    priors = data.get("priors", {})
    n_models = int(data["n_models"])
    n_systems = int(data["n_systems"])
    n_benchmarks = int(data["n_benchmarks"])
    n_families = int(data["n_families"])
    n_domains = 5

    system_model = jnp.asarray(data["system_model_index"], dtype=jnp.int32)
    system_profile = jnp.asarray(data["system_profile_index"], dtype=jnp.float32)
    system_is_fixed = jnp.asarray(data.get("system_is_fixed_effort", [False] * n_systems), dtype=jnp.bool_)
    benchmark_family = jnp.asarray(data["benchmark_family_index"], dtype=jnp.int32)
    lambdas = jnp.asarray(data["benchmark_domains"], dtype=jnp.float32)

    one_trait_baseline = bool(data.get("one_trait_baseline", False))
    general_specific = data.get("trait_structure", "correlated") == "general_specific"
    unit_traits = data.get("trait_structure", "correlated") in ("general_specific", "correlated_unit")

    # --- 1. System traits Z_sk (LKJ(2) correlated) ---
    # Trait spread per domain. A HalfNormal prior has its mode at zero and lets a
    # weakly separated domain collapse onto the others (observed: software-code
    # spread 0.14 while agentic was 1.7). A LogNormal prior keeps every domain a
    # live dimension unless the data pull it down; the absolute scale is
    # irrelevant because published scales standardize on the calibration panel.
    trait_spread_sd = float(priors.get("trait_spread_sd", 1.5))
    lognormal_sd = float(priors.get("trait_spread_lognormal_sd", 0.0))
    if unit_traits and not one_trait_baseline:
        # Declared cross-loadings act on equal marginal-variance coordinates.
        # Free domain spreads otherwise silently change those benchmark shares;
        # a single benchmark slope cannot absorb five different scale changes.
        varsigma = jnp.ones(n_domains)
        numpyro.deterministic("varsigma", varsigma)
    elif lognormal_sd > 0:
        varsigma = numpyro.sample("varsigma", dist.LogNormal(float(priors.get("trait_spread_lognormal_median_log", 0.0)), lognormal_sd).expand([n_domains]).to_event(1))
    else:
        varsigma = _halfnormal("varsigma", trait_spread_sd, (n_domains,))

    if general_specific and not one_trait_baseline:
        # Shared capability carries information into sparsely observed domains.
        # Domain departures are zero-centered and partially pooled; a mixed test
        # cannot freely trade a large negative communication trait against a
        # positive reasoning trait without evidence for that specialization.
        g = numpyro.sample("g", dist.Normal(0, 1).expand([n_models]).to_event(1))
        domain_scale = _halfnormal("domain_scale", float(priors.get("domain_specific_sd", 0.5)), (n_domains,))
        domain_z = numpyro.sample("domain_z", dist.Normal(0, 1).expand([n_models, n_domains]).to_event(2))
        marginal_scale = jnp.sqrt(1 + domain_scale**2)
        standardized = (g[:, None] + domain_scale[None, :] * domain_z) / marginal_scale[None, :]
        Z_std_raw = standardized * varsigma[None, :]
        common_loading = 1 / marginal_scale
        correlation = jnp.outer(common_loading, common_loading)
        numpyro.deterministic("Omega", correlation.at[jnp.diag_indices(n_domains)].set(1.0))
    elif one_trait_baseline:
        z_scalar = numpyro.sample("z_scalar", dist.Normal(0, 1).expand([n_models]).to_event(1))
        Z_std_raw = z_scalar[:, None] * varsigma[None, :]
        numpyro.deterministic("Omega", jnp.eye(n_domains))
    else:
        L_Omega = numpyro.sample("L_Omega", dist.LKJCholesky(n_domains, 2.0))
        numpyro.deterministic("Omega", jnp.matmul(L_Omega, L_Omega.T))
        z_std = numpyro.sample("z_std", dist.Normal(0, 1).expand([n_models, n_domains]).to_event(2))
        cov_factor = L_Omega * varsigma[:, None]
        Z_std_raw = jnp.matmul(z_std, cov_factor.T)

    # Effort gain delta_m for max-common (zero for fixed-effort systems)
    effort_mean = numpyro.sample("effort_mean", dist.Normal(float(priors.get("effort_mean", 0.30)), float(priors.get("effort_sd", 0.30))))
    if unit_traits and not one_trait_baseline:
        effort_sd = _halfnormal("effort_sd", float(priors.get("effort_sd", 0.30)))
        effort_z = numpyro.sample("effort_z", dist.Normal(0, 1).expand([n_models]).to_event(1))
        effort_domain_sd = _halfnormal("effort_domain_sd", float(priors.get("effort_specific_sd", 0.15)), (n_domains,))
        delta_z = numpyro.sample("delta_z", dist.Normal(0, 1).expand([n_models, n_domains]).to_event(2))
        # Effort is measured in dimensionless trait units, then mapped back to
        # each domain's raw scale. The previous shared raw-unit prior magnified
        # gains in domains whose fitted scale was small (especially Chat).
        delta_m = varsigma[None, :] * (
            effort_mean + effort_sd * effort_z[:, None] + effort_domain_sd[None, :] * delta_z
        )
    else:
        effort_sd = _halfnormal("effort_sd", float(priors.get("effort_sd", 0.30)), (n_domains,))
        delta_z = numpyro.sample("delta_z", dist.Normal(0, 1).expand([n_models, n_domains]).to_event(2))
        delta_m = effort_mean + effort_sd * delta_z

    Z_std = Z_std_raw
    Z_max = Z_std_raw + delta_m
    fixed_mask = system_is_fixed[:, None]
    traits = jnp.where(
        system_profile[:, None] > 0.5,
        jnp.where(fixed_mask, Z_std[system_model], Z_max[system_model]),
        Z_std[system_model],
    )
    numpyro.deterministic("Z", traits)

    # Identification (methodology §3, §5): no condition is pinned; the calibration
    # panel fixes location and scale of every trait direction. The calibrated
    # quantities below are what gets published and what convergence is judged on;
    # the raw Z/beta ridge is left to the priors. An optional soft pin
    # (priors.panel_pin_sd > 0) can additionally center the raw space.
    panel_ids = [system_id for system_id in data.get("calibration_panel_system_ids", []) if system_id in data["system_ids"]]
    if len(panel_ids) >= 2:
        panel_index = jnp.asarray([data["system_ids"].index(system_id) for system_id in panel_ids], dtype=jnp.int32)
        panel_traits = traits[panel_index]
        panel_mean = jnp.mean(panel_traits, axis=0)
        scale_floor = float(data.get("panel_scale_floor", 0.05))
        panel_sd = jnp.maximum(jnp.std(panel_traits, axis=0, ddof=1), scale_floor)
        z_cal = (traits - panel_mean[None, :]) / panel_sd[None, :]
        numpyro.deterministic("Z_cal", z_cal)
        g_raw = jnp.mean(z_cal, axis=1)
        g_panel = g_raw[panel_index]
        numpyro.deterministic("G_cal", (g_raw - jnp.mean(g_panel)) / jnp.maximum(jnp.std(g_panel, ddof=1), scale_floor))
        for profile_name, site_name in (("agentic", "Agentic_cal"), ("chat", "Chat_cal")):
            if profile_name not in data.get("profiles", {}):
                continue
            weights = jnp.asarray([data["profiles"][profile_name]["weights"].get(domain, 0) for domain in data["domains"]])
            composite = z_cal @ weights
            panel_composite = composite[panel_index]
            numpyro.deterministic(site_name, (composite - jnp.mean(panel_composite)) / jnp.maximum(jnp.std(panel_composite, ddof=1), float(data.get("panel_scale_floor", 0.05))))
        pin = float(priors.get("panel_pin_sd", 0.0))
        if pin > 0:
            numpyro.factor(
                "panel_identification",
                -0.5 * jnp.sum((panel_mean / pin) ** 2) - 0.5 * jnp.sum((jnp.log(panel_sd) / pin) ** 2),
            )

    # --- 2. Condition parameters (unpinned; identified through the calibration panel) ---
    difficulty_sd = float(priors.get("difficulty_sd", 3.0))
    log_discrimination_sd = float(priors.get("log_discrimination_sd", 0.6))
    beta = numpyro.sample("beta", dist.Normal(0, difficulty_sd).expand([n_benchmarks]).to_event(1))
    log_alpha = numpyro.sample("log_alpha", dist.Normal(0, log_discrimination_sd).expand([n_benchmarks]).to_event(1))
    alpha = jnp.exp(log_alpha)
    numpyro.deterministic("difficulty", -beta)
    numpyro.deterministic("discrimination", alpha)

    # --- 3. Family effects and t4 cell misfit (Gamma scale mixture) ---
    family_sd = _halfnormal("family_sd", float(priors.get("family_sd", 0.25)))
    family_z = numpyro.sample("family_z", dist.Normal(0, 1).expand([n_systems, n_families]).to_event(2))
    family_effect = family_sd * family_z

    cell_system = jnp.asarray(data["cell_system_index"], dtype=jnp.int32)
    cell_benchmark = jnp.asarray(data["cell_benchmark_index"], dtype=jnp.int32)
    n_cells = int(cell_system.shape[0])

    cell_misfit_sd = float(priors.get("cell_misfit_sd", 0.30))
    cell_sigma = _halfnormal("cell_sigma", cell_misfit_sd, (n_benchmarks,))
    cell_kappa = numpyro.sample("cell_kappa", dist.Gamma(2.0, 2.0).expand([n_cells]).to_event(1))
    cell_z = numpyro.sample("cell_z", dist.Normal(0, 1).expand([n_cells]).to_event(1))
    cell_misfit = cell_sigma[cell_benchmark] * cell_z / jnp.sqrt(cell_kappa)
    numpyro.deterministic("cell_misfit", cell_misfit)

    projected_traits = jnp.sum(traits[cell_system] * lambdas[cell_benchmark], axis=1)
    eta_cell = (
        beta[cell_benchmark]
        + alpha[cell_benchmark] * projected_traits
        + family_effect[cell_system, benchmark_family[cell_benchmark]]
        + cell_misfit
    )
    numpyro.deterministic("eta_cell", eta_cell)

    # --- 4. Protocol effects, protocol x condition interaction, run noise ---
    n_protocols = int(data.get("n_protocols", 1))
    protocol_is_self = jnp.asarray(data.get("protocol_is_self_report", [False] * n_protocols), dtype=jnp.bool_)
    scale_a_indep = _halfnormal("scale_a_indep", float(priors.get("sigma_a_indep", 0.15)))
    scale_a_self = _halfnormal("scale_a_self", float(priors.get("sigma_a_self", 0.25)))
    mu_self = numpyro.sample("mu_self", dist.Normal(float(priors.get("self_report_mean", 0.15)), float(priors.get("self_report_sd", 0.15))).expand([n_domains]).to_event(1))
    if bool(data.get("adversarial_offset", False)):
        gamma_plus = _halfnormal("gamma_plus", 0.30, (n_domains,))
    else:
        gamma_plus = jnp.zeros(n_domains)
    proto_z = numpyro.sample("proto_z", dist.Normal(0, 1).expand([n_protocols, n_domains]).to_event(2))
    a_pk = jnp.where(
        protocol_is_self[:, None],
        mu_self[None, :] + gamma_plus[None, :] + scale_a_self * proto_z,
        scale_a_indep * proto_z,
    )

    grouped = group_observations(data)
    scale_xi = _halfnormal("scale_xi", float(priors.get("sigma_xi", 0.20)), (n_domains,))
    n_pairs = int(grouped["n_pairs"])
    pair_domain = jnp.asarray(grouped["pair_domain"] or [0], dtype=jnp.int32)
    xi_z = numpyro.sample("xi_z", dist.Normal(0, 1).expand([max(n_pairs, 1)]).to_event(1))
    xi = scale_xi[pair_domain] * xi_z
    numpyro.deterministic("xi", xi)

    run_noise_sd = float(priors.get("run_noise_sd", 0.30))
    omega_bar = _halfnormal("omega_bar", run_noise_sd, (2,))
    zeta = numpyro.sample("zeta", dist.Normal(0, float(priors.get("run_noise_domain_sd", 0.40))).expand([2, n_domains]).to_event(2))
    run_noise = omega_bar[:, None] * jnp.exp(zeta)
    numpyro.deterministic("run_noise", run_noise)

    estimate_rho = [bool(value) for value in data.get("benchmark_estimate_rho", [False] * n_benchmarks)]
    rho = jnp.asarray(data.get("benchmark_default_rho", [0.0] * n_benchmarks), dtype=jnp.float32)
    estimated_indices = [index for index, value in enumerate(estimate_rho) if value]
    if estimated_indices:
        rho_estimated = numpyro.sample("rho_estimated", dist.Beta(2, 5).expand([len(estimated_indices)]).to_event(1))
        rho = rho.at[jnp.asarray(estimated_indices, dtype=jnp.int32)].set(rho_estimated)
    numpyro.deterministic("rho", rho)

    # --- 5. Observation likelihoods, one vectorized site per family ---
    def location_and_omega(group: dict):
        cell = jnp.asarray(group["cell"], dtype=jnp.int32)
        protocol = jnp.asarray(group["protocol"], dtype=jnp.int32)
        provenance = jnp.asarray(group["provenance"], dtype=jnp.int32)
        domain = jnp.asarray(group["domain"], dtype=jnp.int32)
        pair = jnp.asarray(group["pair"], dtype=jnp.int32)
        factor = jnp.asarray(group["factor"], dtype=jnp.float32)
        location = eta_cell[cell] + a_pk[protocol, domain] + xi[pair]
        omega = run_noise[provenance, domain] * factor
        return location, omega, cell

    normal = grouped["groups"]["normal"]
    if normal["index"]:
        location, omega, _ = location_and_omega(normal)
        variance = jnp.asarray(normal["variance"], dtype=jnp.float32)
        numpyro.sample(
            "obs_normal",
            dist.Normal(location, jnp.sqrt(variance + omega**2)).to_event(1),
            obs=jnp.asarray(normal["y"], dtype=jnp.float32),
        )

    single = grouped["groups"]["a_single"]
    if single["index"]:
        location, omega, _ = location_and_omega(single)
        run_eps = numpyro.sample("run_eps_single", dist.Normal(0, 1).expand([len(single["index"])]).to_event(1))
        chance = jnp.asarray(single["chance"], dtype=jnp.float32)
        ceiling = jnp.asarray(single["ceiling"], dtype=jnp.float32)
        prob = chance + (ceiling - chance) * sigmoid(location + omega * run_eps)
        prob = jnp.clip(prob, 1e-6, 1 - 1e-6)
        numpyro.sample(
            "obs_single",
            dist.Binomial(total_count=jnp.asarray(single["n_tasks"], dtype=jnp.int32), probs=prob).to_event(1),
            obs=jnp.asarray(np.rint(single["x"]), dtype=jnp.int32),
        )

    total_group = grouped["groups"]["a_total"]
    if total_group["index"]:
        location, omega, cell = location_and_omega(total_group)
        run_eps = numpyro.sample("run_eps_total", dist.Normal(0, 1).expand([len(total_group["index"])]).to_event(1))
        chance = jnp.asarray(total_group["chance"], dtype=jnp.float32)
        ceiling = jnp.asarray(total_group["ceiling"], dtype=jnp.float32)
        prob = chance + (ceiling - chance) * sigmoid(location + omega * run_eps)
        prob = jnp.clip(prob, 1e-6, 1 - 1e-6)
        trials = jnp.asarray(total_group["k_trials"], dtype=jnp.float32)
        tasks = jnp.asarray(total_group["n_tasks"], dtype=jnp.float32)
        total = tasks * trials
        design_effect = 1 + (trials - 1) * rho[cell_benchmark[cell]]
        scale = jnp.sqrt(jnp.maximum(total * prob * (1 - prob) * design_effect, 1e-6))
        numpyro.sample(
            "obs_total",
            dist.Normal(total * prob, scale).to_event(1),
            obs=jnp.asarray(total_group["x"], dtype=jnp.float32),
        )

    # Per-task exact counts are rare (variable-length vectors); keep a per-row site.
    for row in grouped["exact"]:
        index = row["index"]
        location = eta_cell[row["cell"]] + a_pk[row["protocol"], row["domain"]] + xi[row["pair"]]
        omega = run_noise[row["provenance"], row["domain"]] * row["factor"]
        run_eps = numpyro.sample(f"run_eps_exact_{index}", dist.Normal(0, 1))
        prob = float(row["chance_level"]) + (float(row["ceiling"]) - float(row["chance_level"])) * sigmoid(location + omega * run_eps)
        prob = jnp.clip(prob, 1e-6, 1 - 1e-6)
        trials = int(row["k_trials"])
        counts = jnp.asarray(row["per_task_counts"], dtype=jnp.float32)
        cell_rho = rho[cell_benchmark[row["cell"]]]
        concentration = jnp.maximum((1 - cell_rho) / jnp.maximum(cell_rho, 1e-6), 1e-3)
        distribution = (
            dist.BetaBinomial(concentration1=prob * concentration, concentration0=(1 - prob) * concentration, total_count=trials)
            if bool(row.get("use_beta_binomial", False))
            else dist.Binomial(total_count=trials, probs=prob)
        )
        numpyro.sample(f"obs_exact_{index}", distribution.expand(counts.shape).to_event(1), obs=counts)
