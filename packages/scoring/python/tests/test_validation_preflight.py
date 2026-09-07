"""Metadata-only v1.5 validation preflight tests.

These tests check gate logic. A green run is not confirmatory validation,
promotion, or evidence that the class prior predicts better.
"""
from __future__ import annotations

import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aci12.experiment import (
    DEFAULT_DOMAIN_LOADING_THRESHOLD,
    NON_PUBLISHABLE_METADATA,
    TransferClassRegistry,
    prepare_holdout_experiment,
)
from aci12.validation_preflight import (
    INFORMATIVE_ORIGINAL_COMPONENT_FLOOR,
    INSPECTED_COMMIT,
    PROVIDER_FLOOR,
    VERDICT_NOTREADY,
    VERDICT_READY,
    availability_successor_domain_blocks,
    combine_verdict,
    identify_family_closure_targets,
    inspect_class_registry,
    inspect_comparable_settings,
    inspect_exclusion_provenance,
    inspect_lock_and_selection,
    is_json_true,
    json_true_issue,
    main as preflight_main,
    run_preflight,
)


def _obs(system_index: int, benchmark_index: int, **fields) -> dict:
    row = {
        "cell_index": system_index * 10 + benchmark_index,
        "system_index": system_index,
        "benchmark_index": benchmark_index,
        "provenance_index": 0,
        "domain_index": 2 if benchmark_index == 0 else 1,
        "likelihood": "normal",
        "y": 0.1 * system_index + benchmark_index,
        "variance": 0.1,
        "x": 10,
        "per_task_counts": [1, 2, 3],
    }
    row.update(fields)
    return row


def _input(n_pairs: int = 2, providers: int = 2) -> dict:
    """n_pairs successor/parent pairs; each pair has target + parent-domain rows."""
    n_models = n_pairs * 2
    system_ids = [f"m{i}@max" for i in range(n_models)]
    observations = []
    for i in range(n_models):
        observations.append(_obs(i, 0, domain_index=2))
        observations.append(_obs(i, 1, domain_index=2, y=0.01))
        observations.append(_obs(i, 2, domain_index=1))
    return {
        "n_models": n_models,
        "n_systems": n_models,
        "n_benchmarks": 3,
        "n_families": 2,
        "system_ids": system_ids,
        "model_ids": [f"m{i}" for i in range(n_models)],
        "benchmark_ids": ["reason-primary", "reason-family-low", "code-parent"],
        "domains": [
            "agentic",
            "software-code",
            "reasoning",
            "knowledge-information",
            "communication-professional",
        ],
        "system_model_index": list(range(n_models)),
        "system_profile_index": [1] * n_models,
        "benchmark_family_ids": ["reason-fam", "reason-fam", "code-fam"],
        "benchmark_family_index": [0, 0, 1],
        "benchmark_domains": [
            [0.0, 0.0, 0.8, 0.2, 0.0],
            [0.0, 0.0, 0.1, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0, 0.0],
        ],
        "cell_system_index": [obs["system_index"] for obs in observations],
        "cell_benchmark_index": [obs["benchmark_index"] for obs in observations],
        "observations": observations,
        "trait_structure": "correlated",
        "priors": {},
        "_providers_hint": providers,
    }


def _strict_class(class_id: str, members: list[str], singleton: bool = False) -> dict:
    return {
        "class_id": class_id,
        "member_models": members,
        "derivation_evidence": "Documented checkpoint update of identical architecture.",
        "reference_configuration_compatibility": "Matched default standard configuration.",
        "is_singleton": singleton,
    }


def _component(
    cid: str,
    members: list[str],
    provider: str,
    *,
    certified: bool = True,
) -> dict:
    if certified:
        status = "certified"
        config = "certified"
    else:
        status = "relationship-supported-config-unresolved"
        config = "unresolved"
    return {
        "original_component_id": cid,
        "provider": provider,
        "member_models": members,
        "review_status": status,
        "fully_compatible_reviewed_class": certified,
        "config_compatibility_status": config,
        "sources": [{"url": f"https://example.invalid/{cid}", "retrieval_date": "2026-09-07"}],
    }


def _reviewed_registry(n_components: int = 10, n_providers: int = 3, fake: bool = False) -> dict:
    classes = []
    components = []
    for i in range(n_components):
        parent = f"m{2 * i}"
        child = f"m{2 * i + 1}"
        members = [parent, child]
        if fake:
            members = [parent, f"fake-unobserved-{i}"]
        provider = f"provider-{i % n_providers}"
        class_id = f"class-{i}"
        classes.append(_strict_class(class_id, members))
        components.append(_component(f"component-{i}", members, provider, certified=True))
    return {
        "edition": "reviewed-documentation-only-test",
        "singleton_fallback": True,
        "classes": classes,
        "metadata": {
            "real_reviewed_classes_exist": True,
            "confirmatory_criteria_locked": True,
            "is_experimental": True,
            "is_publishable": False,
            "components": components,
        },
    }


def _unreviewed_five_specs() -> list[tuple[str, list[str], str]]:
    return [
        ("claude-3.5-sonnet-snapshots", ["m0", "m1"], "Anthropic"),
        ("claude-opus-4-drop-in", ["m2", "m3"], "Anthropic"),
        ("claude-sonnet-4-drop-in", ["m4", "m5"], "Anthropic"),
        ("claude-fable-5-revision", ["m6", "m7"], "Anthropic"),
        ("deepseek-v4-pro-preview-to-ga", ["m8", "m9"], "DeepSeek"),
    ]


def _schema_valid_unreviewed_five() -> dict:
    """Actual TransferClass schema: strict class objects; provenance in metadata.components."""
    specs = _unreviewed_five_specs()
    return {
        "edition": "metadata-reviewed-candidate-2026-09-07",
        "singleton_fallback": True,
        "classes": [_strict_class(cid, members) for cid, members, _provider in specs],
        "metadata": {
            "is_experimental": True,
            "is_publishable": False,
            "confirmatory_criteria_locked": False,
            "real_reviewed_classes_exist": False,
            "components": [
                _component(cid, members, provider, certified=False)
                for cid, members, provider in specs
            ],
        },
    }


def _actual_shape_unreviewed_five() -> dict:
    """Final reviewed-candidate shape: metadata.components is a dict keyed by class id.

    Values carry original_component_id; keys are not identity. Review flags match
    the 2026-09-07 candidate registry (relationship-supported, config unresolved).
    """
    specs = _unreviewed_five_specs()
    components: dict[str, dict] = {}
    for cid, members, provider in specs:
        row = _component(cid, members, provider, certified=False)
        row["class_id"] = cid
        row["relationship_supported"] = True
        row["review_status"] = "relationship-supported-config-unresolved"
        row["config_compatibility_status"] = "unresolved"
        row["fully_compatible_reviewed_class"] = False
        components[cid] = row
    return {
        "edition": "metadata-reviewed-candidate-2026-09-07",
        "singleton_fallback": True,
        "classes": [_strict_class(cid, members) for cid, members, _provider in specs],
        "metadata": {
            "is_experimental": True,
            "is_publishable": False,
            "confirmatory_criteria_locked": False,
            "real_reviewed_classes_exist": False,
            "components": components,
        },
    }


def _locked_plan() -> dict:
    return {
        "locked": True,
        "candidate_family": "restricted",
        "candidate_pooling": {"kind": "beta", "alpha": 1.0, "beta": 1.0},
        "baseline_pooling": {"kind": "fixed", "value": 0.0},
        "trait_structure": "correlated",
        "domain_loading_threshold": 0.25,
        "informative_component_floor": 10,
        "provider_floor": 3,
        "predictive_score": "production_joint_log_density",
    }


def _frozen_manifest() -> dict:
    return {
        "train_data_hash": "abc123",
        "eval_spec_hash": "def456",
        "domain_loading_threshold": 0.25,
        "domain_loading_threshold_selection_rule": "loading >= 0.25 then family closure",
        "primary_scoring_rule": "score primary target conditions only",
        "is_publishable": False,
        "is_experimental": True,
        "confirmatory_criteria_locked": False,
    }


def _certified_exclusion() -> dict:
    return {
        "provenance": "Archived documentation review of the motivating Gemini component, 2026-09-07.",
        "member_models": ["gemini-3.7-flash", "gemini-3.8-flash"],
        "confirmatory_certified": True,
    }


class JsonTrueGuard(unittest.TestCase):
    def test_only_actual_boolean_true_passes(self):
        self.assertTrue(is_json_true(True))
        for value in (False, None, 1, 0, "true", "True", "yes", "1", "LOCKED", "", "UNSET"):
            self.assertFalse(is_json_true(value), msg=repr(value))
            self.assertIsNotNone(json_true_issue(value, "flag"))


class VerdictCombination(unittest.TestCase):
    def test_ready_only_if_every_gate_passed(self):
        from aci12.validation_preflight import GateResult
        ok = GateResult("a", True, "ok")
        bad = GateResult("b", False, "no", ("missing",))
        self.assertEqual(combine_verdict([ok, ok]), VERDICT_READY)
        self.assertEqual(combine_verdict([ok, bad]), VERDICT_NOTREADY)
        self.assertEqual(combine_verdict([]), VERDICT_NOTREADY)


class EmptyPreflight(unittest.TestCase):
    def test_missing_inputs_are_notready_and_list_all_prerequisites(self):
        report = run_preflight()
        self.assertEqual(report["verdict"], VERDICT_NOTREADY)
        self.assertFalse(report["fit_authorized"])
        self.assertFalse(report["promotion_authorized"])
        self.assertEqual(report["promotion_claim"], "not_claimed")
        self.assertEqual(report["inspected_commit"], INSPECTED_COMMIT)
        self.assertGreaterEqual(len(report["missing_prerequisites"]), 4)
        joined = " ".join(report["missing_prerequisites"])
        self.assertIn("Class registry was not supplied", joined)
        self.assertIn("--registry", joined)
        self.assertIn("Fitted input JSON", joined)
        self.assertIn("Confirmation exclusion metadata", joined)
        self.assertIn("production-faithful paired joint predictive", joined)
        self.assertIn("class registry insufficient", report["no_fit_reasons"])
        self.assertFalse(report["reads_outcomes_for_cohort_selection"])
        self.assertTrue(report["nonpublishable_guards_retained"])
        self.assertFalse(NON_PUBLISHABLE_METADATA["is_publishable"])


class RegistryGates(unittest.TestCase):
    def test_illustrative_two_class_registry_is_insufficient(self):
        example = {
            "edition": "unreviewed-illustrative-0.1",
            "singleton_fallback": True,
            "classes": [
                {
                    "class_id": "illustrative-claude-35-sonnet",
                    "member_models": ["claude-3.5-sonnet", "claude-3.5-sonnet-20241022"],
                    "derivation_evidence": "Documented October 2024 checkpoint update.",
                    "reference_configuration_compatibility": "Matched default.",
                    "is_singleton": False,
                },
                {
                    "class_id": "illustrative-gpt-5-variants",
                    "member_models": ["gpt-5-mini", "gpt-5-nano"],
                    "derivation_evidence": "Documented lightweight distillation variants.",
                    "reference_configuration_compatibility": "Standardized API.",
                    "is_singleton": False,
                },
            ],
            "metadata": {
                "real_reviewed_classes_exist": False,
                "confirmatory_criteria_locked": False,
            },
        }
        data = _input(n_pairs=2)
        report = run_preflight(input_data=data, registry=example)
        gate = next(g for g in report["gates"] if g["id"] == "class_registry")
        self.assertFalse(gate["passed"])
        self.assertEqual(gate["details"]["n_declared_classes"], 2)
        self.assertEqual(report["counts"]["candidate"]["components"], 0)
        self.assertEqual(report["counts"]["informative"]["components"], 0)
        self.assertEqual(report["counts"]["eligible"]["components"], 0)
        text = " ".join(gate["issues"])
        self.assertIn("real_reviewed_classes_exist", text)
        self.assertIn("illustrative", text.lower())
        self.assertIn("metadata.components", text)
        self.assertIn("floor", text.lower())
        self.assertLess(gate["details"]["n_eligible_reviewed_classes"], INFORMATIVE_ORIGINAL_COMPONENT_FLOOR)

    def test_truthy_strings_do_not_mark_registry_reviewed_or_locked(self):
        registry = _reviewed_registry(n_components=10, n_providers=3)
        registry["metadata"]["real_reviewed_classes_exist"] = "true"
        registry["metadata"]["confirmatory_criteria_locked"] = "yes"
        gate = inspect_class_registry(registry, [f"m{i}" for i in range(20)], [], [])
        self.assertFalse(gate.passed)
        joined = " ".join(gate.issues)
        self.assertIn("truthy-string", joined)
        self.assertIn("real_reviewed_classes_exist", joined)
        self.assertIn("confirmatory_criteria_locked", joined)

    def test_unobserved_fake_members_do_not_create_pooling_classes(self):
        data = _input(n_pairs=10)
        registry = _reviewed_registry(n_components=10, n_providers=3, fake=True)
        observed = [f"m{i}" for i in range(20)]
        gate = inspect_class_registry(registry, observed, [], [])
        self.assertFalse(gate.passed)
        self.assertEqual(gate.details["n_observed_non_gemini_multi_member_classes"], 0)
        self.assertGreater(gate.details["n_fake_or_unobserved_members"], 0)
        self.assertTrue(any("unobserved/fake" in issue for issue in gate.issues))

    def test_singletons_and_gemini_pairs_are_not_independent_components(self):
        observed = ["gemini-3.7-flash", "gemini-3.8-flash", "solo-a", "solo-b"]
        registry = {
            "edition": "reviewed-documentation-only-test",
            "classes": [
                _strict_class("gemini-pair", ["gemini-3.7-flash", "gemini-3.8-flash"]),
                _strict_class("solo-a-class", ["solo-a"], singleton=True),
            ],
            "metadata": {
                "real_reviewed_classes_exist": True,
                "confirmatory_criteria_locked": True,
                "components": [
                    _component("google-gemini-flash", ["gemini-3.7-flash", "gemini-3.8-flash"], "Google"),
                    _component("solo-a-tree", ["solo-a"], "Acme"),
                ],
            },
        }
        excluded = {"gemini-3.7-flash", "gemini-3.8-flash"}
        gate = inspect_class_registry(registry, observed, excluded, [])
        self.assertEqual(gate.details["n_observed_non_gemini_multi_member_classes"], 0)
        self.assertEqual(gate.details["n_informative_original_components"], 0)
        self.assertEqual(gate.details["n_eligible_reviewed_classes"], 0)
        self.assertFalse(gate.passed)

    def test_arbitrary_partitions_of_one_component_do_not_count_as_ten(self):
        observed = [f"m{i}" for i in range(20)]
        classes = [_strict_class(f"slice-{i}", [f"m{2 * i}", f"m{2 * i + 1}"]) for i in range(10)]
        components = [
            _component("one-documented-tree", [f"m{2 * i}", f"m{2 * i + 1}"], "OpenAI")
            for i in range(10)
        ]
        registry = {
            "edition": "reviewed-documentation-only-test",
            "classes": classes,
            "metadata": {
                "real_reviewed_classes_exist": True,
                "confirmatory_criteria_locked": True,
                "components": components,
            },
        }
        blocks = [
            {
                "model_id": f"m{i}",
                "has_target_outcome_availability": True,
                "has_successor_parent_evidence": True,
            }
            for i in range(20)
        ]
        gate = inspect_class_registry(registry, observed, [], blocks)
        self.assertEqual(gate.details["n_candidate_components"], 1)
        self.assertEqual(gate.details["n_informative_original_components"], 1)
        self.assertEqual(gate.details["n_eligible_reviewed_classes"], 1)
        self.assertEqual(gate.details["n_eligible_providers"], 1)
        self.assertLess(gate.details["n_eligible_reviewed_classes"], INFORMATIVE_ORIGINAL_COMPONENT_FLOOR)
        self.assertTrue(any("Eligible certified" in issue for issue in gate.issues))
        self.assertEqual(INFORMATIVE_ORIGINAL_COMPONENT_FLOOR, 10)
        self.assertEqual(PROVIDER_FLOOR, 3)

    def test_ten_components_three_providers_count_when_declared_and_observed(self):
        data = _input(n_pairs=10)
        registry = _reviewed_registry(10, 3)
        blocks = availability_successor_domain_blocks(data, [])
        observed = [f"m{i}" for i in range(20)]
        gate = inspect_class_registry(registry, observed, [], blocks)
        self.assertEqual(gate.details["n_candidate_components"], 10)
        self.assertEqual(gate.details["n_informative_original_components"], 10)
        self.assertEqual(gate.details["n_eligible_reviewed_classes"], 10)
        self.assertEqual(gate.details["n_eligible_providers"], 3)
        self.assertGreaterEqual(gate.details["n_observed_non_gemini_multi_member_classes"], 10)
        self.assertTrue(gate.passed)

    def test_schema_valid_unreviewed_candidate_is_not_eligible(self):
        data = _input(n_pairs=5)
        registry = _schema_valid_unreviewed_five()
        schema = TransferClassRegistry.from_dict(registry).validate(
            known_models=[f"m{i}" for i in range(10)]
        )
        self.assertTrue(schema["valid"])
        extra = [key for row in registry["classes"] for key in row if key not in {
            "class_id", "member_models", "derivation_evidence",
            "reference_configuration_compatibility", "is_singleton", "notes",
        }]
        self.assertEqual(extra, [])
        self.assertIn("components", registry["metadata"])
        self.assertIs(registry["metadata"]["real_reviewed_classes_exist"], False)
        blocks = availability_successor_domain_blocks(data, [])
        report = run_preflight(input_data=data, registry=registry)
        gate = next(g for g in report["gates"] if g["id"] == "class_registry")
        self.assertTrue(gate["details"]["registry_schema_valid"])
        self.assertEqual(report["counts"]["candidate"]["components"], 5)
        self.assertEqual(report["counts"]["candidate"]["providers"], 2)
        self.assertEqual(report["counts"]["informative"]["components"], 5)
        self.assertEqual(report["counts"]["informative"]["providers"], 2)
        self.assertEqual(report["counts"]["eligible"]["components"], 0)
        self.assertEqual(report["counts"]["eligible"]["providers"], 0)
        self.assertFalse(gate["passed"])
        self.assertEqual(report["verdict"], VERDICT_NOTREADY)
        joined = " ".join(gate["issues"])
        self.assertIn("real_reviewed_classes_exist", joined)
        self.assertIn("no truthy-string bypass", joined)
        self.assertIn("is not the eligible count", joined)
        self.assertIs(registry["metadata"]["real_reviewed_classes_exist"], False)

    def test_actual_dict_component_shape_is_five_candidates_zero_certified(self):
        data = _input(n_pairs=5)
        registry = _actual_shape_unreviewed_five()
        self.assertIsInstance(registry["metadata"]["components"], dict)
        self.assertEqual(len(registry["metadata"]["components"]), 5)
        schema = TransferClassRegistry.from_dict(registry).validate(
            known_models=[f"m{i}" for i in range(10)]
        )
        self.assertTrue(schema["valid"])
        self.assertIs(registry["metadata"]["real_reviewed_classes_exist"], False)
        for key, value in registry["metadata"]["components"].items():
            self.assertIsInstance(value, dict)
            self.assertEqual(value["review_status"], "relationship-supported-config-unresolved")
            self.assertIs(value["relationship_supported"], True)
            self.assertEqual(value["config_compatibility_status"], "unresolved")
            self.assertIs(value["fully_compatible_reviewed_class"], False)
            self.assertIn("original_component_id", value)
            self.assertIn("provider", value)
            self.assertIn("member_models", value)
            self.assertIn("sources", value)
        blocks = availability_successor_domain_blocks(data, [])
        report = run_preflight(input_data=data, registry=registry)
        gate = next(g for g in report["gates"] if g["id"] == "class_registry")
        self.assertTrue(gate["details"]["registry_schema_valid"])
        self.assertTrue(gate["details"]["component_identity_not_inferred_from_dict_keys"])
        self.assertEqual(gate["details"]["n_skipped_invalid_component_values"], 0)
        self.assertEqual(report["counts"]["candidate"]["components"], 5)
        self.assertEqual(report["counts"]["candidate"]["providers"], 2)
        self.assertEqual(report["counts"]["informative"]["components"], 5)
        self.assertEqual(report["counts"]["informative"]["providers"], 2)
        self.assertEqual(report["counts"]["eligible"]["components"], 0)
        self.assertEqual(report["counts"]["eligible"]["providers"], 0)
        self.assertEqual(len(blocks), report["availability_block_count"])
        self.assertFalse(gate["passed"])
        self.assertEqual(report["verdict"], VERDICT_NOTREADY)
        self.assertFalse(report["fit_authorized"])
        self.assertIs(gate["details"]["real_reviewed_classes_exist"], False)
        joined = " ".join(gate["issues"])
        self.assertIn("real_reviewed_classes_exist", joined)
        self.assertIn("is not the eligible count", joined)
        self.assertIn("5 components / 2 providers", joined)
        self.assertNotIn("dict keys are not original_component_id", joined)

    def test_component_dict_keys_are_not_identity(self):
        observed = [f"m{i}" for i in range(4)]
        registry = {
            "edition": "metadata-reviewed-candidate-2026-09-07",
            "singleton_fallback": True,
            "classes": [
                _strict_class("class-a", ["m0", "m1"]),
                _strict_class("class-b", ["m2", "m3"]),
            ],
            "metadata": {
                "real_reviewed_classes_exist": False,
                "confirmatory_criteria_locked": False,
                "components": {
                    "key-must-not-become-id": _component(
                        "value-original-id", ["m0", "m1"], "Anthropic", certified=False
                    ),
                    "another-non-identity-key": _component(
                        "second-value-id", ["m2", "m3"], "DeepSeek", certified=False
                    ),
                },
            },
        }
        blocks = [
            {
                "model_id": model_id,
                "has_target_outcome_availability": True,
                "has_successor_parent_evidence": True,
            }
            for model_id in observed
        ]
        gate = inspect_class_registry(registry, observed, [], blocks)
        self.assertEqual(gate.details["n_candidate_components"], 2)
        self.assertEqual(
            gate.details["candidate_component_ids"],
            ["value-original-id", "second-value-id"],
        )
        self.assertNotIn("key-must-not-become-id", gate.details["candidate_component_ids"])
        self.assertNotIn("another-non-identity-key", gate.details["candidate_component_ids"])
        self.assertEqual(gate.details["n_eligible_reviewed_classes"], 0)
        self.assertFalse(gate.passed)

    def test_invalid_component_values_are_skipped_and_reported(self):
        data = _input(n_pairs=2)
        good = _component("kept-from-value", ["m0", "m1"], "Anthropic", certified=False)
        registry = _schema_valid_unreviewed_five()
        registry["metadata"]["components"] = {
            "kept-key-is-ignored": good,
            "bad-string": "not-a-component",
            "bad-null": None,
            "bad-list": ["m0", "m1"],
            "bad-number": 5,
        }
        report = run_preflight(input_data=data, registry=registry)
        gate = next(g for g in report["gates"] if g["id"] == "class_registry")
        self.assertEqual(gate["details"]["n_skipped_invalid_component_values"], 4)
        self.assertEqual(len(gate["details"]["skipped_invalid_component_values"]), 4)
        self.assertEqual(report["counts"]["candidate"]["components"], 1)
        self.assertEqual(report["counts"]["candidate"]["ids"], ["kept-from-value"])
        self.assertNotIn("kept-key-is-ignored", report["counts"]["candidate"]["ids"])
        self.assertEqual(report["counts"]["eligible"]["components"], 0)
        joined = " ".join(gate["issues"])
        self.assertIn("skipped (fail closed", joined)
        self.assertIn("dict keys are not original_component_id", joined)
        self.assertIn("not-a-component", joined)
        self.assertFalse(gate["passed"])
        self.assertEqual(report["verdict"], VERDICT_NOTREADY)

        list_registry = _schema_valid_unreviewed_five()
        list_registry["metadata"]["components"] = [good, "also-invalid", None]
        list_gate = inspect_class_registry(
            list_registry,
            ["m0", "m1"],
            [],
            [],
        )
        self.assertEqual(list_gate.details["n_candidate_components"], 1)
        self.assertEqual(list_gate.details["n_skipped_invalid_component_values"], 2)
        self.assertTrue(any("metadata.components[1]" in issue for issue in list_gate.issues))
        self.assertTrue(any("skipped (fail closed)" in issue for issue in list_gate.issues))


class AvailabilityBlocks(unittest.TestCase):
    def test_loading_threshold_and_family_closure_match_repaired_prepare(self):
        data = _input(n_pairs=1)
        geometry = identify_family_closure_targets(data, "reasoning")
        self.assertEqual(geometry["domain_loading_threshold"], DEFAULT_DOMAIN_LOADING_THRESHOLD)
        self.assertEqual(geometry["primary_condition_ids"], ["reason-primary"])
        self.assertEqual(geometry["family_closure_condition_ids"], ["reason-family-low"])
        self.assertEqual(geometry["held_out_family_names"], ["reason-fam"])
        _train, eval_spec, manifest = prepare_holdout_experiment(
            input_data=data,
            target_successor_model="m1",
            target_domain="reasoning",
            exclude_gemini_from_confirmation=False,
        )
        self.assertEqual(eval_spec["primary_target_condition_ids"], geometry["primary_condition_ids"])
        self.assertEqual(eval_spec["family_closure_condition_ids"], geometry["family_closure_condition_ids"])
        self.assertEqual(eval_spec["held_out_families"], geometry["held_out_family_names"])
        self.assertEqual(manifest["domain_loading_threshold"], 0.25)

    def test_hle_cross_loading_is_a_knowledge_target_at_025(self):
        data = _input(n_pairs=1)
        data["benchmark_ids"][0] = "hle-no-tools"
        data["benchmark_family_ids"][0] = "hle"
        data["benchmark_family_ids"][1] = "hle"
        data["benchmark_domains"][0] = [0.0, 0.03, 0.65, 0.30, 0.02]
        data["benchmark_domains"][1] = [0.0, 0.0, 0.1, 0.0, 0.0]
        geometry = identify_family_closure_targets(data, "knowledge-information")
        self.assertIn("hle-no-tools", geometry["primary_condition_ids"])
        self.assertIn("hle", geometry["held_out_family_names"])

    def test_inventory_does_not_read_outcome_fields(self):
        data = _input(n_pairs=2)
        baseline = availability_successor_domain_blocks(data, [])
        self.assertGreater(len(baseline), 0)
        mutated = copy.deepcopy(data)
        for row in mutated["observations"]:
            row["y"] = 10 ** 6
            row["x"] = 10 ** 6
            row["per_task_counts"] = [99, 99]
        self.assertEqual(baseline, availability_successor_domain_blocks(mutated, []))
        for block in baseline:
            self.assertTrue(block["has_target_outcome_availability"])
            self.assertNotIn("y", block)
            self.assertNotIn("x", block)

    def test_subthreshold_same_family_row_is_closure_not_primary(self):
        data = _input(n_pairs=1)
        blocks = [
            b for b in availability_successor_domain_blocks(data, [])
            if b["model_id"] == "m1" and b["target_domain"] == "reasoning"
        ]
        self.assertEqual(len(blocks), 1)
        self.assertGreater(blocks[0]["n_primary_observation_rows"], 0)
        self.assertGreater(blocks[0]["n_family_closure_observation_rows"], 0)
        self.assertGreater(blocks[0]["n_retained_parent_observation_rows"], 0)


class LockExclusionSettings(unittest.TestCase):
    def test_related_release_lock_draft_is_unlocked_and_wrong_candidate(self):
        lock = (
            "**Status:** DRAFT — NOT LOCKED\n"
            "Candidate selected for confirmation: UNSET\n"
            "| A | Effective raw edge scale is root scale times a dimensionless change scale | Development sibling |\n"
            "| B | Effective raw edge scale has its own raw-unit prior | Development sibling |\n"
        )
        gate = inspect_lock_and_selection(lock, "PROPOSED — NOT LOCKED", None)
        self.assertFalse(gate.passed)
        joined = " ".join(gate.issues)
        self.assertIn("UNSET", joined)
        self.assertIn("random-walk", joined)
        self.assertIn("restricted class-prior", joined)
        self.assertTrue(gate.details["old_draft_random_walk_mismatch"])

    def test_heuristic_exclusion_is_not_confirmatory_provenance(self):
        gate = inspect_exclusion_provenance(None)
        self.assertFalse(gate.passed)
        heuristic = inspect_exclusion_provenance({
            "provenance": "conservative gemini development exclusions heuristic",
            "member_models": ["gemini-3.8-flash"],
            "confirmatory_certified": "true",
        })
        self.assertFalse(heuristic.passed)
        joined = " ".join(heuristic.issues)
        self.assertIn("heuristic", joined.lower())
        self.assertIn("truthy-string", joined)

    def test_certified_exclusion_requires_json_true(self):
        gate = inspect_exclusion_provenance(_certified_exclusion())
        self.assertTrue(gate.passed)

    def test_comparable_settings_reject_random_walk_and_unit_traits(self):
        bad = inspect_comparable_settings(
            None,
            {"family": "random_walk", "pooling": {"kind": "beta", "alpha": 1, "beta": 1}, "trait_structure": "correlated_unit"},
            {"pooling": {"kind": "fixed", "value": 0.5}},
        )
        self.assertFalse(bad.passed)
        joined = " ".join(bad.issues)
        self.assertIn("restricted", joined)
        self.assertIn("correlated", joined)
        ok = inspect_comparable_settings(None, None, None)
        self.assertTrue(ok.passed)

    def test_locked_json_wrong_floor_is_rejected(self):
        plan = _locked_plan()
        plan["informative_component_floor"] = 2
        plan["provider_floor"] = 1
        gate = inspect_lock_and_selection(
            {"locked": True, "candidate_family": "restricted", "candidate_pooling": {"kind": "beta", "alpha": 1, "beta": 1}},
            plan,
            _frozen_manifest(),
        )
        self.assertFalse(gate.passed)
        joined = " ".join(gate.issues)
        self.assertIn("10-component floor", joined)
        self.assertIn("3-provider floor", joined)


class FullReportAndCli(unittest.TestCase):
    def test_complete_metadata_still_notready_without_predictive_workflow(self):
        data = _input(n_pairs=10)
        report = run_preflight(
            input_data=data,
            registry=_reviewed_registry(10, 3),
            lock_payload={
                "locked": True,
                "candidate_family": "restricted",
                "candidate_pooling": {"kind": "beta", "alpha": 1.0, "beta": 1.0},
            },
            plan_payload=_locked_plan(),
            manifest=_frozen_manifest(),
            exclusion_metadata=_certified_exclusion(),
        )
        self.assertEqual(report["verdict"], VERDICT_NOTREADY)
        self.assertFalse(report["fit_authorized"])
        self.assertFalse(report["promotion_authorized"])
        passed = {g["id"]: g["passed"] for g in report["gates"]}
        self.assertEqual(report["counts"]["eligible"]["components"], 10)
        self.assertTrue(passed["class_registry"])
        self.assertTrue(passed["availability_family_closure_blocks"])
        self.assertTrue(passed["frozen_lock_and_selection"])
        self.assertTrue(passed["confirmation_exclusion_provenance"])
        self.assertTrue(passed["comparable_measurement_settings"])
        self.assertTrue(passed["nonpublishable_guards"])
        self.assertFalse(passed["predictive_calibration_workflow"])
        self.assertTrue(any("validate_predictive.py" in issue for issue in report["missing_prerequisites"]))
        self.assertIn("random-walk siblings A", report["candidate_choice"]["old_lock_draft_candidates"])
        self.assertIn("restricted class prior", report["candidate_choice"]["implemented_candidate"])

    def test_unlocked_or_insufficient_registry_forbids_fit(self):
        report = run_preflight(
            input_data=_input(n_pairs=10),
            registry=_reviewed_registry(2, 2),
            lock_payload="DRAFT — NOT LOCKED\nUNSET\nDevelopment sibling\nEffective raw edge scale\n",
            plan_payload="PROPOSED — NOT LOCKED",
            exclusion_metadata=_certified_exclusion(),
        )
        self.assertEqual(report["verdict"], VERDICT_NOTREADY)
        self.assertFalse(report["fit_authorized"])
        self.assertIn("class registry insufficient", report["no_fit_reasons"])
        self.assertIn("plan/lock unlocked", report["no_fit_reasons"])

    def test_cli_accepts_registry_path_and_does_not_require_private_agent_path(self):
        data = _input(n_pairs=1)
        registry = {
            "edition": "unreviewed-illustrative-0.1",
            "classes": [
                {
                    "class_id": "illustrative-pair",
                    "member_models": ["m0", "m1"],
                    "derivation_evidence": "Documented checkpoint update of identical architecture.",
                    "reference_configuration_compatibility": "Matched.",
                }
            ],
            "metadata": {"real_reviewed_classes_exist": False, "confirmatory_criteria_locked": False},
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            input_path = tmp_path / "input.json"
            registry_path = tmp_path / "registry.json"
            output_path = tmp_path / "preflight.json"
            input_path.write_text(json.dumps(data), encoding="utf-8")
            registry_path.write_text(json.dumps(registry), encoding="utf-8")
            buf = io.StringIO()
            with patch("sys.stdout", buf):
                code = preflight_main([
                    "--input", str(input_path),
                    "--registry", str(registry_path),
                    "--output", str(output_path),
                    "--no-default-lock",
                ])
            self.assertEqual(code, 2)
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["verdict"], VERDICT_NOTREADY)
            self.assertTrue(payload["gates"][0]["details"]["registry_supplied"])
            self.assertIn("VERDICT: NOTREADY", buf.getvalue())
            needed = " ".join(payload["next_needed_input"]).lower()
            self.assertIn("--registry", needed)
            self.assertIn("not a private agent path", needed)

    def test_implemented_vs_missing_does_not_claim_validation_passed(self):
        report = run_preflight()
        missing = " ".join(report["implemented_vs_missing"]["not_implemented"]).lower()
        implemented = " ".join(report["implemented_vs_missing"]["implemented_at_08af628"]).lower()
        self.assertIn("random-walk", missing)
        self.assertIn("beta(1,1)", implemented)
        self.assertIn("unit tests", " ".join(report["implemented_vs_missing"]["do_not_claim_success_from"]))
        self.assertNotEqual(report["verdict"], VERDICT_READY)

    def test_predictive_calibration_gate_with_schema_validated_results(self):
        # Code presence alone without calibration results fails the gate
        report_missing = run_preflight()
        gate_missing = [g for g in report_missing["gates"] if g["id"] == "predictive_calibration_workflow"][0]
        self.assertFalse(gate_missing["passed"])
        self.assertEqual(gate_missing["details"]["calibration_status"], "MISSING")
        self.assertTrue(gate_missing["details"]["paired_joint_production_predictive_scorer"])
        self.assertFalse(gate_missing["details"]["simulation_based_calibration_workflow"])

        # Smoke-only calibration fails
        smoke_results = {"n_replications": 5, "is_smoke": True, "passed": True}
        report_smoke = run_preflight(calibration_results=smoke_results)
        gate_smoke = [g for g in report_smoke["gates"] if g["id"] == "predictive_calibration_workflow"][0]
        self.assertFalse(gate_smoke["passed"])
        self.assertIn("smoke-only", " ".join(gate_smoke["issues"]))

        # Full passing calibration results passes the gate
        valid_results = {
            "design_hash": "abc",
            "replications_count": 100,
            "smoke_mode": False,
            "passed": True,
            "parameter_summaries": {
                "effort_mean": {
                    "ks_p_value": 0.45,
                    "empirical_coverage_90": 0.91,
                },
            },
        }
        report_valid = run_preflight(calibration_results=valid_results)
        gate_valid = [g for g in report_valid["gates"] if g["id"] == "predictive_calibration_workflow"][0]
        self.assertTrue(gate_valid["passed"])
        self.assertTrue(gate_valid["details"]["simulation_based_calibration_workflow"])
        self.assertEqual(gate_valid["details"]["calibration_status"], "PASSED")


if __name__ == "__main__":

    unittest.main()
