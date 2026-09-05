"""Diagnostic regressions: the reported acceptance evidence must be measured."""
import unittest
import numpy as np
from aci12.runner import _diagnostics, _energy_bfmi


class RunnerDiagnostics(unittest.TestCase):
    def test_bfmi_uses_total_energy_and_sample_variance(self):
        energy = np.array([[0., 1., 4., 2.], [2., -1., 0., 1.]])
        expected = [float(np.mean(np.diff(row) ** 2) / np.var(row, ddof=1)) for row in energy]
        actual = _energy_bfmi({'energy': energy, 'potential_energy': np.zeros_like(energy)}, 2)
        np.testing.assert_allclose(actual, expected)

    def test_potential_energy_cannot_stand_in_for_missing_total_energy(self):
        self.assertEqual(_energy_bfmi({'potential_energy': np.array([[0., 1., 4., 2.]])}, 1), [None])
        self.assertEqual(_energy_bfmi({'energy': np.array([[0., 1., 4., 2.]])}, 2), [None, None])

    def test_invalid_energy_fails_only_affected_chains(self):
        actual = _energy_bfmi({'energy': np.array([[2., 2., 2.], [0., np.nan, 1.], [0., 1., 0.]])}, 3)
        self.assertIsNone(actual[0])
        self.assertIsNone(actual[1])
        self.assertIsNotNone(actual[2])

    def test_unmixed_chat_cannot_hide_behind_mixed_diagnostics(self):
        rng = np.random.default_rng(7)
        mixed = rng.normal(size=(4, 64, 2))
        chat = rng.normal(size=(4, 64, 2)) + np.arange(4)[:, None, None] * 20
        diagnostics = _diagnostics(
            {'G_cal': mixed, 'Chat_cal': chat, 'Agentic_cal': mixed,
             'domain_scale': mixed, 'effort_domain_sd': mixed},
            {'energy': rng.normal(size=(4, 64)), 'diverging': np.zeros((4, 64), dtype=bool)}, 4,
        )
        self.assertGreater(diagnostics['parameters']['Chat_cal']['rhat'], 2.)
        self.assertLess(diagnostics['parameters']['G_cal']['rhat'], 1.1)
        self.assertIn('Agentic_cal', diagnostics['parameters'])
        self.assertIn('domain_scale', diagnostics['parameters'])
        self.assertIn('effort_domain_sd', diagnostics['parameters'])
        self.assertEqual(diagnostics['ebfmi_energy'], 'hamiltonian')

    def test_divergence_rate_does_not_depend_on_energy_availability(self):
        rng = np.random.default_rng(9)
        diagnostics = _diagnostics({'G_cal': rng.normal(size=(2, 20))},
                                   {'diverging': np.array([[True] + [False] * 19, [False] * 20])}, 2)
        self.assertEqual(diagnostics['divergences'], 1)
        self.assertEqual(diagnostics['divergence_fraction'], .025)
        self.assertEqual(diagnostics['ebfmi'], [None, None])


if __name__ == '__main__':
    unittest.main()
