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
            DenominationRule("ExampleBroker", "USD", "micro-contract-account", "USD",
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
            DenominationRule("Exness", "EUR", "standard", "EUR", Decimal("1"), "eur-standard-v1")
        ])
        fx = FXRateBook([quote("EUR", "USD", "1.08", "1.081", quote_id="eurusd-1")])
        result = normalizer.to_usd("100", broker="Exness", native_currency="EUR", account_denomination="standard", fx=fx, as_of=NOW)
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
