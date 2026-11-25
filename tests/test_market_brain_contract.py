from __future__ import annotations
import unittest
from datetime import datetime, timedelta, timezone
from workers.market_brain.contract import build_market_features, decision_from_probabilities, validate_market_window

def sample_candles(count: int = 80):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(count):
        close = 2000.0 + i * 0.2
        rows.append({"timestamp": (start + timedelta(minutes=5*i)).isoformat(),
            "open": close - 0.1, "high": close + 0.2, "low": close - 0.2,
            "close": close, "volume": 100 + i % 7})
    return rows

class MarketBrainContractTests(unittest.TestCase):
    def test_valid_window_builds_finite_features(self):
        features = build_market_features(sample_candles())
        self.assertEqual((len(features), len(features[0])), (80, 5))
        self.assertTrue(all(abs(value) < 10 for row in features for value in row))
    def test_rejects_naive_timestamp(self):
        rows = sample_candles(); rows[0]["timestamp"] = "2026-01-01T00:00:00"
        with self.assertRaisesRegex(ValueError, "timezone"): validate_market_window(rows)
    def test_rejects_non_monotonic_time(self):
        rows = sample_candles(); rows[10]["timestamp"] = rows[9]["timestamp"]
        with self.assertRaisesRegex(ValueError, "strictly increasing"): validate_market_window(rows)
    def test_rejects_invalid_ohlc(self):
        rows = sample_candles(); rows[5]["high"] = rows[5]["low"] - 1
        with self.assertRaisesRegex(ValueError, "OHLC bounds"): validate_market_window(rows)
    def test_wait_when_expected_edge_does_not_cover_costs(self):
        result = decision_from_probabilities(direction_probabilities=[0.05,0.10,0.85],
            regime_probabilities=[0.8,0.1,0.1], expected_move_bps=4.0, estimated_cost_bps=5.0)
        self.assertEqual(result["action"], "WAIT")
        self.assertFalse(result["live_trading_enabled"]); self.assertFalse(result["orders_submitted"])
    def test_buy_requires_confidence_and_net_edge(self):
        result = decision_from_probabilities(direction_probabilities=[0.05,0.05,0.90],
            regime_probabilities=[0.8,0.1,0.1], expected_move_bps=12.0, estimated_cost_bps=3.0)
        self.assertEqual(result["action"], "BUY"); self.assertEqual(result["regime"], "TRENDING")

if __name__ == "__main__": unittest.main()
