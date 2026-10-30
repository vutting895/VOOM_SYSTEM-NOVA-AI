import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "backtest"))

from engine_prototype import BacktestInputError, BacktestWorker, ema_series


class EmaBacktestTests(unittest.TestCase):
    def test_ema_series_uses_exponential_weighting(self):
        values = ema_series([10.0, 20.0, 10.0], 2)
        self.assertEqual(values[0], 10.0)
        self.assertAlmostEqual(values[1], 16.6666666667, places=8)
        self.assertAlmostEqual(values[2], 12.2222222222, places=8)

    def test_backtest_identifies_ema_indicator_and_disables_execution(self):
        closes = [100 + i * 0.3 for i in range(35)] + [110 - i * 0.5 for i in range(15)]
        candles = [
            {
                "timestamp": f"2026-01-{(i // 24) + 1:02d}T{i % 24:02d}:00:00Z",
                "open": close,
                "high": close + 1,
                "low": close - 1,
                "close": close,
                "volume": 1,
            }
            for i, close in enumerate(closes)
        ]
        result = BacktestWorker().run({"fast_period": 5, "slow_period": 10}, candles)
        self.assertEqual(result["indicator"], "exponential_moving_average")
        self.assertEqual(result["status"], "completed")
        self.assertFalse(result["execution_enabled"])

    def test_rejects_non_chronological_candles(self):
        candles = [
            {"timestamp": f"{i:03d}", "open": 10, "high": 11, "low": 9, "close": 10, "volume": 1}
            for i in range(30)
        ]
        candles[10]["timestamp"] = "000"
        with self.assertRaises(BacktestInputError):
            BacktestWorker().run({"fast_period": 5, "slow_period": 10}, candles)


if __name__ == "__main__":
    unittest.main()
