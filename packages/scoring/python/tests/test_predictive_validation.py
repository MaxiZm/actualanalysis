"""Leakage and prediction checks independent of expensive posterior sampling."""
import copy
import unittest

import numpy as np

from aci12.validate_predictive import (
    _connected, evaluate, evaluation_indices, group_key, make_split, observed_logit,
    paired_comparison, predictive_draws, predictive_log_density, predictive_scores, repeated_cv_summary, structural_predictions, training_data,
)


def fixture():
    systems = [f"m{m}@{effort}" for m in range(12) for effort in ("std", "max")]
    data = {"n_models": 12, "n_systems": 24, "n_benchmarks": 4, "n_protocols": 1,
            "system_ids": systems, "benchmark_ids": [f"b{b}" for b in range(4)],
            "domains": ["agentic", "code", "reasoning", "knowledge", "communication"],
            "system_model_index": [m for m in range(12) for _ in range(2)],
            "system_profile_index": [effort for _ in range(12) for effort in (0, 1)],
            "benchmark_domains": [[1, 0, 0, 0, 0]] * 4,
            "benchmark_family_index": [0, 0, 1, 1], "protocol_is_self_report": [False],
            "cell_system_index": [], "cell_benchmark_index": [], "observations": [], "priors": {}}
    for system in range(24):
        for benchmark in range(4):
            cell = len(data["cell_system_index"])
            data["cell_system_index"].append(system)
            data["cell_benchmark_index"].append(benchmark)
            # Two source repetitions must stay with both effort variants.
            for _ in range(2):
                data["observations"].append({"cell_index": cell, "system_index": system,
                    "benchmark_index": benchmark, "domain_index": 0, "protocol_index": 0,
                    "provenance_index": 0, "likelihood": "normal", "y": system * 0.1,
                    "variance": 0.01})
    return data


def posterior(data, draws=128):
    traits = np.repeat(np.arange(data["n_systems"])[None, :, None] * 0.1, 5, axis=2)
    return {"Z": np.repeat(traits, draws, axis=0), "beta": np.zeros((draws, 4)),
            "log_alpha": np.zeros((draws, 4)), "proto_z": np.zeros((draws, 1, 5)),
            "scale_a_self": np.zeros(draws), "scale_a_indep": np.zeros(draws),
            "mu_self": np.zeros((draws, 5)), "xi": np.zeros((draws, 4)),
            "family_sd": np.full(draws, .1), "cell_sigma": np.full((draws, 4), .1),
            "scale_xi": np.full((draws, 5), .1), "run_noise": np.full((draws, 2, 5), .1),
            "eta_cell": np.full((draws, 96), 10000), "family_z": np.full((draws, 24, 2), 10000),
            "cell_misfit": np.full((draws, 96), 10000)}


class PredictiveValidationTests(unittest.TestCase):
    def test_split_keeps_all_efforts_sources_together_without_breaking_connectivity(self):
        data = fixture()
        split = make_split(data, 104)
        owners = {}
        for partition, indices in split["row_indices"].items():
            for index in indices:
                key = group_key(data, data["observations"][index])
                self.assertIn(key, [tuple(group) for group in split["groups"][partition]])
                self.assertEqual(owners.setdefault(key, partition), partition)
        self.assertEqual(len(set().union(*(set(x) for x in split["row_indices"].values()))), len(data["observations"]))
        edges = {tuple(edge) for edge in split["groups"]["train"]}
        for model, benchmark in split["groups"]["dev"] + split["groups"]["test"]:
            self.assertTrue(_connected(edges, model, benchmark))
            self.assertGreaterEqual(sum(m == model for m, _ in edges), 2)
            self.assertGreaterEqual(sum(b == benchmark for _, b in edges), 5)

    def test_partition_is_fixed_without_using_outcomes(self):
        data = fixture()
        split = make_split(data, 104)
        for row in data["observations"]:
            row["y"] += 100000
        self.assertEqual(split, make_split(data, 104))
        self.assertNotEqual(split["groups"], make_split(data, 105)["groups"])

    def test_holdout_outcomes_and_cells_are_absent_from_training(self):
        data = fixture()
        split = make_split(data, 104)
        expected = training_data(data, split, "baseline", .5)
        for i in split["row_indices"]["dev"] + split["row_indices"]["test"]:
            data["observations"][i]["y"] = 100000
        self.assertEqual(expected, training_data(data, split, "baseline", .5))
        self.assertEqual(len(expected["cell_system_index"]), 2 * split["actual_group_counts"]["train"])
        for row in expected["observations"]:
            self.assertEqual(expected["cell_system_index"][row["cell_index"]], row["system_index"])
            self.assertEqual(expected["cell_benchmark_index"][row["cell_index"]], row["benchmark_index"])

    def test_structure_changes_only_declared_prior_specification(self):
        data = fixture()
        data["trait_structure"] = "general_specific"
        split = make_split(data, 104)
        baseline = training_data(data, split, "baseline", .5)
        candidate = training_data(data, split, "general_specific", .3)
        self.assertNotIn("trait_structure", baseline)
        self.assertEqual(candidate["trait_structure"], "general_specific")
        self.assertEqual(candidate["priors"]["domain_specific_sd"], .3)
        self.assertEqual(candidate["observations"], baseline["observations"])

    def test_correlated_unit_preserves_other_priors_and_uses_identical_training_rows(self):
        data = fixture()
        data["priors"] = {"effort_specific_sd": .15, "domain_specific_sd": .5}
        split = make_split(data, 104)
        baseline = training_data(data, split, "baseline", .5)
        candidate = training_data(data, split, "correlated_unit", .25)
        self.assertEqual(candidate["trait_structure"], "correlated_unit")
        self.assertEqual(candidate["priors"], baseline["priors"])
        self.assertEqual(candidate["observations"], baseline["observations"])

    def test_combined_holdout_excludes_all_training_rows(self):
        split = make_split(fixture(), 104)
        combined = evaluation_indices(split, "combined")
        self.assertEqual(set(combined), set(evaluation_indices(split, "dev")) | set(evaluation_indices(split, "test")))
        self.assertFalse(set(combined) & set(split["row_indices"]["train"]))
        self.assertEqual(len(combined), len(set(combined)))
        with self.assertRaises(ValueError):
            evaluation_indices(split, "train")

    def test_predictions_never_use_fitted_cell_or_family_residuals(self):
        data = fixture()
        samples = posterior(data)
        rows = data["observations"][:12]
        expected_mean = structural_predictions(data, samples, rows)
        expected_predictive = predictive_draws(data, samples, rows, 104)
        for key in ("eta_cell", "cell_misfit", "family_z"):
            samples[key] *= -100000
        np.testing.assert_array_equal(expected_mean, structural_predictions(data, samples, rows))
        np.testing.assert_array_equal(expected_predictive, predictive_draws(data, samples, rows, 104))

    def test_structural_prediction_uses_full_loadings_and_protocol(self):
        data = fixture()
        samples = posterior(data)
        row = data["observations"][8]  # system 1, benchmark 0
        data["benchmark_domains"][0] = [.25, .75, 0, 0, 0]
        samples["Z"][:, 1, :] = [2, 4, 0, 0, 0]
        samples["beta"][:, 0] = -3
        samples["log_alpha"][:, 0] = np.log(2)
        samples["scale_a_indep"][:] = .2
        samples["proto_z"][:, 0, 0] = .5
        samples["xi"][:, 0] = .3
        np.testing.assert_allclose(structural_predictions(data, samples, [row]), 4.4)

    def test_proper_predictive_scores_penalize_overconfident_and_overwide_predictions(self):
        observed = np.array([0.0])
        precise, _ = predictive_scores(np.array([[0.0], [0.0]]), observed)
        broad, broad_interval = predictive_scores(np.array([[-10.0], [10.0]]), observed)
        missed, missed_interval = predictive_scores(np.array([[10.0], [10.0]]), observed)
        self.assertEqual(float(precise[0]), 0)
        self.assertEqual(float(broad[0]), 5)
        self.assertEqual(float(missed[0]), 10)
        self.assertGreater(missed_interval[0], broad_interval[0])

    def test_predictive_log_density_matches_unit_normal_and_handles_extreme_tails(self):
        expected = -.5 * np.log(2 * np.pi)
        actual = predictive_log_density(np.zeros((10, 1)), np.ones((10, 1)), np.array([0]))
        self.assertAlmostEqual(float(actual[0]), expected)
        extreme = predictive_log_density(np.zeros((10, 1)), np.ones((10, 1)), np.array([1000]))
        self.assertTrue(np.isfinite(extreme[0]))

    def test_paired_bootstrap_uses_identical_groups_and_gives_zero_for_identical_models(self):
        data = fixture()
        metrics = evaluate(data, posterior(data), data["observations"], 104)
        comparison = paired_comparison(metrics, metrics, 104, replicates=50)
        self.assertEqual(comparison["heldout_models"], 12)
        for item in comparison["differences"].values():
            self.assertEqual(item, {"estimate": 0, "bootstrap_90_low": 0, "bootstrap_90_high": 0})
        missing = copy.deepcopy(metrics)
        missing["predictions"] = missing["predictions"][16:]
        with self.assertRaises(ValueError):
            paired_comparison(metrics, missing, 104, replicates=50)

    def test_repeated_cv_does_not_count_repeated_groups_as_new_evidence(self):
        data = fixture()
        metrics = evaluate(data, posterior(data), data["observations"], 104)
        result = {"diagnostics": {"adequate_for_comparison": True}, "metrics": metrics}
        first = {"input_sha256": "same", "split": {"seed": 7, "actual_group_counts": {"train": 40}},
                 "results": {"baseline": result, "correlated_unit": result}}
        second = copy.deepcopy(first)
        second["split"]["seed"] = 8
        summary = repeated_cv_summary([first, second], "correlated_unit")
        self.assertEqual(summary["unique_heldout_model_benchmark_groups"], 48)
        self.assertEqual(summary["paired_comparison"]["heldout_models"], 12)
        self.assertEqual(summary["observation_appearances"], 384)
        self.assertEqual(summary["paired_comparison"]["differences"]["group_macro_logit_rmse"]["bootstrap_90_high"], 0)
        with self.assertRaises(ValueError):
            repeated_cv_summary([first, first], "correlated_unit")

    def test_count_logit_and_variance_are_finite_at_boundaries(self):
        for x in (0, 50, 100):
            y, variance = observed_logit({"likelihood": "a_single", "x": x, "n_tasks": 100})
            self.assertTrue(np.isfinite(y))
            self.assertGreater(variance, 0)
            if x == 50:
                self.assertEqual(y, 0)
                self.assertAlmostEqual(variance, 4 / 101)
        _, single_var = observed_logit({"likelihood": "a_total", "x": 100, "n_tasks": 100, "k_trials": 2, "rho": 0})
        _, repeated_var = observed_logit({"likelihood": "a_total", "x": 100, "n_tasks": 100, "k_trials": 2, "rho": .5})
        self.assertAlmostEqual(repeated_var, single_var * 1.5)

    def test_opposite_errors_within_one_group_do_not_cancel(self):
        data = fixture()
        rows = copy.deepcopy(data["observations"][:2])
        rows[0]["y"], rows[1]["y"] = 1, -1
        metrics = evaluate(data, posterior(data), rows, 104)
        self.assertEqual(metrics["group_macro_logit_rmse"], 1)

    def test_known_predictor_has_zero_error_and_perfect_matched_ordering(self):
        data = fixture()
        result = evaluate(data, posterior(data), data["observations"], 104)
        self.assertAlmostEqual(result["logit_rmse"], 0)
        self.assertEqual(result["same_benchmark_protocol_effort_ordering"]["accuracy"], 1)
        # 12 choose 2 comparisons x 4 benchmarks x 2 effort classes.
        self.assertEqual(result["same_benchmark_protocol_effort_ordering"]["pairs"], 528)
        self.assertEqual(result["approx_predictive_90_coverage"], 1)

    def test_unseen_protocol_condition_does_not_reuse_training_xi_index(self):
        data = fixture()
        rows = [copy.deepcopy(data["observations"][0])]
        data["observations"] = [row for row in data["observations"] if row["benchmark_index"] != 0]
        samples = posterior(data)
        samples["xi"][:] = 100000
        np.testing.assert_allclose(structural_predictions(data, samples, rows), 0)


if __name__ == "__main__":
    unittest.main()
