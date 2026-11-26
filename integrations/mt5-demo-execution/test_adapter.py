import ast
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from adapter import ExecutionDisabled, PolicyRejected, TRADING_FLAGS, dispatch_demo_order, preflight_demo_order
from command_contract import ReplayGuard, sign_command

NOW = 1_800_000_000
SECRET = b"test-only-secret-material-at-least-32-bytes"
TENANT = "tenant-a"
CONNECTION = "00000000-0000-4000-8000-000000000000"
LOGIN = 12345678
SERVER = "Exness-MT5Trial9"


def build_message(nonce="abcdefghijklmnopqrstuvwx"):
    intent = {
        "command_id": "command-id-00000001",
        "symbol": "XAUUSDm",
        "side": "buy",
        "volume": "0.01",
        "stop_loss": "2300.00",
        "take_profit": "2310.00",
        "expires_at": NOW + 30,
        "policy_version": "NOVA-DEMO-V1",
        "payload_hash": "",
    }
    canonical = {key: intent[key] for key in sorted(intent) if key != "payload_hash"}
    intent["payload_hash"] = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()
    envelope = {
        "tenant_id": TENANT,
        "connection_id": CONNECTION,
        "account_login": LOGIN,
        "account_server": SERVER,
        "command_id": intent["command_id"],
        "issued_at": NOW,
        "expires_at": NOW + 30,
        "nonce": nonce,
        "intent": intent,
    }
    return {"envelope": envelope, "signature": sign_command(envelope, SECRET)}


def demo_context(trade_mode=0, server=SERVER, login=LOGIN, connected=True):
    account = SimpleNamespace(trade_mode=trade_mode, server=server, login=login, currency="USD")
    terminal = SimpleNamespace(company="Exness Ltd.", connected=connected)
    constants = SimpleNamespace(ACCOUNT_TRADE_MODE_DEMO=0)
    return account, terminal, constants


class DemoAdapterTests(unittest.TestCase):
    def test_valid_signed_demo_command_is_preflight_only(self):
        account, terminal, constants = demo_context()
        with tempfile.TemporaryDirectory() as directory:
            result = preflight_demo_order(
                signed_message=build_message(), secret=SECRET,
                expected_tenant_id=TENANT, expected_connection_id=CONNECTION,
                expected_login=LOGIN, expected_server=SERVER,
                account=account, terminal=terminal, mt5_constants=constants,
                replay_guard=ReplayGuard(Path(directory) / "replay.sqlite"), now=NOW,
            )
        self.assertTrue(result["validated"])
        self.assertFalse(result["dispatchAllowed"])
        self.assertEqual(result["riskDecision"], "not_evaluated")
        self.assertEqual(result["reason"], "execution_disabled")
        self.assertEqual(result["account"]["environment"], "demo")
        self.assertEqual(TRADING_FLAGS, {"ordersEnabled": False, "executionEnabled": False, "liveTradingEnabled": False})

    def test_live_account_is_rejected(self):
        account, terminal, constants = demo_context(trade_mode=1)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(PolicyRejected, "only a verified MT5 Demo"):
                preflight_demo_order(
                    signed_message=build_message(), secret=SECRET,
                    expected_tenant_id=TENANT, expected_connection_id=CONNECTION,
                    expected_login=LOGIN, expected_server=SERVER,
                    account=account, terminal=terminal, mt5_constants=constants,
                    replay_guard=ReplayGuard(Path(directory) / "replay.sqlite"), now=NOW,
                )

    def test_foreign_tenant_or_connection_is_rejected(self):
        message = build_message()
        account, terminal, constants = demo_context()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(PolicyRejected, "tenant_id scope mismatch"):
                preflight_demo_order(
                    signed_message=message, secret=SECRET,
                    expected_tenant_id="tenant-b", expected_connection_id=CONNECTION,
                    expected_login=LOGIN, expected_server=SERVER,
                    account=account, terminal=terminal, mt5_constants=constants,
                    replay_guard=ReplayGuard(Path(directory) / "replay.sqlite"), now=NOW,
                )

    def test_replayed_nonce_is_rejected(self):
        account, terminal, constants = demo_context()
        with tempfile.TemporaryDirectory() as directory:
            guard = ReplayGuard(Path(directory) / "replay.sqlite")
            kwargs = dict(
                secret=SECRET, expected_tenant_id=TENANT, expected_connection_id=CONNECTION,
                expected_login=LOGIN, expected_server=SERVER, account=account,
                terminal=terminal, mt5_constants=constants, replay_guard=guard, now=NOW,
            )
            preflight_demo_order(signed_message=build_message(), **kwargs)
            with self.assertRaisesRegex(PolicyRejected, "nonce has already been consumed"):
                preflight_demo_order(signed_message=build_message(), **kwargs)

    def test_bad_signature_and_stale_terminal_are_rejected(self):
        account, terminal, constants = demo_context()
        message = build_message()
        message["signature"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            guard = ReplayGuard(Path(directory) / "replay.sqlite")
            kwargs = dict(secret=SECRET, expected_tenant_id=TENANT, expected_connection_id=CONNECTION,
                          expected_login=LOGIN, expected_server=SERVER, account=account,
                          terminal=terminal, mt5_constants=constants, replay_guard=guard, now=NOW)
            with self.assertRaisesRegex(PolicyRejected, "signature verification failed"):
                preflight_demo_order(signed_message=message, **kwargs)
            stale_account, stale_terminal, stale_constants = demo_context(connected=False)
            with self.assertRaisesRegex(PolicyRejected, "not connected"):
                preflight_demo_order(signed_message=build_message("abcdefghijklmnopqrstuvwy"), **{**kwargs, "account": stale_account, "terminal": stale_terminal, "mt5_constants": stale_constants})

    def test_float_money_values_are_rejected(self):
        from adapter import validate_order_intent
        payload = build_message()["envelope"]["intent"].copy()
        payload["volume"] = 0.01
        canonical = {key: payload[key] for key in sorted(payload) if key != "payload_hash"}
        payload["payload_hash"] = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()
        with self.assertRaisesRegex(PolicyRejected, "binary floats are forbidden"):
            validate_order_intent(payload, now=NOW)

    def test_adapter_contains_no_broker_transport_or_mutation_api(self):
        source = (Path(__file__).with_name("adapter.py")).read_text(encoding="utf-8")
        tree = ast.parse(source)
        forbidden_imports = {"MetaTrader5", "mt5"}
        forbidden_calls = {"order_send", "order_check", "positions_close", "order_delete"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                self.assertFalse(any(alias.name in forbidden_imports for alias in node.names))
            elif isinstance(node, ast.ImportFrom):
                self.assertNotIn(node.module, forbidden_imports)
            elif isinstance(node, ast.Call):
                name = node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else ""
                self.assertNotIn(name, forbidden_calls)

    def test_broker_dispatch_is_hard_disabled(self):
        with self.assertRaises(ExecutionDisabled):
            dispatch_demo_order({"symbol": "XAUUSDm"})


if __name__ == "__main__":
    unittest.main()
