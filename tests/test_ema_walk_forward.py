"""Leakage and OOS-boundary tests for EMA walk-forward evaluation."""
import math
import unittest

from workers.backtest.ema_walk_forward import run_ema_walk_forward, WalkForwardEvaluationError
from workers.backtest.engine import BacktestWorker, BacktestInputError


def market_rows(count=240):
    rows = []
    previous = 100.0
    for index in range(count):
        close = 100 + 0.08 * index + 8 * math.sin(index / 7.0)
        open_price = previous
        rows.append({
            "timestamp": f"2026-01-01T{index:02d}:00:00+00:00" if index < 24 else
                         f"2026-01-{index // 24 + 1:02d}T{index % 24:02d}:00:00+00:00",
            "open": open_price,
            "high": max(open_price, close) + 0.4,
            "low": min(open_price, close) - 0.4,
            "close": close,
            "volume": 1000,
        })
        previous = close
    return rows


class EmaWalkForwardTests(unittest.TestCase):
    def test_trade_ledger_starts_only_at_requested_oos_boundary(self):
        rows = market_rows(100)
        report = BacktestWorker(fee=0, slippage=0).run(
            {"fast_period": 5, "slow_period": 21}, rows, trade_start_index=30
        )
        for trade in report["trade_ledger"]:
            self.assertGreaterEqual(trade["entry_timestamp"], rows[30]["timestamp"])

    def test_walk_forward_tunes_only_on_prior_training_data(self):
        rows = market_rows()
        report = run_ema_walk_forward(
            rows,
            code_revision="a" * 40,
            train_bars=120,
            test_bars=30,
            step_bars=30,
            purge_bars=5,
            warmup_bars=51,
            max_trials=5,
            minimum_oos_trades=30,
        )
        self.assertEqual(report["evaluation_mode"], "expanding_walk_forward_oos")
        self.assertGreaterEqual(report["fold_count"], 1)
        self.assertEqual(report["purge_bars"], 5)
        self.assertFalse(report["orders_submitted"])
        self.assertFalse(report["live_trading_enabled"])
        for fold in report["folds"]:
            self.assertEqual(fold["train_end_exclusive"] + 5, fold["test_start"])
            self.assertLessEqual(fold["test_end_exclusive"], len(rows))
            self.assertEqual(len(fold["train_dataset_sha256"]), 64)
            self.assertEqual(len(fold["test_dataset_sha256"]), 64)
            for trade in fold["oos_trade_ledger"]:
                self.assertGreaterEqual(trade["entry_timestamp"], fold["test_start_timestamp"])
                self.assertLessEqual(trade["entry_timestamp"], fold["test_end_timestamp"])

    def test_walk_forward_rejects_short_training_and_bad_code_revision(self):
        with self.assertRaises(WalkForwardEvaluationError):
            run_ema_walk_forward(market_rows(), code_revision="main", train_bars=120, purge_bars=5)
        with self.assertRaises(WalkForwardEvaluationError):
            run_ema_walk_forward(market_rows(), code_revision="a" * 40, train_bars=50, purge_bars=5)

    def test_backtest_rejects_oos_boundary_outside_dataset(self):
        with self.assertRaises(BacktestInputError):
            BacktestWorker().run({"fast_period": 5, "slow_period": 21}, market_rows(60),
                                 trade_start_index=60)


if __name__ == "__main__":
    unittest.main(verbosity=2)
