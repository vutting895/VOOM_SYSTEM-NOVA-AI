import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from adapter import (
    IdempotencyLedger, PolicyRejected, require_execution_switches,
    validate_order_intent, verify_demo_identity,
)


class FakeMT5:
    ACCOUNT_TRADE_MODE_DEMO = 0


def valid_payload():
    payload = {
        "idempotency_key": "demo-command-key-000001",
        "symbol": "XAUUSDm",
        "side": "buy",
        "volume": 0.01,
        "stop_loss": 2300.0,
        "take_profit": 2310.0,
        "expires_at": 1060,
        "policy_version": "demo-v1",
        "risk_approved": True,
    }
    canonical = {k: payload[k] for k in sorted(payload)}
    payload["payload_hash"] = hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return payload


class DemoAdapterPolicyTests(unittest.TestCase):
    def test_accepts_pinned_exness_demo_identity(self):
        account = SimpleNamespace(login=12345, server="Exness-MT5Trial", company="Exness Ltd",
                                  currency="USD", trade_mode=0)
        terminal = SimpleNamespace(connected=True)
        identity = verify_demo_identity(account, terminal, FakeMT5(), 12345, "Exness-MT5Trial")
        self.assertEqual(identity.login, 12345)

    def test_rejects_live_account(self):
        account = SimpleNamespace(login=12345, server="Exness-MT5", company="Exness Ltd",
                                  currency="USD", trade_mode=1)
        with self.assertRaises(PolicyRejected):
            verify_demo_identity(account, SimpleNamespace(connected=True), FakeMT5(),
                                 12345, "Exness-MT5")

    def test_rejects_wrong_broker_and_wrong_account(self):
        account = SimpleNamespace(login=12345, server="Other-Demo", company="Other Broker",
                                  currency="USD", trade_mode=0)
        with self.assertRaises(PolicyRejected):
            verify_demo_identity(account, SimpleNamespace(connected=True), FakeMT5(),
                                 12345, "Other-Demo")
        account.company = "Exness Ltd"
        with self.assertRaises(PolicyRejected):
            verify_demo_identity(account, SimpleNamespace(connected=True), FakeMT5(),
                                 99999, "Other-Demo")

    def test_switches_fail_closed(self):
        with self.assertRaises(PolicyRejected):
            require_execution_switches({})
        require_execution_switches({
            "NOVA_DEMO_EXECUTION_ENABLED": "true",
            "NOVA_LIVE_TRADING_ENABLED": "false",
            "NOVA_ORDERS_ENABLED": "true",
        })
        with self.assertRaises(PolicyRejected):
            require_execution_switches({
                "NOVA_DEMO_EXECUTION_ENABLED": "true",
                "NOVA_LIVE_TRADING_ENABLED": "true",
                "NOVA_ORDERS_ENABLED": "true",
            })

    def test_intent_requires_sl_tp_risk_approval_and_short_expiry(self):
        payload = valid_payload()
        intent = validate_order_intent(payload, now=1000)
        self.assertEqual(intent.symbol, "XAUUSDm")
        for field, value in (("risk_approved", False), ("stop_loss", 0), ("take_profit", 0),
                             ("expires_at", 1061)):
            changed = dict(payload)
            changed[field] = value
            canonical = {k: changed[k] for k in sorted(changed) if k != "payload_hash"}
            changed["payload_hash"] = hashlib.sha256(
                json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            with self.assertRaises(PolicyRejected):
                validate_order_intent(changed, now=1000)

    def test_ledger_claims_once_and_detects_payload_reuse(self):
        intent = validate_order_intent(valid_payload(), now=1000)
        with tempfile.TemporaryDirectory() as directory:
            ledger = IdempotencyLedger(Path(directory) / "commands.sqlite3")
            self.assertTrue(ledger.claim(intent, now=1000))
            self.assertFalse(ledger.claim(intent, now=1001))
            ledger.set_state(intent.idempotency_key, "dispatch_started")
            payload = valid_payload()
            payload["volume"] = 0.02
            canonical = {k: payload[k] for k in sorted(payload) if k != "payload_hash"}
            payload["payload_hash"] = hashlib.sha256(
                json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            different = validate_order_intent(payload, now=1000)
            with self.assertRaises(PolicyRejected):
                ledger.claim(different, now=1002)


if __name__ == "__main__":
    unittest.main()
