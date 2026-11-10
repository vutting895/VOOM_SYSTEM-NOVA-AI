"""Tests for fail-closed USD PnL reconciliation and history coverage."""
import unittest

from profit_first_pnl import PnlReconciliationError, build_net_pnl_snapshot


def chunk(
    start="2026-11-10T00:00:00+00:00",
    end="2026-11-11T00:00:00+00:00",
    **overrides,
):
    deals = [
        {
            "ticket": 1,
            "position_id": 1001,
            "entry": 1,
            "time": "2026-11-10T02:00:00+00:00",
            "profit": "2",
            "commission": "-0.5",
            "swap": "0",
            "fee": "-0.1",
        },
        {
            "ticket": 2,
            "position_id": 9999,
            "entry": 0,
            "time": "2026-11-10T03:00:00+00:00",
            "profit": "500",
            "commission": "0",
            "swap": "0",
            "fee": "0",
        },
    ]
    item = {
        "from_time": start,
        "to_time": end,
        "truncated": False,
        "count": len(deals),
        "account_environment": "EXNESS_DEMO",
        "account_login": 123456,
        "account_server": "Exness-MT5Trial",
        "currency": "EUR",
        "deals": deals,
    }
    item.update(overrides)
    return item


def snapshot(currency="EUR", positions=None, **overrides):
    selected = positions if positions is not None else [
        {
            "identifier": 1001,
            "time": "2026-11-10T01:00:00+00:00",
            "profit": "10",
            "swap": "-1",
        }
    ]
    item = {
        "positions": selected,
        "count": len(selected),
        "truncated": False,
        "account_environment": "EXNESS_DEMO",
        "currency": currency,
        "account_login": 123456,
        "account_server": "Exness-MT5Trial",
        "mode": "read-only",
        "order_submission_enabled": False,
        "as_of": "2026-11-11T00:00:00+00:00",
    }
    item.update(overrides)
    return item


def build(**overrides):
    args = {
        "currency_to_usd_rate": "1.10",
        "fx_rate_status": "verified",
        "positions_snapshot": snapshot(),
        "deal_history_chunks": [chunk()],
    }
    args.update(overrides)
    return build_net_pnl_snapshot(**args)


class NetPnlTests(unittest.TestCase):
    def test_aggregates_active_position_and_associated_deals_only(self):
        result = build()
        self.assertEqual(result["net_pnl_account_currency"], "10.4")
        self.assertEqual(result["net_pnl_usd"], "11.440")
        self.assertTrue(result["deal_history_coverage_verified"])

    def test_closed_deal_swap_is_added_to_open_position_swap(self):
        data = chunk()
        data["deals"][0]["swap"] = "-3"
        self.assertEqual(build(deal_history_chunks=[data])["net_pnl_account_currency"], "7.4")

    def test_open_entry_swap_is_not_double_counted_with_position_snapshot(self):
        data = chunk()
        data["deals"][0]["entry"] = 0  # DEAL_ENTRY_IN
        data["deals"][0]["swap"] = "-3"
        self.assertEqual(build(deal_history_chunks=[data])["net_pnl_account_currency"], "10.4")

    def test_reversal_entry_swap_is_included(self):
        data = chunk()
        data["deals"][0]["entry"] = 2  # DEAL_ENTRY_INOUT
        data["deals"][0]["swap"] = "-3"
        self.assertEqual(build(deal_history_chunks=[data])["net_pnl_account_currency"], "7.4")

    def test_close_by_entry_swap_is_included(self):
        data = chunk()
        data["deals"][0]["entry"] = 3  # DEAL_ENTRY_OUT_BY
        data["deals"][0]["swap"] = "-3"
        self.assertEqual(build(deal_history_chunks=[data])["net_pnl_account_currency"], "7.4")

    def test_missing_or_invalid_deal_entry_fails_closed(self):
        for entry in (None, -1, True, 1.5):
            data = chunk()
            if entry is None:
                del data["deals"][0]["entry"]
            else:
                data["deals"][0]["entry"] = entry
            with self.subTest(entry=entry), self.assertRaises(PnlReconciliationError):
                build(deal_history_chunks=[data])

    def test_usd_account_uses_identity_rate(self):
        self.assertEqual(
            build(positions_snapshot=snapshot(currency="USD"), currency_to_usd_rate="1")["net_pnl_usd"],
            "10.4",
        )

    def test_non_demo_and_unverified_fx_rejected(self):
        cases = [
            {"positions_snapshot": snapshot(account_environment="EXNESS_LIVE")},
            {"fx_rate_status": "stale"},
            {"deal_history_chunks": [chunk(account_environment="EXNESS_LIVE")]},
        ]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(PnlReconciliationError):
                build(**changes)

    def test_positions_snapshot_must_be_complete_and_read_only(self):
        cases = [
            {"positions_snapshot": None},
            {"positions_snapshot": snapshot(truncated=True)},
            {"positions_snapshot": snapshot(count=999)},
            {"positions_snapshot": snapshot(order_submission_enabled=True)},
            {"positions_snapshot": snapshot(mode="trading")},
            {"positions_snapshot": snapshot(account_login=True)},
            {"positions_snapshot": snapshot(as_of="2026-11-11T00:00:00")},
        ]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(PnlReconciliationError):
                build(**changes)

    def test_history_gap_overlap_truncation_and_identity_mismatch_rejected(self):
        cases = [
            {"deal_history_chunks": [chunk(end="2026-11-10T23:00:00+00:00")]},
            {"deal_history_chunks": [chunk(start="2026-11-09T23:00:00+00:00"), chunk()]},
            {"deal_history_chunks": [chunk(truncated=True)]},
            {"deal_history_chunks": [chunk(account_login=999)]},
            {"deal_history_chunks": [chunk(account_server="Other-Server")]},
            {"deal_history_chunks": [chunk(currency="USD")]},
        ]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(PnlReconciliationError):
                build(**changes)

    def test_chunks_must_be_contiguous_and_cover_full_position_lifetime(self):
        first = chunk(
            "2026-11-04T00:00:00+00:00",
            "2026-11-07T00:00:00+00:00",
            deals=[],
            count=0,
        )
        second = chunk(
            "2026-11-07T00:00:00+00:00",
            "2026-11-11T00:00:00+00:00",
            deals=[],
            count=0,
        )
        two_chunks = [first, second]
        result = build(
            positions_snapshot=snapshot(positions=[
                {
                    "identifier": 1001,
                    "time": "2026-11-04T01:00:00+00:00",
                    "profit": "10",
                    "swap": "-1",
                }
            ]),
            deal_history_chunks=two_chunks,
        )
        self.assertTrue(result["deal_history_coverage_verified"])
        with self.assertRaises(PnlReconciliationError):
            build(
                positions_snapshot=snapshot(positions=[
                    {
                        "identifier": 1001,
                        "time": "2026-11-03T23:00:00+00:00",
                        "profit": "10",
                        "swap": "-1",
                    }
                ]),
                deal_history_chunks=two_chunks,
            )

    def test_each_chunk_maximum_seven_days(self):
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[chunk("2026-11-03T00:00:00+00:00", "2026-11-11T00:00:00+00:00")])

    def test_empty_positions_still_require_history_through_snapshot(self):
        self.assertEqual(
            build(positions_snapshot=snapshot(positions=[]))["active_position_count"],
            0,
        )
        with self.assertRaises(PnlReconciliationError):
            build(
                positions_snapshot=snapshot(positions=[]),
                deal_history_chunks=[chunk(end="2026-11-10T23:00:00+00:00")],
            )

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
            build(positions_snapshot=snapshot(positions=[
                {
                    "identifier": 1001,
                    "time": "2026-11-10T01:00:00+00:00",
                    "profit": "1",
                    "swap": "0",
                },
                {
                    "identifier": 1001,
                    "time": "2026-11-10T02:00:00+00:00",
                    "profit": "1",
                    "swap": "0",
                },
            ]))
        duplicate = chunk()
        duplicate["deals"].append(dict(duplicate["deals"][0]))
        duplicate["count"] = len(duplicate["deals"])
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[duplicate])

    def test_nonzero_unattributed_account_level_deal_fails_closed(self):
        data = chunk()
        data["deals"].insert(0, {
            "ticket": 3,
            "position_id": 0,
            "time": "2026-11-10T02:30:00+00:00",
            "profit": "0",
            "commission": "-1",
            "swap": "0",
            "fee": "0",
        })
        data["count"] = len(data["deals"])
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[data])

    def test_active_position_deal_before_its_open_time_fails_closed(self):
        data = chunk()
        data["deals"][0]["time"] = "2026-11-10T00:30:00+00:00"
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[data])

    def test_future_dated_position_is_rejected(self):
        with self.assertRaises(PnlReconciliationError):
            build(positions_snapshot=snapshot(positions=[
                {
                    "identifier": 1001,
                    "time": "2026-11-11T00:00:01+00:00",
                    "profit": "1",
                    "swap": "0",
                }
            ]))

    def test_identity_fields_reject_bool_and_float_values(self):
        with self.assertRaises(PnlReconciliationError):
            build(positions_snapshot=snapshot(account_login=True))
        with self.assertRaises(PnlReconciliationError):
            build(positions_snapshot=snapshot(positions=[
                {
                    "identifier": 1001.5,
                    "time": "2026-11-10T01:00:00+00:00",
                    "profit": "1",
                    "swap": "0",
                }
            ]))
        bad = chunk()
        bad["deals"][0]["ticket"] = True
        with self.assertRaises(PnlReconciliationError):
            build(deal_history_chunks=[bad])


if __name__ == "__main__":
    unittest.main()
