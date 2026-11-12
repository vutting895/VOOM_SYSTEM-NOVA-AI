import unittest
from datetime import datetime, timedelta, timezone

from workers.quant_engine.smc_mean_rejection import (
    StrategyInputError,
    _pivots,
    _build_4h_context,
    analyze_smc_mean_rejection,
    simulate_smc_mean_rejection,
)


def make_bars(count=20, minutes=5, start=None):
    start = start or datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(count):
        close = 100.0 + ((i % 6) - 3) * 0.25
        open_price = close - 0.1 if i % 2 else close + 0.1
        rows.append({
            "timestamp": (start + timedelta(minutes=minutes * i)).isoformat().replace("+00:00", "Z"),
            "open": open_price,
            "high": max(open_price, close) + 0.5,
            "low": min(open_price, close) - 0.5,
            "close": close,
            "volume": 1000.0,
        })
    return rows


def one_signal():
    return [{
        "strategy_id": "smc-mean-rejection",
        "direction": "long",
        "signal_index": 0,
        "signal_timestamp": "2026-01-01T00:00:00Z",
        "entry_index": 1,
        "entry_timestamp": "2026-01-01T00:05:00Z",
        "entry_price": 100.0,
        "stop_price": 99.0,
        "target_1": 102.5,
        "target_2": 103.0,
    }]


class TestSMCMeanRejection(unittest.TestCase):
    def test_confirmed_pivot_is_not_available_before_confirmation_bar(self):
        bars = make_bars(12)
        bars[3]["high"] = 110.0
        bars[2]["high"] = 105.0
        bars[4]["high"] = 104.0
        pivots = _pivots(bars, left=2, right=2)
        pivot = next(p for p in pivots if p["kind"] == "high" and p["index"] == 3)
        self.assertEqual(pivot["confirmed_at"], 5)
        self.assertEqual(pivot["available_at"], bars[5]["timestamp"])

    def test_fvg_is_not_visible_until_third_candle_closes(self):
        bars = make_bars(12, minutes=240)
        bars[0].update({"open": 99.0, "high": 100.0, "low": 98.0, "close": 99.5})
        bars[2].update({"open": 103.0, "high": 104.0, "low": 102.0, "close": 103.5})
        contexts = _build_4h_context(
            bars, swing_left=1, swing_right=1, ob_search_bars=3,
            max_zone_age_bars=50, fvg_min_size_pct=0.001,
        )
        self.assertFalse(any(z["kind"] == "FVG" for z in contexts[1]["zones"]))
        self.assertTrue(any(z["kind"] == "FVG" and z["direction"] == "bullish"
                            for z in contexts[2]["zones"]))

    def test_rejects_non_utc_and_naive_timestamps(self):
        bars = make_bars(12)
        bars[0]["timestamp"] = "2026-01-01T07:00:00+07:00"
        with self.assertRaises(StrategyInputError):
            analyze_smc_mean_rejection(make_bars(12, minutes=240), bars)
        bars = make_bars(12)
        bars[0]["timestamp"] = "2026-01-01T00:00:00"
        with self.assertRaises(StrategyInputError):
            analyze_smc_mean_rejection(make_bars(12, minutes=240), bars)

    def test_generates_research_only_contract(self):
        h4 = make_bars(30, minutes=240)
        m5 = make_bars(60, minutes=5, start=datetime(2026, 1, 6, tzinfo=timezone.utc))
        result = analyze_smc_mean_rejection(h4, m5)
        self.assertTrue(result["ok"])
        self.assertEqual(result["strategy_id"], "smc-mean-rejection")
        self.assertFalse(result["orders_submitted"])
        self.assertFalse(result["execution_enabled"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertEqual(result["data_contract"]["timeframes"], {"bias": "4H", "entry": "5M"})

    def test_risk_cap_cannot_exceed_one_percent(self):
        h4 = make_bars(30, minutes=240)
        m5 = make_bars(20, minutes=5)
        with self.assertRaises(StrategyInputError):
            analyze_smc_mean_rejection(h4, m5, risk_pct=0.02)

    def test_stop_wins_when_stop_and_tp1_touch_same_bar(self):
        bars = make_bars(12)
        bars[1].update({"open": 100.0, "high": 104.0, "low": 98.0, "close": 101.0})
        result = simulate_smc_mean_rejection(one_signal(), bars, fee_rate_per_side=0, slippage_per_unit=0)
        trade = result["trades"][0]
        self.assertEqual(trade["exit_reason"], "stop_loss_before_tp1")
        self.assertAlmostEqual(trade["net_pnl"], -100.0)

    def test_partial_tp1_then_breakeven_for_remaining_half(self):
        bars = make_bars(12)
        bars[1].update({"open": 100.0, "high": 102.6, "low": 99.9, "close": 102.0})
        bars[2].update({"open": 102.0, "high": 102.2, "low": 99.9, "close": 100.2})
        result = simulate_smc_mean_rejection(one_signal(), bars, fee_rate_per_side=0, slippage_per_unit=0)
        trade = result["trades"][0]
        self.assertTrue(trade["partial_tp1"])
        self.assertEqual(trade["exit_reason"], "breakeven_before_tp2")
        self.assertAlmostEqual(trade["net_pnl"], 125.0)

    def test_partial_tp1_then_tp2_realizes_two_partial_legs(self):
        bars = make_bars(12)
        bars[1].update({"open": 100.0, "high": 102.6, "low": 99.9, "close": 102.0})
        bars[2].update({"open": 102.0, "high": 103.1, "low": 100.1, "close": 102.8})
        result = simulate_smc_mean_rejection(one_signal(), bars, fee_rate_per_side=0, slippage_per_unit=0)
        trade = result["trades"][0]
        self.assertEqual(trade["exit_reason"], "tp2")
        self.assertAlmostEqual(trade["net_pnl"], 275.0)

    def test_costs_reduce_net_pnl(self):
        bars = make_bars(12)
        bars[1].update({"open": 100.0, "high": 102.6, "low": 99.9, "close": 102.0})
        bars[2].update({"open": 102.0, "high": 103.1, "low": 100.1, "close": 102.8})
        gross = simulate_smc_mean_rejection(one_signal(), bars, fee_rate_per_side=0, slippage_per_unit=0)
        net = simulate_smc_mean_rejection(one_signal(), bars, fee_rate_per_side=0.001, slippage_per_unit=0.01)
        self.assertLess(net["net_profit"], gross["net_profit"])
        self.assertLess(net["trades"][0]["quantity"], gross["trades"][0]["quantity"])
        self.assertAlmostEqual(net["trades"][0]["risk_budget"], 100.0)

    def test_cost_aware_sizing_keeps_planned_stop_loss_within_one_percent(self):
        bars = make_bars(12)
        bars[1].update({"open": 100.0, "high": 104.0, "low": 98.0, "close": 101.0})
        result = simulate_smc_mean_rejection(
            one_signal(), bars, fee_rate_per_side=0.001, slippage_per_unit=0.01
        )
        self.assertLessEqual(abs(result["trades"][0]["net_pnl"]), 100.0 + 1e-8)

    def test_simulator_rejects_non_next_bar_or_mismatched_timestamps(self):
        bars = make_bars(12)
        delayed = one_signal()[0]
        delayed["entry_index"] = 2
        delayed["entry_timestamp"] = bars[2]["timestamp"]
        delayed["entry_price"] = bars[2]["open"]
        with self.assertRaises(StrategyInputError):
            simulate_smc_mean_rejection([delayed], bars)

        mismatched = one_signal()[0]
        mismatched["signal_timestamp"] = bars[1]["timestamp"]
        with self.assertRaises(StrategyInputError):
            simulate_smc_mean_rejection([mismatched], bars)

    def test_invalid_risk_inputs_fail_closed(self):
        bars = make_bars(12)
        with self.assertRaises(StrategyInputError):
            simulate_smc_mean_rejection(one_signal(), bars, risk_pct=0.02)
        with self.assertRaises(StrategyInputError):
            simulate_smc_mean_rejection(one_signal(), bars, point_value=0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
