import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

import numpy as np
import scipy.stats as stats

from aci12.predictive_evaluator import (
    EvaluatorConfig,
    ProductionPredictiveEvaluator,
    compute_interval_score_90,
    evaluate_paired_models,
    observation_log_likelihood,
    sample_observation_predictive,
)


class TestProductionPredictiveEvaluator(unittest.TestCase):

    def test_normal_likelihood_matches_scipy(self):
        obs = {
            "likelihood": "normal",
            "y": 1.5,
            "variance": 0.25,
        }
        location = 1.2
        omega = 0.3
        total_sd = np.sqrt(0.25 + 0.3**2)
        expected = stats.norm.logpdf(1.5, loc=location, scale=total_sd)
        actual = observation_log_likelihood(obs, location=location, omega=omega, run_eps=0.0)
        self.assertAlmostEqual(actual, expected, places=6)

    def test_a_single_likelihood_matches_scipy(self):
        obs = {
            "likelihood": "a_single",
            "x": 35,
            "n_tasks": 50,
            "chance_level": 0.1,
            "ceiling": 0.9,
        }
        location = 0.5
        omega = 0.2
        run_eps = 0.8
        linear = location + omega * run_eps
        prob = 0.1 + (0.9 - 0.1) * (1.0 / (1.0 + np.exp(-linear)))
        expected = stats.binom.logpmf(35, 50, prob)
        actual = observation_log_likelihood(obs, location=location, omega=omega, run_eps=run_eps)
        self.assertAlmostEqual(actual, expected, places=6)

    def test_a_total_likelihood_design_effect(self):
        obs = {
            "likelihood": "a_total",
            "x": 80.0,
            "n_tasks": 40,
            "k_trials": 3,
            "chance_level": 0.0,
            "ceiling": 1.0,
        }
        location = 0.0
        omega = 0.1
        run_eps = -0.5
        rho = 0.2
        linear = location + omega * run_eps
        prob = 1.0 / (1.0 + np.exp(-linear))
        total = 40 * 3
        design_effect = 1.0 + (3 - 1) * rho
        var = total * prob * (1.0 - prob) * design_effect
        expected = stats.norm.logpdf(80.0, loc=total * prob, scale=np.sqrt(var))
        actual = observation_log_likelihood(obs, location=location, omega=omega, run_eps=run_eps, rho_benchmark=rho)
        self.assertAlmostEqual(actual, expected, places=6)

    def test_a_exact_betabinomial_likelihood(self):
        obs = {
            "likelihood": "a_exact",
            "per_task_counts": [1, 2, 3, 2, 1],
            "k_trials": 3,
            "chance_level": 0.0,
            "ceiling": 1.0,
            "use_beta_binomial": True,
        }
        location = 0.2
        omega = 0.1
        run_eps = 0.0
        rho = 0.25
        ll = observation_log_likelihood(obs, location=location, omega=omega, run_eps=run_eps, rho_benchmark=rho)
        self.assertTrue(np.isfinite(ll))
        self.assertLess(ll, 0.0)

    def test_interval_score_calculation(self):
        # Inside interval: width only
        score_inside = compute_interval_score_90(lower=10.0, upper=20.0, actual=15.0)
        self.assertEqual(score_inside, 10.0)

        # Below interval: width + 20 * (lower - actual)
        score_below = compute_interval_score_90(lower=10.0, upper=20.0, actual=8.0)
        self.assertEqual(score_below, 10.0 + 20.0 * 2.0)

        # Above interval: width + 20 * (actual - upper)
        score_above = compute_interval_score_90(lower=10.0, upper=20.0, actual=22.0)
        self.assertEqual(score_above, 10.0 + 20.0 * 2.0)

    def test_shared_random_effects_joint_dependence(self):
        # Verify that two observations sharing the same cell are integrated with the SAME cell misfit
        train_data = {
            "n_models": 2,
            "n_systems": 2,
            "n_benchmarks": 1,
            "n_families": 1,
            "n_protocols": 1,
            "system_ids": ["mod_a@max-common", "mod_b@max-common"],
            "benchmark_ids": ["bench_1"],
            "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0]],
            "benchmark_family_index": [0],
            "observations": [
                # mod_b is in training, mod_a is not
                {"system_index": 1, "benchmark_index": 0, "likelihood": "normal", "y": 0.5, "variance": 0.1}
            ]
        }
        # Mock posterior samples with 10 draws
        n_draws = 10
        posterior_samples = {
            "Z": np.zeros((n_draws, 2, 5)),
            "beta": np.zeros((n_draws, 1)),
            "log_alpha": np.zeros((n_draws, 1)),
            "family_sd": np.full(n_draws, 0.25),
            "family_z": np.zeros((n_draws, 2, 1)),
            "cell_sigma": np.full((n_draws, 1), 0.30),
            "run_noise": np.full((n_draws, 2, 5), 0.15),
            "scale_a_indep": np.full(n_draws, 0.15),
            "proto_z": np.zeros((n_draws, 1, 5)),
        }

        evaluator = ProductionPredictiveEvaluator(
            train_data,
            posterior_samples,
            config=EvaluatorConfig(n_mc_draws=100, seed=42)
        )

        # Two observations in the SAME held-out cell (system 0, benchmark 0)
        obs_1 = {"train_system_index": 0, "train_benchmark_index": 0, "likelihood": "normal", "y": 1.0, "variance": 0.01}
        obs_2 = {"train_system_index": 0, "train_benchmark_index": 0, "likelihood": "normal", "y": 1.0, "variance": 0.01}

        # Joint evaluation of both together
        group_joint = evaluator.evaluate_group([obs_1, obs_2], group_id="cell_shared")
        # Individual evaluation
        group_single_1 = evaluator.evaluate_group([obs_1], group_id="single_1")
        group_single_2 = evaluator.evaluate_group([obs_2], group_id="single_2")

        # Due to positive correlation from shared cell misfit e_sb,
        # the joint density p(y1, y2) should be HIGHER than product of marginals p(y1)*p(y2)
        # when both y1 and y2 deviate in the same direction!
        lpd_product = group_single_1.joint_lpd + group_single_2.joint_lpd
        self.assertGreater(group_joint.joint_lpd, lpd_product)

    def test_eval_spec_evaluation_end_to_end(self):
        train_data = {
            "n_models": 2,
            "n_systems": 2,
            "n_benchmarks": 2,
            "n_families": 2,
            "n_protocols": 1,
            "system_ids": ["mod_a@max-common", "mod_b@max-common"],
            "benchmark_ids": ["bench_1", "bench_2"],
            "benchmark_domains": [
                [0.8, 0.2, 0.0, 0.0, 0.0],
                [0.1, 0.9, 0.0, 0.0, 0.0]
            ],
            "benchmark_family_index": [0, 1],
            "observations": [
                {"system_index": 1, "benchmark_index": 0, "likelihood": "normal", "y": 0.2, "variance": 0.1},
                {"system_index": 1, "benchmark_index": 1, "likelihood": "a_single", "x": 18, "n_tasks": 20},
            ]
        }

        n_draws = 5
        posterior_samples = {
            "Z": np.zeros((n_draws, 2, 5)),
            "beta": np.zeros((n_draws, 2)),
            "log_alpha": np.zeros((n_draws, 2)),
            "family_sd": np.full(n_draws, 0.2),
            "cell_sigma": np.full((n_draws, 2), 0.25),
            "run_noise": np.full((n_draws, 2, 5), 0.1),
        }

        eval_spec = {
            "target_successor_model": "mod_a",
            "target_domain": "agentic",
            "primary_target_observations": [
                {
                    "train_system_index": 0,
                    "train_benchmark_index": 0,
                    "benchmark_id": "bench_1",
                    "likelihood": "normal",
                    "y": 0.1,
                    "variance": 0.05,
                    "evaluation_stratum": "primary_target",
                },
                {
                    "train_system_index": 0,
                    "train_benchmark_index": 1,
                    "benchmark_id": "bench_2",
                    "likelihood": "a_single",
                    "x": 15,
                    "n_tasks": 20,
                    "evaluation_stratum": "primary_target",
                }
            ]
        }

        evaluator = ProductionPredictiveEvaluator(train_data, posterior_samples, config=EvaluatorConfig(n_mc_draws=10, seed=123))
        res = evaluator.evaluate_eval_spec(eval_spec)
        self.assertEqual(res.n_observations, 2)
        self.assertEqual(res.n_groups, 2)
        self.assertTrue(np.isfinite(res.joint_lpd))
        self.assertTrue(np.isfinite(res.normalized_lpd))
        self.assertGreaterEqual(res.mean_coverage_90, 0.0)
        self.assertLessEqual(res.mean_coverage_90, 1.0)
        self.assertGreaterEqual(res.mean_interval_score_90, 0.0)

    def test_subprocess_reproducibility_different_pythonhashseed(self):
        script = """
import json
import sys
import numpy as np
from aci12.predictive_evaluator import ProductionPredictiveEvaluator, EvaluatorConfig

train_data = {
    "n_models": 1, "n_systems": 1, "n_benchmarks": 1, "n_families": 1, "n_protocols": 1,
    "system_ids": ["mod@max"], "benchmark_ids": ["bench"],
    "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0]], "benchmark_family_index": [0],
    "observations": [{"system_index": 0, "benchmark_index": 0, "likelihood": "normal", "y": 0.0, "variance": 0.1}],
}
posterior = {
    "Z": np.zeros((2, 1, 5)), "beta": np.zeros((2, 1)), "log_alpha": np.zeros((2, 1)),
    "family_sd": np.full(2, 0.2), "cell_sigma": np.full((2, 1), 0.2),
    "run_noise": np.full((2, 2, 5), 0.1),
}
evaluator = ProductionPredictiveEvaluator(train_data, posterior, config=EvaluatorConfig(n_mc_draws=20, seed=42))
obs = [{"train_system_index": 0, "train_benchmark_index": 0, "likelihood": "normal", "y": 0.5, "variance": 0.1}]
res = evaluator.evaluate_group(obs, group_id="subproc_test_group")
print(json.dumps({"lpd": res.joint_lpd, "score": res.mean_interval_score_90}))
"""
        outputs = []
        for seed_val in ["0", "42", "99999", "random"]:
            env = dict(os.environ)
            env["PYTHONHASHSEED"] = seed_val
            env["PYTHONPATH"] = "packages/scoring/python"
            p = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=env)
            self.assertEqual(p.returncode, 0, msg=f"Stderr: {p.stderr}")
            outputs.append(p.stdout.strip())

        self.assertEqual(len(set(outputs)), 1, f"Different outputs across PYTHONHASHSEED: {outputs}")

    def test_matches_model_group_observations_on_real_accepted_input(self):
        accepted_path = Path("docs/audits/1.4.3-effort-coverage/accepted-input.json")
        if not accepted_path.exists():
            self.skipTest("accepted-input.json not found")

        from aci12.model import group_observations
        with open(accepted_path) as f:
            data = json.load(f)

        grouped = group_observations(data)
        n_pairs_expected = grouped["n_pairs"]

        n_draws = 2
        n_systems = int(data["n_systems"])
        n_benchmarks = int(data["n_benchmarks"])
        posterior = {
            "Z": np.zeros((n_draws, n_systems, 5)),
            "beta": np.zeros((n_draws, n_benchmarks)),
            "log_alpha": np.zeros((n_draws, n_benchmarks)),
            "family_sd": np.full(n_draws, 0.2),
            "cell_sigma": np.full((n_draws, n_benchmarks), 0.25),
            "run_noise": np.full((n_draws, 2, 5), 0.15),
        }

        evaluator = ProductionPredictiveEvaluator(data, posterior)
        self.assertEqual(len(evaluator._training_pairs), n_pairs_expected)
        self.assertEqual(evaluator.metadata_factor, float(data.get("metadata_incomplete_multiplier", 1.5)))

        pair_index = {}
        for row in data["observations"]:
            key = (int(row.get("protocol_index", 0)), int(row["benchmark_index"]))
            if key not in pair_index:
                pair_index[key] = len(pair_index)

        self.assertEqual(evaluator._training_pairs, pair_index)

    def test_fail_closed_on_invalid_row_mappings(self):
        train_data = {
            "n_models": 2,
            "n_systems": 2,
            "n_benchmarks": 2,
            "n_families": 1,
            "n_protocols": 1,
            "system_ids": ["mod_a@max", "mod_b@max"],
            "benchmark_ids": ["bench_0", "bench_1"],
            "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0, 0.0]],
            "benchmark_family_index": [0, 0],
            "observations": [
                {"system_index": 0, "benchmark_index": 0, "likelihood": "normal", "y": 0.0, "variance": 0.1}
            ]
        }
        posterior = {
            "Z": np.zeros((2, 2, 5)), "beta": np.zeros((2, 2)), "log_alpha": np.zeros((2, 2)),
            "family_sd": np.full(2, 0.2), "cell_sigma": np.full((2, 2), 0.2),
            "run_noise": np.full((2, 2, 5), 0.1),
        }
        evaluator = ProductionPredictiveEvaluator(train_data, posterior)

        # Missing system index
        with self.assertRaises(KeyError):
            evaluator.evaluate_group([{"benchmark_index": 0, "likelihood": "normal", "y": 0.0}], group_id="g1")

        # System index out of bounds
        with self.assertRaises(IndexError):
            evaluator.evaluate_group([{"system_index": 5, "benchmark_index": 0, "likelihood": "normal", "y": 0.0}], group_id="g2")

        # System ID mismatch
        with self.assertRaises(ValueError):
            evaluator.evaluate_group([{"system_index": 0, "system_id": "wrong_id", "benchmark_index": 0, "likelihood": "normal", "y": 0.0}], group_id="g3")

        # Benchmark index out of bounds
        with self.assertRaises(IndexError):
            evaluator.evaluate_group([{"system_index": 0, "benchmark_index": 99, "likelihood": "normal", "y": 0.0}], group_id="g4")

        # Benchmark ID mismatch
        with self.assertRaises(ValueError):
            evaluator.evaluate_group([{"system_index": 0, "benchmark_index": 0, "benchmark_id": "wrong_bench", "likelihood": "normal", "y": 0.0}], group_id="g5")

        # Invalid provenance index
        with self.assertRaises(ValueError):
            evaluator.evaluate_group([{"system_index": 0, "benchmark_index": 0, "provenance_index": 5, "likelihood": "normal", "y": 0.0}], group_id="g6")

        # Invalid domain index
        with self.assertRaises(IndexError):
            evaluator.evaluate_group([{"system_index": 0, "benchmark_index": 0, "domain_index": 10, "likelihood": "normal", "y": 0.0}], group_id="g7")

    def test_trained_cell_effects_reused_conditionally(self):
        train_data = {
            "n_models": 2,
            "n_systems": 2,
            "n_benchmarks": 1,
            "n_families": 1,
            "n_protocols": 1,
            "system_ids": ["mod_a@max", "mod_b@max"],
            "benchmark_ids": ["bench_0"],
            "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0]],
            "benchmark_family_index": [0],
            "cell_system_index": [0],
            "cell_benchmark_index": [0],
            "observations": [
                {"system_index": 0, "benchmark_index": 0, "likelihood": "normal", "y": 0.0, "variance": 0.1}
            ]
        }
        n_draws = 1
        posterior = {
            "Z": np.zeros((n_draws, 2, 5)),
            "beta": np.zeros((n_draws, 1)),
            "log_alpha": np.zeros((n_draws, 1)),
            "family_sd": np.full(n_draws, 0.0),
            "family_z": np.zeros((n_draws, 2, 1)),
            "cell_sigma": np.full((n_draws, 1), 1.0),
            "cell_misfit": np.full((n_draws, 1), 5.0),
            "run_noise": np.full((n_draws, 2, 5), 0.001),
        }
        evaluator = ProductionPredictiveEvaluator(train_data, posterior, config=EvaluatorConfig(n_mc_draws=50, seed=123))

        # Cell (0, 0) has training observations -> trained cell misfit (5.0) reused
        obs_trained = [{"system_index": 0, "benchmark_index": 0, "likelihood": "normal", "y": 5.0, "variance": 0.01}]
        res_trained_match = evaluator.evaluate_group(obs_trained, group_id="trained_match")
        obs_trained_diff = [{"system_index": 0, "benchmark_index": 0, "likelihood": "normal", "y": 0.0, "variance": 0.01}]
        res_trained_diff = evaluator.evaluate_group(obs_trained_diff, group_id="trained_diff")
        self.assertGreater(res_trained_match.joint_lpd, res_trained_diff.joint_lpd + 100.0)

        # Cell (1, 0) has 0 training observations -> cell misfit is sampled from prior t4
        obs_withheld = [{"system_index": 1, "benchmark_index": 0, "likelihood": "normal", "y": 0.0, "variance": 0.01}]
        res_withheld = evaluator.evaluate_group(obs_withheld, group_id="withheld")
        self.assertTrue(np.isfinite(res_withheld.joint_lpd))


if __name__ == "__main__":
    unittest.main()
