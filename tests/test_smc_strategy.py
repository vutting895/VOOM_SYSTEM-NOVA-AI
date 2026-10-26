import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "feature" / "smc_wave"))
from smc_strategy import _pivots, analyze_smc, run_smc_backtest


def sample_bars():
    # Valid deterministic series with alternating local extremes and later breaks.
    bars = []
    closes = [10, 9, 8, 9, 11, 10, 9, 12, 13, 11, 10, 14, 15, 13, 12, 16, 17, 15, 14, 18]
    for i, c in enumerate(closes):
        o = c - 0.4 if i % 2 else c + 0.4
        bars.append({"open": o, "high": max(o, c) + 0.5, "low": min(o, c) - 0.5, "close": c})
    return bars


class TestSMCStrategy(unittest.TestCase):
    def test_returns_smc_contract_and_safe_mode(self):
        result = analyze_smc(sample_bars())
        self.assertTrue(result["ok"])
        self.assertEqual(result["strategy"], "SMC")
        self.assertFalse(result["orders_submitted"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertIsNone(result["signal"])
        self.assertIn("fair_value_gaps", result)
        self.assertIn("order_blocks", result)
        self.assertIn("liquidity_sweeps", result)

    def test_rejects_short_input(self):
        with self.assertRaises(ValueError):
            analyze_smc(sample_bars()[:5])

    def test_rejects_bad_ohlc(self):
        bars = sample_bars()
        bars[0] = {"open": 2, "high": 1, "low": 0, "close": 1}
        with self.assertRaises(ValueError):
            analyze_smc(bars)

    def test_parameters_are_bounded(self):
        with self.assertRaises(ValueError):
            analyze_smc(sample_bars(), swing_left=0)

    def test_repeatable_results(self):
        bars = sample_bars()
        self.assertEqual(analyze_smc(bars), analyze_smc(bars))


    def test_backtest_is_research_only_and_cost_aware(self):
        result = run_smc_backtest(sample_bars(), fee_rate=0.001, slippage_rate=0.0005)
        self.assertTrue(result["ok"])
        self.assertEqual(result["strategy"], "SMC_structure_break_baseline")
        self.assertFalse(result["orders_submitted"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertIn("fee_rate_per_side", result["cost_assumptions"])

    def test_full_history_option_preserves_all_swing_points_and_events(self):
        bars = sample_bars() * 5
        recent = analyze_smc(bars)
        complete = analyze_smc(bars, include_full_history=True)
        self.assertLessEqual(len(recent["swing_points"]), 30)
        self.assertGreater(len(complete["swing_points"]), len(recent["swing_points"]))
        self.assertGreaterEqual(len(complete["structure_events"]), len(recent["structure_events"]))

    def test_backtest_stop_uses_only_pivots_confirmed_before_signal(self):
        bars = sample_bars() * 5
        analysis = analyze_smc(bars, include_full_history=True)
        result = run_smc_backtest(bars)
        event_by_index = {event["index"]: event for event in analysis["structure_events"]}
        pivots = analysis["swing_points"]
        for trade in result["trades"]:
            signal_index = trade["signal_index"]
            event = event_by_index[signal_index]
            expected_kind = "low" if event["direction"] == "bullish" else "high"
            eligible = [p for p in pivots if p["index"] < signal_index
                        and p["confirmed_at"] < signal_index and p["kind"] == expected_kind]
            self.assertTrue(eligible)
            self.assertEqual(trade["stop_swing_index"], eligible[-1]["index"])
            self.assertLess(eligible[-1]["confirmed_at"], signal_index)

    def test_pivots_are_not_rewritten_by_later_extremes(self):
        closes = [10, 8, 9, 7, 8, 12, 8, 7, 8, 6, 7, 8]
        bars = []
        for i, c in enumerate(closes):
            bars.append({"open": c, "high": c + (2 if i in (2, 5) else 0.5),
                         "low": c - (2 if i == 3 else 0.5), "close": c})
        pivots = _pivots(bars, 1, 1)
        high_indices = [p["index"] for p in pivots if p["kind"] == "high"]
        self.assertIn(2, high_indices)
        self.assertIn(5, high_indices)

    def test_backtest_rejects_invalid_reward_risk(self):
        with self.assertRaises(ValueError):
            run_smc_backtest(sample_bars(), reward_risk=0)


if __name__ == "__main__":
    unittest.main()