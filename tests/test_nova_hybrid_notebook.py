import ast
import json
import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

NOTEBOOK = Path(__file__).resolve().parents[1] / "notebooks" / "NOVA_Hybrid_Continuous_MultiAsset_Training.ipynb"
FINAL_OOS_START = pd.Timestamp("2026-07-01T00:00:00Z")
REQUIRED_FAMILIES = ("lstm", "deep_learning", "xgboost", "vision", "neural_network")


class HybridNotebookContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
        cls.code = ["".join(c.get("source", [])) for c in cls.nb["cells"] if c["cell_type"] == "code"]
        cls.source = "\n".join(cls.code)
        tree = ast.parse(cls.source, filename=str(NOTEBOOK))
        functions = {node.name: node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)}
        namespace = {
            "pd": pd, "np": np, "json": json, "hashlib": hashlib, "Path": Path,
            "OOF_ROOT": Path("/tmp/nova-approved-oof"),
            "FINAL_OOS_START": FINAL_OOS_START,
            "TIMEFRAME_MINUTES": {"H1": 60},
            "REQUIRED_COLUMNS": {"timestamp_utc","asset","timeframe","open","high","low","close","volume","volume_type"},
            "LABEL_HORIZON_BARS": 5,
            "FEATURE_COLUMNS": ["return_1","return_5","rsi_14","ema_spread_pct","range_pct","volume_ratio_20"],
        }
        module = ast.Module(
            body=[functions["sha256_file"], functions["validate_oof_bundle"], functions["load_approved_oof_bundle"], functions["validate_market_frame"], functions["make_features"], functions["walk_forward_folds"], functions["split_fit_early_stop"]],
            type_ignores=[],
        )
        exec(compile(module, str(NOTEBOOK), "exec"), namespace)
        cls.validate_oof_bundle = staticmethod(namespace["validate_oof_bundle"])
        cls.load_approved_oof_bundle = staticmethod(namespace["load_approved_oof_bundle"])
        cls.validate_market_frame = staticmethod(namespace["validate_market_frame"])
        cls.make_features = staticmethod(namespace["make_features"])
        cls.walk_forward_folds = staticmethod(namespace["walk_forward_folds"])
        cls.split_fit_early_stop = staticmethod(namespace["split_fit_early_stop"])

    @staticmethod
    def valid_votes(start="2026-06-29T00:00:00Z"):
        timestamps = pd.date_range(start, periods=30, freq="h")
        return pd.DataFrame([
            {
                "timestamp_utc": timestamp,
                "asset": "XAUUSDm",
                "timeframe": "H1",
                "family": family,
                "direction": 1,
                "score": 0.65,
                "calibrated_reliability": 0.8,
                "prediction_history_value": 0.65,
                "fold_id": "fold-1",
                "model_version": f"{family}-v1",
                "calibration_id": f"{family}-cal-1",
                "calibration_status": "PASS",
                "calibration_method": "walk_forward_oos",
                "oos_samples": 30,
                "dataset_sha256": "a" * 64,
                "evaluator_version": "nova-eval-v1",
                "is_oof": True,
            }
            for timestamp in timestamps
            for family in REQUIRED_FAMILIES
        ])

    @staticmethod
    def market_fixture():
        frame = pd.DataFrame([
            {"timestamp_utc":"2026-01-05T10:00:00Z","asset":"XAUUSDm","timeframe":"H1",
             "open":100.0,"high":101.0,"low":99.0,"close":100.5,"volume":100,"volume_type":"tick_volume"},
            {"timestamp_utc":"2026-01-05T12:00:00Z","asset":"XAUUSDm","timeframe":"H1",
             "open":100.5,"high":102.0,"low":100.0,"close":101.5,"volume":120,"volume_type":"tick_volume"},
        ])
        manifest = {
            "volume_type":"tick_volume","source":"EXNESS_MT5_DEMO",
            "source_commit_sha":"a"*40,
            "start_utc":"2026-01-05T10:00:00Z","end_utc":"2026-01-05T12:00:00Z",
            "verified_gap_intervals":[{"from_utc":"2026-01-05T10:00:00Z","to_utc":"2026-01-05T12:00:00Z"}],
            "completeness_status":"PASS","training_eligible":True,"row_count":2,
        }
        return frame, manifest

    def test_nbformat(self):
        self.assertEqual(self.nb["nbformat"], 4)
        self.assertGreaterEqual(self.nb["nbformat_minor"], 5)
        self.assertGreaterEqual(len(self.nb["cells"]), 10)

    def test_all_code_cells_parse(self):
        for index, source in enumerate(self.code):
            ast.parse(source, filename=f"notebook-cell-{index}")
            compile(source, f"notebook-cell-{index}", "exec")

    def test_safety_defaults_are_off(self):
        self.assertIn("RUN_TRAINING = False", self.source)
        self.assertIn("PERSIST_ARTIFACTS = False", self.source)
        self.assertIn("AUTO_PROMOTE = False", self.source)
        self.assertIn("FINAL_OOS_START = pd.Timestamp('2026-07-01T00:00:00Z')", self.source)

    def test_no_broker_execution_or_credentials(self):
        forbidden = ("OrderSend(", "order_send(", "positions_get(", "NOVA_MT5_BRIDGE_TOKEN")
        for value in forbidden:
            self.assertNotIn(value, self.source)

    def test_gap_segments_prevent_cross_gap_windows(self):
        self.assertIn("segment_id", self.source)
        self.assertIn("groupby('segment_id'", self.source)
        self.assertIn("no feature/label/sequence may cross it", self.source)

    def test_multimarket_contract_and_meta_model_families(self):
        self.assertIn("ASSETS =", self.source)
        self.assertIn("TIMEFRAMES =", self.source)
        self.assertIn("def validate_oof_bundle", self.source)
        for family in REQUIRED_FAMILIES:
            self.assertIn(family, self.source)

    def test_oof_accepts_all_five_meta_decision_families(self):
        self.assertTrue(self.validate_oof_bundle(self.valid_votes()))

    def test_oof_rejects_missing_family_at_one_timestamp(self):
        rows = self.valid_votes()
        first_ts = rows["timestamp_utc"].min()
        rows.loc[(rows["timestamp_utc"] == first_ts) & (rows["family"] == "vision"), "family"] = "wave3"
        with self.assertRaisesRegex(ValueError, "per-timestamp"):
            self.validate_oof_bundle(rows)

    def test_oof_rejects_naive_timestamps(self):
        with self.assertRaisesRegex(ValueError, "explicit timezone"):
            self.validate_oof_bundle(self.valid_votes(start="2026-06-29 00:00:00"))

    def test_oof_rejects_sealed_final_oos(self):
        with self.assertRaisesRegex(ValueError, "sealed Final OOS"):
            self.validate_oof_bundle(self.valid_votes(start="2026-07-01T00:00:00Z"))

    def test_oof_rejects_in_sample_predictions(self):
        votes = self.valid_votes()
        votes.loc[0, "is_oof"] = False
        with self.assertRaisesRegex(ValueError, "in-sample"):
            self.validate_oof_bundle(votes)

    def test_oof_rejects_duplicate_family_votes(self):
        votes = self.valid_votes()
        votes = pd.concat([votes, votes.iloc[[0]]], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.validate_oof_bundle(votes)

    def test_oof_rejects_missing_or_failed_calibration(self):
        votes = self.valid_votes()
        votes.loc[0, "calibration_status"] = "PENDING"
        with self.assertRaisesRegex(ValueError, "calibration"):
            self.validate_oof_bundle(votes)

    def test_oof_rejects_inadequate_oos_sample_count(self):
        votes = self.valid_votes()
        votes.loc[0, "oos_samples"] = 29
        with self.assertRaisesRegex(ValueError, "at least 30"):
            self.validate_oof_bundle(votes)

    def test_oof_rejects_inconsistent_signed_prediction(self):
        votes = self.valid_votes()
        votes.loc[0, "prediction_history_value"] = -0.65
        with self.assertRaisesRegex(ValueError, "equal direction"):
            self.validate_oof_bundle(votes)

    def test_oof_rejects_dataset_hash_changes_within_asset_timeframe_history(self):
        votes = self.valid_votes()
        votes.loc[(votes["timestamp_utc"] == votes["timestamp_utc"].max()) & (votes["family"] == "vision"), "dataset_sha256"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "one immutable dataset SHA-256"):
            self.validate_oof_bundle(votes)

    def test_oof_rejects_missing_model_family_even_if_strategy_context_exists(self):
        votes = self.valid_votes()
        votes.loc[votes["family"] == "vision", "family"] = "wave3"
        with self.assertRaisesRegex(ValueError, "missing Meta Decision model families"):
            self.validate_oof_bundle(votes)

    def test_walk_forward_purges_training_labels_by_actual_timestamp(self):
        timestamps = pd.date_range("2026-01-01T00:00:00Z", periods=200, freq="h")
        frame = pd.DataFrame({
            "timestamp_utc": timestamps,
            "label_end_utc": timestamps + pd.Timedelta(hours=20),
            "label": np.tile([0, 1], 100),
        })
        folds = self.walk_forward_folds(frame, folds=3, horizon=5)
        self.assertEqual(len(folds), 3)
        block = len(frame) // 4
        for fold_index, (train, valid) in enumerate(folds):
            train_cutoff = timestamps[block * (fold_index + 1)]
            self.assertTrue((train["timestamp_utc"] < train_cutoff).all())
            self.assertTrue((train["label_end_utc"] < train_cutoff).all())
            self.assertGreaterEqual(valid["timestamp_utc"].min(), timestamps[block * (fold_index + 1) + 5])

    def test_walk_forward_rejects_timezone_naive_timestamps(self):
        timestamps = pd.date_range("2026-01-01", periods=200, freq="h")
        frame = pd.DataFrame({
            "timestamp_utc": timestamps,
            "label_end_utc": timestamps + pd.Timedelta(hours=5),
        })
        with self.assertRaisesRegex(ValueError, "explicit timezone"):
            self.walk_forward_folds(frame, folds=3, horizon=5)

    def test_walk_forward_rejects_label_end_before_prediction_time(self):
        timestamps = pd.date_range("2026-01-01T00:00:00Z", periods=200, freq="h")
        frame = pd.DataFrame({
            "timestamp_utc": timestamps,
            "label_end_utc": timestamps - pd.Timedelta(hours=1),
        })
        with self.assertRaisesRegex(ValueError, "cannot precede"):
            self.walk_forward_folds(frame, folds=3, horizon=5)

    def test_walk_forward_rejects_missing_label_end_timestamp(self):
        timestamps = pd.date_range("2026-01-01T00:00:00Z", periods=200, freq="h")
        frame = pd.DataFrame({"timestamp_utc": timestamps, "label": np.tile([0, 1], 100)})
        with self.assertRaisesRegex(ValueError, "requires timestamp_utc and label_end_utc"):
            self.walk_forward_folds(frame, folds=3, horizon=5)

    def test_feature_engineering_drops_non_finite_volume_ratios(self):
        timestamps = pd.date_range("2026-01-01T00:00:00Z", periods=50, freq="h")
        frame = pd.DataFrame({
            "timestamp_utc": timestamps,
            "segment_id": 0,
            "open": np.linspace(100, 110, 50),
            "high": np.linspace(101, 111, 50),
            "low": np.linspace(99, 109, 50),
            "close": np.linspace(100.5, 110.5, 50),
            "volume": [0.0] * 25 + [100.0] * 25,
        })
        features = self.make_features(frame)
        numeric = features[["return_1","return_5","rsi_14","ema_spread_pct","range_pct","volume_ratio_20"]].to_numpy()
        self.assertTrue(np.isfinite(numeric).all())
        self.assertGreater(len(features), 0)

    def test_market_data_rejects_bars_closer_than_declared_timeframe(self):
        frame, manifest = self.market_fixture()
        frame.loc[1, "timestamp_utc"] = "2026-01-05T10:30:00Z"
        manifest["end_utc"] = "2026-01-05T10:30:00Z"
        manifest["verified_gap_intervals"] = []
        with self.assertRaisesRegex(ValueError, "off-cadence"):
            self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)

    def test_market_data_accepts_exact_timeframe_cadence(self):
        frame, manifest = self.market_fixture()
        frame.loc[1, "timestamp_utc"] = "2026-01-05T11:00:00Z"
        manifest["end_utc"] = "2026-01-05T11:00:00Z"
        manifest["verified_gap_intervals"] = []
        clean, gaps = self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)
        self.assertEqual(len(clean), 2)
        self.assertEqual(gaps, [])

    def test_market_data_accepts_z_gap_manifest_and_segments(self):
        frame, manifest = self.market_fixture()
        clean, gaps = self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)
        self.assertEqual(len(gaps), 1)
        self.assertEqual(clean["segment_id"].tolist(), [0, 1])

    def test_market_data_rejects_timezone_naive_timestamps(self):
        frame, manifest = self.market_fixture()
        frame["timestamp_utc"] = ["2026-01-05 10:00:00", "2026-01-05 12:00:00"]
        with self.assertRaisesRegex(ValueError, "explicit timezone"):
            self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)

    def test_market_data_rejects_fractional_tick_volume(self):
        frame, manifest = self.market_fixture()
        frame["volume"] = frame["volume"].astype(float)
        frame.loc[0, "volume"] = 100.5
        with self.assertRaisesRegex(ValueError, "tick_volume must be integer"):
            self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)

    def test_market_data_rejects_volume_type_mismatch(self):
        frame, manifest = self.market_fixture()
        manifest["volume_type"] = "real_volume"
        with self.assertRaisesRegex(ValueError, "volume_type"):
            self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)

    def test_market_data_rejects_manifest_boundary_mismatch(self):
        frame, manifest = self.market_fixture()
        manifest["start_utc"] = "2026-01-05T09:00:00Z"
        with self.assertRaisesRegex(ValueError, "start timestamp"):
            self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)

    def test_market_data_rejects_unverified_source_commit(self):
        frame, manifest = self.market_fixture()
        manifest["source_commit_sha"] = "not-a-git-sha"
        with self.assertRaisesRegex(ValueError, "source_commit_sha"):
            self.validate_market_frame(frame, "XAUUSDm", "H1", manifest)

    def test_no_automatic_artifact_promotion(self):
        self.assertIn("auto_promote':False", self.source)
        self.assertIn("Artifact persistence is disabled", self.source)


    def test_inner_early_stopping_split_purges_unmatured_labels(self):
        timestamps = pd.date_range("2026-01-01T00:00:00Z", periods=200, freq="h")
        frame = pd.DataFrame({
            "timestamp_utc": timestamps,
            "label_end_utc": timestamps + pd.Timedelta(hours=5),
            "label": np.tile([0, 1], 100),
        })
        fit, early_stop = self.split_fit_early_stop(frame)
        boundary = early_stop["timestamp_utc"].min()
        self.assertLess(fit["timestamp_utc"].max(), boundary)
        self.assertTrue((fit["label_end_utc"] < boundary).all())
        self.assertGreaterEqual(len(fit), 100)
        self.assertGreaterEqual(len(early_stop), 30)

    def test_oof_rejects_unexpected_strategy_family_even_with_all_five_models(self):
        votes = self.valid_votes()
        extra = votes[votes["family"] == "lstm"].copy()
        extra["family"] = "wave3"
        votes = pd.concat([votes, extra], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "unexpected Meta Decision model families"):
            self.validate_oof_bundle(votes)


    def test_oof_loader_accepts_checksum_bound_approved_bundle(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            csv_path = root / "nova_meta_oof.csv"
            manifest_path = root / "nova_meta_oof.manifest.json"
            approval_path = root / "nova_meta_oof.manifest.approval.json"
            votes = self.valid_votes()
            votes.to_csv(csv_path, index=False)
            digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
            source_commit = "c" * 40
            manifest = {
                "sha256": digest,
                "row_count": len(votes),
                "source": "quant_engine_oof_export",
                "source_commit_sha": source_commit,
                "evaluator_version": "nova-eval-v1",
                "completeness_status": "PASS",
                "oof_status": "PASS",
            }
            approval = {"approved": True, "dataset_sha256": digest,
                        "source_commit_sha": source_commit}
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            approval_path.write_text(json.dumps(approval), encoding="utf-8")
            loaded, audit = self.load_approved_oof_bundle(root)
            self.assertIsNotNone(loaded)
            self.assertEqual(len(loaded), len(votes))
            self.assertEqual(audit[0]["status"], "PASS")

    def test_oof_loader_rejects_checksum_mismatch(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            csv_path = root / "nova_meta_oof.csv"
            votes = self.valid_votes()
            votes.to_csv(csv_path, index=False)
            source_commit = "d" * 40
            manifest = {
                "sha256": "0" * 64,
                "row_count": len(votes),
                "source": "quant_engine_oof_export",
                "source_commit_sha": source_commit,
                "evaluator_version": "nova-eval-v1",
                "completeness_status": "PASS",
                "oof_status": "PASS",
            }
            approval = {"approved": True, "dataset_sha256": "0" * 64,
                        "source_commit_sha": source_commit}
            (root / "nova_meta_oof.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            (root / "nova_meta_oof.manifest.approval.json").write_text(json.dumps(approval), encoding="utf-8")
            loaded, audit = self.load_approved_oof_bundle(root)
            self.assertIsNone(loaded)
            self.assertEqual(audit[0]["status"], "BLOCKED")
            self.assertIn("SHA-256 mismatch", audit[0]["reason"])


if __name__ == "__main__":
    unittest.main()
