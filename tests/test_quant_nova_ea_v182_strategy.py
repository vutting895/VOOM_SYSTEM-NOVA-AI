"""Tests for the source-grounded NOVA EA v1.82 strategy port."""
import unittest
from datetime import datetime, timedelta, timezone

from workers.quant_engine import evaluate_nova_ea_v182_strategy as evaluate_from_core_package
from workers.quant_engine.mtraders_strategies import (
    StrategyInputError,
    evaluate_mtraders_strategy,
    evaluate_all_mtraders_modules,
)


def bars(count=220):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(count):
        close = 2000.0 + i * 0.05
        rows.append({
            "time": (start + timedelta(minutes=15 * i)).isoformat(),
            "open": close - 0.02,
            "high": close + 0.15,
            "low": close - 0.15,
            "close": close,
            "tick_volume": 100 + (i % 7),
        })
    return rows


class NovaEA182StrategyTests(unittest.TestCase):
    def test_strategy_evaluator_is_exported_by_core_package(self):
        result = evaluate_from_core_package(11, {})
        self.assertEqual(result["status"], "DORMANT_NOT_DISPATCHED")

    def test_disabled_strategy_is_explicitly_abstained(self):
        result = evaluate_mtraders_strategy(0, {})
        self.assertEqual(result["status"], "DISABLED_IN_EA_V1_82")
        self.assertEqual(result["direction"], 0)

    def test_dormant_registry_entry_does_not_fabricate_a_vote(self):
        result = evaluate_mtraders_strategy(11, {})
        self.assertEqual(result["status"], "DORMANT_NOT_DISPATCHED")
        self.assertEqual(result["direction"], 0)
        self.assertNotIn("confidence", result)

    def test_implemented_strategy_requires_real_market_data(self):
        with self.assertRaises(StrategyInputError):
            evaluate_mtraders_strategy(1, {})

    def test_trendpilot_requires_enough_bars_for_ema200(self):
        with self.assertRaisesRegex(StrategyInputError, "at least 210"):
            evaluate_mtraders_strategy(1, {"bars": bars(150)})

    def test_trendpilot_runs_on_closed_bar_data_without_fake_defaults(self):
        result = evaluate_mtraders_strategy(1, {"bars": bars()})
        self.assertEqual(result["strategy_id"], 1)
        self.assertEqual(result["status"], "NO_SIGNAL")
        self.assertEqual(result["direction"], 0)

    def test_liquiditypools_enforces_source_ten_bar_entry_cooldown(self):
        history = bars()
        state = {"last_entry_time": history[-5]["time"]}
        result = evaluate_mtraders_strategy(4, {"bars": history}, state)
        self.assertEqual(result["status"], "COOLDOWN")
        self.assertEqual(result["direction"], 0)

    def test_volregime_qex_arms_on_low_atr_percentile(self):
        result = evaluate_mtraders_strategy(2, {"bars": bars()})
        self.assertEqual(result["status"], "SQUEEZE_BUILDING")
        self.assertEqual(result["direction"], 0)
        self.assertIn("state", result)

    def test_flowmatrix_requires_cross_symbol_flow_data(self):
        result = evaluate_mtraders_strategy(10, {"bars": bars()})
        self.assertEqual(result["status"], "DATA_REQUIRED")
        self.assertEqual(result["direction"], 0)

    def test_flowmatrix_emits_when_current_symbol_has_eighty_percent_flow_share(self):
        history = []
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for i in range(220):
            close = 2000.0 + i * 0.05
            history.append({
                "time": (start + timedelta(minutes=15*i)).isoformat(),
                "open": close-0.1, "high": close+0.1, "low": close-0.2,
                "close": close, "tick_volume": 100,
            })
        result = evaluate_mtraders_strategy(10, {
            "bars": history, "symbol": "XAUUSDm",
            "symbol_bars": {"XAUUSDm": history},
        })
        self.assertEqual(result["status"], "RESEARCH_CANDIDATE")
        self.assertEqual(result["strategy_id"], 10)
        self.assertGreaterEqual(result["flow_share_pct"], 80.0)

    def test_sessionheat_uses_h1_30_day_hour_statistics(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        h1 = []
        for i in range(240):
            close = 2000.0 + i*0.05
            h1.append({
                "time": (start+timedelta(hours=i)).isoformat(),
                "open": close-0.1, "high": close+0.2, "low": close-0.1,
                "close": close, "tick_volume": 100,
            })
        server_dt = datetime.fromisoformat(h1[-1]["time"])+timedelta(hours=1)
        result = evaluate_mtraders_strategy(8, {
            "h1_bars": h1, "server_time": server_dt.isoformat(),
            "current_bid": h1[-1]["high"]+0.5,
            "current_ask": h1[-1]["high"]+0.7,
        })
        self.assertEqual(result["status"], "RESEARCH_CANDIDATE")
        self.assertEqual(result["strategy_id"], 8)
        self.assertEqual(result["entry_reference"], h1[-1]["high"]+0.7)
        self.assertEqual(result["rr"], 2.0)

    def test_sessionheat_requires_both_sides_of_quote(self):
        with self.assertRaisesRegex(StrategyInputError, "current_ask"):
            evaluate_mtraders_strategy(8, {
                "h1_bars": bars(30),
                "server_time": "2026-01-02T06:00:00+00:00",
                "current_bid": 2100.0,
            })

    def test_sessionbox_requires_explicit_broker_server_timezone(self):
        with self.assertRaisesRegex(StrategyInputError, "server_utc_offset_minutes"):
            evaluate_mtraders_strategy(9, {"bars": bars()})

    def test_smc_requires_confirmed_historical_bars_and_returns_state(self):
        result = evaluate_mtraders_strategy(13, {"bars": bars()})
        self.assertIn(result["status"], {"NO_SIGNAL", "SETUP_ARMED", "SETUP_WAITING", "SETUP_RESET", "RESEARCH_CANDIDATE"})
        self.assertIn("state", result)
        self.assertFalse(result.get("execution_enabled", False))

    def test_all_twenty_ids_are_reported_but_not_all_claimed_implemented(self):
        result = evaluate_all_mtraders_modules({"bars": bars(), "server_utc_offset_minutes": 0, "bar_seconds": 900})
        self.assertEqual(len(result), 20)
        self.assertEqual(result[10]["status"], "DATA_REQUIRED")
        self.assertEqual(result[11]["status"], "DORMANT_NOT_DISPATCHED")
        self.assertEqual(result[0]["status"], "DISABLED_IN_EA_V1_82")
        self.assertTrue(all(row.get("execution_enabled") is not True for row in result))


if __name__ == "__main__":
    unittest.main(verbosity=2)
