import os
import signal
import subprocess
import sys
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from tasks import scan_market_smc


RUNTIME_DIR = Path(__file__).resolve().parents[1]
REQUIRED_REDIS_VARS = ("REDIS_BROKER_URL", "REDIS_STATE_URL", "REDIS_RESULT_BACKEND_URL")
HAS_REDIS_CONFIG = all(os.environ.get(name) for name in REQUIRED_REDIS_VARS)


def sample_bars(count=32):
    start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    rows = []
    for index in range(count):
        close = 1.0800 + index * 0.0001
        rows.append({
            "timestamp": (start + timedelta(hours=index)).isoformat().replace("+00:00", "Z"),
            "open": close,
            "high": close + 0.0002,
            "low": close - 0.0002,
            "close": close,
            "volume": 1000.0 + index,
        })
    return rows


@unittest.skipUnless(HAS_REDIS_CONFIG, "Redis broker/state/result URLs are not configured")
class CeleryRedisRoundTripTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = subprocess.Popen(
            [
                sys.executable, "-m", "celery", "-A", "tasks", "worker",
                "--loglevel=WARNING", "--pool=solo", "--concurrency=1", "--events",
                "--without-gossip", "--without-mingle", "--hostname=nova-ci-worker@%h",
            ],
            cwd=RUNTIME_DIR,
            env=os.environ.copy(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        cls.app = scan_market_smc.app
        inspector = cls.app.control.inspect(timeout=1.0)
        ready = False
        for _ in range(30):
            if cls.worker.poll() is not None:
                raise RuntimeError("Celery worker exited before becoming ready")
            try:
                replies = inspector.ping() or []
                if replies:
                    ready = True
                    break
            except Exception:
                pass
            time.sleep(0.5)
        if not ready:
            cls.worker.send_signal(signal.SIGTERM)
            cls.worker.wait(timeout=10)
            raise RuntimeError("Celery worker did not respond to inspect.ping()")

    @classmethod
    def tearDownClass(cls):
        if cls.worker.poll() is None:
            cls.worker.send_signal(signal.SIGTERM)
            try:
                cls.worker.wait(timeout=15)
            except subprocess.TimeoutExpired:
                cls.worker.kill()
                cls.worker.wait(timeout=5)

    def test_task_is_enqueued_executed_and_result_is_returned(self):
        async_result = scan_market_smc.delay(
            "EURUSD", "1h", sample_bars(),
            last_bar_closed=True,
        )
        self.assertTrue(async_result.id)
        payload = async_result.get(timeout=30, propagate=True)
        self.assertEqual(payload["status"], "COMPLETED")
        self.assertEqual(payload["engine"], "NOVA_SMC_ELLIOTT_CORE")
        self.assertIn("elliott_wave", payload)
        self.assertFalse(payload["execution"]["orders_enabled"])
        self.assertFalse(payload["execution"]["live_trading_enabled"])


if __name__ == "__main__":
    unittest.main()
