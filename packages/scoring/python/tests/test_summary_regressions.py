"""Regression checks for the 1.3 display estimands, independent of NUTS."""
import copy
import unittest
import numpy as np
from aci12.summarize import build_posterior_summary


def fixture():
    domains = ['agentic', 'software-code', 'reasoning', 'knowledge-information', 'communication-professional']
    ids = [f'm{i}@max-common' for i in range(12)]
    # Model 0 projects to 2.5 on the benchmark's 25/75 mixture.
    traits = np.array([[1+i*.15, 3-i*.07, .5+i*.2, .2+i*.3, 2+i*.08] for i in range(12)])
    z = np.repeat(traits[None, :, :], 3, axis=0)
    profile = {'weights': dict(zip(domains,[1,0,0,0,0])), 'baskets': {'agentic':['b0']}}
    gate = {'max_width':20,'min_domains':3,'min_safe_cells':1,'max_family_share':.8}
    data = {'system_ids':ids,'benchmark_ids':['b0'],'domains':domains,'calibration_panel_system_ids':ids,
            'system_training_cutoff':[None]*12,'benchmark_holdout':['private'],'benchmark_public_release_date':[None],
            'benchmark_family_ids':['f0'],'benchmark_family_index':[0], 'benchmark_domains':[[.25,.75,0,0,0]],
            'cell_system_index':[0],'cell_benchmark_index':[0],
            'observations':[{'cell_index':0,'provenance_index':0,'y':2,'variance':.1}],
            'tiers':{'verified':gate,'ranked':gate},'profiles':{'agentic':profile,'chat':profile},
            'benchmark_utility_eligible':[True]}
    samples={'Z':z,'difficulty':np.full((3,1),3.),'discrimination':np.full((3,1),2.),
             'eta_cell':np.array([[0.],[100.],[101.]]),'cell_misfit':np.array([[0.],[0.],[100.]])}
    return data,samples


class SummaryRegressions(unittest.TestCase):
    def test_predictor_uses_intercept_once_and_all_loadings(self):
        data,samples=fixture(); summary=build_posterior_summary(data,samples)
        # Independent analytic check: logistic(-3 + 2*(.25*1 + .75*3)).
        self.assertAlmostEqual(summary['systems']['m0@max-common']['baskets']['chat']['median'],88.07970779778823)

    def test_relative_indexes_do_not_depend_on_utility_basket_eligibility(self):
        data,samples=fixture(); expected=build_posterior_summary(data,samples)
        data['benchmark_utility_eligible']=[False]
        actual=build_posterior_summary(data,samples)
        for sid in data['system_ids']:
            self.assertEqual(actual['systems'][sid]['index_profiles'],expected['systems'][sid]['index_profiles'])
        self.assertFalse(actual['systems']['m0@max-common']['baskets']['chat']['published'])
        self.assertEqual(actual['systems']['m0@max-common']['baskets']['chat']['missing_benchmarks'],['b0'])

    def test_calibrated_parameters_invariant_to_raw_affine_coordinates(self):
        data,samples=fixture(); expected=build_posterior_summary(data,samples)
        shifted=copy.deepcopy(samples)
        shifted['Z']=samples['Z']*3+4
        shifted['difficulty']=samples['difficulty']+samples['discrimination']*4/3
        shifted['discrimination']=samples['discrimination']/3
        actual=build_posterior_summary(data,shifted)
        for key in ['difficulty','discrimination']:
            self.assertAlmostEqual(actual['benchmarks']['b0'][key],expected['benchmarks']['b0'][key])
        for sid in data['system_ids']:
            self.assertAlmostEqual(actual['systems'][sid]['index_profiles']['chat']['median'],expected['systems'][sid]['index_profiles']['chat']['median'])
        self.assertAlmostEqual(actual['systems']['m0@max-common']['baskets']['chat']['median'],expected['systems']['m0@max-common']['baskets']['chat']['median'])

    def test_expected_cell_is_median_of_derived_draws(self):
        data,samples=fixture();summary=build_posterior_summary(data,samples)
        self.assertEqual(summary['cells'][0]['theta_median'],1.)

    def test_each_view_calibrates_to_panel_mean_50_sd_10(self):
        data,samples=fixture();summary=build_posterior_summary(data,samples)
        for kind in ['agentic','chat']:
            vals=[summary['systems'][sid]['index_profiles'][kind]['median'] for sid in data['system_ids']]
            self.assertAlmostEqual(float(np.mean(vals)),50.)
            self.assertAlmostEqual(float(np.std(vals,ddof=1)),10.)

    def test_preliminary_models_keep_paired_comparisons_without_statistical_ranks(self):
        data,samples=fixture();summary=build_posterior_summary(data,samples)
        a,b=data['system_ids'][:2]
        view=summary['views']['chat']
        self.assertIsNone(view[a]['rank'])
        self.assertIn(b,view[a]['pairwise'])
        self.assertAlmostEqual(view[a]['pairwise'][b]+view[b]['pairwise'][a],1.)
        self.assertNotIn(a,view[a]['pairwise'])

if __name__=='__main__':unittest.main()
