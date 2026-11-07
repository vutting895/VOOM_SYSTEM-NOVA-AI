import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

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
        # Make the first point a confirmed local low for bullish or local high for bearish.
        first_offset = -2 if vertices[1][1] < vertices[0][1] else 2
        closes = [float(vertices[0][1] + first_offset), float(vertices[0][1])]
        for (start_i, start_p), (end_i, end_p) in zip(vertices, vertices[1:]):
            for i in range(start_i + 1, end_i + 1):
                fraction = (i - start_i) / (end_i - start_i)
                closes.append(float(start_p + (end_p - start_p) * fraction))
        # One additional bar confirms the final pivot on the right-hand side.
        final_offset = -1 if vertices[-1][1] > vertices[-2][1] else 1
        closes.append(float(vertices[-1][1] + final_offset))
        return make_bars(closes)

    def test_bullish_impulse_candidate_is_confirmed_after_right_bar(self):
        rows = self._bars_from_vertices([(1, 10), (4, 20), (7, 14), (10, 28), (13, 21), (16, 33)])
        result = detect_elliott_impulses(rows, left_bars=1, right_bars=1)
        candidates = [p for p in result["patterns"] if p["type"] == "BULLISH_IMPULSE_CANDIDATE"]
        self.assertTrue(candidates)
        self.assertEqual(candidates[-1]["confirmed_at_index"], candidates[-1]["end_index"] + 1)
        self.assertEqual(candidates[-1]["points"][1]["label"], "WAVE_1_END")

    def test_bearish_impulse_candidate(self):
        rows = self._bars_from_vertices([(1, 33), (4, 23), (7, 29), (10, 15), (13, 22), (16, 10)])
        result = detect_elliott_impulses(rows, left_bars=1, right_bars=1)
        self.assertTrue(any(p["type"] == "BEARISH_IMPULSE_CANDIDATE" for p in result["patterns"]))


class TaskContractTests(unittest.TestCase):
    def test_task_rejects_unclosed_last_bar(self):
        from tasks import scan_market_smc
        with self.assertRaises(ValueError):
            scan_market_smc.run("EURUSD", "1h", make_bars(range(100, 125)), last_bar_closed=False)

    def test_task_skips_non_active_bot(self):
        from tasks import scan_market_smc
        with patch("tasks.bot_is_active", return_value=False), patch("tasks.cache_analysis") as cache:
            result = scan_market_smc.run(
                "EURUSD", "1h", make_bars(range(100, 125)),
                last_bar_closed=True, tenant_id="tenant-a", bot_id="bot-a",
            )
        self.assertEqual(result["status"], "SKIPPED")
        cache.assert_not_called()

    def test_task_cache_key_is_tenant_scoped(self):
        from tasks import scan_market_smc
        rows = make_bars(range(100, 140))
        with patch("tasks.bot_is_active", return_value=True), patch("tasks.cache_analysis") as cache:
            scan_market_smc.run("EURUSD", "1h", rows, last_bar_closed=True, tenant_id="tenant-a", bot_id="bot-a")
            scan_market_smc.run("EURUSD", "1h", rows, last_bar_closed=True, tenant_id="tenant-b", bot_id="bot-a")
        first_key = cache.call_args_list[0].args[0]
        second_key = cache.call_args_list[1].args[0]
        self.assertNotEqual(first_key, second_key)


    def test_tenant_scoped_research_scan_does_not_require_active_bot(self):
        from tasks import scan_market_smc
        rows = make_bars(range(100, 140))
        metadata = {
            "provider": "exness_mt5_demo",
            "connection_id": "connection-a",
            "fetched_at": "2026-11-07T01:00:00Z",
            "source_as_of": "2026-11-07T00:59:00Z",
        }
        with patch("tasks.cache_analysis") as analysis_cache, patch("tasks.cache_latest_price") as price_cache:
            result = scan_market_smc.run(
                "EURUSD", "5m", rows, last_bar_closed=True,
                tenant_id="tenant-a", source_metadata=metadata,
            )
        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(result["market_data_source"], metadata)
        analysis_cache.assert_called_once()
        price_cache.assert_called_once()
        self.assertEqual(price_cache.call_args.args[0:2], ("tenant-a", "EURUSD"))


if __name__ == "__main__":
    unittest.main()
