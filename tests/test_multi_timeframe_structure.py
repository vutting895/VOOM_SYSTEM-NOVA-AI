import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from workers.feature.smc_wave.multi_timeframe import analyze_multi_timeframe


AS_OF = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)
DURATIONS = {"D1": 86_400, "H4": 14_400, "H1": 3_600, "M15": 900, "M5": 300}


def make_bars(timeframe: str, count: int = 12) -> list[dict]:
    seconds = DURATIONS[timeframe]
    start = AS_OF - timedelta(seconds=seconds * count)
    bars = []
    for index in range(count):
        open_price = 2300.0 + index * 0.25
        close_price = open_price + (0.3 if index % 2 == 0 else -0.1)
        bars.append({
            "timestamp": (start + timedelta(seconds=seconds * index)).isoformat().replace("+00:00", "Z"),
            "bar_close_utc": (start + timedelta(seconds=seconds * (index + 1))).isoformat().replace("+00:00", "Z"),
            "open": open_price,
            "high": max(open_price, close_price) + 0.4,
            "low": min(open_price, close_price) - 0.4,
            "close": close_price,
        })
    return bars


def fake_smc(bias: str, event: dict | None = None) -> dict:
    return {
        "ok": True,
        "structure_bias": bias,
        "latest_structure_event": event,
        "confluence_count": 1,
    }


class MultiTimeframeStructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = {
            "D1": make_bars("D1"),
            "H4": make_bars("H4"),
            "H1": make_bars("H1"),
            "M15": make_bars("M15"),
            "M5": make_bars("M5"),
        }

    def test_top_down_alignment_produces_only_a_research_candidate(self):
        results = [fake_smc("bullish") for _ in range(5)]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")

        self.assertEqual(report["market_state"], "ALIGNED_HTF_BIAS")
        self.assertEqual(report["relations_to_d1"]["M5"], "ALIGNED_WITH_D1")
        self.assertEqual(report["decision"], "RESEARCH_ONLY")
        self.assertIsNone(report["signal"])
        self.assertIsNone(report["confidence"])
        self.assertFalse(report["orders_submitted"])
        self.assertFalse(report["execution_enabled"])
        self.assertFalse(report["live_trading_enabled"])
        self.assertEqual(report["data_status"], "STRUCTURALLY_VALID_SOURCE_UNVERIFIED")

    def test_higher_timeframe_conflict_is_not_silently_called_a_reversal(self):
        results = [
            fake_smc("bullish"),  # D1
            fake_smc("bearish"),  # H4
            fake_smc("neutral"),  # H1
            fake_smc("neutral"),  # M15
            fake_smc("neutral"),  # M5
        ]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        self.assertEqual(report["market_state"], "UNCLASSIFIED")
        self.assertIn("COUNTER_TO_D1", report["relations_to_d1"]["H4"])

    def test_h1_returning_to_d1_direction_is_only_a_pullback_candidate(self):
        results = [
            fake_smc("bullish"),
            fake_smc("bearish"),
            fake_smc("bullish"),
            fake_smc("neutral"),
            fake_smc("neutral"),
        ]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        self.assertEqual(report["market_state"], "PULLBACK_CANDIDATE")
        self.assertIn("unconfirmed", " ".join(report["state_evidence"]))

    def test_h1_choch_against_d1_is_only_a_reversal_candidate(self):
        event = {"type": "CHoCH", "direction": "bearish", "index": 10}
        results = [
            fake_smc("bullish"),
            fake_smc("bearish"),
            fake_smc("bearish", event),
            fake_smc("neutral"),
            fake_smc("neutral"),
        ]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        self.assertEqual(report["market_state"], "REVERSAL_CANDIDATE")
        self.assertIn("not confirmed", " ".join(report["state_evidence"]))

    def test_h4_222_is_descriptive_and_does_not_assign_formation_base_expansion(self):
        results = [fake_smc("bullish") for _ in range(5)]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        grouping = report["h4_2_2_2"]
        self.assertEqual(grouping["status"], "DESCRIPTIVE_SEQUENCE_ONLY")
        self.assertFalse(grouping["calendar_anchor_known"])
        self.assertEqual([g["bar_count"] for g in grouping["groups"]], [2, 2, 2])
        self.assertEqual([g["sequence_position"] for g in grouping["groups"]], [1, 2, 3])
        self.assertIsNone(grouping["interpretation"])

    def test_h4_222_refuses_to_group_across_missing_bars(self):
        # Keep timestamps sorted while introducing an 8-hour gap.
        for index in range(7, 12):
            current = datetime.fromisoformat(self.data["H4"][index]["timestamp"].replace("Z", "+00:00"))
            close_time = datetime.fromisoformat(self.data["H4"][index]["bar_close_utc"].replace("Z", "+00:00"))
            self.data["H4"][index]["timestamp"] = (current + timedelta(hours=8)).isoformat().replace("+00:00", "Z")
            self.data["H4"][index]["bar_close_utc"] = (close_time + timedelta(hours=8)).isoformat().replace("+00:00", "Z")
        results = [fake_smc("bullish") for _ in range(5)]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, (AS_OF + timedelta(hours=8)).isoformat(), "XAUUSDm")
        self.assertEqual(report["h4_2_2_2"]["status"], "NOT_COMPUTED_NONCONTIGUOUS_BARS")

    def test_rejects_missing_required_timeframe(self):
        with self.assertRaisesRegex(ValueError, "required timeframes missing"):
            analyze_multi_timeframe({"D1": self.data["D1"]}, AS_OF.isoformat(), "XAUUSDm")

    def test_rejects_unknown_timeframe(self):
        bad = dict(self.data)
        bad["M1"] = make_bars("M5")
        with self.assertRaisesRegex(ValueError, "unsupported timeframes"):
            analyze_multi_timeframe(bad, AS_OF.isoformat(), "XAUUSDm")

    def test_rejects_timezone_naive_timestamp(self):
        self.data["D1"][0]["timestamp"] = "2026-10-30T12:00:00"
        with self.assertRaisesRegex(ValueError, "explicit timezone"):
            analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")

    def test_rejects_incomplete_candle_at_as_of(self):
        self.data["M5"][-1]["bar_close_utc"] = (
            AS_OF + timedelta(minutes=1)
        ).isoformat().replace("+00:00", "Z")
        with self.assertRaisesRegex(ValueError, "not complete"):
            analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")

    def test_rejects_duplicate_and_out_of_order_timestamps(self):
        self.data["H1"][5]["timestamp"] = self.data["H1"][4]["timestamp"]
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")

    def test_rejects_bad_ohlc_and_too_many_bars(self):
        self.data["D1"][0]["high"] = self.data["D1"][0]["low"] - 1
        with self.assertRaisesRegex(ValueError, "invalid OHLC"):
            analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        self.data["D1"] = make_bars("D1", 501)
        with self.assertRaisesRegex(ValueError, "between 10 and 500"):
            analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")

    def test_neutral_d1_does_not_mislabel_other_timeframes_as_countertrend(self):
        results = [
            fake_smc("neutral"),
            fake_smc("bearish"),
            fake_smc("bearish"),
            fake_smc("neutral"),
            fake_smc("neutral"),
        ]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        self.assertEqual(report["market_state"], "UNCLASSIFIED")
        self.assertEqual(report["relations_to_d1"]["H4"], "NO_DIRECTIONAL_D1_CONTEXT")

    def test_stale_h1_choch_does_not_create_a_reversal_candidate(self):
        stale_event = {"type": "CHoCH", "direction": "bearish", "index": 4}
        results = [
            fake_smc("bullish"),
            fake_smc("bearish"),
            fake_smc("bearish", stale_event),
            fake_smc("neutral"),
            fake_smc("neutral"),
        ]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        self.assertEqual(report["market_state"], "UNCLASSIFIED")

    def test_d1_close_time_can_reflect_a_dst_shift(self):
        self.data["D1"][-1]["bar_close_utc"] = (
            AS_OF - timedelta(hours=1)
        ).isoformat().replace("+00:00", "Z")
        results = [fake_smc("bullish") for _ in range(5)]
        with patch("workers.feature.smc_wave.multi_timeframe.analyze_smc", side_effect=results):
            report = analyze_multi_timeframe(self.data, AS_OF.isoformat(), "XAUUSDm")
        self.assertEqual(
            report["timeframe_context"]["D1"]["latest_bar_close_utc"],
            (AS_OF - timedelta(hours=1)).isoformat().replace("+00:00", "Z"),
        )

    def test_invalid_symbol_and_as_of_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "symbol must"):
            analyze_multi_timeframe(self.data, AS_OF.isoformat(), " ")
        with self.assertRaisesRegex(ValueError, "explicit timezone"):
            analyze_multi_timeframe(self.data, "2026-11-11T12:00:00", "XAUUSDm")


if __name__ == "__main__":
    unittest.main(verbosity=2)
