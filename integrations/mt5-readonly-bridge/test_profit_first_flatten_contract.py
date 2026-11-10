"""Tests for the non-executing Profit-First Flatten decision contract."""
import unittest

from profit_first_flatten_contract import (
    ProfitFirstFlattenError,
    evaluate_profit_first_flatten,
)


def position(profit="1", swap="0", commission="0", fee="0"):
    return {
        "profit_usd": profit,
        "swap_usd": swap,
        "commission_usd": commission,
        "fee_usd": fee,
    }


def snapshot(positions=None, pending_orders=None, **overrides):
    value = {
        "account_environment": "EXNESS_DEMO",
        "currency_normalization_status": "verified",
        "positions": positions if positions is not None else [],
        "pending_orders": pending_orders if pending_orders is not None else [],
    }
    value.update(overrides)
    return value


class ProfitFirstFlattenContractTests(unittest.TestCase):
    def test_positive_net_after_all_costs_triggers_all_scope(self):
        result = evaluate_profit_first_flatten(snapshot(
            positions=[
                position("12.50", "-0.50", "-1.00", "-0.25"),
                position("4.00", "0", "-0.25", "0"),
            ],
            pending_orders=[{"ticket": 10}],
        ))
        self.assertEqual(result["net_pnl_usd"], "14.5")
        self.assertTrue(result["triggered"])
        self.assertTrue(result["close_positions"])
        self.assertTrue(result["cancel_pending_orders"])
        self.assertFalse(result["execution_performed"])

    def test_fee_can_turn_gross_profit_into_non_positive_net(self):
        result = evaluate_profit_first_flatten(snapshot(
            positions=[position("2.00", "-0.25", "-0.50", "-1.25")],
            pending_orders=[{"ticket": 11}],
        ))
        self.assertEqual(result["net_pnl_usd"], "0.00")
        self.assertFalse(result["triggered"])
        self.assertFalse(result["close_positions"])
        self.assertFalse(result["cancel_pending_orders"])

    def test_zero_or_negative_net_does_not_trigger(self):
        for profit in ("0", "-0.01"):
            with self.subTest(profit=profit):
                result = evaluate_profit_first_flatten(snapshot(
                    positions=[position(profit=profit)],
                    pending_orders=[{"ticket": 12}],
                ))
                self.assertFalse(result["triggered"])
                self.assertFalse(result["close_positions"])
                self.assertFalse(result["cancel_pending_orders"])

    def test_pending_orders_cancel_only_after_positive_net_trigger(self):
        result = evaluate_profit_first_flatten(snapshot(
            positions=[position("1")],
            pending_orders=[{"ticket": 13}, {"ticket": 14}],
        ))
        self.assertTrue(result["close_positions"])
        self.assertTrue(result["cancel_pending_orders"])

    def test_no_positions_means_no_profit_trigger(self):
        result = evaluate_profit_first_flatten(snapshot(
            positions=[],
            pending_orders=[{"ticket": 15}],
        ))
        self.assertEqual(result["net_pnl_usd"], "0")
        self.assertFalse(result["triggered"])
        self.assertFalse(result["cancel_pending_orders"])

    def test_live_or_unverified_account_fails_closed(self):
        for changes in (
            {"account_environment": "EXNESS_LIVE"},
            {"account_environment": "UNKNOWN"},
            {"currency_normalization_status": "unverified"},
        ):
            with self.subTest(changes=changes):
                with self.assertRaises(ProfitFirstFlattenError):
                    evaluate_profit_first_flatten(snapshot(**changes))

    def test_missing_fee_or_other_pnl_component_fails_closed(self):
        invalid = position()
        del invalid["fee_usd"]
        with self.assertRaises(ProfitFirstFlattenError):
            evaluate_profit_first_flatten(snapshot(positions=[invalid]))

    def test_missing_or_non_finite_pnl_fails_closed(self):
        invalid_positions = [
            {"profit_usd": "1", "swap_usd": "0", "commission_usd": "0", "fee_usd": "0"},
            position(profit="NaN"),
            position(profit=True),
        ]
        for item in invalid_positions:
            with self.subTest(position=item):
                with self.assertRaises(ProfitFirstFlattenError):
                    evaluate_profit_first_flatten(snapshot(positions=[item]))

    def test_binary_float_money_values_are_rejected(self):
        with self.assertRaises(ProfitFirstFlattenError):
            evaluate_profit_first_flatten(snapshot(positions=[position(profit=0.1)]))

    def test_invalid_collections_fail_closed(self):
        with self.assertRaises(ProfitFirstFlattenError):
            evaluate_profit_first_flatten(snapshot() | {"positions": None})
        with self.assertRaises(ProfitFirstFlattenError):
            evaluate_profit_first_flatten(snapshot() | {"pending_orders": None})


if __name__ == "__main__":
    unittest.main()
