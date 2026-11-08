import unittest
from datetime import datetime, timedelta, timezone

from scripts.validate_exness_m15_candidate import validate_manifest, validate_rows


def row(timestamp, *, tick_volume="12"):
    return {
        "timestamp": timestamp,
        "open": "2000.000",
        "high": "2001.000",
        "low": "1999.000",
        "close": "2000.500",
        "tick_volume": tick_volume,
    }


class ExnessM15CandidateValidatorTests(unittest.TestCase):
    def test_accepts_contiguous_rows_and_keeps_training_disabled(self):
        rows = [
            row("2026-01-01T00:00:00Z"),
            row("2026-01-01T00:15:00Z"),
            row("2026-01-01T00:30:00Z"),
        ]
        result = validate_rows(rows)
        self.assertEqual(result["row_count"], 3)
        self.assertEqual(result["continuity_status"], "PASS")
        self.assertIs(result["training_eligible"], False)

    def test_rejects_missing_tick_volume_even_if_generic_volume_exists(self):
        item = row("2026-01-01T00:00:00Z")
        item["volume"] = "99"
        del item["tick_volume"]
        with self.assertRaisesRegex(ValueError, "tick_volume"):
            validate_rows([item])

    def test_rejects_fractional_tick_volume(self):
        with self.assertRaisesRegex(ValueError, "non-negative integer"):
            validate_rows([row("2026-01-01T00:00:00Z", tick_volume="12.5")])

    def test_rejects_negative_tick_volume(self):
        with self.assertRaisesRegex(ValueError, "non-negative integer"):
            validate_rows([row("2026-01-01T00:00:00Z", tick_volume="-1")])

    def test_rejects_duplicate_or_descending_timestamps(self):
        with self.assertRaisesRegex(ValueError, "strictly ascending"):
            validate_rows([
                row("2026-01-01T00:00:00Z"),
                row("2026-01-01T00:00:00Z"),
            ])

    def test_rejects_gap_over_four_days(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        later = start + timedelta(hours=96, minutes=15)
        with self.assertRaisesRegex(ValueError, "historical gap exceeds"):
            validate_rows([
                row(start.isoformat()),
                row(later.isoformat()),
            ])

    def test_accepts_weekend_sized_gap_within_policy(self):
        result = validate_rows([
            row("2026-01-02T20:00:00Z"),
            row("2026-01-05T00:00:00Z"),
        ])
        self.assertEqual(result["continuity_status"], "PASS")
        self.assertEqual(result["largest_observed_gap_hours"], 52.0)

    def test_rejects_non_utc_and_unaligned_timestamps(self):
        with self.assertRaisesRegex(ValueError, "UTC"):
            validate_rows([row("2026-01-01T00:00:00+01:00")])
        with self.assertRaisesRegex(ValueError, "15-minute boundary"):
            validate_rows([row("2026-01-01T00:07:00Z")])

    def test_manifest_requires_candidate_only_and_training_disabled(self):
        manifest = {
            "symbol": "XAUUSDm",
            "timeframe": "M15",
            "timezone": "UTC",
            "account_mode": "DEMO",
            "tick_volume_field": "tick_volume",
            "benchmark_eligibility": "candidate_only",
            "training_eligible": False,
        }
        validate_manifest(manifest)
        manifest["training_eligible"] = True
        with self.assertRaisesRegex(ValueError, "training_eligible=false"):
            validate_manifest(manifest)


if __name__ == "__main__":
    unittest.main()
