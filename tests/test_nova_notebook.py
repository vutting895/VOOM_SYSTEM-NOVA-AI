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
    def test_valid_nbformat_json(self):
        notebook = load_notebook()
        self.assertEqual(notebook["nbformat"], 4)
        self.assertGreaterEqual(notebook["nbformat_minor"], 5)
        self.assertTrue(notebook["cells"])

    def test_all_code_cells_parse(self):
        for index, cell in enumerate(load_notebook()["cells"]):
            if cell["cell_type"] == "code":
                compile("".join(cell["source"]), f"notebook-cell-{index}", "exec")

    def test_notebook_uses_https_bridge_and_sha256_manifest(self):
        source = "\\n".join("".join(c.get("source", [])) for c in load_notebook()["cells"] if c["cell_type"] == "code")
        self.assertIn("/api/history", source)
        self.assertIn("NOVA_MT5_BRIDGE_TOKEN", source)
        self.assertIn("sha256", source)
        self.assertIn("EXNESS_DEMO", source)
        self.assertIn("ordersEnabled", source)
        self.assertNotIn("order_send", source)

    def test_code_cells_have_no_stale_outputs(self):
        for cell in load_notebook()["cells"]:
            if cell["cell_type"] == "code":
                self.assertIsNone(cell["execution_count"])
                self.assertEqual(cell["outputs"], [])


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
        self.assertTrue(str(result["timestamp"].dtype).startswith("datetime64[ns, UTC]"))

    def test_rejects_current_ohlc_only_dataset_without_fabricating_volume(self):
        with self.assertRaisesRegex(ValueError, "genuine MT5 tick_volume"):
            self.validate(self.valid.drop(columns=["tick_volume"]))

    def test_rejects_duplicate_timestamps(self):
        duplicated = pd.concat([self.valid, self.valid.iloc[[0]]], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "Duplicate timestamps"):
            self.validate(duplicated)

    def test_rejects_invalid_ohlc_bounds(self):
        invalid = self.valid.copy()
        invalid.loc[0, "high"] = 98.0
        with self.assertRaisesRegex(ValueError, "Invalid OHLC bounds"):
            self.validate(invalid)

    def test_rejects_negative_volume(self):
        invalid = self.valid.copy()
        invalid.loc[0, "tick_volume"] = -1
        with self.assertRaisesRegex(ValueError, "negative volume"):
            self.validate(invalid)


if __name__ == "__main__":
    unittest.main()
