from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]

# The runtime needs rpyc, but contract tests do not connect to Docker or a broker.
fake_rpyc = types.ModuleType("rpyc")
fake_rpyc.classic = types.SimpleNamespace(connect=lambda *args, **kwargs: None)
sys.modules.setdefault("rpyc", fake_rpyc)


class FakeMT5:
    def __init__(self, connected: bool = True):
        self.connected = connected
        self.calls = []

    def call(self, method, *args, **kwargs):
        self.calls.append((method, args, kwargs))
        if method == "initialize":
            return True
        if method == "last_error":
            return (0, "ok")
        if method == "terminal_info":
            return {"connected": self.connected, "trade_allowed": True}
        if method == "account_info":
            return {
                "server": "Exness-Demo-Test", "currency": "USD", "balance": 1000.0,
                "equity": 1002.5, "margin": 10.0, "margin_free": 992.5, "margin_level": 10025.0,
            }
        if method == "symbols_get":
            return [{
                "name": "XAUUSDm", "description": "Gold test symbol", "visible": True,
                "digits": 2, "currency_base": "XAU", "currency_profit": "USD",
            }]
        if method == "symbol_info":
            return {"name": "XAUUSDm", "visible": True, "digits": 2} if args[0] == "XAUUSDm" else None
        if method == "symbol_select":
            return True
        if method == "symbol_info_tick":
            return {"bid": 2000.1, "ask": 2000.2, "last": 2000.15, "time": 1790000000}
        if method == "copy_rates_from_pos":
            return [{
                "time": 1790000000, "open": 1999.0, "high": 2001.0, "low": 1998.5,
                "close": 2000.0, "tick_volume": 42, "spread": 20, "real_volume": 0,
            }]
        raise AssertionError(f"Unexpected MT5 call: {method}")

    def constant(self, name):
        if name not in {
            "TIMEFRAME_M1", "TIMEFRAME_M5", "TIMEFRAME_M15", "TIMEFRAME_M30",
            "TIMEFRAME_H1", "TIMEFRAME_H4", "TIMEFRAME_D1",
        }:
            raise ValueError(name)
        return 5


class HeadlessBridgeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        cls.tenant_file = root / "tenant.txt"
        cls.token_file = root / "token.txt"
        cls.tenant_file.write_text("tenant_12345678", encoding="utf-8")
        cls.token_file.write_text("read_only_test_token_which_is_long_enough_123456", encoding="utf-8")
        cls.env_patch = patch.dict(os.environ, {
            "MT5_TENANT_ID_FILE": str(cls.tenant_file),
            "MT5_BRIDGE_TOKEN_FILE": str(cls.token_file),
            "MT5_BRIDGE_CORS_ORIGINS": "https://voom-system-nova-ui.suwapat787.workers.dev",
        })
        cls.env_patch.start()
        spec = importlib.util.spec_from_file_location("headless_bridge_under_test", ROOT / "bridge.py")
        cls.module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cls.module
        spec.loader.exec_module(cls.module)

    @classmethod
    def tearDownClass(cls):
        cls.env_patch.stop()
        cls.temp.cleanup()
        sys.modules.pop("headless_bridge_under_test", None)

    def setUp(self):
        self.fake = FakeMT5()
        self.module.MT5 = self.fake
        self.client = TestClient(self.module.app)
        self.headers = {
            "Authorization": "Bearer read_only_test_token_which_is_long_enough_123456",
            "X-VOOM-TENANT-ID": "tenant_12345678",
        }

    def test_liveness_is_process_only_and_does_not_touch_mt5(self):
        response = self.client.get("/livez")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "up")
        self.assertEqual(self.fake.calls, [])

    def test_missing_authorization_is_401(self):
        response = self.client.get("/health", headers={"X-VOOM-TENANT-ID": "tenant_12345678"})
        self.assertEqual(response.status_code, 401)

    def test_wrong_token_is_401(self):
        response = self.client.get("/api/account", headers={
            "Authorization": "Bearer wrong_token_which_is_long_enough_123456",
            "X-VOOM-TENANT-ID": "tenant_12345678",
        })
        self.assertEqual(response.status_code, 401)

    def test_wrong_tenant_is_403(self):
        response = self.client.get("/api/account", headers={
            **self.headers, "X-VOOM-TENANT-ID": "tenant_other_123456",
        })
        self.assertEqual(response.status_code, 403)

    def test_health_and_account_are_read_only(self):
        health = self.client.get("/health", headers=self.headers)
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "ok")
        self.assertFalse(health.json()["order_submission_enabled"])
        account = self.client.get("/api/account", headers=self.headers)
        self.assertEqual(account.status_code, 200)
        self.assertEqual(account.json()["currency"], "USD")
        self.assertFalse(account.json()["order_submission_enabled"])
        self.assertTrue(account.json()["terminal_trade_allowed"])

    def test_symbols_and_quotes_match_existing_api_contract(self):
        symbols = self.client.get("/api/symbols?q=XAU&limit=10", headers=self.headers)
        self.assertEqual(symbols.status_code, 200)
        self.assertEqual(symbols.json()["symbols"][0]["name"], "XAUUSDm")
        quotes = self.client.get("/api/quotes?symbol=XAUUSDm&timeframe=M5&count=1", headers=self.headers)
        self.assertEqual(quotes.status_code, 200)
        self.assertEqual(quotes.json()["symbol"], "XAUUSDm")
        self.assertEqual(quotes.json()["count"], 1)
        self.assertFalse(quotes.json()["order_submission_enabled"])

    def test_disconnected_terminal_fails_closed(self):
        self.module.MT5 = FakeMT5(connected=False)
        response = self.client.get("/api/account", headers=self.headers)
        self.assertEqual(response.status_code, 503)

    def test_mutating_methods_and_order_routes_are_rejected(self):
        post = self.client.post("/api/account", headers=self.headers, json={})
        self.assertEqual(post.status_code, 405)
        orders = self.client.post("/api/orders", headers=self.headers, json={})
        self.assertEqual(orders.status_code, 403)

    def test_invalid_quote_input_is_rejected(self):
        response = self.client.get("/api/quotes?symbol=XAUUSDm&timeframe=T1", headers=self.headers)
        self.assertEqual(response.status_code, 400)
        response = self.client.get("/api/quotes?symbol=bad%2Fpath", headers=self.headers)
        self.assertEqual(response.status_code, 400)

    def test_missing_secret_fails_closed(self):
        original_token = self.token_file.read_text(encoding="utf-8")
        try:
            self.token_file.write_text("", encoding="utf-8")
            response = self.client.get("/health", headers=self.headers)
            self.assertEqual(response.status_code, 503)
        finally:
            self.token_file.write_text(original_token, encoding="utf-8")


if __name__ == "__main__":
    unittest.main(verbosity=2)
