"""Structural checks using prior and conditioned likelihood traces, not NUTS."""
import copy
import unittest
import numpy as np
import jax.numpy as jnp
from numpyro import handlers
from aci12.model import aci_model


DOMAINS = ['agentic', 'software-code', 'reasoning', 'knowledge-information', 'communication-professional']


def fixture(n_models=2, dual_effort=True):
    profiles = [0, 1] if dual_effort else [0]
    model_index = [m for m in range(n_models) for _ in profiles]
    n_systems = len(model_index)
    return {
        'trait_structure': 'general_specific', 'n_models': n_models, 'n_systems': n_systems,
        'n_benchmarks': 2, 'n_families': 2, 'n_protocols': 1,
        'domains': DOMAINS, 'system_ids': [f'm{m}@{p}' for m in range(n_models) for p in profiles],
        'system_model_index': model_index, 'system_profile_index': profiles * n_models,
        'system_is_fixed_effort': [False] * n_systems,
        'benchmark_ids': ['cross-loaded', 'communication'],
        'benchmark_family_index': [0, 1],
        'benchmark_domains': [[.75, 0, .25, 0, 0], [0, 0, 0, 0, 1]],
        'benchmark_estimate_rho': [False, False], 'benchmark_default_rho': [0, 0],
        'protocol_is_self_report': [False], 'observations': [],
        'cell_system_index': [], 'cell_benchmark_index': [], 'priors': {},
    }


def trace(data, conditioned=None, seed=13):
    values = {key: jnp.asarray(value) for key, value in (conditioned or {}).items()}
    return handlers.trace(handlers.seed(handlers.condition(aci_model, data=values), rng_seed=seed)).get_trace(data)


class TraitStructure(unittest.TestCase):
    def test_unit_correlated_traits_allow_negative_domain_associations(self):
        data = fixture(n_models=6000, dual_effort=False)
        data['trait_structure'] = 'correlated_unit'
        correlation = np.eye(5)
        correlation[1, 4] = correlation[4, 1] = -.5
        samples = trace(data, {'L_Omega': np.linalg.cholesky(correlation)})
        z = np.asarray(samples['Z']['value'])
        np.testing.assert_allclose(z.var(axis=0), np.ones(5), atol=.07)
        np.testing.assert_allclose(np.corrcoef(z.T), correlation, atol=.06)
        self.assertEqual(samples['varsigma']['type'], 'deterministic')

    def test_unit_correlated_effort_does_not_depend_on_domain_spread_priors(self):
        data = fixture()
        data['trait_structure'] = 'correlated_unit'
        data['priors'].update(trait_spread_lognormal_sd=4, trait_spread_lognormal_median_log=-8)
        samples = trace(data, {'effort_mean': .3, 'effort_sd': .2, 'effort_z': [1., -1.],
                               'effort_domain_sd': np.full(5, .15), 'delta_z': np.zeros((2, 5))})
        z = np.asarray(samples['Z']['value'])
        np.testing.assert_allclose(z[1] - z[0], np.full(5, .5), atol=1e-6)
        np.testing.assert_allclose(z[3] - z[2], np.full(5, .1), atol=1e-6)

    def test_obsolete_raw_spread_priors_cannot_reweight_declared_loadings(self):
        first = fixture()
        first['cell_system_index'] = [0, 1]
        first['cell_benchmark_index'] = [0, 0]
        second = copy.deepcopy(first)
        first['priors'].update(trait_spread_sd=.001, trait_spread_lognormal_sd=.01,
                               trait_spread_lognormal_median_log=-8)
        second['priors'].update(trait_spread_sd=1000, trait_spread_lognormal_sd=4,
                                trait_spread_lognormal_median_log=8)
        a, b = trace(first), trace(second)
        self.assertEqual(a['varsigma']['type'], 'deterministic')
        np.testing.assert_array_equal(a['varsigma']['value'], np.ones(5))
        for name in ('Z', 'eta_cell', 'discrimination'):
            np.testing.assert_array_equal(a[name]['value'], b[name]['value'])

    def test_common_effort_increment_has_equal_units_and_fixed_effort_has_no_bonus(self):
        data = fixture()
        data['system_is_fixed_effort'] = [False, False, True, True]
        samples = trace(data, {
            'g': [1., 1.], 'domain_scale': [.2, .5, 1., 2., .1], 'domain_z': np.zeros((2, 5)),
            'effort_mean': .3, 'effort_sd': .2, 'effort_z': [1., 1.],
            'effort_domain_sd': np.full(5, .15), 'delta_z': np.zeros((2, 5)),
        })
        z = np.asarray(samples['Z']['value'])
        np.testing.assert_allclose(z[1] - z[0], np.full(5, .5), atol=1e-6)
        np.testing.assert_array_equal(z[3], z[2])

    def test_unequal_specialization_scales_keep_unit_marginal_variance(self):
        data = fixture(n_models=6000, dual_effort=False)
        scales = np.array([.25, .5, 1., 2., .8])
        samples = trace(data, {'domain_scale': scales})
        z = np.asarray(samples['Z']['value'])
        np.testing.assert_allclose(z.var(axis=0), np.ones(5), atol=.07)
        np.testing.assert_allclose(np.corrcoef(z.T), samples['Omega']['value'], atol=.06)
        # A large deviation scale permits substantial specialization; it must
        # not create an artificially more variable coordinate for loadings.
        self.assertLess(float(samples['Omega']['value'][0, 3]), .5)

    def test_sparse_domain_prior_borrows_common_signal_without_direct_observations(self):
        data = fixture(n_models=6000, dual_effort=False)
        samples = trace(data, {'g': np.full(6000, 2.), 'domain_scale': np.full(5, .5)})
        z = np.asarray(samples['Z']['value'])
        # Exact conditional expectation from a centered independent departure.
        np.testing.assert_allclose(z.mean(axis=0), np.full(5, 2 / np.sqrt(1.25)), atol=.03)
        self.assertGreater(z[:, 4].mean(), 1.7)
        self.assertGreater(z[:, 4].std(), .35)

    def test_direct_evidence_can_favor_negative_specialization_despite_positive_general_trait(self):
        data = fixture(n_models=1, dual_effort=False)
        data['cell_system_index'] = [0]
        data['cell_benchmark_index'] = [1]
        data['observations'] = [{
            'cell_index': 0, 'benchmark_index': 1, 'protocol_index': 0,
            'provenance_index': 0, 'domain_index': 4, 'likelihood': 'normal',
            'y': -np.sqrt(2), 'variance': .01,
        }]
        controlled = {
            'g': [2.], 'domain_scale': np.ones(5), 'domain_z': np.zeros((1, 5)),
            'beta': np.zeros(2), 'log_alpha': np.zeros(2),
            'family_z': np.zeros((1, 2)), 'cell_z': [0.],
            'proto_z': np.zeros((1, 5)), 'xi_z': [0.],
            'omega_bar': [.1, .1], 'zeta': np.zeros((2, 5)),
        }
        ordinary = trace(data, controlled)
        specialized = trace(data, {**controlled, 'domain_z': [[0., 0., 0., 0., -4.]]})
        ordinary_lp = float(ordinary['obs_normal']['fn'].log_prob(ordinary['obs_normal']['value']))
        specialized_lp = float(specialized['obs_normal']['fn'].log_prob(specialized['obs_normal']['value']))
        self.assertLess(float(specialized['Z']['value'][0, 4]), 0)
        self.assertGreater(float(specialized['Z']['value'][0, 2]), 0)
        self.assertGreater(specialized_lp, ordinary_lp + 20)


if __name__ == '__main__':
    unittest.main()
