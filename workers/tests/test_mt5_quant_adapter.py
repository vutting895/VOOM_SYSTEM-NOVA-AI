import unittest

from workers.quant.mt5_decision_adapter import evaluate_mt5_event


MODULES = [
    "SuperTrend", "KeltnerBreak", "GoldenCross", "RocSurge", "Alligator",
    "Ichimoku", "AwesomeOsc", "HeikinPower", "PsarDot", "VwapBand",
    "FlowMatrix", "HourBias", "PivotWheel", "SessionHeat", "StructureMap",
    "TrendRadar", "VolRegime-Batch", "EffortResult", "ExpertQEXSweep",
    "FootprintLite", "LiquidityPools", "NeuralPilot", "KillZoneBreak",
    "QEX-LiqSweep", "QEX-VolST", "RangeSniper", "SessionBox", "TrendPilot",
    "VolRegime-QEX", "WyckoffPhase",
]


def make_event(votes=None):
    values = votes or ["BUY"] * 12 + ["SELL"] * 8 + ["NEUTRAL"] * 10
    names = MODULES
    counts = {
        "buy": values.count("BUY"),
        "sell": values.count("SELL"),
        "neutral": values.count("NEUTRAL"),
    }
    return {
        "schema_version": "nova.mt5-event.v2",
        "event_id": "XAUUSDm-PERIOD_M15-1794550000",
        "client_id": "tenant-demo-01",
        "symbol": "XAUUSDm",
        "timeframe": "M15",
        "vote_counts": counts,
        "module_votes": [
            {"module_id": f"M{i:02d}", "module_name": name, "vote": vote}
            for i, (name, vote) in enumerate(zip(names, values), start=1)
        ],
    }


class TestMT5QuantDecisionAdapter(unittest.TestCase):
    def test_maps_all_30_ea_votes_without_claiming_ml_prediction(self):
        event = make_event()
        result = evaluate_mt5_event(event)
        self.assertEqual(result["engine"], "MT5HeuristicConsensusAdapter")
        self.assertEqual(result["event_id"], event["event_id"])
        self.assertEqual(result["client_id"], event["client_id"])
        self.assertEqual(result["module_count"], 30)
        self.assertEqual(result["vote_counts"], {"buy": 12, "sell": 8, "neutral": 10})
        self.assertEqual(result["directional_bias"], "BUY")
        self.assertEqual(result["evaluation_status"], "research_only")
        self.assertFalse(result["trained_model"])
        self.assertEqual(result["score_calibration"], "not_applicable")
        self.assertFalse(result["execution_enabled"])

    def test_rejects_incomplete_or_duplicate_module_inventory(self):
        event = make_event()
        with self.assertRaisesRegex(ValueError, "exactly_30"):
            evaluate_mt5_event({**event, "module_votes": event["module_votes"][:29]})
        duplicate = [*event["module_votes"]]
        duplicate[1] = {**duplicate[1], "module_id": "M01"}
        with self.assertRaisesRegex(ValueError, "duplicate"):
            evaluate_mt5_event({**event, "module_votes": duplicate})

    def test_requires_trusted_client_scope(self):
        event = make_event()
        event.pop("client_id")
        with self.assertRaisesRegex(ValueError, "trusted_client_scope_required"):
            evaluate_mt5_event(event)

    def test_rejects_vote_count_mismatch(self):
        event = make_event()
        event["vote_counts"]["buy"] = 13
        with self.assertRaisesRegex(ValueError, "totals_mismatch"):
            evaluate_mt5_event(event)


if __name__ == "__main__":
    unittest.main()
