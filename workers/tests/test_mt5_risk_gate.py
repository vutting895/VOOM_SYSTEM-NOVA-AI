import unittest
from datetime import datetime, timezone

from workers.risk.mt5_decision_gate import evaluate_mt5_risk


NOW = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)
QUANT = {
    "engine": "MT5HeuristicConsensusAdapter",
    "evaluation_status": "research_only",
    "execution_enabled": False,
    "event_id": "ea-risk-001",
    "client_id": "tenant-demo-01",
    "module_count": 30,
}


def make_event(**changes):
    snapshot = {
        "broker_day_start_equity": 10000.0,
        "current_equity": 10000.0,
        "aggregate_open_risk_money": 100.0,
        "proposed_entry_risk_money": 0.0,
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
        "client_id": "tenant-demo-01",
        "risk_snapshot": snapshot,
    }


class TestMT5DecisionRiskGate(unittest.TestCase):
    def test_valid_snapshot_is_research_only_and_live_execution_disabled(self):
        result = evaluate_mt5_risk(make_event(), QUANT, now=NOW)
        self.assertTrue(result["passed"])
        self.assertEqual(result["action"], "ELIGIBLE_FOR_RESEARCH_REVIEW")
        self.assertEqual(result["policy_version"], "nova-mt5-risk.v2")
        self.assertEqual(result["limits"]["daily_loss_entry_lock_pct"], 10.0)
        self.assertEqual(result["limits"]["max_aggregate_open_risk_pct"], 9.0)
        self.assertEqual(result["limits"]["aggregate_open_risk_reference"], "current_equity")
        self.assertFalse(result["execution_authorized"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertEqual(result["existing_positions_action"], "NO_CHANGE")

    def test_daily_loss_9_99_percent_allows_entry_review(self):
        result = evaluate_mt5_risk(
            make_event(current_equity=9001.0), QUANT, now=NOW
        )
        self.assertTrue(result["passed"])
        self.assertAlmostEqual(result["metrics"]["daily_loss_pct"], 9.99)

    def test_daily_loss_at_10_percent_locks_new_entries_only(self):
        result = evaluate_mt5_risk(
            make_event(current_equity=9000.0), QUANT, now=NOW
        )
        self.assertFalse(result["passed"])
        self.assertTrue(result["entry_lock_only"])
        self.assertEqual(result["action"], "ENTRY_LOCK_ONLY")
        self.assertEqual(result["metrics"]["daily_loss_pct"], 10.0)
        self.assertEqual(result["existing_positions_action"], "NO_CHANGE")

    def test_daily_loss_above_10_percent_remains_entry_locked(self):
        result = evaluate_mt5_risk(
            make_event(current_equity=8999.0), QUANT, now=NOW
        )
        self.assertTrue(result["entry_lock_only"])
        self.assertIn("daily_loss_entry_lock", result["reason_codes"])

    def test_aggregate_open_risk_8_99_percent_allows_review(self):
        result = evaluate_mt5_risk(
            make_event(aggregate_open_risk_money=899.0), QUANT, now=NOW
        )
        self.assertTrue(result["passed"])
        self.assertAlmostEqual(result["metrics"]["aggregate_open_risk_pct"], 8.99)

    def test_aggregate_open_risk_exactly_9_percent_is_at_limit(self):
        result = evaluate_mt5_risk(
            make_event(aggregate_open_risk_money=900.0), QUANT, now=NOW
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["metrics"]["aggregate_open_risk_pct"], 9.0)

    def test_aggregate_open_risk_above_9_percent_rejects_entry(self):
        result = evaluate_mt5_risk(
            make_event(aggregate_open_risk_money=901.0), QUANT, now=NOW
        )
        self.assertIn("aggregate_open_risk_limit", result["reason_codes"])
        self.assertFalse(result["passed"])
        self.assertEqual(result["action"], "REJECT_NEW_ENTRY")

    def test_proposed_entry_risk_is_included_before_approval(self):
        result = evaluate_mt5_risk(
            make_event(
                aggregate_open_risk_money=850.0,
                proposed_entry_risk_money=51.0,
            ),
            QUANT,
            now=NOW,
        )
        self.assertFalse(result["passed"])
        self.assertIn("aggregate_open_risk_limit", result["reason_codes"])
        self.assertEqual(result["metrics"]["total_open_risk_money"], 901.0)

    def test_proposed_entry_can_use_remaining_risk_capacity(self):
        result = evaluate_mt5_risk(
            make_event(
                aggregate_open_risk_money=850.0,
                proposed_entry_risk_money=50.0,
            ),
            QUANT,
            now=NOW,
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["metrics"]["total_open_risk_money"], 900.0)

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
                {"schema_version": "nova.mt5-event.v2", "event_id": "ea-risk-001",
                 "client_id": "tenant-demo-01"},
                QUANT, now=NOW,
            )

    def test_missing_proposed_entry_risk_fails_closed(self):
        event = make_event()
        del event["risk_snapshot"]["proposed_entry_risk_money"]
        with self.assertRaisesRegex(ValueError, "invalid_risk_snapshot:proposed_entry_risk_money"):
            evaluate_mt5_risk(event, QUANT, now=NOW)

    def test_negative_proposed_entry_risk_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "risk_snapshot_open_risk_must_be_non_negative"):
            evaluate_mt5_risk(
                make_event(proposed_entry_risk_money=-1.0), QUANT, now=NOW
            )

    def test_stale_market_data_fails_closed(self):
        result = evaluate_mt5_risk(
            make_event(market_data_at="2026-11-13T08:58:00Z"), QUANT, now=NOW
        )
        self.assertIn("stale_market_data", result["reason_codes"])
        self.assertEqual(result["action"], "REJECT_NEW_ENTRY")

    def test_daily_loss_with_another_blocker_is_rejected(self):
        result = evaluate_mt5_risk(
            make_event(current_equity=9000.0, market_open=False), QUANT, now=NOW
        )
        self.assertTrue(result["entry_lock_only"])
        self.assertEqual(result["action"], "REJECT_NEW_ENTRY")

    def test_mismatched_event_or_client_scope_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "verified_mt5_heuristic_result_required"):
            evaluate_mt5_risk(make_event(), {**QUANT, "client_id": "tenant-other"}, now=NOW)

    def test_mismatched_event_or_untrusted_quant_envelope_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "verified_mt5_heuristic_result_required"):
            evaluate_mt5_risk(make_event(), {**QUANT, "event_id": "other"}, now=NOW)
        with self.assertRaisesRegex(ValueError, "verified_mt5_heuristic_result_required"):
            evaluate_mt5_risk(make_event(), {"engine": "mock"}, now=NOW)


if __name__ == "__main__":
    unittest.main()
