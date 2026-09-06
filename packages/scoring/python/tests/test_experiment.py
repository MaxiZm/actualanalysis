import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest

import numpy as np

from aci12.class_prior import pooling_kernel, resolve_class_prior
from aci12.experiment import (
    CONDITIONAL_IGNORABILITY_NOTICE,
    CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS,
    DEFAULT_DOMAIN_LOADING_THRESHOLD,
    DOCUMENTED_GEMINI_MOTIVATING_COMPONENT_MODELS,
    NON_PUBLISHABLE_METADATA,
    ClassPriorAdapter,
    MeasurementSpecification,
    SystemSpecification,
    TaskPopulation,
    TransferClass,
    TransferClassRegistry,
    base_model_id,
    build_family_index_name_map,
    compute_canonical_data_hash,
    diagnose_system_geometry,
    is_gemini_component,
    main as experiment_cli_main,
    observation_metric_family_and_score,
    parse_observation_metric,
    prepare_holdout_experiment,
    select_primary_scoring_observations,
    sanitize_for_strict_json,
    strict_json_dumps,
)


class TestExperiment(unittest.TestCase):
    """Native unittest test suite for ACI 1.5.0 experiment preparation and candidate tooling."""

    def setUp(self):
        toy_path = Path(__file__).parent / "toy-input.json"
        self.toy_data = json.loads(toy_path.read_text(encoding="utf-8"))

    def test_system_specification_preserves_unresolved(self):
        spec = SystemSpecification(
            model_id="synth-model-1",
            inference_configuration=None,
            unresolved_fields=["effort", "harness"],
            operating_target="configured_performance",
        )
        d = spec.to_dict()
        self.assertEqual(d["model_id"], "synth-model-1")
        self.assertIsNone(d["inference_configuration"])
        self.assertIn("effort", d["unresolved_fields"])
        self.assertEqual(d["operating_target"], "configured_performance")
        self.assertTrue(d["is_experimental"])
        self.assertFalse(d["is_publishable"])

    def test_transfer_class_registry_validation_synthetic(self):
        # Valid synthetic multi-class registry
        reg_valid = TransferClassRegistry(
            classes=[
                TransferClass(
                    class_id="synth-series-alpha",
                    member_models=["synth-alpha-v1", "synth-alpha-v2"],
                    derivation_evidence="Documented continuous checkpoint update of identical base architecture.",
                    reference_configuration_compatibility="Matched default standard reference configuration.",
                )
            ],
            edition="unreviewed-synthetic-0.1",
            singleton_fallback=True,
        )
        report = reg_valid.validate(
            known_models=[
                "synth-alpha-v1",
                "synth-alpha-v2",
                "synth-gamma-isolated",
            ]
        )
        self.assertTrue(report["valid"])
        self.assertEqual(report["multi_member_classes"], 1)
        self.assertEqual(report["singletons_added"], ["synth-gamma-isolated"])

        # Partition violation (duplicate model)
        reg_dup = TransferClassRegistry(
            classes=[
                TransferClass(
                    class_id="class-1",
                    member_models=["m1", "m2"],
                    derivation_evidence="Documented shared architecture.",
                    reference_configuration_compatibility="Equal",
                ),
                TransferClass(
                    class_id="class-2",
                    member_models=["m2", "m3"],
                    derivation_evidence="Documented shared architecture.",
                    reference_configuration_compatibility="Equal",
                ),
            ]
        )
        report_dup = reg_dup.validate()
        self.assertFalse(report_dup["valid"])
        self.assertTrue(any("Partition violation" in issue for issue in report_dup["issues"]))

        # Rejection of guessed brand classes
        reg_brand = TransferClassRegistry(
            classes=[
                TransferClass(
                    class_id="google",
                    member_models=["m1", "m2"],
                    derivation_evidence="shared brand models",
                    reference_configuration_compatibility="Unknown",
                )
            ]
        )
        report_brand = reg_brand.validate()
        self.assertFalse(report_brand["valid"])
        self.assertTrue(any("guessed brand class" in issue for issue in report_brand["issues"]))

    def test_class_prior_adapter_grok_contract(self):
        reg = TransferClassRegistry(
            classes=[
                TransferClass(
                    class_id="synth-pair",
                    member_models=["synth-a@std-common", "synth-b@max-common"],
                    derivation_evidence="Documented sister checkpoints",
                    reference_configuration_compatibility="Matched standard",
                ),
                TransferClass(
                    class_id="singleton:synth-c",
                    member_models=["synth-c"],
                    derivation_evidence="Singleton",
                    reference_configuration_compatibility="Isolated",
                    is_singleton=True,
                ),
            ],
            edition="unreviewed-illustrative-0.1",
            singleton_fallback=True,
        )

        # 1. Beta pooling contract
        payload = ClassPriorAdapter.build_grok_class_prior_payload(
            registry=reg,
            pooling={"kind": "beta", "alpha": 1.0, "beta": 1.0},
        )
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["family"], "restricted")
        self.assertEqual(payload["edition"], "unreviewed-illustrative-0.1")
        self.assertEqual(payload["pooling"], {"kind": "beta", "alpha": 1.0, "beta": 1.0})
        # Singletons must be omitted from partition
        self.assertEqual(len(payload["partition"]), 1)
        self.assertEqual(payload["partition"][0]["class_id"], "synth-pair")
        self.assertEqual(payload["partition"][0]["model_ids"], ["synth-a", "synth-b"])
        self.assertIn("registry_sha256", payload)

        # 2. Fixed pooling contract
        payload_fixed = ClassPriorAdapter.build_grok_class_prior_payload(
            registry=reg,
            pooling={"kind": "fixed", "value": 0.0},
        )
        self.assertEqual(payload_fixed["pooling"], {"kind": "fixed", "value": 0.0})

        # 3. Rejection of invalid pooling
        with self.assertRaises(ValueError) as ctx:
            ClassPriorAdapter.build_grok_class_prior_payload(
                registry=reg,
                pooling={"kind": "unsupported"},
            )
        self.assertIn("unsupported pooling kind", str(ctx.exception).lower())

    def test_prepare_holdout_experiment_leakage_and_gemini_exclusion(self):
        # Successor: model-b on software-code domain (benchmark 1: code-benchmark, family: code)
        train_data, eval_spec, manifest = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="software-code",
            exclude_gemini_from_confirmation=True,
            seed=42,
        )

        # 1. Check holdout row count
        self.assertEqual(len(eval_spec["held_out_observations"]), 1)
        held_obs = eval_spec["held_out_observations"][0]
        self.assertEqual(held_obs["benchmark_index"], 1)

        # 2. DATA LEAKAGE AUDIT: Confirm ZERO rows for model-b on code-benchmark remain in training
        for obs in train_data["observations"]:
            sys_id = train_data["system_ids"][obs["system_index"]]
            if "model-b" in sys_id:
                self.assertNotEqual(obs["benchmark_index"], 1)

        # 3. ACTUAL GEMINI EXCLUSION AUDIT using documented component members
        toy_with_gemini = copy.deepcopy(self.toy_data)
        toy_with_gemini["system_ids"].extend(["gemini-3.7-flash@std-common", "gemini-3.8-flash@max-common"])
        toy_with_gemini["n_systems"] = 4
        toy_with_gemini["n_models"] = 4
        toy_with_gemini["system_model_index"].extend([2, 3])
        toy_with_gemini["system_training_cutoff"].extend([None, None])
        toy_with_gemini["system_profile_index"].extend([0, 1])
        toy_with_gemini["system_is_fixed_effort"] = [True, True, True, True]
        toy_with_gemini["calibration_panel_system_ids"].append("gemini-3.7-flash@std-common")
        toy_with_gemini["observations"].append(
            {"cell_index": 4, "system_index": 2, "benchmark_index": 0, "provenance_index": 0, "y": 1.0, "variance": 0.1, "likelihood": "normal"}
        )
        toy_with_gemini["cell_system_index"].append(2)
        toy_with_gemini["cell_benchmark_index"].append(0)

        train_gem_excl, eval_gem_excl, manifest_gem_excl = prepare_holdout_experiment(
            input_data=toy_with_gemini,
            target_successor_model="model-b",
            target_domain="software-code",
            exclude_gemini_from_confirmation=True,
        )

        # Confirm ZERO Gemini systems exist in training
        self.assertFalse(any(is_gemini_component(s.split("@")[0].strip()) for s in train_gem_excl["system_ids"]))
        # Confirm ZERO Gemini observations exist in training
        for obs in train_gem_excl["observations"]:
            sys_id = train_gem_excl["system_ids"][obs["system_index"]]
            self.assertFalse(is_gemini_component(sys_id.split("@")[0].strip()))
        # Confirm Gemini systems removed from calibration panel
        self.assertFalse(any(is_gemini_component(s.split("@")[0].strip()) for s in train_gem_excl.get("calibration_panel_system_ids", [])))
        # Confirm Gemini exclusion recorded
        self.assertTrue(manifest_gem_excl["gemini_exclusion_applied"])
        self.assertEqual(eval_gem_excl["gemini_excluded_observations_count"], 1)

    def test_absent_observations_fails_closed(self):
        # model-b has no observations in knowledge-information or agentic in toy_data
        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="knowledge-information",
            )
        self.assertIn("held-out observation count is 0", str(ctx.exception).lower())

    def test_stress_masks_and_scenarios(self):
        # Toy remaining successor row has only 1 control peer → insufficient, not masked.
        train_poor, eval_poor, manifest_poor = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="reasoning",
            stress_mask="poor_outcome",
        )
        self.assertEqual(eval_poor["poor_outcome_masked_count"], 0)
        self.assertGreater(manifest_poor["poor_outcome"]["insufficient_peer_data_count"], 0)
        self.assertTrue(any("model-b" in sid for sid in train_poor["system_ids"]))

        train_miss, eval_miss, _ = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="reasoning",
            stress_mask="missing_domain",
        )
        self.assertEqual(eval_miss["stress_mask"], "missing_domain")

        train_omission, _, _ = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="software-code",
            scenario="omission",
        )
        self.assertEqual(len(train_omission["class_prior"]["partition"]), 0)

        train_wrong, eval_wrong, manifest_wrong = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="software-code",
            scenario="wrong_class",
            wrong_class_partner="model-a",
        )
        partition_ids = [m for p in train_wrong["class_prior"]["partition"] for m in p["model_ids"]]
        self.assertEqual(sorted(set(partition_ids)), ["model-a", "model-b"])
        self.assertEqual(len(partition_ids), 2)
        self.assertEqual(manifest_wrong["wrong_class_partner"], "model-a")
        self.assertEqual(eval_wrong["wrong_class_partner"], "model-a")

    def test_immutable_hash_checks_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)
            out_dir = tmp_path / "exp_hash_test"
            out_dir.mkdir()
            train_data, _, manifest = prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="software-code",
            )
            train_path = out_dir / "train_input.json"
            train_path.write_text(strict_json_dumps(train_data, indent=2))
            manifest_path = out_dir / "manifest.json"
            manifest_path.write_text(strict_json_dumps(manifest, indent=2))

            # Case 1: Tamper with train_input.json by modifying 1 parameter
            tampered_data = copy.deepcopy(train_data)
            tampered_data["seed"] = 999999
            train_path.write_text(strict_json_dumps(tampered_data, indent=2))

            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "run-candidate",
                    "--input", str(train_path),
                    "--output-dir", str(tmp_path / "candidate_out"),
                    "--dev-mode",
                ])
            self.assertIn("immutable hash verification failed", str(ctx.exception).lower())

            # Case 2: Untampered dataset with manifest missing must fail closed unless unfrozen flag passed
            manifest_path.unlink()
            train_path.write_text(strict_json_dumps(train_data, indent=2))
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "run-candidate",
                    "--input", str(train_path),
                    "--output-dir", str(tmp_path / "candidate_out_no_manifest"),
                    "--dev-mode",
                ])
            self.assertIn("immutable manifest required", str(ctx.exception).lower())

            # Case 3: Empty expected train_data_hash in manifest must fail closed
            manifest_empty = copy.deepcopy(manifest)
            manifest_empty["train_data_hash"] = ""
            manifest_path.write_text(strict_json_dumps(manifest_empty, indent=2))
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "run-candidate",
                    "--input", str(train_path),
                    "--output-dir", str(tmp_path / "candidate_out_empty_hash"),
                    "--dev-mode",
                ])
            self.assertIn("empty or missing train_data_hash", str(ctx.exception).lower())

    def test_candidate_runner_fails_closed_without_class_prior(self):
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)
            no_prior_path = tmp_path / "baseline_no_prior.json"
            data_no_prior = copy.deepcopy(self.toy_data)
            if "class_prior" in data_no_prior:
                del data_no_prior["class_prior"]
            no_prior_path.write_text(strict_json_dumps(data_no_prior))

            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "run-candidate",
                    "--input", str(no_prior_path),
                    "--output-dir", str(tmp_path / "out_baseline"),
                    "--dev-mode",
                    "--allow-unfrozen-dev-run",
                ])
            self.assertIn("class_prior is missing or not enabled", str(ctx.exception).lower())

    def test_candidate_runner_rejects_unreviewed_confirmation_without_dev_mode(self):
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)
            train_data, _, manifest = prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="software-code",
            )
            train_path = tmp_path / "train_input.json"
            train_path.write_text(strict_json_dumps(train_data))
            (tmp_path / "manifest.json").write_text(strict_json_dumps(manifest))

            # Running without --dev-mode MUST reject unreviewed confirmation
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "run-candidate",
                    "--input", str(train_path),
                    "--output-dir", str(tmp_path / "out_confirm"),
                ])
            self.assertIn("unreviewed confirmatory evaluation rejected", str(ctx.exception).lower())

    def test_output_cannot_overwrite_input(self):
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)
            input_file = tmp_path / "train_input.json"
            input_file.write_text(strict_json_dumps(self.toy_data))

            # CLI prepare: specifying output dir containing train_input.json matching input_file
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "prepare",
                    "--input", str(input_file),
                    "--output-dir", str(tmp_path),
                    "--target-model", "model-b",
                    "--target-domain", "software-code",
                ])
            self.assertIn("would overwrite input file", str(ctx.exception).lower())

            # CLI diagnose-geometry: output == input
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "diagnose-geometry",
                    "--input", str(input_file),
                    "--output", str(input_file),
                ])
            self.assertIn("cannot overwrite input file", str(ctx.exception).lower())

            # CLI run-candidate: output dir containing candidate_train_input.json
            cand_in = tmp_path / "candidate_train_input.json"
            cand_in.write_text(strict_json_dumps(self.toy_data))
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "run-candidate",
                    "--input", str(cand_in),
                    "--output-dir", str(tmp_path),
                    "--dev-mode",
                    "--allow-unfrozen-dev-run",
                ])
            self.assertIn("would overwrite input file", str(ctx.exception).lower())

    def test_strict_json_compliance(self):
        data_with_inf = {
            "val_finite": 1.23,
            "val_nan": float("nan"),
            "val_inf": float("inf"),
            "val_neginf": float("-inf"),
            "nested": [float("nan"), 42.0],
        }
        sanitized = sanitize_for_strict_json(data_with_inf)
        self.assertEqual(sanitized["val_finite"], 1.23)
        self.assertIsNone(sanitized["val_nan"])
        self.assertIsNone(sanitized["val_inf"])
        self.assertIsNone(sanitized["val_neginf"])
        self.assertEqual(sanitized["nested"], [None, 42.0])

        dumped = strict_json_dumps(data_with_inf)
        parsed = json.loads(dumped)
        self.assertIsNone(parsed["val_nan"])
        self.assertIsNone(parsed["val_inf"])

    def test_gemini_motivating_component_membership(self):
        # Verified against documented releases from Audit 1.4.2 / Proposal §12
        self.assertEqual(CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS, DOCUMENTED_GEMINI_MOTIVATING_COMPONENT_MODELS)
        for m in ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.1-pro", "gemini-1.5-pro"]:
            self.assertTrue(is_gemini_component(m))

        # Unrelated models must not be matched
        for m in ["claude-3.5-sonnet", "gpt-4o", "qwen-2.5", "deepseek-v3"]:
            self.assertFalse(is_gemini_component(m))

        # Custom component membership testing
        custom = frozenset(["special-gemini-variant"])
        self.assertTrue(is_gemini_component("special-gemini-variant", custom_component_members=custom))
        self.assertFalse(is_gemini_component("gemini-3.8-flash", custom_component_members=custom))

        # Unreviewed Gemini confirmation rejection in prepare
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)
            input_file = tmp_path / "toy.json"
            input_file.write_text(strict_json_dumps(self.toy_data))
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "prepare",
                    "--input", str(input_file),
                    "--output-dir", str(tmp_path / "out_prep"),
                    "--target-model", "model-b",
                    "--target-domain", "software-code",
                    "--include-gemini-in-confirmation",
                ])
            self.assertIn("unreviewed confirmatory selection rejected", str(ctx.exception).lower())

            # Confirmatory evaluation fails closed without metadata
            with self.assertRaises(ValueError) as ctx:
                experiment_cli_main([
                    "prepare",
                    "--input", str(input_file),
                    "--output-dir", str(tmp_path / "out_prep2"),
                    "--target-model", "model-b",
                    "--target-domain", "software-code",
                    "--confirmatory",
                ])
            self.assertIn("confirmatory", str(ctx.exception).lower())

            # Confirmatory evaluation with caller-supplied frozen metadata succeeds
            meta_file = tmp_path / "gemini_meta.json"
            meta_file.write_text(json.dumps({
                "provenance": "audit_1.4.2_frozen_panel",
                "member_models": ["model-a"],
            }))
            out_conf = tmp_path / "out_conf"
            ret = experiment_cli_main([
                "prepare",
                "--input", str(input_file),
                "--output-dir", str(out_conf),
                "--target-model", "model-b",
                "--target-domain", "software-code",
                "--confirmatory",
                "--gemini-component-metadata", str(meta_file),
            ])
            self.assertEqual(ret, 0)
            manifest = json.loads((out_conf / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["gemini_exclusion_status"], "caller_supplied_frozen_metadata")

    def test_geometry_cli_duplicate_row_invariance(self):
        """Condition-level loading geometry must be invariant under 5x duplicate observation rows."""
        target_sys = "model-a@max"
        rep1 = diagnose_system_geometry(self.toy_data, target_sys)

        # Create dataset with observations duplicated 5x
        dup_data = copy.deepcopy(self.toy_data)
        dup_obs = []
        for obs in self.toy_data["observations"]:
            for _ in range(5):
                dup_obs.append(copy.deepcopy(obs))
        dup_data["observations"] = dup_obs

        rep5 = diagnose_system_geometry(dup_data, target_sys)

        # Observation count scales 5x, unique measured directions count is identical
        self.assertEqual(rep5["source_observation_count"], 5 * rep1["source_observation_count"])
        self.assertEqual(rep5["unique_measured_directions_count"], rep1["unique_measured_directions_count"])

        # Geometry invariants: eigenvalues, effective rank, null space basis, cone status
        self.assertEqual(rep5["information_analysis"]["effective_rank"], rep1["information_analysis"]["effective_rank"])
        np.testing.assert_allclose(
            rep5["information_analysis"]["eigenvalues"],
            rep1["information_analysis"]["eigenvalues"],
            rtol=1e-10,
            atol=1e-10,
        )
        np.testing.assert_allclose(
            rep5["information_analysis"]["null_space_basis"],
            rep1["information_analysis"]["null_space_basis"],
            rtol=1e-10,
            atol=1e-10,
        )
        self.assertEqual(
            rep5["cone_membership_diagnostic"]["in_cone"],
            rep1["cone_membership_diagnostic"]["in_cone"],
        )
        self.assertEqual(rep5["geometry_type"], "condition_level_loading_geometry")
        self.assertEqual(rep5["variance_specification"], "declared_equal_unit_illustrative_variance")
        self.assertIn("does NOT perform empirical Fisher", rep5["estimation_notice"])

        # Invariance also verified via CLI execution
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)
            p1 = tmp_path / "d1.json"
            p5 = tmp_path / "d5.json"
            o1 = tmp_path / "geom1.json"
            o5 = tmp_path / "geom5.json"
            p1.write_text(strict_json_dumps(self.toy_data))
            p5.write_text(strict_json_dumps(dup_data))
            ret1 = experiment_cli_main(["diagnose-geometry", "--input", str(p1), "--target-system", target_sys, "--output", str(o1)])
            ret5 = experiment_cli_main(["diagnose-geometry", "--input", str(p5), "--target-system", target_sys, "--output", str(o5)])
            self.assertEqual(ret1, 0)
            self.assertEqual(ret5, 0)
            g1 = json.loads(o1.read_text(encoding="utf-8"))
            g5 = json.loads(o5.read_text(encoding="utf-8"))
            self.assertEqual(g5["information_analysis"]["effective_rank"], g1["information_analysis"]["effective_rank"])
            np.testing.assert_allclose(
                g5["information_analysis"]["eigenvalues"],
                g1["information_analysis"]["eigenvalues"],
                rtol=1e-10,
                atol=1e-10,
            )

    def test_cli_subcommands(self):
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)

            # 1. CLI validate-registry
            reg_path = tmp_path / "registry.json"
            reg = TransferClassRegistry(
                classes=[
                    TransferClass(
                        class_id="synth-pair",
                        member_models=["model-a", "model-b"],
                        derivation_evidence="Documented shared architecture",
                        reference_configuration_compatibility="Matched",
                    )
                ],
                edition="unreviewed-synthetic-0.1",
            )
            reg_path.write_text(strict_json_dumps(reg.to_dict()))

            ret_val = experiment_cli_main(["validate-registry", "--registry", str(reg_path)])
            self.assertEqual(ret_val, 0)

            # 2. CLI prepare
            toy_input_path = tmp_path / "toy.json"
            toy_input_path.write_text(strict_json_dumps(self.toy_data))
            out_dir = tmp_path / "prep_out"

            ret_prep = experiment_cli_main([
                "prepare",
                "--input", str(toy_input_path),
                "--registry", str(reg_path),
                "--target-model", "model-b",
                "--target-domain", "software-code",
                "--output-dir", str(out_dir),
            ])
            self.assertEqual(ret_prep, 0)
            self.assertTrue((out_dir / "train_input.json").exists())
            self.assertTrue((out_dir / "manifest.json").exists())

            # 3. CLI diagnose-geometry
            geom_out = tmp_path / "geom.json"
            ret_geom = experiment_cli_main([
                "diagnose-geometry",
                "--input", str(toy_input_path),
                "--output", str(geom_out),
            ])
            self.assertEqual(ret_geom, 0)
            self.assertTrue(geom_out.exists())
            geom_data = json.loads(geom_out.read_text(encoding="utf-8"))
            self.assertEqual(geom_data["geometry_type"], "condition_level_loading_geometry")
            self.assertEqual(geom_data["variance_specification"], "declared_equal_unit_illustrative_variance")
            self.assertIn("source_observation_count", geom_data)
            self.assertIn("unique_measured_directions_count", geom_data)
            self.assertIn("estimation_notice", geom_data)
            self.assertIn("conditioning_assumptions", geom_data)
            self.assertIn("task_utility_notice", geom_data)


def _accepted_input_path() -> Path | None:
    env = os.environ.get("ACI_ACCEPTED_INPUT")
    if env:
        env_path = Path(env)
        if env_path.is_file():
            return env_path
    start = Path(__file__).resolve()
    for parent in [start.parent, *start.parents]:
        candidate = parent / "docs" / "audits" / "1.4.3-effort-coverage" / "accepted-input.json"
        if candidate.is_file():
            return candidate
    return None


def _obs(system_index, benchmark_index, likelihood, **fields):
    row = {
        "cell_index": system_index * 10 + benchmark_index,
        "system_index": system_index,
        "benchmark_index": benchmark_index,
        "provenance_index": 0,
        "likelihood": likelihood,
    }
    row.update(fields)
    return row


class TestExperimentRepair(unittest.TestCase):
    """Fixes 1, 2, 3, 4, 6 against the a208898 experiment-prepare baseline."""

    def setUp(self):
        toy_path = Path(__file__).parent / "toy-input.json"
        self.toy_data = json.loads(toy_path.read_text(encoding="utf-8"))

    def test_family_index_name_map_is_zip_of_condition_aligned_ids(self):
        mapping = build_family_index_name_map(
            ["arc-agi", "deepswe", "deepswe", "matharena-composite"],
            [0, 1, 1, 2],
        )
        self.assertEqual(mapping, {0: "arc-agi", 1: "deepswe", 2: "matharena-composite"})
        with self.assertRaises(ValueError):
            build_family_index_name_map(["a", "b"], [0])
        with self.assertRaises(ValueError):
            build_family_index_name_map(["deepswe", "frontiermath"], [0, 0])

    def test_input_immutability_and_eval_indexes_after_gemini_exclusion(self):
        original = copy.deepcopy(self.toy_data)
        payload = copy.deepcopy(self.toy_data)
        payload["system_ids"].extend(["gemini-3.7-flash@std-common", "gemini-3.8-flash@max-common"])
        payload["n_systems"] = 4
        payload["n_models"] = 4
        payload["system_model_index"].extend([2, 3])
        payload["system_training_cutoff"].extend([None, None])
        payload["system_profile_index"].extend([0, 1])
        payload["system_is_fixed_effort"] = [True] * 4
        payload["calibration_panel_system_ids"].append("gemini-3.7-flash@std-common")
        payload["observations"].append(_obs(2, 0, "normal", y=1.0, variance=0.1))
        snapshot = copy.deepcopy(payload)

        train, eval_spec, _manifest = prepare_holdout_experiment(
            input_data=payload,
            target_successor_model="model-b",
            target_domain="software-code",
            exclude_gemini_from_confirmation=True,
        )
        self.assertEqual(payload, snapshot)
        self.assertEqual(self.toy_data, original)
        self.assertEqual(DEFAULT_DOMAIN_LOADING_THRESHOLD, 0.25)

        self.assertEqual(eval_spec["index_semantics"]["system_index"][:5], "Train")
        self.assertIn("original_system_index", eval_spec["index_semantics"])
        for row in eval_spec["held_out_observations"]:
            self.assertIn("system_id", row)
            self.assertIn("model_id", row)
            self.assertIn("benchmark_id", row)
            self.assertNotIn("cell_index", row)
            self.assertIn("original_cell_index", row)
            self.assertEqual(row["system_index"], row["train_system_index"])
            self.assertEqual(row["benchmark_index"], row["train_benchmark_index"])
            self.assertEqual(row["benchmark_index"], row["original_benchmark_index"])
            self.assertGreaterEqual(row["train_system_index"], 0)
            self.assertLess(row["train_system_index"], train["n_systems"])
            self.assertEqual(train["system_ids"][row["train_system_index"]], row["system_id"])
            self.assertEqual(row["model_id"], base_model_id(row["system_id"]))
            train_cells = set(zip(train["cell_system_index"], train["cell_benchmark_index"]))
            self.assertNotIn((row["train_system_index"], row["benchmark_index"]), train_cells)
            self.assertEqual(row["held_out_role"], "training_removal_union")

        held = eval_spec["held_out_observations"][0]
        self.assertEqual(held["system_id"], "model-b@max")
        self.assertEqual(held["prediction_index"], 0)

    def test_excluded_target_fails_closed_and_cell_less_target_is_preserved(self):
        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="gemini-3.8-flash",
                target_domain="software-code",
            )
        self.assertIn("not found", str(ctx.exception).lower())

        gemini_target = copy.deepcopy(self.toy_data)
        gemini_target["system_ids"][1] = "gemini-3.8-flash@max-common"
        gemini_target["n_models"] = 2
        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=gemini_target,
                target_successor_model="gemini-3.8-flash",
                target_domain="software-code",
                exclude_gemini_from_confirmation=True,
            )
        self.assertIn("exclusion set", str(ctx.exception).lower())

        cell_less = copy.deepcopy(self.toy_data)
        # model-b only has the code observation; holding out software-code leaves it cell-less.
        cell_less["observations"] = [
            obs for obs in cell_less["observations"] if not (obs["system_index"] == 1 and obs["benchmark_index"] == 0)
        ]
        cell_less["cell_system_index"] = [0, 0, 1]
        cell_less["cell_benchmark_index"] = [0, 1, 1]
        train, eval_spec, _ = prepare_holdout_experiment(
            input_data=cell_less,
            target_successor_model="model-b",
            target_domain="software-code",
            exclude_gemini_from_confirmation=False,
        )
        self.assertTrue(any(s.startswith("model-b@") for s in train["system_ids"]))
        target_sys = [i for i, s in enumerate(train["system_ids"]) if s.startswith("model-b@")]
        self.assertTrue(target_sys)
        self.assertFalse(any(cs == target_sys[0] for cs in train["cell_system_index"]))
        self.assertEqual(eval_spec["held_out_observation_count"], 1)
        self.assertEqual(eval_spec["held_out_observations"][0]["train_system_index"], target_sys[0])

    def test_wrong_class_requires_observed_partner_and_off_diagonal_pooling(self):
        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="software-code",
                scenario="wrong_class",
            )
        self.assertIn("explicit observed wrong-class partner", str(ctx.exception).lower())

        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="software-code",
                scenario="wrong_class",
                wrong_class_partner="absent-model",
            )
        self.assertIn("absent", str(ctx.exception).lower())

        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="software-code",
                scenario="wrong_class",
                wrong_class_partner="model-b",
            )
        self.assertIn("current target", str(ctx.exception).lower())

        gemini_partner = copy.deepcopy(self.toy_data)
        gemini_partner["system_ids"].append("gemini-3.8-flash@max-common")
        gemini_partner["n_systems"] = 3
        gemini_partner["n_models"] = 3
        gemini_partner["system_model_index"].append(2)
        gemini_partner["system_training_cutoff"].append(None)
        gemini_partner["system_profile_index"].append(1)
        gemini_partner["system_is_fixed_effort"] = [True, True, True]
        gemini_partner["observations"].append(_obs(2, 0, "normal", y=0.1, variance=0.1))
        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=gemini_partner,
                target_successor_model="model-b",
                target_domain="software-code",
                scenario="wrong_class",
                wrong_class_partner="gemini-3.8-flash",
                exclude_gemini_from_confirmation=True,
            )
        self.assertIn("excluded", str(ctx.exception).lower())

        same_class = TransferClassRegistry(
            classes=[
                TransferClass(
                    class_id="already-together",
                    member_models=["model-a", "model-b"],
                    derivation_evidence="Documented shared architecture evidence.",
                    reference_configuration_compatibility="Matched",
                )
            ]
        )
        with self.assertRaises(ValueError) as ctx:
            prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="software-code",
                registry=same_class,
                scenario="wrong_class",
                wrong_class_partner="model-a",
            )
        self.assertIn("already in the target's current class", str(ctx.exception).lower())

        keep_payload = copy.deepcopy(self.toy_data)
        keep_payload["system_ids"].append("model-c@max")
        keep_payload["n_systems"] = 3
        keep_payload["n_models"] = 3
        keep_payload["system_model_index"].append(2)
        keep_payload["system_training_cutoff"].append(None)
        keep_payload["system_profile_index"].append(1)
        keep_payload["system_is_fixed_effort"] = [True, True, True]
        keep_payload["observations"].append(_obs(2, 0, "normal", y=0.3, variance=0.1))
        keep_payload["cell_system_index"].append(2)
        keep_payload["cell_benchmark_index"].append(0)
        keep_members = TransferClassRegistry(
            classes=[
                TransferClass(
                    class_id="target-line",
                    member_models=["model-b", "model-c"],
                    derivation_evidence="Documented shared architecture evidence.",
                    reference_configuration_compatibility="Matched",
                    is_singleton=False,
                ),
                TransferClass(
                    class_id="partner-line",
                    member_models=["model-a"],
                    derivation_evidence="Partner singleton before sensitivity assignment.",
                    reference_configuration_compatibility="Matched",
                    is_singleton=True,
                ),
            ]
        )
        train, eval_spec, manifest = prepare_holdout_experiment(
            input_data=keep_payload,
            target_successor_model="model-b",
            target_domain="software-code",
            registry=keep_members,
            scenario="wrong_class",
            wrong_class_partner="model-a",
        )
        partition = train["class_prior"]["partition"]
        flat = [m for p in partition for m in p["model_ids"]]
        self.assertEqual(len(flat), len(set(flat)))
        self.assertIn("model-a", flat)
        self.assertIn("model-b", flat)
        self.assertNotIn("model-c", flat)
        partner_class = next(p for p in partition if "model-a" in p["model_ids"])
        self.assertIn("model-b", partner_class["model_ids"])
        self.assertEqual(manifest["wrong_class_partner_source"], "explicit_argument")

        spec = resolve_class_prior(train)
        assignments = spec.assignment_map()
        self.assertEqual(assignments["model-a"], assignments["model-b"])
        self.assertFalse(assignments["model-b"].startswith("singleton:"))
        self.assertTrue(assignments["model-c"].startswith("singleton:"))
        kernel = pooling_kernel(np.asarray(spec.model_class_index), 0.5)
        i = spec.model_ids.index("model-b")
        j = spec.model_ids.index("model-a")
        self.assertGreater(float(kernel[i, j]), 0.0)
        self.assertNotEqual(i, j)

    def test_poor_outcome_within_condition_peers_counts_and_affine_invariance(self):
        data = {
            "n_models": 4,
            "n_systems": 4,
            "n_benchmarks": 3,
            "n_families": 3,
            "system_ids": ["ctrl-a@max", "ctrl-b@max", "ctrl-c@max", "target-m@max"],
            "benchmark_ids": ["cont-bench", "count-bench", "hold-bench"],
            "domains": ["agentic", "software-code", "reasoning", "knowledge-information", "communication-professional"],
            "calibration_panel_system_ids": ["ctrl-a@max"],
            "system_training_cutoff": [None, None, None, None],
            "benchmark_family_ids": ["cont", "count", "hold"],
            "benchmark_holdout": ["private", "private", "private"],
            "benchmark_public_release_date": [None, None, None],
            "system_model_index": [0, 1, 2, 3],
            "system_profile_index": [1, 1, 1, 1],
            "system_is_fixed_effort": [True, True, True, True],
            "benchmark_family_index": [0, 1, 2],
            "benchmark_domains": [
                [0, 1, 0, 0, 0],
                [0, 1, 0, 0, 0],
                [0, 0, 1, 0, 0],
            ],
            "cell_system_index": [0, 1, 2, 3, 0, 1, 3, 3],
            "cell_benchmark_index": [0, 0, 0, 0, 1, 1, 1, 2],
            "observations": [
                _obs(0, 0, "normal", y=1.0, variance=0.1),
                _obs(1, 0, "normal", y=1.1, variance=0.1),
                _obs(2, 0, "normal", y=1.2, variance=0.1),
                _obs(3, 0, "normal", y=-5.0, variance=0.1),
                _obs(0, 1, "a_single", x=9, n_tasks=10, k_trials=1),
                _obs(1, 1, "a_single", x=8, n_tasks=10, k_trials=1),
                _obs(3, 1, "a_single", x=1, n_tasks=10, k_trials=1),
                _obs(3, 2, "normal", y=0.4, variance=0.1),
            ],
            "priors": self.toy_data["priors"],
            "inference": self.toy_data["inference"],
            "seed": 7,
            "progress_bar": False,
        }
        self.assertEqual(observation_metric_family_and_score(data["observations"][4]), ("count", 0.9))
        self.assertIsNone(observation_metric_family_and_score(_obs(0, 1, "a_single", n_tasks=10)))

        train, eval_spec, manifest = prepare_holdout_experiment(
            input_data=data,
            target_successor_model="target-m",
            target_domain="reasoning",
            stress_mask="poor_outcome",
            exclude_gemini_from_confirmation=False,
        )
        self.assertEqual(manifest["domain_loading_threshold"], 0.25)
        self.assertIn("selection_rule", manifest["poor_outcome"])
        self.assertFalse(manifest["poor_outcome"]["independent_samples"])
        self.assertFalse(manifest["poor_outcome"]["k_trials_partition"])
        self.assertFalse(manifest["poor_outcome"]["metric_families_crossed"])
        self.assertEqual(manifest["poor_outcome"]["control_reference_unit"], "control_observation_row")
        masked_keys = {
            (row["system_id"], row["benchmark_id"]) for row in eval_spec["poor_outcome_masked"]
        }
        self.assertIn(("target-m@max", "cont-bench"), masked_keys)
        self.assertIn(("target-m@max", "count-bench"), masked_keys)
        for row in eval_spec["poor_outcome_masked"]:
            self.assertIn("poor_outcome_peer_cutoff", row)
            self.assertIn("poor_outcome_score", row)
            self.assertIn("poor_outcome_metric_family", row)
            self.assertIn("n_control_peers", row)
            self.assertIn("n_unique_control_models", row)
            self.assertGreaterEqual(row["n_control_peers"], 2)
            self.assertGreaterEqual(row["n_unique_control_models"], 1)
            self.assertIn(row["poor_outcome_metric_family"], ("continuous", "count"))
        self.assertEqual(eval_spec["held_out_observations"][0]["benchmark_id"], "hold-bench")
        train_pairs = {(train["system_ids"][o["system_index"]], o["benchmark_index"]) for o in train["observations"]}
        self.assertNotIn(("target-m@max", 2), train_pairs)

        affine = copy.deepcopy(data)
        for obs in affine["observations"]:
            if obs["benchmark_index"] == 0 and "y" in obs:
                obs["y"] = 3.0 * float(obs["y"]) + 11.0
        _train_a, eval_a, _ = prepare_holdout_experiment(
            input_data=affine,
            target_successor_model="target-m",
            target_domain="reasoning",
            stress_mask="poor_outcome",
            exclude_gemini_from_confirmation=False,
        )
        affine_keys = {
            (row["system_id"], row["benchmark_id"]) for row in eval_a["poor_outcome_masked"]
        }
        self.assertEqual(masked_keys, affine_keys)

        gemini_peer = copy.deepcopy(data)
        gemini_peer["system_ids"].append("gemini-3.8-flash@max-common")
        gemini_peer["n_systems"] = 5
        gemini_peer["n_models"] = 5
        gemini_peer["system_model_index"].append(4)
        gemini_peer["system_training_cutoff"].append(None)
        gemini_peer["system_profile_index"].append(1)
        gemini_peer["system_is_fixed_effort"] = [True] * 5
        gemini_peer["observations"].append(_obs(4, 0, "normal", y=-100.0, variance=0.1))
        _train_g, eval_g, _ = prepare_holdout_experiment(
            input_data=gemini_peer,
            target_successor_model="target-m",
            target_domain="reasoning",
            stress_mask="poor_outcome",
            exclude_gemini_from_confirmation=True,
        )
        gemini_keys = {
            (row["system_id"], row["benchmark_id"]) for row in eval_g["poor_outcome_masked"]
        }
        self.assertEqual(masked_keys, gemini_keys)

    def test_loading_threshold_holds_out_hle_knowledge_family_closure(self):
        data = copy.deepcopy(self.toy_data)
        data["benchmark_domains"][0] = [0.0, 0.03, 0.65, 0.30, 0.02]
        data["benchmark_family_ids"][0] = "hle"
        train, eval_spec, manifest = prepare_holdout_experiment(
            input_data=data,
            target_successor_model="model-b",
            target_domain="knowledge-information",
            exclude_gemini_from_confirmation=False,
        )
        self.assertEqual(manifest["domain_loading_threshold"], 0.25)
        self.assertIn("hle", eval_spec["held_out_families"])
        self.assertIn("hle-no-tools", eval_spec["primary_target_condition_ids"])
        held_benches = {row["benchmark_id"] for row in eval_spec["held_out_observations"]}
        self.assertIn("hle-no-tools", held_benches)
        for obs in train["observations"]:
            sys_id = train["system_ids"][obs["system_index"]]
            if sys_id.startswith("model-b@"):
                self.assertNotEqual(obs["benchmark_index"], 0)

        with self.assertRaises(ValueError):
            prepare_holdout_experiment(
                input_data=self.toy_data,
                target_successor_model="model-b",
                target_domain="software-code",
                domain_loading_threshold=0.0,
            )

    def test_primary_score_excludes_same_family_subthreshold_condition(self):
        data = copy.deepcopy(self.toy_data)
        data["n_benchmarks"] = 3
        data["n_families"] = 2
        data["benchmark_ids"] = ["primary-cond", "closure-cond", "other-cond"]
        data["benchmark_family_ids"] = ["shared-fam", "shared-fam", "other"]
        data["benchmark_family_index"] = [0, 0, 1]
        data["benchmark_holdout"] = ["private", "private", "private"]
        data["benchmark_public_release_date"] = [None, None, None]
        data["benchmark_domains"] = [
            [0.0, 0.0, 0.8, 0.2, 0.0],
            [0.0, 0.0, 0.1, 0.9, 0.0],
            [0.0, 1.0, 0.0, 0.0, 0.0],
        ]
        data["cell_system_index"] = [0, 0, 0, 1, 1, 1]
        data["cell_benchmark_index"] = [0, 1, 2, 0, 1, 2]
        data["observations"] = [
            _obs(0, 0, "normal", y=0.1, variance=0.1),
            _obs(0, 1, "normal", y=0.2, variance=0.1),
            _obs(0, 2, "normal", y=0.3, variance=0.1),
            _obs(1, 0, "normal", y=0.4, variance=0.1),
            _obs(1, 1, "normal", y=0.5, variance=0.1),
            _obs(1, 2, "normal", y=0.6, variance=0.1),
        ]
        train, eval_spec, manifest = prepare_holdout_experiment(
            input_data=data,
            target_successor_model="model-b",
            target_domain="reasoning",
            exclude_gemini_from_confirmation=False,
        )
        self.assertEqual(manifest["default_prediction_stratum"], "primary_target")
        self.assertEqual(manifest["default_scoring_rows"], "primary_target_observations")
        self.assertEqual(manifest["held_out_observations_role"], "training_removal_union_not_primary_score")
        self.assertIn("score only the target conditions", manifest["primary_scoring_rule"].lower())
        self.assertEqual(eval_spec["primary_target_condition_ids"], ["primary-cond"])
        self.assertEqual(eval_spec["family_closure_condition_ids"], ["closure-cond"])
        primary_ids = {row["benchmark_id"] for row in eval_spec["primary_target_observations"]}
        closure_ids = {row["benchmark_id"] for row in eval_spec["family_closure_observations"]}
        union_ids = {row["benchmark_id"] for row in eval_spec["held_out_observations"]}
        self.assertEqual(primary_ids, {"primary-cond"})
        self.assertEqual(closure_ids, {"closure-cond"})
        self.assertEqual(union_ids, {"primary-cond", "closure-cond"})
        self.assertEqual(eval_spec["primary_target_observation_count"], 1)
        self.assertEqual(eval_spec["family_closure_observation_count"], 1)
        self.assertEqual(eval_spec["held_out_observation_count"], 2)
        selected = select_primary_scoring_observations(eval_spec)
        self.assertEqual([row["benchmark_id"] for row in selected], ["primary-cond"])
        self.assertTrue(selected[0]["is_default_prediction_row"])
        self.assertEqual(selected[0]["primary_prediction_index"], 0)
        closure_row = eval_spec["family_closure_observations"][0]
        self.assertFalse(closure_row["is_default_prediction_row"])
        self.assertNotIn("primary_prediction_index", closure_row)
        train_pairs = {(train["system_ids"][o["system_index"]], o["benchmark_index"]) for o in train["observations"]}
        self.assertNotIn(("model-b@max", 0), train_pairs)
        self.assertNotIn(("model-b@max", 1), train_pairs)
        self.assertIn(("model-b@max", 2), train_pairs)

    def test_count_metric_rejects_invalid_metadata_and_preserves_normalization(self):
        valid_single = _obs(0, 0, "a_single", x=9, n_tasks=10, k_trials=1)
        self.assertEqual(observation_metric_family_and_score(valid_single), ("count", 0.9))
        self.assertTrue(parse_observation_metric(valid_single)["ok"])

        valid_total_k4 = _obs(0, 0, "a_total", x=8, n_tasks=10, k_trials=4)
        self.assertEqual(observation_metric_family_and_score(valid_total_k4), ("count", 0.2))
        valid_total_k1 = _obs(0, 0, "a_total", x=8, n_tasks=10, k_trials=1)
        self.assertEqual(observation_metric_family_and_score(valid_total_k1), ("count", 0.8))

        valid_exact = _obs(0, 0, "a_exact", per_task_counts=[1, 0, 1], k_trials=2, n_tasks=3)
        self.assertEqual(observation_metric_family_and_score(valid_exact), ("count", 2.0 / 6.0))

        empty_exact = _obs(0, 0, "a_exact", per_task_counts=[], x=5, n_tasks=10, k_trials=1)
        self.assertIsNone(observation_metric_family_and_score(empty_exact))
        self.assertEqual(parse_observation_metric(empty_exact)["reason"], "a_exact_empty_per_task_counts")

        missing_exact = _obs(0, 0, "a_exact", x=5, n_tasks=10, k_trials=1)
        self.assertEqual(parse_observation_metric(missing_exact)["reason"], "a_exact_empty_per_task_counts")

        invalid_k = _obs(0, 0, "a_single", x=5, n_tasks=10, k_trials=0)
        self.assertIsNone(observation_metric_family_and_score(invalid_k))
        self.assertEqual(parse_observation_metric(invalid_k)["reason"], "invalid_k_trials")

        invalid_k_total = _obs(0, 0, "a_total", x=5, n_tasks=10, k_trials=-1)
        self.assertEqual(parse_observation_metric(invalid_k_total)["reason"], "invalid_k_trials")

        missing_k_total = _obs(0, 0, "a_total", x=5, n_tasks=10)
        self.assertEqual(parse_observation_metric(missing_k_total)["reason"], "invalid_k_trials")

        out_of_range = _obs(0, 0, "a_single", x=11, n_tasks=10, k_trials=1)
        self.assertIsNone(observation_metric_family_and_score(out_of_range))
        self.assertEqual(parse_observation_metric(out_of_range)["reason"], "out_of_range_count")

        out_of_range_total = _obs(0, 0, "a_total", x=41, n_tasks=10, k_trials=4)
        self.assertEqual(parse_observation_metric(out_of_range_total)["reason"], "out_of_range_count")

        exact_oor = _obs(0, 0, "a_exact", per_task_counts=[3, 0], k_trials=2, n_tasks=2)
        self.assertEqual(parse_observation_metric(exact_oor)["reason"], "out_of_range_count")

    def test_cli_wrong_class_partner_and_threshold_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_path = Path(tmp_dir_str)
            toy_input_path = tmp_path / "toy.json"
            toy_input_path.write_text(strict_json_dumps(self.toy_data))
            out_dir = tmp_path / "prep_out"
            ret = experiment_cli_main([
                "prepare",
                "--input", str(toy_input_path),
                "--target-model", "model-b",
                "--target-domain", "software-code",
                "--output-dir", str(out_dir),
                "--scenario", "wrong_class",
                "--wrong-class-partner", "model-a",
                "--domain-loading-threshold", "0.25",
            ])
            self.assertEqual(ret, 0)
            manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
            train = json.loads((out_dir / "train_input.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["domain_loading_threshold"], 0.25)
            self.assertEqual(manifest["wrong_class_partner"], "model-a")
            self.assertFalse(manifest["is_publishable"])
            self.assertEqual(compute_canonical_data_hash(train), manifest["train_data_hash"])

    def test_real_accepted_input_qwen_reasoning_and_gpt52_knowledge(self):
        path = _accepted_input_path()
        if path is None:
            self.skipTest("docs/audits/1.4.3-effort-coverage/accepted-input.json not available")
        data = json.loads(path.read_text(encoding="utf-8"))
        original_n_obs = len(data["observations"])
        qwen_index = next(i for i, s in enumerate(data["system_ids"]) if s.startswith("qwen-3.8-max@"))
        self.assertEqual(qwen_index, 121)

        train, eval_spec, manifest = prepare_holdout_experiment(
            input_data=data,
            target_successor_model="qwen-3.8-max",
            target_domain="reasoning",
            exclude_gemini_from_confirmation=True,
        )
        self.assertEqual(len(data["observations"]), original_n_obs)
        self.assertIn("matharena-composite", eval_spec["held_out_families"])
        self.assertNotIn("deepswe", eval_spec["held_out_families"])
        self.assertEqual(manifest["domain_loading_threshold"], 0.25)
        self.assertGreater(eval_spec["held_out_observation_count"], 0)
        for row in eval_spec["held_out_observations"]:
            self.assertEqual(row["original_system_index"], 121)
            self.assertGreaterEqual(row["original_system_index"], train["n_systems"])
            self.assertLess(row["train_system_index"], train["n_systems"])
            self.assertEqual(train["system_ids"][row["train_system_index"]], row["system_id"])
            self.assertNotIn("cell_index", row)
            self.assertEqual(row["system_id"], "qwen-3.8-max@max-common")
        self.assertLess(train["n_systems"], data["n_systems"])
        self.assertTrue(any(s.startswith("qwen-3.8-max@") for s in train["system_ids"]))

        train_k, eval_k, manifest_k = prepare_holdout_experiment(
            input_data=data,
            target_successor_model="gpt-5.2",
            target_domain="knowledge-information",
            exclude_gemini_from_confirmation=True,
        )
        self.assertEqual(manifest_k["domain_loading_threshold"], 0.25)
        self.assertIn("hle", eval_k["held_out_families"])
        self.assertIn("simpleqa", eval_k["held_out_families"])
        self.assertIn("hle-no-tools", eval_k["primary_target_condition_ids"])
        hle_rows = [row for row in eval_k["held_out_observations"] if row["benchmark_id"] == "hle-no-tools"]
        self.assertGreater(len(hle_rows), 0)
        original_hle = [
            obs for obs in data["observations"]
            if data["system_ids"][obs["system_index"]].startswith("gpt-5.2@")
            and data["benchmark_ids"][obs["benchmark_index"]] == "hle-no-tools"
        ]
        self.assertEqual(len(hle_rows), len(original_hle))
        primary_hle = [row for row in eval_k["primary_target_observations"] if row["benchmark_id"] == "hle-no-tools"]
        self.assertEqual(len(primary_hle), len(original_hle))
        self.assertEqual(
            [row["benchmark_id"] for row in select_primary_scoring_observations(eval_k) if row["benchmark_id"] == "hle-no-tools"],
            [row["benchmark_id"] for row in primary_hle],
        )
        self.assertEqual(eval_k["held_out_observations_role"], "training_removal_union_not_primary_score")
        self.assertEqual(eval_k["default_scoring_rows"], "primary_target_observations")
        for obs in train_k["observations"]:
            sys_id = train_k["system_ids"][obs["system_index"]]
            if sys_id.startswith("gpt-5.2@"):
                self.assertNotEqual(train_k.get("benchmark_ids", data["benchmark_ids"])[obs["benchmark_index"]], "hle-no-tools")
        self.assertTrue(any(s.startswith("gpt-5.2@") for s in train_k["system_ids"]))
        self.assertFalse(train_k["class_prior"] is None)
        self.assertFalse(manifest_k["is_publishable"])
        self.assertTrue(manifest_k["is_experimental"])


if __name__ == "__main__":
    unittest.main()
