import hashlib
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

    def test_rejects_modified_calendar_bytes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "calendar.csv"
            path.write_bytes(b"timestamp,impact\\n2026-01-01T00:00:00Z,high\\n")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                verify_calendar_sha256(path)

    def test_rejects_malformed_expected_digest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "calendar.csv"
            path.write_bytes(b"calendar")
            with self.assertRaisesRegex(ValueError, "exactly 64 hexadecimal"):
                verify_calendar_sha256(path, "6754d46f34e76fc171e64afec51297dbcd3caf4d4dd196bc1a993b526c")


if __call__ == "__main__":
    unittest.main()
