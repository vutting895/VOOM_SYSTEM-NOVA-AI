import hashlib
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tools import refresh_wave3_daily_data as daily


def quote(time_value, price=2400.0, spread=24):
    return {
        "time": time_value,
        "open": price,
        "high": price + 0.5,
        "low": price - 0.5,
        "close": price + 0.1,
        "tick_volume": 100,
        "spread": spread,
        "real_volume": 0,
    }


def payload(bars):
    return {
        "symbol": "XAUUSDm",
        "timeframe": "M15",
        "digits": 3,
        "bars": bars,
        "count": len(bars),
        "mode": "read-only",
        "order_submission_enabled": False,
        "as_of": "2026-11-02T00:20:00+00:00",
    }


class TestDailyMT5Refresh(unittest.TestCase):
    def test_normalizer_keeps_only_completed_m15_bars_and_converts_spread_points(self):
        result = daily.normalize_closed_quotes(
            payload([
                quote("2026-11-02T00:00:00Z"),
                quote("2026-11-02T00:15:00Z"),
            ]),
            now_utc=datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc),
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result.iloc[0]["timestamp"].isoformat(), "2026-11-02T00:00:00+00:00")
        self.assertAlmostEqual(float(result.iloc[0]["spread_price"]), 0.024)
        self.assertEqual(int(result.iloc[0]["tick_volume"]), 100)

    def test_baseline_hash_normalizes_git_crlf_checkout_to_canonical_lf(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "baseline.csv"
            path.write_bytes(b"timestamp,open,close\r\n2026-01-01T00:00:00Z,2400,2401\r\n")
            expected = hashlib.sha256(
                b"timestamp,open,close\n2026-01-01T00:00:00Z,2400,2401\n"
            ).hexdigest()
            self.assertEqual(daily.canonical_lf_sha256(path), expected)
            path.write_bytes(b"timestamp,open\r2400,2401\n")
            with self.assertRaisesRegex(ValueError, "non-CRLF"):
                daily.canonical_lf_sha256(path)

    def test_normalizer_rejects_response_that_does_not_prove_read_only_mode(self):
        invalid = payload([quote("2026-11-02T00:00:00Z")])
        invalid["order_submission_enabled"] = True
        with self.assertRaisesRegex(ValueError, "read-only"):
            daily.normalize_closed_quotes(
                invalid,
                now_utc=datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc),
            )

    def test_normalizer_rejects_wrong_symbol_or_precision(self):
        invalid = payload([quote("2026-11-02T00:00:00Z")])
        invalid["symbol"] = "XAUUSD"
        with self.assertRaisesRegex(ValueError, "symbol/timeframe"):
            daily.normalize_closed_quotes(
                invalid,
                now_utc=datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc),
            )
        invalid = payload([quote("2026-11-02T00:00:00Z")])
        invalid["digits"] = 2
        with self.assertRaisesRegex(ValueError, "digits"):
            daily.normalize_closed_quotes(
                invalid,
                now_utc=datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc),
            )

    def test_refresh_rejects_non_exness_account_without_creating_orphan_state(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base = root / "base.csv"
            state = root / "state"
            base.write_text(
                "timestamp,open,high,low,close,tick_volume,spread_price\n"
                "2026-11-01T23:30:00Z,2400,2400.5,2399.5,2400.1,100,0.024\n",
                encoding="utf-8",
            )
            expected = hashlib.sha256(base.read_bytes()).hexdigest()
            with (
                patch.object(daily, "EXPECTED_BASE_SHA256", expected),
                patch.object(daily, "_private_credentials", return_value=("tenant-test-1234", "x" * 40)),
                patch.object(daily, "_bridge_get", side_effect=[
                    {"status": "ok", "terminal_connected": True, "account_session_available": True,
                     "mode": "read-only", "order_submission_enabled": False},
                    {"connected": True, "server": "OtherBroker-Demo", "currency": "USD",
                     "mode": "read-only", "order_submission_enabled": False},
                ]),
            ):
                with self.assertRaisesRegex(RuntimeError, "Exness USD Demo"):
                    daily.refresh_dataset(base, state, now_utc=datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc))
            self.assertFalse((state / "XAUUSDm_M15_daily.csv").exists())

    def test_refresh_allows_fresh_bridge_catchup_when_persisted_baseline_is_over_96_hours_old(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base = root / "base.csv"
            state = root / "state"
            base.write_text(
                "timestamp,open,high,low,close,tick_volume,spread_price\n"
                "2026-10-25T00:00:00Z,2400,2400.5,2399.5,2400.1,100,0.024\n",
                encoding="utf-8",
            )
            expected = hashlib.sha256(base.read_bytes()).hexdigest()
            now = datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc)
            fresh_quotes = payload([
                quote("2026-10-25T00:00:00Z"),
                quote("2026-11-02T00:00:00Z"),
                quote("2026-11-02T00:15:00Z"),
            ])
            with (
                patch.object(daily, "EXPECTED_BASE_SHA256", expected),
                patch.object(daily, "_private_credentials", return_value=("tenant-test-1234", "x" * 40)),
                patch.object(daily, "_bridge_get", side_effect=[
                    {"status": "ok", "terminal_connected": True, "account_session_available": True,
                     "mode": "read-only", "order_submission_enabled": False},
                    {"connected": True, "server": "Exness-MT5Trial7", "currency": "USD",
                     "mode": "read-only", "order_submission_enabled": False},
                    fresh_quotes,
                ]),
            ):
                result = daily.refresh_dataset(base, state, now_utc=now)
            self.assertEqual(result["status"], "updated")
            self.assertEqual(result["new_bars"], 1)
            self.assertEqual(result["last_closed_bar_utc"], "2026-11-02T00:00:00+00:00")

    def test_refresh_still_rejects_stale_bridge_quotes_during_catchup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base = root / "base.csv"
            state = root / "state"
            base.write_text(
                "timestamp,open,high,low,close,tick_volume,spread_price\n"
                "2026-10-24T00:00:00Z,2400,2400.5,2399.5,2400.1,100,0.024\n",
                encoding="utf-8",
            )
            expected = hashlib.sha256(base.read_bytes()).hexdigest()
            now = datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc)
            stale_quotes = payload([quote("2026-10-24T00:00:00Z")])
            with (
                patch.object(daily, "EXPECTED_BASE_SHA256", expected),
                patch.object(daily, "_private_credentials", return_value=("tenant-test-1234", "x" * 40)),
                patch.object(daily, "_bridge_get", side_effect=[
                    {"status": "ok", "terminal_connected": True, "account_session_available": True,
                     "mode": "read-only", "order_submission_enabled": False},
                    {"connected": True, "server": "Exness-MT5Trial7", "currency": "USD",
                     "mode": "read-only", "order_submission_enabled": False},
                    stale_quotes,
                ]),
            ):
                with self.assertRaisesRegex(ValueError, "Latest closed MT5 quote is stale"):
                    daily.refresh_dataset(base, state, now_utc=now)
            self.assertFalse((state / "XAUUSDm_M15_daily.csv").exists())

    def test_dataset_pair_recovery_restores_previous_csv_and_manifest_after_interrupted_replace(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            csv_path = state / "XAUUSDm_M15_daily.csv"
            manifest_path = state / "daily_data_manifest.json"
            csv_path.write_text("new,csv\\n", encoding="utf-8")
            manifest_path.write_text('{"new": true}', encoding="utf-8")
            (state / "old.csv.bak").write_text("old,csv\\n", encoding="utf-8")
            (state / "old.manifest.bak").write_text('{"old": true}', encoding="utf-8")
            (state / "new.csv.tmp").write_text("partial", encoding="utf-8")
            (state / "new.manifest.tmp").write_text("partial", encoding="utf-8")
            manifest_path.with_suffix(".transaction.json").write_text(json.dumps({
                "csv_backup": "old.csv.bak",
                "manifest_backup": "old.manifest.bak",
                "csv_temp": "new.csv.tmp",
                "manifest_temp": "new.manifest.tmp",
                "csv_existed": True,
                "manifest_existed": True,
            }), encoding="utf-8")
            daily._recover_dataset_pair(csv_path, manifest_path)
            self.assertEqual(csv_path.read_text(encoding="utf-8"), "old,csv\\n")
            self.assertEqual(json.loads(manifest_path.read_text(encoding="utf-8")), {"old": True})
            self.assertFalse(manifest_path.with_suffix(".transaction.json").exists())

    def test_refresh_rejects_catchup_without_saved_tail_overlap(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base = root / "base.csv"
            state = root / "state"
            base.write_text(
                "timestamp,open,high,low,close,tick_volume,spread_price\n"
                "2026-10-25T00:00:00Z,2400,2400.5,2399.5,2400.1,100,0.024\n",
                encoding="utf-8",
            )
            expected = hashlib.sha256(base.read_bytes()).hexdigest()
            now = datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc)
            quotes = payload([quote("2026-11-02T00:00:00Z"), quote("2026-11-02T00:15:00Z")])
            with (
                patch.object(daily, "EXPECTED_BASE_SHA256", expected),
                patch.object(daily, "_private_credentials", return_value=("tenant-test-1234", "x" * 40)),
                patch.object(daily, "_bridge_get", side_effect=[
                    {"status": "ok", "terminal_connected": True, "account_session_available": True,
                     "mode": "read-only", "order_submission_enabled": False},
                    {"connected": True, "server": "Exness-MT5Trial7", "currency": "USD",
                     "mode": "read-only", "order_submission_enabled": False},
                    quotes,
                ]),
            ):
                with self.assertRaisesRegex(ValueError, "does not overlap the saved last bar"):
                    daily.refresh_dataset(base, state, now_utc=now)
            self.assertFalse((state / "XAUUSDm_M15_daily.csv").exists())

    def test_refresh_persists_merged_bars_manifest_and_no_change_run(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base = root / "base.csv"
            state = root / "state"
            base.write_text(
                "timestamp,open,high,low,close,tick_volume,spread_price\n"
                "2026-11-01T23:30:00Z,2400,2400.5,2399.5,2400.1,100,0.024\n"
                "2026-11-01T23:45:00Z,2400,2400.5,2399.5,2400.1,100,0.024\n",
                encoding="utf-8",
            )
            expected = hashlib.sha256(base.read_bytes()).hexdigest()
            quotes = payload([
                quote("2026-11-01T23:30:00Z"),
                quote("2026-11-01T23:45:00Z"),
                quote("2026-11-02T00:00:00Z"),
                quote("2026-11-02T00:15:00Z"),
            ])
            now = datetime(2026, 11, 2, 0, 20, tzinfo=timezone.utc)
            with (
                patch.object(daily, "EXPECTED_BASE_SHA256", expected),
                patch.object(daily, "_private_credentials", return_value=("tenant-test-1234", "x" * 40)),
                patch.object(daily, "_bridge_get", side_effect=[
                    {"status": "ok", "terminal_connected": True, "account_session_available": True, "mode": "read-only", "order_submission_enabled": False},
                    {"connected": True, "server": "Exness-MT5Trial7", "currency": "USD", "mode": "read-only", "order_submission_enabled": False},
                    quotes,
                    {"status": "ok", "terminal_connected": True, "account_session_available": True, "mode": "read-only", "order_submission_enabled": False},
                    {"connected": True, "server": "Exness-MT5Trial7", "currency": "USD", "mode": "read-only", "order_submission_enabled": False},
                    quotes,
                ]),
            ):
                first = daily.refresh_dataset(base, state, now_utc=now)
                self.assertEqual(first["status"], "updated")
                self.assertEqual(first["new_bars"], 1)
                self.assertEqual(first["total_bars"], 3)
                self.assertFalse(first["order_submission_enabled"])
                manifest_path = state / "daily_data_manifest.json"
                state_csv = state / "XAUUSDm_M15_daily.csv"
                self.assertTrue(manifest_path.is_file())
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertEqual(manifest["data_sha256"], hashlib.sha256(state_csv.read_bytes()).hexdigest())
                second = daily.refresh_dataset(base, state, now_utc=now)
                self.assertEqual(second["status"], "no_new_closed_bars")
                self.assertTrue(manifest_path.is_file())


if __name__ == "__main__":
    unittest.main()
