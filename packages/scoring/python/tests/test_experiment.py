import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from aci12.experiment import (
    CONDITIONAL_IGNORABILITY_NOTICE,
    CONSERVATIVE_GEMINI_DEVELOPMENT_EXCLUSIONS,
    DOCUMENTED_GEMINI_MOTIVATING_COMPONENT_MODELS,
    NON_PUBLISHABLE_METADATA,
    ClassPriorAdapter,
    MeasurementSpecification,
    SystemSpecification,
    TaskPopulation,
    TransferClass,
    TransferClassRegistry,
    compute_canonical_data_hash,
    diagnose_system_geometry,
    is_gemini_component,
    main as experiment_cli_main,
    prepare_holdout_experiment,
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
        # Poor outcome stress mask
        train_poor, eval_poor, _ = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="reasoning",
            stress_mask="poor_outcome",
        )
        self.assertGreater(eval_poor["poor_outcome_masked_count"], 0)

        # Missing domain stress mask
        train_miss, eval_miss, _ = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="reasoning",
            stress_mask="missing_domain",
        )
        self.assertEqual(eval_miss["stress_mask"], "missing_domain")

        # Omission scenario (forces singletons / empty partition)
        train_omission, _, _ = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="software-code",
            scenario="omission",
        )
        self.assertEqual(len(train_omission["class_prior"]["partition"]), 0)

        # Wrong class scenario
        train_wrong, _, _ = prepare_holdout_experiment(
            input_data=self.toy_data,
            target_successor_model="model-b",
            target_domain="software-code",
            scenario="wrong_class",
        )
        self.assertTrue(any(p["class_id"] == "deliberate_false_class" for p in train_wrong["class_prior"]["partition"]))

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


if __name__ == "__main__":
    unittest.main()
