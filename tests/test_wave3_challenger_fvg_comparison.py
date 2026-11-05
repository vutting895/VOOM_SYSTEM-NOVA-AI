import csv
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from research.wave3_challenger.compare_fvg_training_inner import (
    load_pre_oos_bars,
    summarize_window,
)
from research.wave3_challenger.fvg_events import build_bullish_fvg_event_trace


def candle(open_price, high, low, close):
    return {"open": open_price, "high": high, "low": low, "close": close}


def to_rows(bars, start):
    return [
        {
            "timestamp": (start + timedelta(minutes=15 * i)).isoformat().replace("+00:00", "Z"),
            **bar,
        }
        for i, bar in enumerate(bars)
    ]


class TestFvgTrainingInnerComparison(unittest.TestCase):
    def test_window_summary_keeps_three_definitions_separate(self):
        bars = [
            candle(99.5, 100.0, 99.0, 99.8),
            candle(101.0, 101.5, 100.5, 101.0),
            candle(102.0, 103.0, 101.0, 102.0),
            candle(101.4, 101.8, 100.9, 101.2),
            candle(101.2, 101.7, 100.8, 101.0),
            candle(100.2, 100.4, 99.8, 100.0),
            candle(100.5, 100.7, 99.9, 100.1),
        ]
        trace = build_bullish_fvg_event_trace(bars)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        stamps = [start + timedelta(minutes=15 * i) for i in range(len(bars))]
        result = summarize_window(stamps, trace, stamps[0], stamps[-1] + timedelta(minutes=15))
        self.assertEqual(result["bars"], 7)
        self.assertEqual(result["first_touch_only_events"], 1)
        self.assertEqual(result["first_full_mitigation_only_events"], 1)
        self.assertEqual(result["repeat_touch_within_48_events"], 4)
        self.assertEqual(result["post_full_mitigation_retouch_bars"], 1)
        self.assertIsNotNone(result["rate_per_1000_bars"]["first_touch_only"])

    def test_end_exclusive_window_does_not_include_boundary_bar(self):
        bars = [
            candle(99.5, 100.0, 99.0, 99.8),
            candle(101.0, 101.5, 100.5, 101.0),
            candle(102.0, 103.0, 101.0, 102.0),
        ]
        trace = build_bullish_fvg_event_trace(bars)
        stamps = [
            datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 1, 1, 0, 15, tzinfo=timezone.utc),
            datetime(2026, 1, 1, 0, 30, tzinfo=timezone.utc),
        ]
        result = summarize_window(stamps, trace, stamps[0], stamps[2])
        self.assertEqual(result["bars"], 2)
        self.assertEqual(result["bullish_fvg_creations"], 0)

    def test_pre_oos_loader_never_converts_final_oos_ohlc(self):
        start = datetime(2026, 6, 30, 23, 30, tzinfo=timezone.utc)
        rows = [
            {"timestamp": "2026-06-30T23:30:00Z", "open": 100, "high": 101, "low": 99, "close": 100},
            {"timestamp": "2026-06-30T23:45:00Z", "open": 100, "high": 102, "low": 99, "close": 101},
            {"timestamp": "2026-07-01T00:00:00Z", "open": "FINAL_OOS_MUST_NOT_PARSE", "high": "x", "low": "x", "close": "x"},
            {"timestamp": "2026-07-01T00:15:00Z", "open": "x", "high": "x", "low": "x", "close": "x"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "bars.csv"
            metadata_path = Path(directory) / "metadata.json"
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=["timestamp", "open", "high", "low", "close"])
                writer.writeheader()
                writer.writerows(rows)
            digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
            metadata_path.write_text(json.dumps({"sha256": digest}), encoding="utf-8")
            _, actual_digest, bars, timestamps = load_pre_oos_bars(
                csv_path, metadata_path, expected_sha256=digest, min_bars=1
            )
            self.assertEqual(actual_digest, digest)
            self.assertEqual(len(bars), 2)
            self.assertEqual(len(timestamps), 2)
            self.assertEqual(bars[-1]["close"], 101.0)
            self.assertLess(timestamps[-1], datetime(2026, 7, 1, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
