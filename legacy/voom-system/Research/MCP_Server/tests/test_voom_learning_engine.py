import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import voom_learning_engine as engine

class LearningEngineTests(unittest.TestCase):
    def setUp(self):
        self.original_path = engine.DATASET_PATH
        self.tmp = tempfile.TemporaryDirectory()
        engine.DATASET_PATH = Path(self.tmp.name) / "voom_sft.jsonl"

    def tearDown(self):
        engine.DATASET_PATH = self.original_path
        self.tmp.cleanup()

    def valid_row(self, **overrides):
        row = {
            "example_id": "example-001",
            "instruction": "Answer using only the supplied evidence.",
            "input": "Official documentation states this behavior.",
            "output": "The source supports this claim; cite the reference and note limits.",
            "source_urls": ["https://example.org/docs"],
            "license": "internal-authored",
            "review_status": "approved",
            "language": "en"
        }
        row.update(overrides)
        return row

    def write_rows(self, rows):
        engine.DATASET_PATH.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")

    def test_empty_dataset_is_safe(self):
        result = engine.validate_dataset()
        self.assertTrue(result["ok"])
        self.assertFalse(result["exists"])

    def test_approved_source_backed_example_passes(self):
        self.write_rows([self.valid_row()])
        self.assertTrue(engine.validate_dataset()["ok"])

    def test_unreviewed_or_missing_license_is_rejected(self):
        self.write_rows([self.valid_row(review_status="pending_review", license="unknown")])
        result = engine.validate_dataset()
        self.assertFalse(result["ok"])
        self.assertGreaterEqual(result["error_count"], 2)

    def test_duplicate_ids_and_sensitive_patterns_are_rejected(self):
        first = self.valid_row()
        second = self.valid_row(output="api_key=example_sensitive_value should not be learned")
        self.write_rows([first, second])
        result = engine.validate_dataset()
        self.assertFalse(result["ok"])
        self.assertTrue(any("duplicate" in e["error"] for e in result["errors"]))
        self.assertTrue(any("sensitive" in e["error"] for e in result["errors"]))

    def test_no_auto_training_or_trading_authority(self):
        status = engine.status()
        self.assertFalse(status["auto_training_enabled"])
        self.assertFalse(status["live_trading_enabled"])
        self.assertFalse(status["mt5_order_path_modified"])

if __name__ == "__main__":
    unittest.main()
