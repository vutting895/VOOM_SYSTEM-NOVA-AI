import unittest
from datetime import datetime, timezone

from workers.quant.mt5_decision_adapter import evaluate_mt5_event


class TestMT5QuantDecisionAdapter(unittest.TestCase):
    def setUp(self):
        self.event = {
            "schema_version": "nova.mt5-event.v1",
            "event_id": "unit-quant-001",
            "module_id": "M01",
            "payload": {
                "quant_features": {
                    "price_return_norm": 0.2,
                    "volatility_atr_norm": 0.3,
                    "liquidity_imbalance": -0.1,
                    "momentum_rsi_norm": 0.4,
                }
            },
        }

    def test_invokes_existing_hybrid_quant_engine(self):
        result = evaluate_mt5_event(self.event)
        self.assertEqual(result["engine"], "HybridQuantumQuantEngine")
        self.assertEqual(result["evaluation_status"], "research_only")
        self.assertEqual(result["score_calibration"], "not_calibrated")
        self.assertIn("directional_probability_up", result)
        self.assertGreaterEqual(result["directional_probability_up"], 0.0)
        self.assertLessEqual(result["directional_probability_up"], 1.0)
        self.assertFalse(result["execution_enabled"])

    def test_rejects_missing_feature_vector(self):
        event = {**self.event, "payload": {}}
        with self.assertRaisesRegex(ValueError, "quant_features_required"):
            evaluate_mt5_event(event)

    def test_rejects_non_finite_and_out_of_range_features(self):
        event = {**self.event, "payload": {"quant_features": {
            "price_return_norm": float("nan"), "volatility_atr_norm": 0.0,
            "liquidity_imbalance": 0.0, "momentum_rsi_norm": 0.0,
        }}}
        with self.assertRaisesRegex(ValueError, "price_return_norm"):
            evaluate_mt5_event(event)
        event["payload"]["quant_features"]["price_return_norm"] = 1.01
        with self.assertRaisesRegex(ValueError, "out_of_range"):
            evaluate_mt5_event(event)


if __name__ == "__main__":
    unittest.main()
