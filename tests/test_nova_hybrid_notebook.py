import ast
import json
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

NOTEBOOK = Path(__file__).resolve().parents[1] / "notebooks" / "NOVA_Hybrid_Continuous_MultiAsset_Training.ipynb"
FINAL_OOS_START = pd.Timestamp("2026-07-01T00:00:00Z")
REQUIRED_FAMILIES = ("xgboost", "lstm", "wave3", "smc")


class HybridNotebookContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
        cls.code = ["".join(c.get("source", [])) for c in cls.nb["cells"] if c["cell_type"] == "code"]
        cls.source = "\n".join(cls.code)
        tree = ast.parse(cls.source, filename=str(NOTEBOOK))
        functions = {node.name: node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)}
        namespace = {
            "pd": pd, "np": np, "FINAL_OOS_START": FINAL_OOS_START,
            "TIMEFRAME_MINUTES": {"H1": 60},
            "REQUIRED_COLUMNS": {"timestamp_utc","asset","timeframe","open","high","low","close","volume","volume_type"},
        }
        module = ast.Module(body=[functions["validate_oof_bundle"], functions["validate_market_frame"]], type_ignores=[])
        exec(compile(module, str(NOTEBOOK), "exec"), namespace)
        cls.validate_oof_bundle = staticmethod(namespace["validate_oof_bundle"])
        cls.validate_market_frame = staticmethod(namespace["validate_market_frame"])

    @staticmethod
    def valid_votes(timestamp="2026-06-30T12:00:00Z"):
        return pd.DataFrame([
            {"timestamp_utc": timestamp, "asset": "XAUUSDm", "timeframe": "H1",
             "family": family, "probability": 0.65, "fold_id": "fold-1",
             "model_version": f"{family}-v1", "calibration_id": f"{family}-cal-1",
             "is_oof": True}
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

    def test_multimarket_contract_and_oof_gate(self):
        self.assertIn("ASSETS =", self.source)
        self.assertIn("TIMEFRAMES =", self.source)
        self.assertIn("def validate_oof_bundle", self.source)
        self.assertIn("calibration_id", self.source)

    def test_oof_accepts_complete_timestamp_aligned_votes(self):
        self.assertTrue(self.validate_oof_bundle(self.valid_votes()))

    def test_oof_rejects_missing_family_at_one_timestamp_even_if_present_elsewhere(self):
        rows = self.valid_votes("2026-06-30T12:00:00Z")
        second = self.valid_votes("2026-06-30T13:00:00Z")
        rows.loc[rows["family"] == "smc", "family"] = "vision"
        combined = pd.concat([rows, second], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "per-timestamp"):
            self.validate_oof_bundle(combined)

    def test_oof_rejects_naive_timestamps(self):
        with self.assertRaisesRegex(ValueError, "explicit timezone"):
            self.validate_oof_bundle(self.valid_votes("2026-06-30 12:00:00"))

    def test_oof_rejects_sealed_final_oos(self):
        with self.assertRaisesRegex(ValueError, "sealed Final OOS"):
            self.validate_oof_bundle(self.valid_votes("2026-07-01T00:00:00Z"))

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
        frame['timestamp_utc'] = ['2026-01-05 10:00:00', '2026-01-05 12:00:00']
        with self.assertRaisesRegex(ValueError, 'explicit timezone'):
            self.validate_market_frame(frame, 'XAUUSDm', 'H1', manifest)

    def test_market_data_rejects_fractional_tick_volume(self):
        frame, manifest = self.market_fixture()
        frame.loc[0, 'volume'] = 100.5
        with self.assertRaisesRegex(ValueError, 'tick_volume must be integer'):
            self.validate_market_frame(frame, 'XAUUSDm', 'H1', manifest)

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


if __name__ == "__main__":
    unittest.main()
