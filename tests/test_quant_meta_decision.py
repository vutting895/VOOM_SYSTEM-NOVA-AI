import unittest

from workers.quant_engine.meta_decision import MetaDecisionInputError, evaluate_meta_decision
from workers.quant_engine.premium_discount import PremiumDiscountInputError, calculate_premium_discount

SHA = "a" * 64

def vote(direction=1, score=0.9, reliability=0.9):
    return {"direction": direction, "score": score, "calibrated_reliability": reliability,
            "calibration": {"status": "PASS", "method": "walk_forward_oos", "oos_samples": 40,
                            "dataset_sha256": SHA, "evaluator_version": "test-v1"}}

def history(seed=0):
    # Deterministic, varying, mutually independent-ish sequences.
    return [(((i * (seed + 3) + seed * 7) % 97) - 48) / 48 for i in range(40)]

def context(zone="DISCOUNT"):
    return {"zone": zone, "range_id": "H1-001", "timeframe": "H1"}

class PremiumDiscountTests(unittest.TestCase):
    def test_discount_premium_and_equilibrium(self):
        self.assertEqual(calculate_premium_discount(price=25, swing_low=0, swing_high=100,
            range_id="r1", timeframe="H1", swing_confirmed=True, as_of_timestamp="2026-11-12T00:00:00Z", swing_confirmed_at="2026-11-11T22:00:00Z", confirmation_bars=2)["zone"], "DISCOUNT")
        self.assertEqual(calculate_premium_discount(price=75, swing_low=0, swing_high=100,
            range_id="r1", timeframe="H1", swing_confirmed=True, as_of_timestamp="2026-11-12T00:00:00Z", swing_confirmed_at="2026-11-11T22:00:00Z", confirmation_bars=2)["zone"], "PREMIUM")
        self.assertEqual(calculate_premium_discount(price=50, swing_low=0, swing_high=100,
            range_id="r1", timeframe="H1", swing_confirmed=True, as_of_timestamp="2026-11-12T00:00:00Z")["zone"], "EQUILIBRIUM")

    def test_future_confirmation_and_insufficient_right_bars_rejected(self):
        with self.assertRaises(PremiumDiscountInputError):
            calculate_premium_discount(price=50, swing_low=0, swing_high=100, range_id="r1", timeframe="H1", swing_confirmed=True, as_of_timestamp="2026-11-12T00:00:00Z", swing_confirmed_at="2026-11-12T01:00:00Z", confirmation_bars=2)
        with self.assertRaises(PremiumDiscountInputError):
            calculate_premium_discount(price=50, swing_low=0, swing_high=100, range_id="r1", timeframe="H1", swing_confirmed=True, as_of_timestamp="2026-11-12T00:00:00Z", swing_confirmed_at="2026-11-11T22:00:00Z", confirmation_bars=1)

    def test_unconfirmed_range_rejected(self):
        with self.assertRaises(PremiumDiscountInputError):
            calculate_premium_discount(price=50, swing_low=0, swing_high=100, range_id="r1",
                timeframe="H1", swing_confirmed=False, as_of_timestamp="2026-11-12T00:00:00Z", swing_confirmed_at="2026-11-11T22:00:00Z", confirmation_bars=2)

class MetaDecisionTests(unittest.TestCase):
    def test_two_independent_votes_can_form_candidate(self):
        votes = {"lstm": vote(), "xgboost": vote()}
        histories = {"lstm": history(1), "xgboost": history(2)}
        result = evaluate_meta_decision(model_votes=votes, prediction_history=histories, premium_discount=context())
        self.assertEqual(result["decision"], "RESEARCH_CANDIDATE")
        self.assertEqual(result["direction"], 1)
        self.assertFalse(result["live_trading_enabled"])

    def test_highly_correlated_models_count_as_one_cluster(self):
        h = history(1)
        result = evaluate_meta_decision(model_votes={"lstm": vote(), "xgboost": vote()},
            prediction_history={"lstm": h, "xgboost": h}, premium_discount=context())
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "INSUFFICIENT_INDEPENDENT_MODEL_CLUSTERS")

    def test_opposing_models_are_rejected(self):
        result = evaluate_meta_decision(model_votes={"lstm": vote(1), "xgboost": vote(-1)},
            prediction_history={"lstm": history(1), "xgboost": history(2)}, premium_discount=context())
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "MODEL_CONFLICT_EXCEEDS_LIMIT")

    def test_long_signal_in_premium_is_rejected(self):
        result = evaluate_meta_decision(model_votes={"lstm": vote(), "xgboost": vote()},
            prediction_history={"lstm": history(1), "xgboost": history(2)}, premium_discount=context("PREMIUM"))
        self.assertEqual(result["reason"], "PREMIUM_DISCOUNT_CONTEXT_CONFLICT")

    def test_missing_calibration_fails_closed(self):
        with self.assertRaises(MetaDecisionInputError):
            evaluate_meta_decision(model_votes={"lstm": {"direction": 1, "score": .9}},
                prediction_history={"lstm": history(1)}, premium_discount=context())

    def test_bad_vote_and_history_rejected(self):
        with self.assertRaises(MetaDecisionInputError):
            evaluate_meta_decision(model_votes={"lstm": vote(1, 0)},
                prediction_history={"lstm": history(1)}, premium_discount=context())
        with self.assertRaises(MetaDecisionInputError):
            evaluate_meta_decision(model_votes={"lstm": vote(), "xgboost": vote()},
                prediction_history={"lstm": history(1)}, premium_discount=context())

    def test_neutral_vote_not_counted_as_directional_cluster(self):
        result = evaluate_meta_decision(model_votes={"lstm": vote(0, 0), "xgboost": vote()},
            prediction_history={"lstm": history(1), "xgboost": history(2)}, premium_discount=context())
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason"], "INSUFFICIENT_INDEPENDENT_MODEL_CLUSTERS")

if __name__ == "__main__":
    unittest.main(verbosity=2)
