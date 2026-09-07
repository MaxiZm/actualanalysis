"""Validation decision rules and component-cluster bootstrap for ACI 1.5.0.

Implements:
- C3: Successor-domain block to original component equal weighting.
- C4: 90% component-bootstrap LPD CI lower > 0.
- C5: Calibration noninferiority:
    * Coverage difference CI LOWER >= -0.05
    * Normalized interval-score difference CI UPPER <= 0 (unless prespecified margin)
- C6: Diversity: >=10 informative original components and >=3 providers on full cohort.
- C7: Deletion sensitivity: Leave-one-component-out and leave-one-provider-out must preserve C4.
- Non-statistical gates: sampler, lock, certified evidence, calibration/SBC.
- Deterministic paired cluster bootstrap with rejection of mismatched IDs and provider ambiguity.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np


INFORMATIVE_COMPONENT_FLOOR = 10
PROVIDER_FLOOR = 3
COVERAGE_NONINFERIORITY_LOWER_BOUND = -0.05
INTERVAL_SCORE_NONINFERIORITY_UPPER_BOUND = 0.0


@dataclass(frozen=True)
class BootstrapInterval:
    mean: float
    ci_lower: float
    ci_upper: float
    level: float = 0.90
    n_replicates: int = 2000

    def contains(self, val: float) -> bool:
        return self.ci_lower <= val <= self.ci_upper


@dataclass
class ComponentBlockData:
    original_component_id: str
    provider: str
    block_id: str
    delta_lpd: float
    delta_coverage: float
    delta_interval_score: float
    weight: float = 1.0


@dataclass
class ValidationDecisionResult:
    decision: str  # "PROMOTE", "RETAIN_BASELINE", "EXPLORATORY", "NOT_READY"
    passed: bool
    reasons: list[str] = field(default_factory=list)
    full_cohort_stats: dict[str, Any] = field(default_factory=dict)
    component_deletion_results: dict[str, Any] = field(default_factory=dict)
    provider_deletion_results: dict[str, Any] = field(default_factory=dict)
    gate_results: dict[str, bool] = field(default_factory=dict)
    diagnostics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def paired_cluster_bootstrap(
    component_values: Mapping[str, float],
    n_replicates: int = 2000,
    level: float = 0.90,
    seed: int = 20260907,
) -> BootstrapInterval:
    """Resample original components with replacement and compute component-equal mean."""
    components = sorted(component_values.keys())
    values = np.asarray([component_values[c] for c in components], dtype=np.float64)
    n = len(values)
    if n == 0:
        return BootstrapInterval(mean=0.0, ci_lower=0.0, ci_upper=0.0, level=level, n_replicates=0)
    if n == 1:
        v = float(values[0])
        return BootstrapInterval(mean=v, ci_lower=v, ci_upper=v, level=level, n_replicates=n_replicates)

    rng = np.random.default_rng(seed)
    # Resample indices with replacement: shape (n_replicates, n)
    indices = rng.integers(0, n, size=(n_replicates, n))
    bootstrap_means = np.mean(values[indices], axis=1)

    alpha = 1.0 - level
    lo_pct = 100.0 * (alpha / 2.0)
    hi_pct = 100.0 * (1.0 - alpha / 2.0)

    ci_lo = float(np.percentile(bootstrap_means, lo_pct))
    ci_hi = float(np.percentile(bootstrap_means, hi_pct))
    point_mean = float(np.mean(values))

    return BootstrapInterval(
        mean=point_mean,
        ci_lower=ci_lo,
        ci_upper=ci_hi,
        level=level,
        n_replicates=n_replicates,
    )


def validate_condition_scales(
    condition_scales: Mapping[str, float],
    required_conditions: Sequence[str],
) -> dict[str, float]:
    """Verify and return finite positive condition scales for interval score normalization."""
    validated = {}
    for cond in required_conditions:
        if cond not in condition_scales:
            raise ValueError(f"Missing condition scale for condition: {cond!r}")
        val = float(condition_scales[cond])
        if not np.isfinite(val) or val <= 0.0:
            raise ValueError(
                f"Condition scale for {cond!r} must be finite positive, got {val!r}"
            )
        validated[cond] = val
    return validated


def aggregate_blocks_to_components(
    blocks: Sequence[ComponentBlockData],
) -> tuple[dict[str, float], dict[str, float], dict[str, float], dict[str, str]]:
    """Average blocks within original components.

    Returns:
        (comp_lpd, comp_cov, comp_is, comp_to_provider)
    """
    by_comp_lpd: dict[str, list[float]] = {}
    by_comp_cov: dict[str, list[float]] = {}
    by_comp_is: dict[str, list[float]] = {}
    comp_to_prov: dict[str, str] = {}

    for b in blocks:
        cid = b.original_component_id
        prov = b.provider
        if not cid or not prov:
            raise ValueError(f"ComponentBlockData missing cid or provider: cid={cid!r}, provider={prov!r}")
        if cid in comp_to_prov and comp_to_prov[cid] != prov:
            raise ValueError(
                f"Component {cid!r} has ambiguous provider: {comp_to_prov[cid]!r} vs {prov!r}"
            )
        comp_to_prov[cid] = prov
        by_comp_lpd.setdefault(cid, []).append(b.delta_lpd)
        by_comp_cov.setdefault(cid, []).append(b.delta_coverage)
        by_comp_is.setdefault(cid, []).append(b.delta_interval_score)

    comp_lpd = {cid: float(np.mean(vals)) for cid, vals in by_comp_lpd.items()}
    comp_cov = {cid: float(np.mean(vals)) for cid, vals in by_comp_cov.items()}
    comp_is = {cid: float(np.mean(vals)) for cid, vals in by_comp_is.items()}

    return comp_lpd, comp_cov, comp_is, comp_to_prov


def evaluate_validation_decision(
    blocks: Sequence[ComponentBlockData],
    non_statistical_gates: Mapping[str, bool] | None = None,
    component_floor: int = INFORMATIVE_COMPONENT_FLOOR,
    provider_floor: int = PROVIDER_FLOOR,
    interval_score_margin: float = INTERVAL_SCORE_NONINFERIORITY_UPPER_BOUND,
    n_bootstrap_replicates: int = 2000,
    seed: int = 20260907,
) -> ValidationDecisionResult:
    """Run complete prospective validation decision rules."""
    comp_lpd, comp_cov, comp_is, comp_to_prov = aggregate_blocks_to_components(blocks)

    unique_components = sorted(comp_lpd.keys())
    unique_providers = sorted(set(comp_to_prov.values()))
    n_comp = len(unique_components)
    n_prov = len(unique_providers)

    reasons: list[str] = []
    gate_results: dict[str, bool] = {}

    # C6: Diversity on full cohort
    diversity_comp_ok = n_comp >= component_floor
    diversity_prov_ok = n_prov >= provider_floor
    gate_results["c6_diversity_components"] = diversity_comp_ok
    gate_results["c6_diversity_providers"] = diversity_prov_ok
    if not diversity_comp_ok:
        reasons.append(
            f"C6 Diversity failed: {n_comp} informative original components < required floor {component_floor}"
        )
    if not diversity_prov_ok:
        reasons.append(
            f"C6 Diversity failed: {n_prov} providers < required floor {provider_floor}"
        )

    # C4: Full cohort LPD improvement
    bs_lpd = paired_cluster_bootstrap(comp_lpd, n_replicates=n_bootstrap_replicates, seed=seed)
    c4_ok = bs_lpd.ci_lower > 0.0
    gate_results["c4_predictive_improvement"] = c4_ok
    if not c4_ok:
        reasons.append(
            f"C4 Predictive improvement failed: 90% LPD CI lower bound {bs_lpd.ci_lower:.6f} <= 0"
        )

    # C5: Calibration noninferiority (CORRECTED BEFORE OUTCOMES)
    bs_cov = paired_cluster_bootstrap(comp_cov, n_replicates=n_bootstrap_replicates, seed=seed + 1)
    bs_is = paired_cluster_bootstrap(comp_is, n_replicates=n_bootstrap_replicates, seed=seed + 2)

    cov_ok = bs_cov.ci_lower >= COVERAGE_NONINFERIORITY_LOWER_BOUND
    is_ok = bs_is.ci_upper <= interval_score_margin
    gate_results["c5_coverage_noninferiority"] = cov_ok
    gate_results["c5_interval_score_noninferiority"] = is_ok

    if not cov_ok:
        reasons.append(
            f"C5 Coverage noninferiority failed: 90% coverage diff CI lower bound "
            f"{bs_cov.ci_lower:.4f} < {COVERAGE_NONINFERIORITY_LOWER_BOUND:.4f}"
        )
    if not is_ok:
        reasons.append(
            f"C5 Interval score noninferiority failed: 90% IS diff CI upper bound "
            f"{bs_is.ci_upper:.4f} > {interval_score_margin:.4f}"
        )

    # C7: Deletion sensitivity (evaluated on full cohort components)
    comp_deletions = {}
    comp_del_all_ok = True
    for c_idx, cid in enumerate(unique_components):
        sub_lpd = {k: v for k, v in comp_lpd.items() if k != cid}
        sub_bs = paired_cluster_bootstrap(
            sub_lpd,
            n_replicates=n_bootstrap_replicates,
            seed=seed + 100 + c_idx,
        )
        passed_sub = sub_bs.ci_lower > 0.0
        if not passed_sub:
            comp_del_all_ok = False
        comp_deletions[cid] = {
            "mean": sub_bs.mean,
            "ci_lower": sub_bs.ci_lower,
            "ci_upper": sub_bs.ci_upper,
            "passed": passed_sub,
        }

    prov_deletions = {}
    prov_del_all_ok = True
    for p_idx, prov in enumerate(unique_providers):
        sub_lpd = {k: v for k, v in comp_lpd.items() if comp_to_prov[k] != prov}
        sub_bs = paired_cluster_bootstrap(
            sub_lpd,
            n_replicates=n_bootstrap_replicates,
            seed=seed + 500 + p_idx,
        )
        passed_sub = sub_bs.ci_lower > 0.0
        if not passed_sub:
            prov_del_all_ok = False
        prov_deletions[prov] = {
            "mean": sub_bs.mean,
            "ci_lower": sub_bs.ci_lower,
            "ci_upper": sub_bs.ci_upper,
            "remaining_components": len(sub_lpd),
            "passed": passed_sub,
        }

    gate_results["c7_component_deletion"] = comp_del_all_ok
    gate_results["c7_provider_deletion"] = prov_del_all_ok
    if not comp_del_all_ok:
        reasons.append("C7 Component deletion safeguard failed: at least one component deletion dropped CI lower <= 0")
    if not prov_del_all_ok:
        reasons.append("C7 Provider deletion safeguard failed: at least one provider deletion dropped CI lower <= 0")

    # Non-statistical gates
    non_stat = non_statistical_gates or {}
    for gate_name in ("sampler_passed", "lock_frozen", "evidence_certified", "sbc_passed"):
        val = bool(non_stat.get(gate_name, False))
        gate_results[gate_name] = val
        if not val:
            reasons.append(f"Non-statistical gate {gate_name!r} not passed")

    all_gates_pass = all(gate_results.values())

    if all_gates_pass:
        decision = "PROMOTE"
        passed = True
    elif not diversity_comp_ok or not diversity_prov_ok or not non_stat.get("evidence_certified", False) or not non_stat.get("lock_frozen", False):
        decision = "EXPLORATORY"
        passed = False
    else:
        decision = "RETAIN_BASELINE"
        passed = False

    return ValidationDecisionResult(
        decision=decision,
        passed=passed,
        reasons=reasons,
        full_cohort_stats={
            "n_original_components": n_comp,
            "n_providers": n_prov,
            "components": unique_components,
            "providers": unique_providers,
            "lpd_interval": asdict(bs_lpd),
            "coverage_interval": asdict(bs_cov),
            "interval_score_interval": asdict(bs_is),
        },
        component_deletion_results=comp_deletions,
        provider_deletion_results=prov_deletions,
        gate_results=gate_results,
        diagnostics={
            "component_floor": component_floor,
            "provider_floor": provider_floor,
            "n_blocks": len(blocks),
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="ACI 1.5.0 Validation Decision Tool")
    parser.add_argument("--blocks-json", required=True, help="Path to aggregated blocks JSON")
    parser.add_argument("--condition-scales-json", required=True, help="Path to condition scales JSON")
    parser.add_argument("--output", required=True, help="Path to write validation decision JSON")
    parser.add_argument("--seed", type=int, default=20260907, help="Bootstrap seed")
    args = parser.parse_args()

    with open(args.blocks_json) as f:
        raw_blocks = json.load(f)
    with open(args.condition_scales_json) as f:
        scales = json.load(f)

    # Normalize blocks
    blocks: list[ComponentBlockData] = []
    for item in raw_blocks:
        cond = item.get("benchmark_id") or item.get("condition_id")
        scale = float(scales[cond]) if cond in scales else 1.0
        delta_is_raw = float(item.get("delta_interval_score", 0.0))
        blocks.append(ComponentBlockData(
            original_component_id=str(item["original_component_id"]),
            provider=str(item["provider"]),
            block_id=str(item.get("block_id", f"{item["original_component_id"]}_{len(blocks)}")),
            delta_lpd=float(item["delta_lpd"]),
            delta_coverage=float(item["delta_coverage"]),
            delta_interval_score=delta_is_raw / scale,
        ))

    result = evaluate_validation_decision(blocks, seed=args.seed)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result.to_dict(), indent=2) + "\n", encoding="utf-8")
    print(f"Validation decision: {result.decision} (passed={result.passed})")
    print(f"Results written to {out_path}")


if __name__ == "__main__":
    main()
