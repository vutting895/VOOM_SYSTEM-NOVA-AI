import unittest

from workers.strategy import (
    ControllerInputError,
    load_strategy_catalog,
    select_research_strategy,
    validate_strategy_catalog,
)


def valid_context(regime="trend"):
    return {
        "mode": "research",
        "symbol": "XAUUSDm",
        "timeframes": {"bias": "H4", "entry": "M5"},
        "regime": regime,
        "data_quality": {
            "status": "PASS",
            "sha256": "a" * 64,
            "closed_bars_only": True,
            "age_seconds": 30,
            "max_age_seconds": 120,
        },
    }


class AdaptiveStrategyControllerTests(unittest.TestCase):
    def setUp(self):
        self.catalog = load_strategy_catalog()

    def test_registry_is_versioned_and_execution_disabled(self):
        self.assertTrue(validate_strategy_catalog(self.catalog))
        for strategy in self.catalog["strategies"]:
            self.assertTrue(strategy["safety"]["research_only"])
            self.assertFalse(strategy["safety"]["trade_authorized"])
            self.assertFalse(strategy["safety"]["orders_enabled"])
            self.assertFalse(strategy["safety"]["execution_enabled"])
            self.assertFalse(strategy["safety"]["live_trading_enabled"])

    def test_selects_smc_for_supported_trend_regime(self):
        result = select_research_strategy(valid_context("trend"), catalog=self.catalog)
        self.assertEqual(result["selected_strategy_id"], "smc-mean-rejection")
        self.assertEqual(result["status"], "RESEARCH_CANDIDATE_SELECTED")
        self.assertIsNone(result["signal"])

    def test_selects_smc_for_supported_transition_regime(self):
        result = select_research_strategy(valid_context("transition"), catalog=self.catalog)
        self.assertEqual(result["selected_strategy_id"], "smc-mean-rejection")

    def test_abstains_for_unsupported_range_regime(self):
        result = select_research_strategy(valid_context("range"), catalog=self.catalog)
        self.assertEqual(result["status"], "NO_ELIGIBLE_STRATEGY")
        self.assertIsNone(result["selected_strategy_id"])

    def test_wave3_remains_blocked(self):
        result = select_research_strategy(valid_context(), catalog=self.catalog)
        wave3 = next(
            item for item in result["rejected_candidates"]
            if item["strategy_id"] == "wave3-v6.2.6.3"
        )
        self.assertEqual(wave3["reason"], "lifecycle:blocked")

    def test_catalog_only_strategy_cannot_be_selected(self):
        result = select_research_strategy(valid_context(), catalog=self.catalog)
        scout = next(
            item for item in result["rejected_candidates"]
            if item["strategy_id"] == "ai-market-scout"
        )
        self.assertEqual(scout["reason"], "lifecycle:catalog-only")

    def test_rejects_unsupported_market(self):
        context = valid_context()
        context["symbol"] = "EURUSD"
        result = select_research_strategy(context, catalog=self.catalog)
        self.assertEqual(result["status"], "NO_ELIGIBLE_STRATEGY")

    def test_rejects_timeframe_mismatch(self):
        context = valid_context()
        context["timeframes"] = {"bias": "H1", "entry": "M5"}
        result = select_research_strategy(context, catalog=self.catalog)
        self.assertEqual(result["status"], "NO_ELIGIBLE_STRATEGY")

    def test_rejects_failed_data_quality(self):
        context = valid_context()
        context["data_quality"]["status"] = "FAIL"
        with self.assertRaises(ControllerInputError):
            select_research_strategy(context, catalog=self.catalog)

    def test_rejects_invalid_dataset_hash(self):
        context = valid_context()
        context["data_quality"]["sha256"] = "not-a-hash"
        with self.assertRaises(ControllerInputError):
            select_research_strategy(context, catalog=self.catalog)

    def test_rejects_forming_bars(self):
        context = valid_context()
        context["data_quality"]["closed_bars_only"] = False
        with self.assertRaises(ControllerInputError):
            select_research_strategy(context, catalog=self.catalog)

    def test_rejects_stale_data(self):
        context = valid_context()
        context["data_quality"]["age_seconds"] = 121
        with self.assertRaises(ControllerInputError):
            select_research_strategy(context, catalog=self.catalog)

    def test_rejects_non_research_mode(self):
        context = valid_context()
        context["mode"] = "live"
        with self.assertRaises(ControllerInputError):
            select_research_strategy(context, catalog=self.catalog)

    def test_supporting_models_never_cast_strategy_votes(self):
        result = select_research_strategy(valid_context(), catalog=self.catalog)
        self.assertFalse(result["supporting_models"]["xgboost"]["signal_vote_enabled"])
        self.assertFalse(result["supporting_models"]["pytorch-lstm"]["signal_vote_enabled"])

    def test_selection_is_deterministic(self):
        first = select_research_strategy(valid_context(), catalog=self.catalog)
        second = select_research_strategy(valid_context(), catalog=self.catalog)
        self.assertEqual(first, second)

    def test_controller_never_authorizes_execution(self):
        result = select_research_strategy(valid_context(), catalog=self.catalog)
        self.assertFalse(result["orders_enabled"])
        self.assertFalse(result["execution_enabled"])
        self.assertFalse(result["live_trading_enabled"])
        self.assertIsNone(result["risk_budget_pct"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
