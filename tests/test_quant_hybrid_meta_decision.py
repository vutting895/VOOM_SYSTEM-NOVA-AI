import unittest

from workers.quant_engine.meta_decision import (
    MetaDecisionInputError,
    evaluate_ea_strategy_consensus,
    evaluate_hybrid_meta_decision,
)
from workers.quant_engine.nova_ea_v182_strategy import STRATEGY_FAMILIES

NOW = "2026-11-23T10:05:00Z"
SIGNAL = "2026-11-23T10:00:00Z"
SHA = "a" * 64


def candidate(strategy_id, direction=1, signal_time=SIGNAL, symbol="XAUUSDm", timeframe="M15"):
    entry = 2000.0
    stop = entry - 2.0 if direction > 0 else entry + 2.0
    target = entry + 4.0 if direction > 0 else entry - 4.0
    return {
        "source": "NOVA_EA_v1.82",
        "source_ea_version": "1.82",
        "strategy_id": strategy_id,
        "strategy_family": STRATEGY_FAMILIES[strategy_id],
        "name": f"EA_v1.82_{strategy_id}",
        "status": "RESEARCH_CANDIDATE",
        "direction": direction,
        "symbol": symbol,
        "timeframe": timeframe,
        "signal_time": signal_time,
        "as_of_timestamp": signal_time,
        "entry_reference": entry,
        "stop_reference": stop,
        "target_reference": target,
        "rr": 2.0,
    }


def vote(direction=1):
    return {
        "direction": direction,
        "score": 0.9,
        "calibrated_reliability": 0.9,
        "calibration": {
            "status": "PASS",
            "method": "walk_forward_oos",
            "oos_samples": 40,
            "dataset_sha256": SHA,
            "evaluator_version": "test-v1",
        },
    }


def history(seed=0):
    return [(((i * (seed + 3) + seed * 7) % 97) - 48) / 48 for i in range(40)]


def zone(value="DISCOUNT"):
    return {"zone": value, "range_id": "XAU-H1-001", "timeframe": "H1"}


class EAStrategyConsensusTests(unittest.TestCase):
    def test_two_independent_families_align(self):
        result = evaluate_ea_strategy_consensus(
            strategy_candidates=[candidate(1), candidate(4)],
            symbol="XAUUSDm",
            timeframe="M15",
            current_time=NOW,
            premium_discount=zone(),
        )
        self.assertEqual(result["decision"], "STRATEGY_CANDIDATE")
        self.assertEqual(result["direction"], 1)
        self.assertEqual(result["independent_family_count"], 2)
        self.assertFalse(result["execution_enabled"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertTrue(result["risk_governor_required"])

    def test_two_modules_in_same_family_are_not_independent(self):
        result = evaluate_ea_strategy_consensus(
            strategy_candidates=[candidate(13), candidate(6)],
            symbol="XAUUSDm",
            timeframe="M15",
            current_time=NOW,
            premium_discount=zone(),
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "INSUFFICIENT_INDEPENDENT_STRATEGY_FAMILIES")

    def test_conflicting_modules_inside_one_family_veto(self):
        result = evaluate_ea_strategy_consensus(
            strategy_candidates=[candidate(13, 1), candidate(6, -1), candidate(4, 1)],
            symbol="XAUUSDm",
            timeframe="M15",
            current_time=NOW,
            premium_discount=zone(),
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "INTRA_FAMILY_STRATEGY_CONFLICT")

    def test_conflict_across_families_vetoes(self):
        result = evaluate_ea_strategy_consensus(
            strategy_candidates=[candidate(1, 1), candidate(4, -1)],
            symbol="XAUUSDm",
            timeframe="M15",
            current_time=NOW,
            premium_discount=zone("EQUILIBRIUM"),
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "STRATEGY_CONFLICT_EXCEEDS_LIMIT")

    def test_premium_discount_conflict_vetoes(self):
        result = evaluate_ea_strategy_consensus(
            strategy_candidates=[candidate(1), candidate(4)],
            symbol="XAUUSDm",
            timeframe="M15",
            current_time=NOW,
            premium_discount=zone("PREMIUM"),
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "PREMIUM_DISCOUNT_CONTEXT_CONFLICT")

    def test_all_stale_candidates_are_rejected(self):
        result = evaluate_ea_strategy_consensus(
            strategy_candidates=[candidate(1, signal_time="2026-11-23T09:00:00Z"),
                                 candidate(4, signal_time="2026-11-23T09:00:00Z")],
            symbol="XAUUSDm",
            timeframe="M15",
            current_time=NOW,
            premium_discount=zone(),
            max_signal_age_seconds=900,
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "ALL_EA_CANDIDATES_STALE")

    def test_non_candidate_statuses_do_not_vote(self):
        rows = [candidate(1), candidate(4)]
        for row in rows:
            row["status"] = "NO_SIGNAL"
        result = evaluate_ea_strategy_consensus(
            strategy_candidates=rows,
            symbol="XAUUSDm",
            timeframe="M15",
            current_time=NOW,
            premium_discount=zone(),
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "NO_EA_STRATEGY_CANDIDATES")

    def test_future_timestamp_and_bad_geometry_rejected(self):
        with self.assertRaises(MetaDecisionInputError):
            evaluate_ea_strategy_consensus(
                strategy_candidates=[candidate(1, signal_time="2026-11-23T10:06:00Z")],
                symbol="XAUUSDm", timeframe="M15", current_time=NOW, premium_discount=zone(),
            )
        bad = candidate(1)
        bad["stop_reference"] = 2001.0
        with self.assertRaises(MetaDecisionInputError):
            evaluate_ea_strategy_consensus(
                strategy_candidates=[bad, candidate(4)],
                symbol="XAUUSDm", timeframe="M15", current_time=NOW, premium_discount=zone(),
            )

    def test_wrong_symbol_timeframe_or_family_rejected(self):
        with self.assertRaises(MetaDecisionInputError):
            evaluate_ea_strategy_consensus(
                strategy_candidates=[candidate(1, symbol="EURUSD"), candidate(4)],
                symbol="XAUUSDm", timeframe="M15", current_time=NOW, premium_discount=zone(),
            )
        bad = candidate(1)
        bad["strategy_family"] = "session"
        with self.assertRaises(MetaDecisionInputError):
            evaluate_ea_strategy_consensus(
                strategy_candidates=[bad, candidate(4)],
                symbol="XAUUSDm", timeframe="M15", current_time=NOW, premium_discount=zone(),
            )


class HybridMetaDecisionTests(unittest.TestCase):
    def test_ea_and_calibrated_ml_consensus_must_align(self):
        result = evaluate_hybrid_meta_decision(
            strategy_candidates=[candidate(1), candidate(4)],
            model_votes={"lstm": vote(1), "xgboost": vote(1)},
            prediction_history={"lstm": history(1), "xgboost": history(2)},
            symbol="XAUUSDm", timeframe="M15", current_time=NOW, premium_discount=zone(),
        )
        self.assertEqual(result["decision"], "RESEARCH_CANDIDATE")
        self.assertEqual(result["direction"], 1)
        self.assertEqual(result["reason"], "EA_STRATEGY_AND_CALIBRATED_MODEL_CONSENSUS_ALIGNED")
        self.assertFalse(result["orders_submitted"])
        self.assertFalse(result["execution_enabled"])
        self.assertFalse(result["live_trading_enabled"])

    def test_model_and_strategy_direction_disagreement_vetoes(self):
        result = evaluate_hybrid_meta_decision(
            strategy_candidates=[candidate(1), candidate(4)],
            model_votes={"lstm": vote(-1), "xgboost": vote(-1)},
            prediction_history={"lstm": history(1), "xgboost": history(2)},
            symbol="XAUUSDm", timeframe="M15", current_time=NOW,
            premium_discount=zone("EQUILIBRIUM"),
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "MODEL_STRATEGY_DIRECTION_CONFLICT")

    def test_strategy_gate_blocks_before_model_votes(self):
        result = evaluate_hybrid_meta_decision(
            strategy_candidates=[candidate(13), candidate(6)],
            model_votes={},
            prediction_history={},
            symbol="XAUUSDm", timeframe="M15", current_time=NOW, premium_discount=zone(),
        )
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertTrue(result["reason"].startswith("EA_STRATEGY_GATE_"))
        self.assertIsNone(result["model_evidence"])

    def test_model_gate_requires_oos_calibration(self):
        with self.assertRaises(MetaDecisionInputError):
            evaluate_hybrid_meta_decision(
                strategy_candidates=[candidate(1), candidate(4)],
                model_votes={"lstm": {"direction": 1}, "xgboost": {"direction": 1}},
                prediction_history={"lstm": history(1), "xgboost": history(2)},
                symbol="XAUUSDm", timeframe="M15", current_time=NOW, premium_discount=zone(),
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
