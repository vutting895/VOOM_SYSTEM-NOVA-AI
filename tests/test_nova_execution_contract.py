import unittest
from datetime import datetime, timedelta, timezone

from integrations.mt5.nova_execution_contract import (
    DemoAccount, RiskSnapshot, TradeIntent, validate_intent,
)


class NovaIntentGateTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.account = DemoAccount(123456, "Exness-MT5Trial", "DEMO", "USD", "tenant-A")
        self.risk = RiskSnapshot(10000, 50, 2.0, 0.0, 1, 0.5)
        self.intent = TradeIntent(
            "cmd-001", "tenant-A", 123456, "Exness-MT5Trial", "XAUUSDm",
            "BUY", 0.01, 4000.0, 3995.0, 4010.0,
            self.now - timedelta(seconds=1), self.now + timedelta(seconds=10), 690711000,
        )
        self.kw = dict(allowed_symbols={"XAUUSDm"}, consumed_command_ids=set(), now=self.now)

    def test_valid_demo_intent(self):
        result = validate_intent(self.intent, self.account, self.risk, **self.kw)
        self.assertTrue(result.allowed)
        self.assertEqual(result.reason, "validated_demo_intent_only")

    def test_live_account_denied(self):
        account = DemoAccount(123456, "Exness-Real", "REAL", "USD", "tenant-A")
        self.assertEqual(validate_intent(self.intent, account, self.risk, **self.kw).reason, "exness_demo_only")

    def test_non_exness_demo_denied(self):
        account = DemoAccount(123456, "Broker-Demo", "DEMO", "USD", "tenant-A")
        self.assertEqual(validate_intent(self.intent, account, self.risk, **self.kw).reason, "exness_demo_only")

    def test_tenant_mismatch_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "tenant_id": "tenant-B"})
        self.assertEqual(validate_intent(intent, self.account, self.risk, **self.kw).reason, "tenant_mismatch")

    def test_account_binding_mismatch_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "account_login": 999})
        self.assertEqual(validate_intent(intent, self.account, self.risk, **self.kw).reason, "account_binding_mismatch")

    def test_duplicate_command_denied(self):
        kw = {**self.kw, "consumed_command_ids": {"cmd-001"}}
        self.assertEqual(validate_intent(self.intent, self.account, self.risk, **kw).reason, "duplicate_or_missing_command_id")

    def test_expired_intent_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "expires_at": self.now - timedelta(seconds=1)})
        self.assertEqual(validate_intent(intent, self.account, self.risk, **self.kw).reason, "intent_expired_or_from_future")

    def test_long_ttl_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "expires_at": self.now + timedelta(minutes=2)})
        self.assertEqual(validate_intent(intent, self.account, self.risk, **self.kw).reason, "intent_ttl_exceeds_30_seconds")

    def test_unlisted_symbol_denied(self):
        self.assertEqual(validate_intent(self.intent, self.account, self.risk, allowed_symbols={"EURUSD"}, **{k:v for k,v in self.kw.items() if k != "allowed_symbols"}).reason, "symbol_not_allowlisted")

    def test_bad_buy_geometry_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "stop_loss": 4005})
        self.assertEqual(validate_intent(intent, self.account, self.risk, **self.kw).reason, "invalid_buy_sl_tp_geometry")

    def test_single_trade_risk_denied(self):
        risk = RiskSnapshot(10000, 101, 2, 0, 1, 0.5)
        self.assertEqual(validate_intent(self.intent, self.account, risk, **self.kw).reason, "single_trade_risk_limit")

    def test_aggregate_risk_denied(self):
        risk = RiskSnapshot(10000, 80, 8.5, 0, 1, 0.5)
        self.assertEqual(validate_intent(self.intent, self.account, risk, **self.kw).reason, "aggregate_open_risk_limit")

    def test_daily_loss_denied(self):
        risk = RiskSnapshot(10000, 50, 2, 10, 1, 0.5)
        self.assertEqual(validate_intent(self.intent, self.account, risk, **self.kw).reason, "daily_loss_lock")

    def test_position_cap_denied(self):
        risk = RiskSnapshot(10000, 50, 2, 0, 9, 0.5)
        self.assertEqual(validate_intent(self.intent, self.account, risk, **self.kw).reason, "max_positions_reached")

    def test_stale_quote_denied(self):
        risk = RiskSnapshot(10000, 50, 2, 0, 1, 5.1)
        self.assertEqual(validate_intent(self.intent, self.account, risk, **self.kw).reason, "stale_quote")

    def test_foreign_magic_denied(self):
        intent = TradeIntent(**{**self.intent.__dict__, "magic": 690712000})
        self.assertEqual(validate_intent(intent, self.account, self.risk, **self.kw).reason, "magic_not_nova_owned")

    def test_non_usd_denied(self):
        account = DemoAccount(123456, "Exness-MT5Trial", "DEMO", "EUR", "tenant-A")
        self.assertEqual(validate_intent(self.intent, account, self.risk, **self.kw).reason, "account_currency_must_be_usd")


if __name__ == "__main__":
    unittest.main()
