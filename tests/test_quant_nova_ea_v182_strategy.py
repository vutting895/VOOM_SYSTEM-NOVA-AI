"""Tests for the source-grounded NOVA EA v1.82 strategy port."""
import unittest
from datetime import datetime, timedelta, timezone

from workers.quant_engine import evaluate_nova_ea_v182_strategy as evaluate_from_core_package\nfrom workers.quant_engine.mtraders_strategies import (
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
    def test_strategy_evaluator_is_exported_by_core_package(self):\n        result = evaluate_from_core_package(10, {})\n        self.assertEqual(result["status"], "NOT_PORTED")\n\n    def test_disabled_strategy_is_explicitly_abstained(self):
        result = evaluate_mtraders_strategy(0, {})
        self.assertEqual(result["status"], "DISABLED_IN_EA_V1_82")
        self.assertEqual(result["direction"], 0)

    def test_unported_active_strategy_does_not_fabricate_a_vote(self):
        result = evaluate_mtraders_strategy(10, {})
        self.assertEqual(result["status"], "NOT_PORTED")
        self.assertEqual(result["direction"], 0)
        self.assertNotIn("confidence", result)

    def test_implemented_strategy_requires_real_market_data(self):
        with self.assertRaises(StrategyInputError):
            evaluate_mtraders_strategy(27, {})

    def test_trendpilot_requires_enough_bars_for_ema200(self):
        with self.assertRaisesRegex(StrategyInputError, "at least 210"):
            evaluate_mtraders_strategy(27, {"bars": bars(150)})

    def test_trendpilot_runs_on_closed_bar_data_without_fake_defaults(self):
        result = evaluate_mtraders_strategy(27, {"bars": bars()})
        self.assertEqual(result["strategy_id"], 27)
        self.assertEqual(result["status"], "NO_SIGNAL")
        self.assertEqual(result["direction"], 0)

    def test_sessionbox_requires_explicit_broker_server_timezone(self):
        with self.assertRaisesRegex(StrategyInputError, "server_utc_offset_minutes"):
            evaluate_mtraders_strategy(26, {"bars": bars()})

    def test_smc_requires_confirmed_historical_bars_and_returns_state(self):
        result = evaluate_mtraders_strategy(14, {"bars": bars()})
        self.assertIn(result["status"], {"NO_SIGNAL", "SETUP_ARMED", "SETUP_WAITING", "SETUP_RESET", "RESEARCH_CANDIDATE"})
        self.assertIn("state", result)
        self.assertFalse(result.get("execution_enabled", False))

    def test_all_thirty_ids_are_reported_but_not_all_claimed_implemented(self):
        result = evaluate_all_mtraders_modules({"bars": bars(), "server_utc_offset_minutes": 0, "bar_seconds": 900})
        self.assertEqual(len(result), 30)
        self.assertEqual(result[10]["status"], "NOT_PORTED")
        self.assertEqual(result[0]["status"], "DISABLED_IN_EA_V1_82")
        self.assertTrue(all(row.get("execution_enabled") is not True for row in result))


if __name__ == "__main__":
    unittest.main(verbosity=2)
