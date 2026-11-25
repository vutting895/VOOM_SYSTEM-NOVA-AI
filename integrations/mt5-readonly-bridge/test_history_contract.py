import unittest
from datetime import datetime, timezone
from history_contract import serialize_history_rates

START = datetime(2026, 1, 1, tzinfo=timezone.utc)
END = datetime(2026, 1, 1, 2, tzinfo=timezone.utc)

def rate(moment, **overrides):
    value = {"time": int(moment.timestamp()), "open": 10.0, "high": 12.0, "low": 9.0, "close": 11.0,
             "tick_volume": 5, "spread": 2, "real_volume": 0}
    value.update(overrides)
    return value

class HistoryContractTests(unittest.TestCase):
    def test_serializes_valid_ordered_half_open_history(self):
        bars = serialize_history_rates([rate(START), rate(datetime(2026,1,1,1,tzinfo=timezone.utc))], START, END, 2000)
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0]["time"], "2026-01-01T00:00:00Z")

    def test_rejects_duplicate_or_out_of_order_timestamps(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START), rate(START)], START, END, 2000)

    def test_rejects_out_of_range_timestamp(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(END)], START, END, 2000)

    def test_rejects_invalid_ohlc(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START, high=8.0)], START, END, 2000)

    def test_rejects_non_finite_prices(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START, close=float("nan"))], START, END, 2000)

    def test_rejects_negative_volume_or_spread(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START, tick_volume=-1)], START, END, 2000)

    def test_rejects_bar_limit_overflow(self):
        with self.assertRaises(ValueError):
            serialize_history_rates([rate(START), rate(datetime(2026,1,1,1,tzinfo=timezone.utc))], START, END, 1)

    def test_empty_history_is_valid_when_bounds_are_increasing(self):
        self.assertEqual(serialize_history_rates([], START, END, 2000), [])

if __name__ == "__main__":
    unittest.main()
