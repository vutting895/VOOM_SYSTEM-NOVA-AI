import unittest
import numpy as np
from workers.quantum.quant_engine import QuantumQuantEngine

class QuantumQuantEngineTests(unittest.TestCase):
    def setUp(self):
        self.features = np.array([
            [-1.0,-0.8,-0.9,-0.7],[-0.8,-0.7,-0.6,-0.9],
            [-0.7,-0.9,-0.8,-0.6],[-0.9,-0.6,-0.7,-0.8],
            [0.7,0.8,0.9,0.6],[0.8,0.7,0.6,0.9],
            [0.9,0.9,0.8,0.7],[0.6,0.9,0.7,0.8],
        ])
        self.labels = np.array([0,0,0,0,1,1,1,1])

    def risk_meta(self):
        return {"account_currency":"USD","min_volume":0.01,"max_volume":100,"volume_step":0.01}

    def test_requires_features_and_training(self):
        engine = QuantumQuantEngine(seed=7)
        self.assertEqual(engine.run_quantum_regime_forecast("EURUSD","H1")["status"],"FEATURES_REQUIRED")
        self.assertEqual(engine.run_quantum_regime_forecast(
            "EURUSD","H1",[0.1,-0.2,0.3,0.4])["status"],"MODEL_NOT_READY")

    def test_classical_fit_is_deterministic_and_not_trade_authority(self):
        a,b = QuantumQuantEngine(seed=11),QuantumQuantEngine(seed=11)
        a.fit(self.features,self.labels); b.fit(self.features,self.labels)
        fa = a.run_quantum_regime_forecast("EURUSD","H1",[0.8,0.8,0.8,0.8])
        fb = b.run_quantum_regime_forecast("EURUSD","H1",[0.8,0.8,0.8,0.8])
        self.assertEqual(fa["bullish_probability"],fb["bullish_probability"])
        self.assertEqual(fa["trading_action"],"NONE")
        self.assertFalse(fa["live_trading_enabled"])

    def test_pip_value_sizing_respects_risk_cap(self):
        result = QuantumQuantEngine().run_risk_filter(
            "EURUSD",10000,50,pip_value_per_lot=10,pip_value_currency="USD",**self.risk_meta())
        self.assertEqual(result["status"],"SIZED_ONLY_NO_ORDER")
        self.assertEqual(result["calculated_volume_lots"],0.4)
        self.assertLessEqual(result["estimated_stop_loss_account_ccy"],200)
        self.assertFalse(result["order_submission_enabled"])

    def test_broker_loss_per_lot(self):
        result = QuantumQuantEngine().run_risk_filter(
            "XAUUSDm",5000,100,loss_per_lot_account_ccy=1250,**self.risk_meta())
        self.assertEqual(result["calculated_volume_lots"],0.08)

    def test_below_minimum_is_rejected_not_rounded_up(self):
        result = QuantumQuantEngine().run_risk_filter(
            "BTCUSD",1000,100,loss_per_lot_account_ccy=3000,**self.risk_meta())
        self.assertEqual(result["status"],"REJECTED")
        self.assertEqual(result["reason_code"],"BELOW_MIN_VOLUME")
        self.assertEqual(result["calculated_volume_lots"],0.0)

    def test_hard_cap_and_currency_validation(self):
        over = QuantumQuantEngine().run_risk_filter(
            "EURUSD",10000,50,pip_value_per_lot=10,pip_value_currency="USD",
            risk_percent=2.01,**self.risk_meta())
        mismatch = QuantumQuantEngine().run_risk_filter(
            "EURJPY",10000,50,pip_value_per_lot=10,pip_value_currency="JPY",**self.risk_meta())
        self.assertEqual(over["reason_code"],"RISK_LIMIT_EXCEEDED")
        self.assertEqual(mismatch["reason_code"],"PIP_VALUE_CURRENCY_MISMATCH")

    def test_legacy_qaoa_alias_does_not_claim_qaoa(self):
        result = QuantumQuantEngine().run_qaoa_risk_filter(
            "EURUSD",10000,50,pip_value_per_lot=10,pip_value_currency="USD",**self.risk_meta())
        self.assertFalse(result["qaoa_executed"])
        self.assertEqual(result["quantum_optimizer"],"NOT_USED_CLASSICAL_RISK_GUARD")

    def test_sizing_never_authorizes_order(self):
        result = QuantumQuantEngine().run_risk_filter(
            "EURUSD",10000,50,pip_value_per_lot=10,pip_value_currency="USD",**self.risk_meta())
        self.assertEqual(result["recommended_action"],"NO_TRADE")
        self.assertFalse(result["live_trading_enabled"])
        self.assertFalse(result["order_submission_enabled"])

if __name__ == "__main__":
    unittest.main()
