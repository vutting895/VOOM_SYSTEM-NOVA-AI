"""Regression tests for causal, cost-aware OHLCV backtests."""
import unittest
from datetime import datetime, timedelta, timezone

from workers.backtest.engine import BacktestInputError, run_ema_crossover_backtest


CODE_SHA = "a" * 40
MARKET = {
    "source": "unit-test-fixture",
    "symbol": "TEST",
    "timeframe": "1h",
    "price_basis": "mid",
    "quote_currency": "USD",
    "account_currency": "USD",
    "contract_multiplier": 1.0,
    "quote_to_account_rate": 1.0,
    "expected_interval_seconds": 3600,
    "periods_per_year": 24 * 365,
    "reject_gaps": True,
}
COSTS = {
    "fee_bps_per_side": 10.0,
    "spread_bps_full": 4.0,
    "slippage_bps_per_side": 2.0,
    "financing_bps_per_day": 5.0,
}
CLOSES = [10, 9, 8, 9, 10, 11, 12, 11, 10, 9, 8, 7, 6]


def candles_from_closes(closes):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = []
    for index, close in enumerate(closes):
        opened = start + timedelta(hours=index)
        close_time = opened + timedelta(minutes=59)
        price = float(close)
        stamp = opened.isoformat().replace("+00:00", "Z")
        closed = close_time.isoformat().replace("+00:00", "Z")
        rows.append({
            "timestamp": stamp,
            "close_time": closed,
            "available_at": closed,
            "ingested_at": closed,
            "is_closed": True,
            "open": price,
            "high": price + 0.5,
            "low": price - 0.5,
            "close": price,
            "volume": 1000.0,
        })
    return rows


def run(rows, market=None):
    return run_ema_crossover_backtest(
        rows,
        strategy_parameters={"fast_period": 2, "slow_period": 3},
        market=market or MARKET,
        cost_model=COSTS,
        initial_cash=10_000,
        exposure_fraction=0.9,
        code_revision=CODE_SHA,
    )


class BacktestLineageTests(unittest.TestCase):
    def test_requires_explicit_completed_bar_lineage(self):
        rows = candles_from_closes(CLOSES)
        del rows[0]["available_at"]
        with self.assertRaises(BacktestInputError):
            run(rows)

        rows = candles_from_closes(CLOSES)
        rows[0]["is_closed"] = False
        with self.assertRaisesRegex(BacktestInputError, "completed"):
            run(rows)

    def test_rejects_invalid_availability_order(self):
        rows = candles_from_closes(CLOSES)
        rows[3]["available_at"] = "2025-12-31T23:00:00Z"
        with self.assertRaisesRegex(BacktestInputError, "available_at"):
            run(rows)

        rows = candles_from_closes(CLOSES)
        rows[2]["ingested_at"] = "2025-12-31T23:59:00Z"
        with self.assertRaisesRegex(BacktestInputError, "ingested_at"):
            run(rows)

    def test_rejects_naive_timestamps_and_overlapping_bars(self):
        rows = candles_from_closes(CLOSES)
        rows[0]["timestamp"] = "2026-01-01T00:00:00"
        with self.assertRaises(BacktestInputError):
            run(rows)

        rows = candles_from_closes(CLOSES)
        rows[0]["close_time"] = "2026-01-01T02:00:00Z"
        rows[0]["available_at"] = "2026-01-01T02:00:00Z"
        rows[0]["ingested_at"] = "2026-01-01T02:00:00Z"
        with self.assertRaisesRegex(BacktestInputError, "overlap"):
            run(rows)

    def test_gap_policy_fails_closed_when_requested(self):
        rows = candles_from_closes(CLOSES)
        for index in range(4, len(rows)):
            for key in ("timestamp", "close_time", "available_at", "ingested_at"):
                parsed = datetime.fromisoformat(rows[index][key].replace("Z", "+00:00"))
                rows[index][key] = (parsed + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        with self.assertRaises(Exception):
            run(rows)


class BacktestExecutionTests(unittest.TestCase):
    def test_signal_fills_on_next_eligible_open_not_signal_close(self):
        rows = candles_from_closes(CLOSES)
        report = run(rows)
        self.assertGreater(report["trade_count"], 0)
        trade = report["trades"][0]
        self.assertGreater(trade["entry_index"], trade["signal_index"])
        self.assertEqual(trade["entry_mid_price"], rows[trade["entry_index"]]["open"])
        self.assertGreater(trade["entry_fill_price"], trade["entry_mid_price"])
        self.assertLess(trade["exit_fill_price"], trade["exit_mid_price"])
        self.assertFalse(report["orders_submitted"])
        self.assertFalse(report["live_trading_enabled"])

    def test_data_arriving_at_open_is_not_filled_on_that_same_open(self):
        rows = candles_from_closes(CLOSES)
        baseline = run(rows)
        signal_index = baseline["trades"][0]["signal_index"]
        next_open = datetime.fromisoformat(
            rows[signal_index + 1]["timestamp"].replace("Z", "+00:00")
        )
        rows[signal_index]["ingested_at"] = next_open.isoformat().replace("+00:00", "Z")
        report = run(rows)
        trade = next(t for t in report["trades"] if t["signal_index"] == signal_index)
        self.assertGreater(trade["entry_index"], signal_index + 1)

    def test_late_ingestion_delays_fill_until_a_later_open(self):
        rows = candles_from_closes(CLOSES)
        baseline = run(rows)
        first_signal = baseline["trades"][0]["signal_index"]
        signal_open = datetime.fromisoformat(rows[first_signal]["timestamp"].replace("Z", "+00:00"))
        delayed = signal_open + timedelta(hours=2, minutes=30)
        for index in range(first_signal, len(rows)):
            current = datetime.fromisoformat(rows[index]["ingested_at"].replace("Z", "+00:00"))
            effective = max(current, delayed + timedelta(minutes=index - first_signal))
            rows[index]["ingested_at"] = effective.isoformat().replace("+00:00", "Z")
        report = run(rows)
        delayed_trade = next(t for t in report["trades"] if t["signal_index"] == first_signal)
        self.assertGreaterEqual(delayed_trade["entry_index"], first_signal + 3)

    def test_cost_model_is_mandatory_and_explicit(self):
        rows = candles_from_closes(CLOSES)
        with self.assertRaises(BacktestInputError):
            run_ema_crossover_backtest(
                rows,
                strategy_parameters={"fast_period": 2, "slow_period": 3},
                market=MARKET,
                cost_model={},
                initial_cash=10_000,
                exposure_fraction=0.9,
                code_revision=CODE_SHA,
            )

    def test_reproducible_hashes_and_metrics(self):
        rows = candles_from_closes(CLOSES)
        first = run(rows)
        second = run(rows)
        self.assertEqual(first["dataset_sha256"], second["dataset_sha256"])
        self.assertEqual(first["run_fingerprint"], second["run_fingerprint"])
        self.assertEqual(first["final_equity"], second["final_equity"])
        self.assertIn("buy_and_hold_return_pct", first)
        self.assertIn("max_drawdown_pct", first)
        self.assertIn("sharpe_annualized", first)
        self.assertEqual(first["mode"], "research_backtest_only")

    def test_rejects_implicit_leverage_and_bad_market_contract(self):
        rows = candles_from_closes(CLOSES)
        with self.assertRaises(BacktestInputError):
            run_ema_crossover_backtest(
                rows,
                strategy_parameters={"fast_period": 2, "slow_period": 3},
                market=MARKET,
                cost_model=COSTS,
                initial_cash=10_000,
                exposure_fraction=1.01,
                code_revision=CODE_SHA,
            )
        bad_market = dict(MARKET)
        bad_market["price_basis"] = "bid"
        with self.assertRaises(BacktestInputError):
            run(rows, market=bad_market)


if __name__ == "__main__":
    unittest.main(verbosity=2)
