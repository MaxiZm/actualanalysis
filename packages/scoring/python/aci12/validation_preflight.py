"""Metadata-only v1.5 validation preflight. No fit, no outcome-based cohort
selection, no class-relationship research, no promotion.

Implemented candidate at 08af628: restricted class prior, rho~Beta(1,1),
correlated LKJ traits vs nested independent baseline (rho=0/all-singleton).
Not the unimplemented random-walk A/B lock-draft siblings.

Insufficient registry or unlocked plan => NOTREADY. Floor is 10 eligible
certified components / 3 providers. Truthy strings are not booleans.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

from .class_prior import fitted_model_ids, production_export_issues, resolve_class_prior
from .experiment import (
    CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS,
    DEFAULT_DOMAIN_LOADING_THRESHOLD,
    DOMAIN_LOADING_THRESHOLD_SELECTION_RULE,
    NON_PUBLISHABLE_METADATA,
    PRIMARY_SCORING_RULE,
    TransferClassRegistry,
    base_model_id,
    build_family_index_name_map,
    validate_domain_loading_threshold,
)

PREFLIGHT_SCHEMA_VERSION = 1
INSPECTED_COMMIT = "08af628cef56df133f3c1804cb301762ad0ec1eb"
VERDICT_READY = "READY"
VERDICT_NOTREADY = "NOTREADY"

INFORMATIVE_ORIGINAL_COMPONENT_FLOOR = 10
PROVIDER_FLOOR = 3
DOMAIN_LOADING_THRESHOLD = DEFAULT_DOMAIN_LOADING_THRESHOLD

IMPLEMENTED_CANDIDATE_FAMILY = "restricted"
IMPLEMENTED_CANDIDATE_POOLING = {"kind": "beta", "alpha": 1.0, "beta": 1.0}
IMPLEMENTED_BASELINE_POOLING = {"kind": "fixed", "value": 0.0}
REQUIRED_TRAIT_STRUCTURE = "correlated"

HEURISTIC_PROVENANCE_MARKERS = (
    "unset", "heuristic", "provisional", "development-only", "development only",
    "conservative_gemini_development_exclusions", "conservative gemini",
)
ILLUSTRATIVE_EDITION_MARKERS = (
    "unreviewed-illustrative", "illustrative", "unreviewed-synthetic", "example",
)
LOCK_UNSET_TOKEN = "UNSET"
LOCK_DRAFT_UNSET_FIELDS = (
    "candidate_selected_for_confirmation", "historical_non_gemini_development_cohort",
    "documentation_only_edge_or_class_registry", "source_references_and_review_timestamps",
    "original_documented_component_ids", "depth_truncated_model_forest",
    "motivating_component_exclusion_manifest", "prospective_confirmation_outcomes",
    "training_target_calibration_manifests", "input_and_mask_hashes",
    "prior_predictive_report", "selected_scale_values", "candidate_scale_search_history",
    "eligible_successor_domain_block_manifest", "availability_based_selection_rule_and_sample_size",
    "prospective_prediction_cutoffs", "numerical_predictive_improvement_rule",
    "calibration_noninferiority_tolerances", "component_cluster_uncertainty_method",
    "repeated_mask_handling", "precision_power_report", "final_operating_floor_confirmation",
    "deletion_sensitivity_decision_rules", "simulation_design", "sampler_implementation_revision",
    "run_settings_seeds_probability_mcse", "validated_publication_policy",
)
CANDIDATE_CHOICE = {
    "implemented_candidate": "restricted class prior; global rho ~ Beta(1,1); correlated LKJ traits with unchanged marginals versus independent baseline",
    "implemented_baseline": "nested independent-release prior: class_prior disabled, or pooling kind=fixed value=0 (rho=0 / all-singleton); same correlated traits, likelihood, and effort priors",
    "old_lock_draft_candidates": "unimplemented related-release random-walk siblings A (dimensionless root-SD change scale) and B (raw-unit edge scale); candidate selected UNSET",
    "not_this_candidate": "Do not treat the 2026-09-06 related-release lock draft A/B roster as the confirmatory candidate. Those siblings are proposal-only.",
}


def is_json_true(value: Any) -> bool:
    """Actual JSON true only. Strings, 1, 'yes', 'true' do not pass."""
    return value is True


def json_true_issue(value: Any, path: str) -> str | None:
    if is_json_true(value):
        return None
    return (
        f"{path} requires actual JSON true; "
        f"{type(value).__name__}={value!r} is rejected (no truthy-string bypass)"
    )


def is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip()) and value.strip().upper() != LOCK_UNSET_TOKEN


def _repo_root() -> Path:
    start = Path(__file__).resolve()
    for parent in [start.parent, *start.parents]:
        if (parent / "docs" / "proposals").is_dir() and (parent / "packages" / "scoring").is_dir():
            return parent
    return start.parents[3]


def default_lock_path() -> Path | None:
    path = _repo_root() / "docs" / "proposals" / "aci-1.5.0-related-release-experiment-lock.md"
    return path if path.is_file() else None


STRICT_CLASS_KEYS = frozenset({
    "class_id",
    "member_models",
    "derivation_evidence",
    "reference_configuration_compatibility",
    "is_singleton",
    "notes",
})
CERTIFIED_REVIEW_STATUSES = frozenset({
    "certified",
    "fully-reviewed-compatible",
    "configuration-compatible-certified",
})


@dataclass(frozen=True)
class GateResult:
    id: str
    passed: bool
    summary: str
    issues: tuple[str, ...] = ()
    details: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "passed": self.passed,
            "summary": self.summary,
            "issues": list(self.issues),
            "details": dict(self.details),
        }


def _gate(gate_id: str, issues: Sequence[str], summary_ok: str, details: dict[str, Any] | None = None) -> GateResult:
    cleaned = tuple(str(item) for item in issues if item)
    passed = len(cleaned) == 0
    return GateResult(
        id=gate_id,
        passed=passed,
        summary=summary_ok if passed else f"{gate_id} failed ({len(cleaned)} issue(s))",
        issues=cleaned,
        details=details or {},
    )


def observed_release_ids(input_data: dict[str, Any] | None) -> list[str]:
    if not input_data:
        return []
    return [base_model_id(item) for item in fitted_model_ids(input_data)]


def excluded_release_ids(
    exclusion_metadata: dict[str, Any] | None,
    *,
    allow_heuristic: bool = True,
) -> set[str]:
    if exclusion_metadata and isinstance(exclusion_metadata.get("member_models"), (list, tuple, set)):
        return {base_model_id(str(item)) for item in exclusion_metadata["member_models"]}
    if allow_heuristic:
        return set(CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS)
    return set()


def identify_family_closure_targets(
    input_data: dict[str, Any],
    target_domain: str,
    domain_loading_threshold: float = DOMAIN_LOADING_THRESHOLD,
) -> dict[str, Any]:
    """Availability geometry only: loadings, family indexes, condition ids.

    Same identification as repaired experiment.prepare: loading >= threshold,
    then family closure of every condition in those families. Does not read y/x.
    """
    threshold = validate_domain_loading_threshold(domain_loading_threshold)
    domains = list(input_data.get(
        "domains",
        ["agentic", "software-code", "reasoning", "knowledge-information", "communication-professional"],
    ))
    if target_domain not in domains:
        raise ValueError(f"target_domain '{target_domain}' not in domains {domains}")
    domain_idx = domains.index(target_domain)
    benchmark_ids = list(input_data["benchmark_ids"])
    family_ids = [str(item) for item in input_data["benchmark_family_ids"]]
    family_index = [int(item) for item in input_data["benchmark_family_index"]]
    loadings = input_data["benchmark_domains"]
    if len(loadings) != len(benchmark_ids):
        raise ValueError("benchmark_domains must have one loading row per condition")
    family_index_to_name = build_family_index_name_map(family_ids, family_index)
    target_benchmark_indices = {
        idx
        for idx in range(len(benchmark_ids))
        if float(loadings[idx][domain_idx]) >= threshold
    }
    target_family_indices = {family_index[idx] for idx in target_benchmark_indices}
    closed_benchmark_indices = {
        idx for idx, fam in enumerate(family_index) if fam in target_family_indices
    }
    return {
        "target_domain": target_domain,
        "domain_loading_threshold": threshold,
        "target_benchmark_indices": sorted(target_benchmark_indices),
        "closed_benchmark_indices": sorted(closed_benchmark_indices),
        "primary_condition_ids": [benchmark_ids[idx] for idx in sorted(target_benchmark_indices)],
        "family_closure_condition_ids": [
            benchmark_ids[idx]
            for idx in sorted(closed_benchmark_indices)
            if idx not in target_benchmark_indices
        ],
        "held_out_family_names": sorted(family_index_to_name[idx] for idx in target_family_indices),
        "selection_rule": DOMAIN_LOADING_THRESHOLD_SELECTION_RULE,
        "primary_scoring_rule": PRIMARY_SCORING_RULE,
    }


def _presence_rows(input_data: dict[str, Any]) -> list[tuple[int, int, str]]:
    """Observation presence as (system_index, benchmark_index, model_id). Never reads y/x."""
    system_ids = list(input_data["system_ids"])
    rows: list[tuple[int, int, str]] = []
    for obs in input_data.get("observations", []):
        if not isinstance(obs, dict):
            continue
        sys_idx = int(obs["system_index"])
        bench_idx = int(obs["benchmark_index"])
        rows.append((sys_idx, bench_idx, base_model_id(system_ids[sys_idx])))
    return rows


def availability_successor_domain_blocks(
    input_data: dict[str, Any],
    excluded_model_ids: Iterable[str] = (),
    domain_loading_threshold: float = DOMAIN_LOADING_THRESHOLD,
) -> list[dict[str, Any]]:
    """Successor-domain blocks from row presence only. Does not read y/x."""
    excluded = {base_model_id(item) for item in excluded_model_ids}
    domains = list(input_data.get(
        "domains",
        ["agentic", "software-code", "reasoning", "knowledge-information", "communication-professional"],
    ))
    presence = _presence_rows(input_data)
    by_model: dict[str, list[tuple[int, int]]] = {}
    for sys_idx, bench_idx, model_id in presence:
        if model_id in excluded:
            continue
        by_model.setdefault(model_id, []).append((sys_idx, bench_idx))

    blocks: list[dict[str, Any]] = []
    for domain in domains:
        geometry = identify_family_closure_targets(input_data, domain, domain_loading_threshold)
        primary = set(geometry["target_benchmark_indices"])
        closed = set(geometry["closed_benchmark_indices"])
        if not primary:
            continue
        for model_id, pairs in sorted(by_model.items()):
            primary_rows = sum(1 for _, bench in pairs if bench in primary)
            closure_rows = sum(1 for _, bench in pairs if bench in closed and bench not in primary)
            parent_rows = sum(1 for _, bench in pairs if bench not in closed)
            if primary_rows <= 0:
                continue
            blocks.append({
                "model_id": model_id,
                "target_domain": domain,
                "n_primary_observation_rows": primary_rows,
                "n_family_closure_observation_rows": closure_rows,
                "n_retained_parent_observation_rows": parent_rows,
                "has_target_outcome_availability": True,
                "has_successor_parent_evidence": parent_rows > 0,
                "primary_condition_ids": list(geometry["primary_condition_ids"]),
                "family_closure_condition_ids": list(geometry["family_closure_condition_ids"]),
                "held_out_family_names": list(geometry["held_out_family_names"]),
                "domain_loading_threshold": geometry["domain_loading_threshold"],
            })
    return blocks


def _class_records(registry: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    """Strict TransferClass fields only. Extra keys are ignored, not canonical provenance."""
    records: list[dict[str, Any]] = []
    extra: list[str] = []
    for raw in registry.get("classes", []):
        if not isinstance(raw, dict):
            continue
        unexpected = sorted(key for key in raw if key not in STRICT_CLASS_KEYS)
        if unexpected:
            extra.append(f"{raw.get('class_id')}: {unexpected}")
        members_raw = raw.get("member_models") or []
        records.append({
            "class_id": str(raw.get("class_id") or "").strip(),
            "member_models": [base_model_id(str(item)) for item in members_raw],
            "is_singleton": bool(raw.get("is_singleton")),
        })
    return records, extra


def _iter_component_values(raw: Any) -> tuple[list[dict[str, Any]], list[str]]:
    """Normalize metadata.components as a list or as a dict of component objects.

    Dict keys are never original_component_id. Identity is read only from each
    value's original_component_id field. Non-object values are skipped and
    reported (fail closed).
    """
    skipped: list[str] = []
    if raw is None:
        return [], []
    if isinstance(raw, list):
        records: list[dict[str, Any]] = []
        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                skipped.append(
                    f"metadata.components[{index}] is {type(item).__name__}={item!r}; "
                    "skipped (fail closed)"
                )
                continue
            records.append(item)
        return records, skipped
    if isinstance(raw, dict):
        records = []
        for key, item in raw.items():
            if not isinstance(item, dict):
                skipped.append(
                    f"metadata.components[{key!r}] value is {type(item).__name__}={item!r}; "
                    "skipped (fail closed; dict keys are not original_component_id)"
                )
                continue
            records.append(item)
        return records, skipped
    skipped.append(
        f"metadata.components is {type(raw).__name__}={raw!r}, not a list or an "
        "object of component records; skipped (fail closed)"
    )
    return [], skipped


def _canonical_components(registry: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    """Original-component provenance lives only on registry.metadata.components."""
    metadata = registry.get("metadata") if isinstance(registry.get("metadata"), dict) else {}
    items, skipped = _iter_component_values(metadata.get("components"))
    declared: list[dict[str, Any]] = []
    for item in items:
        cid = item.get("original_component_id")
        provider = item.get("provider")
        members = [base_model_id(str(m)) for m in (item.get("member_models") or [])]
        declared.append({
            "original_component_id": str(cid).strip() if is_nonempty_str(cid) else None,
            "provider": str(provider).strip() if is_nonempty_str(provider) else None,
            "member_models": members,
            "review_status": str(item.get("review_status") or "").strip(),
            "fully_compatible_reviewed_class": item.get("fully_compatible_reviewed_class"),
            "config_compatibility_status": str(item.get("config_compatibility_status") or "").strip(),
            "relationship_supported": item.get("relationship_supported"),
            "sources": item.get("sources") if isinstance(item.get("sources"), list) else [],
        })
    return declared, skipped


def _component_is_certified(row: dict[str, Any], registry_reviewed: bool) -> bool:
    """Certified config-compatible class. Does not infer certification from flags or @max-common."""
    if not registry_reviewed:
        return False
    status = str(row.get("review_status") or "").strip().lower()
    config = str(row.get("config_compatibility_status") or "").strip().lower()
    if "unresolved" in status or config in {"unresolved", "max-common-only", "max_common_only"}:
        return False
    if row.get("fully_compatible_reviewed_class") is False:
        return False
    return is_json_true(row.get("fully_compatible_reviewed_class")) or status in CERTIFIED_REVIEW_STATUSES


def _unique_ids_and_providers(rows: Sequence[dict[str, Any]]) -> tuple[list[str], list[str]]:
    ids: list[str] = []
    providers: list[str] = []
    seen_ids: set[str] = set()
    seen_providers: set[str] = set()
    for row in rows:
        cid = row.get("original_component_id")
        provider = row.get("provider")
        if cid and cid not in seen_ids:
            seen_ids.add(cid)
            ids.append(cid)
        if provider and provider not in seen_providers:
            seen_providers.add(provider)
            providers.append(provider)
    return ids, providers


def inspect_class_registry(
    registry: dict[str, Any] | None,
    observed_ids: Sequence[str],
    excluded_ids: Iterable[str],
    availability_blocks: Sequence[dict[str, Any]],
) -> GateResult:
    issues: list[str] = []
    details: dict[str, Any] = {
        "registry_supplied": registry is not None,
        "edition": None,
        "real_reviewed_classes_exist": False,
        "confirmatory_criteria_locked": False,
        "canonical_provenance": "metadata.components",
        "max_common_label_is_not_matched_settings": True,
        "flags_not_forced": True,
        "n_declared_classes": 0,
        "n_observed_non_gemini_multi_member_classes": 0,
        "n_fake_or_unobserved_members": 0,
        "n_candidate_components": 0,
        "n_candidate_providers": 0,
        "n_informative_original_components": 0,
        "n_informative_providers": 0,
        "n_eligible_reviewed_classes": 0,
        "n_eligible_providers": 0,
        "candidate_component_ids": [],
        "candidate_providers": [],
        "informative_original_component_ids": [],
        "informative_providers": [],
        "eligible_component_ids": [],
        "eligible_providers": [],
        "floor_components": INFORMATIVE_ORIGINAL_COMPONENT_FLOOR,
        "floor_providers": PROVIDER_FLOOR,
        "cannot_count_arbitrary_partitions_as_independent": True,
        "candidate_upper_bound_is_not_eligible_count": True,
        "component_identity_not_inferred_from_dict_keys": True,
        "n_skipped_invalid_component_values": 0,
        "skipped_invalid_component_values": [],
    }
    if registry is None:
        issues.append(
            "Class registry was not supplied. Accept a reviewed registry JSON via "
            "--registry (external research-worker output). Do not use a private "
            "agent path. The illustrative unreviewed example is not a substitute."
        )
        return _gate("class_registry", issues, "reviewed class registry present", details)

    edition = str(registry.get("edition") or "")
    details["edition"] = edition
    metadata = registry.get("metadata") if isinstance(registry.get("metadata"), dict) else {}
    reviewed_issue = json_true_issue(metadata.get("real_reviewed_classes_exist"), "metadata.real_reviewed_classes_exist")
    locked_issue = json_true_issue(metadata.get("confirmatory_criteria_locked"), "metadata.confirmatory_criteria_locked")
    registry_reviewed = reviewed_issue is None
    if reviewed_issue:
        issues.append(reviewed_issue)
    else:
        details["real_reviewed_classes_exist"] = True
    if locked_issue:
        issues.append(locked_issue)
    else:
        details["confirmatory_criteria_locked"] = True
    if any(marker in edition.lower() for marker in ILLUSTRATIVE_EDITION_MARKERS):
        issues.append(
            f"Registry edition {edition!r} is illustrative/unreviewed and cannot "
            "support confirmatory class identity."
        )
    if registry.get("original_components") or registry.get("originalComponents"):
        details["noncanonical_top_level_original_components_ignored"] = True

    try:
        parsed = TransferClassRegistry.from_dict(registry)
        validation = parsed.validate(known_models=list(observed_ids) or None)
        details["registry_schema_valid"] = bool(validation.get("valid"))
        details["registry_frozen_hash"] = validation.get("frozen_hash")
        if not validation.get("valid"):
            issues.extend(str(item) for item in validation.get("issues", []))
    except (TypeError, ValueError, KeyError) as exc:
        issues.append(f"Registry failed to parse as TransferClassRegistry: {exc}")
        details["registry_schema_valid"] = False

    observed = {base_model_id(item) for item in observed_ids}
    excluded = {base_model_id(item) for item in excluded_ids}
    classes, extra_keys = _class_records(registry)
    details["n_declared_classes"] = len(classes)
    details["ignored_noncanonical_class_keys"] = extra_keys
    fake_members: list[str] = []
    multi_observed = 0
    for row in classes:
        unused = [m for m in row["member_models"] if m not in observed]
        non_gemini = [m for m in row["member_models"] if m in observed and m not in excluded]
        fake_members.extend(unused)
        if unused:
            issues.append(
                f"Class {row['class_id']!r} lists unobserved/fake members {unused}; "
                "only fitted non-Gemini releases count."
            )
        if len(non_gemini) >= 2 and not row["is_singleton"]:
            multi_observed += 1
    details["n_observed_non_gemini_multi_member_classes"] = multi_observed
    details["n_fake_or_unobserved_members"] = len(fake_members)
    details["fake_or_unobserved_members"] = sorted(set(fake_members))

    components, skipped_components = _canonical_components(registry)
    details["n_declared_original_components"] = sum(1 for c in components if c.get("original_component_id"))
    details["n_skipped_invalid_component_values"] = len(skipped_components)
    details["skipped_invalid_component_values"] = list(skipped_components)
    if skipped_components:
        issues.extend(skipped_components)
    if not components:
        issues.append(
            "Canonical original-component provenance is registry.metadata.components "
            "(original_component_id, provider, member_models, source refs, review_status). "
            "Per-class extra keys and top-level original_components are not canonical. "
            "A dict of component objects is accepted by value; dict keys are not identity."
        )

    blocks_by_model: dict[str, list[dict[str, Any]]] = {}
    for block in availability_blocks:
        blocks_by_model.setdefault(block["model_id"], []).append(block)

    candidate_rows: list[dict[str, Any]] = []
    informative: list[dict[str, Any]] = []
    eligible: list[dict[str, Any]] = []
    for component in components:
        cid = component.get("original_component_id")
        provider = component.get("provider")
        members = [m for m in component.get("member_models", []) if m in observed and m not in excluded]
        if not cid:
            continue
        if not provider:
            issues.append(
                f"metadata.components {cid!r} has no declared provider; providers "
                "are not inferred from names or brand terms."
            )
            continue
        row = {
            "original_component_id": cid,
            "provider": provider,
            "observed_non_gemini_members": members,
            "review_status": component.get("review_status"),
            "n_sources": len(component.get("sources") or []),
        }
        candidate_rows.append(row)
        if len(members) < 2:
            continue
        n_blocks = 0
        for model_id in members:
            for block in blocks_by_model.get(model_id, []):
                parent_ok = block["has_successor_parent_evidence"] or any(other != model_id for other in members)
                if block["has_target_outcome_availability"] and parent_ok:
                    n_blocks += 1
        if n_blocks == 0:
            continue
        info = {**row, "n_availability_blocks": n_blocks}
        informative.append(info)
        if _component_is_certified(component, registry_reviewed):
            eligible.append(info)

    cand_ids, cand_providers = _unique_ids_and_providers(candidate_rows)
    info_ids, info_providers = _unique_ids_and_providers(informative)
    elig_ids, elig_providers = _unique_ids_and_providers(eligible)
    details.update({
        "n_candidate_components": len(cand_ids),
        "n_candidate_providers": len(cand_providers),
        "candidate_component_ids": cand_ids,
        "candidate_providers": cand_providers,
        "n_informative_original_components": len(info_ids),
        "n_informative_providers": len(info_providers),
        "informative_original_component_ids": info_ids,
        "informative_providers": info_providers,
        "informative_components": informative,
        "n_eligible_reviewed_classes": len(elig_ids),
        "n_eligible_providers": len(elig_providers),
        "eligible_component_ids": elig_ids,
        "eligible_providers": elig_providers,
    })

    if len(elig_ids) < INFORMATIVE_ORIGINAL_COMPONENT_FLOOR:
        issues.append(
            f"Eligible certified configuration-compatible classes {len(elig_ids)} < "
            f"required floor {INFORMATIVE_ORIGINAL_COMPONENT_FLOOR}. Candidate "
            f"relationship-supported upper bound is {len(cand_ids)} components / "
            f"{len(cand_providers)} providers and is not the eligible count. "
            "Informative availability-qualified components are also not certified. "
            "@max-common labels are not matched settings. The floor cannot be relaxed."
        )
    if len(elig_providers) < PROVIDER_FLOOR:
        issues.append(
            f"Eligible certified providers {len(elig_providers)} < required floor "
            f"{PROVIDER_FLOOR} (candidate providers {len(cand_providers)} are not the eligible count)."
        )
    return _gate("class_registry", issues, "reviewed registry meets identity and 10/3 floors", details)


def inspect_availability_blocks(
    input_data: dict[str, Any] | None,
    excluded_ids: Iterable[str],
) -> GateResult:
    issues: list[str] = []
    details: dict[str, Any] = {
        "input_supplied": input_data is not None,
        "domain_loading_threshold": DOMAIN_LOADING_THRESHOLD,
        "reads_outcomes_for_selection": False,
        "n_blocks": 0,
        "n_blocks_with_parent_evidence": 0,
        "selection_rule": DOMAIN_LOADING_THRESHOLD_SELECTION_RULE,
        "primary_scoring_rule": PRIMARY_SCORING_RULE,
    }
    if input_data is None:
        issues.append(
            "Fitted input JSON was not supplied (--input). Availability-based "
            "successor-domain family-closure blocks cannot be counted."
        )
        return _gate("availability_family_closure_blocks", issues, "availability blocks inventoried", details)
    blocks = availability_successor_domain_blocks(input_data, excluded_ids)
    details["n_blocks"] = len(blocks)
    details["n_blocks_with_parent_evidence"] = sum(1 for b in blocks if b["has_successor_parent_evidence"])
    details["blocks_by_domain"] = {}
    for block in blocks:
        domain = block["target_domain"]
        details["blocks_by_domain"].setdefault(domain, 0)
        details["blocks_by_domain"][domain] += 1
    if len(blocks) == 0:
        issues.append(
            "No availability-based successor-domain blocks at loading "
            f">={DOMAIN_LOADING_THRESHOLD} after family closure."
        )
    return _gate(
        "availability_family_closure_blocks",
        issues,
        "availability-based >=0.25 family-closure blocks inventoried without reading y/x",
        details,
    )


def inspect_lock_and_selection(
    lock_payload: dict[str, Any] | str | None,
    plan_payload: dict[str, Any] | str | None,
    manifest: dict[str, Any] | None,
) -> GateResult:
    issues: list[str] = []
    details: dict[str, Any] = {
        "lock_supplied": lock_payload is not None,
        "plan_supplied": plan_payload is not None,
        "manifest_supplied": manifest is not None,
        "lock_status": "missing",
        "plan_locked": False,
        "manifest_frozen": False,
        "candidate_matches_implemented_restricted_class_prior": False,
        "unset_fields": list(LOCK_DRAFT_UNSET_FIELDS),
        "old_draft_random_walk_mismatch": False,
    }
    if lock_payload is None:
        issues.append(
            "Declared experiment lock is missing. The 2026-09-06 related-release "
            "lock draft is DRAFT/NOT LOCKED and targets unimplemented A/B siblings."
        )
    elif isinstance(lock_payload, str):
        text = lock_payload
        unset_hits = len(re.findall(r"\bUNSET\b", text))
        draft = "NOT LOCKED" in text or re.search(r"Status:\*\*\s*DRAFT", text) is not None
        random_walk = (
            "Development sibling" in text
            or "Effective raw edge scale" in text
            or "random-walk" in text.lower()
            or "predecessor" in text.lower()
        )
        restricted_lock = (
            "restricted class prior" in text.lower()
            and "beta(1,1)" in text.lower().replace(" ", "")
        )
        details["lock_status"] = "draft_unlocked" if draft or unset_hits else "unstructured_text"
        details["markdown_unset_token_count"] = unset_hits
        details["old_draft_random_walk_mismatch"] = bool(random_walk and not restricted_lock)
        if draft or unset_hits:
            issues.append(
                f"Lock record is not complete ({unset_hits} UNSET token(s); draft={draft}). "
                "A hash without filled decisions is not a complete lock."
            )
        if details["old_draft_random_walk_mismatch"]:
            issues.append(
                "Lock draft describes unimplemented random-walk siblings A/B, not "
                "the implemented restricted class-prior rho~Beta(1,1) candidate. "
                "A new lock for the implemented candidate is required."
            )
        if not restricted_lock:
            details["candidate_matches_implemented_restricted_class_prior"] = False
            issues.append(
                "Lock does not select the implemented restricted class-prior candidate."
            )
    else:
        locked_issue = json_true_issue(lock_payload.get("locked"), "lock.locked")
        if locked_issue:
            issues.append(locked_issue)
            details["lock_status"] = "unlocked"
        else:
            details["lock_status"] = "locked"
        family = lock_payload.get("candidate_family") or lock_payload.get("candidate")
        pooling = lock_payload.get("candidate_pooling") or {}
        if family != IMPLEMENTED_CANDIDATE_FAMILY:
            issues.append(
                f"Locked candidate_family {family!r} is not the implemented "
                f"{IMPLEMENTED_CANDIDATE_FAMILY!r} class prior."
            )
        else:
            details["candidate_matches_implemented_restricted_class_prior"] = (
                pooling.get("kind") == "beta"
                and float(pooling.get("alpha", 0)) == 1.0
                and float(pooling.get("beta", 0)) == 1.0
            )
            if not details["candidate_matches_implemented_restricted_class_prior"]:
                issues.append(
                    f"Locked pooling {pooling!r} is not Beta(1,1)."
                )
        unset = [
            key for key, value in lock_payload.items()
            if isinstance(value, str) and value.strip().upper() == LOCK_UNSET_TOKEN
        ]
        details["unset_fields"] = unset
        if unset:
            issues.append(f"Lock JSON still contains UNSET fields: {unset}")

    if plan_payload is None:
        issues.append(
            "Candidate validation plan is not supplied as a locked JSON record. "
            "Markdown proposals are not a complete lock."
        )
    elif isinstance(plan_payload, str):
        if "NOT LOCKED" in plan_payload or "PROPOSED" in plan_payload:
            issues.append(
                "Validation plan text is proposed/not locked. Confirmation cannot open."
            )
        details["plan_locked"] = False
    else:
        plan_issue = json_true_issue(plan_payload.get("locked"), "plan.locked")
        if plan_issue:
            issues.append(plan_issue)
        else:
            details["plan_locked"] = True
        if plan_payload.get("informative_component_floor") not in (None, INFORMATIVE_ORIGINAL_COMPONENT_FLOOR):
            issues.append(
                "Plan attempts to change the 10-component floor; relaxation is forbidden."
            )
        if plan_payload.get("provider_floor") not in (None, PROVIDER_FLOOR):
            issues.append(
                "Plan attempts to change the 3-provider floor; relaxation is forbidden."
            )

    if manifest is None:
        issues.append(
            "Frozen experiment manifest (train/eval hashes, selection rule, "
            "threshold, primary scoring rule) is missing."
        )
    else:
        required = (
            "train_data_hash",
            "eval_spec_hash",
            "domain_loading_threshold",
            "primary_scoring_rule",
            "domain_loading_threshold_selection_rule",
        )
        missing = [key for key in required if not manifest.get(key)]
        if missing:
            issues.append(f"Manifest missing frozen fields {missing}.")
        else:
            details["manifest_frozen"] = True
        if manifest.get("domain_loading_threshold") != DOMAIN_LOADING_THRESHOLD:
            issues.append(
                f"Manifest domain_loading_threshold {manifest.get('domain_loading_threshold')!r} "
                f"!= required {DOMAIN_LOADING_THRESHOLD}."
            )
        if is_json_true(manifest.get("is_publishable")):
            issues.append(
                "Manifest marks is_publishable true; experimental preflight cannot "
                "clear publication guards."
            )
    return _gate("frozen_lock_and_selection", issues, "lock, plan, and manifest frozen", details)


def inspect_exclusion_provenance(exclusion_metadata: dict[str, Any] | None) -> GateResult:
    issues: list[str] = []
    details: dict[str, Any] = {
        "supplied": exclusion_metadata is not None,
        "confirmatory_certified": False,
        "heuristic_development_superset_insufficient": True,
        "n_members": 0,
    }
    if exclusion_metadata is None:
        issues.append(
            "Confirmation exclusion metadata with provenance is missing. The "
            "CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS heuristic cannot be used "
            "for confirmatory training, scoring, or hyperprior tuning."
        )
        return _gate("confirmation_exclusion_provenance", issues, "certified exclusion provenance present", details)
    provenance = exclusion_metadata.get("provenance")
    members = exclusion_metadata.get("member_models")
    if not is_nonempty_str(provenance):
        issues.append(
            "exclusion metadata provenance must be a non-empty string, not UNSET/heuristic."
        )
    else:
        lowered = provenance.strip().lower()
        if any(marker in lowered for marker in HEURISTIC_PROVENANCE_MARKERS):
            issues.append(
                f"Provenance {provenance!r} is a development heuristic and is not "
                "certified for confirmation."
            )
    if not isinstance(members, (list, tuple)) or not members:
        issues.append("exclusion metadata member_models must be a non-empty list of release ids.")
    else:
        details["n_members"] = len(members)
        if any(not is_nonempty_str(item) for item in members):
            issues.append("exclusion member_models must be non-empty strings.")
    certified_issue = json_true_issue(
        exclusion_metadata.get("confirmatory_certified"),
        "exclusion_metadata.confirmatory_certified",
    )
    if certified_issue:
        issues.append(certified_issue)
    else:
        details["confirmatory_certified"] = True
    return _gate("confirmation_exclusion_provenance", issues, "caller-supplied certified exclusion provenance", details)


def inspect_comparable_settings(
    input_data: dict[str, Any] | None,
    candidate_spec: dict[str, Any] | None,
    baseline_spec: dict[str, Any] | None,
) -> GateResult:
    issues: list[str] = []
    candidate = dict(candidate_spec or {})
    baseline = dict(baseline_spec or {})
    details: dict[str, Any] = {
        "required_trait_structure": REQUIRED_TRAIT_STRUCTURE,
        "candidate_family": IMPLEMENTED_CANDIDATE_FAMILY,
        "candidate_pooling": dict(IMPLEMENTED_CANDIDATE_POOLING),
        "baseline_pooling": dict(IMPLEMENTED_BASELINE_POOLING),
        "likelihood": "production_aci12_model_py",
        "effort_prior": "production_signed_standard_maximum",
        "unchanged_marginals": True,
        "random_walk_siblings_are_not_the_candidate": True,
    }
    family = candidate.get("family", IMPLEMENTED_CANDIDATE_FAMILY)
    pooling = candidate.get("pooling", IMPLEMENTED_CANDIDATE_POOLING)
    trait = candidate.get("trait_structure", REQUIRED_TRAIT_STRUCTURE)
    if family != IMPLEMENTED_CANDIDATE_FAMILY:
        issues.append(
            f"Candidate family {family!r} is not the implemented restricted class prior."
        )
    if pooling != IMPLEMENTED_CANDIDATE_POOLING and not (
        pooling.get("kind") == "beta"
        and float(pooling.get("alpha", 0)) == 1.0
        and float(pooling.get("beta", 0)) == 1.0
    ):
        issues.append(f"Candidate pooling {pooling!r} is not Beta(1,1).")
    if trait != REQUIRED_TRAIT_STRUCTURE:
        issues.append(
            f"Candidate trait_structure {trait!r} must remain {REQUIRED_TRAIT_STRUCTURE} "
            "(unchanged production marginals). correlated_unit/general_specific are rejected."
        )
    base_pool = baseline.get("pooling", IMPLEMENTED_BASELINE_POOLING)
    base_enabled = baseline.get("enabled")
    nested = (
        base_enabled is False
        or (
            isinstance(base_pool, dict)
            and base_pool.get("kind") == "fixed"
            and float(base_pool.get("value", -1)) == 0.0
        )
    )
    if not nested:
        issues.append(
            f"Baseline {baseline!r} is not the nested independent rho=0 / disabled prior."
        )
    if candidate.get("family") in {"random_walk", "predecessor", "related_release_A", "related_release_B"}:
        issues.append("Unimplemented random-walk siblings cannot be the confirmatory candidate.")
    if input_data is not None:
        structure = input_data.get("trait_structure", REQUIRED_TRAIT_STRUCTURE)
        if input_data.get("one_trait_baseline"):
            issues.append("Input one_trait_baseline is incompatible with the restricted class prior.")
        if structure != REQUIRED_TRAIT_STRUCTURE:
            issues.append(
                f"Input trait_structure {structure!r} is not {REQUIRED_TRAIT_STRUCTURE}."
            )
        raw_prior = input_data.get("class_prior")
        if raw_prior is not None:
            spec = resolve_class_prior(input_data)
            if spec.enabled and spec.family != IMPLEMENTED_CANDIDATE_FAMILY:
                issues.append("Input class_prior.family is not restricted.")
            if spec.enabled and spec.pooling_kind == "beta":
                if float(spec.beta_alpha or 0) != 1.0 or float(spec.beta_beta or 0) != 1.0:
                    issues.append("Input class_prior beta hyperparameters are not (1,1).")
        export_issues = production_export_issues(
            {**input_data, "class_prior": {
                "enabled": True,
                "family": "restricted",
                "edition": "preflight-guard",
                "pooling": {"kind": "beta", "alpha": 1, "beta": 1},
                "partition": [],
            }}
        )
        if not export_issues:
            issues.append(
                "production_export_issues did not flag an enabled class prior; "
                "nonpublishable guards must remain."
            )
        details["production_export_issues_on_enabled_prior"] = export_issues
    return _gate(
        "comparable_measurement_settings",
        issues,
        "baseline/candidate share correlated traits, production likelihood, and nested rho=0 vs Beta(1,1)",
        details,
    )


def inspect_predictive_workflow(
    calibration_results: dict[str, Any] | None = None,
    expected_design_hash: str | None = None,
) -> GateResult:
    predictive_evaluator_ok = False
    calibration_sbc_ok = False
    validation_decision_ok = False
    try:
        from .predictive_evaluator import ProductionPredictiveEvaluator
        predictive_evaluator_ok = True
    except ImportError:
        pass

    try:
        from .calibration_sbc import generate_synthetic_dataset, analyze_sbc_results
        calibration_sbc_ok = True
    except ImportError:
        pass

    try:
        from .validation_decision import evaluate_validation_decision
        validation_decision_ok = True
    except ImportError:
        pass

    details: dict[str, Any] = {
        "production_likelihood_implemented": True,
        "production_likelihood_module": "aci12.model.aci_model",
        "production_families": ["obs_normal", "a_single", "a_total", "a_exact"],
        "predictive_evaluator_implemented": predictive_evaluator_ok,
        "calibration_sbc_implemented": calibration_sbc_ok,
        "validation_decision_implemented": validation_decision_ok,
        "paired_joint_production_predictive_scorer": predictive_evaluator_ok,
        "prior_predictive_workflow": calibration_sbc_ok,
        "simulation_based_calibration_workflow": False,
        "calibration_status": "MISSING",
    }

    issues: list[str] = []
    if not predictive_evaluator_ok:
        issues.append("ProductionPredictiveEvaluator module is missing or cannot be imported.")
    if not calibration_sbc_ok:
        issues.append("Calibration SBC module is missing or cannot be imported.")
    if not validation_decision_ok:
        issues.append("Validation decision module is missing or cannot be imported.")

    if calibration_results is None:
        issues.append(
            "A production-faithful paired joint predictive scorer and empirical calibration "
            "are required on family-disjoint successor-domain groups. "
            "Do not treat validate_predictive.py as automatically production-faithful or "
            "code existence alone as proof of calibrated fit."
        )
        issues.append(
            "Simulation-based calibration (SBC) has not been run to completion with verified "
            "rank uniformity and coverage on this design. Code implementation alone does not "
            "establish calibration readiness without schema-validated empirical calibration evidence."
        )
    else:
        details["calibration_status"] = "PROVIDED"
        res_design_hash = calibration_results.get("design_hash")
        details["calibration_design_hash"] = res_design_hash
        details["expected_design_hash"] = expected_design_hash
        n_reps = int(calibration_results.get("n_replications", 0))
        details["calibration_replications"] = n_reps
        is_smoke = bool(calibration_results.get("is_smoke", False))
        details["calibration_is_smoke"] = is_smoke
        sbc_passed = bool(calibration_results.get("passed", False))

        if is_smoke or n_reps < 50:
            issues.append(
                f"Calibration evidence is smoke-only or has insufficient replications ({n_reps} < 50 floor). "
                "Confirmatory calibration requires >= 50 replications."
            )
        elif expected_design_hash and res_design_hash != expected_design_hash:
            issues.append(
                f"Calibration design hash mismatch: result has {res_design_hash!r}, "
                f"expected {expected_design_hash!r} from input design."
            )
        elif not sbc_passed:
            issues.append(
                f"Simulation-based calibration failed quality criteria: {calibration_results.get('reasons', ['Unknown failure'])}"
            )
        else:
            details["simulation_based_calibration_workflow"] = True
            details["calibration_status"] = "PASSED"

    return _gate(
        "predictive_calibration_workflow",
        issues,
        "production-faithful paired predictive and calibration workflows available",
        details,
    )



def inspect_nonpublishable_guards() -> GateResult:
    details = {
        "nonpublishable_metadata": dict(NON_PUBLISHABLE_METADATA),
        "stripping_guards_to_export_forbidden": True,
        "production_export_issues_must_remain": True,
        "unit_tests_are_not_validation_success": True,
        "mcmc_convergence_is_not_validation_success": True,
        "two_classes_cannot_satisfy_component_floor": True,
    }
    issues: list[str] = []
    if is_json_true(NON_PUBLISHABLE_METADATA.get("is_publishable")):
        issues.append("NON_PUBLISHABLE_METADATA.is_publishable is true; guards were stripped.")
    if is_json_true(NON_PUBLISHABLE_METADATA.get("confirmatory_criteria_locked")):
        issues.append(
            "NON_PUBLISHABLE_METADATA.confirmatory_criteria_locked is true in code; "
            "criteria are not locked at 08af628."
        )
    if is_json_true(NON_PUBLISHABLE_METADATA.get("real_reviewed_classes_exist")):
        issues.append("NON_PUBLISHABLE_METADATA.real_reviewed_classes_exist is true; they do not.")
    return _gate("nonpublishable_guards", issues, "nonpublishable guards retained", details)


def combine_verdict(gates: Sequence[GateResult]) -> str:
    return VERDICT_READY if gates and all(gate.passed for gate in gates) else VERDICT_NOTREADY


def implemented_vs_missing() -> dict[str, Any]:
    return {
        "implemented_at_08af628": [
            "Restricted class prior rho~Beta(1,1) and nested rho=0 baseline on correlated LKJ traits",
            "production_export_issues blocks publication; family-disjoint 0.25 holdouts; registry schema freeze",
            "validate_predictive.py interpolation CV (transformed-normal approx; not this experiment's scorer)",
            "Unit tests of implementation behavior, not confirmatory success",
        ],
        "not_implemented": [
            "Random-walk A/B; certified config-compatible classes; complete lock for this candidate",
            "Certified exclusion provenance; production-faithful paired joint predictive score",
            "Prior-predictive, precision/power, SBC, leave-one-component/provider confirmation",
        ],
        "do_not_claim_success_from": [
            "unit tests", "MCMC convergence alone", "two classes or a 5/2 candidate upper bound",
            "JSON booleans", "validate_predictive.py transformed-normal scores",
        ],
    }


def run_preflight(
    *,
    input_data: dict[str, Any] | None = None,
    registry: dict[str, Any] | None = None,
    lock_payload: dict[str, Any] | str | None = None,
    plan_payload: dict[str, Any] | str | None = None,
    manifest: dict[str, Any] | None = None,
    exclusion_metadata: dict[str, Any] | None = None,
    candidate_spec: dict[str, Any] | None = None,
    baseline_spec: dict[str, Any] | None = None,
    calibration_results: dict[str, Any] | None = None,
    inspected_commit: str = INSPECTED_COMMIT,
) -> dict[str, Any]:
    observed = observed_release_ids(input_data)
    excluded = excluded_release_ids(exclusion_metadata, allow_heuristic=True)
    blocks = availability_successor_domain_blocks(input_data, excluded) if input_data else []

    expected_design_hash = None
    if input_data:
        try:
            from .calibration_sbc import compute_design_hash
            expected_design_hash = compute_design_hash(input_data)
        except Exception:
            pass

    gates = [
        inspect_class_registry(registry, observed, excluded, blocks),
        inspect_availability_blocks(input_data, excluded),
        inspect_lock_and_selection(lock_payload, plan_payload, manifest),
        inspect_exclusion_provenance(exclusion_metadata),
        inspect_comparable_settings(input_data, candidate_spec, baseline_spec),
        inspect_predictive_workflow(
            calibration_results=calibration_results,
            expected_design_hash=expected_design_hash,
        ),
        inspect_nonpublishable_guards(),
    ]
    verdict = combine_verdict(gates)
    missing = [issue for gate in gates if not gate.passed for issue in gate.issues]
    registry_gate = gates[0]
    lock_gate = gates[2]
    fit_authorized = verdict == VERDICT_READY
    reasons_no_fit = []
    if not registry_gate.passed:
        reasons_no_fit.append("class registry insufficient")
    if not lock_gate.passed:
        reasons_no_fit.append("plan/lock unlocked")
    if not fit_authorized and not reasons_no_fit:
        reasons_no_fit.append("other preflight gates failed")

    report = {
        "schema_version": PREFLIGHT_SCHEMA_VERSION,
        "inspected_commit": inspected_commit,
        "verdict": verdict,
        "fit_authorized": fit_authorized,
        "promotion_authorized": False,
        "promotion_claim": "not_claimed",
        "strong_gate": (
            "If the class registry is insufficient or the plan is unlocked, do not fit "
            "and do not promote. Report NOTREADY and the missing requirements. Do not "
            "relax the 10-component / 3-provider floor."
        ),
        "candidate_choice": dict(CANDIDATE_CHOICE),
        "floors": {
            "informative_original_components": INFORMATIVE_ORIGINAL_COMPONENT_FLOOR,
            "providers": PROVIDER_FLOOR,
            "domain_loading_threshold": DOMAIN_LOADING_THRESHOLD,
            "relaxable": False,
        },
        "gates": [gate.as_dict() for gate in gates],
        "missing_prerequisites": missing,
        "no_fit_reasons": reasons_no_fit,
        "counts": _count_summary(registry_gate.details),
        "availability_block_count": len(blocks),
        "reads_outcomes_for_cohort_selection": False,
        "nonpublishable_guards_retained": True,
        "implemented_vs_missing": implemented_vs_missing(),
        "next_needed_input": _next_needed_input(gates, missing),
        "notes": [
            "This preflight is metadata-only. Passing unit tests is not validation success.",
            "MCMC convergence is not predictive validation.",
            "Two classes cannot satisfy the independent-component floor.",
            "validate_predictive.py is a transformed-normal approximation, not the production joint score.",
            "Do not strip production_export_issues or treat JSON booleans as certification.",
            "Candidate 5/2 upper bound is not eligible certified count 0.",
        ],
    }
    return report


def _count_summary(details: dict[str, Any]) -> dict[str, Any]:
    return {
        "candidate": {
            "components": int(details.get("n_candidate_components") or 0),
            "providers": int(details.get("n_candidate_providers") or 0),
            "ids": list(details.get("candidate_component_ids") or []),
            "provider_ids": list(details.get("candidate_providers") or []),
            "meaning": "Relationship-supported metadata.components upper bound; not the floor count",
        },
        "informative": {
            "components": int(details.get("n_informative_original_components") or 0),
            "providers": int(details.get("n_informative_providers") or 0),
            "ids": list(details.get("informative_original_component_ids") or []),
            "provider_ids": list(details.get("informative_providers") or []),
            "meaning": "Availability-qualified candidates; diagnostic only, not certified",
        },
        "eligible": {
            "components": int(details.get("n_eligible_reviewed_classes") or 0),
            "providers": int(details.get("n_eligible_providers") or 0),
            "ids": list(details.get("eligible_component_ids") or []),
            "provider_ids": list(details.get("eligible_providers") or []),
            "meaning": "Certified config-compatible classes; floor 10/3 applies here",
        },
        "floor": {
            "components": INFORMATIVE_ORIGINAL_COMPONENT_FLOOR,
            "providers": PROVIDER_FLOOR,
            "relaxable": False,
        },
    }


def _next_needed_input(gates: Sequence[GateResult], missing: Sequence[str]) -> list[str]:
    needed: list[str] = []
    by_id = {gate.id: gate for gate in gates}
    if not by_id["class_registry"].passed:
        needed.append(
            "Reviewed class-registry JSON via --registry with canonical "
            "metadata.components (original_component_id, provider, member_models, "
            "source refs, review_status), certified configuration-compatible classes "
            "meeting the 10/3 floor, and metadata.real_reviewed_classes_exist=true "
            "(JSON boolean; do not force). External research-worker output; not a "
            "private agent path."
        )
    if not by_id["availability_family_closure_blocks"].passed:
        needed.append(
            "Fitted ACI input JSON via --input so availability-based >=0.25 "
            "family-closure blocks can be inventoried without reading y/x."
        )
    if not by_id["frozen_lock_and_selection"].passed:
        needed.append(
            "Complete lock JSON for the implemented restricted class-prior candidate "
            "(not A/B random-walk), plus frozen prepare manifest and locked plan JSON."
        )
    if not by_id["confirmation_exclusion_provenance"].passed:
        needed.append(
            "Caller-supplied confirmatory exclusion metadata JSON with non-heuristic "
            "provenance, member_models, and confirmatory_certified=true (JSON boolean)."
        )
    if not by_id["predictive_calibration_workflow"].passed:
        needed.append(
            "After metadata gates pass: implement paired joint predictive scoring that "
            "reuses production likelihoods, then calibration/SBC. Do not start that "
            "workflow merely to bypass a missing registry."
        )
    if not needed and missing:
        needed.extend(missing)
    return needed


def _load_json_or_text(path: Path | None) -> dict[str, Any] | str | None:
    if path is None:
        return None
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        return json.loads(text)
    return text


def _load_json(path: Path | None) -> dict[str, Any] | None:
    payload = _load_json_or_text(path)
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return payload


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def format_verdict(report: dict[str, Any]) -> str:
    lines = [
        f"v1.5 validation preflight  commit={report['inspected_commit']}",
        f"VERDICT: {report['verdict']}",
        f"fit_authorized: {report['fit_authorized']}",
        f"promotion_authorized: {report['promotion_authorized']}",
        f"promotion_claim: {report['promotion_claim']}",
        "",
        "Candidate: " + report["candidate_choice"]["implemented_candidate"],
        "Baseline:  " + report["candidate_choice"]["implemented_baseline"],
        "Not used:  " + report["candidate_choice"]["old_lock_draft_candidates"],
        "",
        "Counts (candidate != informative != eligible):",
        f"  candidate {report['counts']['candidate']['components']}/{report['counts']['candidate']['providers']} (relationship-supported upper bound)",
        f"  informative {report['counts']['informative']['components']}/{report['counts']['informative']['providers']} (availability-qualified; not certified)",
        f"  eligible {report['counts']['eligible']['components']}/{report['counts']['eligible']['providers']} (certified config-compatible; floor applies)",
        f"  floor {report['counts']['floor']['components']}/{report['counts']['floor']['providers']} (not relaxable)",
        "",
        "Gates:",
    ]
    for gate in report["gates"]:
        mark = "PASS" if gate["passed"] else "FAIL"
        lines.append(f"  [{mark}] {gate['id']}: {gate['summary']}")
        for issue in gate["issues"]:
            lines.append(f"       - {issue}")
    lines.append("")
    lines.append(f"missing_prerequisites: {len(report['missing_prerequisites'])}")
    if report["no_fit_reasons"]:
        lines.append("no_fit: " + "; ".join(report["no_fit_reasons"]))
    lines.append("next_needed_input:")
    for item in report["next_needed_input"]:
        lines.append(f"  - {item}")
    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Metadata-only ACI 1.5.0 validation preflight")
    parser.add_argument("--input", type=Path, help="Fitted ACI input JSON (presence only)")
    parser.add_argument("--registry", type=Path, help="Class-registry JSON (research-worker output)")
    parser.add_argument("--lock", type=Path, help="Lock markdown or JSON")
    parser.add_argument("--plan", type=Path, help="Validation-plan markdown or JSON")
    parser.add_argument("--manifest", type=Path, help="Frozen prepare manifest JSON")
    parser.add_argument("--exclusion-metadata", type=Path, help="Confirmatory exclusion provenance JSON")
    parser.add_argument("--candidate-spec", type=Path, help="Candidate measurement-settings JSON")
    parser.add_argument("--baseline-spec", type=Path, help="Baseline measurement-settings JSON")
    parser.add_argument("--output", type=Path, help="Write JSON report")
    parser.add_argument("--no-default-lock", action="store_true", help="Do not auto-load the lock draft")
    parser.add_argument("--calibration-results", type=Path, help="Schema-validated calibration/SBC result JSON")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        input_data = _load_json(args.input)
        registry = _load_json(args.registry)
        lock_path = args.lock
        if lock_path is None and not args.no_default_lock:
            lock_path = default_lock_path()
        lock_payload = _load_json_or_text(lock_path)
        plan_payload = _load_json_or_text(args.plan)
        manifest = _load_json(args.manifest)
        exclusion_metadata = _load_json(args.exclusion_metadata)
        candidate_spec = _load_json(args.candidate_spec)
        baseline_spec = _load_json(args.baseline_spec)
        calibration_results = _load_json(args.calibration_results)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Error: failed to load preflight inputs: {exc}", file=sys.stderr)
        return 1

    report = run_preflight(
        input_data=input_data,
        registry=registry,
        lock_payload=lock_payload,
        plan_payload=plan_payload,
        manifest=manifest,
        exclusion_metadata=exclusion_metadata,
        candidate_spec=candidate_spec,
        baseline_spec=baseline_spec,
        calibration_results=calibration_results,
    )
    if args.output:
        write_report(args.output, report)
    print(format_verdict(report))
    return 0 if report["verdict"] == VERDICT_READY else 2


if __name__ == "__main__":
    sys.exit(main())
