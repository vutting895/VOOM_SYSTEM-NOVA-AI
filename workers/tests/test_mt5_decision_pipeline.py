import unittest
from datetime import datetime, timezone

from workers.quant.mt5_decision_adapter import evaluate_mt5_event
from workers.risk.mt5_decision_gate import evaluate_mt5_risk


NOW = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)


def event_with_snapshot(**risk_overrides):
    snapshot = {
        "broker_day_start_equity": 10000.0,
        "current_equity": 9900.0,
        "aggregate_open_risk_money": 500.0,
        "open_orders_count": 2,
        "market_open": True,
        "broker_day_start_at": "2026-11-13T00:00:00Z",
        "snapshot_at": "2026-11-13T08:59:30Z",
        "market_data_at": "2026-11-13T08:59:30Z",
    }
    snapshot.update(risk_overrides)
    return {
        "schema_version": "nova.mt5-event.v1",
        "event_id": "pipeline-quant-risk-001",
        "module_id": "M01",
        "event_type": "signal",
        "symbol": "XAUUSDm",
        "timeframe": "M5",
        "occurred_at": "2026-11-13T08:59:30Z",
        "payload": {
            "quant_features": {
                "price_return_norm": 0.2,
                "volatility_atr_norm": 0.3,
                "liquidity_imbalance": -0.1,
                "momentum_rsi_norm": 0.4,
            },
            "risk_snapshot": snapshot,
        },
    }


class TestMT5QuantRiskPipeline(unittest.TestCase):
    def test_real_quant_engine_output_flows_into_independent_risk_gate(self):
        event = event_with_snapshot()
        quant_result = evaluate_mt5_event(event)
        risk_result = evaluate_mt5_risk(event, quant_result, now=NOW)

        self.assertEqual(quant_result["engine"], "HybridQuantumQuantEngine")
        self.assertEqual(quant_result["event_id"], event["event_id"])
        self.assertEqual(quant_result["evaluation_status"], "research_only")
        self.assertIn(risk_result["action"], {"ELIGIBLE_FOR_RESEARCH_REVIEW", "REJECT_NEW_ENTRY"})
        self.assertEqual(risk_result["policy_version"], "nova-mt5-risk.v1")
        self.assertFalse(risk_result["execution_authorized"])
        self.assertEqual(risk_result["existing_positions_action"], "NO_CHANGE")

    def test_daily_loss_lock_is_authoritative_after_real_quant_evaluation(self):
        event = event_with_snapshot(current_equity=9000.0)
        quant_result = evaluate_mt5_event(event)
        risk_result = evaluate_mt5_risk(event, quant_result, now=NOW)

        self.assertFalse(risk_result["passed"])
        self.assertEqual(risk_result["action"], "ENTRY_LOCK_ONLY")
        self.assertIn("daily_loss_entry_lock", risk_result["reason_codes"])
        self.assertEqual(risk_result["existing_positions_action"], "NO_CHANGE")


if __name__ == "__main__":
    unittest.main()
