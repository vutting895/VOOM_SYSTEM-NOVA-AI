import unittest
from datetime import datetime, timezone

from workers.risk.mt5_decision_gate import evaluate_mt5_risk


NOW = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)
QUANT = {
    "engine": "MT5HeuristicConsensusAdapter",
    "evaluation_status": "research_only",
    "execution_enabled": False,
    "event_id": "ea-risk-001",
    "module_count": 30,
}


def make_event(**changes):
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
    snapshot.update(changes)
    return {
        "schema_version": "nova.mt5-event.v2",
        "event_id": "ea-risk-001",
        "risk_snapshot": snapshot,
    }


class TestMT5DecisionRiskGate(unittest.TestCase):
    def test_valid_snapshot_is_eligible_for_research_review_only(self):
        result = evaluate_mt5_risk(make_event(), QUANT, now=NOW)
        self.assertTrue(result["passed"])
        self.assertEqual(result["action"], "ELIGIBLE_FOR_RESEARCH_REVIEW")
        self.assertEqual(result["policy_version"], "nova-mt5-risk.ea-compatible.v1")
        self.assertFalse(result["execution_authorized"])
        self.assertEqual(result["existing_positions_action"], "NO_CHANGE")

    def test_daily_loss_3_percent_locks_new_entries_only(self):
        result = evaluate_mt5_risk(make_event(current_equity=9700.0), QUANT, now=NOW)
        self.assertFalse(result["passed"])
        self.assertTrue(result["entry_lock_only"])
        self.assertEqual(result["action"], "ENTRY_LOCK_ONLY")
        self.assertEqual(result["metrics"]["daily_loss_pct"], 3.0)
        self.assertEqual(result["existing_positions_action"], "NO_CHANGE")

    def test_aggregate_open_risk_above_2_percent_rejects_new_entry(self):
        result = evaluate_mt5_risk(
            make_event(aggregate_open_risk_money=200.1), QUANT, now=NOW
        )
        self.assertIn("aggregate_open_risk_limit", result["reason_codes"])
        self.assertFalse(result["passed"])
        self.assertEqual(result["action"], "REJECT_NEW_ENTRY")

    def test_maximum_5_orders_rejects_new_entry(self):
        result = evaluate_mt5_risk(make_event(open_orders_count=5), QUANT, now=NOW)
        self.assertIn("max_open_orders", result["reason_codes"])

    def test_stale_or_missing_snapshot_fails_closed(self):
        stale = evaluate_mt5_risk(
            make_event(snapshot_at="2026-11-13T08:58:00Z"), QUANT, now=NOW
        )
        self.assertIn("stale_risk_snapshot", stale["reason_codes"])
        stale_market = evaluate_mt5_risk(
            make_event(market_data_at="2026-11-13T08:58:00Z"), QUANT, now=NOW
        )
        self.assertIn("stale_market_data", stale_market["reason_codes"])
        with self.assertRaisesRegex(ValueError, "risk_snapshot_required"):
            evaluate_mt5_risk(
                {"schema_version": "nova.mt5-event.v2", "event_id": "ea-risk-001"},
                QUANT, now=NOW,
            )

    def test_stale_market_data_fails_closed(self):
        result = evaluate_mt5_risk(
            make_event(market_data_at="2026-11-13T08:58:00Z"), QUANT, now=NOW
        )
        self.assertIn("stale_market_data", result["reason_codes"])
        self.assertEqual(result["action"], "REJECT_NEW_ENTRY")

    def test_daily_loss_with_another_blocker_is_rejected(self):
        result = evaluate_mt5_risk(
            make_event(current_equity=9700.0, market_open=False), QUANT, now=NOW
        )
        self.assertTrue(result["entry_lock_only"])
        self.assertEqual(result["action"], "REJECT_NEW_ENTRY")

    def test_mismatched_event_or_untrusted_quant_envelope_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "verified_mt5_heuristic_result_required"):
            evaluate_mt5_risk(make_event(), {**QUANT, "event_id": "other"}, now=NOW)
        with self.assertRaisesRegex(ValueError, "verified_mt5_heuristic_result_required"):
            evaluate_mt5_risk(make_event(), {"engine": "mock"}, now=NOW)


if __name__ == "__main__":
    unittest.main()
