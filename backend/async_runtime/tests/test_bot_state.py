import json
import unittest

from bot_state import (
    bot_is_active,
    cache_latest_price,
    get_bot_status,
    get_latest_price,
    set_bot_status,
)


class FakeRedis:
    def __init__(self):
        self.hashes = {}
        self.values = {}

    def eval(self, _script, numkeys, key, status, mode, now):
        self.assert_one_key(numkeys)
        current_row = self.hashes.setdefault(key, {})
        current = current_row.get("status", "STOPPED")
        allowed = {
            ("STOPPED", "ACTIVE"),
            ("ACTIVE", "PAUSED"), ("ACTIVE", "STOPPING"), ("ACTIVE", "ERROR"),
            ("PAUSED", "ACTIVE"), ("PAUSED", "STOPPING"), ("PAUSED", "STOPPED"), ("PAUSED", "ERROR"),
            ("STOPPING", "STOPPED"), ("STOPPING", "ERROR"), ("ERROR", "STOPPED"),
        }
        if current != status and (current, status) not in allowed:
            return [0, current]
        revision = int(current_row.get("revision", "0")) + 1
        current_row.update({
            "status": status, "mode": mode, "updated_at": now,
            "revision": str(revision),
        })
        return [1, status, revision]

    @staticmethod
    def assert_one_key(numkeys):
        if int(numkeys) != 1:
            raise AssertionError("expected one Redis key")

    def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    def setex(self, key, ttl, value):
        self.values[key] = (int(ttl), value)

    def get(self, key):
        row = self.values.get(key)
        return row[1] if row else None


class BotStateTests(unittest.TestCase):
    def setUp(self):
        self.redis = FakeRedis()

    def test_missing_state_defaults_to_stopped(self):
        state = get_bot_status("tenant-a", "bot-1", client=self.redis)
        self.assertEqual(state["status"], "STOPPED")
        self.assertFalse(bot_is_active("tenant-a", "bot-1", client=self.redis))

    def test_allowed_transitions_and_revision(self):
        active = set_bot_status("tenant-a", "bot-1", "ACTIVE", client=self.redis)
        paused = set_bot_status("tenant-a", "bot-1", "PAUSED", client=self.redis)
        self.assertEqual(active["revision"], 1)
        self.assertEqual(paused["revision"], 2)
        self.assertFalse(bot_is_active("tenant-a", "bot-1", client=self.redis))

    def test_invalid_transition_is_rejected(self):
        with self.assertRaises(ValueError):
            set_bot_status("tenant-a", "bot-1", "STOPPED", client=self.redis)

    def test_states_are_tenant_scoped(self):
        set_bot_status("tenant-a", "bot-1", "ACTIVE", client=self.redis)
        self.assertTrue(bot_is_active("tenant-a", "bot-1", client=self.redis))
        self.assertFalse(bot_is_active("tenant-b", "bot-1", client=self.redis))

    def test_price_cache_is_tenant_scoped(self):
        payload_a = {"bid": 1.08, "ask": 1.09}
        payload_b = {"bid": 1.18, "ask": 1.19}
        cache_latest_price("tenant-a", "EURUSD", payload_a, client=self.redis)
        cache_latest_price("tenant-b", "EURUSD", payload_b, client=self.redis)
        self.assertEqual(get_latest_price("tenant-a", "EURUSD", client=self.redis), payload_a)
        self.assertEqual(get_latest_price("tenant-b", "EURUSD", client=self.redis), payload_b)

    def test_invalid_tenant_key_is_rejected(self):
        with self.assertRaises(ValueError):
            get_bot_status("tenant/other", "bot-1", client=self.redis)


if __name__ == "__main__":
    unittest.main()
