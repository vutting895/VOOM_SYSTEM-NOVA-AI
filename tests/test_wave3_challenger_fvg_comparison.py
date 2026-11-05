import csv
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from research.wave3_challenger.compare_fvg_training_inner import (
    load_inner_fold_specs,
    load_pre_oos_bars,
    summarize_inner_fold,
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
        self.assertEqual(result["post_full_mitigation_retouch_bars"], 1)

    def test_manifest_last_included_bar_becomes_true_exclusive_boundary(self):
        model = {
            "data_sha256": "0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266",
            "timeframe": "M15",
            "auto_tuning": {
                "selected_trial": 4,
                "inner_validation_folds": 2,
                "purge_bars": 12,
                "trials": [{
                    "trial": 4,
                    "folds": [
                        {"inner_fold": 1, "validation_start": "2024-12-30T23:45:00+00:00", "validation_end_exclusive": "2025-07-07T02:45:00+00:00", "train_rows": 57661, "validation_rows": 12092},
                        {"inner_fold": 2, "validation_start": "2025-10-14T00:30:00+00:00", "validation_end_exclusive": "2026-04-21T01:30:00+00:00", "train_rows": 76262, "validation_rows": 12092},
                    ],
                }],
            },
        }
        specs = load_inner_fold_specs(model)
        self.assertEqual(specs[0]["validation_end_exclusive_utc"], datetime(2025, 7, 7, 3, 0, tzinfo=timezone.utc))
        self.assertEqual(specs[1]["validation_end_exclusive_utc"], datetime(2026, 4, 21, 1, 45, tzinfo=timezone.utc))
        self.assertEqual(specs[0]["model_manifest_validation_rows"], 12092)

    def test_inner_training_window_applies_twelve_source_bar_purge(self):
        bars = [candle(100.0, 100.5, 99.8, 100.1) for _ in range(60)]
        trace = build_bullish_fvg_event_trace(bars)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        stamps = [start + timedelta(minutes=15 * i) for i in range(60)]
        spec = {
            "fold": 1,
            "validation_start_utc": stamps[30],
            "validation_end_exclusive_utc": stamps[40],
            "validation_last_included_bar_utc": stamps[39],
            "purge_bars": 12,
            "model_manifest_train_rows": 18,
            "model_manifest_validation_rows": 10,
            "model_manifest_selected_trial": 4,
        }
        result = summarize_inner_fold(stamps, trace, spec)
        self.assertEqual(result["training_raw_source_bars"]["bars"], 18)
        self.assertEqual(result["validation_raw_source_bars"]["bars"], 10)
        self.assertEqual(result["purge_source_bars"], 12)
        self.assertEqual(result["training_raw_source_bars"]["window_end_exclusive_utc"], stamps[18].isoformat().replace("+00:00", "Z"))

    def test_pre_oos_loader_never_converts_final_oos_ohlc(self):
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
