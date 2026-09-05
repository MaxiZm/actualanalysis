"""Train-only, grouped out-of-sample validation for the ACI measurement model.

Example (development only; reserve test until the candidate is fixed)::

    uv run python -m aci12.validate_predictive --input path/to/aci12-input.json \
        --output work/validation-dev.json --split dev --structures baseline general_specific

Holdout units are model x benchmark, including *every* effort and source row.
Both development and test cells are removed from the training likelihood. A
fixed test partition can therefore stay untouched while development candidates
are compared on exactly the same training information. No saved posterior is
accepted, and learned held-out cell/family residuals are never used to predict.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from time import monotonic

import numpy as np


def group_key(data: dict, row: dict) -> tuple[int, int]:
    return int(data["system_model_index"][row["system_index"]]), int(row["benchmark_index"])


def _connected(edges: set[tuple[int, int]], model: int, benchmark: int) -> bool:
    """Does an alternative path survive after removing a candidate edge?"""
    neighbors: dict[tuple[str, int], list[tuple[str, int]]] = {}
    for m, b in edges:
        left, right = ("m", m), ("b", b)
        neighbors.setdefault(left, []).append(right)
        neighbors.setdefault(right, []).append(left)
    pending, visited = [("m", model)], set()
    while pending:
        node = pending.pop()
        if node == ("b", benchmark):
            return True
        if node not in visited:
            visited.add(node)
            pending.extend(neighbors.get(node, []))
    return False


def make_split(data: dict, seed: int, dev_fraction: float = 0.10, test_fraction: float = 0.10,
               min_model_benchmarks: int = 2, min_benchmark_models: int = 5) -> dict:
    if not 0 < dev_fraction < 1 or not 0 < test_fraction < 1 or dev_fraction + test_fraction >= 1:
        raise ValueError("Development/test fractions must be positive and sum to less than one")
    all_edges = sorted({group_key(data, row) for row in data["observations"]})
    remaining = set(all_edges)
    model_degree: dict[int, int] = {}
    benchmark_degree: dict[int, int] = {}
    for model, benchmark in all_edges:
        model_degree[model] = model_degree.get(model, 0) + 1
        benchmark_degree[benchmark] = benchmark_degree.get(benchmark, 0) + 1
    limits = {"dev": max(1, round(len(all_edges) * dev_fraction)),
              "test": max(1, round(len(all_edges) * test_fraction))}
    held_out: dict[str, set] = {"dev": set(), "test": set()}
    rng = np.random.default_rng(seed)
    # Interleave partition assignment to avoid giving test only the remaining
    # dense/easy cells after development has exhausted connectivity constraints.
    slots = [name for name, count in limits.items() for _ in range(count)]
    rng.shuffle(slots)
    for index in rng.permutation(len(all_edges)):
        if not slots:
            break
        edge = all_edges[int(index)]
        model, benchmark = edge
        if model_degree[model] <= min_model_benchmarks or benchmark_degree[benchmark] <= min_benchmark_models:
            continue
        remaining.remove(edge)
        if not _connected(remaining, model, benchmark):
            remaining.add(edge)
            continue
        held_out[slots.pop()].add(edge)
        model_degree[model] -= 1
        benchmark_degree[benchmark] -= 1
    partitions = {"train": remaining, **held_out}
    if not held_out["dev"] or not held_out["test"]:
        raise ValueError("Insufficient connected observations for separate development and test holdouts")
    rows = {name: [i for i, row in enumerate(data["observations"]) if group_key(data, row) in edges]
            for name, edges in partitions.items()}
    return {"seed": seed, "requested_fractions": {"dev": dev_fraction, "test": test_fraction},
            "constraints": {"min_training_benchmarks_per_heldout_model": min_model_benchmarks,
                            "min_training_models_per_heldout_benchmark": min_benchmark_models,
                            "preserve_original_graph_components": True},
            "groups": {name: [list(edge) for edge in sorted(edges)] for name, edges in partitions.items()},
            "row_indices": rows,
            "requested_group_counts": limits,
            "actual_group_counts": {name: len(edges) for name, edges in partitions.items()},
            "actual_row_counts": {name: len(indices) for name, indices in rows.items()}}


def training_data(data: dict, split: dict, structure: str, domain_specific_sd: float) -> dict:
    train = copy.deepcopy(data)
    train["observations"] = [copy.deepcopy(data["observations"][i]) for i in split["row_indices"]["train"]]
    # Remove unused held-out cell parameters rather than sampling their priors.
    cells = sorted({int(row["cell_index"]) for row in train["observations"]})
    mapping = {old: new for new, old in enumerate(cells)}
    for row in train["observations"]:
        row["cell_index"] = mapping[row["cell_index"]]
    for key in ("cell_system_index", "cell_benchmark_index"):
        train[key] = [data[key][old] for old in cells]
    train.pop("one_trait_baseline", None)
    train.pop("trait_structure", None)
    if structure == "general_specific":
        train["trait_structure"] = structure
        train.setdefault("priors", {})["domain_specific_sd"] = domain_specific_sd
    elif structure == "correlated_unit":
        train["trait_structure"] = structure
    elif structure != "baseline":
        raise ValueError(f"Unknown structure: {structure}")
    return train


def evaluation_indices(split: dict, partition: str) -> list[int]:
    if partition == "combined":
        return sorted(split["row_indices"]["dev"] + split["row_indices"]["test"])
    if partition not in ("dev", "test"):
        raise ValueError("Evaluate dev, test, or combined held-out rows")
    return split["row_indices"][partition]


def observed_logit(row: dict) -> tuple[float, float]:
    """Held-out target and measurement variance in the likelihood's coordinates.

    Count likelihoods use a half-count continuity correction and the delta
    method, including repeated-trial design effect. Reported logit SEs are used
    directly. These approximations affect interval calibration, not training.
    """
    if row["likelihood"] in ("normal", "a_prime"):
        return float(row["y"]), float(row["variance"])
    tasks = int(row["n_tasks"])
    trials = int(row.get("k_trials", 1)) if row["likelihood"] != "a_single" else 1
    total = tasks * trials
    count = float(sum(row["per_task_counts"])) if row["likelihood"] == "a_exact" else float(row["x"])
    probability = (count + 0.5) / (total + 1.0)
    chance, ceiling = float(row.get("chance_level", 0)), float(row.get("ceiling", 1))
    adjusted = float(np.clip((probability - chance) / (ceiling - chance), 1e-6, 1 - 1e-6))
    target = float(np.log(adjusted / (1 - adjusted)))
    design_effect = 1 + (trials - 1) * float(row.get("rho", 0))
    derivative = 1.0 / ((ceiling - chance) * adjusted * (1 - adjusted))
    variance = probability * (1 - probability) / (total + 1) * design_effect * derivative ** 2
    return target, float(variance)


def structural_predictions(data: dict, samples: dict, rows: list[dict]) -> np.ndarray:
    """Draws of held-out means; intentionally never consult eta_cell/family_z."""
    systems = np.array([row["system_index"] for row in rows], dtype=int)
    benchmarks = np.array([row["benchmark_index"] for row in rows], dtype=int)
    domains = np.array([row["domain_index"] for row in rows], dtype=int)
    protocols = np.array([row.get("protocol_index", 0) for row in rows], dtype=int)
    loadings = np.asarray(data["benchmark_domains"], dtype=float)[benchmarks]
    projected = np.sum(np.asarray(samples["Z"])[:, systems, :] * loadings[None, :, :], axis=-1)
    location = np.asarray(samples["beta"])[:, benchmarks] + np.exp(np.asarray(samples["log_alpha"])[:, benchmarks]) * projected
    is_self = np.asarray(data.get("protocol_is_self_report", [False] * data.get("n_protocols", 1)))[protocols]
    proto_z = np.asarray(samples["proto_z"])[:, protocols, domains]
    scale = np.where(is_self[None, :], np.asarray(samples["scale_a_self"])[:, None],
                     np.asarray(samples["scale_a_indep"])[:, None])
    location += scale * proto_z + np.asarray(samples["mu_self"])[:, domains] * is_self[None, :]
    # Match group_observations' training-only pair order. An unseen protocol x
    # benchmark interaction has expectation zero, not a fitted test offset.
    pairs = {}
    for row in data["observations"]:
        pair = (int(row.get("protocol_index", 0)), int(row["benchmark_index"]))
        if pair not in pairs:
            pairs[pair] = len(pairs)
    for index, (protocol, benchmark) in enumerate(zip(protocols, benchmarks)):
        pair_index = pairs.get((int(protocol), int(benchmark)))
        if pair_index is not None:
            location[:, index] += np.asarray(samples["xi"])[:, pair_index]
    return location


def predictive_distribution(data: dict, samples: dict, rows: list[dict], seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Mixture locations/variances with NEW family and cell realizations."""
    rng = np.random.default_rng(seed)
    draws = structural_predictions(data, samples, rows).copy()
    count = draws.shape[0]
    variances = np.empty_like(draws)
    # Repeated source observations share a new system x family / system x
    # benchmark realization, matching the fitted random-effect hierarchy.
    families, cells, unseen_pairs = {}, {}, {}
    training_pairs = {(int(r.get("protocol_index", 0)), int(r["benchmark_index"])) for r in data["observations"]}
    for index, row in enumerate(rows):
        benchmark, system, domain = int(row["benchmark_index"]), int(row["system_index"]), int(row["domain_index"])
        family = (system, int(data["benchmark_family_index"][benchmark]))
        if family not in families:
            families[family] = np.asarray(samples["family_sd"]) * rng.normal(size=count)
        cell = (system, benchmark)
        if cell not in cells:
            cells[cell] = np.asarray(samples["cell_sigma"])[:, benchmark] * rng.standard_t(4, size=count)
        pair = (int(row.get("protocol_index", 0)), benchmark)
        if pair not in training_pairs:
            if pair not in unseen_pairs:
                unseen_pairs[pair] = np.asarray(samples["scale_xi"])[:, domain] * rng.normal(size=count)
            draws[:, index] += unseen_pairs[pair]
        factor = float(data.get("metadata_incomplete_multiplier", 1.5)) if row.get("metadata_incomplete", False) else 1.0
        omega = np.asarray(samples["run_noise"])[:, int(row["provenance_index"]), domain] * factor
        variance = observed_logit(row)[1]
        draws[:, index] += families[family] + cells[cell]
        variances[:, index] = np.maximum(variance + omega ** 2, 1e-12)
    return draws, variances


def predictive_draws(data: dict, samples: dict, rows: list[dict], seed: int) -> np.ndarray:
    """Approximate posterior predictive logits, including observation noise."""
    locations, variances = predictive_distribution(data, samples, rows, seed)
    return locations + np.random.default_rng(seed + 71).normal(size=locations.shape) * np.sqrt(variances)


def predictive_log_density(locations: np.ndarray, variances: np.ndarray, observed: np.ndarray) -> np.ndarray:
    """Log density of the finite Gaussian mixture, stable without scipy."""
    log_terms = -.5 * (np.log(2 * np.pi * variances) + (locations - observed[None, :]) ** 2 / variances)
    maximum = np.max(log_terms, axis=0)
    return maximum + np.log(np.mean(np.exp(log_terms - maximum[None, :]), axis=0))


def predictive_scores(draws: np.ndarray, observed: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Proper CRPS and 90% interval score; both penalize needless uncertainty."""
    low, high = np.quantile(draws, [0.05, 0.95], axis=0)
    interval = high - low + 20 * np.maximum(low - observed, 0) + 20 * np.maximum(observed - high, 0)
    ordered = np.sort(draws, axis=0)
    size = draws.shape[0]
    rank_weights = (2 * np.arange(1, size + 1) - size - 1)[:, None]
    crps = np.mean(np.abs(draws - observed[None, :]), axis=0) - np.sum(rank_weights * ordered, axis=0) / size ** 2
    return crps, interval


def evaluate(data: dict, samples: dict, rows: list[dict], seed: int) -> dict:
    location = structural_predictions(data, samples, rows)
    predictions = np.median(location, axis=0)
    observed = np.array([observed_logit(row)[0] for row in rows])
    error = predictions - observed
    predictive = predictive_draws(data, samples, rows, seed)
    low, high = np.quantile(predictive, [0.05, 0.95], axis=0)
    crps, interval_scores = predictive_scores(predictive, observed)
    mixture, variances = predictive_distribution(data, samples, rows, seed)
    log_density = predictive_log_density(mixture, variances, observed)
    cell_errors: dict[tuple[int, int], list] = {}
    benchmark_errors: dict[int, list] = {}
    domain_errors: dict[int, list] = {}
    pair_cells: dict[tuple, list] = {}
    records = []
    for index, row in enumerate(rows):
        group = group_key(data, row)
        cell_errors.setdefault(group, []).append(float(error[index]))
        benchmark_errors.setdefault(int(row["benchmark_index"]), []).append(float(error[index]))
        domain_errors.setdefault(int(row["domain_index"]), []).append(float(error[index]))
        system = int(row["system_index"])
        # Same benchmark, protocol, and effort class; no model is compared with
        # its own effort variant and no cross-source gap becomes a 'win'.
        pair_key = (int(row["benchmark_index"]), int(row.get("protocol_index", 0)),
                    int(data["system_profile_index"][system]), system)
        pair_cells.setdefault(pair_key, []).append((float(observed[index]), float(predictions[index])))
        records.append({"model_index": group[0], "system_id": data["system_ids"][system],
                        "benchmark_id": data["benchmark_ids"][group[1]], "protocol_index": pair_key[1],
                        "observed_logit": float(observed[index]), "predicted_logit": float(predictions[index]),
                        "error": float(error[index]), "predictive_90_low": float(low[index]),
                        "predictive_90_high": float(high[index]), "predictive_crps": float(crps[index]),
                        "predictive_90_interval_score": float(interval_scores[index]), "predictive_log_density": float(log_density[index]),
                        "likelihood": row["likelihood"]})
    pairs, correct, ties = 0, 0, 0
    aggregated = [(key, np.mean(values, axis=0)) for key, values in sorted(pair_cells.items())]
    for i, (left_key, left) in enumerate(aggregated):
        for right_key, right in aggregated[i + 1:]:
            if left_key[:3] != right_key[:3] or data["system_model_index"][left_key[3]] == data["system_model_index"][right_key[3]]:
                continue
            actual_gap, predicted_gap = left - right
            if abs(actual_gap) < 1e-8:
                ties += 1
                continue
            pairs += 1
            correct += int(actual_gap * predicted_gap > 0)
    cell_mean_squared_errors = np.array([np.mean(np.square(values)) for values in cell_errors.values()])
    rmse = lambda values: float(np.sqrt(np.mean(np.square(values))))
    return {"observations": len(rows), "heldout_model_benchmark_groups": len(cell_errors),
            "logit_rmse": rmse(error), "logit_mae": float(np.mean(np.abs(error))),
            "group_macro_logit_rmse": float(np.sqrt(np.mean(cell_mean_squared_errors))),
            "benchmark_macro_logit_rmse": float(np.mean([rmse(values) for values in benchmark_errors.values()])),
            "by_benchmark": {data["benchmark_ids"][b]: {"n": len(values), "logit_rmse": rmse(values)} for b, values in benchmark_errors.items()},
            "by_domain": {data["domains"][d]: {"n": len(values), "logit_rmse": rmse(values)} for d, values in domain_errors.items()},
            "same_benchmark_protocol_effort_ordering": {"pairs": pairs, "correct": correct,
                                                       "accuracy": correct / pairs if pairs else None, "observed_ties_excluded": ties},
            "approx_predictive_90_coverage": float(np.mean((observed >= low) & (observed <= high))),
            "approx_predictive_90_mean_width": float(np.mean(high - low)),
            "approx_predictive_crps": float(np.mean(crps)),
            "approx_mean_predictive_log_density": float(np.mean(log_density)),
            "approx_predictive_90_interval_score": float(np.mean(interval_scores)),
            "predictions": records}


def fit(data: dict, rows: list[dict], args: argparse.Namespace) -> tuple[dict, dict]:
    # Import lazily so split/metric tests do not initialize or require JAX.
    import numpyro
    numpyro.set_host_device_count(args.chains)
    import jax
    from numpyro.diagnostics import summary
    from numpyro.infer import MCMC, NUTS
    from numpyro.infer.initialization import init_to_median
    from .model import aci_model
    jax.config.update("jax_enable_x64", True)
    kernel = NUTS(aci_model, target_accept_prob=args.target_accept, init_strategy=init_to_median())
    mcmc = MCMC(kernel, num_warmup=args.warmup, num_samples=args.samples, num_chains=args.chains,
                chain_method="parallel" if jax.local_device_count() >= args.chains else "sequential",
                progress_bar=args.progress)
    started = monotonic()
    mcmc.run(jax.random.PRNGKey(args.fit_seed), data=data, extra_fields=("diverging", "energy"))
    samples = {name: np.asarray(value) for name, value in mcmc.get_samples().items()}
    # Diagnose the actual held-out mean estimands. No full-data summary or
    # calibration-panel publication gate is needed for this reduced-data fit.
    locations = structural_predictions(data, samples, rows).reshape(args.chains, args.samples, -1)
    table = summary({"heldout_location": locations}, group_by_chain=True)["heldout_location"]
    rhat = np.asarray(table["r_hat"])
    ess = np.asarray(table["n_eff"])
    extra = mcmc.get_extra_fields(group_by_chain=True)
    divergences = int(np.asarray(extra["diverging"]).sum())
    energy = np.asarray(extra["energy"])
    ebfmi = [float(np.mean(np.diff(chain) ** 2) / np.var(chain)) if np.var(chain) > 0 else 0 for chain in energy]
    max_rhat = float(np.max(rhat)) if np.isfinite(rhat).all() else None
    min_ess = float(np.min(ess)) if np.isfinite(ess).all() else 0
    rhat_limit, ess_limit = (1.01, 400) if args.production or args.strict_diagnostics else (1.05, 100)
    diagnostics = {"chains": args.chains, "warmup": args.warmup, "samples_per_chain": args.samples,
                   "elapsed_seconds": monotonic() - started, "divergences": divergences,
                   "heldout_location_max_rhat": max_rhat, "heldout_location_min_ess": min_ess,
                   "ebfmi": ebfmi, "thresholds": {"max_rhat": rhat_limit, "min_ess": ess_limit},
                   "adequate_for_comparison": args.chains >= 2 and max_rhat is not None and max_rhat <= rhat_limit
                   and min_ess >= ess_limit and divergences == 0 and min(ebfmi) >= 0.3}
    return samples, diagnostics


def paired_comparison(baseline: dict, candidate: dict, seed: int, replicates: int = 2000) -> dict:
    """Paired bootstrap by model clusters, preserving its related held-out cells."""
    def grouped(metrics):
        cells = {}
        for row in metrics["predictions"]:
            key = (row["model_index"], row["benchmark_id"])
            cells.setdefault(key, []).append([row["error"] ** 2, row["predictive_crps"], row["predictive_log_density"]])
        return {key: np.mean(values, axis=0) for key, values in cells.items()}
    left, right = grouped(baseline), grouped(candidate)
    if set(left) != set(right):
        raise ValueError("Paired comparison requires identical held-out model x benchmark groups")
    keys = sorted(left)
    lhs, rhs = np.array([left[k] for k in keys]), np.array([right[k] for k in keys])
    models = sorted({key[0] for key in keys})
    indices = {m: [i for i, key in enumerate(keys) if key[0] == m] for m in models}
    def differences(index):
        a, b = lhs[index], rhs[index]
        return [np.sqrt(np.mean(b[:, 0])) - np.sqrt(np.mean(a[:, 0])),
                np.mean(b[:, 1] - a[:, 1]), np.mean(b[:, 2] - a[:, 2])]
    point = differences(list(range(len(keys))))
    rng = np.random.default_rng(seed)
    boot = np.array([differences([i for m in rng.choice(models, size=len(models), replace=True) for i in indices[int(m)]])
                     for _ in range(replicates)])
    low, high = np.quantile(boot, [.05, .95], axis=0)
    return {"method": "Paired model-cluster bootstrap over equally weighted model x benchmark group means",
            "replicates": replicates, "seed": seed, "heldout_models": len(models), "heldout_groups": len(keys),
            "direction": "Candidate minus baseline; RMSE and CRPS lower is better, log density higher is better",
            "differences": {name: {"estimate": float(point[i]), "bootstrap_90_low": float(low[i]), "bootstrap_90_high": float(high[i])}
                            for i, name in enumerate(("group_macro_logit_rmse", "group_macro_predictive_crps", "group_macro_predictive_log_density"))},
            "limitation": "Benchmark errors may also correlate; intervals describe this fixed random split, not all future datasets"}


def repeated_cv_summary(reports: list[dict], candidate: str, seed: int = 48221) -> dict:
    """Summarize every prespecified fold without treating repeats as new models."""
    if not reports or len({r["input_sha256"] for r in reports}) != 1:
        raise ValueError("Repeated CV requires reports from the same frozen input")
    split_seeds = [r["split"]["seed"] for r in reports]
    if len(set(split_seeds)) != len(split_seeds):
        raise ValueError("Repeated CV split seeds must be distinct")
    if len({r.get("model_source_sha256") for r in reports}) != 1:
        raise ValueError("Repeated CV requires a frozen model implementation")
    planned = (reports[0].get("selection_history") or {}).get("prespecified_repeated_cv_seeds")
    if planned and set(planned) != set(split_seeds):
        raise ValueError("Every prespecified repeated-CV seed must be reported")
    combined = {"baseline": {"predictions": []}, candidate: {"predictions": []}}
    fold_rows = []
    for report in reports:
        baseline = report["results"]["baseline"]
        current = report["results"][candidate]
        fold_rows.append({"split_seed": report["split"]["seed"],
                          "train_group_count": report["split"]["actual_group_counts"]["train"],
                          "baseline_diagnostics": baseline["diagnostics"],
                          "candidate_diagnostics": current["diagnostics"],
                          "baseline_metrics": {k: v for k, v in baseline["metrics"].items() if k not in ("predictions", "by_benchmark")},
                          "candidate_metrics": {k: v for k, v in current["metrics"].items() if k not in ("predictions", "by_benchmark")}})
        for name in combined:
            for row in report["results"][name]["metrics"]["predictions"]:
                combined[name]["predictions"].append({**row, "split_seed": report["split"]["seed"]})
    comparison = paired_comparison(combined["baseline"], combined[candidate], seed)
    all_rows = combined["baseline"]["predictions"]
    aggregates = {}
    for name, metrics in combined.items():
        groups = {}
        for row in metrics["predictions"]:
            groups.setdefault((row["model_index"], row["benchmark_id"]), []).append(
                [row["error"] ** 2, row["predictive_crps"], row["predictive_log_density"]])
        averaged = np.array([np.mean(values, axis=0) for values in groups.values()])
        aggregates[name] = {"group_macro_logit_rmse": float(np.sqrt(np.mean(averaged[:, 0]))),
                            "group_macro_predictive_crps": float(np.mean(averaged[:, 1])),
                            "group_macro_predictive_log_density": float(np.mean(averaged[:, 2]))}
    strict = [r["results"][name]["diagnostics"] for r in reports for name in ("baseline", candidate)]
    return {"schema_version": 1, "stage": "Exploratory repeated cross-validation after candidate-selection history",
            "candidate": candidate, "input_sha256": reports[0]["input_sha256"], "split_seeds": split_seeds,
            "selection_history": reports[0].get("selection_history"), "folds": fold_rows,
            "all_fits_pass_strict_diagnostics": all(d["adequate_for_comparison"] and d.get("thresholds", {}).get("max_rhat", 2) <= 1.01
                                                   and d.get("thresholds", {}).get("min_ess", 0) >= 400 for d in strict),
            "observation_appearances": len(all_rows),
            "unique_heldout_model_benchmark_groups": len({(r["model_index"], r["benchmark_id"]) for r in all_rows}),
            "aggregate_unique_group_metrics": aggregates, "paired_comparison": comparison,
            "aggregation": "Average squared errors/CRPS/log density across source, effort, and fold appearances within each unique model x benchmark group; weight unique groups equally; bootstrap entire models across all folds together",
            "limitations": ["Repeated folds and their training sets overlap; this is not independent confirmatory evidence",
                            "Preserve original rejected candidate results and report every prespecified fold",
                            "Model-cluster intervals retain repeated-cell dependence but do not capture all benchmark/training-fit dependence"]}


def write_report(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", choices=("dev", "test", "combined"), default="dev",
                        help="combined evaluates the full dev+test holdout for explicitly exploratory repeated CV")
    parser.add_argument("--structures", nargs="+", choices=("baseline", "general_specific", "correlated_unit"), default=["baseline", "general_specific"])
    parser.add_argument("--domain-specific-sd", type=float, default=0.5)
    parser.add_argument("--split-seed", type=int, default=20260906)
    parser.add_argument("--fit-seed", type=int, default=48219)
    parser.add_argument("--dev-fraction", type=float, default=0.1)
    parser.add_argument("--test-fraction", type=float, default=0.1)
    parser.add_argument("--production", action="store_true", help="Use four chains/2,000 warmup/2,000 draws and strict diagnostics by default")
    parser.add_argument("--strict-diagnostics", action="store_true", help="Apply R-hat<=1.01/ESS>=400 even to shorter exploratory fits")
    parser.add_argument("--selection-history", type=Path, help="JSON record of previous inspected results and candidate-selection decisions")
    parser.add_argument("--chains", type=int)
    parser.add_argument("--warmup", type=int)
    parser.add_argument("--samples", type=int)
    parser.add_argument("--target-accept", type=float, default=0.9)
    parser.add_argument("--progress", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Write split/provenance without fitting or revealing held-out outcomes")
    args = parser.parse_args()
    args.chains = args.chains or (4 if args.production else 2)
    args.warmup = args.warmup or (2000 if args.production else 400)
    args.samples = args.samples or (2000 if args.production else 400)
    if args.domain_specific_sd <= 0:
        parser.error("--domain-specific-sd must be positive")
    content = args.input.read_bytes()
    data = json.loads(content)
    split = make_split(data, args.split_seed, args.dev_fraction, args.test_fraction)
    rows = [data["observations"][i] for i in evaluation_indices(split, args.split)]
    report = {"schema_version": 1, "purpose": "Out-of-sample model comparison; not a publication fit",
              "stage": "production_validation" if args.production else "exploratory_validation",
              "evaluated_partition": args.split, "input_path": str(args.input.resolve()),
              "selection_history": json.loads(args.selection_history.read_text()) if args.selection_history else None,
              "input_sha256": hashlib.sha256(content).hexdigest(),
              "model_source_sha256": hashlib.sha256(Path(__file__).with_name("model.py").read_bytes()).hexdigest(),
              "split": split, "fit_seed": args.fit_seed,
              "candidate_parameters": {"domain_specific_sd": args.domain_specific_sd},
              "leakage_controls": ["All efforts and sources of a model x benchmark held out together",
                                   "Development and test rows both excluded from every training likelihood",
                                   "No saved posterior, full-data initialization, or empirically fitted priors reused",
                                   "Fresh held-out cell/family effects; learned model-family residuals discarded",
                                   "Test outcomes must remain unopened until the candidate is fixed"],
              "limitations": ["Random connected-cell validation measures interpolation, not temporal generalization",
                              "Sparse models/benchmarks cannot be held out while retaining training connectivity",
                              "Interval calibration uses a count-to-logit delta approximation",
                              "Logit-named errors use declared transformed likelihood coordinates; money/time are log transforms and Arena is rescaled Elo",
                              "Pair ordering compares only matching benchmark, protocol, and effort class",
                              "These metrics validate benchmark prediction, not a unique definition of intelligence"],
              "results": {}}
    write_report(args.output, report)
    if args.dry_run:
        return
    for structure in args.structures:
        train = training_data(data, split, structure, args.domain_specific_sd)
        samples, diagnostics = fit(train, rows, args)
        report["results"][structure] = {"diagnostics": diagnostics,
                                         "metrics": evaluate(train, samples, rows, args.fit_seed + 1)}
        if "baseline" in report["results"]:
            comparisons = {name: paired_comparison(report["results"]["baseline"]["metrics"], result["metrics"], args.fit_seed + 2)
                           for name, result in report["results"].items() if name != "baseline"}
            if comparisons:
                report["paired_comparisons"] = comparisons
                if len(comparisons) == 1:
                    report["paired_comparison"] = next(iter(comparisons.values()))
        write_report(args.output, report)
        print(json.dumps({"structure": structure, "diagnostics": diagnostics,
                          "logit_rmse": report["results"][structure]["metrics"]["logit_rmse"]}), flush=True)


if __name__ == "__main__":
    main()
