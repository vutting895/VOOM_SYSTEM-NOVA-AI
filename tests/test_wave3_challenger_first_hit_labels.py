import unittest
from datetime import datetime, timedelta, timezone

from research.wave3_challenger.first_hit_labels import (
    build_first_hit_labels,
    purge_training_indices,
)


COMMISSION = {
    "commission_per_lot_per_side_usd": 3.5,
    "commission_source": "synthetic_test_fixture_not_broker_evidence",
    "commission_verified": True,
}


def bars(count, *, start=None, spread=0.2, open_price=100.0, high=100.5, low=99.8, close=100.1):
    start = start or datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(count):
        stamp = start + timedelta(minutes=15 * i)
        rows.append({
            "timestamp": stamp.isoformat().replace("+00:00", "Z"),
            "open": open_price,
            "high": high,
            "low": low,
            "close": close,
            "spread_price": spread,
        })
    return rows


class TestFirstHitLabels(unittest.TestCase):
    def build(self, market, signals, **overrides):
        options = {**COMMISSION, **overrides}
        return build_first_hit_labels(market, signals, **options)

    def test_unverified_or_missing_commission_schedule_fails_closed(self):
        market = bars(3)
        with self.assertRaisesRegex(ValueError, "commission_schedule_unverified"):
            build_first_hit_labels(market, [{"signal_index": 0, "entry_trigger_price": 100.0}],
                                   commission_per_lot_per_side_usd=0.0,
                                   commission_source="unverified zero assumption",
                                   commission_verified=False)
        with self.assertRaisesRegex(ValueError, "commission_source_required"):
            build_first_hit_labels(market, [{"signal_index": 0, "entry_trigger_price": 100.0}],
                                   commission_per_lot_per_side_usd=0.0,
                                   commission_source=" ", commission_verified=True)
        with self.assertRaisesRegex(ValueError, "commission_schedule_unverified"):
            build_first_hit_labels(market, [{"signal_index": 0, "entry_trigger_price": 100.0}],
                                   commission_per_lot_per_side_usd=0.0,
                                   commission_source="synthetic fixture",
                                   commission_verified="true")
        with self.assertRaisesRegex(ValueError, "signal_must_be_mapping"):
            self.build(market, [None])
        with self.assertRaisesRegex(ValueError, "bar_must_be_mapping"):
            self.build([None], [])

    def test_next_bar_only_trigger_and_no_next_bar(self):
        market = bars(3, high=100.0, close=100.0)
        rows = self.build(market, [
            {"signal_index": 0, "entry_trigger_price": 100.2},
            {"signal_index": 2, "entry_trigger_price": 100.0},
        ])
        self.assertEqual(rows[0]["status"], "trigger_not_reached_next_bar")
        self.assertEqual(rows[1]["status"], "no_next_bar")

    def test_target_first_uses_next_bar_fill_spread_and_slippage(self):
        market = bars(4)
        market[1].update({"open": 100.0, "high": 112.0, "low": 100.0, "close": 111.0})
        trade = self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.1}])[0]
        expected_entry = 100.1 + 0.2 + 0.02
        expected_target = expected_entry + 11.0
        self.assertEqual(trade["status"], "closed")
        self.assertEqual(trade["outcome_class"], "target_first")
        self.assertEqual(trade["entry_index"], 1)
        self.assertAlmostEqual(trade["entry_price"], expected_entry)
        self.assertAlmostEqual(trade["target_price"], expected_target)
        self.assertAlmostEqual(trade["exit_price"], expected_target - 0.02)
        self.assertAlmostEqual(trade["commission_usd"], 0.07)
        self.assertAlmostEqual(trade["net_pnl_usd"], trade["gross_pnl_usd"] - 0.07)
        self.assertTrue(trade["training_eligible"])

    def test_stop_wins_same_bar_dual_touch(self):
        market = bars(3)
        market[1].update({"open": 100.0, "high": 112.0, "low": 90.0, "close": 101.0})
        trade = self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.1}])[0]
        self.assertEqual(trade["outcome_class"], "stop_first")
        self.assertTrue(trade["ambiguous_stop_and_target_same_bar"])
        self.assertAlmostEqual(trade["exit_price"], trade["stop_price"] - 0.02)

    def test_time_exit_requires_complete_maximum_holding_horizon_and_costs(self):
        market = bars(14)
        trade = self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.1}])[0]
        self.assertEqual(trade["outcome_class"], "time_exit")
        self.assertEqual(trade["exit_index"], 12)  # entry index 1 plus 11 further bars
        self.assertEqual(trade["bars_held"], 12)  # inclusive count, including entry candle
        self.assertAlmostEqual(trade["spread_cost_usd"], 0.2)
        self.assertAlmostEqual(trade["slippage_cost_usd"], 0.04)
        self.assertAlmostEqual(trade["commission_usd"], 0.07)
        self.assertAlmostEqual(trade["net_pnl_usd"], trade["gross_pnl_usd"] - 0.07)

    def test_end_of_data_without_barrier_is_censored_not_time_exit(self):
        market = bars(6)
        trade = self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.1}])[0]
        self.assertEqual(trade["status"], "censored_end_of_data")
        self.assertIsNone(trade["outcome_class"])
        self.assertIsNone(trade["net_pnl_usd"])
        self.assertFalse(trade["training_eligible"])

    def test_one_position_overlap_blocks_signals_until_exit_bar_closes(self):
        market = bars(16)
        market[2].update({"high": 112.0})
        market[5].update({"high": 112.0})
        rows = self.build(market, [
            {"signal_index": 0, "entry_trigger_price": 100.1},
            {"signal_index": 1, "entry_trigger_price": 100.1},
            {"signal_index": 2, "entry_trigger_price": 100.1},
            {"signal_index": 3, "entry_trigger_price": 100.1},
        ])
        self.assertEqual(rows[0]["status"], "closed")
        self.assertEqual(rows[1]["status"], "blocked_overlap")
        self.assertEqual(rows[2]["status"], "blocked_overlap")
        self.assertEqual(rows[3]["status"], "closed")

    def test_label_intervals_are_purged_and_embargoed_at_fold_boundary(self):
        labels = [
            {"signal_index": 0, "exit_index": 5, "status": "closed", "training_eligible": True},
            {"signal_index": 10, "exit_index": 20, "status": "closed", "training_eligible": True},
            {"signal_index": 55, "exit_index": 57, "status": "closed", "training_eligible": True},
            {"signal_index": 63, "exit_index": 65, "status": "closed", "training_eligible": True},
            {"signal_index": 70, "exit_index": 72, "status": "censored_end_of_data", "training_eligible": False},
        ]
        kept = purge_training_indices(labels, [0, 10, 55, 63, 70],
                                      validation_start_index=30,
                                      validation_end_index=50,
                                      purge_bars=12, embargo_bars=12)
        self.assertEqual(kept, [0, 63])

    def test_daily_trade_limit_and_realized_loss_stop_are_preserved(self):
        market = bars(18)
        market[1].update({"open": 100.0, "high": 100.5, "low": 90.0, "close": 95.0})
        market[4].update({"open": 100.0, "high": 100.5, "low": 99.8, "close": 100.1})
        rows = self.build(market, [
            {"signal_index": 0, "entry_trigger_price": 100.1},
            {"signal_index": 3, "entry_trigger_price": 100.1},
        ], max_daily_loss_usd=1.0)
        self.assertEqual(rows[0]["outcome_class"], "stop_first")
        self.assertLess(rows[0]["net_pnl_usd"], -1.0)
        self.assertEqual(rows[1]["status"], "blocked_daily_risk_limit")

    def test_daily_entry_limit_uses_entry_date_across_utc_midnight(self):
        start = datetime(2026, 1, 1, 23, 0, tzinfo=timezone.utc)
        market = bars(18, start=start)
        # First signal is 23:45; its executable entry is 00:00 next UTC day.
        market[4].update({"open": 100.0, "high": 100.5, "low": 90.0, "close": 95.0})
        rows = self.build(market, [
            {"signal_index": 3, "entry_trigger_price": 100.1},
            {"signal_index": 5, "entry_trigger_price": 100.1},
        ], max_daily_trades=1)
        self.assertEqual(rows[0]["status"], "closed")
        self.assertEqual(rows[0]["entry_timestamp_utc"], "2026-01-02T00:00:00Z")
        self.assertEqual(rows[1]["status"], "blocked_daily_risk_limit")

    def test_realized_loss_is_booked_on_exit_utc_day_after_midnight(self):
        start = datetime(2026, 1, 1, 23, 45, tzinfo=timezone.utc)
        market = bars(5, start=start, spread=0.0)
        # Signal at 23:45 enters at 00:00 and stops on that entry bar.
        market[1].update({"open": 100.0, "high": 100.5, "low": 90.0, "close": 95.0})
        rows = self.build(market, [
            {"signal_index": 0, "entry_trigger_price": 100.1},
            {"signal_index": 2, "entry_trigger_price": 100.1},
        ], max_daily_loss_usd=4.0)
        self.assertEqual(rows[0]["entry_timestamp_utc"], "2026-01-02T00:00:00Z")
        self.assertEqual(rows[0]["exit_timestamp_utc"], "2026-01-02T00:00:00Z")
        self.assertLess(rows[0]["net_pnl_usd"], -4.0)
        # The next entry on the exit UTC day sees that day's realized loss.
        self.assertEqual(rows[1]["status"], "blocked_daily_risk_limit")

    def test_signal_and_entry_timestamps_are_strictly_forward(self):
        market = bars(16)
        trade = self.build(market, [{"signal_index": 2, "entry_trigger_price": 100.1}])[0]
        self.assertEqual(trade["entry_index"], trade["signal_index"] + 1)
        self.assertLess(trade["signal_timestamp_utc"], trade["entry_timestamp_utc"])
        self.assertEqual(trade["spread_model"], "MT5 Bid OHLC; spread charged at BUY entry only")

    def test_gap_through_stop_uses_worse_subsequent_bar_open(self):
        market = bars(5)
        # The open is below the stop; the later intrabar high also reaches
        # target, but the opening gap is the first event and must stop first.
        market[2].update({"open": 94.0, "high": 112.0, "low": 93.0, "close": 94.5})
        trade = self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.1}])[0]
        self.assertEqual(trade["outcome_class"], "stop_first")
        self.assertTrue(trade["gap_through_barrier"])
        self.assertEqual(trade["gap_through_side"], "stop")
        self.assertEqual(trade["gap_open_price"], 94.0)
        self.assertAlmostEqual(trade["exit_price"], 93.98)
        self.assertFalse(trade["ambiguous_stop_and_target_same_bar"])

    def test_gap_through_target_is_capped_at_target_not_favorable_open(self):
        market = bars(5)
        # The open is above target; the later low also crosses stop, but the
        # target opening event is first. Do not grant the better opening price.
        market[2].update({"open": 112.0, "high": 113.0, "low": 90.0, "close": 112.5})
        trade = self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.1}])[0]
        self.assertEqual(trade["outcome_class"], "target_first")
        self.assertTrue(trade["gap_through_barrier"])
        self.assertEqual(trade["gap_through_side"], "target")
        self.assertEqual(trade["gap_open_price"], 112.0)
        self.assertAlmostEqual(trade["exit_price"], trade["target_price"] - 0.02)
        self.assertLess(trade["exit_price"], 112.0 - 0.02)
        self.assertFalse(trade["ambiguous_stop_and_target_same_bar"])

    def test_entry_bar_open_predates_trigger_and_is_not_a_gap_fill(self):
        market = bars(4)
        # Entry occurs only after the trigger is reached. The bar's open is
        # earlier than that fill and must not be used as the exit gap price.
        market[1].update({"open": 90.0, "high": 101.0, "low": 89.0, "close": 100.5})
        trade = self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.1}])[0]
        self.assertEqual(trade["outcome_class"], "stop_first")
        self.assertFalse(trade["gap_through_barrier"])
        self.assertIsNone(trade["gap_through_side"])
        self.assertAlmostEqual(trade["exit_price"], trade["stop_price"] - 0.02)
        self.assertNotAlmostEqual(trade["exit_price"], 90.0 - 0.02)

    def test_invalid_bar_order_and_signal_order_are_rejected(self):
        market = bars(4)
        market[2]["timestamp"] = market[1]["timestamp"]
        with self.assertRaisesRegex(ValueError, "strictly_increasing"):
            self.build(market, [{"signal_index": 0, "entry_trigger_price": 100.0}])
        market = bars(4)
        with self.assertRaisesRegex(ValueError, "chronological"):
            self.build(market, [
                {"signal_index": 2, "entry_trigger_price": 100.0},
                {"signal_index": 1, "entry_trigger_price": 100.0},
            ])


if __name__ == "__main__":
    unittest.main()
