import ast
import json
import unittest
from pathlib import Path

import pandas as pd

NOTEBOOK = Path(__file__).resolve().parents[1] / "notebooks" / "NOVA_XAUUSD_H1_CPU_Research.ipynb"


def load_notebook():
    return json.loads(NOTEBOOK.read_text(encoding="utf-8"))


def validator_namespace():
    notebook = load_notebook()
    cell = next(
        cell for cell in notebook["cells"]
        if cell["cell_type"] == "code"
        and "def validate_ohlcv" in "".join(cell["source"])
    )
    namespace = {"pd": pd}
    exec(compile("".join(cell["source"]), str(NOTEBOOK), "exec"), namespace)
    return namespace


class NotebookStructureTests(unittest.TestCase):
    def test_training_is_opt_in_by_default(self):
        source = "\\n".join(
            "".join(cell.get("source", []))
            for cell in load_notebook()["cells"]
            if cell["cell_type"] == "code"
        )
        self.assertIn("RUN_LSTM = False", source)

    def test_valid_nbformat_json(self):
        notebook = load_notebook()
        self.assertEqual(notebook["nbformat"], 4)
        self.assertGreaterEqual(notebook["nbformat_minor"], 5)
        self.assertTrue(notebook["cells"])

    def test_all_code_cells_parse(self):
        for index, cell in enumerate(load_notebook()["cells"]):
            if cell["cell_type"] == "code":
                source = "".join(cell["source"])
                tree = ast.parse(source, filename=f"notebook-cell-{index}")
                self.assertTrue(tree.body, f"code cell {index} is syntactically valid but contains no executable statements")
                compile(source, f"notebook-cell-{index}", "exec")

    def test_ingestion_helpers_are_top_level_ast_definitions(self):
        notebook = load_notebook()
        cell = next(
            cell for cell in notebook["cells"]
            if cell["cell_type"] == "code"
            and "def fetch_history_chunk" in "".join(cell["source"])
        )
        tree = ast.parse("".join(cell["source"]))
        functions = {
            node.name for node in tree.body
            if isinstance(node, ast.FunctionDef)
        }
        self.assertTrue({
            "fetch_history_chunk",
            "is_bounded_market_closure",
            "detect_unexplained_gaps",
            "detect_boundary_gaps",
        }.issubset(functions))

    def test_history_request_uses_only_relay_allowlisted_query_parameters(self):
        notebook = load_notebook()
        cell = next(
            cell for cell in notebook["cells"]
            if cell["cell_type"] == "code"
            and "def fetch_history_chunk" in "".join(cell["source"])
        )
        tree = ast.parse("".join(cell["source"]))
        function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "fetch_history_chunk"
        )
        params_assignment = next(
            node for node in function.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "params" for target in node.targets)
        )
        query_keys = {
            key.value for key in params_assignment.value.keys
            if isinstance(key, ast.Constant) and isinstance(key.value, str)
        }
        self.assertEqual(query_keys, {"symbol", "timeframe", "start_utc", "end_utc"})

    def test_training_history_is_capped_before_the_sealed_final_oos(self):
        notebook = load_notebook()
        cell = next(
            cell for cell in notebook["cells"]
            if cell["cell_type"] == "code"
            and "def fetch_history_chunk" in "".join(cell["source"])
        )
        source = "".join(cell["source"])
        self.assertIn(
            "FINAL_OOS_START_UTC = datetime(2026, 7, 1, tzinfo=timezone.utc)",
            source,
        )
        self.assertIn(
            "END_UTC = min(REQUESTED_END_UTC, FINAL_OOS_START_UTC)",
            source,
        )
        self.assertIn(
            '(df["timestamp"] >= pd.Timestamp(END_UTC)).any()',
            source,
        )

    def test_notebook_uses_https_bridge_and_sha256_manifest(self):
        source = "\\n".join("".join(c.get("source", [])) for c in load_notebook()["cells"] if c["cell_type"] == "code")
        self.assertIn("/api/history", source)
        self.assertIn("NOVA_MT5_BRIDGE_TOKEN", source)
        self.assertIn("sha256", source)
        self.assertIn("coverage_issues", source)
        self.assertIn("training_eligible", source)
        self.assertIn("data_path = dataset_path", source)
        self.assertNotIn("/kaggle/input", source)
        self.assertIn("EXNESS_DEMO", source)
        self.assertIn("MT5 tick_volume", source)
        self.assertIn("ordersEnabled", source)
        self.assertNotIn("order_send", source)

    def test_code_cells_have_no_stale_outputs(self):
        for cell in load_notebook()["cells"]:
            if cell["cell_type"] == "code":
                self.assertIsNone(cell["execution_count"])
                self.assertEqual(cell["outputs"], [])


class DatasetGapDetectionTests(unittest.TestCase):
    @staticmethod
    def _gap_functions():
        notebook = load_notebook()
        cell = next(
            cell for cell in notebook["cells"]
            if cell["cell_type"] == "code"
            and "def detect_unexplained_gaps" in "".join(cell["source"])
        )
        tree = ast.parse("".join(cell["source"]))
        names = {"is_bounded_market_closure", "detect_unexplained_gaps"}
        return [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]

    @classmethod
    def detector(cls):
        namespace = {"pd": pd}
        exec(compile(ast.Module(body=cls._gap_functions(), type_ignores=[]), str(NOTEBOOK), "exec"), namespace)
        return namespace["detect_unexplained_gaps"]

    @classmethod
    def bounded_closure(cls):
        namespace = {"pd": pd}
        exec(compile(ast.Module(body=cls._gap_functions(), type_ignores=[]), str(NOTEBOOK), "exec"), namespace)
        return namespace["is_bounded_market_closure"]

    @classmethod
    def boundary_detector(cls):
        notebook = load_notebook()
        cell = next(
            cell for cell in notebook["cells"]
            if cell["cell_type"] == "code"
            and "def detect_boundary_gaps" in "".join(cell["source"])
        )
        tree = ast.parse("".join(cell["source"]))
        names = {"is_bounded_market_closure", "detect_boundary_gaps"}
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
        namespace = {"pd": pd}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(NOTEBOOK), "exec"), namespace)
        return namespace["detect_boundary_gaps"]

    def test_accepts_exness_xau_daily_rollover_in_both_seasonal_windows(self):
        bounded = self.bounded_closure()
        samples = [
            ("2025-11-03T21:00:00Z", "2025-11-03T23:00:00Z"),
            ("2025-03-10T20:00:00Z", "2025-03-10T22:00:00Z"),
        ]
        for previous, current in samples:
            with self.subTest(previous=previous):
                self.assertTrue(
                    bounded(
                        pd.Timestamp(previous), pd.Timestamp(current),
                        pd.Timedelta(hours=1), 96, "XAUUSDm"
                    )
                )

    def test_rejects_sub_timeframe_internal_gap(self):
        detect = self.detector()
        stamps = pd.to_datetime([
            "2025-11-03T19:00:00Z", "2025-11-03T19:30:00Z"
        ])
        gaps = detect(stamps, pd.Timedelta(hours=1))
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0]["gap_minutes"], 30)

    def test_rejects_unrecognized_four_hour_weekday_gap(self):
        detect = self.detector()
        stamps = pd.to_datetime([
            "2025-11-03T19:00:00Z", "2025-11-03T23:00:00Z"
        ])
        gaps = detect(stamps, pd.Timedelta(hours=1))
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0]["gap_minutes"], 240)

    def test_does_not_apply_gold_rollover_to_other_symbols(self):
        bounded = self.bounded_closure()
        previous = pd.Timestamp("2025-11-03T21:00:00Z")
        current = pd.Timestamp("2025-11-03T23:00:00Z")
        self.assertFalse(
            bounded(previous, current, pd.Timedelta(hours=1), 96, "BTCUSDT")
        )

    def test_accepts_normal_weekend_market_closure(self):
        detect = self.detector()
        stamps = pd.to_datetime([
            "2025-11-07T21:00:00Z", "2025-11-09T23:00:00Z"
        ])
        self.assertEqual(detect(stamps, pd.Timedelta(hours=1)), [])

    def test_accepts_bounded_holiday_closure_crossing_weekend(self):
        detect = self.detector()
        stamps = pd.to_datetime([
            "2023-12-22T21:00:00Z", "2023-12-25T23:00:00Z"
        ])
        self.assertEqual(detect(stamps, pd.Timedelta(hours=1)), [])

    def test_rejects_multi_month_outage_even_when_it_crosses_weekends(self):
        detect = self.detector()
        stamps = pd.to_datetime([
            "2025-12-31T21:00:00Z", "2026-11-06T00:00:00Z"
        ])
        gaps = detect(stamps, pd.Timedelta(hours=1))
        self.assertEqual(len(gaps), 1)
        self.assertGreater(gaps[0]["gap_minutes"], 96 * 60)

    def test_rejects_extended_weekday_outage(self):
        detect = self.detector()
        stamps = pd.to_datetime([
            "2025-11-03T00:00:00Z", "2025-11-07T12:00:00Z"
        ])
        gaps = detect(stamps, pd.Timedelta(hours=1))
        self.assertEqual(len(gaps), 1)

    def test_rejects_97_hour_gap_even_when_it_crosses_weekend(self):
        bounded = self.bounded_closure()
        previous = pd.Timestamp("2025-11-07T21:00:00Z")
        current = pd.Timestamp("2025-11-11T22:00:00Z")
        self.assertEqual((current - previous).total_seconds() / 3600, 97)
        self.assertFalse(bounded(previous, current, pd.Timedelta(hours=1)))

    def test_rejects_multi_month_trailing_boundary_gap_crossing_weekends(self):
        detect = self.boundary_detector()
        last_bar = pd.Timestamp("2025-12-31T21:00:00Z")
        requested_end = pd.Timestamp("2026-11-06T00:00:00Z")
        issues = detect(
            pd.Timestamp("2025-01-01T00:00:00Z"),
            last_bar,
            pd.Timestamp("2025-01-01T00:00:00Z"),
            requested_end,
            pd.Timedelta(hours=1),
        )
        self.assertEqual([item["boundary"] for item in issues], ["end"])
        self.assertEqual(issues[0]["lag_hours"], 7419)

    def test_accepts_bounded_weekend_gap_at_requested_end_boundary(self):
        detect = self.boundary_detector()
        issues = detect(
            pd.Timestamp("2025-11-03T00:00:00Z"),
            pd.Timestamp("2025-11-07T21:00:00Z"),
            pd.Timestamp("2025-11-03T00:00:00Z"),
            pd.Timestamp("2025-11-09T23:00:00Z"),
            pd.Timedelta(hours=1),
        )
        self.assertEqual(issues, [])


class OHLCVValidationTests(unittest.TestCase):
    def setUp(self):
        self.validate = validator_namespace()["validate_ohlcv"]
        self.valid = pd.DataFrame({
            "timestamp_utc": pd.date_range("2026-01-01", periods=4, freq="h", tz="UTC"),
            "open": [100.0, 101.0, 100.5, 102.0],
            "high": [102.0, 103.0, 102.0, 104.0],
            "low": [99.0, 100.0, 99.5, 101.0],
            "close": [101.0, 102.0, 101.5, 103.0],
            "tick_volume": [120, 135, 98, 150],
        })

    def test_accepts_genuine_tick_volume_alias_and_normalizes_timestamp(self):
        result = self.validate(self.valid)
        self.assertEqual(list(result.columns), [
            "timestamp", "open", "high", "low", "close", "volume"
        ])
        self.assertEqual(result["volume"].tolist(), [120, 135, 98, 150])
        self.assertTrue(pd.api.types.is_datetime64_any_dtype(result["timestamp"]))
        self.assertEqual(str(result["timestamp"].dt.tz), "UTC")

    def test_rejects_current_ohlc_only_dataset_without_fabricating_volume(self):
        with self.assertRaisesRegex(ValueError, "genuine MT5 tick_volume"):
            self.validate(self.valid.drop(columns=["tick_volume"]))

    def test_rejects_duplicate_timestamps(self):
        duplicated = pd.concat([self.valid, self.valid.iloc[[0]]], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "Duplicate timestamps"):
            self.validate(duplicated)

    def test_rejects_unsorted_timestamps_instead_of_silently_sorting(self):
        unsorted = self.valid.iloc[[1, 0, 2, 3]].reset_index(drop=True)
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            self.validate(unsorted)

    def test_rejects_invalid_ohlc_bounds(self):
        invalid = self.valid.copy()
        invalid.loc[0, "high"] = 98.0
        with self.assertRaisesRegex(ValueError, "Invalid OHLC bounds"):
            self.validate(invalid)

    def test_rejects_fractional_tick_volume(self):
        invalid = self.valid.copy()
        invalid["tick_volume"] = invalid["tick_volume"].astype("float64")
        invalid.loc[0, "tick_volume"] = 1.5
        with self.assertRaisesRegex(ValueError, "tick_volume must be a non-negative integer"):
            self.validate(invalid)

    def test_rejects_negative_volume(self):
        invalid = self.valid.copy()
        invalid.loc[0, "tick_volume"] = -1
        with self.assertRaisesRegex(ValueError, "negative volume"):
            self.validate(invalid)


    def test_training_is_disabled_by_default_for_all_models(self):
        notebook = load_notebook()
        source = "\\n".join(
            "".join(cell.get("source", []))
            for cell in notebook["cells"] if cell["cell_type"] == "code"
        )
        self.assertIn("TRAINING_ENABLED = False", source)
        self.assertIn("if not training_allowed:", source)
        self.assertIn("if TRAINING_ENABLED and RUN_LSTM:", source)

    def test_every_model_fit_call_is_inside_training_enabled_guard(self):
        notebook = load_notebook()
        for index, cell in enumerate(notebook["cells"]):
            if cell["cell_type"] != "code":
                continue
            tree = ast.parse("".join(cell["source"]), filename=f"cell-{index}")
            guarded_nodes = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.If) and isinstance(node.test, ast.Name) and node.test.id == "TRAINING_ENABLED":
                    guarded_nodes.update(id(child) for child in ast.walk(node))
                if isinstance(node, ast.If) and isinstance(node.test, ast.Name) and node.test.id == "training_allowed":
                    guarded_nodes.update(id(child) for child in ast.walk(node))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "fit":
                    self.assertIn(id(node), guarded_nodes, f"unguarded .fit() in notebook cell {index}")

    def test_training_gate_requires_explicit_opt_in_and_manifest_integrity(self):
        notebook = load_notebook()
        cell = next(
            cell for cell in notebook["cells"]
            if cell["cell_type"] == "code"
            and "def training_gate_enabled" in "".join(cell["source"])
        )
        tree = ast.parse("".join(cell["source"]))
        function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "training_gate_enabled"
        )
        namespace = {"Path": Path, "json": json, "hashlib": __import__("hashlib")}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(NOTEBOOK), "exec"), namespace)
        with __import__("tempfile").TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / "dataset.csv"
            manifest = root / "manifest.json"
            data.write_bytes(b"verified-candidate")
            digest = __import__("hashlib").sha256(data.read_bytes()).hexdigest()
            manifest.write_text(json.dumps({
                "completeness_status": "PASS",
                "training_eligible": True,
                "ordersEnabled": False,
                "live_trading_enabled": False,
                "sha256": digest,
            }), encoding="utf-8")
            gate = namespace["training_gate_enabled"]
            self.assertFalse(gate(False, manifest, data)[0])
            self.assertTrue(gate(True, manifest, data)[0])
            manifest.write_text(json.dumps({
                "completeness_status": "BLOCKED",
                "training_eligible": False,
                "ordersEnabled": False,
                "live_trading_enabled": False,
                "sha256": digest,
            }), encoding="utf-8")
            self.assertFalse(gate(True, manifest, data)[0])


if __name__ == "__main__":
    unittest.main()
