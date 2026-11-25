import unittest
from copy import deepcopy

from workers.strategy.hybrid_meta_decision import (
    HybridDecisionInputError,
    MODEL_IDS,
    evaluate_hybrid_decision,
)

HASH = "a" * 64
OTHER_HASH = "b" * 64
NOW = "2026-11-13T10:00:00Z"


def context():
    return {
        "mode": "research",
        "symbol": "XAUUSDm",
        "decision_timestamp_utc": NOW,
        "dataset_sha256": HASH,
        "data_quality_status": "PASS",
        "closed_bars_only": True,
        "age_seconds": 5,
        "max_age_seconds": 120,
    }


def evidence():
    rows = []
    directions = {
        "smc": "BUY", "xgboost": "BUY", "lstm": "BUY",
        "vision": "BUY", "mamba": "SELL", "wave": "BUY",
    }
    for model_id in MODEL_IDS:
        common = {
            "model_id": model_id,
            "kind": "deterministic_strategy" if model_id == "smc" else "predictive_model",
            "version": "1.0.0",
            "status": "PASS",
            "direction": directions[model_id],
            "dataset_sha256": HASH,
            "artifact_sha256": HASH,
            "feature_schema_sha256": HASH,
            "as_of_utc": "2026-11-13T09:59:00Z",
            "valid_until_utc": "2026-11-13T10:01:00Z",
            "evaluation_id": f"eval-{model_id}",
        }
        if model_id == "smc":
            common.update({"causal_verified": True, "research_only": True})
        else:
            common.update({
                "independent_cluster": f"cluster-{model_id}",
                "calibrated": True,
                "oof_verified": True,
                "calibration_report_sha256": HASH,
                "oof_report_sha256": HASH,
            })
        rows.append(common)
    return rows


class HybridMetaDecisionTests(unittest.TestCase):
    def test_emits_candidate_when_smc_and_three_independent_oof_models_agree(self):
        result = evaluate_hybrid_decision(context(), evidence())
        self.assertEqual(result["decision"], "BUY_CANDIDATE")
        self.assertEqual(result["status"], "RESEARCH_CANDIDATE")
        self.assertEqual(result["supporting_votes"], 4)
        self.assertEqual(result["independent_supporting_clusters"], 4)
        self.assertFalse(result["orders_enabled"])
        self.assertFalse(result["execution_enabled"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertIsNone(result["risk_budget_pct"])

    def test_abstains_when_smc_has_no_setup(self):
        rows = evidence()
        rows[0]["direction"] = "HOLD"
        result = evaluate_hybrid_decision(context(), rows)
        self.assertEqual(result["decision"], "NO_TRADE")
        self.assertEqual(result["reason_code"], "smc_no_setup")

    def test_abstains_when_fewer_than_three_models_agree(self):
        rows = evidence()
        rows[3]["direction"] = "SELL"
        rows[5]["direction"] = "SELL"
        result = evaluate_hybrid_decision(context(), rows)
        self.assertEqual(result["reason_code"], "insufficient_model_consensus")

    def test_abstains_when_votes_are_not_independent(self):
        rows = evidence()
        for item in rows[1:]:
            item["independent_cluster"] = "same-cluster"
        result = evaluate_hybrid_decision(context(), rows)
        self.assertEqual(result["reason_code"], "insufficient_independent_model_clusters")

    def test_requires_exactly_all_six_models(self):
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), evidence()[:-1])

    def test_rejects_duplicate_model_record(self):
        rows = evidence()
        rows[-1] = deepcopy(rows[1])
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)

    def test_rejects_dataset_hash_mismatch(self):
        rows = evidence()
        rows[2]["dataset_sha256"] = OTHER_HASH
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)

    def test_rejects_uncalibrated_model(self):
        rows = evidence()
        rows[1]["calibrated"] = False
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)

    def test_rejects_model_without_oof_verification(self):
        rows = evidence()
        rows[2]["oof_verified"] = False
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)

    def test_rejects_future_evidence(self):
        rows = evidence()
        rows[4]["as_of_utc"] = "2026-11-13T10:00:01Z"
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)

    def test_rejects_expired_evidence(self):
        rows = evidence()
        rows[1]["valid_until_utc"] = "2026-11-13T09:59:59Z"
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)

    def test_rejects_non_utc_timestamps(self):
        rows = evidence()
        rows[1]["as_of_utc"] = "2026-11-13T17:00:00+07:00"
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)

    def test_rejects_failed_data_quality_or_open_candles(self):
        bad_context = context()
        bad_context["closed_bars_only"] = False
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(bad_context, evidence())

    def test_rejects_stale_data(self):
        bad_context = context()
        bad_context["age_seconds"] = 121
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(bad_context, evidence())

    def test_rejects_non_finite_data_age(self):
        bad_context = context()
        bad_context["age_seconds"] = float("nan")
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(bad_context, evidence())

    def test_rejects_non_research_mode(self):
        bad_context = context()
        bad_context["mode"] = "live"
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(bad_context, evidence())

    def test_rejects_smc_without_causal_research_attestation(self):
        rows = evidence()
        rows[0]["causal_verified"] = False
        with self.assertRaises(HybridDecisionInputError):
            evaluate_hybrid_decision(context(), rows)


if __name__ == "__main__":
    unittest.main(verbosity=2)
