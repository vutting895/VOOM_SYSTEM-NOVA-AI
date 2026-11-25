import unittest
from datetime import datetime, timedelta, timezone

from workers.quant_engine.causal_smc import (
    Candle, StructureBreak, confirm_swings, detect_order_blocks,
    last_closed_higher_timeframe_index, visible_order_blocks,
)


BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def candle(i, o, h, l, c):
    return Candle(BASE + timedelta(minutes=15 * i), o, h, l, c)


class CausalSwingTests(unittest.TestCase):
    def test_swing_is_emitted_only_after_right_confirmation_bars(self):
        bars = [
            candle(0, 10, 11, 9, 10),
            candle(1, 10, 12, 9, 11),
            candle(2, 11, 20, 10, 12),  # pivot high
            candle(3, 12, 15, 11, 13),
            candle(4, 13, 14, 12, 13),  # confirmation completes here
        ]
        swings = confirm_swings(bars, lookback=2)
        highs = [s for s in swings if s.kind == "high"]
        self.assertEqual(len(highs), 1)
        self.assertEqual(highs[0].pivot_index, 2)
        self.assertEqual(highs[0].confirmed_index, 4)
        self.assertEqual(highs[0].confirmed_at, bars[4].timestamp)

    def test_future_extension_cannot_rewrite_already_confirmed_swing(self):
        prefix = [
            candle(0, 10, 11, 9, 10), candle(1, 10, 12, 9, 11),
            candle(2, 11, 20, 10, 12), candle(3, 12, 15, 11, 13),
            candle(4, 13, 14, 12, 13),
        ]
        extended = prefix + [candle(5, 13, 100, 1, 50), candle(6, 50, 51, 49, 50)]
        a = [s for s in confirm_swings(prefix, 2) if s.confirmed_index <= 4]
        b = [s for s in confirm_swings(extended, 2) if s.confirmed_index <= 4]
        self.assertEqual(a, b)

    def test_duplicate_timestamps_are_rejected(self):
        bars = [candle(0, 10, 11, 9, 10), candle(0, 10, 11, 9, 10)]
        with self.assertRaises(ValueError):
            confirm_swings(bars, 1)


class CausalOrderBlockTests(unittest.TestCase):
    def test_order_block_is_not_visible_before_break_timestamp(self):
        bars = [
            candle(0, 10, 11, 9, 10),
            candle(1, 10, 11, 8, 9),  # opposing bearish candle
            candle(2, 9, 12, 8, 11),
            candle(3, 11, 14, 10, 13),  # bullish break
        ]
        event = StructureBreak("bullish", "BOS", 3, bars[3].timestamp, 12)
        blocks = detect_order_blocks(bars, [event], lookback=3)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].source_index, 1)
        self.assertEqual(blocks[0].created_index, 3)
        self.assertEqual(visible_order_blocks(blocks, bars[2].timestamp), [])
        self.assertEqual(visible_order_blocks(blocks, bars[3].timestamp), blocks)

    def test_future_order_blocks_are_excluded_from_asof_query(self):
        bars = [candle(i, 10, 12, 8, 11) for i in range(4)]
        early = StructureBreak("bullish", "BOS", 2, bars[2].timestamp, 11)
        late = StructureBreak("bearish", "BOS", 3, bars[3].timestamp, 9)
        blocks = [
            # explicit event-time fixtures to isolate visibility semantics
        ]
        from workers.quant_engine.causal_smc import OrderBlock
        blocks = [
            OrderBlock("bullish", 1, bars[1].timestamp, 2, early.timestamp, 11, 8),
            OrderBlock("bearish", 2, bars[2].timestamp, 3, late.timestamp, 12, 10),
        ]
        visible = visible_order_blocks(blocks, bars[2].timestamp)
        self.assertEqual(len(visible), 1)
        self.assertEqual(visible[0].direction, "bullish")


class HigherTimeframeAlignmentTests(unittest.TestCase):
    def test_unclosed_htf_bar_is_never_selected(self):
        opens = [BASE, BASE + timedelta(hours=4), BASE + timedelta(hours=8)]
        self.assertEqual(last_closed_higher_timeframe_index(opens, BASE + timedelta(hours=3, minutes=59), timedelta(hours=4)), -1)
        self.assertEqual(last_closed_higher_timeframe_index(opens, BASE + timedelta(hours=4), timedelta(hours=4)), 0)
        self.assertEqual(last_closed_higher_timeframe_index(opens, BASE + timedelta(hours=7, minutes=59), timedelta(hours=4)), 0)
        self.assertEqual(last_closed_higher_timeframe_index(opens, BASE + timedelta(hours=8), timedelta(hours=4)), 1)

    def test_unsorted_htf_times_are_rejected(self):
        opens = [BASE + timedelta(hours=4), BASE]
        with self.assertRaises(ValueError):
            last_closed_higher_timeframe_index(opens, BASE + timedelta(hours=8), timedelta(hours=4))


if __name__ == "__main__":
    unittest.main(verbosity=2)
