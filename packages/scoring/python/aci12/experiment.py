"""ActualAnalysis 1.5.0 Reproducible Experiment Preparation & Candidate Tooling.

Implements typed experiment models, transfer-class registry validation with singleton fallback,
Grok class_prior contract integration, family-disjoint successor-domain holdouts removing ALL
source/effort rows, selective stress masks, documented Gemini connected component exclusions from
both training and confirmation scoring, frozen immutable hash verification, fail-closed candidate
execution, and CLI tooling.

Reference: docs/proposals/aci-1.5.0-measurement-spaces-and-classes.md
"""

from __future__ import annotations

import argparse
import copy
from dataclasses import asdict, dataclass, field
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from typing import Any, Sequence

import numpy as np

from .class_prior import resolve_class_prior
from .runner import DECLARED_PARAMETERS, run as run_model
from .geometry import (
    CONDITIONING_ASSUMPTIONS,
    analyze_information,
    compute_information_matrix,
    evaluate_cone_membership,
    expected_variance_reduction,
    paired_draw_comparison,
    partial_identification_bounds,
    target_support_diagnostic,
)

CONDITIONAL_IGNORABILITY_NOTICE = {
    "assumption": (
        "Missingness of benchmark evaluations is conditionally ignorable (MAR) "
        "given recorded system identities, benchmark conditions, source protocols, and dates."
    ),
    "falsification_risk": (
        "This assumption is NOT verifiable from observed data alone. If unobserved publication "
        "decisions depend on unfavorable outcomes, class borrowing will propagate selection optimism."
    ),
    "status": "explicitly_assumed_unverified",
}

NON_PUBLISHABLE_METADATA = {
    "is_experimental": True,
    "is_publishable": False,
    "confirmatory_criteria_locked": False,
    "real_reviewed_classes_exist": False,
    "notice": (
        "EXPERIMENTAL CANDIDATE ONLY. Do not use for production ranking or publication. "
        "Confirmatory promotion criteria are not locked, and reviewed capability-transfer "
        "classes have not been certified."
    ),
}

KNOWN_BRAND_TERMS = {
    "openai",
    "anthropic",
    "google",
    "meta",
    "deepseek",
    "mistral",
    "qwen",
    "alibaba",
    "xai",
    "cohere",
    "amazon",
    "microsoft",
}

# Provisional development-only exclusion superset.
# This is a conservative development heuristic grouping observed Gemini releases
# from Audit 1.4.2 / 1.4.3 for exploratory holdout isolation.
# It is NOT a certified component, NOT a documented lineage or ancestry registry,
# and CANNOT be used for confirmatory evaluation or hyperprior tuning.
CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS: frozenset[str] = frozenset({
    "gemini-1.5-pro",
    "gemini-2.0-flash-thinking",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-pro-20250325",
    "gemini-2.5-pro-20250506",
    "gemini-3-flash",
    "gemini-3-pro",
    "gemini-3.1-pro",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
})

# Backward compatibility alias
DOCUMENTED_GEMINI_MOTIVATING_COMPONENT_MODELS = CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS



def sanitize_for_strict_json(obj: Any) -> Any:
    """Recursively converts non-finite float values (NaN, Inf, -Inf) to None for strict RFC 8259 compliance."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_for_strict_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_for_strict_json(item) for item in obj]
    return obj


def strict_json_dumps(obj: Any, indent: int | None = 2) -> str:
    """Dumps strictly conforming JSON, replacing non-finite floats with null and enforcing allow_nan=False."""
    sanitized = sanitize_for_strict_json(obj)
    return json.dumps(sanitized, indent=indent, allow_nan=False)


# ---------------------------------------------------------------------------
# Typed Experiment Inputs
# ---------------------------------------------------------------------------

@dataclass
class SystemSpecification:
    """Explicit system specification preserving unresolved fields rather than guessing.

    Reference: proposal §14.1.
    """
    model_id: str
    inference_configuration: dict[str, Any] | None = None
    unresolved_fields: list[str] = field(default_factory=list)
    operating_target: str = "configured_performance"

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_id": self.model_id,
            "inference_configuration": copy.deepcopy(self.inference_configuration),
            "unresolved_fields": list(self.unresolved_fields),
            "operating_target": self.operating_target,
            **NON_PUBLISHABLE_METADATA,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SystemSpecification:
        return cls(
            model_id=str(data["model_id"]),
            inference_configuration=data.get("inference_configuration"),
            unresolved_fields=list(data.get("unresolved_fields", [])),
            operating_target=str(data.get("operating_target", "configured_performance")),
        )


@dataclass
class TaskPopulation:
    """Task population specification defining operational utility and sampling support."""
    population_id: str
    description: str
    domains: list[str]
    is_operational_utility: bool = False
    task_mass_q: float | None = None
    is_task_mass_certified: bool = False
    reference_urls: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "population_id": self.population_id,
            "description": self.description,
            "domains": list(self.domains),
            "is_operational_utility": self.is_operational_utility,
            "task_mass_q": self.task_mass_q,
            "is_task_mass_certified": self.is_task_mass_certified,
            "reference_urls": list(self.reference_urls),
            **NON_PUBLISHABLE_METADATA,
        }


@dataclass
class MeasurementSpecification:
    """Measurement specification capturing direct, proxy, and residual structures."""
    benchmark_id: str
    domain_loadings: dict[str, float]
    residual_variance: float
    is_count_likelihood: bool = True
    admission_metadata_complete: bool = True
    harness_revision: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "benchmark_id": self.benchmark_id,
            "domain_loadings": dict(self.domain_loadings),
            "residual_variance": float(self.residual_variance),
            "is_count_likelihood": self.is_count_likelihood,
            "admission_metadata_complete": self.admission_metadata_complete,
            "harness_revision": self.harness_revision,
            **NON_PUBLISHABLE_METADATA,
        }


# ---------------------------------------------------------------------------
# Transfer-Class Registry Validation & Schema
# ---------------------------------------------------------------------------

@dataclass
class TransferClass:
    """A transfer-class definition grouping model releases with documented shared capability transfer."""
    class_id: str
    member_models: list[str]
    derivation_evidence: str
    reference_configuration_compatibility: str
    is_singleton: bool = False
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "class_id": self.class_id,
            "member_models": list(self.member_models),
            "derivation_evidence": self.derivation_evidence,
            "reference_configuration_compatibility": self.reference_configuration_compatibility,
            "is_singleton": self.is_singleton,
            "notes": self.notes,
        }


@dataclass
class TransferClassRegistry:
    """Validated transfer-class registry with singleton fallback and immutable frozen hashing."""
    classes: list[TransferClass]
    edition: str = "unreviewed-illustrative-0.1"
    singleton_fallback: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)

    def compute_frozen_hash(self) -> str:
        """Computes deterministic SHA-256 hash over canonical sorted registry payload."""
        canonical_classes = [
            {
                "class_id": c.class_id,
                "derivation_evidence": c.derivation_evidence,
                "is_singleton": c.is_singleton,
                "member_models": sorted(c.member_models),
                "reference_configuration_compatibility": c.reference_configuration_compatibility,
            }
            for c in sorted(self.classes, key=lambda x: x.class_id)
        ]
        payload = {
            "classes": canonical_classes,
            "edition": self.edition,
            "singleton_fallback": self.singleton_fallback,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        return {
            "edition": self.edition,
            "singleton_fallback": self.singleton_fallback,
            "classes": [c.to_dict() for c in self.classes],
            "metadata": {
                **self.metadata,
                "frozen_hash": self.compute_frozen_hash(),
                **NON_PUBLISHABLE_METADATA,
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TransferClassRegistry:
        classes = [
            TransferClass(
                class_id=str(c["class_id"]),
                member_models=[str(m) for m in c["member_models"]],
                derivation_evidence=str(c.get("derivation_evidence", "")),
                reference_configuration_compatibility=str(
                    c.get("reference_configuration_compatibility", "")
                ),
                is_singleton=bool(c.get("is_singleton", False)),
                notes=c.get("notes"),
            )
            for c in data.get("classes", [])
        ]
        return cls(
            classes=classes,
            edition=str(data.get("edition", "unreviewed-illustrative-0.1")),
            singleton_fallback=bool(data.get("singleton_fallback", True)),
            metadata=dict(data.get("metadata", {})),
        )

    def validate(self, known_models: Sequence[str] | None = None) -> dict[str, Any]:
        """Validates partition properties, evidence, brand rejection, and singleton fallback."""
        issues: list[str] = []
        assigned_models: dict[str, str] = {}

        for tc in self.classes:
            cid = tc.class_id.strip()
            cid_lower = cid.lower()

            # Reject brand-as-class definitions without shared-weights evidence
            words = set(cid_lower.replace("-", " ").replace("_", " ").split())
            is_brand_only = any(brand in words for brand in KNOWN_BRAND_TERMS) or cid_lower in KNOWN_BRAND_TERMS
            evidence_lower = tc.derivation_evidence.lower()
            if is_brand_only and (
                "shared brand" in evidence_lower
                or not any(term in evidence_lower for term in ("architecture", "weights", "checkpoint", "lineage"))
            ):
                issues.append(
                    f"Class '{cid}' appears to be a guessed brand class without "
                    f"independent shared-checkpoint or weights derivation evidence."
                )

            # Check mutual exclusivity (partition property)
            for m in tc.member_models:
                m_clean = m.strip()
                if m_clean in assigned_models:
                    issues.append(
                        f"Partition violation: Model '{m_clean}' is assigned to multiple classes: "
                        f"'{assigned_models[m_clean]}' and '{cid}'."
                    )
                else:
                    assigned_models[m_clean] = cid

            # Evidence requirements for multi-member classes
            if len(tc.member_models) > 1 and not tc.is_singleton:
                if not tc.derivation_evidence or len(tc.derivation_evidence.strip()) < 10:
                    issues.append(
                        f"Multi-member class '{cid}' lacks required derivation evidence."
                    )
                if not tc.reference_configuration_compatibility:
                    issues.append(
                        f"Multi-member class '{cid}' lacks reference configuration compatibility description."
                    )

        # Singleton fallback check for unassigned models
        singletons_added: list[str] = []
        if known_models:
            for km in known_models:
                km_clean = km.strip()
                if km_clean not in assigned_models:
                    if self.singleton_fallback:
                        singletons_added.append(km_clean)
                    else:
                        issues.append(
                            f"Model '{km_clean}' is not assigned to any transfer class and singleton fallback is disabled."
                        )

        valid = len(issues) == 0
        return {
            "valid": valid,
            "issues": issues,
            "total_classes": len(self.classes),
            "multi_member_classes": sum(1 for c in self.classes if len(c.member_models) > 1 and not c.is_singleton),
            "assigned_model_count": len(assigned_models),
            "singletons_added": singletons_added,
            "frozen_hash": self.compute_frozen_hash(),
        }


def compute_canonical_data_hash(data: dict[str, Any]) -> str:
    """Compute deterministic SHA-256 hash of a dataset dict, ignoring volatile self-referential hash fields."""
    cleaned = {k: v for k, v in data.items() if k not in ("frozen_train_data_hash", "experiment_manifest")}
    sanitized = sanitize_for_strict_json(cleaned)
    canonical_bytes = json.dumps(sanitized, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(canonical_bytes).hexdigest()


# ---------------------------------------------------------------------------
# Grok Class Prior Integration Adapter
# ---------------------------------------------------------------------------

class ClassPriorAdapter:
    """Exact integration adapter for the Grok class_prior input contract.

    Grok class_prior contract specification:
    {
        "enabled": true,
        "family": "restricted",
        "edition": "<frozen edition id>",
        "pooling": {"kind": "beta", "alpha": 1.0, "beta": 1.0}
                 | {"kind": "fixed", "value": 0.0},
        "partition": [
            {"class_id": "<documented class>", "model_ids": ["<model_id>", ...]}
        ],
        "registry_sha256": "<frozen hash>",
        "notes": "<optional>"
    }
    """

    @staticmethod
    def build_grok_class_prior_payload(
        registry: TransferClassRegistry | dict[str, Any],
        pooling: dict[str, Any] | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Translates a TransferClassRegistry into the exact Grok class_prior input payload."""
        if isinstance(registry, dict):
            registry = TransferClassRegistry.from_dict(registry)

        clean_pooling: dict[str, Any]
        if pooling is None:
            clean_pooling = {"kind": "beta", "alpha": 1.0, "beta": 1.0}
        elif pooling.get("kind") == "beta":
            clean_pooling = {
                "kind": "beta",
                "alpha": float(pooling.get("alpha", 1.0)),
                "beta": float(pooling.get("beta", 1.0)),
            }
        elif pooling.get("kind") == "fixed":
            val = float(pooling.get("value", 0.0))
            if not (0.0 <= val < 1.0):
                raise ValueError(f"fixed pooling value must be in [0, 1), got {val}")
            clean_pooling = {"kind": "fixed", "value": val}
        else:
            raise ValueError(f"Unsupported pooling kind: {pooling.get('kind')}")

        # Build partition list:
        # 1. Multi-member classes only.
        # 2. Singletons are OMITTED from partition and handled by Grok's automatic singleton fallback.
        # 3. model_ids must have any system '@' suffix stripped.
        partition_items: list[dict[str, Any]] = []
        for tc in sorted(registry.classes, key=lambda x: x.class_id):
            if tc.is_singleton or tc.class_id.startswith("singleton:"):
                continue
            clean_models = [m.split("@")[0].strip() for m in tc.member_models]
            unique_models = sorted(set(clean_models))
            if len(unique_models) > 1:
                partition_items.append({
                    "class_id": tc.class_id.strip(),
                    "model_ids": unique_models,
                })

        payload: dict[str, Any] = {
            "enabled": True,
            "family": "restricted",
            "edition": str(registry.edition).strip(),
            "pooling": clean_pooling,
            "partition": partition_items,
            "registry_sha256": registry.compute_frozen_hash(),
            "notes": str(notes or "ActualAnalysis 1.5.0 experimental candidate class prior"),
        }

        # Direct validation against integrated Grok resolver
        dummy_data = {
            "n_models": 1,
            "system_ids": ["dummy@std"],
            "system_model_index": [0],
            "model_ids": ["dummy"],
            "class_prior": {
                **payload,
                "partition": [{"class_id": "dummy_class", "model_ids": ["dummy"]}],
            },
        }
        resolve_class_prior(dummy_data)

        return payload

    @staticmethod
    def inject_into_data(
        data: dict[str, Any],
        registry: TransferClassRegistry | dict[str, Any],
        pooling: dict[str, Any] | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Injects Grok class_prior contract into the input data dictionary."""
        updated = copy.deepcopy(data)
        updated["class_prior"] = ClassPriorAdapter.build_grok_class_prior_payload(
            registry=registry,
            pooling=pooling,
            notes=notes,
        )
        return updated


def is_gemini_component(
    model_id: str,
    custom_component_members: frozenset[str] | set[str] | Sequence[str] | None = None,
) -> bool:
    """Checks whether a model release belongs to the Gemini exclusion set.

    In development mode, falls back to CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS.
    For confirmatory evaluation, an explicit caller-supplied component metadata list is required.
    """
    clean_id = model_id.strip()
    if custom_component_members is not None:
        return clean_id in custom_component_members
    return clean_id in CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS


def prepare_holdout_experiment(
    input_data: dict[str, Any],
    target_successor_model: str,
    target_domain: str,
    registry: TransferClassRegistry | dict[str, Any] | None = None,
    stress_mask: str | None = None,  # "poor_outcome", "missing_domain", or None
    scenario: str | None = None,  # "omission", "wrong_class", or None
    exclude_gemini_from_confirmation: bool = True,
    gemini_component_metadata: dict[str, Any] | None = None,
    confirmatory: bool = False,
    seed: int = 42,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Prepares reproducible train/eval experiment datasets for class-prior evaluation.

    Reference: proposal §15.1, §15.2, §14.2.

    Key guarantees:
    1. Family-disjoint successor-domain holdouts removing ALL source/effort rows.
    2. Actual exclusion of connected Gemini component from BOTH training and confirmation scoring.
    3. Fails closed if target successor has 0 observations in target domain/families.
    4. Explicit conditional ignorability assumption notice.
    5. Frozen SHA-256 metadata hashes.
    6. Selective poor-outcome / missing-domain stress masks.
    7. Wrong-class / omission sensitivity scenarios.
    8. Clear non-publishable / experimental flags.

    Returns:
        (train_input, eval_spec, manifest)
    """
    train_data = copy.deepcopy(input_data)
    rng = np.random.default_rng(seed)

    domains = train_data.get(
        "domains",
        ["agentic", "software-code", "reasoning", "knowledge-information", "communication-professional"],
    )
    if target_domain not in domains:
        raise ValueError(f"target_domain '{target_domain}' not in domains {domains}")
    target_domain_idx = domains.index(target_domain)

    # Initial mapping of systems and models
    system_ids = list(train_data["system_ids"])
    system_model_index = list(train_data["system_model_index"])
    n_models = int(train_data["n_models"])

    model_id_map: dict[int, str] = {}
    for sys_id, m_idx in zip(system_ids, system_model_index):
        m_base = sys_id.split("@")[0].strip()
        model_id_map[int(m_idx)] = m_base

    model_names = [model_id_map.get(i, f"model_{i}") for i in range(n_models)]
    if target_successor_model not in model_names:
        raise ValueError(
            f"target_successor_model '{target_successor_model}' not found in models {model_names}"
        )

    # Identify benchmark conditions in target domain & their families
    benchmark_ids = list(train_data["benchmark_ids"])
    benchmark_family_ids = list(train_data["benchmark_family_ids"])
    benchmark_family_index = list(train_data["benchmark_family_index"])
    benchmark_domains = np.asarray(train_data["benchmark_domains"], dtype=float)

    # Benchmarks with primary loading on target domain
    target_benchmark_indices = set()
    for b_idx in range(len(benchmark_ids)):
        if benchmark_domains[b_idx, target_domain_idx] >= 0.5:
            target_benchmark_indices.add(b_idx)
        elif np.argmax(benchmark_domains[b_idx]) == target_domain_idx:
            target_benchmark_indices.add(b_idx)

    # Target families (family-disjoint rule)
    target_family_indices = {
        benchmark_family_index[b_idx] for b_idx in target_benchmark_indices
    }
    all_benchmarks_in_heldout_families = {
        b_idx
        for b_idx, fam_idx in enumerate(benchmark_family_index)
        if fam_idx in target_family_indices
    }

    # Identify all systems belonging to the target successor model
    target_system_indices = {
        sys_idx
        for sys_idx, s in enumerate(system_ids)
        if s.split("@")[0].strip() == target_successor_model
    }

    # Partition observations: hold out ALL rows for target successor in held-out families
    original_observations = list(train_data["observations"])
    retained_observations = []
    held_out_observations = []

    for obs in original_observations:
        s_idx = int(obs["system_index"])
        b_idx = int(obs["benchmark_index"])
        if s_idx in target_system_indices and b_idx in all_benchmarks_in_heldout_families:
            held_out_observations.append(obs)
        else:
            retained_observations.append(obs)

    # FAIL CLOSED: If target successor model has ZERO observations in target domain
    if len(held_out_observations) == 0:
        raise ValueError(
            f"Holdout preparation failed closed: target successor '{target_successor_model}' "
            f"has no observations in target domain '{target_domain}' (families: {[benchmark_family_ids[idx] for idx in target_family_indices]}). "
            f"Held-out observation count is 0."
        )

    # Record remaining cross-domain loadings for surviving successor observations
    remaining_cross_loadings: list[dict[str, Any]] = []
    for obs in retained_observations:
        s_idx = int(obs["system_index"])
        b_idx = int(obs["benchmark_index"])
        if s_idx in target_system_indices:
            loading = float(benchmark_domains[b_idx, target_domain_idx])
            if loading > 0.0:
                remaining_cross_loadings.append({
                    "system_id": system_ids[s_idx],
                    "benchmark_id": benchmark_ids[b_idx],
                    "domain_loading": loading,
                })

    # Apply selective stress masks
    poor_outcome_masked: list[dict[str, Any]] = []
    missing_domain_masked: list[dict[str, Any]] = []

    if stress_mask == "poor_outcome":
        # Mask worst 30% of target successor's surviving observations
        target_surviving = [
            (idx, obs)
            for idx, obs in enumerate(retained_observations)
            if int(obs["system_index"]) in target_system_indices
        ]
        if target_surviving:
            target_surviving.sort(key=lambda item: float(item[1]["y"]))
            n_mask = max(1, int(len(target_surviving) * 0.30))
            masked_indices = {item[0] for item in target_surviving[:n_mask]}
            new_retained = []
            for idx, obs in enumerate(retained_observations):
                if idx in masked_indices:
                    poor_outcome_masked.append(obs)
                else:
                    new_retained.append(obs)
            retained_observations = new_retained

    elif stress_mask == "missing_domain":
        # Drop entire adjacent reasoning / code domain for the successor
        alt_domain_idx = (target_domain_idx + 1) % len(domains)
        alt_domain_benchmarks = {
            b_idx
            for b_idx in range(len(benchmark_ids))
            if np.argmax(benchmark_domains[b_idx]) == alt_domain_idx
        }
        new_retained = []
        for obs in retained_observations:
            if (
                int(obs["system_index"]) in target_system_indices
                and int(obs["benchmark_index"]) in alt_domain_benchmarks
            ):
                missing_domain_masked.append(obs)
            else:
                new_retained.append(obs)
        retained_observations = new_retained

    # Actual connected Gemini component exclusion from BOTH training and confirmation
    gemini_excluded_observations: list[dict[str, Any]] = []
    gemini_excluded_models: list[str] = []
    gemini_exclusion_applied = False

    if exclude_gemini_from_confirmation:
        if confirmatory:
            if not gemini_component_metadata or not isinstance(gemini_component_metadata, dict):
                raise ValueError(
                    "Confirmatory evaluation requires caller-supplied frozen original component membership "
                    "metadata including provenance ('provenance' and 'member_models' fields). "
                    "The provisional CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS superset is not certified for confirmatory promotion."
                )
            prov = gemini_component_metadata.get("provenance")
            members = gemini_component_metadata.get("member_models")
            if not prov or not members or not isinstance(members, (list, tuple, set, frozenset)):
                raise ValueError(
                    "Caller-supplied gemini_component_metadata must contain non-empty 'provenance' and 'member_models' fields."
                )
            active_gemini_exclusions: frozenset[str] = frozenset(str(m).strip() for m in members)
        else:
            if gemini_component_metadata and isinstance(gemini_component_metadata, dict) and gemini_component_metadata.get("member_models"):
                active_gemini_exclusions = frozenset(str(m).strip() for m in gemini_component_metadata["member_models"])
            else:
                active_gemini_exclusions = CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS

        gemini_models = {m for m in model_names if is_gemini_component(m, custom_component_members=active_gemini_exclusions)}
        if gemini_models:
            gemini_exclusion_applied = True
            gemini_excluded_models = sorted(gemini_models)

            # 1. Filter retained observations: remove all rows belonging to any Gemini model
            surviving_observations = []
            for obs in retained_observations:
                sys_id = system_ids[int(obs["system_index"])]
                m_id = sys_id.split("@")[0].strip()
                if is_gemini_component(m_id, custom_component_members=active_gemini_exclusions):
                    gemini_excluded_observations.append(obs)
                else:
                    surviving_observations.append(obs)
            retained_observations = surviving_observations

            # 2. Filter system definitions
            surviving_systems: list[str] = []
            old_to_new_sys_map: dict[int, int] = {}
            for old_idx, s in enumerate(system_ids):
                m_id = s.split("@")[0].strip()
                if not is_gemini_component(m_id, custom_component_members=active_gemini_exclusions):
                    new_idx = len(surviving_systems)
                    old_to_new_sys_map[old_idx] = new_idx
                    surviving_systems.append(s)

            # 3. Filter model definitions
            surviving_models: list[str] = []
            old_to_new_model_map: dict[int, int] = {}
            for old_m_idx, m in enumerate(model_names):
                if not is_gemini_component(m, custom_component_members=active_gemini_exclusions):
                    new_m_idx = len(surviving_models)
                    old_to_new_model_map[old_m_idx] = new_m_idx
                    surviving_models.append(m)

            # 4. Update data structures
            train_data["system_ids"] = surviving_systems
            train_data["n_systems"] = len(surviving_systems)
            train_data["n_models"] = len(surviving_models)

            train_data["system_model_index"] = [
                old_to_new_model_map[system_model_index[old_idx]]
                for old_idx, s in enumerate(system_ids)
                if not is_gemini_component(s.split("@")[0].strip(), custom_component_members=active_gemini_exclusions)
            ]

            if "system_training_cutoff" in train_data:
                train_data["system_training_cutoff"] = [
                    train_data["system_training_cutoff"][old_idx]
                    for old_idx, s in enumerate(system_ids)
                    if not is_gemini_component(s.split("@")[0].strip(), custom_component_members=active_gemini_exclusions)
                ]

            if "system_profile_index" in train_data:
                train_data["system_profile_index"] = [
                    train_data["system_profile_index"][old_idx]
                    for old_idx, s in enumerate(system_ids)
                    if not is_gemini_component(s.split("@")[0].strip(), custom_component_members=active_gemini_exclusions)
                ]

            if "system_is_fixed_effort" in train_data:
                train_data["system_is_fixed_effort"] = [
                    train_data["system_is_fixed_effort"][old_idx]
                    for old_idx, s in enumerate(system_ids)
                    if not is_gemini_component(s.split("@")[0].strip(), custom_component_members=active_gemini_exclusions)
                ]

            # Remove Gemini systems from calibration panel
            if "calibration_panel_system_ids" in train_data:
                train_data["calibration_panel_system_ids"] = [
                    s for s in train_data["calibration_panel_system_ids"]
                    if not is_gemini_component(s.split("@")[0].strip(), custom_component_members=active_gemini_exclusions)
                ]

            # Re-index observations system_index
            for obs in retained_observations:
                obs["system_index"] = old_to_new_sys_map[int(obs["system_index"])]

    # Update observations in train_data
    train_data["observations"] = retained_observations

    # Rebuild cell mappings for updated observations
    cell_keys: dict[tuple[int, int], int] = {}
    new_cell_system_index = []
    new_cell_benchmark_index = []
    for obs in retained_observations:
        s_idx = int(obs["system_index"])
        b_idx = int(obs["benchmark_index"])
        key = (s_idx, b_idx)
        if key not in cell_keys:
            c_idx = len(cell_keys)
            cell_keys[key] = c_idx
            new_cell_system_index.append(s_idx)
            new_cell_benchmark_index.append(b_idx)
        obs["cell_index"] = cell_keys[key]

    train_data["cell_system_index"] = new_cell_system_index
    train_data["cell_benchmark_index"] = new_cell_benchmark_index

    # Configure transfer class registry and scenarios
    if registry is None:
        # Default minimal unreviewed registry
        reg = TransferClassRegistry(
            classes=[
                TransferClass(
                    class_id="illustrative-unreviewed-class",
                    member_models=[target_successor_model],
                    derivation_evidence="Illustrative placeholder evidence.",
                    reference_configuration_compatibility="Matched reference standard.",
                    is_singleton=True,
                )
            ],
            edition="unreviewed-illustrative-0.1",
            singleton_fallback=True,
        )
    elif isinstance(registry, dict):
        reg = TransferClassRegistry.from_dict(registry)
    else:
        reg = registry

    # Apply sensitivity scenarios
    if scenario == "omission":
        # Make all classes singletons (tests sensitivity to omission of valid classes)
        classes_omitted = [
            TransferClass(
                class_id=f"singleton:{c.class_id}",
                member_models=c.member_models[:1],
                derivation_evidence="Omission scenario singleton",
                reference_configuration_compatibility="Omission",
                is_singleton=True,
            )
            for c in reg.classes
        ]
        reg = TransferClassRegistry(
            classes=classes_omitted,
            edition="unreviewed-omission-scenario",
            singleton_fallback=True,
            metadata={"scenario": "omission"},
        )
    elif scenario == "wrong_class":
        # Group target model into an unrelated wrong class
        classes_copy = [copy.deepcopy(c) for c in reg.classes]
        wrong_class = next((c for c in classes_copy if target_successor_model not in c.member_models), None)
        if wrong_class:
            wrong_class.member_models.append(target_successor_model)
        else:
            classes_copy.append(
                TransferClass(
                    class_id="deliberate_false_class",
                    member_models=[target_successor_model, "unrelated_distant_model"],
                    derivation_evidence="Deliberate false association for sensitivity testing",
                    reference_configuration_compatibility="Mismatch",
                )
            )
        reg = TransferClassRegistry(
            classes=classes_copy,
            edition="unreviewed-wrong-class-scenario",
            singleton_fallback=True,
            metadata={"scenario": "wrong_class"},
        )

    # Inject Grok class prior contract into train_data
    train_data = ClassPriorAdapter.inject_into_data(train_data, reg)

    # Compute deterministic frozen hashes
    train_hash = compute_canonical_data_hash(train_data)
    train_data["frozen_train_data_hash"] = train_hash

    gemini_exclusion_status = (
        "caller_supplied_frozen_metadata"
        if (confirmatory and gemini_exclusion_applied)
        else ("provisional_development_superset" if gemini_exclusion_applied else "none")
    )

    eval_spec = {
        "target_successor_model": target_successor_model,
        "target_domain": target_domain,
        "held_out_observation_count": len(held_out_observations),
        "held_out_observations": held_out_observations,
        "held_out_families": [benchmark_family_ids[idx] for idx in target_family_indices],
        "remaining_cross_loadings": remaining_cross_loadings,
        "poor_outcome_masked_count": len(poor_outcome_masked),
        "poor_outcome_masked": poor_outcome_masked,
        "missing_domain_masked_count": len(missing_domain_masked),
        "missing_domain_masked": missing_domain_masked,
        "gemini_excluded_models": gemini_excluded_models,
        "gemini_excluded_observations_count": len(gemini_excluded_observations),
        "gemini_exclusion_status": gemini_exclusion_status,
        "stress_mask": stress_mask,
        "scenario": scenario,
        "train_data_hash": train_hash,
        "conditional_ignorability": CONDITIONAL_IGNORABILITY_NOTICE,
        **NON_PUBLISHABLE_METADATA,
    }

    eval_bytes = json.dumps(sanitize_for_strict_json(eval_spec), sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    eval_hash = hashlib.sha256(eval_bytes).hexdigest()

    manifest = {
        "train_data_hash": train_hash,
        "eval_spec_hash": eval_hash,
        "registry_hash": reg.compute_frozen_hash(),
        "target_successor_model": target_successor_model,
        "target_domain": target_domain,
        "retained_observation_count": len(retained_observations),
        "held_out_observation_count": len(held_out_observations),
        "gemini_excluded_observation_count": len(gemini_excluded_observations),
        "gemini_exclusion_status": gemini_exclusion_status,
        "stress_mask": stress_mask,
        "scenario": scenario,
        "gemini_exclusion_applied": gemini_exclusion_applied,
        "seed": seed,
        "conditional_ignorability": CONDITIONAL_IGNORABILITY_NOTICE,
        **NON_PUBLISHABLE_METADATA,
    }

    return train_data, eval_spec, manifest


# ---------------------------------------------------------------------------
# Command-Line Tooling
# ---------------------------------------------------------------------------

def cli_validate_registry(args: argparse.Namespace) -> int:
    reg_path = Path(args.registry)
    if not reg_path.exists():
        print(f"Error: Registry file '{reg_path}' does not exist.", file=sys.stderr)
        return 1

    data = json.loads(reg_path.read_text(encoding="utf-8"))
    reg = TransferClassRegistry.from_dict(data)

    known_models = None
    if args.models_file:
        m_path = Path(args.models_file)
        if m_path.exists():
            m_data = json.loads(m_path.read_text(encoding="utf-8"))
            if "system_ids" in m_data:
                known_models = sorted({s.split("@")[0].strip() for s in m_data["system_ids"]})

    report = reg.validate(known_models=known_models)

    print("=== Transfer-Class Registry Validation Report ===")
    print(f"Valid: {report['valid']}")
    print(f"Frozen SHA-256 Hash: {report['frozen_hash']}")
    print(f"Total Classes: {report['total_classes']}")
    print(f"Multi-Member Classes: {report['multi_member_classes']}")
    print(f"Singletons Added: {len(report['singletons_added'])}")

    if report["issues"]:
        print("\nIssues:")
        for iss in report["issues"]:
            print(f"  - {iss}")
        return 1

    print("\nRegistry validated successfully.")
    return 0


def cli_prepare(args: argparse.Namespace) -> int:
    in_path = Path(args.input).resolve()
    if not in_path.exists():
        print(f"Error: Input file '{in_path}' does not exist.", file=sys.stderr)
        return 1

    out_dir = Path(args.output_dir).resolve()
    # Check that output files do not overwrite the input file
    for target_name in ("train_input.json", "eval_spec.json", "manifest.json"):
        if (out_dir / target_name) == in_path:
            raise ValueError(
                f"Output path '{out_dir / target_name}' would overwrite input file '{in_path}'. "
                f"Please specify a separate output directory."
            )

    # Reject unreviewed confirmation/tuning with helpful error unless explicitly allowed
    if args.include_gemini_in_confirmation and not getattr(args, "allow_unreviewed_confirmation", False):
        raise ValueError(
            "Unreviewed confirmatory selection rejected: Proposal ACI 1.5.0 §12 strictly requires the motivating "
            "Gemini component to be kept out of confirmatory promotion evidence and hyperprior tuning. "
            "To run exploratory analysis including Gemini in development, pass --allow-unreviewed-confirmation."
        )

    is_confirmatory = bool(getattr(args, "confirmatory", False))
    gemini_metadata = None
    if getattr(args, "gemini_component_metadata", None):
        meta_path = Path(args.gemini_component_metadata).resolve()
        if not meta_path.exists():
            print(f"Error: Gemini component metadata file '{meta_path}' does not exist.", file=sys.stderr)
            return 1
        gemini_metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    elif is_confirmatory:
        raise ValueError(
            "Confirmatory evaluation rejected: --confirmatory requires --gemini-component-metadata "
            "pointing to a JSON file with caller-supplied frozen original component membership and provenance. "
            "The provisional CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS superset is development-only."
        )

    data = json.loads(in_path.read_text(encoding="utf-8"))

    registry = None
    if args.registry:
        reg_path = Path(args.registry).resolve()
        if not reg_path.exists():
            print(f"Error: Registry file '{reg_path}' does not exist.", file=sys.stderr)
            return 1
        registry = TransferClassRegistry.from_dict(
            json.loads(reg_path.read_text(encoding="utf-8"))
        )

    out_dir.mkdir(parents=True, exist_ok=True)

    train_data, eval_spec, manifest = prepare_holdout_experiment(
        input_data=data,
        target_successor_model=args.target_model,
        target_domain=args.target_domain,
        registry=registry,
        stress_mask=args.stress_mask if args.stress_mask != "none" else None,
        scenario=args.scenario if args.scenario != "none" else None,
        exclude_gemini_from_confirmation=not args.include_gemini_in_confirmation,
        gemini_component_metadata=gemini_metadata,
        confirmatory=is_confirmatory,
        seed=args.seed,
    )

    (out_dir / "train_input.json").write_text(strict_json_dumps(train_data, indent=2) + "\n", encoding="utf-8")
    (out_dir / "eval_spec.json").write_text(strict_json_dumps(eval_spec, indent=2) + "\n", encoding="utf-8")
    (out_dir / "manifest.json").write_text(strict_json_dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print("=== Experiment Preparation Complete ===")
    print(f"Output directory: {out_dir}")
    print(f"Confirmatory:     {is_confirmatory}")
    print(f"Train input hash: {manifest['train_data_hash']}")
    print(f"Eval spec hash:   {manifest['eval_spec_hash']}")
    print(f"Retained rows:    {manifest['retained_observation_count']}")
    print(f"Held-out rows:    {manifest['held_out_observation_count']}")
    print(f"Gemini excluded:  {manifest['gemini_exclusion_applied']} ({manifest['gemini_excluded_observation_count']} rows removed)")
    print(f"Gemini status:    {manifest['gemini_exclusion_status']}")
    print(f"Stress mask:      {args.stress_mask}")
    print(f"Scenario:         {args.scenario}")
    print("\nNote: Non-publishable experimental metadata generated.")
    return 0


def diagnose_system_geometry(
    input_data: dict[str, Any],
    target_system: str,
    target_weights: Sequence[float] | np.ndarray | None = None,
    deduplicate_directions: bool = True,
    use_unit_variance: bool = True,
    custom_R_diag: Sequence[float] | np.ndarray | None = None,
) -> dict[str, Any]:
    """Evaluates condition-level loading geometry and target support diagnostics for a system.

    Default settings strictly enforce condition-level loading geometry:
    - Deduplicates measured condition directions across source observation rows.
    - Uses declared equal unit illustrative variance (R_diag = 1).
    - Ensures duplicate-row invariance (eigenvalues, rank, null space, cone membership).
    - Retains custom_R_diag and raw observation modes for API callers.
    - Prominently disclaims empirical Fisher/precision estimation or inferred residual variance.
    """
    system_ids = input_data["system_ids"]
    if target_system not in system_ids:
        raise ValueError(f"Target system '{target_system}' not found in system_ids.")

    sys_idx = system_ids.index(target_system)
    observations = input_data["observations"]
    benchmark_domains = np.asarray(input_data["benchmark_domains"], dtype=float)

    source_obs_count = 0
    selected_directions = []
    selected_variances = []
    seen_keys = set()

    for obs in observations:
        if int(obs["system_index"]) == sys_idx:
            source_obs_count += 1
            b_idx = int(obs["benchmark_index"])
            dir_vec = np.asarray(benchmark_domains[b_idx], dtype=float)
            var = float(obs.get("variance", 1.0))
            if var <= 0.0 or not np.isfinite(var):
                var = 1.0

            if deduplicate_directions:
                key = tuple(np.round(dir_vec, decimals=8).tolist())
                if key not in seen_keys:
                    seen_keys.add(key)
                    selected_directions.append(dir_vec)
                    selected_variances.append(1.0 if use_unit_variance else var)
            else:
                selected_directions.append(dir_vec)
                selected_variances.append(1.0 if use_unit_variance else var)

    if not selected_directions:
        raise ValueError(f"System '{target_system}' has no direct observations in dataset.")

    A = np.asarray(selected_directions, dtype=float)
    if custom_R_diag is not None:
        R_diag = np.asarray(custom_R_diag, dtype=float)
        if len(R_diag) != len(selected_directions):
            raise ValueError(
                f"Length of custom_R_diag ({len(R_diag)}) does not match directions ({len(selected_directions)})."
            )
    else:
        R_diag = np.asarray(selected_variances, dtype=float)

    J = compute_information_matrix(A, R_diag)
    info_analysis = analyze_information(J)

    if target_weights is None:
        w = np.array([0.2, 0.2, 0.2, 0.2, 0.2], dtype=float)
    else:
        w = np.asarray(target_weights, dtype=float)

    target_diag = target_support_diagnostic(info_analysis, w)
    cone_diag = evaluate_cone_membership(A, w)

    unique_count = len(selected_directions) if deduplicate_directions else len(
        {tuple(np.round(v, decimals=8).tolist()) for v in selected_directions}
    )

    return {
        "system_id": target_system,
        "geometry_type": "condition_level_loading_geometry" if deduplicate_directions else "observation_level_geometry",
        "source_observation_count": source_obs_count,
        "unique_measured_directions_count": unique_count,
        "observation_count": source_obs_count,
        "variance_specification": "declared_equal_unit_illustrative_variance" if use_unit_variance else "supplied_source_variances",
        "estimation_notice": (
            "Condition-level loading geometry only. This diagnostic computes the geometric span "
            "and subspace identification of declared benchmark condition directions under unit illustrative variance. "
            "It does NOT perform empirical Fisher information estimation, empirical precision "
            "estimation, or inferred residual variance estimation from observed data."
        ),
        "information_analysis": {
            "eigenvalues": [float(x) for x in info_analysis.eigenvalues],
            "effective_rank": int(info_analysis.effective_rank),
            "dimension": int(info_analysis.dimension),
            "condition_number": float(info_analysis.condition_number),
            "null_space_basis": [[float(v) for v in vec] for vec in info_analysis.null_space_basis],
            "range_space_basis": [[float(v) for v in vec] for vec in info_analysis.range_space_basis],
            "tolerance": float(info_analysis.tolerance),
        },
        "target_support_diagnostic": {
            "target": [float(x) for x in target_diag.target],
            "projected_range": [float(x) for x in target_diag.projected_range],
            "projected_null": [float(x) for x in target_diag.projected_null],
            "support_fraction": float(target_diag.support_fraction),
            "unidentified_fraction": float(target_diag.unidentified_fraction),
            "null_component_norm": float(target_diag.null_component_norm),
            "is_fully_supported": bool(target_diag.is_fully_supported),
            "diagnostics_note": target_diag.diagnostics_note,
        },
        "cone_membership_diagnostic": {
            "in_cone": bool(cone_diag.in_cone),
            "residual_norm": float(cone_diag.residual_norm),
            "cone_weights": [float(x) for x in cone_diag.cone_weights],
            "separating_vector": [float(x) for x in cone_diag.separating_vector] if cone_diag.separating_vector is not None else None,
            "projections_on_separating_vector": [float(x) for x in cone_diag.projections_on_separating_vector] if cone_diag.projections_on_separating_vector is not None else None,
            "target_projection_on_separating_vector": float(cone_diag.target_projection_on_separating_vector) if cone_diag.target_projection_on_separating_vector is not None else None,
            "caveats": list(cone_diag.caveats),
        },
        "conditioning_assumptions": list(CONDITIONING_ASSUMPTIONS),
        "task_utility_notice": (
            "Existing benchmark suites do not represent an operational task utility space or target task mass. "
            "Residual covariance R is a linear-Gaussian approximation conditioned on point measurement parameters."
        ),
        **NON_PUBLISHABLE_METADATA,
    }


def cli_diagnose_geometry(args: argparse.Namespace) -> int:
    in_path = Path(args.input).resolve()
    if not in_path.exists():
        print(f"Error: Input file '{in_path}' does not exist.", file=sys.stderr)
        return 1

    if args.output:
        out_path = Path(args.output).resolve()
        if out_path == in_path:
            raise ValueError(f"Output path '{out_path}' cannot overwrite input file '{in_path}'.")

    data = json.loads(in_path.read_text(encoding="utf-8"))
    system_ids = data["system_ids"]
    target_sys = args.target_system or system_ids[0]
    if target_sys not in system_ids:
        print(f"Error: Target system '{target_sys}' not found in system_ids.", file=sys.stderr)
        return 1

    target_weights = None
    if args.target_weights:
        target_weights = [float(x) for x in args.target_weights.split(",")]

    try:
        report = diagnose_system_geometry(
            input_data=data,
            target_system=target_sys,
            target_weights=target_weights,
            deduplicate_directions=not getattr(args, "raw_observations", False),
            use_unit_variance=not getattr(args, "use_source_variances", False),
        )
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    output_json = strict_json_dumps(report, indent=2)
    if args.output:
        out_path = Path(args.output).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output_json + "\n", encoding="utf-8")
        print(f"Diagnostics written to {out_path}")
    else:
        print(output_json)
    return 0


def cli_run_candidate(args: argparse.Namespace) -> int:
    """Runs opt-in class candidate evaluation with development-only sampler settings.

    FAILS CLOSED if:
    - class_prior is missing or enabled=False.
    - Immutable manifest or train_data_hash is missing/empty (unless --allow-unfrozen-dev-run).
    - Real immutable hash check fails against manifest.json (unless --allow-unfrozen-dev-run).
    - Unreviewed confirmation is attempted without explicit --dev-mode.
    - Active runner lacks class_rho support.
    - Output paths overwrite input file.
    """
    in_path = Path(args.input).resolve()
    if not in_path.exists():
        print(f"Error: Input file '{in_path}' does not exist.", file=sys.stderr)
        return 1

    out_dir = Path(args.output_dir).resolve()
    candidate_train_path = out_dir / "candidate_train_input.json"
    posterior_path = out_dir / "candidate_posterior.npz"
    summary_path = out_dir / "candidate_summary.json"
    diagnostics_path = out_dir / "candidate_diagnostics.json"

    for p in (candidate_train_path, posterior_path, summary_path, diagnostics_path):
        if p == in_path:
            raise ValueError(f"Candidate output path '{p}' would overwrite input file '{in_path}'.")

    # 1. Require development-only sampler settings; reject unreviewed confirmation
    if not getattr(args, "dev_mode", False):
        raise ValueError(
            "Unreviewed confirmatory evaluation rejected: The opt-in transfer class candidate model is currently "
            "in experimental research status and has not locked confirmatory promotion criteria or reviewed classes. "
            "Production confirmation and tuning runs are rejected. "
            "To run in explicitly labeled development mode, pass --dev-mode."
        )

    # 2. Real immutable hash check on load
    raw_bytes = in_path.read_bytes()
    data = json.loads(raw_bytes.decode("utf-8"))
    computed_hash = compute_canonical_data_hash(data)

    manifest_path = in_path.parent / "manifest.json"
    if not getattr(args, "allow_unfrozen_dev_run", False):
        if not manifest_path.exists():
            raise ValueError(
                f"Candidate runner failed closed: immutable manifest required ('{manifest_path}' does not exist). "
                f"Candidate runs must be prepared with an immutable manifest containing train_data_hash, "
                f"or explicitly specify --allow-unfrozen-dev-run for unverified development runs."
            )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        expected_hash = manifest.get("train_data_hash")
        if not expected_hash:
            raise ValueError(
                f"Candidate runner failed closed: manifest '{manifest_path}' contains empty or missing train_data_hash."
            )
        raw_hash = hashlib.sha256(raw_bytes).hexdigest()
        if computed_hash != expected_hash and raw_hash != expected_hash:
            raise ValueError(
                f"Immutable hash verification failed for '{in_path}': "
                f"expected {expected_hash}, computed {computed_hash}. "
                f"The dataset has been tampered with or modified."
            )
    else:
        print("WARNING: --allow-unfrozen-dev-run specified. Skipping immutable manifest and dataset hash verification.")

    # 3. Verify class_prior is enabled (fail closed: no baseline substitution)
    class_prior_payload = data.get("class_prior")
    if not class_prior_payload or not isinstance(class_prior_payload, dict) or not bool(class_prior_payload.get("enabled", False)):
        raise ValueError(
            "Candidate runner failed closed: class_prior is missing or not enabled. "
            "Baseline scoring cannot be run as an opt-in class candidate."
        )

    out_dir.mkdir(parents=True, exist_ok=True)

    print("====================================================================")
    print("WARNING: ACTUALANALYSIS 1.5.0 OPT-IN CLASS CANDIDATE (EXPERIMENTAL)")
    print("THIS RUN USES DEVELOPMENT-ONLY SAMPLER SETTINGS AND UNVALIDATED CLASSES.")
    print("OUTPUTS ARE EXPERIMENTAL AND MUST NOT BE PUBLISHED.")
    print("====================================================================")

    # 4. Check that runtime actually supports class_prior (fail closed)
    if "class_rho" not in DECLARED_PARAMETERS:
        raise RuntimeError(
            "Candidate runner failed closed: class_prior support is absent from the active runner. "
            "Cannot run baseline model as a candidate substitute."
        )

    # Set development-only sampler settings
    data["inference"] = {
        "chains": int(args.chains),
        "warmup": int(args.warmup),
        "samples": int(args.samples),
        "retained_draws": int(args.samples) * int(args.chains),
        "target_accept": 0.80,
    }
    data["progress_bar"] = bool(args.progress)

    candidate_train_path.write_text(strict_json_dumps(data, indent=2) + "\n", encoding="utf-8")

    print(f"Running candidate MCMC (chains={data['inference']['chains']}, warmup={data['inference']['warmup']}, samples={data['inference']['samples']})...")
    run_model(
        input_path=candidate_train_path,
        output_path=diagnostics_path,
        posterior_path=posterior_path,
        summary_path=summary_path,
    )

    diag_data = json.loads(diagnostics_path.read_text(encoding="utf-8"))
    # Verify runner actually populated class_prior diagnostics
    if "class_prior" not in diag_data:
        raise RuntimeError(
            "Candidate run completed but diagnostics lack class_prior output. "
            "Model did not execute class prior specification."
        )

    print(f"\nCandidate run complete.")
    print(f"Summary:     {summary_path}")
    print(f"Diagnostics: {diagnostics_path}")
    print(f"Posterior:   {posterior_path}")
    print("All outputs marked as experimental / non-publishable.")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="ActualAnalysis 1.5.0 Measurement Spaces & Classes Experiment Tooling"
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # validate-registry
    p_val = subparsers.add_parser(
        "validate-registry", help="Validate transfer-class registry schema and partition"
    )
    p_val.add_argument("--registry", required=True, help="Path to registry JSON file")
    p_val.add_argument("--models-file", help="Path to data JSON with known model IDs")

    # prepare
    p_prep = subparsers.add_parser(
        "prepare", help="Prepare reproducible successor-domain holdout experiment"
    )
    p_prep.add_argument("--input", required=True, help="Input baseline ACI 1.2 JSON")
    p_prep.add_argument("--registry", help="Transfer-class registry JSON")
    p_prep.add_argument("--target-model", required=True, help="Target successor model ID")
    p_prep.add_argument(
        "--target-domain",
        default="reasoning",
        help="Target capability domain to hold out (default: reasoning)",
    )
    p_prep.add_argument(
        "--stress-mask",
        choices=["none", "poor_outcome", "missing_domain"],
        default="none",
        help="Selective stress mask",
    )
    p_prep.add_argument(
        "--scenario",
        choices=["none", "omission", "wrong_class"],
        default="none",
        help="Sensitivity scenario",
    )
    p_prep.add_argument(
        "--include-gemini-in-confirmation",
        action="store_true",
        default=False,
        help="Include Gemini in confirmation (violates §12 unless exploratory)",
    )
    p_prep.add_argument(
        "--allow-unreviewed-confirmation",
        action="store_true",
        default=False,
        help="Development-only: allow unreviewed exploratory inclusion of Gemini in confirmation",
    )
    p_prep.add_argument(
        "--confirmatory",
        action="store_true",
        default=False,
        help="Run in confirmatory mode (requires --gemini-component-metadata with provenance)",
    )
    p_prep.add_argument(
        "--gemini-component-metadata",
        help="Path to JSON file with frozen Gemini component metadata and provenance",
    )
    p_prep.add_argument("--output-dir", required=True, help="Output directory for train/eval specs")
    p_prep.add_argument("--seed", type=int, default=42, help="Random seed")

    # diagnose-geometry
    p_geom = subparsers.add_parser(
        "diagnose-geometry", help="Run measurement geometry and target support diagnostics"
    )
    p_geom.add_argument("--input", required=True, help="Input ACI 1.2 JSON")
    p_geom.add_argument("--target-system", help="System ID to evaluate (defaults to first system)")
    p_geom.add_argument(
        "--target-weights", help="Comma-separated 5 domain weights (default: 0.2,0.2,0.2,0.2,0.2)"
    )
    p_geom.add_argument(
        "--raw-observations",
        action="store_true",
        default=False,
        help="Use raw observation rows without deduplication (default: deduplicate condition directions)",
    )
    p_geom.add_argument(
        "--use-source-variances",
        action="store_true",
        default=False,
        help="Use supplied source observation variances rather than declared equal unit illustrative variance",
    )
    p_geom.add_argument("--output", help="Output path for JSON diagnostics")

    # run-candidate
    p_run = subparsers.add_parser(
        "run-candidate", help="Run candidate MCMC with development settings"
    )
    p_run.add_argument("--input", required=True, help="Prepared train input JSON")
    p_run.add_argument("--output-dir", required=True, help="Output directory for results")
    p_run.add_argument(
        "--dev-mode",
        action="store_true",
        default=False,
        help="Explicitly enable development-only sampler settings (required for experimental runs)",
    )
    p_run.add_argument(
        "--allow-unfrozen-dev-run",
        action="store_true",
        default=False,
        help="Development-only: allow running candidate without frozen manifest or hash verification",
    )
    p_run.add_argument("--chains", type=int, default=1, help="Chains for dev run")
    p_run.add_argument("--warmup", type=int, default=20, help="Warmup draws for dev run")
    p_run.add_argument("--samples", type=int, default=20, help="Posterior samples for dev run")
    p_run.add_argument("--progress", action="store_true", default=False, help="Show progress bar")

    args = parser.parse_args(argv)

    if args.subcommand == "validate-registry":
        return cli_validate_registry(args)
    elif args.subcommand == "prepare":
        return cli_prepare(args)
    elif args.subcommand == "diagnose-geometry":
        return cli_diagnose_geometry(args)
    elif args.subcommand == "run-candidate":
        return cli_run_candidate(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
