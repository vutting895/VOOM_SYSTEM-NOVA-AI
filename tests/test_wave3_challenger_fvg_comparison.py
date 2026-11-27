import csv
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from research.wave3_challenger.compare_fvg_training_inner import (
    derive_fold_source_windows,
    load_pre_oos_frame,
    summarize_window,
)
from research.wave3_challenger.fvg_events import build_bullish_fvg_event_trace


def candle(open_price, high, low, close):
    return {"open": open_price, "high": high, "low": low, "close": close}


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

    def test_pre_oos_loader_keeps_production_minimum_by_default(self):
        rows = [
            {"timestamp": "2026-06-30T23:45:00Z", "open": 100, "high": 101, "low": 99,
             "close": 100, "spread_price": 0.2, "tick_volume": 10},
            {"timestamp": "2026-07-01T00:00:00Z", "open": "x", "high": "x", "low": "x",
             "close": "x", "spread_price": "x", "tick_volume": "x"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "bars.csv"
            metadata_path = Path(directory) / "metadata.json"
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
            metadata_path.write_text(json.dumps({"sha256": digest}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "insufficient_pre_oos_bars"):
                load_pre_oos_frame(csv_path, metadata_path, expected_sha256=digest)

    def test_benchmark_fold_source_windows_respect_twelve_source_bar_purge(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        stamps = [start + timedelta(minutes=15 * i) for i in range(100)]
        sources = list(range(100))
        split = {"fold": 1, "train_indices": list(range(18)), "validation_indices": list(range(30, 40))}
        result = derive_fold_source_windows(stamps, sources, split)
        self.assertEqual(result["training_source_start_index"], 0)
        self.assertEqual(result["training_source_end_exclusive_index"], 18)
        self.assertEqual(result["validation_source_start_index"], 30)
        self.assertEqual(result["validation_source_end_exclusive_index"], 40)
        self.assertEqual(result["purge_gap_source_bars"], 12)

    def test_pre_oos_loader_never_converts_final_oos_ohlcv(self):
        rows = [
            {"timestamp": "2026-06-30T23:30:00Z", "open": 100, "high": 101, "low": 99, "close": 100, "spread_price": 0.2, "tick_volume": 10},
            {"timestamp": "2026-06-30T23:45:00Z", "open": 100, "high": 102, "low": 99, "close": 101, "spread_price": 0.2, "tick_volume": 11},
            {"timestamp": "2026-07-01T00:00:00Z", "open": "FINAL_OOS_MUST_NOT_PARSE", "high": "x", "low": "x", "close": "x", "spread_price": "x", "tick_volume": "x"},
            {"timestamp": "2026-07-01T00:15:00Z", "open": "x", "high": "x", "low": "x", "close": "x", "spread_price": "x", "tick_volume": "x"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "bars.csv"
            metadata_path = Path(directory) / "metadata.json"
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
            metadata_path.write_text(json.dumps({"sha256": digest}), encoding="utf-8")
            _, actual, bars, timestamps, fvg_bars = load_pre_oos_frame(
                csv_path, metadata_path, expected_sha256=digest, min_pre_oos_bars=2
            )
            self.assertEqual(actual, digest)
            self.assertEqual(len(bars), 2)
            self.assertEqual(len(timestamps), 2)
            self.assertEqual(len(fvg_bars), 2)
            self.assertEqual(bars[-1]["close"], 101.0)
            self.assertEqual(bars[-1]["volume"], 11.0)
            self.assertLess(timestamps[-1], datetime(2026, 7, 1, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
