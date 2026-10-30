import unittest
import numpy as np
from workers.quantum.quant_engine import PENNYLANE_AVAILABLE, QuantumQuantEngine

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
        self.assertEqual(fa["bullish_score_01"],fb["bullish_score_01"])
        self.assertEqual(fa["trading_action"],"NONE")
        self.assertFalse(fa["probability_calibrated"])
        self.assertEqual(fa["score_semantics"], "uncalibrated_backend_score_mapped_to_0_1")
        self.assertNotIn("bullish_probability", fa)
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


    def test_classical_scaler_is_isolated_from_quantum_preprocessing(self):
        engine = QuantumQuantEngine(seed=19)
        engine.fit_classical(self.features, self.labels)
        before = engine.run_quantum_regime_forecast(
            "EURUSD", "H1", [0.8, 0.8, 0.8, 0.8]
        )["bullish_score_01"]
        engine._fit_standardizer(self.features + 100.0, backend="quantum")
        after = engine.run_quantum_regime_forecast(
            "EURUSD", "H1", [0.8, 0.8, 0.8, 0.8]
        )["bullish_score_01"]
        self.assertEqual(before, after)

    def test_broker_maximum_and_volume_step_are_respected(self):
        result = QuantumQuantEngine().run_risk_filter(
            "EURUSD", 10_000, 50,
            loss_per_lot_account_ccy=1,
            account_currency="USD",
            min_volume=0.1,
            max_volume=0.15,
            volume_step=0.1,
        )
        self.assertEqual(result["calculated_volume_lots"], 0.1)
        self.assertEqual(result["reason_code"], "VOLUME_CAPPED_AT_BROKER_MAX")
        self.assertLessEqual(result["calculated_volume_lots"], 0.15)
        self.assertLessEqual(result["estimated_stop_loss_account_ccy"], 200.0)

    def test_non_usd_account_uses_account_currency_budget(self):
        result = QuantumQuantEngine().run_risk_filter(
            "EURGBP", 10_000, 50,
            pip_value_per_lot=10,
            pip_value_currency="GBP",
            account_currency="GBP",
            min_volume=0.01,
            max_volume=100,
            volume_step=0.01,
        )
        self.assertEqual(result["calculated_volume_lots"], 0.4)
        self.assertIsNone(result["risk_usd"])
        self.assertEqual(result["risk_budget_account_ccy"], 200.0)


    @unittest.skipUnless(PENNYLANE_AVAILABLE, "PennyLane optional dependency is not installed")
    def test_pennylane_vqc_trains_and_keeps_backend_scalers_isolated(self):
        engine = QuantumQuantEngine(seed=23)
        engine.fit_classical(self.features, self.labels)
        classical_before = engine.run_quantum_regime_forecast(
            "EURUSD", "H1", [0.8, 0.8, 0.8, 0.8]
        )["bullish_score_01"]

        trained = engine.fit_quantum(
            self.features + 25.0, self.labels, epochs=2, learning_rate=0.01
        )
        self.assertEqual(trained["status"], "TRAINED")
        quantum = engine.run_quantum_regime_forecast(
            "EURUSD", "H1", [25.8, 25.8, 25.8, 25.8], backend="quantum"
        )
        self.assertEqual(quantum["model_backend"], "PENNYLANE_VQC")
        self.assertEqual(quantum["quantum_circuit_status"], "EXECUTED")
        self.assertEqual(len(quantum["quantum_expectation_by_wire"]), engine.n_qubits)
        self.assertTrue(-1.0 <= quantum["quantum_expectation_value"] <= 1.0)
        self.assertEqual(quantum["trading_action"], "NONE")
        self.assertTrue(quantum["research_only"])
        self.assertFalse(quantum["trade_authorized"])
        self.assertFalse(quantum["order_submission_enabled"])
        self.assertFalse(quantum["live_trading_enabled"])

        classical_after = engine.run_quantum_regime_forecast(
            "EURUSD", "H1", [0.8, 0.8, 0.8, 0.8], backend="classical"
        )["bullish_score_01"]
        self.assertEqual(classical_before, classical_after)

if __name__ == "__main__":
    unittest.main()
