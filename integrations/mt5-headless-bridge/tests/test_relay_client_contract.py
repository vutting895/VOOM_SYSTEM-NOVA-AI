from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("headless_relay_under_test", ROOT / "bridge_relay_client.py")
relay = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = relay
spec.loader.exec_module(relay)


class RelayClientContractTests(unittest.TestCase):
    def test_approved_relay_url_only(self):
        self.assertEqual(relay.validate_relay_url(relay.DEFAULT_RELAY_URL), relay.DEFAULT_RELAY_URL)
        for value in (
            "http://voom-mt5-bridge-relay.suwapat787.workers.dev/connect",
            "wss://attacker.invalid/connect",
            "wss://voom-mt5-bridge-relay.suwapat787.workers.dev/other",
            "wss://user@voom-mt5-bridge-relay.suwapat787.workers.dev/connect",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                relay.validate_relay_url(value)

    def test_only_allowlisted_read_routes_are_forwarded(self):
        self.assertEqual(relay.normalize_read_path("/health"), "/health")
        self.assertEqual(relay.normalize_read_path("/api/account"), "/api/account")
        self.assertEqual(relay.normalize_read_path("/api/symbols?q=XAU&limit=20"), "/api/symbols?q=XAU&limit=20")
        self.assertEqual(
            relay.normalize_read_path("/api/quotes?symbol=XAUUSDm&timeframe=M5&count=10"),
            "/api/quotes?symbol=XAUUSDm&timeframe=M5&count=10",
        )
        for value in (
            "https://evil.invalid/api/account", "//evil.invalid/api/account", "/api/orders",
            "/api/account?connection_id=other", "/api/quotes?symbol=XAUUSDm&symbol=OTHER",
            "/api/quotes?symbol=XAUUSDm&timeframe=M99", "/api/quotes?symbol=../../etc/passwd",
            "/api/account#fragment",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                relay.normalize_read_path(value)


if __name__ == "__main__":
    unittest.main(verbosity=2)
