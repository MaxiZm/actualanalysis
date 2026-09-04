# ACI scoring math

Method **1.2.2** replaces method 1.2.1 in full. The normative formulas and publication rules are maintained in [methodology.md](./methodology.md); executable constants are in `data/index-config.yaml`.

The implementation is split intentionally:

- `packages/scoring/src/aci12.ts` validates and prepares observations, executes the single-system rule, overlap graph partitioning, per-domain panel audits, evidence tiering, and pairwise margin comparisons.
- `packages/ingest/src/observation-annotations.ts` applies dated source protocols and records every inherited field and metadata-incomplete flag.
- `packages/scoring/src/aci12-input.ts` maps the versioned registries into the 1.2.2 system, benchmark, and observation contract.
- `packages/scoring/src/numpyro.ts` creates the indexed joint-model input and invokes the version-locked Python runner.
- `packages/scoring/python/aci12/model.py` defines the correlated five-domain hierarchical likelihood in NumPyro with unpinned condition parameters.
- `packages/scoring/python/aci12/runner.py` runs NUTS, stores the retained posterior, and enforces zero divergences and convergence thresholds.
- `packages/scoring/python/aci12/summarize.py` derives the three published scales (ACI-G, ACI-Domain, ACI-Basket), exact $R_s$, panel-scaled precision-drop concentration gate, and diagnostics suite.
- `packages/scoring/src/validation.ts` implements release acceptance gates: SBC, holdouts, adversarial self-report fit, and pipeline invariance.

The legacy Huber, benchmark-weight, anchor, canonical-configuration, and hierarchical-bootstrap modules remain only to reproduce historical pre-1.2 runs. `runScoring` rejects a 1.2 method version so those modules cannot accidentally publish a run under the new label.

In 1.2.2, reference benchmark pinning is eliminated; identification is achieved through the calibration panel. The pipeline audits that every panel system has $\ge 2$ independent cells in every domain and writes a metadata unblock table upon failure.
