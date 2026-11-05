import unittest

from research.wave3_challenger.fvg_events import build_bullish_fvg_event_trace


def candle(open_price, high, low, close):
    return {"open": open_price, "high": high, "low": low, "close": close}


def first_gap_bars():
    # The bullish FVG is created at index 2: [100.0, 101.0].
    return [
        candle(99.5, 100.0, 99.0, 99.8),
        candle(101.0, 101.5, 100.5, 101.0),
        candle(102.0, 103.0, 101.0, 102.0),
        candle(101.4, 101.8, 100.9, 101.2),
        candle(101.2, 101.7, 100.8, 101.0),
        candle(100.2, 100.4, 99.8, 100.0),
        candle(100.5, 100.7, 99.9, 100.1),
    ]


class TestBullishFVGEvents(unittest.TestCase):
    def test_fvg_is_not_visible_until_third_candle_closes(self):
        trace = build_bullish_fvg_event_trace(first_gap_bars())
        self.assertIsNone(trace[0]["active_origin_index"])
        self.assertIsNone(trace[1]["active_origin_index"])
        self.assertTrue(trace[2]["created_now"])
        self.assertEqual(trace[2]["created_origin_index"], 2)
        self.assertIsNone(trace[2]["active_origin_index"])
        self.assertEqual(trace[3]["active_origin_index"], 2)
        self.assertEqual(trace[3]["active_age_bars"], 1)

    def test_first_touch_index_is_immutable_and_retouch_stays_separate(self):
        trace = build_bullish_fvg_event_trace(first_gap_bars())
        self.assertTrue(trace[3]["first_touch_only"])
        self.assertEqual(trace[3]["first_touch_index"], 3)
        self.assertTrue(trace[4]["repeat_touch_within_48"])
        self.assertFalse(trace[4]["first_touch_only"])
        self.assertEqual(trace[4]["first_touch_index"], 3)
        self.assertEqual(trace[6]["first_touch_index"], 3)

    def test_first_full_mitigation_is_terminal_and_retouch_is_flagged(self):
        trace = build_bullish_fvg_event_trace(first_gap_bars())
        self.assertFalse(trace[4]["first_full_mitigation_only"])
        self.assertTrue(trace[5]["fully_mitigated_now"])
        self.assertTrue(trace[5]["first_full_mitigation_only"])
        self.assertEqual(trace[5]["first_full_mitigation_index"], 5)
        self.assertFalse(trace[5]["post_full_mitigation_retouch"])
        self.assertTrue(trace[6]["post_full_mitigation_retouch"])
        self.assertTrue(trace[6]["repeat_touch_within_48"])
        self.assertFalse(trace[6]["first_full_mitigation_only"])
        self.assertEqual(trace[6]["first_full_mitigation_index"], 5)

    def test_new_gap_supersedes_previous_only_after_its_creation_bar_closes(self):
        bars = first_gap_bars()[:4] + [
            candle(104.2, 105.0, 104.0, 104.5),  # second FVG: [103, 104]
            candle(104.2, 104.5, 103.8, 104.0),
        ]
        trace = build_bullish_fvg_event_trace(bars)
        self.assertEqual(trace[4]["active_origin_index"], 2)
        self.assertTrue(trace[4]["created_now"])
        self.assertEqual(trace[4]["created_origin_index"], 4)
        self.assertEqual(trace[5]["active_origin_index"], 4)
        self.assertEqual(trace[5]["active_lower"], 103.0)
        self.assertEqual(trace[5]["active_upper"], 104.0)

    def test_newer_future_bars_cannot_change_prior_trace_rows(self):
        bars = first_gap_bars()
        original = build_bullish_fvg_event_trace(bars)
        changed = list(bars)
        changed[5] = candle(120.0, 125.0, 119.0, 124.0)
        changed[6] = candle(80.0, 81.0, 79.0, 80.0)
        revised = build_bullish_fvg_event_trace(changed)
        self.assertEqual(original[:5], revised[:5])

    def test_latest_gap_expires_after_the_inclusive_48_bar_window(self):
        bars = first_gap_bars()[:3]
        bars.extend(candle(101.8, 102.0, 101.5, 101.8) for _ in range(49))
        trace = build_bullish_fvg_event_trace(bars)
        self.assertEqual(trace[50]["active_origin_index"], 2)
        self.assertEqual(trace[50]["active_age_bars"], 48)
        self.assertIsNone(trace[51]["active_origin_index"])

    def test_invalid_ohlc_and_invalid_window_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "ohlc_invalid"):
            build_bullish_fvg_event_trace([candle(10, 9, 8, 8.5)])
        with self.assertRaisesRegex(ValueError, "max_age_bars"):
            build_bullish_fvg_event_trace(first_gap_bars(), max_age_bars=0)
        with self.assertRaisesRegex(ValueError, "bars_must_be_non_empty_sequence"):
            build_bullish_fvg_event_trace([])


if __name__ == "__main__":
    unittest.main()
