from __future__ import annotations

import importlib.util
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "export_multitimeframe",
    Path(__file__).resolve().parents[1] / "tools" / "export_exness_mt5_multitimeframe.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FakeMT5:
    ACCOUNT_TRADE_MODE_DEMO = 0
    TIMEFRAME_M1 = 1

    def __init__(self, rates):
        self.rates = rates
        self.terminal = SimpleNamespace(connected=True, company="Exness Technologies Ltd")
        self.account = SimpleNamespace(server="Exness-MT5Trial7", trade_mode=0,
                                       company="Exness Technologies Ltd")
        self.instrument = SimpleNamespace(name="XAUUSDm", chart_mode=0)

    def terminal_info(self):
        return self.terminal

    def account_info(self):
        return self.account

    def symbol_info(self, _symbol):
        return self.instrument

    def copy_rates_range(self, *_args):
        return self.rates

    def last_error(self):
        return (0, "ok")


class MultiTimeframeExporterTests(unittest.TestCase):
    def test_timeframe_registry_covers_m1_through_d1(self):
        self.assertEqual(
            list(MODULE.TIMEFRAMES),
            ["M1", "M5", "M15", "M30", "H1", "H4", "D1"],
        )
        self.assertEqual(MODULE.TIMEFRAMES["M1"][1], 60)
        self.assertEqual(MODULE.TIMEFRAMES["D1"][1], 86400)

    def test_exports_native_tick_volume_and_fails_closed_for_training(self):
        epoch = int(datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc).timestamp())
        rates = [{
            "time": epoch, "open": 2000, "high": 2002, "low": 1999,
            "close": 2001, "tick_volume": 321,
        }]
        mt5 = FakeMT5(rates)
        with tempfile.TemporaryDirectory() as tmp:
            report = MODULE.export_timeframe(
                mt5, "M1", 60, 1,
                datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 5, 0, 1, tzinfo=timezone.utc),
                Path(tmp), "XAUUSDm", "Exness-MT5Trial7", 1,
            )
            self.assertEqual(report["rows"], 1)
            self.assertFalse(report["training_eligible"])
            self.assertEqual(report["completeness_status"],
                             "PENDING_INDEPENDENT_SESSION_AND_COVERAGE_AUDIT")
            csv_text = (Path(tmp) / "XAUUSDm_M1.csv").read_text()
            self.assertIn(",321\n", csv_text)
            self.assertTrue((Path(tmp) / "XAUUSDm_M1.manifest.json").is_file())


    def test_artifact_pair_refuses_existing_manifest_without_creating_csv(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            csv_path = root / "XAUUSDm_H1.csv"
            manifest_path = root / "XAUUSDm_H1.manifest.json"
            manifest_path.write_text("existing", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                MODULE.atomic_write_pair(((csv_path, b"csv"), (manifest_path, b"manifest")))
            self.assertFalse(csv_path.exists())
            self.assertEqual(manifest_path.read_text(encoding="utf-8"), "existing")

    def test_artifact_pair_rolls_back_first_link_if_second_link_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            csv_path = root / "XAUUSDm_H1.csv"
            manifest_path = root / "XAUUSDm_H1.manifest.json"
            real_link = MODULE.os.link
            calls = 0

            def fail_second_link(source, destination):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("simulated_manifest_link_failure")
                return real_link(source, destination)

            with patch.object(MODULE.os, "link", side_effect=fail_second_link):
                with self.assertRaisesRegex(OSError, "simulated_manifest_link_failure"):
                    MODULE.atomic_write_pair(((csv_path, b"csv"), (manifest_path, b"manifest")))
            self.assertFalse(csv_path.exists())
            self.assertFalse(manifest_path.exists())
            self.assertEqual(list(root.iterdir()), [])

    def test_rejects_non_demo_account(self):
        mt5 = FakeMT5([])
        mt5.account.trade_mode = 1
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, "not_confirmed_demo"):
                MODULE.export_timeframe(
                    mt5, "M1", 60, 1,
                    datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc),
                    datetime(2026, 1, 5, 0, 1, tzinfo=timezone.utc),
                    Path(tmp), "XAUUSDm", "Exness-MT5Trial7", 1,
                )

    def test_higher_timeframes_follow_broker_session_anchor_not_utc_midnight(self):
        epoch = int(datetime(2026, 1, 5, 22, 0, tzinfo=timezone.utc).timestamp())
        rate = {"time": epoch, "open": 2000, "high": 2002, "low": 1999,
                "close": 2001, "tick_volume": 321}
        row = MODULE.rate_row(
            rate, datetime(2026, 1, 5, 22, 0, tzinfo=timezone.utc),
            datetime(2026, 1, 6, 22, 0, tzinfo=timezone.utc), 86400,
            datetime(2026, 1, 7, 0, 0, tzinfo=timezone.utc),
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["timestamp_utc"], "2026-01-05T22:00:00Z")

    def test_rejects_invalid_ohlc_and_fractional_tick_volume(self):
        epoch = int(datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc).timestamp())
        base = {"time": epoch, "open": 2000, "high": 2002, "low": 1999,
                "close": 2001, "tick_volume": 321}
        with self.assertRaisesRegex(ValueError, "invalid_ohlc_bounds"):
            MODULE.rate_row({**base, "high": 1998}, datetime(2026, 1, 5, tzinfo=timezone.utc),
                            datetime(2026, 1, 5, 0, 1, tzinfo=timezone.utc), 60,
                            datetime(2026, 1, 5, 0, 2, tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, "tick_volume_must_be_non_negative_integer"):
            MODULE.rate_row({**base, "tick_volume": 1.5}, datetime(2026, 1, 5, tzinfo=timezone.utc),
                            datetime(2026, 1, 5, 0, 1, tzinfo=timezone.utc), 60,
                            datetime(2026, 1, 5, 0, 2, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
