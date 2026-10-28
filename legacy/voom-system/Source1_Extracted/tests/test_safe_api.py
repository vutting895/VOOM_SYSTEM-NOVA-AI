"""Paper-only smoke tests for Source 1 API; no broker/order calls."""
import csv
import os
import unittest
from pathlib import Path

TEST_TOKEN = "TEST_ONLY_TOKEN_NOT_A_REAL_SECRET_012345678901234567890"
os.environ["VOOM_API_TOKEN"] = TEST_TOKEN
from fastapi.testclient import TestClient
import api_server

HISTORY = Path(r"C:\Program Files\AI_Bridge\GOLD_M15_3mo_20260721_20261021.csv")


class Source1SafeApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(api_server.app)

    def test_health_is_paper_only(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["live_trading_enabled"])
        self.assertEqual(response.json()["order_execution"], "disabled")

    def test_analysis_requires_auth(self):
        candles = [{"open": 1, "high": 2, "low": 0.5, "close": 1.5}] * 100
        response = self.client.post("/strategy/analyze", json={"symbol": "GOLD", "candles": candles})
        self.assertEqual(response.status_code, 401)

    def test_invalid_ohlc_rejected(self):
        candles = [{"open": 1, "high": 0.5, "low": 0.8, "close": 1}] * 100
        response = self.client.post("/strategy/analyze",
            headers={"Authorization": "Bearer " + TEST_TOKEN},
            json={"symbol": "GOLD", "candles": candles})
        self.assertEqual(response.status_code, 422)

    def test_real_history_sample_returns_non_executable_result(self):
        self.assertTrue(HISTORY.is_file(), "Expected read-only historical OHLCV sample is missing")
        candles = []
        with HISTORY.open(newline="", encoding="utf-8-sig") as stream:
            for row in csv.DictReader(stream):
                candles.append({
                    "open": float(row["open"]), "high": float(row["high"]),
                    "low": float(row["low"]), "close": float(row["close"]),
                    "tick_volume": float(row["tick_volume"])
                })
                if len(candles) == 150:
                    break
        response = self.client.post("/strategy/analyze",
            headers={"Authorization": "Bearer " + TEST_TOKEN},
            json={"symbol": "GOLD", "candles": candles})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertIn(result["direction"], {"BUY", "SELL", "HOLD"})
        self.assertFalse(result["executionEnabled"])
        self.assertTrue(result["paper_only"])

if __name__ == "__main__":
    unittest.main(verbosity=2)
