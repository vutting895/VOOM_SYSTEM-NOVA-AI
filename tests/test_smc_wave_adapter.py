import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "feature" / "smc_wave"))
from adapter import analyze_ohlcv, analyze_smc_wave, component_status
from harmonic_patterns import detect_xabcd
from elliott_wave import find_pivots, five_swing_candidate
from liquidity_sweeps import detect_liquidity_sweeps

class TestSMCWave(unittest.TestCase):
    def test_status_fails_closed(self):
        s = component_status()
        self.assertFalse(s["live_trading_enabled"])
        self.assertFalse(s["orders_submitted"])
        self.assertFalse(s["signals_ready"])

    def test_valid_ohlc_is_not_signal(self):
        r = analyze_ohlcv([{"open": 1, "high": 2, "low": .5, "close": 1.5}])
        self.assertTrue(r["ok"])
        self.assertIsNone(r["signal"])

    def test_empty_and_bad_ohlc_rejected(self):
        self.assertFalse(analyze_ohlcv([])["ok"])
        self.assertFalse(analyze_ohlcv([{"open": 1, "high": 0, "low": .5, "close": .8}])["ok"])

    def test_harmonic_requires_five_points(self):
        self.assertFalse(detect_xabcd([{"price": 1}] * 4)["ok"])

    def test_harmonic_rejects_bad_price(self):
        self.assertFalse(detect_xabcd([{"price": "bad"}] * 5)["ok"])

    def test_pivot_validation(self):
        with self.assertRaises(ValueError):
            find_pivots([{"high": 1, "low": 2}])

    def test_six_swing_alternation(self):
        p = [{"kind": k, "price": i} for i, k in enumerate(["low","high","low","high","low","high"])]
        self.assertTrue(five_swing_candidate(p)["candidate"])

    def test_sweep_close_back_inside(self):
        candles = [{"high": 10, "low": 5, "close": 7} for _ in range(3)]
        candles.append({"high": 11, "low": 6, "close": 9})
        events = detect_liquidity_sweeps(candles, lookback=3)
        self.assertEqual(events[0]["type"], "buy_side_sweep")

    def test_invalid_lookback(self):
        with self.assertRaises(ValueError):
            detect_liquidity_sweeps([], lookback=1)

    def test_combined_analysis_is_research_only(self):
        candles = [{"open": 7, "high": 10, "low": 5, "close": 7} for _ in range(30)]
        r = analyze_smc_wave(candles, lookback=5)
        self.assertTrue(r["ok"])
        self.assertIsNone(r["signal"])
        self.assertFalse(r["orders_submitted"])

if __name__ == "__main__":
    unittest.main()
