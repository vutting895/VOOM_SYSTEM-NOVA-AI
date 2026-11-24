import unittest
from datetime import datetime, timezone

from history_contract import serialize_history_rates


START = datetime(2026, 1, 1, tzinfo=timezone.utc)
END = datetime(2026, 1, 1, 3, tzinfo=timezone.utc)


def rate(timestamp, *, open_=100.0, high=102.0, low=99.0, close=101.0,
         tick_volume=10, spread=2, real_volume=0):
    return {
        "time": int(timestamp.timestamp()),
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "tick_volume": tick_volume,
        "spread": spread,
        "real_volume": real_volume,
    }


class HistoryContractTests(unittest.TestCase):
    def test_serializes_valid_bars_as_utc(self):
        bars = serialize_history_rates(
            [rate(START), rate(datetime(2026, 1, 1, 1, tzinfo=timezone.utc))],
            START, END, 2000,
        )
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0]["time"], "2026-01-01T00:00:00Z")
        self.assertEqual(bars[1]["tick_volume"], 10)

    def test_accepts_generator_input(self):
        rates = (item for item in [rate(START), rate(datetime(2026, 1, 1, 1, tzinfo=timezone.utc))])
        self.assertEqual(len(serialize_history_rates(rates, START, END, 2000)), 2)

    def test_uses_half_open_end_boundary(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(END)], START, END, 2000)

    def test_rejects_bar_before_start(self):
        before = datetime(2025, 12, 31, 23, tzinfo=timezone.utc)
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(before)], START, END, 2000)

    def test_rejects_duplicate_timestamps(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START), rate(START)], START, END, 2000)

    def test_rejects_unordered_timestamps(self):
        later = datetime(2026, 1, 1, 1, tzinfo=timezone.utc)
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(later), rate(START)], START, END, 2000)

    def test_rejects_fractional_timestamp_instead_of_truncating(self):
        invalid = rate(START)
        invalid["time"] += 0.5
        with self.assertRaises(ValueError):
            serialize_history_rates([invalid], START, END, 2000)

    def test_rejects_fractional_volume_instead_of_truncating(self):
        invalid = rate(START, tick_volume=10.5)
        with self.assertRaises(ValueError):
            serialize_history_rates([invalid], START, END, 2000)

    def test_rejects_inconsistent_ohlc(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START, high=100.5)], START, END, 2000)

    def test_rejects_non_finite_prices(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START, close=float("nan"))], START, END, 2000)

    def test_rejects_negative_volume_or_spread(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START, tick_volume=-1)], START, END, 2000)

    def test_rejects_excessive_bar_count(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START), rate(datetime(2026, 1, 1, 1, tzinfo=timezone.utc))], START, END, 1)

    def test_rejects_naive_datetime_bounds(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([], datetime(2026, 1, 1), END, 2000)

    def test_rejects_nonpositive_or_noninteger_bar_limit(self):
        for limit in (0, -1, 1.5, True):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                serialize_history_rates([], START, END, limit)

    def test_empty_history_is_a_valid_empty_result(self):
        self.assertEqual(serialize_history_rates([], START, END, 2000), [])


if __name__ == "__main__":
    unittest.main()
