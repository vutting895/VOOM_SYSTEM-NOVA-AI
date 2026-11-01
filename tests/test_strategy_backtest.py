"""Regression tests for the event-timed strategy backtest engine."""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "backtest"))
from strategy_engine import BacktestInputError, StrategyBacktestEngine


def sample_candles():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    prices = [100, 105, 110, 108, 106]
    rows = []
    for index, close in enumerate(prices):
        open_price = prices[index - 1] if index else close
        rows.append({
            "timestamp": (start + timedelta(hours=index)).isoformat(),
            "open": open_price,
            "high": max(open_price, close) + 1,
            "low": min(open_price, close) - 1,
            "close": close,
            "volume": 100,
        })
    return rows


class StrategyBacktestTests(unittest.TestCase):
    def test_signal_executes_only_at_next_bar_open(self):
        result = StrategyBacktestEngine(fee_bps=0, spread_bps=0, slippage_bps=0).run(
            sample_candles(), [1, 0, -1, 0, 0]
        )
        trade = result["trades"][0]
        self.assertEqual(trade["entry_signal_index"], 0)
        self.assertEqual(trade["exit_signal_index"], 2)
        self.assertEqual(trade["entry_price"], 100)
        self.assertEqual(trade["exit_price"], 110)
        self.assertEqual(result["execution_model"], "next_bar_open")
        self.assertFalse(result["execution_enabled"])

    def test_costs_reduce_net_profit(self):
        candles = sample_candles()
        signals = [1, 0, -1, 0, 0]
        free = StrategyBacktestEngine(fee_bps=0).run(candles, signals)
        costly = StrategyBacktestEngine(fee_bps=10, spread_bps=4, slippage_bps=3).run(candles, signals)
        self.assertGreater(free["net_profit"], costly["net_profit"])
        self.assertGreater(costly["total_fees"], 0)

    def test_rejects_timezone_naive_and_non_chronological_data(self):
        candles = sample_candles()
        candles[0]["timestamp"] = "2026-01-01T00:00:00"
        with self.assertRaises(BacktestInputError):
            StrategyBacktestEngine().run(candles, [0] * len(candles))
        candles = sample_candles()
        candles[2]["timestamp"] = candles[1]["timestamp"]
        with self.assertRaises(BacktestInputError):
            StrategyBacktestEngine().run(candles, [0] * len(candles))

    def test_rejects_signal_shape_and_ohlc_errors(self):
        candles = sample_candles()
        with self.assertRaises(BacktestInputError):
            StrategyBacktestEngine().run(candles, [1, 0])
        candles[2]["high"] = 1
        with self.assertRaises(BacktestInputError):
            StrategyBacktestEngine().run(candles, [0] * len(candles))

    def test_dataset_hash_and_results_are_deterministic(self):
        engine = StrategyBacktestEngine()
        candles = sample_candles()
        signals = [1, 0, -1, 0, 0]
        first = engine.run(candles, signals)
        second = engine.run(candles, signals)
        self.assertEqual(first, second)
        self.assertEqual(len(first["dataset_hash"]), 64)


if __name__ == "__main__":
    unittest.main(verbosity=2)
