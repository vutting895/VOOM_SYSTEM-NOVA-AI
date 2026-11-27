import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from validate_exness_h1_dataset import audit_dataset, audit_rows


def row(timestamp, *, open_price="100", high="102", low="99", close="101", volume="100"):
    return {
        "timestamp_utc": timestamp,
        "open": open_price,
        "high": high,
        "low": low,
        "close": close,
        "tick_volume": volume,
    }


class ExnessH1DatasetAuditTests(unittest.TestCase):
    def test_current_snapshot_has_valid_volume_but_is_blocked_by_missing_history(self):
        csv_path = ROOT / "data" / "market" / "exness" / "XAUUSDm_H1_3Y.csv"
        manifest_path = ROOT / "data" / "market" / "exness" / "XAUUSDm_H1_3Y.manifest.json"
        report = audit_dataset(csv_path, manifest_path)

        self.assertEqual(report["rows"], 12733)
        self.assertEqual(report["volume_status"], "PASS")
        self.assertEqual(report["tick_volume_min"], 254)
        self.assertEqual(report["tick_volume_max"], 124680)
        self.assertEqual(report["tick_volume_zero_rows"], 0)
        self.assertEqual(report["coverage_status"], "BLOCKED")
        self.assertEqual(report["long_gap_count"], 1)
        self.assertEqual(report["max_gap_hours"], 7419)
        self.assertEqual(report["daily_rollover_gap_count"], 426)
        self.assertEqual(report["weekend_closure_gap_count"], 112)
        self.assertEqual(report["unexplained_gap_count"], 18)
        self.assertTrue(report["manifest_checks"]["gap_count_over_1h_matches"])
        self.assertTrue(report["manifest_checks"]["daily_rollover_count_matches"])
        self.assertTrue(report["manifest_checks"]["weekend_closure_count_matches"])
        self.assertTrue(report["manifest_checks"]["unexplained_gap_count_matches"])
        self.assertFalse(report["training_eligible"])
        self.assertFalse(report["manifest_checks"]["training_eligible_flag_is_true"])
        self.assertFalse(report["manifest_checks"]["completeness_status_is_pass"])
        self.assertIn("manifest_mismatch:training_eligible_flag_is_true", report["errors"])
        self.assertIn("manifest_mismatch:completeness_status_is_pass", report["errors"])

    def test_normal_weekend_closure_under_96_hours_is_allowed(self):
        records = [
            row("2026-01-02T20:00:00Z"),
            row("2026-01-05T22:00:00Z"),
        ]
        summary, errors = audit_rows(records)
        self.assertEqual(summary["max_gap_hours"], 74)
        self.assertEqual(summary["long_gap_count"], 0)
        self.assertEqual(errors, [])

    def test_documented_xau_daily_rollover_windows_are_allowed(self):
        seasonal_windows = [
            ["2025-11-03T21:00:00Z", "2025-11-03T23:00:00Z"],
            ["2025-03-10T20:00:00Z", "2025-03-10T22:00:00Z"],
        ]
        for stamps in seasonal_windows:
            with self.subTest(window=stamps):
                summary, errors = audit_rows([row(stamps[0]), row(stamps[1])])
                self.assertEqual(summary["daily_rollover_gap_count"], 1)
                self.assertEqual(summary["unexplained_gap_count"], 0)
                self.assertEqual(errors, [])

    def test_unrecognized_four_hour_weekday_gap_is_blocked(self):
        summary, errors = audit_rows([
            row("2025-11-03T19:00:00Z"),
            row("2025-11-03T23:00:00Z"),
        ])
        self.assertEqual(summary["unexplained_gap_count"], 1)
        self.assertEqual(summary["unexplained_gaps"][0]["hours"], 4)
        self.assertTrue(any("unexplained_historical_gap" in error for error in errors))

    def test_holiday_length_weekday_gap_is_not_assumed_to_be_a_market_closure(self):
        summary, errors = audit_rows([
            row("2024-12-24T18:00:00Z"),
            row("2024-12-25T23:00:00Z"),
        ])
        self.assertEqual(summary["unexplained_gap_count"], 1)
        self.assertEqual(summary["unexplained_gaps"][0]["hours"], 29)
        self.assertTrue(any("unexplained_historical_gap" in error for error in errors))

    def test_gap_over_96_hours_is_blocked(self):
        records = [
            row("2026-01-02T20:00:00Z"),
            row("2026-01-06T21:00:00Z"),
        ]
        summary, errors = audit_rows(records)
        self.assertEqual(summary["max_gap_hours"], 97)
        self.assertEqual(summary["long_gap_count"], 1)
        self.assertTrue(any("historical_gap_exceeds_96_hours" in error for error in errors))

    def test_duplicate_and_out_of_order_timestamps_are_blocked(self):
        duplicate = [
            row("2026-01-01T00:00:00Z"),
            row("2026-01-01T00:00:00Z"),
        ]
        _, errors = audit_rows(duplicate)
        self.assertTrue(any("timestamps_not_strictly_increasing" in error for error in errors))

        out_of_order = [
            row("2026-01-01T01:00:00Z"),
            row("2026-01-01T00:00:00Z"),
        ]
        _, errors = audit_rows(out_of_order)
        self.assertTrue(any("timestamps_not_strictly_increasing" in error for error in errors))

    def test_negative_or_fractional_tick_volume_is_blocked(self):
        for volume in ("-1", "10.5"):
            with self.subTest(volume=volume):
                summary, errors = audit_rows([
                    row("2026-01-01T00:00:00Z", volume=volume)
                ])
                self.assertFalse(summary["tick_volume_negative_rows"] == 0 and summary["tick_volume_fractional_rows"] == 0)
                self.assertTrue(errors)

    def test_invalid_ohlc_bounds_are_blocked(self):
        summary, errors = audit_rows([
            row("2026-01-01T00:00:00Z", open_price="103", high="102")
        ])
        self.assertEqual(summary["invalid_ohlc_rows"], 1)
        self.assertTrue(any("invalid_ohlc_bounds" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
