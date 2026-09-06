# ActualAnalysis 1.5.0: Measurement Spaces, Capability Classes, and Evidence Geometry Implementation Guide

**Status:** Implementation specification and developer reference for experimental candidate 1.5.0.  
**Reference Design:** `docs/proposals/aci-1.5.0-measurement-spaces-and-classes.md`.  
**Scope:** Developer tooling, typed schemas, measurement geometry, transfer-class validation, reproducible holdout experiments, Grok `class_prior` integration, and fail-closed candidate evaluation.  
**Notice:** All candidate outputs and class definitions are unreviewed experimental research tools. No confirmatory criteria are locked, no reviewed capability-transfer classes exist in production, and production scoring/snapshots remain unaltered.

---

## 1. Architectural Architecture & Conceptual Separation

The ActualAnalysis 1.5.0 measurement framework cleanly decouples distinct scientific and statistical responsibilities:

| Object | Defined In | Explicit Responsibilities | Forbidden Assumptions |
|---|---|---|---|
| **System Specification** | `experiment.py`, `transfer-class.ts` | Release identity, configuration, harness, tools, budget policy | Never treat missing settings as verified maximums or defaults |
| **Task Population** | `experiment.py`, `transfer-class.ts` | Declared task measure $Q$, operational utility $u_t(y) \in [0, 1]$ | Never infer target task mass $q$ from benchmark count ratios (e.g. $n/19$) |
| **Measurement Specification** | `experiment.py`, `transfer-class.ts` | Native likelihood, scale units, sampling unit, dependence | Never equate Elo ratings or raw scores directly with task success probabilities |
| **Transfer-Class Registry** | `experiment.py`, `transfer-class.ts` | Partition $c: \mathcal{M} \to \mathcal{C}$, derivation lineage, singleton fallback | Never group models by nominal brand alone without documented derivation |
| **Class Prior Contract** | `class_prior.py`, `experiment.py` | Grok opt-in `class_prior` specification with Beta/Fixed pooling | Candidate runner MUST fail closed if `class_prior` is absent or unsupported |
| **Evidence Geometry** | `geometry.py` | Fisher information $J_s$, null-space diagnostics, cone tests | Never disguise prior/borrowed precision as direct empirical evidence |
| **Ordering & Comparisons** | `geometry.py` | Paired draws, practical margin $> 1$ at $0.90$, partial identification | Never treat an unresolved comparison as proof of statistical equivalence |
| **Experiment Preparation** | `experiment.py` | Family-disjoint holdouts, stress masks, actual Gemini exclusion | Never allow source/effort leakage; exclude Gemini from both training & confirmation |
| **Evaluation Planner** | `geometry.py`, `experiment.py` | Expected variance reduction $\Delta V(a)$, evaluation ranking | Never select tests solely because they improve a favored system score |

---

## 2. Grok `class_prior` Contract Integration

The candidate integration adapter (`ClassPriorAdapter` in `experiment.py` and Zod schemas in `transfer-class.ts`) conforms strictly to the Grok input contract:

```json
{
  "enabled": true,
  "family": "restricted",
  "edition": "<frozen partition edition id>",
  "pooling": {
    "kind": "beta",
    "alpha": 1.0,
    "beta": 1.0
  },
  "partition": [
    {
      "class_id": "<documented class id>",
      "model_ids": ["<release snapshot id>", "..."]
    }
  ],
  "registry_sha256": "<frozen hash>",
  "notes": "<optional documentation>"
}
```

### Contract Enforcement Rules:
1. **Family:** Must be `"restricted"`. Predecessor random-walk and other candidate families are rejected.
2. **Pooling:**
   - `kind="beta"`: Requires positive finite `alpha` and `beta` (development baseline is $\operatorname{Beta}(1, 1)$). `value` key is forbidden.
   - `kind="fixed"`: Requires `value` with $0 \le \text{value} < 1$ (exact nested independent baseline at $\text{value}=0$). `alpha` and `beta` keys are forbidden.
3. **Partition:**
   - Multi-member classes only; singletons are omitted from `partition` and assigned automatically via runner singleton fallback (`singleton:<model_id>`).
   - `class_id` must NOT use the `singleton:` prefix.
   - `model_ids` must be release snapshot IDs without effort suffixes (e.g. `gpt-5`, NOT `gpt-5@max-common`).
4. **No Guessing:** Keys requesting provider or name-based guessing (`guess_providers`, `provider_classes`, `by_provider`, etc.) are rejected with an explicit error.
5. **Fail Closed:** The candidate runner (`cli_run_candidate`) validates:
   - `class_prior` must be present and `enabled: true`.
   - Immutable hash check: matches `train_data_hash` in `manifest.json`.
   - Runtime check: verifies that the runner environment actually supports `class_prior` (i.e. `class_rho` in declared parameters). If absent, it **fails closed** rather than silently running the baseline.

---

## 3. Evidence Geometry (`geometry.py`)

### 3.1 Measurement-Information Matrix, Condition-Level Loading Geometry & Covariance Validation
For a system's direct observations, $A_s \in \mathbb{R}^{M \times K}$ collects unique benchmark condition loading rows, and $R_s$ is the declared equal unit illustrative residual covariance:
$$J_s = A_s^{\mathsf T} R_s^{-1} A_s$$

- **Condition-Level Loading Geometry (`diagnose_system_geometry`):** By default, the geometric diagnostic strictly operates on condition-level loading geometry. It deduplicates measured condition directions across multiple observation rows, sets declared equal unit illustrative variance ($R_{\text{diag}} = \mathbf{1}$), reports `source_observation_count` separately from `unique_measured_directions_count`, and guarantees duplicate-row invariance (eigenvalues, rank, null space, and cone status are identical regardless of repeated rows).
- **Estimation Disclaimers:** Prominently labels that this diagnostic evaluates only the geometric span and cone identification of declared benchmark condition directions under declared equal unit variance. It does NOT perform empirical Fisher information estimation, empirical precision estimation, or inferred residual variance estimation from observed data. Custom variances and raw observations are retained for programmatic API callers.
- **Nuisance Schur Complement & PSD Validation (`compute_information_matrix`):** Validates that nuisance Schur complements are finite, symmetric, and positive semi-definite. Rejects materially indefinite adjusted information matrices ($\min(\lambda) < -10^{-9} \cdot \text{scale}$) rather than clipping invalid Hessians.
- **Covariance Validation (`validate_covariance_matrix`):** Verifies symmetry and positive definiteness via Cholesky / eigenvalue thresholding ($\lambda_{\min} \ge 10^{-12}$).
- **Spectral & Null-Space Analysis (`analyze_information`):** Identifies the **null space of unidentified capability directions** that direct evidence cannot constrain.
- **Target Support Diagnostic (`target_support_diagnostic`):** Evaluates whether a target direction $w$ is supported by the direct measurement operator.
- **Conditioning Assumptions:** Outputs explicit conditioning assumptions: linear-Gaussian local approximation conditioned on point measurement parameters; does not represent an empirical ground-truth covariance across unseen real-world tasks.

### 3.2 Cone Membership & Section 9.2 Counterexample
Dominance on all shared benchmarks implies target dominance ($A d \ge 0 \Longrightarrow w^{\mathsf T} d \ge 0$) **if and only if**:
$$w \in \operatorname{cone}\{a_1, \ldots, a_B\}$$

- **Farkas Certificate:** `evaluate_cone_membership` solves $\min_{q \ge 0} \|A^{\mathsf T} q - w\|_2^2$ via NNLS. When $w \notin \operatorname{cone}(A)$, it constructs the exact separating certificate $d = A^{\mathsf T} q^* - w$ where $A d \ge 0$ and $w^{\mathsf T} d < 0$.
- **Section 9.2 Counterexample:** Verified against accepted loading rows (DeepSWE 1.1, Terminal-Bench 4.0, MathArena, Finance Agent v2, Arena Text). With $d = (1.6, 1.0, 1.0, -5.0, 1.0)^{\mathsf T}$, projections are $+1.15, +1.03, +1.00, +0.01, +0.13$ (all $> 0$), yet target mean difference is $-0.08$ ($< 0$).
- **Uncertainty Caveats:** Cone inclusion is an idealized noiseless property. It does not certify dominance under sampling variance, parameter uncertainty, or benchmark residuals.

### 3.3 Paired Draw Comparison ($>1$ at $0.90$)
$$\widehat{P}_u(A > B + 1) = \frac{1}{S} \sum_{j=1}^S \mathbf{1}[I_{Au}^{(j)} - I_{Bu}^{(j)} > 1]$$
Supports $A$ only if $\widehat{P}_u \ge 0.90$; supports $B$ if reverse $\ge 0.90$; otherwise marked `unresolved`. Neither direction passing does NOT imply practical or statistical equivalence.

### 3.4 Partial Identification Bounds Requiring Actual Task Mass
$$V(A) - V(B) \in [d_O - (1 - q),\ d_O + (1 - q)]$$
Strictly rejects substituting benchmark counts ($n/19$) for target task mass $q$. Requires an operational task sampling definition and certified target probability mass $Q$.

---

## 4. Reproducible Experiment Preparation (`experiment.py`)

1. **Family-Disjoint Successor-Domain Holdouts:**
   - Targets a successor model and domain.
   - Identifies all benchmark conditions in the domain and their entire benchmark families.
   - **Removes ALL source/effort rows:** Every observation for the target model across all conditions in those families is removed from training and placed into `eval_spec`.
   - Fails closed if the successor model has 0 observations in the target domain (no empty holdouts).
2. **Provisional Gemini Development Exclusions vs. Confirmatory Gate:**
   - `CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS`: A provisional development-only exclusion superset grouping observed Gemini releases from Audit 1.4.2 / 1.4.3 for exploratory holdout isolation. It is NOT a certified component, NOT a documented lineage or ancestry registry, and CANNOT be used for confirmatory evaluation or hyperprior tuning.
   - **Confirmatory Provenance Requirement:** For confirmatory promotion or hyperparameter tuning (`--confirmatory`), callers must supply frozen component membership metadata with explicit provenance (`--gemini-component-metadata <path>` with non-empty `provenance` and `member_models`). If omitted, confirmatory evaluation **fails closed**.
   - When Gemini exclusion is applied, matching models and systems are physically removed from `train_data` (observations, system IDs, calibration panel, model index), and `"gemini_exclusion_status"` is recorded in `manifest.json` and `eval_spec.json`.
3. **Selective Stress Masks:**
   - `poor_outcome`: Masks lowest 25% of outcomes to simulate publication suppression.
   - `missing_domain`: Masks an additional complete domain to evaluate borrowing under total direct missingness.
4. **Sensitivity Scenarios:**
   - `omission`: Collapses partition to singletons ($\rho = 0$).
   - `wrong_class`: Assigns target to an incompatible class to test negative transfer.
5. **Real Immutable Hash Checks:**
   - Deterministic SHA-256 hashes computed on `train_data`, `eval_spec`, and registry. Verified on load.

---

## 5. Command-Line Interface (CLI)

```bash
# 1. Validate a transfer-class registry
PYTHONPATH=packages/scoring/python uv run --project packages/scoring/python python3 -m aci12.experiment validate-registry \
  --registry data/experimental/transfer-classes-example.json

# 2. Prepare family-disjoint successor-domain holdout experiment (development mode)
PYTHONPATH=packages/scoring/python uv run --project packages/scoring/python python3 -m aci12.experiment prepare \
  --input docs/audits/1.4.3-effort-coverage/accepted-input.json \
  --registry data/experimental/transfer-classes-example.json \
  --target-model gemini-3.8-flash \
  --target-domain reasoning \
  --output-dir exports/experiments/gemini_holdout

# Confirmatory mode (requires caller-supplied frozen metadata with provenance)
PYTHONPATH=packages/scoring/python uv run --project packages/scoring/python python3 -m aci12.experiment prepare \
  --input docs/audits/1.4.3-effort-coverage/accepted-input.json \
  --registry data/experimental/transfer-classes-example.json \
  --target-model gemini-3.8-flash \
  --target-domain reasoning \
  --confirmatory \
  --gemini-component-metadata data/experimental/gemini-component-provenance.json \
  --output-dir exports/experiments/gemini_confirmatory

# 3. Run condition-level loading geometry & target support diagnostics
PYTHONPATH=packages/scoring/python uv run --project packages/scoring/python python3 -m aci12.experiment diagnose-geometry \
  --input docs/audits/1.4.3-effort-coverage/accepted-input.json \
  --target-system gemini-3.8-flash@max-common \
  --output exports/experiments/gemini_geometry.json

# 4. Run opt-in class candidate evaluation (development sampler settings, fail closed)
PYTHONPATH=packages/scoring/python uv run --project packages/scoring/python python3 -m aci12.experiment run-candidate \
  --input exports/experiments/gemini_holdout/train_input.json \
  --output-dir exports/experiments/gemini_run \
  --dev-mode \
  --chains 1 \
  --warmup 20 \
  --samples 20
```

---

## 6. Exact Limitations

1. **Unreviewed Classes:** No reviewed scientific capability-transfer classes currently exist. All registry files are unreviewed illustrative candidates for methodology development.
2. **Experimental Outputs:** All candidate fits are tagged `is_experimental: True` and `is_publishable: False`. They must not be published or cited as leaderboard scores.
3. **Conditional Ignorability:** Observational benchmark data cannot verify that unobserved publication decisions are ignorable (MAR). Class borrowing can propagate selection bias if unfavorable outcomes were suppressed.
4. **Finite Approximation:** The 5-coordinate model is a finite approximation; it does not establish that AI capabilities reside on a 5-dimensional subspace.
5. **No Production Mutation:** Production scoring models, calibration snapshots, and existing published rankings remain unchanged.
