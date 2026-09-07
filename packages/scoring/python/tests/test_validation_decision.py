import unittest
import numpy as np

from aci12.validation_decision import (
    COVERAGE_NONINFERIORITY_LOWER_BOUND,
    INTERVAL_SCORE_NONINFERIORITY_UPPER_BOUND,
    BootstrapInterval,
    ComponentBlockData,
    aggregate_blocks_to_components,
    evaluate_validation_decision,
    paired_cluster_bootstrap,
    validate_condition_scales,
)


class TestValidationDecision(unittest.TestCase):

    def test_paired_cluster_bootstrap_reproducibility(self):
        comp_vals = {f"comp_{i}": float(i) for i in range(10)}
        res1 = paired_cluster_bootstrap(comp_vals, n_replicates=500, seed=42)
        res2 = paired_cluster_bootstrap(comp_vals, n_replicates=500, seed=42)
        self.assertEqual(res1.mean, res2.mean)
        self.assertEqual(res1.ci_lower, res2.ci_lower)
        self.assertEqual(res1.ci_upper, res2.ci_upper)

    def test_aggregate_blocks_equal_component_weighting(self):
        # Component 1 has 3 blocks with deltas [1.0, 2.0, 3.0] -> mean 2.0
        # Component 2 has 1 block with delta [10.0] -> mean 10.0
        blocks = [
            ComponentBlockData("c1", "prov_A", "b1", delta_lpd=1.0, delta_coverage=0.0, delta_interval_score=0.0),
            ComponentBlockData("c1", "prov_A", "b2", delta_lpd=2.0, delta_coverage=0.0, delta_interval_score=0.0),
            ComponentBlockData("c1", "prov_A", "b3", delta_lpd=3.0, delta_coverage=0.0, delta_interval_score=0.0),
            ComponentBlockData("c2", "prov_B", "b4", delta_lpd=10.0, delta_coverage=0.0, delta_interval_score=0.0),
        ]
        lpd, cov, is_score, prov_map = aggregate_blocks_to_components(blocks)
        self.assertAlmostEqual(lpd["c1"], 2.0)
        self.assertAlmostEqual(lpd["c2"], 10.0)
        self.assertEqual(prov_map["c1"], "prov_A")
        self.assertEqual(prov_map["c2"], "prov_B")

    def test_reject_ambiguous_provider(self):
        blocks = [
            ComponentBlockData("c1", "prov_A", "b1", delta_lpd=1.0, delta_coverage=0.0, delta_interval_score=0.0),
            ComponentBlockData("c1", "prov_B", "b2", delta_lpd=2.0, delta_coverage=0.0, delta_interval_score=0.0),
        ]
        with self.assertRaises(ValueError):
            aggregate_blocks_to_components(blocks)

    def test_validate_condition_scales(self):
        scales = {"cond_1": 1.5, "cond_2": 2.0}
        val = validate_condition_scales(scales, ["cond_1", "cond_2"])
        self.assertEqual(val["cond_1"], 1.5)

        with self.assertRaises(ValueError):
            validate_condition_scales({"cond_1": 0.0}, ["cond_1"])  # non-positive

        with self.assertRaises(ValueError):
            validate_condition_scales({"cond_1": -1.0}, ["cond_1"])  # negative

        with self.assertRaises(ValueError):
            validate_condition_scales({}, ["cond_missing"])  # missing

    def test_c5_corrected_coverage_bound(self):
        # C5 requires coverage difference CI LOWER >= -0.05
        # Create 10 components with coverage differences around -0.02
        blocks = [
            ComponentBlockData(f"c_{i}", f"prov_{i%3}", f"b_{i}", delta_lpd=0.5, delta_coverage=-0.02, delta_interval_score=-0.1)
            for i in range(10)
        ]
        res = evaluate_validation_decision(blocks, non_statistical_gates={"sampler_passed": True, "lock_frozen": True, "evidence_certified": True, "sbc_passed": True})
        self.assertTrue(res.gate_results["c5_coverage_noninferiority"])

        # Now with severe coverage loss (-0.10)
        blocks_bad_cov = [
            ComponentBlockData(f"c_{i}", f"prov_{i%3}", f"b_{i}", delta_lpd=0.5, delta_coverage=-0.10, delta_interval_score=-0.1)
            for i in range(10)
        ]
        res_bad = evaluate_validation_decision(blocks_bad_cov, non_statistical_gates={"sampler_passed": True, "lock_frozen": True, "evidence_certified": True, "sbc_passed": True})
        self.assertFalse(res_bad.gate_results["c5_coverage_noninferiority"])

    def test_c5_corrected_interval_score_bound(self):
        # C5 requires interval score difference CI UPPER <= 0 (or margin)
        # Good candidate: interval score improved (delta_is < 0)
        blocks_good = [
            ComponentBlockData(f"c_{i}", f"prov_{i%3}", f"b_{i}", delta_lpd=0.5, delta_coverage=0.0, delta_interval_score=-0.5)
            for i in range(10)
        ]
        res_good = evaluate_validation_decision(blocks_good, non_statistical_gates={"sampler_passed": True, "lock_frozen": True, "evidence_certified": True, "sbc_passed": True})
        self.assertTrue(res_good.gate_results["c5_interval_score_noninferiority"])

        # Degraded candidate: interval score worsened (delta_is > 0)
        blocks_bad = [
            ComponentBlockData(f"c_{i}", f"prov_{i%3}", f"b_{i}", delta_lpd=0.5, delta_coverage=0.0, delta_interval_score=1.5)
            for i in range(10)
        ]
        res_bad = evaluate_validation_decision(blocks_bad, non_statistical_gates={"sampler_passed": True, "lock_frozen": True, "evidence_certified": True, "sbc_passed": True})
        self.assertFalse(res_bad.gate_results["c5_interval_score_noninferiority"])

    def test_c6_diversity_floor(self):
        # Fewer than 10 components fails C6
        blocks_few = [
            ComponentBlockData(f"c_{i}", f"prov_{i%3}", f"b_{i}", delta_lpd=0.5, delta_coverage=0.0, delta_interval_score=-0.1)
            for i in range(5)
        ]
        res = evaluate_validation_decision(blocks_few)
        self.assertFalse(res.gate_results["c6_diversity_components"])
        self.assertEqual(res.decision, "EXPLORATORY")

    def test_c7_deletion_sensitivity(self):
        # 10 components where 9 have delta_lpd = -0.01 and 1 outlier has delta_lpd = +5.0
        # The overall mean is positive, but deleting the outlier causes CI lower to be negative!
        blocks = [
            ComponentBlockData(f"c_{i}", f"prov_{i%3}", f"b_{i}", delta_lpd=-0.01, delta_coverage=0.0, delta_interval_score=-0.1)
            for i in range(9)
        ]
        blocks.append(ComponentBlockData("c_outlier", "prov_0", "b_out", delta_lpd=5.0, delta_coverage=0.0, delta_interval_score=-0.1))

        res = evaluate_validation_decision(blocks, non_statistical_gates={"sampler_passed": True, "lock_frozen": True, "evidence_certified": True, "sbc_passed": True})
        self.assertFalse(res.gate_results["c7_component_deletion"])
        self.assertFalse(res.passed)

    def test_promote_requires_all_statistical_and_non_statistical_gates(self):
        blocks_all_good = [
            ComponentBlockData(f"c_{i}", f"prov_{i%3}", f"b_{i}", delta_lpd=0.4, delta_coverage=0.01, delta_interval_score=-0.2)
            for i in range(12)
        ]
        # Without non-statistical gates -> EXPLORATORY (since lock/evidence not passed)
        res_no_nonstat = evaluate_validation_decision(blocks_all_good)
        self.assertFalse(res_no_nonstat.passed)

        # With all non-statistical gates passed -> PROMOTE
        all_non_stat = {
            "sampler_passed": True,
            "lock_frozen": True,
            "evidence_certified": True,
            "sbc_passed": True,
        }
        res_promoted = evaluate_validation_decision(blocks_all_good, non_statistical_gates=all_non_stat)
        self.assertTrue(res_promoted.passed)
        self.assertEqual(res_promoted.decision, "PROMOTE")


if __name__ == "__main__":
    unittest.main()
