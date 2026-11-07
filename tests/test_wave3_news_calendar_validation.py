import csv
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from validate_wave3_news_calendar import validate_calendar

FIELDS = [
    "timestamp", "impact", "currency", "event", "country", "time_mode",
    "calendar_source", "calendar_timezone", "coverage_start_utc",
    "coverage_end_exclusive_utc", "event_id", "value_id",
]
BASE = {
    "impact": "high",
    "currency": "USD",
    "event": "Test event",
    "country": "US",
    "time_mode": "datetime",
    "calendar_source": "MQL5 Economic Calendar",
    "calendar_timezone": "UTC (Exness trade server GMT+0)",
    "coverage_start_utc": "2022-07-21T00:00:00Z",
    "coverage_end_exclusive_utc": "2026-10-30T00:00:00Z",
}


class Wave3NewsCalendarValidationTests(unittest.TestCase):
    def write_rows(self, rows):
        temp = tempfile.NamedTemporaryFile(mode="w", newline="", encoding="utf-8", suffix=".csv", delete=False)
        self.addCleanup(Path(temp.name).unlink, missing_ok=True)
        writer = csv.DictWriter(temp, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
        temp.close()
        return Path(temp.name)

    def rows(self):
        return [
            {**BASE, "timestamp": "2022-07-21T12:30:00Z", "event_id": "event-1", "value_id": "value-1"},
            {**BASE, "timestamp": "2026-10-29T20:00:00Z", "event_id": "event-2", "value_id": "value-2"},
        ]

    def test_accepts_valid_utc_calendar(self):
        result = validate_calendar(self.write_rows(self.rows()), expected_rows=2)
        self.assertEqual(result["rows"], 2)
        self.assertEqual(result["time_mode_counts"], {"datetime": 2})

    def test_rejects_duplicate_event_value_pair(self):
        rows = self.rows()
        rows[1]["event_id"] = rows[0]["event_id"]
        rows[1]["value_id"] = rows[0]["value_id"]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_calendar(self.write_rows(rows), expected_rows=2)

    def test_rejects_naive_timestamp(self):
        rows = self.rows()
        rows[0]["timestamp"] = "2022-07-21T12:30:00"
        with self.assertRaisesRegex(ValueError, "explicit UTC"):
            validate_calendar(self.write_rows(rows), expected_rows=2)

    def test_rejects_unsupported_time_mode(self):
        rows = self.rows()
        rows[0]["time_mode"] = "date_only"
        with self.assertRaisesRegex(ValueError, "unsupported time_mode"):
            validate_calendar(self.write_rows(rows), expected_rows=2)

    def test_rejects_out_of_coverage_timestamp(self):
        rows = self.rows()
        rows[0]["timestamp"] = "2022-07-20T23:59:59Z"
        with self.assertRaisesRegex(ValueError, "outside requested UTC coverage"):
            validate_calendar(self.write_rows(rows), expected_rows=2)

    def test_rejects_row_count_mismatch(self):
        with self.assertRaisesRegex(ValueError, "row count mismatch"):
            validate_calendar(self.write_rows(self.rows()[:1]), expected_rows=2)


if __name__ == "__main__":
    unittest.main()
