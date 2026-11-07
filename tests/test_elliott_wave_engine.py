import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "strategy"))
from elliott_wave_engine import build_elliott_wave_features


def candles(close):
    close = np.asarray(close, dtype=float)
    open_ = np.r_[close[0], close[:-1]]
    high = np.maximum(open_, close) + 0.2
    low = np.minimum(open_, close) - 0.2
    return pd.DataFrame({
        "timestamp": pd.date_range("2024-01-01", periods=len(close), freq="15min", tz="UTC"),
        "open": open_, "high": high, "low": low, "close": close,
    })


def pivot_candles(swings):
    """Make unambiguous alternating pivots with a confirming bar at each edge."""
    highs = []
    lows = []
    for kind, price in swings:
        if kind == "low":
            highs.append(float(price) + 2.0)
            lows.append(float(price) - 0.5)
        else:
            highs.append(float(price) + 0.5)
            lows.append(float(price) - 2.0)
    highs = np.asarray([highs[0] - 1.0, *highs, highs[-1] - 1.0], dtype=float)
    lows = np.asarray([lows[0] + 1.0, *lows, lows[-1] + 1.0], dtype=float)
    close = (highs + lows) / 2.0
    return pd.DataFrame({
        "timestamp": pd.date_range("2024-01-01", periods=len(close), freq="15min", tz="UTC"),
        "open": close, "high": highs, "low": lows, "close": close,
    })


class ElliottWaveEngineTests(unittest.TestCase):
    def test_valid_bullish_impulse_is_detected_after_confirmation(self):
        frame = pivot_candles([
            ("low", 100), ("high", 104), ("low", 102),
            ("high", 112), ("low", 108), ("high", 118),
        ])
        features = build_elliott_wave_features(frame, left=1, right=1)
        self.assertEqual(len(features), len(frame))
        self.assertTrue((features["elliott_wave_number"] == 5).any())
        self.assertTrue((features["elliott_direction"] == 1).any())
        self.assertTrue((features["elliott_impulse_complete"] == 1).any())
        self.assertTrue((features["elliott_impulse_complete"] <= features["elliott_impulse_valid"]).all())

    def test_wave1_to_wave4_are_visible_before_wave5_completes(self):
        frame = pivot_candles([
            ("low", 100), ("high", 104), ("low", 102),
            ("high", 112), ("low", 108),
        ])
        features = build_elliott_wave_features(frame, left=1, right=1)
        for wave in (1, 2, 3, 4):
            self.assertTrue((features["elliott_wave_number"] == wave).any(), f"Wave {wave} missing")

    def test_valid_bearish_impulse_is_detected(self):
        frame = pivot_candles([
            ("high", 130), ("low", 126), ("high", 128),
            ("low", 118), ("high", 122), ("low", 112),
        ])
        features = build_elliott_wave_features(frame, left=1, right=1)
        self.assertTrue((features["elliott_wave_number"] == 5).any())
        self.assertTrue((features["elliott_direction"] == -1).any())
        self.assertTrue((features["elliott_impulse_complete"] == 1).any())

    def test_wave3_shortest_is_rejected(self):
        frame = pivot_candles([
            ("low", 100), ("high", 110), ("low", 105),
            ("high", 113), ("low", 112), ("high", 124),
        ])
        features = build_elliott_wave_features(frame, left=1, right=1)
        self.assertFalse((features["elliott_impulse_complete"] == 1).any())
        self.assertFalse((features["elliott_wave_number"] == 5).any())

    def test_wave4_overlap_is_rejected(self):
        frame = pivot_candles([
            ("low", 100), ("high", 110), ("low", 105),
            ("high", 120), ("low", 109), ("high", 126),
        ])
        features = build_elliott_wave_features(frame, left=1, right=1)
        self.assertFalse((features["elliott_wave_number"] == 4).any())
        self.assertFalse((features["elliott_impulse_complete"] == 1).any())

    def test_future_change_does_not_rewrite_prior_features(self):
        frame = candles(np.linspace(100, 130, 80) + np.sin(np.arange(80) / 2))
        before = build_elliott_wave_features(frame, left=2, right=2)
        changed = frame.copy()
        changed.loc[60, ["open", "high", "low", "close"]] += 20
        after = build_elliott_wave_features(changed, left=2, right=2)
        pd.testing.assert_frame_equal(before.iloc[:60], after.iloc[:60])

    def test_rejects_invalid_ohlc(self):
        frame = candles([10, 11, 10, 12, 11])
        frame.loc[2, "high"] = 1
        with self.assertRaises(ValueError):
            build_elliott_wave_features(frame)

    def test_rejects_invalid_pivot_parameters(self):
        frame = candles([10, 11, 10, 12, 11])
        with self.assertRaises(ValueError):
            build_elliott_wave_features(frame, left=0, right=2)
