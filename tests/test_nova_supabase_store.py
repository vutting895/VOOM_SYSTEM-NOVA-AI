import importlib.util
import json
import unittest
import uuid
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "workers" / "data-ingestion" / "supabase_store.py"
SPEC = importlib.util.spec_from_file_location("nova_supabase_store", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SupabaseStore = MODULE.SupabaseStore


class FakeResponse:
    status = 201
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        return False
    def read(self):
        return b""


class CaptureOpener:
    def __init__(self):
        self.calls = []
    def __call__(self, request, timeout=0):
        self.calls.append((request, timeout))
        return FakeResponse()


class SupabaseStoreTests(unittest.TestCase):
    def setUp(self):
        self.opener = CaptureOpener()
        self.store = SupabaseStore(
            "https://project.supabase.co",
            "service-role-test-secret",
            opener=self.opener,
        )

    def test_shared_candles_keep_decimal_precision_and_use_upsert(self):
        count = self.store.upsert_candles(
            [{
                "timestamp": "2026-11-02T00:00:00Z",
                "open": "2000.123456789012",
                "high": "2001.123456789012",
                "low": "1999.123456789012",
                "close": "2000.987654321098",
                "volume": "1.000000000001",
            }],
            symbol="XAUUSD",
            timeframe="M15",
            source="binance_public",
            environment="public",
        )
        self.assertEqual(count, 1)
        request, timeout = self.opener.calls[0]
        self.assertEqual(request.method, "POST")
        self.assertIn("on_conflict=scope_key", request.full_url)
        self.assertIn("resolution=merge-duplicates", request.get_header("Prefer"))
        row = json.loads(request.data.decode("utf-8"))[0]
        self.assertEqual(row["scope_key"], "shared")
        self.assertEqual(row["open"], "2000.123456789012")
        self.assertEqual(row["volume"], "1.000000000001")
        self.assertEqual(timeout, 20)

    def test_exness_data_requires_owner_and_demo_environment(self):
        candle = {"timestamp":"2026-11-02T00:00:00Z","open":"1","high":"2","low":"0.5","close":"1.5","volume":"0"}
        with self.assertRaisesRegex(ValueError, "exness_demo_requires_owner"):
            self.store.upsert_candles(
                [candle], symbol="XAUUSD", timeframe="M15",
                source="exness_mt5_demo", environment="demo",
            )
        owner = str(uuid.uuid4())
        self.assertEqual(self.store.upsert_candles(
            [candle], symbol="XAUUSD", timeframe="M15",
            source="exness_mt5_demo", environment="demo", owner_id=owner,
        ), 1)
        row = json.loads(self.opener.calls[0][0].data.decode("utf-8"))[0]
        self.assertEqual(row["owner_id"], owner)
        self.assertEqual(row["scope_key"], owner)

    def test_rejects_bad_ohlcv_and_naive_timestamp(self):
        invalid = {"timestamp":"2026-11-02T00:00:00","open":"2","high":"1","low":"0","close":"2","volume":"0"}
        with self.assertRaisesRegex(ValueError, "bar_time_must_include_timezone"):
            self.store.upsert_candles([invalid], symbol="XAUUSD", timeframe="M15", source="binance_public", environment="public")
        invalid["timestamp"] = "2026-11-02T00:00:00Z"
        with self.assertRaisesRegex(ValueError, "invalid_ohlcv_relationship"):
            self.store.upsert_candles([invalid], symbol="XAUUSD", timeframe="M15", source="binance_public", environment="public")

    def test_rejects_non_supabase_hosts_and_non_https_remote_urls(self):
        with self.assertRaisesRegex(ValueError, "invalid_supabase_url"):
            SupabaseStore("https://attacker.example", "secret")
        with self.assertRaisesRegex(ValueError, "invalid_supabase_url"):
            SupabaseStore("http://project.supabase.co", "secret")

    def test_batches_large_payloads(self):
        candle = {"timestamp":"2026-11-02T00:00:00Z","open":"1","high":"2","low":"0.5","close":"1.5","volume":"0"}
        count = self.store.upsert_candles(
            [candle] * 3, symbol="BTCUSDT", timeframe="1h",
            source="binance_public", environment="public", batch_size=2,
        )
        self.assertEqual(count, 3)
        self.assertEqual(len(self.opener.calls), 2)

    def test_record_run_payload_contains_no_secret_fields(self):
        self.store.record_ingestion_run(
            source="binance_public", environment="public", symbol="BTCUSDT",
            timeframe="1h", status="completed", owner_id=None,
            received_count=3, submitted_count=3,
        )
        request, _ = self.opener.calls[0]
        row = json.loads(request.data.decode("utf-8"))[0]
        self.assertNotIn("service_role_key", row)
        self.assertNotIn("token", row)
        self.assertEqual(row["status"], "completed")


if __name__ == "__main__":
    unittest.main()
