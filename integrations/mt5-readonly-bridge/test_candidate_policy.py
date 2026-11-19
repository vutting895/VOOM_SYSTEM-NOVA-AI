"""Isolated tests for the owner-approved NOVA candidate-risk policy."""

import unittest
from types import SimpleNamespace

from candidate_policy import (
    MAX_CANDIDATE_RISK_PCT_CURRENT_EQUITY,
    build_structure_atr_stop,
    size_candidate_to_risk_cap,
)


class FakeMT5:
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1

    def __init__(self, *, volume_min=0.01, volume_max=2.0, volume_step=0.01,
                 profit_function=None, symbol_available=True):
        self.info = SimpleNamespace(
            volume_min=volume_min,
            volume_max=volume_max,
            volume_step=volume_step,
        )
        self.profit_function = profit_function
        self.symbol_available = symbol_available
        self.calculation_calls = []

    def symbol_info(self, symbol):
        if not self.symbol_available or symbol != "XAUUSDm":
            return None
        return self.info

    def order_calc_profit(self, side, symbol, volume, entry, stop):
        self.calculation_calls.append((side, symbol, volume, entry, stop))
        if self.profit_function:
            return self.profit_function(side, symbol, volume, entry, stop)
        return -abs(entry - stop) * volume * 100.0


class StructureAtrStopTests(unittest.TestCase):
    def test_buy_stop_is_beyond_structure_and_rounded_down_to_tick(self):
        result = build_structure_atr_stop(
            side="BUY",
            entry_price=100.0,
            structure_invalidation_price=99.0,
            atr_value=2.0,
            atr_buffer_multiplier=0.5,
            tick_size=0.1,
        )
        self.assertTrue(result["complete"])
        self.assertEqual(result["raw_stop_loss_price"], 98.0)
        self.assertEqual(result["stop_loss_price"], 98.0)
        self.assertFalse(result["execution_authorized"])

    def test_sell_stop_is_beyond_structure_and_rounded_up_to_tick(self):
        result = build_structure_atr_stop(
            side="SELL",
            entry_price=100.0,
            structure_invalidation_price=101.0,
            atr_value=1.9,
            atr_buffer_multiplier=0.5,
            tick_size=0.1,
        )
        self.assertTrue(result["complete"])
        self.assertEqual(result["raw_stop_loss_price"], 101.95)
        self.assertEqual(result["stop_loss_price"], 102.0)

    def test_missing_atr_multiplier_fails_closed_without_a_default(self):
        result = build_structure_atr_stop(
            side="BUY",
            entry_price=100.0,
            structure_invalidation_price=99.0,
            atr_value=1.0,
            atr_buffer_multiplier=None,
            tick_size=0.1,
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "structure_atr_inputs_invalid")

    def test_structure_level_on_wrong_side_of_entry_is_rejected(self):
        result = build_structure_atr_stop(
            side="BUY",
            entry_price=100.0,
            structure_invalidation_price=101.0,
            atr_value=1.0,
            atr_buffer_multiplier=0.5,
            tick_size=0.1,
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "buy_structure_invalidation_must_be_below_entry")


class CandidateSizingTests(unittest.TestCase):
    def test_selects_largest_broker_volume_with_gross_stop_loss_risk_at_or_below_one_percent(self):
        mt5 = FakeMT5()
        result = size_candidate_to_risk_cap(
            mt5,
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=10000.0,
            account_currency="USC",
        )
        self.assertTrue(result["complete"])
        self.assertEqual(result["volume"], 0.5)
        self.assertEqual(result["risk_budget_money"], 100.0)
        self.assertEqual(result["risk_money"], 100.0)
        self.assertEqual(result["risk_pct_current_equity"], 1.0)
        self.assertEqual(result["account_currency"], "USC")
        self.assertEqual(result["risk_budget_pct_current_equity"], 1.0)
        self.assertFalse(result["commission_included"])
        self.assertFalse(result["swap_included"])
        self.assertFalse(result["spread_slippage_gap_costs_included"])
        self.assertFalse(result["all_in_loss_cap_verified"])
        self.assertFalse(result["execution_authorized"])
        self.assertEqual(result["mode"], "isolated_validation_only")
        self.assertGreater(len(mt5.calculation_calls), 0)

    def test_broker_minimum_volume_above_budget_is_rejected(self):
        result = size_candidate_to_risk_cap(
            FakeMT5(),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=100.0,
            account_currency="USD",
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "broker_minimum_volume_exceeds_candidate_risk_cap")

    def test_missing_broker_symbol_metadata_is_rejected(self):
        result = size_candidate_to_risk_cap(
            FakeMT5(symbol_available=False),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=10000.0,
            account_currency="USD",
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "candidate_symbol_unavailable")

    def test_invalid_broker_volume_step_is_rejected(self):
        result = size_candidate_to_risk_cap(
            FakeMT5(volume_step=0.0),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=10000.0,
            account_currency="USD",
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "candidate_volume_spec_unavailable")

    def test_failed_broker_profit_calculation_is_rejected(self):
        result = size_candidate_to_risk_cap(
            FakeMT5(profit_function=lambda *args: None),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=10000.0,
            account_currency="USD",
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "candidate_broker_calculation_failed")

    def test_non_loss_making_stop_calculation_is_rejected(self):
        result = size_candidate_to_risk_cap(
            FakeMT5(profit_function=lambda *args: 10.0),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=10000.0,
            account_currency="USD",
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "candidate_stop_loss_not_loss_making")

    def test_non_monotonic_broker_risk_calculation_is_rejected(self):
        def non_monotonic(side, symbol, volume, entry, stop):
            if volume >= 1.0:
                return -50.0
            return -abs(entry - stop) * volume * 100.0

        result = size_candidate_to_risk_cap(
            FakeMT5(profit_function=non_monotonic),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=10000.0,
            account_currency="USD",
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "candidate_broker_risk_not_monotonic")

    def test_invalid_geometry_or_equity_is_rejected(self):
        bad_geometry = size_candidate_to_risk_cap(
            FakeMT5(),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=101.0,
            current_equity=10000.0,
            account_currency="USD",
        )
        bad_equity = size_candidate_to_risk_cap(
            FakeMT5(),
            symbol="XAUUSDm",
            side="BUY",
            entry_price=100.0,
            stop_loss_price=98.0,
            current_equity=0.0,
            account_currency="USD",
        )
        self.assertFalse(bad_geometry["complete"])
        self.assertEqual(bad_geometry["reason"], "candidate_stop_loss_geometry_invalid")
        self.assertFalse(bad_equity["complete"])
        self.assertEqual(bad_equity["reason"], "candidate_sizing_inputs_must_be_positive")

    def test_policy_cap_is_one_percent_and_not_overridable_by_callers(self):
        self.assertEqual(MAX_CANDIDATE_RISK_PCT_CURRENT_EQUITY, 1.0)


if __name__ == "__main__":
    unittest.main()
