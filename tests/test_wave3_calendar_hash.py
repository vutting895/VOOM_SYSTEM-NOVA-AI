import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from verify_wave3_news_calendar import (
    EXPECTED_CALENDAR_SHA256,
    verify_calendar_sha256,
)


class Wave3CalendarHashTests(unittest.TestCase):
    def test_pinned_digest_matches_canonical_repository_calendar(self):
        path = ROOT / "datasets" / "exness-demo" / "news" / "VOOM_USD_High_Impact_2022_2026.csv"
        result = verify_calendar_sha256(path)
        self.assertEqual(result.sha256, EXPECTED_CALENDAR_SHA256)
        self.assertEqual(result.size_bytes, 386146)

    def test_manifest_records_verified_raw_and_canonical_hashes(self):
        manifest_path = ROOT / "datasets" / "exness-demo" / "news" / "VOOM_USD_High_Impact_2022_2026.manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["integrity"]["raw_terminal_csv_bytes"], 388313)
        self.assertEqual(manifest["integrity"]["raw_terminal_csv_sha256"], "6754d46f34e76fc171e64afec51297dbcd3caf0ac6cf4d4dd196bc1a993b526c")
        self.assertEqual(manifest["integrity"]["canonical_git_lf_bytes"], 386146)
        self.assertEqual(manifest["integrity"]["canonical_git_lf_sha256"], EXPECTED_CALENDAR_SHA256)
        self.assertEqual(manifest["export_evidence"]["success_markers"], 2)
        self.assertEqual(manifest["export_evidence"]["events"], 2166)
        self.assertEqual(manifest["export_evidence"]["queried_values"], 15853)
        self.assertEqual(manifest["export_evidence"]["unknown_time_modes"], 0)
        self.assertTrue(manifest["qualification"].startswith("Historical export evidence only."))

    def test_rejects_modified_calendar_bytes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "calendar.csv"
            path.write_bytes(b"timestamp,impact\n2026-01-01T00:00:00Z,high\n")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                verify_calendar_sha256(path)

    def test_rejects_malformed_expected_digest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "calendar.csv"
            path.write_bytes(b"calendar")
            with self.assertRaisesRegex(ValueError, "exactly 64 hexadecimal"):
                verify_calendar_sha256(path, "6754d46f34e76fc171e64afec51297dbcd3caf4d4dd196bc1a993b526c")


if __name__ == "__main__":
    unittest.main()
