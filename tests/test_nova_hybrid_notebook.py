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
        function = next(
            node for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and node.name == "validate_oof_bundle"
        )
        namespace = {"pd": pd, "np": np, "FINAL_OOS_START": FINAL_OOS_START}
        module = ast.Module(body=[function], type_ignores=[])
        exec(compile(module, str(NOTEBOOK), "exec"), namespace)
        cls.validate_oof_bundle = staticmethod(namespace["validate_oof_bundle"])
        market_function = next(
            node for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and node.name == "validate_market_frame"
        )
        market_namespace = {
            "pd": pd, "np": np,
            "TIMEFRAME_MINUTES": {"M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440},
            "REQUIRED_COLUMNS": {"timestamp_utc", "asset", "timeframe", "open", "high", "low", "close", "volume", "volume_type"},
        }
        market_module = ast.Module(body=[market_function], type_ignores=[])
        exec(compile(market_module, str(NOTEBOOK), "exec"), market_namespace)
        cls.validate_market_frame = staticmethod(market_namespace["validate_market_frame"])

    @staticmethod
    def valid_votes(timestamp="2026-06-30T12:00:00Z"):
        return pd.DataFrame([
            {"timestamp_utc": timestamp, "asset": "XAUUSDm", "timeframe": "H1",
             "family": family, "probability": 0.65, "fold_id": "fold-1",
             "model_version": f"{family}-v1", "calibration_id": f"{family}-cal-1",
             "is_oof": True}
            for family in REQUIRED_FAMILIES
        ])

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

    @staticmethod
    def market_frame(times):
        return pd.DataFrame([
            {"timestamp_utc": timestamp, "asset": "XAUUSDm", "timeframe": "M5",
             "open": 2000.0, "high": 2001.0, "low": 1999.0, "close": 2000.5,
             "volume": 100.0, "volume_type": "tick_volume"}
            for timestamp in times
        ])

    def test_market_frame_accepts_exact_timeframe_cadence(self):
        frame = self.market_frame(["2026-06-30T00:00:00Z", "2026-06-30T00:05:00Z"])
        manifest = {"completeness_status": "PASS", "training_eligible": True,
                    "row_count": 2, "verified_gap_intervals": []}
        clean, gaps = self.validate_market_frame(frame, "XAUUSDm", "M5", manifest)
        self.assertEqual(len(clean), 2)
        self.assertEqual(gaps, [])

    def test_market_frame_rejects_bars_closer_than_timeframe(self):
        frame = self.market_frame(["2026-06-30T00:00:00Z", "2026-06-30T00:02:00Z"])
        manifest = {"completeness_status": "PASS", "training_eligible": True,
                    "row_count": 2, "verified_gap_intervals": []}
        with self.assertRaisesRegex(ValueError, "off-cadence"):
            self.validate_market_frame(frame, "XAUUSDm", "M5", manifest)

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
        # Replace one SMC vote with a fifth family: total vote count is still four,
        # and SMC exists globally, but this timestamp is not fully covered.
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

    def test_no_automatic_artifact_promotion(self):
        self.assertIn("auto_promote':False", self.source)
        self.assertIn("Artifact persistence is disabled", self.source)


if __name__ == "__main__":
    unittest.main()
