"""Restricted class-prior contract, identities, and experimental scorecard."""
from __future__ import annotations

import unittest

import jax
import numpy as np
from numpyro import handlers
from numpyro.infer import MCMC, NUTS
from numpyro.infer.initialization import init_to_median

from aci12.class_prior import (
    CLASS_PRIOR_CONTRACT,
    conditional_classmate_moments,
    fitted_model_ids,
    gaussian_observation_update,
    pooling_kernel,
    production_export_issues,
    resolve_class_prior,
    scale_covariance,
    standard_traits,
    white_traits,
)
from aci12.model import aci_model
from aci12.runner import DECLARED_PARAMETERS, _diagnostics
from aci12.summarize import build_posterior_summary
from tests.test_summary_regressions import fixture as summary_fixture
from tests.test_trait_structure import fixture as trait_fixture, trace


def class_payload(partition, pooling=None, edition="test-partition-v1"):
    return {
        "enabled": True,
        "family": "restricted",
        "edition": edition,
        "pooling": pooling or {"kind": "beta", "alpha": 1, "beta": 1},
        "partition": partition,
    }


def correlated_fixture(n_models=3, dual_effort=False):
    data = trait_fixture(n_models=n_models, dual_effort=dual_effort)
    data["trait_structure"] = "correlated"
    data["priors"]["trait_spread_lognormal_sd"] = 0.5
    return data


UNIT_EFFORT_SITES = ("effort_z", "effort_domain_sd")
GENERAL_SPECIFIC_SITES = ("g", "domain_scale", "domain_z")
ONE_TRAIT_SITES = ("z_scalar",)


def stochastic_sites(samples):
    return {name for name, site in samples.items() if site["type"] == "sample" and not site["is_observed"]}


def record_trace(data, seed=13):
    """Capture a NumPyro trace even when aci_model raises, so guards can be
    checked against sites that must not have been created yet."""
    tracer = handlers.trace(handlers.seed(aci_model, rng_seed=seed))
    try:
        tracer.get_trace(data)
    except Exception as exc:
        return dict(getattr(tracer, "trace", {}) or {}), exc
    return dict(tracer.trace), None


class ClassPriorContract(unittest.TestCase):
    def test_contract_documents_opt_in_restricted_family_and_singleton_fallback(self):
        self.assertEqual(CLASS_PRIOR_CONTRACT["path"], "class_prior")
        self.assertIn("enabled=false", CLASS_PRIOR_CONTRACT["default"])
        self.assertEqual(CLASS_PRIOR_CONTRACT["enabled"]["family"], "restricted")
        kinds = {row["kind"] for row in CLASS_PRIOR_CONTRACT["enabled"]["pooling"]}
        self.assertEqual(kinds, {"beta", "fixed"})

    def test_absent_or_disabled_is_production_baseline(self):
        data = correlated_fixture()
        self.assertFalse(resolve_class_prior(data).enabled)
        data["class_prior"] = {"enabled": False, "family": "restricted"}
        self.assertFalse(resolve_class_prior(data).enabled)
        self.assertEqual(production_export_issues(data), [])

    def test_explicit_partition_assigns_documented_classes_and_singleton_fallback(self):
        data = correlated_fixture(n_models=4, dual_effort=False)
        data["class_prior"] = class_payload([
            {"class_id": "line-a", "model_ids": ["m0", "m2"]},
        ])
        spec = resolve_class_prior(data)
        self.assertEqual(spec.assignments, (("m0", "line-a"), ("m1", "singleton:m1"), ("m2", "line-a"), ("m3", "singleton:m3")))
        self.assertEqual(spec.model_class_index[0], spec.model_class_index[2])
        self.assertNotEqual(spec.model_class_index[0], spec.model_class_index[1])
        self.assertEqual(spec.n_classes, 3)
        self.assertEqual(spec.singleton_model_ids, ("m1", "m3"))

    def test_empty_partition_makes_every_release_a_singleton(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data["class_prior"] = class_payload([])
        spec = resolve_class_prior(data)
        self.assertEqual(spec.class_ids, ("singleton:m0", "singleton:m1"))
        self.assertEqual(spec.n_classes, 2)

    def test_does_not_guess_provider_classes(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data["system_ids"] = ["openai-a@max-common", "openai-b@max-common"]
        data["class_prior"] = class_payload([])
        spec = resolve_class_prior(data)
        self.assertEqual(set(spec.class_ids), {"singleton:openai-a", "singleton:openai-b"})
        data["class_prior"]["guess_providers"] = True
        with self.assertRaisesRegex(ValueError, "must not guess"):
            resolve_class_prior(data)

    def test_rejects_overlap_system_ids_random_walk_and_unmatched_partition(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        overlapping = class_payload([
            {"class_id": "a", "model_ids": ["m0"]},
            {"class_id": "b", "model_ids": ["m0"]},
        ])
        data["class_prior"] = overlapping
        with self.assertRaisesRegex(ValueError, "not a partition"):
            resolve_class_prior(data)
        data["class_prior"] = class_payload([{"class_id": "a", "model_ids": ["m0@max-common"]}])
        with self.assertRaisesRegex(ValueError, "release snapshot ids"):
            resolve_class_prior(data)
        data["class_prior"] = class_payload([{"class_id": "a", "model_ids": ["missing-release"]}])
        with self.assertRaisesRegex(ValueError, "did not match any fitted"):
            resolve_class_prior(data)
        data["class_prior"] = class_payload([{"class_id": "a", "model_ids": ["m0"]}], pooling={"kind": "fixed", "value": 0})
        data["class_prior"]["family"] = "random_walk"
        with self.assertRaisesRegex(ValueError, "restricted"):
            resolve_class_prior(data)

    def test_unused_catalog_member_does_not_add_a_sampled_class(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data["class_prior"] = class_payload([
            {"class_id": "line-a", "model_ids": ["m0", "ghost-release"]},
        ])
        spec = resolve_class_prior(data)
        self.assertEqual(spec.unused_partition_model_ids, ("ghost-release",))
        self.assertEqual(spec.n_classes, 2)
        self.assertNotIn("ghost-release", spec.assignment_map())

    def test_fixed_rho_must_be_strictly_below_one(self):
        data = correlated_fixture(n_models=1, dual_effort=False)
        data["class_prior"] = class_payload([], pooling={"kind": "fixed", "value": 1})
        with self.assertRaisesRegex(ValueError, "0 <= value < 1"):
            resolve_class_prior(data)

    def test_model_ids_array_must_agree_with_n_models(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data["model_ids"] = ["m0"]
        with self.assertRaisesRegex(ValueError, "model_ids length"):
            fitted_model_ids(data)


class ClassPriorMathematics(unittest.TestCase):
    def test_kernel_is_positive_definite_and_kronecker_with_sigma(self):
        index = np.array([0, 0, 1, 2])
        for rho in (0.0, 0.3, 0.8, 1.0 - 1e-8):
            kernel = pooling_kernel(index, rho)
            eig = np.linalg.eigvalsh(kernel)
            self.assertGreater(np.min(eig), 0.0)
        sigma = np.diag([0.25, 1.0, 4.0, 0.81, 1.21])
        kernel = pooling_kernel(index, 0.4)
        full = np.kron(kernel, sigma)
        self.assertGreater(np.min(np.linalg.eigvalsh(full)), 0.0)
        np.testing.assert_allclose(full[:5, :5], sigma)
        np.testing.assert_allclose(full[:5, 5:10], 0.4 * sigma)

    def test_white_traits_preserve_marginal_identity_and_class_covariance(self):
        rng = np.random.default_rng(11)
        n_models, n_classes, draws = 6, 3, 20000
        index = np.array([0, 0, 1, 1, 2, 2])
        rho = 0.7
        class_white = rng.normal(size=(draws, n_classes, 5))
        release_white = rng.normal(size=(draws, n_models, 5))
        white = np.stack([white_traits(rho, class_white[d], release_white[d], index) for d in range(draws)])
        np.testing.assert_allclose(white.var(axis=0).mean(axis=0), np.ones(5), atol=0.05)
        same = np.mean(white[:, 0] * white[:, 1], axis=0)
        different = np.mean(white[:, 0] * white[:, 2], axis=0)
        np.testing.assert_allclose(same, np.full(5, rho), atol=0.04)
        np.testing.assert_allclose(different, np.zeros(5), atol=0.04)

    def test_standard_traits_have_covariance_sigma_for_any_rho(self):
        rng = np.random.default_rng(3)
        omega = np.array([
            [1.0, 0.3, 0.0, 0.0, 0.0],
            [0.3, 1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.1, 0.0],
            [0.0, 0.0, 0.1, 1.0, 0.0],
            [0.0, 0.0, 0.0, 0.0, 1.0],
        ])
        varsigma = np.array([0.5, 1.0, 1.5, 0.8, 1.2])
        sigma = scale_covariance(varsigma, omega)
        cov_factor = np.linalg.cholesky(omega) * varsigma[:, None]
        index = np.array([0, 0, 1])
        for rho in (0.0, 0.55, 0.9):
            white = np.stack([
                white_traits(rho, rng.normal(size=(2, 5)), rng.normal(size=(3, 5)), index)
                for _ in range(12000)
            ])
            z = np.stack([standard_traits(cov_factor, row) for row in white])
            empirical = np.cov(z[:, 0].T)
            np.testing.assert_allclose(empirical, sigma, atol=0.08)
            np.testing.assert_allclose(np.cov(z[:, 0].T, z[:, 1].T)[:5, 5:], rho * sigma, atol=0.08)

    def test_rho_zero_white_traits_equal_release_coordinates(self):
        release = np.arange(10, dtype=float).reshape(2, 5)
        class_white = np.ones((1, 5))
        np.testing.assert_array_equal(white_traits(0.0, class_white, release, np.array([0, 0])), release)

    def test_conditional_classmate_and_worked_observation_update(self):
        mean, cov = conditional_classmate_moments(0.8, np.array([2.0]), np.array([[1.0]]))
        self.assertAlmostEqual(float(mean[0]), 1.6)
        self.assertAlmostEqual(float(cov[0, 0]), 0.36)
        updated_mean, updated_var = gaussian_observation_update(1.6, 0.36, 2.5, 0.25)
        self.assertAlmostEqual(updated_mean, (0.25 * 1.6 + 0.36 * 2.5) / (0.25 + 0.36))
        self.assertAlmostEqual(updated_var, 0.36 * 0.25 / (0.25 + 0.36))
        none_mean, none_var = gaussian_observation_update(1.6, 0.36, 0.0, 1e12)
        self.assertAlmostEqual(none_mean, 1.6, places=5)
        precise_mean, _ = gaussian_observation_update(1.6, 0.36, -0.5, 0.001)
        self.assertAlmostEqual(precise_mean, -0.494, places=3)

    def test_no_automatic_successor_bonus_before_observations(self):
        rng = np.random.default_rng(21)
        rho = 0.8
        index = np.array([0, 0])
        class_white = rng.normal(size=(8000, 1, 5))
        release_white = rng.normal(size=(8000, 2, 5))
        z = np.stack([white_traits(rho, class_white[d], release_white[d], index) for d in range(8000)])
        self.assertAlmostEqual(float(np.mean(z[:, 0, 0] > z[:, 1, 0])), 0.5, delta=0.03)
        np.testing.assert_allclose(np.cov((z[:, 0] - z[:, 1]).T), 2 * (1 - rho) * np.eye(5), atol=0.08)


class ClassPriorModel(unittest.TestCase):
    def test_disabled_model_has_no_class_sites(self):
        samples = trace(correlated_fixture(n_models=2, dual_effort=False))
        self.assertNotIn("class_rho", samples)
        self.assertNotIn("class_z", samples)
        self.assertNotIn("release_z", samples)
        self.assertEqual(samples["z_std"]["type"], "sample")

    def test_fixed_rho_zero_matches_independent_baseline_and_omits_class_coordinates(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        baseline = trace(data, seed=4)
        data["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
            pooling={"kind": "fixed", "value": 0},
        )
        candidate = trace(data, seed=4)
        self.assertEqual(stochastic_sites(baseline), stochastic_sites(candidate))
        self.assertNotIn("class_z", candidate)
        self.assertEqual(candidate["class_rho"]["type"], "deterministic")
        self.assertEqual(float(candidate["class_rho"]["value"]), 0.0)
        np.testing.assert_allclose(candidate["Z"]["value"], baseline["Z"]["value"])
        np.testing.assert_allclose(candidate["Omega"]["value"], baseline["Omega"]["value"])

    def test_conditioned_rho_zero_with_class_components_recovers_release_map(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
            pooling={"kind": "beta", "alpha": 1, "beta": 1},
        )
        release = np.array([[1.0, -1.0, 0.5, 0.0, 2.0], [0.0, 1.0, -0.5, 1.5, -1.0]])
        class_white = np.array([[10.0, 10.0, 10.0, 10.0, 10.0]])
        l_omega = np.eye(5)
        samples = trace(data, {"class_rho": 0.0, "class_z": class_white, "release_z": release, "L_Omega": l_omega,
                               "varsigma": np.ones(5)})
        np.testing.assert_allclose(samples["z_std"]["value"], release)
        np.testing.assert_allclose(samples["Z"]["value"], release)

    def test_canonical_noncentered_map_and_unchanged_likelihood(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
            pooling={"kind": "fixed", "value": 0.64},
        )
        data["cell_system_index"] = [0, 1]
        data["cell_benchmark_index"] = [0, 0]
        data["observations"] = [
            {"cell_index": 0, "benchmark_index": 0, "protocol_index": 0, "provenance_index": 0,
             "domain_index": 0, "likelihood": "normal", "y": 0.2, "variance": 0.05},
            {"cell_index": 1, "benchmark_index": 0, "protocol_index": 0, "provenance_index": 0,
             "domain_index": 0, "likelihood": "normal", "y": -0.1, "variance": 0.05},
        ]
        class_white = np.array([[0.5, -0.25, 0.0, 1.0, -1.0]])
        release = np.array([[0.2, 0.1, -0.3, 0.4, 0.0], [-0.4, 0.2, 0.5, -0.1, 0.3]])
        varsigma = np.array([0.8, 1.1, 0.9, 1.3, 0.7])
        l_omega = np.linalg.cholesky(np.eye(5) * 0.7 + 0.3)
        controlled = {
            "class_z": class_white, "release_z": release, "L_Omega": l_omega, "varsigma": varsigma,
            "beta": np.zeros(2), "log_alpha": np.zeros(2), "family_z": np.zeros((2, 2)),
            "cell_z": np.zeros(2), "proto_z": np.zeros((1, 5)), "xi_z": [0.0],
            "omega_bar": [0.1, 0.1], "zeta": np.zeros((2, 5)),
        }
        samples = trace(data, controlled)
        cov_factor = l_omega * varsigma[:, None]
        expected_white = white_traits(0.64, class_white, release, np.array([0, 0]))
        expected_z = standard_traits(cov_factor, expected_white)
        np.testing.assert_allclose(samples["z_std"]["value"], expected_white, atol=1e-6)
        np.testing.assert_allclose(samples["Z"]["value"], expected_z, atol=1e-5)
        baseline = correlated_fixture(n_models=2, dual_effort=False)
        baseline["cell_system_index"] = data["cell_system_index"]
        baseline["cell_benchmark_index"] = data["cell_benchmark_index"]
        baseline["observations"] = data["observations"]
        matched = trace(baseline, {**controlled, "z_std": expected_white, "L_Omega": l_omega, "varsigma": varsigma})
        self.assertAlmostEqual(
            float(samples["obs_normal"]["fn"].log_prob(samples["obs_normal"]["value"])),
            float(matched["obs_normal"]["fn"].log_prob(matched["obs_normal"]["value"])),
        )
        np.testing.assert_allclose(samples["eta_cell"]["value"], matched["eta_cell"]["value"], atol=1e-5)

    def test_effort_and_fixed_effort_mask_are_unchanged(self):
        data = correlated_fixture(n_models=2, dual_effort=True)
        data["system_is_fixed_effort"] = [False, False, True, True]
        data["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
            pooling={"kind": "fixed", "value": 0},
        )
        samples = trace(data, {
            "z_std": np.zeros((2, 5)), "varsigma": np.ones(5), "L_Omega": np.eye(5),
            "effort_mean": 0.3, "effort_sd": np.full(5, 0.2), "delta_z": np.ones((2, 5)),
        })
        z = np.asarray(samples["Z"]["value"])
        np.testing.assert_allclose(z[1] - z[0], np.full(5, 0.5), atol=1e-6)
        np.testing.assert_array_equal(z[3], z[2])

    def test_enabled_correlated_keeps_production_effort_sites_and_rho_zero_identity(self):
        baseline = correlated_fixture(n_models=2, dual_effort=False)
        enabled = correlated_fixture(n_models=2, dual_effort=False)
        enabled["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
            pooling={"kind": "fixed", "value": 0},
        )
        baseline_trace = trace(baseline, seed=4)
        enabled_trace = trace(enabled, seed=4)
        self.assertEqual(stochastic_sites(baseline_trace), stochastic_sites(enabled_trace))
        self.assertNotIn("effort_z", enabled_trace)
        self.assertNotIn("effort_domain_sd", enabled_trace)
        self.assertEqual(enabled_trace["varsigma"]["type"], "sample")
        self.assertEqual(tuple(np.asarray(enabled_trace["effort_sd"]["value"]).shape), (5,))
        self.assertEqual(float(enabled_trace["class_rho"]["value"]), 0.0)
        np.testing.assert_allclose(enabled_trace["Z"]["value"], baseline_trace["Z"]["value"])

    def test_absent_trait_structure_defaults_to_correlated_with_class_prior(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data.pop("trait_structure", None)
        data["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
            pooling={"kind": "fixed", "value": 0},
        )
        samples = trace(data, seed=4)
        self.assertIn("L_Omega", samples)
        self.assertNotIn("effort_z", samples)
        self.assertEqual(float(samples["class_rho"]["value"]), 0.0)

    def test_correlated_unit_class_prior_fails_before_unit_effort_sites(self):
        unit = trait_fixture(n_models=2, dual_effort=False)
        unit["trait_structure"] = "correlated_unit"
        permitted = record_trace(unit)
        self.assertIsNone(permitted[1])
        for name in UNIT_EFFORT_SITES:
            self.assertEqual(permitted[0][name]["type"], "sample")
        self.assertEqual(permitted[0]["varsigma"]["type"], "deterministic")

        blocked = trait_fixture(n_models=2, dual_effort=False)
        blocked["trait_structure"] = "correlated_unit"
        blocked["class_prior"] = class_payload([{"class_id": "line-a", "model_ids": ["m0", "m1"]}])
        sites, error = record_trace(blocked)
        self.assertIsInstance(error, ValueError)
        self.assertRegex(str(error), "correlated LKJ")
        for name in UNIT_EFFORT_SITES + ("varsigma", "delta_z", "effort_sd", "L_Omega", "class_z", "class_rho"):
            self.assertNotIn(name, sites)

    def test_class_prior_rejects_one_trait_general_specific_and_unknown_before_alt_sites(self):
        payload = class_payload([{"class_id": "line-a", "model_ids": ["m0", "m1"]}])

        one_trait = correlated_fixture(n_models=2, dual_effort=False)
        one_trait["one_trait_baseline"] = True
        control_sites, control_error = record_trace(one_trait)
        self.assertIsNone(control_error)
        for name in ONE_TRAIT_SITES:
            self.assertEqual(control_sites[name]["type"], "sample")
        one_trait["class_prior"] = payload
        sites, error = record_trace(one_trait)
        self.assertIsInstance(error, ValueError)
        self.assertRegex(str(error), "correlated LKJ")
        for name in ONE_TRAIT_SITES + UNIT_EFFORT_SITES + ("L_Omega", "class_z"):
            self.assertNotIn(name, sites)

        general = trait_fixture(n_models=2, dual_effort=False)
        general_sites, general_error = record_trace(general)
        self.assertIsNone(general_error)
        for name in GENERAL_SPECIFIC_SITES:
            self.assertEqual(general_sites[name]["type"], "sample")
        general["class_prior"] = payload
        sites, error = record_trace(general)
        self.assertIsInstance(error, ValueError)
        self.assertRegex(str(error), "correlated LKJ")
        for name in GENERAL_SPECIFIC_SITES + UNIT_EFFORT_SITES + ("class_z",):
            self.assertNotIn(name, sites)

        unknown = correlated_fixture(n_models=2, dual_effort=False)
        unknown["trait_structure"] = "unknown"
        unknown["class_prior"] = payload
        sites, error = record_trace(unknown)
        self.assertIsInstance(error, ValueError)
        self.assertRegex(str(error), "correlated LKJ")
        self.assertEqual(sites, {})

    def test_beta_prior_is_uniform_on_the_unit_interval(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        data["class_prior"] = class_payload([{"class_id": "line-a", "model_ids": ["m0", "m1"]}])
        fn = trace(data)["class_rho"]["fn"]
        base = getattr(fn, "base_dist", fn)
        self.assertAlmostEqual(float(np.asarray(base.concentration1)), 1.0)
        self.assertAlmostEqual(float(np.asarray(base.concentration0)), 1.0)

    def test_production_export_issues_block_enabled_candidates(self):
        data = correlated_fixture(n_models=2, dual_effort=False)
        self.assertEqual(production_export_issues(data), [])
        data["class_prior"] = class_payload([{"class_id": "line-a", "model_ids": ["m0"]}])
        self.assertIn("experimental and nonpublishable", production_export_issues(data)[0])
        self.assertIn("class_rho", DECLARED_PARAMETERS)


class ClassPriorSummary(unittest.TestCase):
    def test_experimental_scorecard_omits_legacy_badges_and_reports_practical_ordering(self):
        data, samples = summary_fixture()
        data["n_models"] = 12
        data["system_model_index"] = list(range(12))
        data["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
            pooling={"kind": "fixed", "value": 0},
        )
        samples = dict(samples)
        samples["Omega"] = np.repeat(np.eye(5)[None, :, :], 3, axis=0)
        samples["varsigma"] = np.ones((3, 5))
        samples["class_rho"] = np.zeros(3)
        summary = build_posterior_summary(data, samples)
        self.assertTrue(summary["experimental"])
        self.assertFalse(summary["publishable"])
        evidence = summary["systems"]["m0@max-common"]["evidence"]
        for badge in ("own_data_reduction", "max_family_share", "concentration_c_sf", "max_benchmark_share"):
            self.assertNotIn(badge, evidence)
        self.assertEqual(evidence["fitted_cells"], 1)
        self.assertFalse(summary["systems"]["m0@max-common"]["domains"]["agentic"]["published"])
        self.assertNotIn("r_s", summary["systems"]["m0@max-common"]["domains"]["agentic"])
        self.assertIn("raw_traits", summary["systems"]["m0@max-common"])
        view = summary["views"]["mixed"]
        self.assertIsNotNone(view["m0@max-common"]["score"])
        self.assertIsNone(view["m0@max-common"]["rank"])
        self.assertIn("m1@max-common", view["m0@max-common"]["practical_gt_margin"])
        self.assertIn(view["m0@max-common"]["practical_support"]["m1@max-common"], {"this", "other", "unresolved"})
        self.assertGreaterEqual(view["m0@max-common"]["practical_gt_margin"]["m1@max-common"], 0.0)
        self.assertLessEqual(view["m0@max-common"]["practical_gt_margin"]["m1@max-common"], 1.0)
        self.assertEqual(len(summary["cells"]), 1)
        self.assertEqual(summary["class_prior"]["pooling"]["value"], 0)
        self.assertEqual(summary["class_prior"]["assignments"]["m0"], "line-a")
        self.assertEqual(len(summary["class_prior"]["Sigma_median"]), 5)

    def test_practical_margin_support_uses_paired_draws(self):
        data, samples = summary_fixture()
        data["n_models"] = 12
        data["system_model_index"] = list(range(12))
        data["class_prior"] = class_payload([], pooling={"kind": "fixed", "value": 0})
        z = np.asarray(samples["Z"], dtype=float)
        z[:, 0, :] += 20
        z[:, 1, :] -= 20
        samples = dict(samples)
        samples["Z"] = z
        samples["Omega"] = np.repeat(np.eye(5)[None, :, :], 3, axis=0)
        samples["varsigma"] = np.ones((3, 5))
        summary = build_posterior_summary(data, samples)
        support = summary["views"]["mixed"]["m0@max-common"]["practical_support"]["m1@max-common"]
        self.assertEqual(support, "this")
        self.assertGreaterEqual(summary["views"]["mixed"]["m0@max-common"]["practical_gt_margin"]["m1@max-common"], 0.90)

    def test_production_summary_is_unchanged_without_class_prior(self):
        data, samples = summary_fixture()
        summary = build_posterior_summary(data, samples)
        self.assertNotIn("experimental", summary)
        self.assertNotIn("class_prior", summary)
        self.assertIn("own_data_reduction", summary["systems"]["m0@max-common"]["evidence"])
        self.assertIn("r_s", summary["systems"]["m0@max-common"]["domains"]["agentic"])
        self.assertNotIn("practical_gt_margin", summary["views"]["chat"]["m0@max-common"])


class ClassPriorSamplerSmoke(unittest.TestCase):
    def test_restricted_candidate_nuts_samples_rho_and_finite_traits(self):
        data = correlated_fixture(n_models=3, dual_effort=False)
        data["class_prior"] = class_payload(
            [{"class_id": "line-a", "model_ids": ["m0", "m1"]}],
        )
        data["n_protocols"] = 1
        data["cell_system_index"] = [0, 1, 2]
        data["cell_benchmark_index"] = [0, 0, 1]
        data["observations"] = [
            {"cell_index": i, "benchmark_index": 0 if i < 2 else 1, "protocol_index": 0,
             "provenance_index": 0, "domain_index": 0 if i < 2 else 4, "likelihood": "normal",
             "y": 0.1 * i, "variance": 0.2}
            for i in range(3)
        ]
        kernel = NUTS(aci_model, init_strategy=init_to_median())
        mcmc = MCMC(kernel, num_warmup=8, num_samples=8, num_chains=1, progress_bar=False)
        mcmc.run(jax.random.PRNGKey(7), data=data)
        samples = mcmc.get_samples()
        rho = np.asarray(samples["class_rho"])
        self.assertEqual(rho.shape[0], 8)
        self.assertTrue(np.all(np.isfinite(rho)))
        self.assertTrue(np.all((rho > 0) & (rho < 1)))
        self.assertTrue(np.all(np.isfinite(np.asarray(samples["Z"]))))
        self.assertEqual(tuple(np.asarray(samples["class_z"]).shape[1:]), (2, 5))
        self.assertEqual(tuple(np.asarray(samples["release_z"]).shape[1:]), (3, 5))
        extra = {"diverging": np.zeros((1, 8), dtype=bool), "energy": np.linspace(1.0, 2.0, 8)[None, :]}
        diagnostics = _diagnostics({name: np.asarray(value)[None, ...] for name, value in samples.items()}, extra, 1)
        self.assertIn("class_rho", diagnostics["parameters"])


if __name__ == "__main__":
    unittest.main()
