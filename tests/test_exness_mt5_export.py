import csv
import hashlib
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from export_exness_mt5_h1 import export_history, parse_utc


def epoch(value):
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def bar(stamp, *, open_price=2000.0, high=2002.0, low=1999.0, close=2001.0, volume=321):
    return {
        "time": epoch(stamp),
        "open": open_price,
        "high": high,
        "low": low,
        "close": close,
        "tick_volume": volume,
    }


class FakeMT5:
    TIMEFRAME_H1 = 16385
    ACCOUNT_TRADE_MODE_DEMO = 0

    def __init__(self, rates=None, *, server="Exness-MT5Trial7", trade_mode=0,
                 connected=True, chart_mode=0, company="Exness Technologies Ltd"):
        self.rates = rates or []
        self.server = server
        self.trade_mode = trade_mode
        self.connected = connected
        self.chart_mode = chart_mode
        self.company = company
        self.calls = []

    def terminal_info(self):
        return SimpleNamespace(connected=self.connected, chart_mode=self.chart_mode, company=self.company)

    def account_info(self):
        return SimpleNamespace(server=self.server, trade_mode=self.trade_mode, company=self.company)

    def symbol_info(self, symbol):
        return SimpleNamespace(name=symbol, description="Gold vs US Dollar")

    def version(self):
        return (500, 6230, "25 Sep 2026")

    def last_error(self):
        return (0, "fake")

    def copy_rates_range(self, symbol, timeframe, date_from, date_to):
        self.calls.append((symbol, timeframe, date_from, date_to))
        return [
            item for item in self.rates
            if date_from.timestamp() <= item["time"] <= date_to.timestamp()
        ]


class ExnessMT5ExporterTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 1, 5, 0, tzinfo=timezone.utc)
        self.end = datetime(2026, 1, 5, 2, tzinfo=timezone.utc)
        self.now = datetime(2026, 1, 6, 0, tzinfo=timezone.utc)
        self.rates = [
            bar("2026-01-05T00:00:00Z", volume=321),
            bar("2026-01-05T01:00:00Z", open_price=2001, high=2003, low=2000, close=2002, volume=287),
            bar("2026-01-05T02:00:00Z", open_price=2002, high=2004, low=2001, close=2003, volume=301),
        ]

    def export_to(self, folder, mt5):
        output = Path(folder) / "recovery.csv"
        manifest = Path(folder) / "recovery.manifest.json"
        result = export_history(
            mt5,
            symbol="XAUUSDm",
            expected_server="Exness-MT5Trial7",
            start_utc=self.start,
            end_utc=self.end,
            output_csv=output,
            output_manifest=manifest,
            chunk_days=30,
            now_utc=self.now,
        )
        return output, manifest, result

    def test_export_writes_utc_ohlc_and_native_tick_volume_with_hash_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            output, manifest_path, manifest = self.export_to(folder, FakeMT5(self.rates))
            with output.open(newline="", encoding="utf-8") as handle:
                records = list(csv.DictReader(handle))
            self.assertEqual(len(records), 3)
            self.assertEqual(records[0]["timestamp_utc"], "2026-01-05T00:00:00Z")
            self.assertEqual(records[0]["tick_volume"], "321")
            self.assertEqual(manifest["sha256_csv"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(manifest["server"], "Exness-MT5Trial7")
            self.assertEqual(manifest["account_environment"], "Demo")
            self.assertEqual(manifest["symbol"], "XAUUSDm")
            self.assertEqual(manifest["timeframe"], "H1")
            self.assertEqual(manifest["timezone"], "UTC")
            self.assertFalse(manifest["training_eligible"])
            self.assertEqual(
                json.loads(manifest_path.read_text(encoding="utf-8"))["completeness_status"],
                "PENDING_MERGE_AND_FULL_DATASET_VALIDATION",
            )

    def test_refuses_wrong_server(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "unexpected_mt5_server"):
                self.export_to(folder, FakeMT5(self.rates, server="Exness-MT5Trial7-Other"))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_refuses_non_demo_account(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "not_confirmed_demo"):
                self.export_to(folder, FakeMT5(self.rates, trade_mode=1))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_refuses_disconnected_terminal(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "not_connected"):
                self.export_to(folder, FakeMT5(self.rates, connected=False))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_refuses_non_bid_chart_mode_to_preserve_price_basis(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "chart_mode_must_be_bid"):
                self.export_to(folder, FakeMT5(self.rates, chart_mode=1))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_refuses_missing_or_non_exness_company_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "company_metadata_missing"):
                self.export_to(folder, FakeMT5(self.rates, company=""))
            self.assertEqual(list(Path(folder).iterdir()), [])

        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "company_does_not_identify_exness"):
                self.export_to(folder, FakeMT5(self.rates, company="Other Broker"))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_refuses_empty_history_instead_of_creating_empty_dataset(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "no_completed_h1_bars"):
                self.export_to(folder, FakeMT5([]))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_refuses_fractional_tick_volume(self):
        bad = [bar("2026-01-05T00:00:00Z", volume=12.5)]
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "tick_volume_must_be_non_negative_integer"):
                self.export_to(folder, FakeMT5(bad))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_refuses_conflicting_duplicate_timestamps(self):
        bad = [
            bar("2026-01-05T00:00:00Z"),
            bar("2026-01-05T00:00:00Z", close=2001.5),
        ]
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, "conflicting_duplicate_h1_bar"):
                self.export_to(folder, FakeMT5(bad))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_does_not_export_an_incomplete_current_hour(self):
        with tempfile.TemporaryDirectory() as folder:
            _, _, manifest = self.export_to(folder, FakeMT5(self.rates))
            self.assertEqual(manifest["rows"], 3)

        with tempfile.TemporaryDirectory() as folder:
            result = export_history(
                FakeMT5(self.rates),
                symbol="XAUUSDm",
                expected_server="Exness-MT5Trial7",
                start_utc=self.start,
                end_utc=self.end,
                output_csv=Path(folder) / "recovery.csv",
                output_manifest=Path(folder) / "recovery.manifest.json",
                now_utc=datetime(2026, 1, 5, 2, 30, tzinfo=timezone.utc),
            )
            self.assertEqual(result["rows"], 2)

    def test_refuses_to_overwrite_existing_output_by_default(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "recovery.csv"
            manifest = Path(folder) / "recovery.manifest.json"
            output.write_text("keep", encoding="utf-8")
            with self.assertRaisesRegex(FileExistsError, "refusing_to_overwrite"):
                export_history(
                    FakeMT5(self.rates),
                    symbol="XAUUSDm",
                    expected_server="Exness-MT5Trial7",
                    start_utc=self.start,
                    end_utc=self.end,
                    output_csv=output,
                    output_manifest=manifest,
                    now_utc=self.now,
                )
            self.assertEqual(output.read_text(encoding="utf-8"), "keep")

    def test_requires_explicit_utc_z_and_hour_aligned_boundaries(self):
        with self.assertRaisesRegex(ValueError, "end_in_Z"):
            parse_utc("2026-01-05T00:00:00+00:00")
        with self.assertRaisesRegex(ValueError, "on_the_hour"):
            parse_utc("2026-01-05T00:30:00Z")


if __name__ == "__main__":
    unittest.main()
