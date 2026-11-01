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
        self.assertGreater(costly["total_spread_slippage_cost"], 0)
        self.assertIn("winning_net_pnl", costly)
        self.assertIn("losing_net_pnl", costly)

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


    def test_verified_mt5_payload_excludes_active_bar_and_runs_engine(self):
        payload = {
            "state": "data_verified",
            "mode": "read-only",
            "ordersEnabled": False,
            "source": "exness_mt5_demo_via_nova_system_hub",
            "symbol": "XAUUSDm",
            "timeframe": "M5",
            "receivedAt": "2026-11-02T00:00:00Z",
            "asOf": "2026-11-02T00:00:00Z",
            "tick": {"bid": 200.0, "ask": 200.2, "time": "2026-11-02T00:00:00Z"},
            "bars": [
                {"timestamp": f"2026-01-01T0{i}:00:00Z", "open": 100+i, "high": 102+i,
                 "low": 99+i, "close": 101+i, "volume": 100}
                for i in range(4)
            ],
        }
        result = StrategyBacktestEngine(fee_bps=0).run_market_data(
            payload, [1, 0, -1], "test_adapter"
        )
        self.assertEqual(result["market_data"]["provider"], "exness_mt5")
        self.assertEqual(result["market_data"]["symbol"], "XAUUSDm")
        self.assertEqual(result["market_data"]["closed_bar_count"], 3)
        self.assertTrue(result["market_data"]["active_bar_excluded"])
        self.assertEqual(result["candles"], 3)

    def test_market_data_adapter_rejects_unverified_and_bad_payloads(self):
        from market_data import MarketDataError, normalize_mt5_quote_payload
        with self.assertRaises(MarketDataError):
            normalize_mt5_quote_payload({"state": "configured"})
        payload = {
            "state": "data_verified", "mode": "read-only", "ordersEnabled": False,
            "symbol": "XAUUSDm", "timeframe": "M5",
            "bars": [
                {"timestamp": f"2026-01-01T0{i}:00:00Z", "open": 100, "high": 101,
                 "low": 99, "close": 100, "volume": 1}
                for i in range(4)
            ],
        }
        payload["bars"][2]["high"] = 1
        with self.assertRaises(MarketDataError):
            normalize_mt5_quote_payload(payload)


    def test_vectorbt_adapter_is_optional_and_fails_clearly_without_dependency(self):
        import sys
        from unittest.mock import patch
        from vectorbt_adapter import OptionalDependencyError, run_vectorbt_benchmark
        with patch.dict(sys.modules, {"vectorbt": None}):
            with self.assertRaises(OptionalDependencyError):
                run_vectorbt_benchmark(sample_candles(), [0, 0, 0, 0, 0])

    def test_signal_values_must_be_integer_enum(self):
        candles = sample_candles()
        with self.assertRaises(BacktestInputError):
            StrategyBacktestEngine().run(candles, [True, 0, 0, 0, 0])
        with self.assertRaises(BacktestInputError):
            StrategyBacktestEngine().run(candles, [1.0, 0, 0, 0, 0])

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
