import unittest
from datetime import datetime, timezone

from workers.quant.mt5_decision_adapter import evaluate_mt5_event
from workers.risk.mt5_decision_gate import evaluate_mt5_risk


NOW = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)
MODULES = [
    "SuperTrend", "KeltnerBreak", "GoldenCross", "RocSurge", "Alligator",
    "Ichimoku", "AwesomeOsc", "HeikinPower", "PsarDot", "VwapBand",
    "FlowMatrix", "HourBias", "PivotWheel", "SessionHeat", "StructureMap",
    "TrendRadar", "VolRegime-Batch", "EffortResult", "ExpertQEXSweep",
    "FootprintLite", "LiquidityPools", "NeuralPilot", "KillZoneBreak",
    "QEX-LiqSweep", "QEX-VolST", "RangeSniper", "SessionBox", "TrendPilot",
    "VolRegime-QEX", "WyckoffPhase",
]


def event_with_snapshot(**risk_overrides):
    snapshot = {
        "broker_day_start_equity": 10000.0,
        "current_equity": 9900.0,
        "aggregate_open_risk_money": 100.0,
        "open_orders_count": 2,
        "market_open": True,
        "broker_day_start_at": "2026-11-13T00:00:00Z",
        "snapshot_at": "2026-11-13T08:59:30Z",
        "market_data_at": "2026-11-13T08:59:30Z",
    }
    snapshot.update(risk_overrides)
    votes = ["BUY"] * 12 + ["SELL"] * 8 + ["NEUTRAL"] * 10
    return {
        "schema_version": "nova.mt5-event.v2",
        "event_id": "XAUUSDm-PERIOD_M15-1794550000",
        "symbol": "XAUUSDm",
        "timeframe": "M15",
        "occurred_at": "2026-11-13T08:59:30Z",
        "account_mode": "DEMO",
        "vote_counts": {"buy": 12, "sell": 8, "neutral": 10},
        "module_votes": [
            {"module_id": f"M{i:02d}", "module_name": name, "vote": vote}
            for i, (name, vote) in enumerate(zip(MODULES, votes), start=1)
        ],
        "market_snapshot": {"bid": 2600.0, "ask": 2600.2, "spread_points": 20.0},
        "risk_snapshot": snapshot,
    }


class TestMT5HeuristicRiskPipeline(unittest.TestCase):
    def test_actual_ea_vote_contract_flows_into_independent_risk_gate(self):
        event = event_with_snapshot()
        quant_result = evaluate_mt5_event(event)
        risk_result = evaluate_mt5_risk(event, quant_result, now=NOW)

        self.assertEqual(quant_result["engine"], "MT5HeuristicConsensusAdapter")
        self.assertEqual(quant_result["event_id"], event["event_id"])
        self.assertEqual(quant_result["evaluation_status"], "research_only")
        self.assertEqual(quant_result["directional_bias"], "BUY")
        self.assertEqual(quant_result["signal_source"], "mt5_ea_heuristic_modules")
        self.assertTrue(risk_result["passed"])
        self.assertEqual(risk_result["policy_version"], "nova-mt5-risk.ea-compatible.v1")
        self.assertFalse(risk_result["execution_authorized"])
        self.assertEqual(risk_result["existing_positions_action"], "NO_CHANGE")

    def test_daily_loss_limit_is_authoritative_after_vote_normalization(self):
        event = event_with_snapshot(current_equity=9700.0)
        quant_result = evaluate_mt5_event(event)
        risk_result = evaluate_mt5_risk(event, quant_result, now=NOW)

        self.assertFalse(risk_result["passed"])
        self.assertEqual(risk_result["action"], "ENTRY_LOCK_ONLY")
        self.assertIn("daily_loss_entry_lock", risk_result["reason_codes"])
        self.assertEqual(risk_result["existing_positions_action"], "NO_CHANGE")


if __name__ == "__main__":
    unittest.main()
