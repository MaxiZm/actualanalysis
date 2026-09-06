from __future__ import annotations

from collections import defaultdict
from datetime import date
import numpy as np

from .class_prior import class_prior_report, resolve_class_prior


def _summary(values: np.ndarray) -> dict:
    return {
        "median": float(np.median(values)),
        "low": float(np.quantile(values, 0.05)),
        "high": float(np.quantile(values, 0.95)),
        "sd": float(np.std(values, ddof=1)) if len(values) > 1 else 0.0,
        "width": float(np.quantile(values, 0.95) - np.quantile(values, 0.05)),
    }


def _safe(training_cutoff: str | None, holdout: str, release_date: str | None) -> bool:
    if holdout != "public":
        return True
    if not training_cutoff or not release_date:
        return False
    return date.fromisoformat(release_date) >= date.fromisoformat(training_cutoff)


def _ranks(draws: dict[str, np.ndarray], eligible: list[str], margin: float = 1.0) -> dict:
    if not eligible:
        return {}
    n_draws = len(draws[eligible[0]])
    rank_draws = {system_id: [] for system_id in eligible}
    for draw in range(n_draws):
        ordered = sorted(eligible, key=lambda item: (-draws[item][draw], item))
        for rank, system_id in enumerate(ordered, 1):
            rank_draws[system_id].append(rank)

    output = {}
    for system_id, values_list in rank_draws.items():
        values = np.asarray(values_list)
        pairwise = {}
        pairwise_unresolved = {}
        for other in eligible:
            if other == system_id:
                continue
            # Practical margin delta = 1.0 comparison (§8.1)
            p_win = float(np.mean(draws[system_id] > draws[other] + margin))
            p_loss = float(np.mean(draws[other] > draws[system_id] + margin))
            pairwise[other] = float(np.mean(draws[system_id] > draws[other]))
            pairwise_unresolved[other] = bool(p_win < 0.90 and p_loss < 0.90)

        output[system_id] = {
            "rank": int(round(float(np.median(values)))),
            "rank_low": int(round(float(np.quantile(values, 0.05)))),
            "rank_high": int(round(float(np.quantile(values, 0.95)))),
            "rank_cdf": [float(np.mean(values <= rank)) for rank in range(1, len(eligible) + 1)],
            "top_k": {str(k): float(np.mean(values <= k)) for k in (1, 3, 5, 10)},
            "pairwise": pairwise,
            "pairwise_unresolved": pairwise_unresolved,
        }
    return output


def _practical_ordering(values: np.ndarray, others: dict[str, np.ndarray], margin: float) -> tuple[dict, dict, dict]:
    """Paired P(I_a > I_b + margin) and 0.90 support; directional P(I_a > I_b) stays separate."""
    gt_margin = {}
    lt_margin = {}
    support = {}
    for other_id, other_values in others.items():
        p_gt = float(np.mean(values > other_values + margin))
        p_lt = float(np.mean(other_values > values + margin))
        gt_margin[other_id] = p_gt
        lt_margin[other_id] = p_lt
        if p_gt >= 0.90:
            support[other_id] = "this"
        elif p_lt >= 0.90:
            support[other_id] = "other"
        else:
            support[other_id] = "unresolved"
    return gt_margin, lt_margin, support


def build_posterior_summary(data: dict, samples: dict[str, np.ndarray]) -> dict:
    class_spec = resolve_class_prior(data)
    experimental = class_spec.enabled
    system_ids = data["system_ids"]
    benchmark_ids = data["benchmark_ids"]
    domains = data["domains"]
    n_domains = len(domains)

    Z = np.asarray(samples["Z"])  # (n_draws, n_systems, 5)
    n_draws = Z.shape[0]

    difficulty = np.asarray(samples.get("difficulty", np.zeros((n_draws, len(benchmark_ids)))))
    discrimination = np.asarray(samples.get("discrimination", np.ones((n_draws, len(benchmark_ids)))))
    cell_sigma = np.asarray(samples.get("cell_sigma", np.full((n_draws, len(benchmark_ids)), 0.3)))
    run_noise = np.asarray(samples.get("run_noise", np.full((n_draws, 2, n_domains), 0.3)))

    # --- 1. Panel Normalization and Equal-Domain Composite G_s ---
    panel_indices = [system_ids.index(sid) for sid in data["calibration_panel_system_ids"] if sid in system_ids]
    if len(panel_indices) < 12:
        raise ValueError(f"Calibration panel has {len(panel_indices)} fitted systems; at least 12 are required to standardize the scales")

    # Panel standardization per draw (methodology §5.1): location and scale of
    # every domain are taken from the calibration panel in each posterior draw,
    # which makes the published coordinates invariant to the sampler's per-domain
    # shift/scale indeterminacy. A tiny floor guards against a degenerate draw;
    # with the LogNormal trait-spread prior the panel spread never approaches it.
    panel_Z = Z[:, panel_indices, :]  # (n_draws, |P|, 5)
    mu_P = np.mean(panel_Z, axis=1)  # (n_draws, 5)
    scale_floor = float(data.get("panel_scale_floor", 0.05))
    varsigma_P = np.maximum(np.std(panel_Z, axis=1, ddof=1), scale_floor)  # (n_draws, 5)

    # Standardized traits Z_tilde_sk = (Z_sk - mu_Pk) / varsigma_Pk
    Z_tilde = (Z - mu_P[:, None, :]) / varsigma_P[:, None, :]  # (n_draws, n_systems, 5)
    domain_display = 50.0 + 10.0 * Z_tilde

    # G_s = (1/K) sum_k Z_tilde_sk
    G_raw = np.mean(Z_tilde, axis=2)  # (n_draws, n_systems)
    panel_G = G_raw[:, panel_indices]
    mu_PG = np.mean(panel_G, axis=1)
    sd_PG = np.maximum(np.std(panel_G, axis=1, ddof=1), scale_floor)

    # Composite ACI-G display
    display_G = 50.0 + 10.0 * (G_raw - mu_PG[:, None]) / sd_PG[:, None]

    # Task views use the same relative panel scale as Mixed. Basket utilities
    # remain a separate estimand and must never be presented as capability indexes.
    profile_displays = {}
    for name, profile in data["profiles"].items():
        weights = np.asarray([profile["weights"].get(domain, 0) for domain in domains])
        raw = Z_tilde @ weights
        panel = raw[:, panel_indices]
        profile_displays[name] = 50.0 + 10.0 * (
            raw - np.mean(panel, axis=1)[:, None]
        ) / np.maximum(np.std(panel, axis=1, ddof=1), scale_floor)[:, None]

    # --- 2. Observations and Cells Mapping ---
    cells_by_system: dict[int, list[int]] = defaultdict(list)
    for cell_index, system_index in enumerate(data["cell_system_index"]):
        cells_by_system[int(system_index)].append(cell_index)

    observations_by_cell: dict[int, list[dict]] = defaultdict(list)
    for observation in data["observations"]:
        observations_by_cell[int(observation["cell_index"])].append(observation)

    # --- 3. Concentration Gate & Own Data Variance Reduction ---
    lambdas = np.asarray(data["benchmark_domains"])  # (n_benchmarks, 5)

    systems = {}
    task_profile_draws: dict[str, dict[str, np.ndarray]] = defaultdict(dict)

    for system_index, system_id in enumerate(system_ids):
        direct_cells = cells_by_system.get(system_index, [])
        represented_domains = {
            domain_index
            for cell_index in direct_cells
            for domain_index, share in enumerate(lambdas[data["cell_benchmark_index"][cell_index]])
            if share > 0
        }

        # Safe independent cells count
        safe_cells = 0
        exposed_cells = 0
        exposed_residuals = []
        safe_residuals = []

        family_cells: dict[str, list[int]] = defaultdict(list)
        cell_tau_sq: dict[int, float] = {}
        benchmark_information: dict[str, float] = defaultdict(float)
        family_information: dict[str, float] = defaultdict(float)

        for cell_index in direct_cells:
            b_idx = int(data["cell_benchmark_index"][cell_index])
            fam_id = data["benchmark_family_ids"][b_idx]
            family_cells[fam_id].append(cell_index)
            rows = observations_by_cell[cell_index]

            is_indep = any(row["provenance_index"] == 0 for row in rows)
            is_safe = is_indep and _safe(
                data["system_training_cutoff"][system_index],
                data["benchmark_holdout"][b_idx],
                data["benchmark_public_release_date"][b_idx],
            )
            if is_safe:
                safe_cells += 1
                for r in rows:
                    if "y" in r:
                        safe_residuals.append(float(r["y"]))
            else:
                exposed_cells += 1
                for r in rows:
                    if "y" in r:
                        exposed_residuals.append(float(r["y"]))

            alpha_med = float(np.median(discrimination[:, b_idx]))
            sigma_med = float(np.median(cell_sigma[:, b_idx]))
            obs_precision = 0.0
            for r in rows:
                v = float(r.get("variance", 0.05))
                obs_precision += 1.0 / max(v, 1e-4)
            tau_sq = 1.0 / obs_precision if obs_precision > 0 else 1.0
            cell_tau_sq[cell_index] = tau_sq
            info = (alpha_med ** 2) / (tau_sq + 2.0 * (sigma_med ** 2))
            benchmark_information[benchmark_ids[b_idx]] += info
            family_information[fam_id] += info

        tot_info = sum(benchmark_information.values())
        max_benchmark_share = max(benchmark_information.values(), default=0) / tot_info if tot_info > 0 else 0.0
        max_family_share = max(family_information.values(), default=0) / tot_info if tot_info > 0 else 0.0
        tiers = data["tiers"]

        # Exposure gap E_s^gap (§10.3)
        exposure_gap = None
        # A benchmark-adjusted exposure refit is not computed in this release.
        # Comparing raw observations across different conditions is invalid.

        general_summary = _summary(display_G[:, system_index])
        if experimental:
            evidence = {
                "fitted_cells": len(direct_cells),
                "domains": len(represented_domains),
                "safe_independent_cells": safe_cells,
            }
            tier = "provisional"
            r_s_overall = None
            max_q90_csF = None
        else:
            # Precision-drop concentration gate c_sF (§8.1)
            # Gradient vector a_G = (1 / (K * sd_PG)) * D_P^{-1} 1
            # For each draw, compute precision drop when removing family F
            q90_csF_list = []
            for fam_id, f_cells in family_cells.items():
                f_drop_draws = []
                for d_idx in range(min(n_draws, 200)):
                    dp_inv = 1.0 / varsigma_P[d_idx]
                    a_G = (1.0 / (n_domains * sd_PG[d_idx])) * dp_inv  # (5,)
                    # Prior precision
                    lambda_prior = np.diag(1.0 / (varsigma_P[d_idx] ** 2))
                    lambda_full = lambda_prior.copy()
                    lambda_drop = lambda_prior.copy()

                    for c_idx in direct_cells:
                        b_idx = int(data["cell_benchmark_index"][c_idx])
                        lam_vec = lambdas[b_idx]  # (5,)
                        a_val = discrimination[d_idx, b_idx]
                        sig_val = cell_sigma[d_idx, b_idx]
                        term = (a_val ** 2 / (cell_tau_sq.get(c_idx, 1.0) + 2.0 * sig_val ** 2)) * np.outer(lam_vec, lam_vec)
                        lambda_full += term
                        if c_idx not in f_cells:
                            lambda_drop += term

                    try:
                        cov_full = np.linalg.inv(lambda_full)
                        cov_drop = np.linalg.inv(lambda_drop)
                        v_full = float(a_G @ cov_full @ a_G)
                        v_drop = float(a_G @ cov_drop @ a_G)
                        drop = 1.0 - (v_full / v_drop) if v_drop > 0 else 0.0
                        f_drop_draws.append(max(0.0, drop))
                    except np.linalg.LinAlgError:
                        f_drop_draws.append(0.0)

                if f_drop_draws:
                    q90_csF_list.append(float(np.quantile(f_drop_draws, 0.90)))

            max_q90_csF = max(q90_csF_list, default=0.0)

            # Own-data variance reduction R_s
            post_var_G = float(np.var(display_G[:, system_index]))
            # Prior variance of G on panel scale is ~ 10^2 = 100
            prior_var_G = 100.0
            r_s_overall = float(max(0.0, min(1.0, 1.0 - post_var_G / prior_var_G)))
            evidence = {
                "fitted_cells": len(direct_cells),
                "domains": len(represented_domains),
                "safe_independent_cells": safe_cells,
                "max_benchmark_share": max_benchmark_share,
                "max_family_share": max_family_share,
                "own_data_reduction": r_s_overall,
                "concentration_c_sf": max_q90_csF,
                "loo_max_delta": None,  # PSIS-LOO not computed in this release
                "exposure_gap": exposure_gap,
                "adversarial_shift": None,  # adversarial self-report refit not run in this release
            }

            def meets(threshold: dict) -> bool:
                c_sf_gate = float(threshold.get("max_concentration", 0.35 if threshold.get("min_domains", 4) >= 4 else 0.55))
                return (general_summary["width"] <= threshold["max_width"]
                        and evidence["domains"] >= threshold["min_domains"]
                        and safe_cells >= threshold["min_safe_cells"]
                        and max_family_share <= float(threshold.get("max_family_share", 1.0))
                        and max_q90_csF <= c_sf_gate
                        and r_s_overall >= float(threshold.get("min_own_data_reduction", 0.50)))

            tier = "verified" if meets(tiers["verified"]) else "ranked" if meets(tiers["ranked"]) else "provisional"

        # Domain outputs
        domain_output = {}
        for d_idx, domain in enumerate(domains):
            d_summary = _summary(domain_display[:, system_index, d_idx])
            d_post_var = float(np.var(domain_display[:, system_index, d_idx]))
            r_sk = float(max(0.0, min(1.0, 1.0 - d_post_var / 100.0)))
            # Own-profile cells that materially load on the domain (share >= 0.25);
            # a 5% spill-over share does not make a cell evidence for that domain.
            n_sk = sum(1 for c_idx in direct_cells if lambdas[data["cell_benchmark_index"][c_idx], d_idx] >= float(data.get("domain_cell_min_share", 0.25)))
            published = False if experimental else (n_sk >= 2 and d_summary["width"] <= tiers.get("domain_max_width", 15.0) and r_sk >= float(tiers.get("domain_min_own_data_reduction", 0.50)))
            domain_row = {
                **d_summary,
                "published": published,
                "extrapolated": not published,
                "n_sk": n_sk,
            }
            if not experimental:
                domain_row["r_s"] = r_sk
            domain_output[domain] = domain_row

        # Profile baskets (ACI-Basket expected normalized utility in %)
        profile_output = {}
        for profile_name, profile in data["profiles"].items():
            missing = []
            weighted = np.zeros(n_draws)
            for d_idx, domain in enumerate(domains):
                if not profile["weights"].get(domain, 0):
                    continue
                basket = profile["baskets"].get(domain, [])
                utility_eligible = data.get("benchmark_utility_eligible", [False] * len(benchmark_ids))
                available = [benchmark_ids.index(item) for item in basket
                             if item in benchmark_ids and utility_eligible[benchmark_ids.index(item)]]
                missing.extend(item for item in basket if item not in benchmark_ids
                               or not utility_eligible[benchmark_ids.index(item)])
                if available:
                    # Utility on available conditions
                    prob_sum = np.zeros(n_draws)
                    for b_idx in available:
                        # The fitted parameter named difficulty is -beta, not
                        # the location beta/alpha. Apply all declared loadings.
                        eta_draw = -difficulty[:, b_idx] + discrimination[:, b_idx] * (Z[:, system_index, :] @ lambdas[b_idx])
                        family = data["benchmark_family_index"][b_idx]
                        if "family_z" in samples and "family_sd" in samples:
                            eta_draw += np.asarray(samples["family_sd"]) * np.asarray(samples["family_z"])[:, system_index, family]
                        prob_sum += 1.0 / (1.0 + np.exp(-np.clip(eta_draw, -40, 40)))
                    prob_avg = prob_sum / len(available)
                    weighted += float(profile["weights"].get(domain, 0)) * prob_avg

            basket_draws = 100.0 * weighted
            task_profile_draws[profile_name][system_id] = basket_draws
            basket_summary = _summary(basket_draws)
            required_domains_publish = all(
                domain_output[d]["published"]
                for d in domains
                if float(profile["weights"].get(d, 0)) >= tiers.get("profile_domain_weight_gate", 0.15)
            )
            profile_output[profile_name] = {
                **basket_summary,
                "published": False if experimental else (tier != "provisional" and required_domains_publish and not missing),
                "missing_benchmarks": sorted(set(missing)),
            }

        index_profiles = {}
        for name, draws in profile_displays.items():
            summary = _summary(draws[:, system_index])
            required = [d for d in domains if data["profiles"][name]["weights"].get(d, 0) >= tiers.get("profile_domain_weight_gate", 0.15)]
            # Gate the composite's own uncertainty and direct domain evidence.
            # Do not veto a composite because one marginal interval is wider.
            published = False if experimental else (tier != "provisional" and summary["width"] <= tiers["ranked"]["max_width"]
                         and all(domain_output[d]["n_sk"] >= 2 for d in required))
            index_profiles[name] = {**summary, "published": published}

        system_row = {
            "model_id": system_id.rsplit("@", 1)[0],
            "profile": system_id.rsplit("@", 1)[1],
            "system_class": "max-common" if system_id.endswith("@max-common") else "std-common",
            "raw": _summary(G_raw[:, system_index]),
            "display": general_summary,
            "aci_g": general_summary,
            "tier": tier,
            "evidence": evidence,
            "domains": domain_output,
            "baskets": profile_output,
            "task_profiles": profile_output,
            "index_profiles": index_profiles,
        }
        if experimental:
            system_row["raw_traits"] = {domain: _summary(Z[:, system_index, d_idx]) for d_idx, domain in enumerate(domains)}
        systems[system_id] = system_row

    # Views ranking
    view_draws = {
        "mixed": {sid: display_G[:, idx] for idx, sid in enumerate(system_ids)},
        "agentic": {sid: profile_displays["agentic"][:, idx] for idx, sid in enumerate(system_ids)},
        "chat": {sid: profile_displays["chat"][:, idx] for idx, sid in enumerate(system_ids)},
    }

    views = {}
    for view_name, v_draws in view_draws.items():
        eligible = []
        for sid in system_ids:
            sys_info = systems[sid]
            pub = sys_info["tier"] != "provisional"
            if view_name in ("agentic", "chat"):
                pub = pub and sys_info["index_profiles"][view_name]["published"]
            if pub and sid in v_draws:
                eligible.append(sid)

        rank_output = _ranks(v_draws, eligible, margin=float(data.get("tiers", {}).get("practical_margin", 1.0)))
        view = {}
        for sid in system_ids:
            values = v_draws.get(sid)
            if values is None:
                continue
            val_summary = _summary(values)
            ranking = rank_output.get(sid)
            # Comparative uncertainty is useful even when coverage withholds a
            # statistical rank. Compute it from paired joint draws, never from
            # independent normal approximations to the two marginal intervals.
            pairwise = {other: float(np.mean(values > other_values)) for other, other_values in v_draws.items() if other != sid}
            margin = float(data.get("tiers", {}).get("practical_margin", 1.0))
            unresolved = {other: bool(np.mean(values > other_values + margin) < .90 and np.mean(other_values > values + margin) < .90)
                          for other, other_values in v_draws.items() if other != sid}
            view[sid] = {
                "score": val_summary["median"] if ranking or experimental else None,
                "ci_low": val_summary["low"],
                "ci_high": val_summary["high"],
                "rank": ranking["rank"] if ranking else None,
                "rank_low": ranking["rank_low"] if ranking else None,
                "rank_high": ranking["rank_high"] if ranking else None,
                "rank_cdf": ranking["rank_cdf"] if ranking else [],
                "top_k": ranking["top_k"] if ranking else {},
                "pairwise": pairwise,
                "pairwise_unresolved": unresolved,
            }
            if experimental:
                others = {other: other_values for other, other_values in v_draws.items() if other != sid}
                gt_margin, lt_margin, support = _practical_ordering(values, others, margin)
                view[sid]["practical_gt_margin"] = gt_margin
                view[sid]["practical_lt_margin"] = lt_margin
                view[sid]["practical_support"] = support
        views[view_name] = view

    benchmark_output = {}
    for idx, b_id in enumerate(benchmark_ids):
        # Calibrated 1-D coordinates along this benchmark's actual trait mix.
        # eta = slope * (t - location), t has panel mean 0 / sd 1 per draw.
        projection = panel_Z @ lambdas[idx]
        projection_mean = np.mean(projection, axis=1)
        projection_sd = np.maximum(np.std(projection, axis=1, ddof=1), scale_floor)
        calibrated_slope = discrimination[:, idx] * projection_sd
        calibrated_location = (difficulty[:, idx] / discrimination[:, idx] - projection_mean) / projection_sd
        log_a = np.log(np.maximum(calibrated_slope, 1e-6))
        w_log_a = float(np.quantile(log_a, 0.95) - np.quantile(log_a, 0.05))
        benchmark_output[b_id] = {
            "difficulty": float(np.median(calibrated_location)),
            "discrimination": float(np.median(calibrated_slope)),
            "cell_misfit_sd": float(np.median(cell_sigma[:, idx])),
            "alpha_unidentified": bool(w_log_a > np.log(4.0)),
        }

    # Per-cell evidence: observed logit (precision-weighted over the cell's rows),
    # predicted logit without the misfit term, and the misfit standardized by the
    # benchmark misfit scale. Counts are converted through the chance/ceiling map.
    eta_cell = np.asarray(samples.get("eta_cell"))
    cell_misfit = np.asarray(samples.get("cell_misfit"))
    have_eta = eta_cell is not None and eta_cell.ndim == 2 and eta_cell.shape[1] == len(data["cell_system_index"])
    have_misfit = cell_misfit is not None and cell_misfit.ndim == 2 and cell_misfit.shape[1] == len(data["cell_system_index"])

    def observed_logit(row: dict) -> tuple[float, float] | None:
        if "y" in row:
            return float(row["y"]), float(row.get("variance", 0.05))
        if "x" in row:
            n = float(row.get("n_tasks", 1)) * float(row.get("k_trials", 1))
            if n <= 0:
                return None
            chance = float(row.get("chance_level", 0.0))
            ceiling = float(row.get("ceiling", 1.0))
            frac = float(row["x"]) / n
            p = (frac - chance) / max(ceiling - chance, 1e-6)
            p = min(max(p, 0.005), 0.995)
            return float(np.log(p / (1 - p))), float(1.0 / max(n * p * (1 - p), 1e-6))
        return None

    cell_output = []
    for c_idx, (s_idx, b_idx) in enumerate(zip(data["cell_system_index"], data["cell_benchmark_index"])):
        sig = max(float(np.median(cell_sigma[:, b_idx])), 1e-6)
        pairs = [pair for pair in (observed_logit(row) for row in observations_by_cell.get(c_idx, [])) if pair is not None]
        if pairs:
            weights = np.asarray([1.0 / max(v, 1e-6) for _, v in pairs])
            observed = float(np.sum(weights * np.asarray([y for y, _ in pairs])) / np.sum(weights))
        else:
            observed = float("nan")
        misfit_med = float(np.median(cell_misfit[:, c_idx])) if have_misfit else 0.0
        eta_med = float(np.median(eta_cell[:, c_idx])) if have_eta else float(np.median(Z[:, s_idx, :] @ lambdas[b_idx]))
        cell_output.append({
            "system_id": system_ids[s_idx],
            "benchmark_id": benchmark_ids[b_idx],
            "theta_median": float(np.median(eta_cell[:, c_idx] - cell_misfit[:, c_idx])) if have_eta and have_misfit else eta_med,
            "observed_logit": observed,
            "misfit_median": misfit_med,
            "z_median": misfit_med / sig,
        })

    scales = {
        "aci_g": {
            "unit": "relative equal-domain index, mean 50, sd 10 over 2026a calibration panel",
            "description": "Standardized equal-weight composite across all 5 capability domains",
        },
        "aci_domain": {
            "unit": "relative domain index, mean 50, sd 10 over 2026a calibration panel",
            "description": "Domain-specific capability index standardized on the calibration panel",
        },
        "aci_basket": {
            "unit": "expected normalized utility % on utility-eligible conditions",
            "description": "Expected normalized utility across declared task baskets",
        },
    }

    output = {
        "method_version": data.get("method_version", "1.2.x"),
        "scales": scales,
        "systems": systems,
        "views": views,
        "benchmarks": benchmark_output,
        "cells": cell_output,
        "diagnostics": {
            "omega_correlation": np.mean(samples.get("Omega", np.eye(5)), axis=0).tolist(),
        },
    }
    if experimental:
        output["experimental"] = True
        output["publishable"] = False
        output["class_prior"] = class_prior_report(class_spec, samples)
        output["diagnostics"]["class_prior"] = output["class_prior"]
    return output
