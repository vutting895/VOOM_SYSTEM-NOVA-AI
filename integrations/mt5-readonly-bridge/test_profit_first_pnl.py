"""Tests for fail-closed USD PnL reconciliation."""
import unittest
from profit_first_pnl import PnlReconciliationError, build_net_pnl_snapshot


def build(**overrides):
    args = {
        "account_environment": "EXNESS_DEMO",
        "account_currency": "EUR",
        "currency_to_usd_rate": "1.10",
        "fx_rate_status": "verified",
        "deal_history_complete": True,
        "deal_history_truncated": False,
        "positions": [{"identifier": 1001, "profit": "10", "swap": "-1"}],
        "deals": [
            {"ticket": 1, "position_id": 1001, "profit": "2", "commission": "-0.5", "swap": "0", "fee": "-0.1"},
            {"ticket": 2, "position_id": 9999, "profit": "500", "commission": "0", "swap": "0", "fee": "0"},
        ],
    }
    args.update(overrides)
    return build_net_pnl_snapshot(**args)


class NetPnlTests(unittest.TestCase):
    def test_aggregates_active_position_and_associated_deals_only(self):
        result = build()
        # (floating 9 + realized 2 - commission .5 - fee .1) * 1.10
        self.assertEqual(result["net_pnl_account_currency"], "10.4")
        self.assertEqual(result["net_pnl_usd"], "11.440")
        self.assertEqual(result["currency_normalization_status"], "verified")

    def test_usd_account_uses_identity_rate(self):
        result = build(account_currency="USD", currency_to_usd_rate="1")
        self.assertEqual(result["net_pnl_usd"], "10.4")

    def test_non_demo_rejected(self):
        with self.assertRaises(PnlReconciliationError):
            build(account_environment="EXNESS_LIVE")

    def test_unverified_fx_rejected(self):
        with self.assertRaises(PnlReconciliationError):
            build(fx_rate_status="stale")

    def test_incomplete_or_truncated_history_rejected(self):
        for changes in ({"deal_history_complete": False}, {"deal_history_truncated": True}):
            with self.subTest(changes=changes), self.assertRaises(PnlReconciliationError):
                build(**changes)

    def test_invalid_fx_rate_rejected(self):
        for rate in ("0", "-1", "NaN", "inf"):
            with self.subTest(rate=rate), self.assertRaises(PnlReconciliationError):
                build(currency_to_usd_rate=rate)

    def test_duplicate_position_or_deal_ids_rejected(self):
        with self.assertRaises(PnlReconciliationError):
            build(positions=[{"identifier": 1001, "profit": "1", "swap": "0"}] * 2)
        duplicate = [
            {"ticket": 1, "position_id": 1001},
            {"ticket": 1, "position_id": 1001},
        ]
        with self.assertRaises(PnlReconciliationError):
            build(deals=duplicate)

    def test_missing_or_nonfinite_money_rejected(self):
        with self.assertRaises(PnlReconciliationError):
            build(positions=[{"identifier": 1001, "profit": "NaN", "swap": "0"}])
        with self.assertRaises(PnlReconciliationError):
            build(deals=[{"ticket": 1, "position_id": 1001, "profit": "1", "commission": "inf"}])


if __name__ == "__main__":
    unittest.main()
