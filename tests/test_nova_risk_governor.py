import unittest
from datetime import datetime, timedelta, timezone

from integrations.mt5.nova_risk_governor import (
    DemoAccount, ExposureSnapshot, TradeIntent, validate_trade_proposal,
    MAX_TOTAL_EXPOSURE_ORDERS,
)


class RiskGovernorContractTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.account = DemoAccount("tenant-A", 123456, "Exness-MT5Trial", "DEMO", "USD")
        self.snapshot = ExposureSnapshot(
            "tenant-A", 123456, "Exness-MT5Trial", 10000, 50,
            2.0, 0.0, 2, 1, 0.5, self.now,
        )
        self.intent = TradeIntent(
            "cmd-1", "tenant-A", 123456, "Exness-MT5Trial",
            "XAUUSDm", "BUY", 0.01, 4000, 3995, 4010,
            690711000, self.now - timedelta(seconds=1), self.now + timedelta(seconds=10),
        )

    def validate(self, intent=None, account=None, snapshot=None, consumed=frozenset()):
        return validate_trade_proposal(
            intent or self.intent, account or self.account, snapshot or self.snapshot,
            allowed_symbols=frozenset({"XAUUSDm"}), consumed_command_ids=consumed, now=self.now,
        )

    def test_valid_demo_proposal_is_not_execution_authorization(self):
        result = self.validate()
        self.assertTrue(result.allowed)
        self.assertEqual(result.reason, "proposal_validated_no_execution")
        self.assertEqual(result.total_exposure_orders, 3)

    def test_live_account_is_denied(self):
        account = DemoAccount("tenant-A", 123456, "Exness-Real", "REAL", "USD")
        self.assertEqual(self.validate(account=account).reason, "exness_demo_only")

    def test_non_usd_account_is_denied(self):
        account = DemoAccount("tenant-A", 123456, "Exness-MT5Trial", "DEMO", "USC")
        self.assertEqual(self.validate(account=account).reason, "account_currency_must_be_usd")

    def test_tenant_mismatch_is_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "tenant_id": "tenant-B"})
        self.assertEqual(self.validate(intent=intent).reason, "tenant_mismatch")

    def test_snapshot_account_mismatch_is_denied(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "account_login": 999})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "account_binding_mismatch")

    def test_duplicate_command_is_denied(self):
        self.assertEqual(self.validate(consumed=frozenset({"cmd-1"})).reason, "duplicate_command_id")

    def test_intent_ttl_over_30_seconds_is_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "expires_at": self.now + timedelta(seconds=31)})
        self.assertEqual(self.validate(intent=intent).reason, "intent_expired_or_ttl_invalid")

    def test_stale_exposure_snapshot_is_denied(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "as_of": self.now - timedelta(seconds=6)})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "stale_or_future_exposure_snapshot")

    def test_non_integer_magic_is_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "magic": 690711000.5})
        self.assertEqual(self.validate(intent=intent).reason, "magic_not_nova_owned")

    def test_negative_aggregate_open_risk_is_denied(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "aggregate_open_risk_pct": -1.0})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "invalid_aggregate_open_risk")

    def test_single_trade_risk_limit_is_enforced(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "proposed_risk_money": 101})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "single_trade_risk_limit")

    def test_aggregate_risk_limit_is_enforced(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "aggregate_open_risk_pct": 8.6})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "aggregate_open_risk_limit")

    def test_ten_percent_daily_loss_locks_proposals(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "daily_loss_pct": 10.0})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "daily_loss_lock")

    def test_five_total_orders_are_denied(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "open_positions": 5, "open_pending_orders": 0})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "max_total_exposure_orders")
        self.assertEqual(MAX_TOTAL_EXPOSURE_ORDERS, 5)

    def test_invalid_exposure_count_is_denied(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "open_pending_orders": -1})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "invalid_exposure_counts")

    def test_stale_quote_is_denied(self):
        snapshot = ExposureSnapshot(**{**self.snapshot.__dict__, "quote_age_seconds": 5.1})
        self.assertEqual(self.validate(snapshot=snapshot).reason, "stale_quote")


if __name__ == "__main__":
    unittest.main()
