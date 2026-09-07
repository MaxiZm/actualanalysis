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

        # Modifying observations should NOT change design hash
        modified_obs = dict(self.toy_design)
        modified_obs["observations"] = []
        h3 = compute_design_hash(modified_obs)
        self.assertEqual(h1, h3)

        # Modifying trait structure SHOULD change design hash
        modified_trait = dict(self.toy_design)
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
            })

        crit = SBCPowerCriteria(min_replications=100)
        analysis_good = analyze_sbc_results(good_reps, criteria=crit)
        self.assertTrue(analysis_good["replications_sufficient"])
        self.assertTrue(analysis_good["parameter_summaries"]["param_test"]["passed"])

        # Biased collection (all ranks low)
        bad_reps = []
        for i in range(n_reps):
            r = int(rng.integers(0, 50))  # severe skew
            bad_reps.append({
                "replication_id": i,
                "total_draws": 1000,
                "ranks": {"param_test": r},
                "coverage_90": {"param_test": False},
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


if __name__ == "__main__":
    unittest.main()
