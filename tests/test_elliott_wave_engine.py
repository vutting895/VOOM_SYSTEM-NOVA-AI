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


class ElliottWaveEngineTests(unittest.TestCase):
    def test_valid_bullish_impulse_is_detected_after_confirmation(self):
        # Alternating swings form low-high-higher-low-higher-high-higher-low-high.
        values = [100, 104, 102, 110, 106, 116, 112, 121, 117, 125, 122, 128, 124]
        frame = candles(values)
        features = build_elliott_wave_features(frame, left=1, right=1)
        self.assertEqual(len(features), len(frame))
        self.assertTrue(set(features["elliott_wave_number"].unique()).issubset(set(range(6))))
        self.assertTrue((features["elliott_impulse_complete"] == 1).any())
        self.assertTrue((features["elliott_impulse_complete"] <= features["elliott_impulse_valid"]).all())

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

