"""Unit tests for isolated Source 1 backtest harness; no order execution."""
import unittest
from pathlib import Path
import pandas as pd
from backtest_source1 import load_history, max_drawdown_pct, DEFAULT_CSV

class BacktestHarnessTests(unittest.TestCase):
    def test_drawdown_calculation(self):
        self.assertAlmostEqual(max_drawdown_pct([100, 110, 99, 105]), 10.0, places=6)

    def test_rejects_too_small_dataset(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "tiny.csv"
            pd.DataFrame([{"time":"2026-01-01T00:00:00Z","open":1,"high":2,"low":0.5,"close":1.5,"tick_volume":1,"spread":1}]).to_csv(p,index=False)
            with self.assertRaises(ValueError):
                load_history(p)

    def test_real_history_has_valid_ordered_ohlc(self):
        self.assertTrue(DEFAULT_CSV.is_file())
        df = load_history(DEFAULT_CSV)
        self.assertGreaterEqual(len(df), 300)
        self.assertTrue((df["high"] >= df[["open","close","low"]].max(axis=1)).all())
        self.assertTrue((df["low"] <= df[["open","close","high"]].min(axis=1)).all())
        self.assertTrue(df["time"].is_monotonic_increasing)

if __name__ == "__main__":
    unittest.main(verbosity=2)
