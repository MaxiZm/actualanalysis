import unittest
import numpy as np

from aci12.geometry import (
    analyze_information,
    borrowed_precision_decomposition,
    compute_information_matrix,
    expected_variance_reduction,
    paired_draw_comparison,
    partial_identification_bounds,
    target_support_diagnostic,
    evaluate_cone_membership,
    validate_covariance_matrix,
)


class TestEvidenceGeometry(unittest.TestCase):
    """Native unittest test suite for ACI 1.5.0 evidence geometry and identification diagnostics."""

    def test_validate_covariance_matrix(self):
        valid = np.array([[2.0, 0.5], [0.5, 1.5]])
        res = validate_covariance_matrix(valid, name="valid_cov")
        np.testing.assert_allclose(res, valid)

        # Non-square
        with self.assertRaises(ValueError) as ctx:
            validate_covariance_matrix(np.ones((2, 3)))
        self.assertIn("square", str(ctx.exception).lower())

        # Non-symmetric
        asym = np.array([[2.0, 0.5], [0.1, 1.5]])
        with self.assertRaises(ValueError) as ctx:
            validate_covariance_matrix(asym)
        self.assertIn("symmetric", str(ctx.exception).lower())

        # Not positive definite
        singular = np.array([[1.0, 2.0], [2.0, 1.0]])  # det = -3
        with self.assertRaises(ValueError) as ctx:
            validate_covariance_matrix(singular)
        self.assertIn("positive definite", str(ctx.exception).lower())

        # NaN / Inf
        with self.assertRaises(ValueError) as ctx:
            validate_covariance_matrix(np.array([[np.nan, 0.0], [0.0, 1.0]]))
        self.assertIn("non-finite", str(ctx.exception).lower())

    def test_compute_information_matrix(self):
        # 3 benchmarks, 2 domains
        A = np.array([[1.0, 0.0], [0.0, 2.0], [1.0, 1.0]])
        variances = np.array([0.5, 0.2, 1.0])

        J_diag = compute_information_matrix(A, variances)
        expected = (
            (1.0 / 0.5) * np.outer(A[0], A[0])
            + (1.0 / 0.2) * np.outer(A[1], A[1])
            + (1.0 / 1.0) * np.outer(A[2], A[2])
        )
        np.testing.assert_allclose(J_diag, expected)

        # 2D residual covariance
        R = np.diag(variances)
        J_full = compute_information_matrix(A, R)
        np.testing.assert_allclose(J_full, expected)

        # Non-positive variance
        with self.assertRaises(ValueError) as ctx:
            compute_information_matrix(A, np.array([0.5, -0.2, 1.0]))
        self.assertIn("strictly positive", str(ctx.exception).lower())

        # Schur complement adjustment
        N = np.array([[0.1, 0.0], [0.0, 0.1]])
        J_adj = compute_information_matrix(A, variances, nuisance_schur_complement=N)
        np.testing.assert_allclose(J_adj, expected - N)

    def test_nuisance_adjustment_psd_validation_and_repro(self):
        # Repro: A = I, R = I, N = 2I => J = I - 2I = -I (materially indefinite, must raise)
        A = np.eye(2)
        R = np.eye(2)
        N_excessive = 2.0 * np.eye(2)
        with self.assertRaises(ValueError) as ctx:
            compute_information_matrix(A, R, nuisance_schur_complement=N_excessive)
        self.assertIn("materially indefinite", str(ctx.exception).lower())

        # Non-symmetric N must raise
        N_nonsym = np.array([[1.0, 2.0], [0.0, 1.0]])
        with self.assertRaises(ValueError) as ctx:
            compute_information_matrix(A, R, nuisance_schur_complement=N_nonsym)
        self.assertIn("not symmetric", str(ctx.exception).lower())

        # Non-finite N (NaN / Inf) must raise
        N_nan = np.array([[np.nan, 0.0], [0.0, 1.0]])
        with self.assertRaises(ValueError) as ctx:
            compute_information_matrix(A, R, nuisance_schur_complement=N_nan)
        self.assertIn("non-finite", str(ctx.exception).lower())

        # Non-PSD N (negative eigenvalues) must raise
        N_non_psd = np.array([[1.0, 2.0], [2.0, 1.0]])  # det = -3
        with self.assertRaises(ValueError) as ctx:
            compute_information_matrix(A, R, nuisance_schur_complement=N_non_psd)
        self.assertIn("positive semidefinite", str(ctx.exception).lower())

        # Tiny numerical roundoff (order 1e-13) is tolerated
        N_roundoff = (1.0 - 1e-12) * np.eye(2)
        J_roundoff = compute_information_matrix(A, R, nuisance_schur_complement=N_roundoff)
        self.assertTrue(np.all(np.linalg.eigvalsh(J_roundoff) >= 0.0))

    def test_analyze_information_and_target_support(self):
        # Rank deficient: 5 domains, only measuring domain 0 and domain 1
        A = np.array([[1.0, 0.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0, 0.0]])
        var = np.array([1.0, 1.0])
        J = compute_information_matrix(A, var)

        analysis = analyze_information(J)
        self.assertEqual(analysis.effective_rank, 2)
        self.assertEqual(analysis.dimension, 5)
        self.assertEqual(len(analysis.range_space_basis), 2)
        self.assertEqual(len(analysis.null_space_basis), 3)

        # Target 1: entirely in domain 0 (measured)
        diag_supported = target_support_diagnostic(analysis, [1.0, 0.0, 0.0, 0.0, 0.0])
        self.assertTrue(diag_supported.is_fully_supported)
        self.assertAlmostEqual(diag_supported.support_fraction, 1.0)
        self.assertAlmostEqual(diag_supported.unidentified_fraction, 0.0)

        # Target 2: entirely in domain 3 (unmeasured)
        diag_unsupported = target_support_diagnostic(analysis, [0.0, 0.0, 0.0, 1.0, 0.0])
        self.assertFalse(diag_unsupported.is_fully_supported)
        self.assertAlmostEqual(diag_unsupported.support_fraction, 0.0)
        self.assertAlmostEqual(diag_unsupported.unidentified_fraction, 1.0)
        self.assertGreater(diag_unsupported.null_component_norm, 0.99)

        # Target 3: mixture of domain 0 and domain 4 (half identified)
        diag_mixed = target_support_diagnostic(analysis, [1.0, 0.0, 0.0, 0.0, 1.0])
        self.assertFalse(diag_mixed.is_fully_supported)
        self.assertAlmostEqual(diag_mixed.support_fraction, 0.5)
        self.assertAlmostEqual(diag_mixed.unidentified_fraction, 0.5)

    def test_borrowed_precision_decomposition(self):
        # 2 domains, prior C0 = diag(2, 2)
        C0 = np.array([[2.0, 0.0], [0.0, 2.0]])
        # Direct measurement only on domain 0
        A = np.array([[1.0, 0.0]])
        J = compute_information_matrix(A, [0.5])  # J = diag(2, 0)

        decomp = borrowed_precision_decomposition(J, C0, target_w=[1.0, 0.0])
        self.assertEqual(decomp.prior_target_variance, 2.0)
        # C_post: inv(C0) = diag(0.5, 0.5), inv(Cpost) = diag(2.5, 0.5) => C_post = diag(0.4, 2.0)
        self.assertAlmostEqual(decomp.posterior_target_variance, 0.4)
        self.assertAlmostEqual(decomp.variance_reduction, 1.6)
        self.assertAlmostEqual(decomp.direct_information_share, 1.6 / 2.0)

    def test_cone_membership_and_section_9_2_counterexample(self):
        """Exact test of Proposition §9.1 and the §9.2 counterexample."""
        A = np.array(
            [
                [0.25, 0.70, 0.05, 0.00, 0.00],
                [0.55, 0.30, 0.10, 0.05, 0.00],
                [0.00, 0.00, 1.00, 0.00, 0.00],
                [0.35, 0.00, 0.25, 0.20, 0.20],
                [0.05, 0.05, 0.10, 0.15, 0.65],
            ]
        )
        d = np.array([1.6, 1.0, 1.0, -5.0, 1.0])

        # Check exact rational projection values from proposal §9.2
        projections = A @ d
        np.testing.assert_allclose(projections, [1.15, 1.03, 1.00, 0.01, 0.13])
        self.assertTrue(np.all(projections > 0.0))

        # Equal coordinate target w
        w_equal = np.array([0.2, 0.2, 0.2, 0.2, 0.2])
        target_mean_diff = float(np.dot(w_equal, d))
        self.assertAlmostEqual(target_mean_diff, -0.08)
        self.assertLess(target_mean_diff, 0.0)

        # Test cone membership: w_equal MUST NOT be in cone(A)
        cone_res = evaluate_cone_membership(A, w_equal)
        self.assertFalse(cone_res.in_cone)
        self.assertGreater(cone_res.residual_norm, 0.01)
        self.assertIsNotNone(cone_res.separating_vector)

        # Check Farkas conditions: A d_sep >= 0, w^T d_sep < 0
        d_sep = np.array(cone_res.separating_vector)
        self.assertTrue(np.all(A @ d_sep >= -1e-6))
        self.assertLess(float(np.dot(w_equal, d_sep)), -1e-6)
        self.assertGreaterEqual(len(cone_res.caveats), 4)

        # Positive test: target inside cone
        w_inside = 1.5 * A[0] + 0.8 * A[2] + 0.5 * A[3]
        res_inside = evaluate_cone_membership(A, w_inside)
        self.assertTrue(res_inside.in_cone)
        self.assertLess(res_inside.residual_norm, 1e-6)
        np.testing.assert_allclose(A.T @ res_inside.cone_weights, w_inside, atol=1e-5)

    def test_paired_draw_comparison(self):
        rng = np.random.default_rng(123)

        # Case 1: A clearly beats B by > 1 point
        draws_a = rng.normal(55.0, 0.5, size=1000)
        draws_b = rng.normal(50.0, 0.5, size=1000)
        res_a = paired_draw_comparison(draws_a, draws_b, margin=1.0, threshold=0.90)
        self.assertEqual(res_a.status, "A_leads")
        self.assertGreater(res_a.probability_a_beats_b_plus_margin, 0.99)
        self.assertGreater(res_a.directional_probability_a_beats_b, 0.99)

        # Case 2: B clearly beats A
        res_b = paired_draw_comparison(draws_b, draws_a, margin=1.0, threshold=0.90)
        self.assertEqual(res_b.status, "B_leads")
        self.assertGreater(res_b.probability_b_beats_a_plus_margin, 0.99)

        # Case 3: Overlapping distributions (diff around 0.5, margin=1.0)
        draws_close_a = rng.normal(50.5, 1.0, size=1000)
        draws_close_b = rng.normal(50.0, 1.0, size=1000)
        res_unresolved = paired_draw_comparison(draws_close_a, draws_close_b, margin=1.0, threshold=0.90)
        self.assertEqual(res_unresolved.status, "unresolved")
        self.assertIn("does NOT imply practical or statistical equivalence", res_unresolved.note)

    def test_partial_identification_bounds(self):
        # Attempting to run without verified task mass raises error
        with self.assertRaises(ValueError) as ctx:
            partial_identification_bounds(d_observed=0.25, task_mass_q=0.6, is_task_mass_verified=False)
        self.assertIn("verified target task mass q", str(ctx.exception).lower())

        # With verified task mass: d_O = 0.1, q = 0.8 => width = 2*(1-0.8) = 0.4
        # Bounds: [0.1 - 0.2, 0.1 + 0.2] = [-0.1, 0.3]
        res = partial_identification_bounds(
            d_observed=0.1,
            task_mass_q=0.8,
            is_task_mass_verified=True,
            sampling_se=0.02,
        )
        self.assertAlmostEqual(res.lower_bound, -0.1)
        self.assertAlmostEqual(res.upper_bound, 0.3)
        self.assertAlmostEqual(res.bound_width, 0.4)
        self.assertIsNotNone(res.confidence_lower)
        self.assertLess(res.confidence_lower, -0.1)
        self.assertIsNotNone(res.confidence_upper)
        self.assertGreater(res.confidence_upper, 0.3)

        # Allow unverified only with explicit flag
        res_unverified = partial_identification_bounds(
            d_observed=0.1,
            task_mass_q=0.5,
            is_task_mass_verified=False,
            allow_unverified_task_mass=True,
        )
        self.assertFalse(res_unverified.is_task_mass_verified)
        self.assertTrue(any("WARNING: Task mass q has NOT been certified" in n for n in res_unverified.audit_notes))

    def test_expected_variance_reduction(self):
        # 2 domains, C = diag(1, 1), target h = [1, 0]
        C = np.eye(2)
        h = np.array([1.0, 0.0])

        candidates = [
            # Candidate 1: directly measures domain 0 with low noise
            {"id": "test-direct-low-noise", "loading": [1.0, 0.0], "variance": 0.25, "cost": 10.0},
            # Candidate 2: measures domain 0 with high noise
            {"id": "test-direct-high-noise", "loading": [1.0, 0.0], "variance": 1.0, "cost": 5.0},
            # Candidate 3: measures orthogonal domain 1 (zero variance reduction for h=[1, 0])
            {"id": "test-orthogonal", "loading": [0.0, 1.0], "variance": 0.1, "cost": 1.0},
        ]

        ranked = expected_variance_reduction(C, h, candidates)
        self.assertEqual(len(ranked), 3)

        # 1. Direct low noise: Delta V = (1*1*1)^2 / (0.25 + 1) = 1 / 1.25 = 0.8
        self.assertEqual(ranked[0].candidate_id, "test-direct-low-noise")
        self.assertAlmostEqual(ranked[0].variance_reduction, 0.8)
        self.assertAlmostEqual(ranked[0].posterior_variance, 0.2)
        self.assertAlmostEqual(ranked[0].fractional_reduction, 0.8)

        # 2. Direct high noise: Delta V = 1 / (1 + 1) = 0.5
        self.assertEqual(ranked[1].candidate_id, "test-direct-high-noise")
        self.assertAlmostEqual(ranked[1].variance_reduction, 0.5)
        self.assertAlmostEqual(ranked[1].posterior_variance, 0.5)

        # 3. Orthogonal: Delta V = 0
        self.assertEqual(ranked[2].candidate_id, "test-orthogonal")
        self.assertAlmostEqual(ranked[2].variance_reduction, 0.0)


if __name__ == "__main__":
    unittest.main()
