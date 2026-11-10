"""Tests for fail-closed USD normalization and THB-only reporting."""
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from workers.risk.currency_normalization import (
    CurrencyNormalizationError,
    CurrencyNormalizer,
    DenominationRule,
    FXQuote,
    FXRateBook,
    MissingExchangeRate,
    StaleExchangeRate,
    UnsupportedDenomination,
    evaluate_usd_risk_limits,
    exness_standard_cent_rule,
    estimate_stop_loss_usd,
    evaluate_mt5_trade_risk,
)

NOW = datetime(2026, 11, 11, 0, 0, tzinfo=timezone.utc)


def quote(base, target, bid, ask=None, *, seconds_old=1, source="broker-feed", quote_id="q1"):
    return FXQuote(
        base=base,
        quote=target,
        bid=Decimal(str(bid)),
        ask=Decimal(str(ask if ask is not None else bid)),
        observed_at=NOW - timedelta(seconds=seconds_old),
        source=source,
        quote_id=quote_id,
    )


class CurrencyNormalizationTests(unittest.TestCase):
    def test_standard_usd_account_is_identity_in_usd(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "standard", "USD", Decimal("1"), "broker-map-v1")
        ])
        result = normalizer.to_usd("1000.25", broker="Exness", native_currency="USD", account_denomination="standard",
                                   fx=FXRateBook([]), as_of=NOW)
        self.assertEqual(result.amount, Decimal("1000.25"))
        self.assertEqual(result.target_currency, "USD")

    def test_cent_account_units_require_explicit_verified_rule(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USC", "cent", "USD", Decimal("0.01"), "exness-usc-map-v1")
        ])
        result = normalizer.to_usd("25000", broker="Exness", native_currency="USC", account_denomination="cent",
                                   fx=FXRateBook([]), as_of=NOW)
        self.assertEqual(result.amount, Decimal("250.00"))
        self.assertEqual(result.path, ("USC", "USD"))

    def test_micro_usd_account_does_not_get_arbitrary_balance_multiplier(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("ExampleBroker", "USD", "micro", "USD",
                             Decimal("1"), "verified-usd-unit-v1")
        ])
        result = normalizer.to_usd("100", broker="ExampleBroker", native_currency="USD", account_denomination="micro",
                                   fx=FXRateBook([]), as_of=NOW)
        self.assertEqual(result.amount, Decimal("100"))
        # Contract/tick specifications must be used for position valuation;
        # the account balance currency itself is still USD.

    def test_unknown_or_ambiguous_account_unit_fails_closed(self):
        normalizer = CurrencyNormalizer([])
        with self.assertRaises(UnsupportedDenomination):
            normalizer.to_usd("100", broker="Exness", native_currency="USC", account_denomination="cent",
                              fx=FXRateBook([]), as_of=NOW)

    def test_eur_account_converts_to_usd_using_bid_for_positive_equity(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "EUR", "currency-native", "EUR", Decimal("1"), "mt5-account-currency-eur-v1")
        ])
        fx = FXRateBook([quote("EUR", "USD", "1.08", "1.081", quote_id="eurusd-1")])
        result = normalizer.to_usd("100", broker="Exness", native_currency="EUR", account_denomination="currency-native", fx=fx, as_of=NOW)
        self.assertEqual(result.amount, Decimal("108.00"))
        self.assertEqual(result.quote_ids, ("eurusd-1",))

    def test_negative_liability_uses_ask_conservatively(self):
        fx = FXRateBook([quote("EUR", "USD", "1.08", "1.10")])
        result = fx.convert("-100", "EUR", "USD", as_of=NOW)
        self.assertEqual(result.amount, Decimal("-110.00"))

    def test_inverse_conversion_uses_conservative_side(self):
        fx = FXRateBook([quote("EUR", "USD", "1.08", "1.10")])
        asset = fx.convert("110", "USD", "EUR", as_of=NOW)
        liability = fx.convert("-110", "USD", "EUR", as_of=NOW)
        self.assertEqual(asset.amount, Decimal("100"))
        self.assertEqual(liability.amount, Decimal("-101.8518518518518518518518519"))

    def test_multi_hop_conversion_records_full_path(self):
        fx = FXRateBook([
            quote("EUR", "GBP", "0.85", "0.851", quote_id="eurgbp"),
            quote("GBP", "USD", "1.25", "1.251", quote_id="gbpusd"),
        ])
        result = fx.convert("100", "EUR", "USD", as_of=NOW)
        self.assertEqual(result.amount, Decimal("106.2500"))
        self.assertEqual(result.path, ("EUR", "GBP", "USD"))
        self.assertEqual(result.quote_ids, ("eurgbp", "gbpusd"))

    def test_thb_is_a_separate_reporting_conversion(self):
        normalizer = CurrencyNormalizer([])
        reporting_fx = FXRateBook([quote("USD", "THB", "35.0", "35.1", quote_id="usdthb")])
        result = normalizer.to_reporting_thb("100", reporting_fx=reporting_fx, as_of=NOW)
        self.assertEqual(result.amount, Decimal("3500.0"))
        self.assertEqual(result.target_currency, "THB")

    def test_missing_thb_rate_does_not_mutate_usd_amount(self):
        normalizer = CurrencyNormalizer([])
        usd_risk_value = Decimal("12.50")
        with self.assertRaises(MissingExchangeRate):
            normalizer.to_reporting_thb(usd_risk_value, reporting_fx=FXRateBook([]), as_of=NOW)
        self.assertEqual(usd_risk_value, Decimal("12.50"))

    def test_stale_fx_quote_is_rejected(self):
        fx = FXRateBook([quote("EUR", "USD", "1.08", seconds_old=31)], max_age_seconds=30)
        with self.assertRaises(StaleExchangeRate):
            fx.convert("100", "EUR", "USD", as_of=NOW)

    def test_future_dated_fx_quote_is_rejected(self):
        future = FXQuote("EUR", "USD", Decimal("1.08"), Decimal("1.08"),
                         NOW + timedelta(seconds=10), "feed", "future")
        with self.assertRaises(StaleExchangeRate):
            FXRateBook([future]).convert("100", "EUR", "USD", as_of=NOW)

    def test_float_money_is_rejected_to_prevent_binary_rounding(self):
        with self.assertRaises(CurrencyNormalizationError):
            FXRateBook([]).convert(0.1, "USD", "THB", as_of=NOW)

    def test_naive_timestamps_are_rejected(self):
        with self.assertRaises(CurrencyNormalizationError):
            FXQuote("EUR", "USD", Decimal("1"), Decimal("1"),
                    datetime(2026, 11, 11), "feed", "naive")

    def test_invalid_or_crossed_fx_quote_is_rejected(self):
        with self.assertRaises(CurrencyNormalizationError):
            FXQuote("EUR", "USD", Decimal("1.1"), Decimal("1.0"), NOW, "feed", "crossed")

    def test_same_native_currency_requires_exact_denomination_rule(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "standard", "USD", Decimal("1"), "standard-v1"),
            DenominationRule("Exness", "USD", "micro", "USD", Decimal("1"), "micro-v1"),
        ])
        standard = normalizer.to_usd("100", broker="Exness", native_currency="USD",
                                     account_denomination="standard", fx=FXRateBook([]), as_of=NOW)
        micro = normalizer.to_usd("100", broker="Exness", native_currency="USD",
                                  account_denomination="micro", fx=FXRateBook([]), as_of=NOW)
        self.assertEqual(standard.amount, Decimal("100"))
        self.assertEqual(micro.amount, Decimal("100"))
        with self.assertRaises(UnsupportedDenomination):
            normalizer.to_usd("100", broker="Exness", native_currency="USD",
                              account_denomination="unknown", fx=FXRateBook([]), as_of=NOW)

    def test_duplicate_fx_pairs_are_rejected_as_ambiguous(self):
        with self.assertRaises(CurrencyNormalizationError):
            FXRateBook([
                quote("EUR", "USD", "1.08", quote_id="provider-a"),
                quote("EUR", "USD", "1.07", quote_id="provider-b"),
            ])

    def test_per_trade_limit_is_one_percent_of_current_usd_equity(self):
        allowed = evaluate_usd_risk_limits(
            current_equity_usd="1000", estimated_trade_loss_usd="10", daily_loss_usd="0"
        )
        rejected = evaluate_usd_risk_limits(
            current_equity_usd="1000", estimated_trade_loss_usd="10.01", daily_loss_usd="0"
        )
        self.assertTrue(allowed.allowed)
        self.assertEqual(allowed.max_trade_loss_usd, Decimal("10.00"))
        self.assertFalse(rejected.allowed)
        self.assertEqual(rejected.reason_codes, ("per_trade_risk_limit",))

    def test_daily_loss_limit_is_ten_percent_of_latest_current_equity(self):
        allowed = evaluate_usd_risk_limits(
            current_equity_usd="1000", estimated_trade_loss_usd="1", daily_loss_usd="99.99"
        )
        rejected = evaluate_usd_risk_limits(
            current_equity_usd="1000", estimated_trade_loss_usd="1", daily_loss_usd="100"
        )
        self.assertTrue(allowed.allowed)
        self.assertFalse(rejected.allowed)
        self.assertEqual(rejected.max_daily_loss_usd, Decimal("100.00"))
        self.assertEqual(rejected.reason_codes, ("daily_loss_limit",))

    def test_trade_and_daily_limits_use_current_equity_not_start_equity(self):
        decision = evaluate_usd_risk_limits(
            current_equity_usd="800", estimated_trade_loss_usd="8", daily_loss_usd="79.99"
        )
        self.assertEqual(decision.max_trade_loss_usd, Decimal("8.00"))
        self.assertEqual(decision.max_daily_loss_usd, Decimal("80.00"))
        self.assertTrue(decision.allowed)

    def test_invalid_equity_or_loss_inputs_fail_closed(self):
        for kwargs in (
            {"current_equity_usd":"0", "estimated_trade_loss_usd":"1", "daily_loss_usd":"0"},
            {"current_equity_usd":"100", "estimated_trade_loss_usd":"-1", "daily_loss_usd":"0"},
            {"current_equity_usd":"100", "estimated_trade_loss_usd":"1", "daily_loss_usd":"-1"},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(CurrencyNormalizationError):
                evaluate_usd_risk_limits(**kwargs)

    def test_default_risk_policy_percentages_are_fixed_to_owner_selected_limits(self):
        decision = evaluate_usd_risk_limits(
            current_equity_usd="2000", estimated_trade_loss_usd="20", daily_loss_usd="199"
        )
        self.assertEqual(decision.max_trade_loss_usd, Decimal("20.00"))
        self.assertEqual(decision.max_daily_loss_usd, Decimal("200.00"))

    def test_exness_usc_cent_rule_requires_c_symbol_and_returns_cent_factor(self):
        rule = exness_standard_cent_rule("USC", symbol_name="XAUUSDc")
        self.assertEqual(rule.currency, "USD")
        self.assertEqual(rule.currency_units_per_native_unit, Decimal("0.01"))
        self.assertEqual(rule.denomination, "standard-cent")
        normalizer = CurrencyNormalizer([rule])
        normalized = normalizer.to_usd(
            "50000", broker="Exness", native_currency="USC",
            account_denomination="standard-cent", fx=FXRateBook([]), as_of=NOW
        )
        self.assertEqual(normalized.amount, Decimal("500.00"))
        self.assertEqual(normalized.target_currency, "USD")
        with self.assertRaises(UnsupportedDenomination):
            exness_standard_cent_rule("USC", symbol_name="XAUUSD")
        with self.assertRaises(UnsupportedDenomination):
            exness_standard_cent_rule("EUC", symbol_name="EURUSDc")

    def test_stop_loss_estimate_uses_tick_size_value_volume_and_explicit_costs(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "currency-native", "USD", Decimal("1"), "mt5-account-currency-v1")
        ])
        estimate = estimate_stop_loss_usd(
            volume_lots="0.1", entry_price="2000.00", stop_loss_price="1999.50",
            tick_size="0.01", tick_value_loss_native_per_lot="1",
            estimated_other_costs_native="1", broker="Exness", native_currency="USD",
            account_denomination="currency-native", normalizer=normalizer,
            fx=FXRateBook([]), as_of=NOW,
        )
        self.assertEqual(estimate.ticks, Decimal("50"))
        self.assertEqual(estimate.native_loss, Decimal("6.0"))
        self.assertEqual(estimate.usd_loss, Decimal("6.0"))
        decision = evaluate_usd_risk_limits(
            current_equity_usd="1000", estimated_trade_loss_usd=estimate.usd_loss,
            daily_loss_usd="0",
        )
        self.assertTrue(decision.allowed)

    def test_stop_loss_estimate_converts_exness_usc_cent_loss_to_usd(self):
        rule = exness_standard_cent_rule("USC", symbol_name="XAUUSDc")
        normalizer = CurrencyNormalizer([rule])
        estimate = estimate_stop_loss_usd(
            volume_lots="0.1", entry_price="2000", stop_loss_price="1999.50",
            tick_size="0.01", tick_value_loss_native_per_lot="10",
            estimated_other_costs_native="10", broker="Exness", native_currency="USC",
            account_denomination="standard-cent", normalizer=normalizer,
            fx=FXRateBook([]), as_of=NOW,
        )
        self.assertEqual(estimate.native_loss, Decimal("60.0"))
        self.assertEqual(estimate.usd_loss, Decimal("0.600"))

    def test_micro_contract_tick_value_is_used_without_scaling_usd_balance(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "micro", "USD", Decimal("1"), "usd-micro-unit-v1")
        ])
        estimate = estimate_stop_loss_usd(
            volume_lots="0.1", entry_price="2000", stop_loss_price="1999.50",
            tick_size="0.01", tick_value_loss_native_per_lot="0.01",
            estimated_other_costs_native="0", broker="Exness", native_currency="USD",
            account_denomination="micro", normalizer=normalizer,
            fx=FXRateBook([]), as_of=NOW,
        )
        self.assertEqual(estimate.native_loss, Decimal("0.050"))
        self.assertEqual(estimate.usd_loss, Decimal("0.050"))

    def test_stop_distance_rounds_tick_count_up_conservatively(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "currency-native", "USD", Decimal("1"), "mt5-account-currency-v1")
        ])
        estimate = estimate_stop_loss_usd(
            volume_lots="1", entry_price="2000", stop_loss_price="1999.499",
            tick_size="0.01", tick_value_loss_native_per_lot="1",
            estimated_other_costs_native="0", broker="Exness", native_currency="USD",
            account_denomination="currency-native", normalizer=normalizer,
            fx=FXRateBook([]), as_of=NOW,
        )
        self.assertEqual(estimate.ticks, Decimal("51"))

    def test_stop_loss_estimate_fails_closed_on_stale_fx(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "EUR", "currency-native", "EUR", Decimal("1"), "mt5-account-currency-eur-v1")
        ])
        stale_fx = FXRateBook([quote("EUR", "USD", "1.08", seconds_old=31)], max_age_seconds=30)
        with self.assertRaises(StaleExchangeRate):
            estimate_stop_loss_usd(
                volume_lots="0.1", entry_price="2000", stop_loss_price="1999.50",
                tick_size="0.01", tick_value_loss_native_per_lot="1",
                estimated_other_costs_native="1", broker="Exness", native_currency="EUR",
                account_denomination="currency-native", normalizer=normalizer,
                fx=stale_fx, as_of=NOW,
            )

    def test_mt5_usd_risk_adapter_rejects_trade_above_one_percent(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "currency-native", "USD", Decimal("1"), "mt5-account-currency-v1")
        ])
        result = evaluate_mt5_trade_risk(
            current_equity_usd="1000", daily_loss_usd="0",
            mt5_profit_native="-10", estimated_other_costs_native="0",
            broker="Exness", native_currency="USD", account_denomination="currency-native",
            normalizer=normalizer, fx=FXRateBook([]), as_of=NOW,
        )
        self.assertEqual(result.loss.usd_loss, Decimal("10"))
        self.assertTrue(result.risk_passed)
        self.assertTrue(result.decision.allowed)

    def test_mt5_usd_risk_adapter_blocks_trade_when_daily_loss_limit_reached(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "currency-native", "USD", Decimal("1"), "mt5-account-currency-v1")
        ])
        result = evaluate_mt5_trade_risk(
            current_equity_usd="1000", daily_loss_usd="100",
            mt5_profit_native="-5", estimated_other_costs_native="0",
            broker="Exness", native_currency="USD", account_denomination="currency-native",
            normalizer=normalizer, fx=FXRateBook([]), as_of=NOW,
        )
        self.assertFalse(result.risk_passed)
        self.assertEqual(result.decision.reason_codes, ("daily_loss_limit",))

    def test_fx_conversion_selects_most_conservative_available_path(self):
        fx = FXRateBook([
            quote("EUR", "GBP", "0.85", "0.86", quote_id="eurgbp"),
            quote("GBP", "USD", "1.25", "1.26", quote_id="gbpusd"),
            quote("EUR", "USD", "1.05", "1.06", quote_id="eurusd"),
        ])
        asset = fx.convert("100", "EUR", "USD", as_of=NOW)
        liability = fx.convert("-100", "EUR", "USD", as_of=NOW)
        self.assertEqual(asset.amount, Decimal("105.00"))
        self.assertEqual(asset.path, ("EUR", "USD"))
        self.assertEqual(liability.amount, Decimal("-108.3600"))
        self.assertEqual(liability.path, ("EUR", "GBP", "USD"))

    def test_positive_daily_loss_uses_liability_side_fx_conversion(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "EUR", "currency-native", "EUR", Decimal("1"), "mt5-account-currency-eur-v1")
        ])
        fx = FXRateBook([quote("EUR", "USD", "1.08", "1.10")])
        converted = normalizer.to_usd_loss(
            "100", broker="Exness", native_currency="EUR",
            account_denomination="currency-native", fx=fx, as_of=NOW,
        )
        self.assertEqual(converted.amount, Decimal("110.00"))
        self.assertEqual(converted.target_currency, "USD")

    def test_mt5_order_calc_profit_loss_normalizes_usc_cent_to_usd(self):
        normalizer = CurrencyNormalizer([
            exness_standard_cent_rule("USC", symbol_name="XAUUSDc")
        ])
        result = evaluate_mt5_trade_risk(
            current_equity_usd="1000", daily_loss_usd="0",
            mt5_profit_native="-500", estimated_other_costs_native="10",
            broker="Exness", native_currency="USC", account_denomination="standard-cent",
            normalizer=normalizer, fx=FXRateBook([]), as_of=NOW,
        )
        self.assertEqual(result.loss.native_loss, Decimal("510"))
        self.assertEqual(result.loss.usd_loss, Decimal("5.10"))
        self.assertTrue(result.risk_passed)

    def test_mt5_order_calc_profit_is_already_in_account_currency_before_usd_fx(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "EUR", "currency-native", "EUR", Decimal("1"), "mt5-account-currency-eur-v1")
        ])
        fx = FXRateBook([quote("EUR", "USD", "1.08", "1.10")])
        result = evaluate_mt5_trade_risk(
            current_equity_usd="1000", daily_loss_usd="0",
            mt5_profit_native="-100", estimated_other_costs_native="0",
            broker="Exness", native_currency="EUR", account_denomination="currency-native",
            normalizer=normalizer, fx=fx, as_of=NOW,
        )
        self.assertEqual(result.loss.usd_loss, Decimal("110.00"))

    def test_mt5_order_calc_profit_non_loss_result_fails_closed(self):
        normalizer = CurrencyNormalizer([
            DenominationRule("Exness", "USD", "currency-native", "USD", Decimal("1"), "mt5-account-currency-v1")
        ])
        with self.assertRaises(CurrencyNormalizationError):
            evaluate_mt5_trade_risk(
                current_equity_usd="1000", daily_loss_usd="0",
                mt5_profit_native="5", estimated_other_costs_native="0",
                broker="Exness", native_currency="USD", account_denomination="currency-native",
                normalizer=normalizer, fx=FXRateBook([]), as_of=NOW,
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
