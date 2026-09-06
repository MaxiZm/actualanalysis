"""ActualAnalysis 1.5.0 Evidence Geometry.

Implements measurement-information matrix, covariance validation, rank/null-space
diagnostics, target support, cone membership with Farkas certificates and uncertainty
caveats, paired draw practical comparison (>1 margin at 0.90), partial identification
bounds requiring verified target task mass, and Gaussian expected variance reduction.

Reference: docs/proposals/aci-1.5.0-measurement-spaces-and-classes.md
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Sequence

import numpy as np
import scipy.linalg  # type: ignore[import-untyped]
import scipy.optimize  # type: ignore[import-untyped]


@dataclass(frozen=True)
class InformationAnalysis:
    """Spectral analysis of measurement information matrix J_s."""

    eigenvalues: list[float]
    effective_rank: int
    dimension: int
    condition_number: float
    null_space_basis: list[list[float]]  # Unidentified directions
    range_space_basis: list[list[float]]  # Measured subspace directions
    tolerance: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class TargetSupportDiagnostic:
    """Evaluation of whether target direction w is identified by measurement matrix J_s."""

    target: list[float]
    projected_range: list[float]
    projected_null: list[float]
    support_fraction: float  # ||w_range||^2 / ||w||^2 in [0, 1]
    unidentified_fraction: float  # ||w_null||^2 / ||w||^2 in [0, 1]
    null_component_norm: float
    is_fully_supported: bool
    diagnostics_note: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class BorrowedPrecisionDecomposition:
    """Decomposition separating direct evidence from borrowed class/prior precision.

    Reference: proposal §8.2: C_post = (C_0^{-1} + J_s)^{-1}.
    Eigenvalues of C_0^{1/2} J_s C_0^{1/2} characterize direct constraint relative to prior.
    """

    relative_eigenvalues: list[float]
    prior_target_variance: float | None
    posterior_target_variance: float | None
    variance_reduction: float | None
    direct_information_share: float | None  # Delta V / V_prior
    direct_evidence_eigenvalues: list[float]
    note: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ConeMembershipResult:
    """Result of cone membership test: does w in cone{a_1, ..., a_B}?

    Reference: proposal §9.1 (Theorem of alternatives) & §9.2.
    """

    in_cone: bool
    residual_norm: float
    cone_weights: list[float]
    separating_vector: list[float] | None
    projections_on_separating_vector: list[float] | None
    target_projection_on_separating_vector: float | None
    caveats: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PairedDrawComparisonResult:
    """Paired draw practical comparison under a declared margin and threshold.

    Reference: proposal §12: P_hat_u(A > B + 1) >= 0.90.
    """

    probability_a_beats_b_plus_margin: float
    probability_b_beats_a_plus_margin: float
    directional_probability_a_beats_b: float
    margin: float
    threshold: float
    status: str  # "A_leads", "B_leads", or "unresolved"
    draw_count: int
    note: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PartialIdentificationBoundsResult:
    """Partial identification bounds when unmeasured task mass is large.

    Reference: proposal §11: V(A) - V(B) in [d_O - (1 - q), d_O + (1 - q)].
    Requires verified task mass q under an explicit operational task sampling definition.
    """

    observed_difference: float
    verified_task_mass_q: float
    lower_bound: float
    upper_bound: float
    bound_width: float
    sampling_se: float
    confidence_lower: float | None
    confidence_upper: float | None
    is_task_mass_verified: bool
    audit_notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class EvaluationRankingItem:
    """Prospective evaluation ranked by expected reduction in target variance.

    Reference: proposal §13: Delta V(a) = (h^T C a)^2 / (v + a^T C a).
    """

    candidate_id: str
    loading_vector: list[float]
    observation_variance: float
    variance_reduction: float
    posterior_variance: float
    fractional_reduction: float
    cost: float | None
    efficiency: float | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def validate_covariance_matrix(
    matrix: np.ndarray,
    name: str = "covariance",
    min_eigenvalue: float = 1e-12,
) -> np.ndarray:
    """Validates that a 2D matrix is symmetric and strictly positive definite."""
    arr = np.asarray(matrix, dtype=float)
    if arr.ndim != 2 or arr.shape[0] != arr.shape[1]:
        raise ValueError(f"{name} must be a square 2D matrix, got shape {arr.shape}")
    if not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} contains non-finite values (NaN or Inf)")
    # Check symmetry
    sym_diff = np.max(np.abs(arr - arr.T))
    if sym_diff > 1e-7 * max(1.0, float(np.max(np.abs(arr)))):
        raise ValueError(f"{name} is not symmetric (max asymmetry {sym_diff})")
    # Symmetrize for numerical stability
    symmetric = 0.5 * (arr + arr.T)
    # Check positive definiteness via eigenvalues
    w = scipy.linalg.eigvalsh(symmetric)
    if float(np.min(w)) < min_eigenvalue:
        raise ValueError(
            f"{name} is not positive definite: minimum eigenvalue is {float(np.min(w)):.4e} "
            f"(must be >= {min_eigenvalue:.4e})"
        )
    return symmetric


def compute_information_matrix(
    loadings: np.ndarray,
    residual_covariance: np.ndarray | Sequence[float],
    nuisance_schur_complement: np.ndarray | None = None,
) -> np.ndarray:
    """Computes linearized measurement-information matrix J_s = A_s^T R_s^{-1} A_s.

    Reference: proposal §8.1.

    Args:
        loadings: (B, K) array of measurement loadings for B conditions across K domains.
        residual_covariance: (B, B) residual covariance matrix or 1D array of length B.
        nuisance_schur_complement: Optional (K, K) reduction from nuisance parameter marginalization.

    Returns:
        (K, K) symmetric positive semidefinite information matrix J_s.
    """
    A = np.asarray(loadings, dtype=float)
    if A.ndim != 2:
        raise ValueError(f"loadings must be a 2D array of shape (B, K), got ndim={A.ndim}")
    b_rows, k_cols = A.shape
    if b_rows == 0:
        return np.zeros((k_cols, k_cols), dtype=float)

    R = np.asarray(residual_covariance, dtype=float)
    if R.ndim == 1:
        if R.shape[0] != b_rows:
            raise ValueError(f"residual variances length {R.shape[0]} != rows in loadings {b_rows}")
        if np.any(R <= 0.0) or not np.all(np.isfinite(R)):
            raise ValueError("All diagonal residual variances must be strictly positive and finite")
        inv_diag = 1.0 / R
        J = A.T @ (A * inv_diag[:, None])
    elif R.ndim == 2:
        if R.shape != (b_rows, b_rows):
            raise ValueError(f"residual covariance shape {R.shape} != ({b_rows}, {b_rows})")
        R_sym = validate_covariance_matrix(R, name="residual_covariance")
        # Solve R X = A => X = R^{-1} A
        inv_R_A = scipy.linalg.solve(R_sym, A, assume_a="pos")
        J = A.T @ inv_R_A
    else:
        raise ValueError(f"residual_covariance must be 1D or 2D, got ndim={R.ndim}")

    if nuisance_schur_complement is not None:
        N = np.asarray(nuisance_schur_complement, dtype=float)
        if N.shape != (k_cols, k_cols):
            raise ValueError(f"nuisance_schur_complement shape {N.shape} != ({k_cols}, {k_cols})")
        if not np.all(np.isfinite(N)):
            raise ValueError("nuisance_schur_complement contains non-finite values (NaN or Inf)")
        if not np.allclose(N, N.T, atol=1e-8):
            raise ValueError("nuisance_schur_complement is not symmetric")
        # Validate nuisance adjustment is PSD (tolerating only tiny numerical roundoff)
        w_N = scipy.linalg.eigvalsh(0.5 * (N + N.T))
        scale_N = max(float(np.max(np.abs(w_N))), 1.0)
        if np.min(w_N) < -1e-10 * scale_N:
            raise ValueError(
                f"nuisance_schur_complement must be positive semidefinite (min eigenvalue {np.min(w_N):.6e} < 0)"
            )
        J = J - N

    # Guarantee symmetry
    J = 0.5 * (J + J.T)

    # Check for indefinite adjusted J
    eigvals, eigvecs = scipy.linalg.eigh(J)
    scale_J = max(float(np.max(np.abs(eigvals))), 1.0)
    min_eig = float(np.min(eigvals))

    # Reject materially indefinite adjusted J (e.g. nuisance reduction exceeds direct measurement information)
    # Only allow relative numerical roundoff (tol = 1e-9 * scale)
    roundoff_tol = 1e-9 * scale_J
    if min_eig < -roundoff_tol:
        raise ValueError(
            f"Adjusted information matrix J is materially indefinite (minimum eigenvalue {min_eig:.6e} < 0). "
            f"Nuisance Schur complement reduction exceeds direct measurement information."
        )

    # Clean only negligible numerical roundoff in [-roundoff_tol, 0]
    eigvals_cleaned = np.maximum(eigvals, 0.0)
    J_psd = eigvecs @ np.diag(eigvals_cleaned) @ eigvecs.T
    return 0.5 * (J_psd + J_psd.T)


def analyze_information(
    J: np.ndarray,
    tol_rel: float = 1e-6,
    tol_abs: float = 1e-10,
) -> InformationAnalysis:
    """Eigendecomposition, rank, condition number, and null-space of information matrix J.

    Reference: proposal §8.1.
    Null space contains directions that observations cannot identify.
    """
    J_arr = np.asarray(J, dtype=float)
    if J_arr.ndim != 2 or J_arr.shape[0] != J_arr.shape[1]:
        raise ValueError(f"J must be a square matrix, got shape {J_arr.shape}")
    k = J_arr.shape[0]
    if k == 0:
        return InformationAnalysis([], 0, 0, 1.0, [], [], tol_abs)

    J_sym = 0.5 * (J_arr + J_arr.T)
    eigenvalues, eigenvectors = scipy.linalg.eigh(J_sym)
    # Sort descending
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues = np.maximum(eigenvalues[order], 0.0)
    eigenvectors = eigenvectors[:, order]

    max_eval = float(eigenvalues[0]) if k > 0 else 0.0
    tol = max(tol_abs, tol_rel * max_eval)

    range_mask = eigenvalues >= tol
    null_mask = ~range_mask

    effective_rank = int(np.sum(range_mask))

    min_pos_eval = float(eigenvalues[range_mask][-1]) if effective_rank > 0 else 0.0
    condition_number = float(max_eval / min_pos_eval) if min_pos_eval > 0 else float("inf")

    range_basis = [eigenvectors[:, i].tolist() for i in range(k) if range_mask[i]]
    null_basis = [eigenvectors[:, i].tolist() for i in range(k) if null_mask[i]]

    return InformationAnalysis(
        eigenvalues=[float(x) for x in eigenvalues],
        effective_rank=effective_rank,
        dimension=k,
        condition_number=condition_number,
        null_space_basis=null_basis,
        range_space_basis=range_basis,
        tolerance=tol,
    )


def target_support_diagnostic(
    analysis: InformationAnalysis,
    target_w: np.ndarray | Sequence[float],
    tol: float = 1e-5,
) -> TargetSupportDiagnostic:
    """Evaluates whether target direction target_w is supported by measured subspace.

    Reference: proposal §8.1 & §8.2.
    """
    w = np.asarray(target_w, dtype=float)
    if w.ndim != 1 or w.shape[0] != analysis.dimension:
        raise ValueError(f"target_w length {w.shape} does not match dimension {analysis.dimension}")

    w_norm_sq = float(np.dot(w, w))
    if w_norm_sq < 1e-14:
        raise ValueError("target_w cannot be zero vector")

    range_basis = np.asarray(analysis.range_space_basis, dtype=float)  # (rank, K)
    null_basis = np.asarray(analysis.null_space_basis, dtype=float)  # (null_dim, K)

    if range_basis.size > 0:
        # P_range = V_r V_r^T => P_range w = V_r^T (V_r w)
        proj_range = (range_basis.T @ (range_basis @ w)).tolist()
        range_norm_sq = float(np.dot(proj_range, proj_range))
    else:
        proj_range = [0.0] * analysis.dimension
        range_norm_sq = 0.0

    if null_basis.size > 0:
        proj_null = (null_basis.T @ (null_basis @ w)).tolist()
        null_norm_sq = float(np.dot(proj_null, proj_null))
        null_norm = float(np.sqrt(max(0.0, null_norm_sq)))
    else:
        proj_null = [0.0] * analysis.dimension
        null_norm_sq = 0.0
        null_norm = 0.0

    support_fraction = max(0.0, min(1.0, range_norm_sq / w_norm_sq))
    unidentified_fraction = max(0.0, min(1.0, null_norm_sq / w_norm_sq))
    is_fully_supported = null_norm <= tol

    if is_fully_supported:
        note = "Target direction is identified by direct measurement operator."
    else:
        note = (
            f"Target direction has {unidentified_fraction:.1%} energy in the null space of direct "
            f"measurements (unidentified norm={null_norm:.4f}). Precision on this target depends "
            f"on prior or borrowed information."
        )

    return TargetSupportDiagnostic(
        target=[float(x) for x in w],
        projected_range=[float(x) for x in proj_range],
        projected_null=[float(x) for x in proj_null],
        support_fraction=support_fraction,
        unidentified_fraction=unidentified_fraction,
        null_component_norm=null_norm,
        is_fully_supported=is_fully_supported,
        diagnostics_note=note,
    )


def borrowed_precision_decomposition(
    J_s: np.ndarray,
    C_0: np.ndarray,
    target_w: np.ndarray | Sequence[float] | None = None,
) -> BorrowedPrecisionDecomposition:
    """Decomposes posterior precision into borrowed covariance C_0 and direct measurement J_s.

    Reference: proposal §8.2.
    C_post = (C_0^{-1} + J_s)^{-1}.
    Eigenvalues of C_0^{1/2} J_s C_0^{1/2} show direct constraints relative to borrowed info.
    """
    C0_sym = validate_covariance_matrix(C_0, name="borrowed_covariance_C0")
    J_arr = np.asarray(J_s, dtype=float)
    k = C0_sym.shape[0]
    if J_arr.shape != (k, k):
        raise ValueError(f"J_s shape {J_arr.shape} does not match C_0 shape {C0_sym.shape}")

    # Compute C_0^{1/2}
    evals_0, evecs_0 = scipy.linalg.eigh(C0_sym)
    evals_0 = np.maximum(evals_0, 1e-12)
    sqrt_C0 = evecs_0 @ np.diag(np.sqrt(evals_0)) @ evecs_0.T

    # Relative information matrix: S = C_0^{1/2} J_s C_0^{1/2}
    S = sqrt_C0 @ J_arr @ sqrt_C0
    S_sym = 0.5 * (S + S.T)
    rel_evals = scipy.linalg.eigvalsh(S_sym)
    rel_evals_sorted = [float(x) for x in np.sort(np.maximum(rel_evals, 0.0))[::-1]]

    # Direct evidence eigenvalues
    direct_evals = scipy.linalg.eigvalsh(0.5 * (J_arr + J_arr.T))
    direct_evals_sorted = [float(x) for x in np.sort(np.maximum(direct_evals, 0.0))[::-1]]

    # Posterior covariance C_post = (C_0^{-1} + J_s)^{-1}
    inv_C0 = evecs_0 @ np.diag(1.0 / evals_0) @ evecs_0.T
    inv_Cpost = inv_C0 + J_arr
    inv_Cpost_sym = 0.5 * (inv_Cpost + inv_Cpost.T)
    C_post = scipy.linalg.inv(inv_Cpost_sym)
    C_post_sym = 0.5 * (C_post + C_post.T)

    v_prior = None
    v_post = None
    delta_v = None
    share = None

    if target_w is not None:
        w = np.asarray(target_w, dtype=float)
        v_prior = float(w.T @ C0_sym @ w)
        v_post = float(w.T @ C_post_sym @ w)
        delta_v = float(max(0.0, v_prior - v_post))
        share = float(delta_v / v_prior) if v_prior > 1e-14 else 0.0

    note = (
        f"Relative eigenvalues C_0^(1/2) J_s C_0^(1/2) range from "
        f"{rel_evals_sorted[-1]:.3e} to {rel_evals_sorted[0]:.3e}."
    )
    if share is not None:
        note += f" Direct measurement accounts for {share:.1%} of target variance reduction."

    return BorrowedPrecisionDecomposition(
        relative_eigenvalues=rel_evals_sorted,
        prior_target_variance=v_prior,
        posterior_target_variance=v_post,
        variance_reduction=delta_v,
        direct_information_share=share,
        direct_evidence_eigenvalues=direct_evals_sorted,
        note=note,
    )


def evaluate_cone_membership(
    loadings: np.ndarray,
    target_w: np.ndarray | Sequence[float],
    tol: float = 1e-6,
) -> ConeMembershipResult:
    """Tests whether target direction target_w lies in cone{a_1, ..., a_B}.

    Reference: proposal §9.1 & §9.2.
    Solves min_{q >= 0} ||A^T q - w||_2^2 using Non-Negative Least Squares.
    If outside cone, constructs Farkas separating vector d such that Ad >= 0 and w^T d < 0.
    """
    A = np.asarray(loadings, dtype=float)
    if A.ndim != 2:
        raise ValueError(f"loadings must be a 2D array (B, K), got ndim={A.ndim}")
    b_rows, k_cols = A.shape
    w = np.asarray(target_w, dtype=float)
    if w.shape != (k_cols,):
        raise ValueError(f"target_w length {w.shape} != loading dimensions {k_cols}")

    caveats = [
        "Cone membership is an idealized noiseless property (A d >= 0 => w^T d >= 0).",
        "It does not account for measurement uncertainty, estimated loadings, or benchmark residuals.",
        "Strict dominance requires a positive margin and posterior credible probability, not just cone inclusion.",
        "Target outside cone proves shared-benchmark leads do not guarantee target superiority.",
    ]

    if b_rows == 0:
        return ConeMembershipResult(
            in_cone=False,
            residual_norm=float(np.linalg.norm(w)),
            cone_weights=[],
            separating_vector=[-float(x) for x in w],
            projections_on_separating_vector=[],
            target_projection_on_separating_vector=float(-np.dot(w, w)),
            caveats=caveats,
        )

    # Solve min_{q >= 0} ||A^T q - w||_2^2
    # scipy.optimize.nnls solves min ||M x - y||_2 with x >= 0
    # Here M = A^T of shape (K, B), x = q of shape (B,), y = w of shape (K,)
    q_opt, residual_norm = scipy.optimize.nnls(A.T, w)
    norm_w = float(np.linalg.norm(w))
    rel_residual = float(residual_norm / norm_w) if norm_w > 1e-12 else float(residual_norm)

    in_cone = rel_residual <= tol or float(residual_norm) <= tol

    if in_cone:
        return ConeMembershipResult(
            in_cone=True,
            residual_norm=float(residual_norm),
            cone_weights=[float(x) for x in q_opt],
            separating_vector=None,
            projections_on_separating_vector=None,
            target_projection_on_separating_vector=None,
            caveats=caveats,
        )

    # If outside cone, construct Farkas certificate:
    # d = A^T q* - w
    # A d = A (A^T q* - w) >= 0 (by KKT)
    # w^T d = - ||A^T q* - w||^2 < 0
    d = A.T @ q_opt - w
    d_norm = float(np.linalg.norm(d))
    if d_norm > 1e-14:
        d = d / d_norm

    ad_projections = A @ d
    target_proj = float(np.dot(w, d))

    return ConeMembershipResult(
        in_cone=False,
        residual_norm=float(residual_norm),
        cone_weights=[float(x) for x in q_opt],
        separating_vector=[float(x) for x in d],
        projections_on_separating_vector=[float(x) for x in ad_projections],
        target_projection_on_separating_vector=target_proj,
        caveats=caveats,
    )


def paired_draw_comparison(
    draws_a: np.ndarray | Sequence[float],
    draws_b: np.ndarray | Sequence[float],
    margin: float = 1.0,
    threshold: float = 0.90,
) -> PairedDrawComparisonResult:
    """Evaluates practical comparison between two systems using paired posterior draws.

    Reference: proposal §12:
    P_hat_u(A > B + 1) = (1/S) sum_{j=1}^S 1[I_Au^{(j)} - I_Bu^{(j)} > 1].
    Rule: A leads if P_hat >= 0.90; B leads if reverse >= 0.90; otherwise 'unresolved'.
    Neither direction passing does NOT imply equivalence.
    """
    a = np.asarray(draws_a, dtype=float)
    b = np.asarray(draws_b, dtype=float)
    if a.ndim != 1 or b.ndim != 1:
        raise ValueError("draws_a and draws_b must be 1D arrays of posterior draws")
    if a.shape[0] != b.shape[0]:
        raise ValueError(f"Draw count mismatch: len(a)={a.shape[0]} != len(b)={b.shape[0]}")
    s = a.shape[0]
    if s == 0:
        raise ValueError("Draw arrays cannot be empty")
    if not np.all(np.isfinite(a)) or not np.all(np.isfinite(b)):
        raise ValueError("Draw arrays contain non-finite values (NaN or Inf)")

    diff = a - b
    p_a_beats_b_margin = float(np.mean(diff > margin))
    p_b_beats_a_margin = float(np.mean(diff < -margin))
    p_directional_a_beats_b = float(np.mean(diff > 0.0))

    if p_a_beats_b_margin >= threshold:
        status = "A_leads"
        note = f"System A leads by at least {margin} point(s) with probability {p_a_beats_b_margin:.3f} >= {threshold}."
    elif p_b_beats_a_margin >= threshold:
        status = "B_leads"
        note = f"System B leads by at least {margin} point(s) with probability {p_b_beats_a_margin:.3f} >= {threshold}."
    else:
        status = "unresolved"
        note = (
            f"Comparison unresolved at practical margin {margin} and threshold {threshold} "
            f"(P(A>B+{margin})={p_a_beats_b_margin:.3f}, P(B>A+{margin})={p_b_beats_a_margin:.3f}). "
            f"Neither direction passing does NOT imply practical or statistical equivalence."
        )

    return PairedDrawComparisonResult(
        probability_a_beats_b_plus_margin=p_a_beats_b_margin,
        probability_b_beats_a_plus_margin=p_b_beats_a_margin,
        directional_probability_a_beats_b=p_directional_a_beats_b,
        margin=float(margin),
        threshold=float(threshold),
        status=status,
        draw_count=s,
        note=note,
    )


CONDITIONING_ASSUMPTIONS = [
    "linear_gaussian_local_approximation",
    "conditioned_on_point_measurement_parameters",
    "diagonal_residual_variance_assumption",
    "benchmark_count_not_target_task_mass",
    "not_representative_of_unseen_task_utility_space",
]


def partial_identification_bounds(
    d_observed: float,
    task_mass_q: float,
    is_task_mass_verified: bool = False,
    allow_unverified_task_mass: bool = False,
    sampling_se: float = 0.0,
) -> PartialIdentificationBoundsResult:
    """Computes partial identification bounds when unmeasured task mass is large.

    Reference: proposal §11:
    V(A) - V(B) in [d_O - (1 - q), d_O + (1 - q)].

    IMPORTANT: Requires actual verified target task probability mass q.
    Benchmark count divided by 19 is NOT q.
    """
    if not (0.0 <= task_mass_q <= 1.0):
        raise ValueError(f"Task mass q must be in [0, 1], got {task_mass_q}")
    if sampling_se < 0.0:
        raise ValueError(f"sampling_se must be non-negative, got {sampling_se}")

    audit_notes = []
    if not is_task_mass_verified:
        audit_notes.append(
            "WARNING: Task mass q has NOT been certified by an operational task-sampling definition. "
            "Existing benchmark datasets do not define an operational task utility space or target task mass. Raw benchmark count ratios (e.g. n/19) cannot be substituted for target probability mass q."
        )
        if not allow_unverified_task_mass:
            raise ValueError(
                "Partial identification bounds require verified target task mass Q. "
                "Benchmark count ratios are not target task mass. "
                "Pass allow_unverified_task_mass=True only for explicit exploratory sensitivity scenarios."
            )
    else:
        audit_notes.append("Task mass q is verified under declared operational task sampling measure Q.")

    unmeasured_mass = 1.0 - task_mass_q
    lower = float(d_observed - unmeasured_mass)
    upper = float(d_observed + unmeasured_mass)
    width = float(2.0 * unmeasured_mass)

    if sampling_se > 0.0:
        conf_lower = float(lower - 1.96 * sampling_se)
        conf_upper = float(upper + 1.96 * sampling_se)
        audit_notes.append(
            f"Added 95% sampling uncertainty (+/- 1.96 * {sampling_se:.4f}) to identification bounds."
        )
    else:
        conf_lower = None
        conf_upper = None

    return PartialIdentificationBoundsResult(
        observed_difference=float(d_observed),
        verified_task_mass_q=float(task_mass_q),
        lower_bound=lower,
        upper_bound=upper,
        bound_width=width,
        sampling_se=float(sampling_se),
        confidence_lower=conf_lower,
        confidence_upper=conf_upper,
        is_task_mass_verified=bool(is_task_mass_verified),
        audit_notes=audit_notes,
    )


def expected_variance_reduction(
    trait_covariance: np.ndarray,
    target_contrast: np.ndarray | Sequence[float],
    candidate_evaluations: Sequence[dict[str, Any]],
) -> list[EvaluationRankingItem]:
    """Ranks prospective evaluations by expected Gaussian target variance reduction.

    Reference: proposal §13: Delta V(a) = (h^T C a)^2 / (v + a^T C a).

    Args:
        trait_covariance: (K, K) joint covariance of latent traits.
        target_contrast: (K,) target comparison direction h.
        candidate_evaluations: list of dicts with keys:
            - "id": str
            - "loading": list[float] of length K
            - "variance": float > 0
            - "cost": optional float > 0

    Returns:
        Sorted list of EvaluationRankingItem ordered by descending variance_reduction.
    """
    C = validate_covariance_matrix(trait_covariance, name="trait_covariance")
    h = np.asarray(target_contrast, dtype=float)
    k = C.shape[0]
    if h.shape != (k,):
        raise ValueError(f"target_contrast shape {h.shape} != covariance dimension {k}")

    prior_variance = float(h.T @ C @ h)
    if prior_variance <= 1e-14:
        raise ValueError("Target contrast has zero prior variance")

    results: list[EvaluationRankingItem] = []
    for cand in candidate_evaluations:
        cand_id = str(cand["id"])
        a = np.asarray(cand["loading"], dtype=float)
        if a.shape != (k,):
            raise ValueError(f"Candidate {cand_id} loading shape {a.shape} != dimension {k}")
        v = float(cand["variance"])
        if v <= 0.0 or not np.isfinite(v):
            raise ValueError(f"Candidate {cand_id} variance must be positive and finite, got {v}")
        cost = float(cand["cost"]) if "cost" in cand and cand["cost"] is not None else None

        h_C_a = float(h.T @ C @ a)
        a_C_a = float(a.T @ C @ a)
        denom = v + a_C_a
        delta_v = (h_C_a ** 2) / denom if denom > 1e-14 else 0.0
        post_v = max(0.0, prior_variance - delta_v)
        frac = delta_v / prior_variance
        efficiency = (delta_v / cost) if cost is not None and cost > 0 else None

        results.append(
            EvaluationRankingItem(
                candidate_id=cand_id,
                loading_vector=[float(x) for x in a],
                observation_variance=v,
                variance_reduction=float(delta_v),
                posterior_variance=float(post_v),
                fractional_reduction=float(frac),
                cost=cost,
                efficiency=efficiency,
            )
        )

    results.sort(key=lambda item: item.variance_reduction, reverse=True)
    return results

# Prevent pytest from treating imported evaluate_cone_membership or module as test
check_cone_membership = evaluate_cone_membership
test_cone_membership = evaluate_cone_membership
setattr(test_cone_membership, "__test__", False)
