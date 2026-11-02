import csv
import hashlib
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.csv"
MANIFEST_PATH = ROOT / "datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.manifest.json"
EXPECTED_SHA256 = "317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37"


class ExnessUsdCalendarDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = CSV_PATH.read_bytes()
        cls.text = cls.raw.decode("utf-8-sig")
        cls.rows = list(csv.DictReader(cls.text.splitlines()))
        cls.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    def test_canonical_file_integrity(self):
        self.assertEqual(len(self.raw), 386146)
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), EXPECTED_SHA256)
        self.assertNotIn(b"\r\n", self.raw)

    def test_manifest_matches_dataset_and_export_evidence(self):
        self.assertEqual(self.manifest["integrity"]["canonical_git_lf_sha256"], EXPECTED_SHA256)
        self.assertEqual(self.manifest["validation"]["rows"], len(self.rows))
        self.assertEqual(self.manifest["export_evidence"]["events"], 2166)
        self.assertEqual(self.manifest["export_evidence"]["success_markers"], 2)
        self.assertEqual(self.manifest["export_evidence"]["unknown_time_modes"], 0)
        self.assertEqual(self.manifest["qualification"], "Historical export evidence only. This commit does not represent a fresh MT5 connection or a new export.")

    def test_rows_are_complete_usd_high_impact_datetime_events(self):
        self.assertEqual(len(self.rows), 2166)
        required = ("timestamp", "impact", "currency", "event", "country", "time_mode", "event_id", "value_id")
        for row in self.rows:
            for field in required:
                self.assertTrue(row[field].strip(), f"blank {field}")
            self.assertEqual(row["impact"], "high")
            self.assertEqual(row["currency"], "USD")
            self.assertEqual(row["country"], "US")
            self.assertEqual(row["time_mode"], "datetime")
            timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
            self.assertEqual(timestamp.tzinfo, timezone.utc)
            self.assertGreaterEqual(timestamp, datetime(2022, 7, 21, tzinfo=timezone.utc))
            self.assertLess(timestamp, datetime(2026, 10, 30, tzinfo=timezone.utc))

    def test_event_identifiers_are_unique(self):
        keys = [(row["event_id"], row["value_id"]) for row in self.rows]
        self.assertEqual(len(keys), len(set(keys)))


if __name__ == "__main__":
    unittest.main()
