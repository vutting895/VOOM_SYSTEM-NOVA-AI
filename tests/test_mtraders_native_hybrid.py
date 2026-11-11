import math
import re
import unittest
from pathlib import Path
from datetime import datetime, timedelta, timezone

from workers.quant_engine.mtraders_native import MTRADERS_STRATEGY_NAMES, StrategyInputError, evaluate_all_mtraders_modules, evaluate_mtraders_strategy
from workers.quant_engine.mtraders_hybrid import STRATEGY_FAMILY_BY_ID, detect_market_regime, evaluate_hybrid_strategy


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

    def test_all_modules_map_to_exactly_one_of_eight_families(self):
        self.assertEqual(set(STRATEGY_FAMILY_BY_ID), set(range(30)))
        self.assertEqual(set(STRATEGY_FAMILY_BY_ID.values()), set(range(8)))

    def test_mql5_family_mapping_matches_python_exactly(self):
        source_path = Path(__file__).resolve().parents[1] / "integrations/mt5/MTRADERS_All_In_One_v1.01.mq5"
        source = source_path.read_text(encoding="utf-8")
        block = source.split("int StrategyFamily(const int id)", 1)[1].split("string FamilyName", 1)[0]
        mapping = {}
        for condition, family in re.findall(r"if\((.*?)\) return ([0-7]);", block):
            for module_id in map(int, re.findall(r"id==(\d+)", condition)):
                self.assertNotIn(module_id, mapping)
                mapping[module_id] = int(family)
        self.assertEqual(mapping, STRATEGY_FAMILY_BY_ID)


    def test_ontick_runs_closed_bar_research_only_controller(self):
        source_path = Path(__file__).resolve().parents[1] / "integrations/mt5/MTRADERS_All_In_One_v1.01.mq5"
        source = source_path.read_text(encoding="utf-8")
        self.assertIn("void OnTick()", source)
        on_tick = source.split("void OnTick()", 1)[1].split("}", 1)[0]
        self.assertIn("EvaluateClosedBar()", on_tick)
        self.assertIn("InpTradeEnabled", on_tick)
        for forbidden in ("OrderSend(", "PositionOpen(", ".Buy(", ".Sell("):
            self.assertNotIn(forbidden, on_tick)
        self.assertIn("One aggregated candidate only", source)
        self.assertIn("TIMEZONE MAP REQUIRED", source)


    def test_ontick_uses_new_closed_bar_guard_and_independent_families(self):
        source_path = Path(__file__).resolve().parents[1] / "integrations/mt5/MTRADERS_All_In_One_v1.01.mq5"
        source = source_path.read_text(encoding="utf-8")
        self.assertIn("iTime(_Symbol,InpAnalysisTF,1)", source)
        self.assertIn("if(expected_closed<=0 || expected_closed==gLastSignalBar) return false;", source)
        self.assertIn("closed_bar!=expected_closed", source)
        self.assertIn("gLastSignalBar=closed_bar;", source)
        self.assertIn("StrategyFamily(id)", source)
        self.assertIn("family_long[family]=MathMax(family_long[family],module_score)", source)
        self.assertIn("InpMinFamilyVotes", source)
        self.assertIn("current_tick.ask-current_tick.bid", source)

    def test_mql5_specialized_module_rules_are_not_one_shared_placeholder(self):
        source_path = Path(__file__).resolve().parents[1] / "integrations/mt5/MTRADERS_All_In_One_v1.01.mq5"
        source = source_path.read_text(encoding="utf-8")
        for fragment in ("VWAPAt(20,end_index)", "CloseLocation(i)", "RSIAt(14,end_index)",
                         "near_high>=2", "ATRAt(5,end_index)", "compressed && expanded"):
            self.assertIn(fragment, source)

    def test_mql5_module_registry_matches_python_registry_and_safe_defaults(self):
        source_path = Path(__file__).resolve().parents[1] / "integrations/mt5/MTRADERS_All_In_One_v1.01.mq5"
        source = source_path.read_text(encoding="utf-8")
        registered = sorted(
            ((int(index), name) for index, name in re.findall(r'gName[[]([0-9]+)[]][ ]*=[ ]*"([^"]+)"', source)),
            key=lambda item: item[0],
        )
        self.assertEqual([index for index, _ in registered], list(range(30)))
        self.assertEqual([name for _, name in registered], list(MTRADERS_STRATEGY_NAMES))
        self.assertRegex(source, r"input bool[ ]+InpTradeEnabled[ ]*=[ ]*false")
        self.assertRegex(source, r"input double[ ]+InpRiskPercent[ ]*=[ ]*1[.]0")
        self.assertRegex(source, r"input double[ ]+InpDailyLossPct[ ]*=[ ]*10[.]0")
        on_tick = re.search(r"void OnTick[(][)][ ]*[{]([^}]*)[}]", source, re.DOTALL)
        self.assertIsNotNone(on_tick)
        self.assertNotRegex(on_tick.group(1), r"(OrderSend|PositionOpen|Buy|Sell)[ ]*[(])
        for forbidden in ("OrderSend(", "PositionOpen(", ".Buy(", ".Sell("):
            self.assertNotIn(forbidden, source)
        init_block = source.split("int OnInit()", 1)[1].split("void OnDeinit", 1)[0]
        self.assertIn("if(InpTradeEnabled)", init_block)
        self.assertIn("return(INIT_FAILED)", init_block)

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


    def test_family_aggregation_counts_one_vote_per_family_and_drops_conflicts(self):
        out = evaluate_hybrid_strategy(approved(candles()))
        module_ids = {item["strategy_id"] for item in out["selected_modules"]}
        family_ids = {item["family_id"] for item in out["selected_families"]}
        self.assertLessEqual(len(family_ids), len(module_ids))
        self.assertEqual(out["strategy_vote_count"], len(out["selected_families"]))
        self.assertEqual(len(family_ids), out["strategy_vote_count"])
        self.assertEqual(out["module_vote_count"], len(out["selected_modules"]))
        self.assertLessEqual(out["strategy_vote_count"], 8)
        self.assertGreater(out["module_vote_count"], out["strategy_vote_count"])

    def test_model_votes_cannot_bypass_strategy_vote_minimum(self):
        out = evaluate_hybrid_strategy(approved(candles()), model_votes={"wave3": {"direction": 1, "score": 1.0}},
                                       minimum_strategy_votes=8)
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


class DecisionContractTests(unittest.TestCase):
    def setUp(self):
        self.result = evaluate_hybrid_strategy(approved(candles()))
        self.kwargs = {"symbol": "XAUUSDm", "timeframe": "H1", "bar_time_utc": "2026-11-11T18:00:00Z"}

    def test_builds_versioned_research_only_contract(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract
        contract = build_research_decision_contract(self.result, **self.kwargs)
        self.assertEqual(contract["schema_version"], "nova.mtraders.decision.v1")
        self.assertEqual(contract["symbol"], "XAUUSDm")
        self.assertTrue(contract["research_only"])
        self.assertFalse(contract["execution_enabled"])
        self.assertFalse(contract["live_trading_enabled"])
        self.assertEqual(len(contract["decision_id"]), 64)

    def test_decision_id_is_deterministic(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract
        first = build_research_decision_contract(self.result, **self.kwargs)
        second = build_research_decision_contract(self.result, **self.kwargs)
        self.assertEqual(first["decision_id"], second["decision_id"])

    def test_rejects_non_utc_timestamp_and_bad_symbol(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract, DecisionContractError
        for kwargs in ({**self.kwargs, "bar_time_utc": "2026-11-11T18:00:00+07:00"},
                       {**self.kwargs, "symbol": "xau/usd"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(DecisionContractError):
                build_research_decision_contract(self.result, **kwargs)

    def test_rejects_execution_enabled_result(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract, DecisionContractError
        unsafe = {**self.result, "execution_enabled": True}
        with self.assertRaises(DecisionContractError):
            build_research_decision_contract(unsafe, **self.kwargs)

    def test_rejects_inconsistent_signal_and_decision(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract, DecisionContractError
        bad = {**self.result, "decision": "LONG_CANDIDATE", "signal": -1, "ensemble_score": 0.8}
        with self.assertRaises(DecisionContractError):
            build_research_decision_contract(bad, **self.kwargs)

    def test_rejects_duplicate_family_votes(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract, DecisionContractError
        bad = {**self.result, "selected_families": [{"family_id": 0}, {"family_id": 0}],
               "strategy_vote_count": 2}
        with self.assertRaises(DecisionContractError):
            build_research_decision_contract(bad, **self.kwargs)


    def test_rejects_directional_candidate_without_two_families(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract, DecisionContractError
        bad = {**self.result, "decision": "LONG_CANDIDATE", "signal": 1,
               "ensemble_score": 0.8, "selected_families": [{"family_id": 0, "direction": 1, "weight": 0.8}],
               "strategy_vote_count": 1}
        with self.assertRaises(DecisionContractError):
            build_research_decision_contract(bad, **self.kwargs)

    def test_rejects_non_finite_score_and_family_weight(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract, DecisionContractError
        for score in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(score=score), self.assertRaises(DecisionContractError):
                build_research_decision_contract({**self.result, "ensemble_score": score}, **self.kwargs)
        for weight in (float("nan"), float("inf"), float("-inf")):
            families = [dict(item) for item in self.result["selected_families"]]
            if not families:
                self.skipTest("fixture has no family votes")
            families[0]["weight"] = weight
            bad = {**self.result, "selected_families": families,
                   "strategy_vote_count": len(families)}
            with self.subTest(weight=weight), self.assertRaises(DecisionContractError):
                build_research_decision_contract(bad, **self.kwargs)

    def test_rejects_invalid_family_vote_shape_and_dataset_hash(self):
        from workers.quant_engine.mtraders_contract import build_research_decision_contract, DecisionContractError
        bad_family = {**self.result, "selected_families": [{"family_id": True, "direction": 1, "weight": 0.8}],
                      "strategy_vote_count": 1}
        with self.assertRaises(DecisionContractError):
            build_research_decision_contract(bad_family, **self.kwargs)
        bad_receipt = {**self.result, "dataset_receipt": {**self.result["dataset_receipt"], "dataset_sha256": "not-a-hash"}}
        with self.assertRaises(DecisionContractError):
            build_research_decision_contract(bad_receipt, **self.kwargs)


if __name__ == "__main__":
    unittest.main(verbosity=2)
