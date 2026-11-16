import unittest

from adapter import PolicyRejected
from risk_policy import RiskSnapshot, evaluate_entry_risk


class DemoRiskPolicyTests(unittest.TestCase):
    def test_approves_within_all_caps(self):
        result = evaluate_entry_risk(RiskSnapshot(
            equity=10000, broker_day_start_equity=10000,
            aggregate_open_risk=500, open_orders_and_positions_count=2,
            proposed_trade_risk=200,
        ))
        self.assertTrue(result.approved)
        self.assertEqual(result.reason, "approved")

    def test_daily_loss_lock_blocks_entries_only(self):
        result = evaluate_entry_risk(RiskSnapshot(
            equity=9000, broker_day_start_equity=10000,
            aggregate_open_risk=100, open_orders_and_positions_count=1,
            proposed_trade_risk=50,
        ))
        self.assertFalse(result.approved)
        self.assertEqual(result.reason, "daily_loss_entry_lock")
        self.assertEqual(result.daily_loss_pct, 10.0)

    def test_aggregate_open_risk_cap(self):
        result = evaluate_entry_risk(RiskSnapshot(
            equity=10000, broker_day_start_equity=10000,
            aggregate_open_risk=850, open_orders_and_positions_count=1,
            proposed_trade_risk=100,
        ))
        self.assertFalse(result.approved)
        self.assertEqual(result.reason, "aggregate_open_risk_limit")

    def test_max_five_open_orders_and_positions(self):
        result = evaluate_entry_risk(RiskSnapshot(
            equity=10000, broker_day_start_equity=10000,
            aggregate_open_risk=100, open_orders_and_positions_count=5,
            proposed_trade_risk=50,
        ))
        self.assertFalse(result.approved)
        self.assertEqual(result.reason, "max_open_orders_and_positions")

    def test_rejects_invalid_snapshot(self):
        with self.assertRaises(PolicyRejected):
            evaluate_entry_risk(RiskSnapshot(
                equity=float("nan"), broker_day_start_equity=10000,
                aggregate_open_risk=100, open_orders_and_positions_count=1,
                proposed_trade_risk=50,
            ))


if __name__ == "__main__":
    unittest.main()
