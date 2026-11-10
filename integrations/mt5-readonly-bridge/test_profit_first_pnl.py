"""Tests for fail-closed USD PnL reconciliation and history coverage."""
import unittest
from profit_first_pnl import PnlReconciliationError, build_net_pnl_snapshot


def chunk(start="2026-11-10T00:00:00+00:00", end="2026-11-11T00:00:00+00:00", **overrides):
    deals = [
        {"ticket": 1, "position_id": 1001, "time": "2026-11-10T02:00:00+00:00",
         "profit": "2", "commission": "-0.5", "swap": "0", "fee": "-0.1"},
        {"ticket": 2, "position_id": 9999, "time": "2026-11-10T03:00:00+00:00",
         "profit": "500", "commission": "0", "swap": "0", "fee": "0"},
    ]
    item = {
        "from_time": start, "to_time": end, "truncated": False, "count": len(deals),
        "account_login": 123456, "account_server": "Exness-MT5Trial", "currency": "EUR", "deals": deals,
    }
    item.update(overrides)
    return item


def build(**overrides):
    args = {
        "account_environment": "EXNESS_DEMO",
        "account_currency": "EUR",
        "currency_to_usd_rate": "1.10",
        "fx_rate_status": "verified",
        "account_login": 123456,
        "account_server": "Exness-MT5Trial",
        "snapshot_as_of": "2026-11-11T00:00:00+00:00",
        "deal_history_chunks": [chunk()],
        "positions": [{
            "identifier": 1001, "time": "2026-11-10T01:00:00+00:00",
            "profit": "10", "swap": "-1",
        }],
    }
    args.update(overrides)
    return build_net_pnl_snapshot(**args)


class NetPnlTests(unittest.TestCase):
    def test_aggregates_active_position_and_associated_deals_only(self):
        result = build()
        self.assertEqual(result["net_pnl_account_currency"], "10.4")
        self.assertEqual(result["net_pnl_usd"], "11.440")
        self.assertTrue(result["deal_history_coverage_verified"])

    def test_deal_swap_is_not_double_counted_with_open_position_swap(self):
        data = chunk()
        data["deals"][0]["swap"] = "-3"
        self.assertEqual(build(deal_history_chunks=[data])["net_pnl_account_currency"], "10.4")

    def test_usd_account_uses_identity_rate(self):
        self.assertEqual(build(account_currency="USD", currency_to_usd_rate="1")["net_pnl_usd"], "10.4")

    def test_non_demo_and_unverified_fx_rejected(self):
        for changes in ({"account_environment": "EXNESS_LIVE"}, {"fx_rate_status": "stale"}):
            with self.subTest(changes=changes), self.assertRaises(PnlReconciliationError):
                build(**changes)

    def test_history_gap_overlap_truncation_and_identity_mismatch_rejected(self):
        cases = [
            {"deal_history_chunks": [chunk(end="2026-11-10T23:00:00+00:00")]},
            {"deal_history_chunks": [chunk(start="2026-11-09T23:00:00+00:00"), chunk()]},
            {"deal_history_chunks": [chunk(truncated=True)]},
            {"deal_history_chunks": [chunk(account_login=999)]},
            {"deal_history_chunks": [chunk(account_server="Other-Server")]},
        ]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(PnlReconciliationError):
                build(**changes)

    def test_chunks_must_be_contiguous_and_cover_full_position_lifetime(self):
        first = chunk("2026-11-04T00:00:00+00:00", "2026-11-07T00:00:00+00:00", deals=[])
        second = chunk("2026-11-07T00:00:00+00:00", "2026-11-11T00:00:00+00:00", deals=[])
        two_chunks = [first, second]
        result = build(
            positions=[{"identifier": 1001, "time": "2026-11-04T01:00:00+00:00", "profit": "10", "swap": "-1"}],
            deal_history_chunks=two_chunks,
        )
        self.assertTrue(result["deal_history_coverage_verified"])
        with self.assertRaises(PnlReconciliationError):
            build(positions=[{"identifier": 1001, "time": "2026-11-03T23:00:00+00:00", "profit": "10", "swap": "-1"}],
                  deal_history_chunks=two_chunks)

    def test_each_chunk_maximum_seven_days(self):
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[chunk("2026-11-03T00:00:00+00:00", "2026-11-11T00:00:00+00:00")])

    def test_empty_positions_still_require_history_through_snapshot(self):
        self.assertEqual(build(positions=[], deal_history_chunks=[chunk()])["active_position_count"], 0)
        with self.assertRaises(PnlReconciliationError):
            build(positions=[], deal_history_chunks=[chunk(end="2026-11-10T23:00:00+00:00")])

    def test_chunk_count_must_match_attached_deals(self):
        bad = chunk(count=0)
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[bad])
        bad = chunk()
        bad["deals"] = []
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[bad])

    def test_deal_outside_declared_chunk_rejected(self):
        bad = chunk()
        bad["deals"][0]["time"] = "2026-11-09T23:59:59+00:00"
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[bad])

    def test_invalid_fx_and_missing_deal_fields_rejected(self):
        for rate in ("0", "-1", "NaN", "inf"):
            with self.subTest(rate=rate), self.assertRaises(PnlReconciliationError):
                build(currency_to_usd_rate=rate)
        bad = chunk()
        del bad["deals"][0]["fee"]
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[bad])

    def test_duplicate_position_or_deal_ids_rejected(self):
        with self.assertRaises(PnlReconciliationError):
            build(positions=[
                {"identifier": 1001, "time": "2026-11-10T01:00:00+00:00", "profit": "1", "swap": "0"},
                {"identifier": 1001, "time": "2026-11-10T02:00:00+00:00", "profit": "1", "swap": "0"},
            ])
        duplicate = chunk()
        duplicate["deals"].append(dict(duplicate["deals"][0]))
        duplicate["count"] = len(duplicate["deals"])
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[duplicate])


    def test_reported_chunk_counts_must_match_returned_deals(self):
        with self.assertRaises(PnlReconciliationError):
            build(deals=[])

    def test_deal_currency_must_match_account_currency(self):
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[chunk(currency="USD")])

    def test_nonzero_unattributed_account_level_deal_fails_closed(self):
        deals = [
            {"ticket": 1, "position_id": 0, "time": "2026-11-10T02:00:00+00:00", "profit": "0", "commission": "-1", "swap": "0", "fee": "0"},
            {"ticket": 2, "position_id": 1001, "time": "2026-11-10T03:00:00+00:00", "profit": "2", "commission": "-0.5", "swap": "0", "fee": "-0.1"},
        ]
        with self.assertRaises(PnlReconciliationError):
            build(deals=deals)

    def test_deal_timestamp_outside_snapshot_window_fails_closed(self):
        deals = [
            {"ticket": 1, "position_id": 1001, "time": "2026-11-09T23:59:59+00:00", "profit": "2", "commission": "-0.5", "swap": "0", "fee": "-0.1"},
            {"ticket": 2, "position_id": 9999, "time": "2026-11-10T03:00:00+00:00", "profit": "500", "commission": "0", "swap": "0", "fee": "0"},
        ]
        with self.assertRaises(PnlReconciliationError):
            build(deals=deals)


if __name__ == "__main__":
    unittest.main()
