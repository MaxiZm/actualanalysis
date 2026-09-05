"""Reproduce the Sol/base and Pro/base comparison from accepted posterior draws.

Usage: python scripts/audit-posterior.py /path/to/run /path/to/output.json
Requires NumPy from packages/scoring/python's locked environment.
"""
import argparse
import json
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('run', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
data = json.loads((args.run / 'aci12-input.json').read_text())
diag = json.loads((args.run / 'aci12-diagnostics.json').read_text())
if not diag.get('accepted'):
    raise ValueError('Use an accepted production posterior for a published comparison')
samples = np.load(args.run / 'aci12-posterior.npz')
z = samples['Z']
panel = [data['system_ids'].index(s) for s in data['calibration_panel_system_ids']]
floor = data.get('panel_scale_floor', .05)
t = (z - z[:, panel].mean(1)[:, None]) / np.maximum(z[:, panel].std(1, ddof=1)[:, None], floor)
output = {'method_version': data['method_version'], 'posterior_draws': len(z), 'pairs': {}}
for left, right in [('gpt-5.6-sol', 'gpt-5.5'), ('gpt-5.5-pro', 'gpt-5.5')]:
    a, b = [data['system_ids'].index(f'{model}@max-common') for model in (left, right)]
    pair = {'left': left, 'right': right, 'profiles': {}, 'domain_differences': {}}
    for name in ['general', 'agentic', 'chat']:
        weights = np.array([data['profiles'][name]['weights'].get(d, 0) for d in data['domains']])
        raw = t @ weights
        scale = np.maximum(raw[:, panel].std(1, ddof=1), floor)
        display = 50 + 10 * (raw - raw[:, panel].mean(1)[:, None]) / scale[:, None]
        delta = display[:, a] - display[:, b]
        pair['profiles'][name] = {
            'left_median': float(np.median(display[:, a])), 'right_median': float(np.median(display[:, b])),
            'paired_difference_median': float(np.median(delta)), 'paired_difference_90': np.quantile(delta, [.05, .95]).tolist(),
            'probability_left_higher': float(np.mean(delta > 0)), 'probability_left_higher_by_one': float(np.mean(delta > 1)),
            'mean_domain_contributions': dict(zip(data['domains'], (10 * (t[:, a] - t[:, b]) * weights / scale[:, None]).mean(0).tolist())),
        }
    for k, domain in enumerate(data['domains']):
        delta = 10 * (t[:, a, k] - t[:, b, k])
        pair['domain_differences'][domain] = {'median': float(np.median(delta)), 'ci90': np.quantile(delta, [.05, .95]).tolist()}
    output['pairs'][f'{left}-vs-{right}'] = pair
if 'domain_scale' in samples:
    output['domain_departure_scales'] = dict(zip(data['domains'], np.median(samples['domain_scale'], axis=0).tolist()))
    output['mean_prior_trait_correlation'] = samples['Omega'].mean(0).tolist()
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + '\n')
print(json.dumps({key: value['profiles']['chat'] for key, value in output['pairs'].items()}, indent=2))
