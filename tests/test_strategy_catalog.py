"""Tests for the shared NOVA strategy catalog and research-run contracts."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from workers.strategy import (
    StrategyCatalogError,
    StrategyNotRunnableError,
    build_strategy_run_spec,
    get_strategy,
    load_strategy_catalog,
    validate_customer_selection,
    validate_strategy_catalog,
)


class StrategyCatalogTests(unittest.TestCase):
    def setUp(self):
        self.catalog = load_strategy_catalog()

    def test_catalog_is_versioned_unique_and_has_three_customer_strategies(self):
        self.assertEqual(self.catalog["schemaVersion"], "nova.strategy-catalog.v1")
        self.assertEqual(
            [item["id"] for item in self.catalog["strategies"]],
            ["smc-precision", "wave3-confluence", "ai-market-scout"],
        )
        self.assertEqual(len({item["id"] for item in self.catalog["strategies"]}), 3)

    def test_all_strategies_are_research_only_and_cannot_trade(self):
        for strategy in self.catalog["strategies"]:
            self.assertTrue(strategy["safety"]["researchOnly"])
            self.assertFalse(strategy["safety"]["tradeAuthorized"])
            self.assertFalse(strategy["safety"]["orderSubmissionEnabled"])
            self.assertFalse(strategy["safety"]["liveTradingEnabled"])

    def test_wave3_remains_blocked_and_unimplemented_on_main(self):
        strategy = get_strategy("wave3-confluence", catalog=self.catalog)
        self.assertEqual(strategy["status"], "blocked")
        self.assertEqual(strategy["engine"]["state"], "branch-only")
        self.assertEqual(strategy["researchOperations"], [])
        with self.assertRaises(StrategyNotRunnableError):
            build_strategy_run_spec(
                {"strategyId": "wave3-confluence", "market": "XAU/USD"},
                "backtest",
                catalog=self.catalog,
            )

    def test_smc_research_run_spec_is_bounded_and_non_executable(self):
        result = build_strategy_run_spec(
            {
                "schemaVersion": "nova.customer-workspace.v1",
                "strategyId": "smc-precision",
                "market": "XAU/USD",
                "riskProfile": "low",
                "analysisStyle": "guided",
            },
            "backtest",
            catalog=self.catalog,
        )
        self.assertEqual(result["schemaVersion"], "nova.strategy-run.v1")
        self.assertEqual(result["engineId"], "smc-wave")
        self.assertTrue(result["researchOnly"])
        self.assertFalse(result["tradeAuthorized"])
        self.assertFalse(result["executionEnabled"])
        self.assertFalse(result["orderSubmissionEnabled"])
        self.assertFalse(result["liveTradingEnabled"])

    def test_market_must_be_supported_by_selected_strategy(self):
        with self.assertRaises(StrategyCatalogError):
            validate_customer_selection(
                {"strategyId": "wave3-confluence", "market": "EUR/USD"},
                catalog=self.catalog,
            )

    def test_selection_rejects_unknown_fields_and_unknown_strategies(self):
        with self.assertRaises(StrategyCatalogError):
            validate_customer_selection(
                {"strategyId": "smc-precision", "tenantId": "attacker-controlled"},
                catalog=self.catalog,
            )
        with self.assertRaises(StrategyCatalogError):
            validate_customer_selection({"strategyId": "unknown-strategy"}, catalog=self.catalog)

    def test_ai_market_scout_is_not_runnable_until_an_adapter_exists(self):
        self.assertEqual(get_strategy("ai-market-scout", catalog=self.catalog)["status"], "catalog-only")
        with self.assertRaises(StrategyNotRunnableError):
            build_strategy_run_spec(
                {"strategyId": "ai-market-scout", "market": "BTC/USDT"},
                "analyze",
                catalog=self.catalog,
            )

    def test_catalog_rejects_any_attempt_to_enable_live_or_order_execution(self):
        unsafe = deepcopy(self.catalog)
        unsafe["strategies"][0]["safety"]["orderSubmissionEnabled"] = True
        with self.assertRaises(StrategyCatalogError):
            validate_strategy_catalog(unsafe)

    def test_catalog_rejects_duplicate_ids_and_unknown_schema_fields(self):
        duplicate = deepcopy(self.catalog)
        duplicate["strategies"].append(deepcopy(duplicate["strategies"][0]))
        with self.assertRaises(StrategyCatalogError):
            validate_strategy_catalog(duplicate)
        extra = deepcopy(self.catalog)
        extra["unexpected"] = True
        with self.assertRaises(StrategyCatalogError):
            validate_strategy_catalog(extra)

    def test_missing_or_invalid_catalog_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.json"
            path.write_text("{bad json", encoding="utf-8")
            with self.assertRaises(StrategyCatalogError):
                load_strategy_catalog(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
