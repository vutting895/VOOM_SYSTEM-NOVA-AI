import math
import unittest
from datetime import datetime, timedelta, timezone

from workers.quant_engine.mtraders_native import MTRADERS_STRATEGY_NAMES, StrategyInputError, evaluate_all_mtraders_modules, evaluate_mtraders_strategy
from workers.quant_engine.mtraders_hybrid import detect_market_regime, evaluate_hybrid_strategy


def candles(n=180, trend=True, timestamps=False):
    result = []
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for i in range(n):
        close = 100 + i * 0.08 + math.sin(i / 3) * (0.12 if trend else 0.25)
        op = close - (0.03 if i % 2 == 0 else -0.02)
        row = {"open": op, "high": max(op, close) + 0.18, "low": min(op, close) - 0.18,
               "close": close, "volume": 1000 + (i % 7) * 80}
        if timestamps:
            row["timestamp"] = start + timedelta(hours=i)
        result.append(row)
    return result


def approved(data):
    return {"candles": data, "quality_receipt": {"status": "PASS", "dataset_id": "test-data",
            "quality_report_id": "test-quality", "dataset_sha256": "a" * 64}}


class NativeTests(unittest.TestCase):
    def test_30_unique_modules(self):
        self.assertEqual(len(MTRADERS_STRATEGY_NAMES), 30)
        self.assertEqual(len(set(MTRADERS_STRATEGY_NAMES)), 30)

    def test_all_30_return_standardized_research_outputs(self):
        result = evaluate_all_mtraders_modules({"candles": candles()})
        self.assertEqual(len(result), 30)
        for item in result:
            self.assertIn(item["signal"], (-1, 0, 1))
            self.assertTrue(-1 <= item["score"] <= 1)
            if item["signal"]:
                self.assertGreater(item["score"] * item["signal"], 0)
            self.assertFalse(item["orders_submitted"])
            self.assertFalse(item["execution_enabled"])
            self.assertFalse(item["live_trading_enabled"])

    def test_no_fake_prices_or_invalid_ohlc(self):
        with self.assertRaises(StrategyInputError):
            evaluate_mtraders_strategy(0, {"close": 2500})
        bad = candles()
        bad[10]["high"] = bad[10]["low"] - 1
        with self.assertRaises(StrategyInputError):
            evaluate_all_mtraders_modules({"candles": bad})

    def test_time_modules_need_utc_timestamp(self):
        for sid in (11, 13, 22, 26):
            self.assertIn("timestamp", evaluate_mtraders_strategy(sid, {"candles": candles()})["reason"])


    def test_mixed_timestamp_presence_is_rejected(self):
        data = candles(timestamps=True)
        data[20].pop("timestamp")
        with self.assertRaises(StrategyInputError):
            evaluate_all_mtraders_modules({"candles": data})

    def test_disclosed_approximations(self):
        neural = evaluate_mtraders_strategy(21, {"candles": candles()})
        footprint = evaluate_mtraders_strategy(19, {"candles": candles()})
        self.assertEqual(neural["metrics"]["model_type"], "LINEAR_PROXY_NOT_NEURAL_MODEL")
        self.assertEqual(footprint["metrics"]["data_limitation"], "NOT_TRUE_BID_ASK_FOOTPRINT")


class HybridTests(unittest.TestCase):
    def test_detects_trend(self):
        self.assertEqual(detect_market_regime(candles())["regime"], "TREND")

    def test_blocks_missing_quality_receipt(self):
        out = evaluate_hybrid_strategy({"candles": candles()})
        self.assertEqual(out["decision"], "DATA_QUALITY_BLOCKED")
        self.assertIsNone(out["signal"])

    def test_hybrid_evaluates_all_modules_and_is_research_only(self):
        out = evaluate_hybrid_strategy(approved(candles()))
        self.assertEqual(out["evaluated_module_count"], 30)
        self.assertEqual(out["regime"]["regime"], "TREND")
        self.assertFalse(out["orders_submitted"])
        self.assertFalse(out["execution_enabled"])
        self.assertFalse(out["live_trading_enabled"])

    def test_insufficient_bars_block_signal(self):
        out = evaluate_hybrid_strategy(approved(candles(30)))
        self.assertEqual(out["decision"], "INSUFFICIENT_DATA")
        self.assertIsNone(out["signal"])

    def test_model_votes_cannot_bypass_strategy_vote_minimum(self):
        out = evaluate_hybrid_strategy(approved(candles()), model_votes={"wave3": {"direction": 1, "score": 1.0}},
                                       minimum_strategy_votes=30)
        self.assertEqual(out["decision"], "NO_TRADE")

    def test_invalid_model_vote_rejected(self):
        with self.assertRaises(ValueError):
            evaluate_hybrid_strategy(approved(candles()), model_votes={"lstm": {"direction": 1, "score": -0.9}})


    def test_zero_score_cannot_claim_direction(self):
        with self.assertRaises(ValueError):
            evaluate_hybrid_strategy(approved(candles()), model_votes={"xgboost": {"direction": 1, "score": 0.0}})

    def test_partial_model_coverage_does_not_get_full_model_weight(self):
        vote = {"xgboost": {"direction": 1, "score": 1.0}}
        out = evaluate_hybrid_strategy(approved(candles()), model_votes=vote)
        self.assertAlmostEqual(out["model_score"], 0.15 / sum((0.15, 0.15, 0.15, 0.20)), places=6)

    def test_boolean_thresholds_are_rejected(self):
        for kwargs in ({"minimum_strategy_score": True}, {"consensus_threshold": False}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                evaluate_hybrid_strategy(approved(candles()), **kwargs)

    def test_invalid_performance_weight_keys_are_rejected_even_if_module_is_not_selected(self):
        for weights in ({"30": 1.0}, {"01": 1.0}, {"not-an-id": 1.0}, {"0": True}):
            with self.subTest(weights=weights), self.assertRaises(ValueError):
                evaluate_hybrid_strategy(approved(candles()), performance_weights=weights)

    def test_validation_weights_bounded(self):
        with self.assertRaises(ValueError):
            evaluate_hybrid_strategy(approved(candles()), performance_weights={"0": 2.0})


if __name__ == "__main__":
    unittest.main(verbosity=2)
