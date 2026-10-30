"""Tests for the immutable Quant Experiment contract boundary."""
import unittest

from workers.quant_engine import ExperimentValidationError, validate_quant_experiment


class QuantExperimentContractTests(unittest.TestCase):
    def experiment(self):
        return {
            "schema_version": "nova.quant-experiment.v1",
            "experiment_id": "experiment-001",
            "research_id": "research-001",
            "hypothesis_id": "hypothesis-001",
            "dataset_manifest_id": "dataset-001",
            "dataset_sha256": "a" * 64,
            "quality_report_id": "quality-001",
            "strategy_id": "ema-baseline",
            "strategy_version": "1.0.0",
            "feature_schema_id": "ohlcv-basic",
            "feature_schema_version": "1.0.0",
            "code_revision": "b" * 40,
            "runtime_revision": "python-3.11-quant-v1",
            "parameters": {"fast_period": 12, "slow_period": 26, "use_filter": False},
            "seed": 17,
            "folds": [
                {"fold_id": "fold-001", "train_start": 0, "train_end": 70, "test_start": 82, "test_end": 100},
                {"fold_id": "fold-002", "train_start": 0, "train_end": 100, "test_start": 112, "test_end": 130},
            ],
            "purge_bars": 12,
            "embargo_bars": 2,
            "cost_model_id": "conservative-costs-v1",
            "baseline_ids": ["ema-baseline-v1"],
            "evaluator_version": "walk-forward-evaluator-v1",
            "created_at": "2026-10-31T10:00:00Z",
        }

    def test_accepts_valid_immutable_experiment(self):
        payload = self.experiment()
        result = validate_quant_experiment(payload)
        self.assertEqual(result["schema_version"], "nova.quant-experiment.v1")
        self.assertEqual(result["folds"][0]["test_start"], 82)
        self.assertIsNot(result, payload)

    def test_rejects_unknown_and_missing_fields(self):
        payload = self.experiment()
        payload["unexpected"] = "not-allowed"
        with self.assertRaisesRegex(ExperimentValidationError, "unknown fields"):
            validate_quant_experiment(payload)
        payload = self.experiment()
        del payload["dataset_sha256"]
        with self.assertRaisesRegex(ExperimentValidationError, "missing fields"):
            validate_quant_experiment(payload)

    def test_rejects_bad_dataset_hash_and_code_revision(self):
        payload = self.experiment()
        payload["dataset_sha256"] = "not-a-hash"
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)
        payload = self.experiment()
        payload["code_revision"] = "main"
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)

    def test_rejects_non_chronological_or_unpurged_folds(self):
        payload = self.experiment()
        payload["folds"][0]["test_start"] = 75
        with self.assertRaisesRegex(ExperimentValidationError, "purge_bars"):
            validate_quant_experiment(payload)
        payload = self.experiment()
        payload["folds"][1]["test_start"] = 90
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)

    def test_rejects_boolean_indices_and_duplicate_fold_ids(self):
        payload = self.experiment()
        payload["folds"][0]["train_start"] = True
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)
        payload = self.experiment()
        payload["folds"][1]["fold_id"] = "fold-001"
        with self.assertRaisesRegex(ExperimentValidationError, "unique"):
            validate_quant_experiment(payload)

    def test_requires_at_least_one_baseline_and_rejects_duplicates(self):
        payload = self.experiment()
        payload["baseline_ids"] = []
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)
        payload = self.experiment()
        payload["baseline_ids"] = ["ema", "ema"]
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)

    def test_rejects_invalid_timestamp_and_oversized_parameter_value(self):
        payload = self.experiment()
        payload["created_at"] = "2026-10-31T10:00:00"
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)
        payload = self.experiment()
        payload["parameters"] = {"large": "x" * 5_000}
        with self.assertRaises(ExperimentValidationError):
            validate_quant_experiment(payload)


if __name__ == "__main__":
    unittest.main(verbosity=2)
