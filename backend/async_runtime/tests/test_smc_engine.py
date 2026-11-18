import unittest
from datetime import datetime, timedelta, timezone
from elliott_wave import detect_elliott_impulses
from smc_engine import analyze_market, detect_fvg, detect_liquidity_sweeps, validate_bars


def make_bars(closes):
    start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    return [{
        "timestamp": (start + timedelta(hours=i)).isoformat().replace("+00:00", "Z"),
        "open": float(close), "high": float(close) + 0.2,
        "low": float(close) - 0.2, "close": float(close), "volume": 100.0,
    } for i, close in enumerate(closes)]


class SMCValidationTests(unittest.TestCase):
    def test_rejects_duplicate_timestamps(self):
        rows = make_bars(range(100, 125))
        rows[3]["timestamp"] = rows[2]["timestamp"]
        with self.assertRaises(ValueError):
            validate_bars(rows)

    def test_rejects_naive_timestamp(self):
        rows = make_bars(range(100, 125))
        rows[0]["timestamp"] = "2026-11-01T00:00:00"
        with self.assertRaises(ValueError):
            validate_bars(rows)

    def test_rejects_inconsistent_ohlc(self):
        rows = make_bars(range(100, 125))
        rows[0]["high"] = rows[0]["low"] - 1
        with self.assertRaises(ValueError):
            validate_bars(rows)

    def test_detects_bullish_fvg(self):
        rows = make_bars([100 + i for i in range(25)])
        rows[2]["high"] = 102.0
        rows[4]["low"] = 104.0
        self.assertTrue(any(x["type"] == "BULLISH_FVG" for x in detect_fvg(rows)))

    def test_detects_bearish_fvg(self):
        rows = make_bars([125 - i for i in range(25)])
        rows[2]["low"] = 122.0
        rows[4]["high"] = 121.0
        self.assertTrue(any(x["type"] == "BEARISH_FVG" for x in detect_fvg(rows)))

    def test_detects_bearish_sweep(self):
        rows = make_bars([100 + (i % 3) for i in range(25)])
        rows[24].update({"open": 101.0, "high": 106.0, "low": 100.0, "close": 101.0})
        self.assertTrue(any(x["type"] == "BEARISH_SWEEP" for x in detect_liquidity_sweeps(rows, 10)))

    def test_unified_output_keeps_execution_disabled(self):
        result = analyze_market(make_bars([100 + (i % 4) for i in range(40)]))
        self.assertIn("elliott_wave", result)
        self.assertFalse(result["execution"]["live_trading_enabled"])


class ElliottWaveTests(unittest.TestCase):
    def _bars_from_vertices(self, vertices):
        # First vertex is at index 1 so it can be confirmed by a left neighbour.
        closes = [float(vertices[0][1] + 2), float(vertices[0][1])]
        for (start_i, start_p), (end_i, end_p) in zip(vertices, vertices[1:]):
            for i in range(start_i + 1, end_i + 1):
                fraction = (i - start_i) / (end_i - start_i)
                closes.append(float(start_p + (end_p - start_p) * fraction))
        closes.append(float(vertices[-1][1] - 1))
        return make_bars(closes)

    def test_bullish_impulse_candidate_is_confirmed_after_right_bar(self):
        rows = self._bars_from_vertices([(1, 10), (4, 20), (7, 14), (10, 28), (13, 21), (16, 33)])
        result = detect_elliott_impulses(rows, left_bars=1, right_bars=1)
        candidates = [p for p in result["patterns"] if p["type"] == "BULLISH_IMPULSE_CANDIDATE"]
        self.assertTrue(candidates)
        self.assertEqual(candidates[-1]["confirmed_at_index"], candidates[-1]["end_index"] + 1)

    def test_bearish_impulse_candidate(self):
        rows = self._bars_from_vertices([(1, 33), (4, 23), (7, 29), (10, 15), (13, 22), (16, 10)])
        result = detect_elliott_impulses(rows, left_bars=1, right_bars=1)
        self.assertTrue(any(p["type"] == "BEARISH_IMPULSE_CANDIDATE" for p in result["patterns"]))


if __name__ == "__main__":
    unittest.main()
