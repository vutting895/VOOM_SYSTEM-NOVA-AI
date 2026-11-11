"""Tests for configurable NOVA aggregate profit target; no broker execution."""
import unittest
from decimal import Decimal

from workers.risk.aggregate_profit_close import (
    AggregateProfitTargetController,
    BasketState,
    PositionProfit,
    ProfitTargetConfig,
    calculate_basket_profit,
    validate_target_usd,
)


def position(position_id="p1", **overrides):
    values = dict(
        position_id=position_id, account_binding="exness-demo:123",
        tenant_id="tenant-a", magic=70001, symbol="XAUUSDm",
        profit=Decimal("120.00"), swap=Decimal("1.00"),
        entry_commission=Decimal("2.00"), exit_cost_estimate=Decimal("4.00"),
        quote_age_seconds=1.0,
    )
    values.update(overrides)
    return PositionProfit(**values)


class TargetValidationTests(unittest.TestCase):
    def test_default_is_one_hundred_usd(self):
        self.assertEqual(ProfitTargetConfig().target_usd, Decimal("100.00"))

    def test_accepts_user_configurable_positive_decimal(self):
        self.assertEqual(validate_target_usd("250.75"), Decimal("250.75"))

    def test_rejects_non_positive_invalid_non_finite_and_over_limit(self):
        for value in (0, -1, "NaN", "Infinity", "abc", True, "1.001", "1000000.01"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_target_usd(value)


class BasketCalculationTests(unittest.TestCase):
    def test_net_profit_includes_profit_swap_and_costs(self):
        result = calculate_basket_profit(
            [position()], config=ProfitTargetConfig(Decimal("100")),
            account_binding="exness-demo:123", tenant_id="tenant-a",
            account_currency="USD", registered_magic_numbers={70001},
        )
        self.assertTrue(result.complete)
        self.assertEqual(result.net_profit_usd, Decimal("115.00"))
        self.assertTrue(result.should_trigger)
        self.assertEqual(result.remaining_usd, Decimal("-15.00"))

    def test_exact_target_triggers_and_below_target_does_not(self):
        exact = position(profit=Decimal("105"), swap=Decimal("1"),
                         entry_commission=Decimal("2"), exit_cost_estimate=Decimal("4"))
        below = position(profit=Decimal("104.99"), swap=Decimal("1"),
                         entry_commission=Decimal("2"), exit_cost_estimate=Decimal("4"))
        args = dict(config=ProfitTargetConfig(Decimal("100")),
                    account_binding="exness-demo:123", tenant_id="tenant-a",
                    account_currency="USD", registered_magic_numbers={70001})
        self.assertTrue(calculate_basket_profit([exact], **args).should_trigger)
        self.assertFalse(calculate_basket_profit([below], **args).should_trigger)

    def test_multiple_symbols_and_strategies_sum_only_registered_nova_positions(self):
        rows = [
            position("a", profit=Decimal("60"), swap=Decimal("0"), entry_commission=Decimal("0"), exit_cost_estimate=Decimal("0")),
            position("b", magic=70002, symbol="EURUSD", profit=Decimal("50"), swap=Decimal("0"), entry_commission=Decimal("0"), exit_cost_estimate=Decimal("0")),
            position("manual", magic=0),
            position("foreign", tenant_id="tenant-b"),
        ]
        result = calculate_basket_profit(
            rows, config=ProfitTargetConfig(Decimal("100")),
            account_binding="exness-demo:123", tenant_id="tenant-a",
            account_currency="USD", registered_magic_numbers={70001, 70002},
        )
        self.assertEqual(result.net_profit_usd, Decimal("110.00"))
        self.assertEqual(set(result.included_position_ids), {"a", "b"})
        self.assertEqual(set(result.excluded_position_ids), {"manual", "foreign"})

    def test_non_usd_stale_quote_or_missing_exit_cost_fails_closed(self):
        base = dict(config=ProfitTargetConfig(Decimal("100")),
                    account_binding="exness-demo:123", tenant_id="tenant-a",
                    registered_magic_numbers={70001})
        for rows, currency in (([position()], "EUR"),
                               ([position(quote_age_seconds=99)], "USD"),
                               ([position(exit_cost_estimate=None)], "USD")):
            result = calculate_basket_profit(rows, account_currency=currency, **base)
            self.assertFalse(result.complete)
            self.assertFalse(result.should_trigger)
            self.assertIsNone(result.net_profit_usd)

    def test_empty_basket_does_not_trigger(self):
        result = calculate_basket_profit(
            [], config=ProfitTargetConfig(), account_binding="exness-demo:123",
            tenant_id="tenant-a", account_currency="USD", registered_magic_numbers={70001},
        )
        self.assertFalse(result.complete)
        self.assertIn("empty_nova_basket", result.reason_codes)


class ControllerTests(unittest.TestCase):
    def test_owner_can_change_target_and_change_is_audited(self):
        controller = AggregateProfitTargetController()
        changed = controller.set_target("250.50", actor_id="owner-1",
                                         account_binding="exness-demo:123",
                                         authorized_owner=True, reason="strategy_setting")
        self.assertEqual(changed.target_usd, Decimal("250.50"))
        self.assertEqual(len(controller.audit_log), 1)
        self.assertEqual(controller.audit_log[0].old_target_usd, Decimal("100.00"))

    def test_non_owner_cannot_change_target(self):
        controller = AggregateProfitTargetController()
        with self.assertRaises(PermissionError):
            controller.set_target(200, actor_id="user-2",
                                  account_binding="exness-demo:123",
                                  authorized_owner=False)

    def test_disabled_by_default_and_no_broker_execution_method(self):
        controller = AggregateProfitTargetController()
        self.assertEqual(controller.state, BasketState.DISABLED)
        self.assertFalse(hasattr(controller, "close_positions"))
        with self.assertRaises(RuntimeError):
            controller.begin_cycle(calculation=None, account_binding="x", tenant_id="y")

    def test_target_change_during_cycle_is_deferred_and_snapshot_is_immutable(self):
        controller = AggregateProfitTargetController(enabled=True)
        calc = calculate_basket_profit(
            [position()], config=controller.config,
            account_binding="exness-demo:123", tenant_id="tenant-a",
            account_currency="USD", registered_magic_numbers={70001},
        )
        cycle = controller.begin_cycle(calculation=calc,
                                       account_binding="exness-demo:123", tenant_id="tenant-a")
        controller.set_target(300, actor_id="owner-1", account_binding="exness-demo:123",
                              authorized_owner=True)
        self.assertEqual(cycle.config.target_usd, Decimal("100.00"))
        self.assertEqual(controller.config.target_usd, Decimal("100.00"))
        self.assertEqual(controller.pending_config.target_usd, Decimal("300.00"))

    def test_cycle_completion_requires_broker_reconciliation(self):
        controller = AggregateProfitTargetController(enabled=True)
        calc = calculate_basket_profit(
            [position()], config=controller.config,
            account_binding="exness-demo:123", tenant_id="tenant-a",
            account_currency="USD", registered_magic_numbers={70001},
        )
        controller.begin_cycle(calculation=calc,
                                account_binding="exness-demo:123", tenant_id="tenant-a")
        controller.set_cycle_state(BasketState.CLOSING)
        controller.set_cycle_state(BasketState.RECONCILING)
        with self.assertRaises(ValueError):
            controller.complete_cycle(broker_confirmed_no_remaining_positions=False)
        controller.complete_cycle(broker_confirmed_no_remaining_positions=True)
        self.assertEqual(controller.config.target_usd, Decimal("100.00"))
        self.assertEqual(controller.state, BasketState.MONITORING)

    def test_invalid_state_transition_is_rejected(self):
        controller = AggregateProfitTargetController(enabled=True)
        with self.assertRaises(RuntimeError):
            controller.set_cycle_state(BasketState.COMPLETED)


if __name__ == "__main__":
    unittest.main(verbosity=2)
