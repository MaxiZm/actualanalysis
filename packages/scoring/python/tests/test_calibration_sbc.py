import json
import unittest
from pathlib import Path

import numpy as np

from aci12.calibration_sbc import (
    DEFAULT_SBC_POWER_CRITERIA,
    SBCPowerCriteria,
    analyze_sbc_results,
    compute_design_hash,
    generate_synthetic_dataset,
    run_sbc_replication,
)


class TestCalibrationSBC(unittest.TestCase):

    def setUp(self):
        # Minimal toy design fixture
        self.toy_design = {
            "n_models": 2,
            "n_systems": 2,
            "n_benchmarks": 2,
            "n_families": 2,
            "n_protocols": 1,
            "system_ids": ["model-a@max-common", "model-b@max-common"],
            "system_model_index": [0, 1],
            "system_profile_index": [1, 1],
            "system_is_fixed_effort": [False, False],
            "benchmark_ids": ["bench-1", "bench-2"],
            "benchmark_family_ids": ["fam-1", "fam-2"],
            "benchmark_family_index": [0, 1],
            "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0, 0.0]],
            "trait_structure": "correlated",
            "calibration_panel_system_ids": ["model-a@max-common", "model-b@max-common"],
            "observations": [
                {
                    "system_index": 0,
                    "benchmark_index": 0,
                    "cell_index": 0,
                    "protocol_index": 0,
                    "provenance_index": 0,
                    "domain_index": 0,
                    "likelihood": "normal",
                    "variance": 0.05,
                },
                {
                    "system_index": 1,
                    "benchmark_index": 1,
                    "cell_index": 1,
                    "protocol_index": 0,
                    "provenance_index": 0,
                    "domain_index": 1,
                    "likelihood": "a_single",
                    "n_tasks": 20,
                    "chance_level": 0.0,
                    "ceiling": 1.0,
                },
            ],
            "cell_system_index": [0, 1],
            "cell_benchmark_index": [0, 1],
        }

    def test_design_hash_deterministic(self):
        h1 = compute_design_hash(self.toy_design)
        h2 = compute_design_hash(self.toy_design)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)

        # Modifying outcome values (y, x, score) should NOT change design hash
        import copy
        modified_outcomes = copy.deepcopy(self.toy_design)
        modified_outcomes["observations"][0]["y"] = 999.0
        modified_outcomes["observations"][1]["x"] = 12
        h_outcomes = compute_design_hash(modified_outcomes)
        self.assertEqual(h1, h_outcomes)

        # Modifying observation structure (dropping observations or changing likelihood) SHOULD change design hash
        modified_obs = copy.deepcopy(self.toy_design)
        modified_obs["observations"] = []
        h3 = compute_design_hash(modified_obs)
        self.assertNotEqual(h1, h3)

        # Modifying effort mappings SHOULD change design hash
        modified_effort = copy.deepcopy(self.toy_design)
        modified_effort["system_is_fixed_effort"] = [True, False]
        h_effort = compute_design_hash(modified_effort)
        self.assertNotEqual(h1, h_effort)

        # Modifying trait structure SHOULD change design hash
        modified_trait = copy.deepcopy(self.toy_design)
        modified_trait["trait_structure"] = "correlated_unit"
        h4 = compute_design_hash(modified_trait)
        self.assertNotEqual(h1, h4)

    def test_synthetic_generation_truth_separated(self):
        synthetic_data, truth = generate_synthetic_dataset(self.toy_design, seed=42)
        self.assertIn("observations", synthetic_data)
        self.assertEqual(len(synthetic_data["observations"]), 2)

        # Normal obs should have y
        self.assertIn("y", synthetic_data["observations"][0])
        # Single obs should have x
        self.assertIn("x", synthetic_data["observations"][1])

        # Truth contains prior parameters
        self.assertIn("effort_mean", truth)
        self.assertIn("beta", truth)
        self.assertIn("cell_sigma", truth)

    def test_misspecification_modes(self):
        # Missing domain
        data_md, _ = generate_synthetic_dataset(
            self.toy_design,
            seed=42,
            misspecification="missing_domain",
            misspecification_kwargs={"drop_domain_index": 0},
        )
        self.assertEqual(len(data_md["observations"]), 1)
        self.assertEqual(data_md["observations"][0]["domain_index"], 1)

        # Effort shift
        _, truth_es = generate_synthetic_dataset(
            self.toy_design,
            seed=42,
            misspecification="effort_shift",
            misspecification_kwargs={"shift_amount": 2.5},
        )
        self.assertGreater(truth_es["effort_mean"], 2.0)

    def test_analyze_sbc_results_uniform_vs_biased(self):
        # Synthetic collection of well-calibrated ranks (uniform in 0..100)
        rng = np.random.default_rng(42)
        n_reps = 150
        good_reps = []
        for i in range(n_reps):
            r = int(rng.integers(0, 1000))
            cov = bool(50 <= r <= 950)
            good_reps.append({
                "replication_id": i,
                "total_draws": 1000,
                "ranks": {"param_test": r},
                "coverage_90": {"param_test": cov},
                "sampler_diagnostics": {
                    "r_hat_max": 1.002,
                    "min_ess": 500.0,
                    "divergences": 0,
                },
            })

        crit = SBCPowerCriteria(min_replications=100)
        analysis_good = analyze_sbc_results(good_reps, criteria=crit, design_hash="hash123", code_identity="commit123")
        self.assertTrue(analysis_good["passed"])
        self.assertTrue(analysis_good["replications_sufficient"])
        self.assertTrue(analysis_good["parameter_summaries"]["param_test"]["passed"])
        self.assertEqual(analysis_good["parameter_summaries"]["param_test"]["n_replications"], n_reps)
        self.assertIn("sampler_diagnostics", analysis_good)
        self.assertTrue(analysis_good["sampler_diagnostics"]["sampler_ok"])
        self.assertEqual(analysis_good["design_hash"], "hash123")
        self.assertEqual(analysis_good["code_identity"], "commit123")

        # Biased collection (all ranks low)
        bad_reps = []
        for i in range(n_reps):
            r = int(rng.integers(0, 50))  # severe skew
            bad_reps.append({
                "replication_id": i,
                "total_draws": 1000,
                "ranks": {"param_test": r},
                "coverage_90": {"param_test": False},
                "sampler_diagnostics": {
                    "r_hat_max": 1.002,
                    "min_ess": 500.0,
                    "divergences": 0,
                },
            })

        analysis_bad = analyze_sbc_results(bad_reps, criteria=crit)
        self.assertFalse(analysis_bad["passed"])
        self.assertFalse(analysis_bad["parameter_summaries"]["param_test"]["passed"])

    def test_bounded_smoke_sbc_replication(self):
        # Bounded fast smoke run (1 chain, 10 warmup, 10 samples)
        rep = run_sbc_replication(
            self.toy_design,
            replication_id=0,
            seed=123,
            warmup=10,
            samples=10,
            chains=1,
            monitored_parameters=["effort_mean"],
        )
        self.assertEqual(rep["replication_id"], 0)
        self.assertEqual(rep["total_draws"], 10)
        self.assertIn("effort_mean", rep["ranks"])
        self.assertIn("effort_mean", rep["coverage_90"])
        self.assertIn("sampler_diagnostics", rep)
        self.assertIn("r_hat_max", rep["sampler_diagnostics"])
        self.assertIn("min_ess", rep["sampler_diagnostics"])
        self.assertIn("divergences", rep["sampler_diagnostics"])

    def test_synthetic_data_generation_unconditioned_nondegenerate(self):
        design = {
            "n_models": 1, "n_systems": 1, "n_benchmarks": 4, "n_families": 1, "n_protocols": 1,
            "system_model_index": [0], "system_profile_index": [0.0], "benchmark_family_index": [0, 0, 0, 0],
            "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0]] * 4,
            "cell_system_index": [0, 0, 0, 0], "cell_benchmark_index": [0, 1, 2, 3],
            "observations": [
                {"cell_index": 0, "system_index": 0, "benchmark_index": 0, "protocol_index": 0,
                 "provenance_index": 0, "domain_index": 0, "likelihood": "normal", "variance": 0.1, "y": 0.0},
                {"cell_index": 1, "system_index": 0, "benchmark_index": 1, "protocol_index": 0,
                 "provenance_index": 0, "domain_index": 0, "likelihood": "a_single", "n_tasks": 50, "chance_level": 0.0, "ceiling": 1.0, "x": 0},
                {"cell_index": 2, "system_index": 0, "benchmark_index": 2, "protocol_index": 0,
                 "provenance_index": 0, "domain_index": 0, "likelihood": "a_total", "n_tasks": 50, "k_trials": 3, "chance_level": 0.0, "ceiling": 1.0, "x": 0.0},
                {"cell_index": 3, "system_index": 0, "benchmark_index": 3, "protocol_index": 0,
                 "provenance_index": 0, "domain_index": 0, "likelihood": "a_exact", "n_tasks": 5, "k_trials": 3, "chance_level": 0.0, "ceiling": 1.0,
                 "per_task_counts": [0, 0, 0, 0, 0], "use_beta_binomial": False},
            ],
        }
        syn, truth = generate_synthetic_dataset(design, seed=42)
        obs = syn["observations"]

        # 1. Normal likelihood outcome is non-zero
        self.assertNotEqual(obs[0]["y"], 0.0)
        self.assertAlmostEqual(obs[0]["y"], float(truth["obs_normal"][0]), places=5)

        # 2. Single likelihood outcome is non-negative integer within [0, n_tasks]
        self.assertIsInstance(obs[1]["x"], int)
        self.assertGreaterEqual(obs[1]["x"], 0)
        self.assertLessEqual(obs[1]["x"], 50)
        self.assertEqual(obs[1]["x"], int(truth["obs_single"][0]))

        # 3. Total likelihood outcome is non-zero within bounds
        self.assertIsInstance(obs[2]["x"], float)
        self.assertGreaterEqual(obs[2]["x"], 0.0)
        self.assertAlmostEqual(obs[2]["x"], float(truth["obs_total"][0]), places=4)

        # 4. Exact likelihood counts are non-empty list of task counts
        counts = obs[3]["per_task_counts"]
        self.assertEqual(len(counts), 5)
        self.assertTrue(all(0 <= c <= 3 for c in counts))
        self.assertEqual(counts, [int(c) for c in truth["obs_exact_3"]])

        # Condition observations contract preserved for fitting
        self.assertTrue(syn.get("condition_observations", False))

    def test_synthetic_data_generation_seed_sensitivity(self):
        design = {
            "n_models": 1, "n_systems": 1, "n_benchmarks": 2, "n_families": 1, "n_protocols": 1,
            "system_model_index": [0], "system_profile_index": [0.0], "benchmark_family_index": [0, 0],
            "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0]] * 2,
            "cell_system_index": [0, 0], "cell_benchmark_index": [0, 1],
            "observations": [
                {"cell_index": 0, "system_index": 0, "benchmark_index": 0, "protocol_index": 0,
                 "provenance_index": 0, "domain_index": 0, "likelihood": "normal", "variance": 0.1, "y": 0.0},
                {"cell_index": 1, "system_index": 0, "benchmark_index": 1, "protocol_index": 0,
                 "provenance_index": 0, "domain_index": 0, "likelihood": "a_single", "n_tasks": 50, "chance_level": 0.0, "ceiling": 1.0, "x": 0},
            ],
        }
        syn1, truth1 = generate_synthetic_dataset(design, seed=42)
        syn2, truth2 = generate_synthetic_dataset(design, seed=999)

        # Observations must differ between different seeds
        self.assertNotEqual(syn1["observations"][0]["y"], syn2["observations"][0]["y"])
        self.assertNotEqual(syn1["observations"][1]["x"], syn2["observations"][1]["x"])
        self.assertNotEqual(truth1["obs_normal"], truth2["obs_normal"])

    def test_exact_likelihood_fails_closed_when_conditioned_without_counts(self):
        from aci12.model import aci_model
        import jax
        bad_design = {
            "n_models": 1, "n_systems": 1, "n_benchmarks": 1, "n_families": 1, "n_protocols": 1,
            "system_model_index": [0], "system_profile_index": [0.0], "benchmark_family_index": [0],
            "benchmark_domains": [[1.0, 0.0, 0.0, 0.0, 0.0]],
            "cell_system_index": [0], "cell_benchmark_index": [0],
            "observations": [
                {"cell_index": 0, "system_index": 0, "benchmark_index": 0, "protocol_index": 0,
                 "provenance_index": 0, "domain_index": 0, "likelihood": "a_exact", "n_tasks": 5, "k_trials": 3,
                 "chance_level": 0.0, "ceiling": 1.0, "per_task_counts": None},
            ],
            "condition_observations": True,
        }
        with self.assertRaises(ValueError):
            # Running model directly in conditioned mode with missing per_task_counts must fail closed
            from numpyro.infer import Predictive
            Predictive(aci_model, num_samples=1)(jax.random.PRNGKey(42), data=bad_design)


if __name__ == "__main__":
    unittest.main()
