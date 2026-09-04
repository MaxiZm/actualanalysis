from __future__ import annotations

import jax.numpy as jnp
from jax.nn import sigmoid
import numpyro
import numpyro.distributions as dist


def _halfnormal(name: str, scale: float, shape=()):
    return numpyro.sample(name, dist.HalfNormal(scale).expand(shape).to_event(len(shape)))


def aci_model(data: dict) -> None:
    """Joint five-domain ACI 1.2.2 model; all indexes are derived from this fit."""
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

    # --- 1. System Traits Z_sk (LKJ(2) Correlated) ---
    trait_spread_sd = float(priors.get("trait_spread_sd", 1.5))
    varsigma = _halfnormal("varsigma", trait_spread_sd, (n_domains,))

    if one_trait_baseline:
        # Restriction for dimensionality baseline check (§10.6): Z_sk = Z_s
        z_scalar = numpyro.sample("z_scalar", dist.Normal(0, 1).expand([n_models]).to_event(1))
        Z_std_raw = z_scalar[:, None] * varsigma[None, :]
        L_Omega = jnp.eye(n_domains)
        Omega = jnp.eye(n_domains)
    else:
        # Full 5-trait model with LKJ(2) Cholesky correlation
        L_Omega = numpyro.sample("L_Omega", dist.LKJCholesky(n_domains, 2.0))
        Omega = numpyro.deterministic("Omega", jnp.matmul(L_Omega, L_Omega.T))
        z_std = numpyro.sample("z_std", dist.Normal(0, 1).expand([n_models, n_domains]).to_event(2))
        # Correlated traits for std-common: z_std @ (L_Omega.T * varsigma)
        cov_factor = L_Omega * varsigma[:, None]  # cov factor for each row
        Z_std_raw = jnp.matmul(z_std, cov_factor.T)

    # Effort gain delta_m for max-common
    effort_mean = numpyro.sample("effort_mean", dist.Normal(float(priors.get("effort_mean", 0.30)), float(priors.get("effort_sd", 0.30))))
    effort_sd = _halfnormal("effort_sd", float(priors.get("effort_sd", 0.30)), (n_domains,))
    delta_z = numpyro.sample("delta_z", dist.Normal(0, 1).expand([n_models, n_domains]).to_event(2))
    delta_m = effort_mean + effort_sd * delta_z

    # For fixed effort models, delta_m is identically zero
    # system_is_fixed is per-system; find per-model fixed status
    Z_std = Z_std_raw
    Z_max = Z_std_raw + delta_m

    # Select traits for each system
    # system_profile: 0 for std-common, 1 for max-common
    # If fixed effort, delta_m is zeroed out
    fixed_mask = system_is_fixed[:, None]
    traits = jnp.where(
        system_profile[:, None] > 0.5,
        jnp.where(fixed_mask, Z_std[system_model], Z_max[system_model]),
        Z_std[system_model],
    )
    numpyro.deterministic("Z", traits)

    # --- 2. Condition Parameters (Unpinned) ---
    difficulty_sd = float(priors.get("difficulty_sd", 3.0))
    log_discrimination_sd = float(priors.get("log_discrimination_sd", 0.6))
    beta = numpyro.sample("beta", dist.Normal(0, difficulty_sd).expand([n_benchmarks]).to_event(1))
    log_alpha = numpyro.sample("log_alpha", dist.Normal(0, log_discrimination_sd).expand([n_benchmarks]).to_event(1))
    alpha = jnp.exp(log_alpha)
    numpyro.deterministic("difficulty", -beta)  # In IRT, difficulty is often -beta
    numpyro.deterministic("discrimination", alpha)

    # --- 3. Family Effects and Cell Misfit Scale Mixture (t4) ---
    family_sd = _halfnormal("family_sd", float(priors.get("family_sd", 0.25)))
    family_z = numpyro.sample("family_z", dist.Normal(0, 1).expand([n_systems, n_families]).to_event(2))
    family_effect = family_sd * family_z

    cell_system = jnp.asarray(data["cell_system_index"], dtype=jnp.int32)
    cell_benchmark = jnp.asarray(data["cell_benchmark_index"], dtype=jnp.int32)
    n_cells = int(cell_system.shape[0])

    cell_misfit_sd = float(priors.get("cell_misfit_sd", 0.30))
    cell_sigma = _halfnormal("cell_sigma", cell_misfit_sd, (n_benchmarks,))

    # t_4 mixture: kappa ~ Gamma(2, 2), misfit = sigma * z / sqrt(kappa)
    cell_kappa = numpyro.sample("cell_kappa", dist.Gamma(2.0, 2.0).expand([n_cells]).to_event(1))
    cell_z = numpyro.sample("cell_z", dist.Normal(0, 1).expand([n_cells]).to_event(1))
    cell_misfit = cell_sigma[cell_benchmark] * cell_z / jnp.sqrt(cell_kappa)
    numpyro.deterministic("cell_misfit", cell_misfit)

    # Cell predictor eta_sb
    # alpha_b * sum_k lambda_bk Z_sk
    projected_traits = jnp.sum(traits[cell_system] * lambdas[cell_benchmark], axis=1)
    eta_cell = (
        beta[cell_benchmark]
        + alpha[cell_benchmark] * projected_traits
        + family_effect[cell_system, benchmark_family[cell_benchmark]]
        + cell_misfit
    )
    numpyro.deterministic("eta_cell", eta_cell)

    # --- 4. Protocol Effects and Observation Noise ---
    n_protocols = int(data.get("n_protocols", 1))
    protocol_is_self = jnp.asarray(data.get("protocol_is_self_report", [False] * n_protocols), dtype=jnp.bool_)

    sigma_a_indep = float(priors.get("sigma_a_indep", 0.15))
    sigma_a_self = float(priors.get("sigma_a_self", 0.25))
    scale_a_indep = _halfnormal("scale_a_indep", sigma_a_indep)
    scale_a_self = _halfnormal("scale_a_self", sigma_a_self)

    mu_self = numpyro.sample("mu_self", dist.Normal(float(priors.get("self_report_mean", 0.15)), float(priors.get("self_report_sd", 0.15))).expand([n_domains]).to_event(1))

    # Adversarial fit mode (§10.8): non-negative offset added to all self-report cells
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

    # Protocol-condition interaction xi_pb
    sigma_xi = float(priors.get("sigma_xi", 0.20))
    scale_xi = _halfnormal("scale_xi", sigma_xi, (n_domains,))
    # Sparse protocol-condition noise: parameterized per observation or per cell
    run_noise_sd = float(priors.get("run_noise_sd", 0.30))
    omega_bar = _halfnormal("omega_bar", run_noise_sd, (2,))
    zeta = numpyro.sample("zeta", dist.Normal(0, 0.40).expand([2, n_domains]).to_event(2))
    run_noise = omega_bar[:, None] * jnp.exp(zeta)
    numpyro.deterministic("run_noise", run_noise)

    # Estimate rho only for benchmarks with enough exact observations
    estimate_rho = [bool(value) for value in data.get("benchmark_estimate_rho", [False] * n_benchmarks)]
    rho_default = jnp.asarray(data.get("benchmark_default_rho", [0.0] * n_benchmarks), dtype=jnp.float32)
    rho = rho_default
    estimated_indices = [index for index, value in enumerate(estimate_rho) if value]
    if estimated_indices:
        rho_estimated = numpyro.sample("rho_estimated", dist.Beta(2, 5).expand([len(estimated_indices)]).to_event(1))
        rho = rho.at[jnp.asarray(estimated_indices, dtype=jnp.int32)].set(rho_estimated)
    numpyro.deterministic("rho", rho)

    # Observations
    for index, observation in enumerate(data["observations"]):
        cell_index = int(observation["cell_index"])
        protocol_index = int(observation.get("protocol_index", 0))
        provenance = int(observation["provenance_index"])
        domain = int(observation["domain_index"])
        metadata_factor = float(data.get("metadata_incomplete_multiplier", 1.5)) if observation.get("metadata_incomplete", False) else 1.0

        location = eta_cell[cell_index] + a_pk[protocol_index, domain]
        omega = run_noise[provenance, domain] * metadata_factor
        likelihood = observation["likelihood"]

        if likelihood in ("a_exact", "a_total", "a_single"):
            run_eps = numpyro.sample(f"run_eps_{index}", dist.Normal(0, 1))
            latent = location + omega * run_eps
            chance = float(observation["chance_level"])
            ceiling = float(observation["ceiling"])
            prob = chance + (ceiling - chance) * sigmoid(latent)
            trials = int(observation["k_trials"])

            if likelihood == "a_exact":
                counts = jnp.asarray(observation["per_task_counts"], dtype=jnp.float32)
                cell_rho = rho[cell_benchmark[cell_index]]
                concentration = jnp.maximum((1 - cell_rho) / jnp.maximum(cell_rho, 1e-6), 1e-3)
                distribution = dist.BetaBinomial(
                    concentration1=prob * concentration,
                    concentration0=(1 - prob) * concentration,
                    total_count=trials,
                ) if bool(observation.get("use_beta_binomial", False)) else dist.Binomial(total_count=trials, probs=prob)
                numpyro.sample(f"observation_{index}", distribution.expand(counts.shape).to_event(1), obs=counts)
            elif likelihood == "a_total":
                tasks = int(observation["n_tasks"])
                total = tasks * trials
                design_effect = 1 + (trials - 1) * rho[cell_benchmark[cell_index]]
                scale = jnp.sqrt(jnp.maximum(total * prob * (1 - prob) * design_effect, 1e-6))
                numpyro.sample(f"observation_{index}", dist.Normal(total * prob, scale), obs=float(observation["x"]))
            else:
                numpyro.sample(f"observation_{index}", dist.Binomial(total_count=int(observation["n_tasks"]), probs=prob), obs=int(observation["x"]))
        else:
            variance = float(observation["variance"])
            numpyro.sample(f"observation_{index}", dist.Normal(location, jnp.sqrt(variance + omega**2)), obs=float(observation["y"]))
