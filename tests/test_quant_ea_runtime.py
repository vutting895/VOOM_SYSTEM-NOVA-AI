import unittest
from unittest.mock import patch

from workers.quant_engine import ea_runtime


class EaRuntimeTests(unittest.TestCase):
    def market(self, last_time="2026-11-23T12:00:00+00:00"):
        bars = [
            {"time": f"2026-11-23T{10 + (i // 60):02d}:{i % 60:02d}:00+00:00",
             "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0,
             "volume": 10}
            for i in range(110)
        ]
        bars[-1]["time"] = last_time
        return {"symbol": "XAUUSDm", "timeframe": "M5", "bars": bars}

    def test_stale_data_fails_closed_without_strategy_evaluation(self):
        with patch.object(ea_runtime, "evaluate_all_nova_ea_v182_strategies") as evaluate:
            result = ea_runtime.analyze_nova_ea_v182(
                market_data=self.market("2026-11-23T11:00:00+00:00"),
                current_time="2026-11-23T12:00:00+00:00",
                premium_discount={"zone": "EQUILIBRIUM"},
            )
        evaluate.assert_not_called()
        self.assertEqual(result["final_decision"], "NO_TRADE")
        self.assertIn("STALE_MARKET_DATA", result["final_decision_blockers"])

    def test_future_bar_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "future"):
            ea_runtime.analyze_nova_ea_v182(
                market_data=self.market("2026-11-23T12:01:00+00:00"),
                current_time="2026-11-23T12:00:00+00:00",
                premium_discount={"zone": "EQUILIBRIUM"},
            )

    def test_invalid_timezone_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "timezone_aware"):
            ea_runtime.analyze_nova_ea_v182(
                market_data=self.market("2026-11-23T12:00:00"),
                current_time="2026-11-23T12:00:00+00:00",
                premium_discount={"zone": "EQUILIBRIUM"},
            )

    def test_result_never_authorizes_execution(self):
        mocked_results = [
            {"strategy_id": 13, "status": "NO_SIGNAL", "direction": 0, "state": {"phase": 1}},
            {"strategy_id": 6, "status": "NO_SIGNAL", "direction": 0},
        ]
        with patch.object(ea_runtime, "evaluate_all_nova_ea_v182_strategies", return_value=mocked_results):
            result = ea_runtime.analyze_nova_ea_v182(
                market_data=self.market(),
                current_time="2026-11-23T12:00:10+00:00",
                premium_discount={"zone": "EQUILIBRIUM"},
            )
        self.assertEqual(result["final_decision"], "NO_TRADE")
        self.assertIn("ML_CALIBRATION_NOT_CONNECTED", result["final_decision_blockers"])
        self.assertIn("SHARED_RISK_GOVERNOR_NOT_CONNECTED", result["final_decision_blockers"])
        self.assertFalse(result["orders_submitted"])
        self.assertFalse(result["execution_enabled"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertEqual(result["next_states"]["13"], {"phase": 1})

    def test_bad_timeframe_is_rejected(self):
        market = self.market()
        market["timeframe"] = "M2"
        with self.assertRaisesRegex(ValueError, "unsupported_runtime_timeframe"):
            ea_runtime.analyze_nova_ea_v182(
                market_data=market,
                current_time="2026-11-23T12:00:10+00:00",
                premium_discount={"zone": "EQUILIBRIUM"},
            )


if __name__ == "__main__":
    unittest.main()
