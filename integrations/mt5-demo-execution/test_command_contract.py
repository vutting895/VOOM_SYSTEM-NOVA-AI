import tempfile
import unittest
from pathlib import Path

from adapter import PolicyRejected
from command_contract import (
    CommandAuthenticationError, ReplayGuard, sign_command, verify_signed_command,
)


SECRET = b"test-only-secret-material-32-bytes-minimum"


def signed_message():
    intent = {
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
    import hashlib, json
    canonical_intent = {k: intent[k] for k in sorted(intent)}
    intent["payload_hash"] = hashlib.sha256(
        json.dumps(canonical_intent, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    envelope = {
        "tenant_id": "tenant-demo-1",
        "connection_id": "connection-demo-1",
        "account_login": 12345,
        "account_server": "Exness-MT5Trial",
        "command_id": intent["idempotency_key"],
        "issued_at": 1000,
        "expires_at": 1060,
        "nonce": "nonce-unique-value-000001",
        "intent": intent,
    }
    return {"envelope": envelope, "signature": sign_command(envelope, SECRET)}


class SignedCommandContractTests(unittest.TestCase):
    def verify(self, message, now=1000):
        return verify_signed_command(
            message, secret=SECRET, expected_tenant_id="tenant-demo-1",
            expected_connection_id="connection-demo-1", expected_login=12345,
            expected_server="Exness-MT5Trial", now=now,
        )

    def test_accepts_valid_signed_tenant_scoped_command(self):
        intent, nonce = self.verify(signed_message())
        self.assertEqual(intent.symbol, "XAUUSDm")
        self.assertEqual(nonce, "nonce-unique-value-000001")

    def test_rejects_tampered_signature(self):
        message = signed_message()
        message["envelope"]["intent"]["volume"] = 0.02
        with self.assertRaises(CommandAuthenticationError):
            self.verify(message)

    def test_rejects_wrong_tenant_or_connection(self):
        message = signed_message()
        with self.assertRaises(CommandAuthenticationError):
            verify_signed_command(message, secret=SECRET, expected_tenant_id="other-tenant",
                expected_connection_id="connection-demo-1", expected_login=12345,
                expected_server="Exness-MT5Trial", now=1000)
        with self.assertRaises(CommandAuthenticationError):
            verify_signed_command(message, secret=SECRET, expected_tenant_id="tenant-demo-1",
                expected_connection_id="other-connection", expected_login=12345,
                expected_server="Exness-MT5Trial", now=1000)

    def test_rejects_expired_command(self):
        with self.assertRaises(CommandAuthenticationError):
            self.verify(signed_message(), now=1060)

    def test_nonce_is_one_time_and_persistent(self):
        with tempfile.TemporaryDirectory() as directory:
            guard = ReplayGuard(Path(directory) / "replay.sqlite3")
            guard.consume("nonce-unique-value-000001", "demo-command-key-000001", now=1000)
            with self.assertRaises(CommandAuthenticationError):
                guard.consume("nonce-unique-value-000001", "demo-command-key-000001", now=1001)


if __name__ == "__main__":
    unittest.main()
