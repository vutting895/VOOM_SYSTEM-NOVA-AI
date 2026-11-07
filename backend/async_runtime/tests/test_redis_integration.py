import os
import unittest
from uuid import uuid4

import redis

from bot_state import (
    _state_key,
    _tenant_market_key,
    cache_latest_price,
    get_bot_status,
    get_latest_price,
    set_bot_status,
)


REDIS_URL = os.environ.get("REDIS_STATE_URL")
@unittest.skipUnless(REDIS_URL, "REDIS_STATE_URL is not configured; real Redis integration test skipped")
class RedisIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        self.client.ping()
        self.tenant_a = "it-a-" + uuid4().hex
        self.tenant_b = "it-b-" + uuid4().hex
        self.bot_id = "bot-" + uuid4().hex

    def tearDown(self):
        self.client.delete(
            _state_key(self.tenant_a, self.bot_id),
            _state_key(self.tenant_b, self.bot_id),
            _tenant_market_key(self.tenant_a, "EURUSD"),
            _tenant_market_key(self.tenant_b, "EURUSD"),
        )

    def test_real_redis_lua_state_transition_and_tenant_isolation(self):
        active = set_bot_status(self.tenant_a, self.bot_id, "ACTIVE", client=self.client)
        self.assertEqual(active["status"], "ACTIVE")
        self.assertEqual(get_bot_status(self.tenant_b, self.bot_id, client=self.client)["status"], "STOPPED")
        paused = set_bot_status(self.tenant_a, self.bot_id, "PAUSED", client=self.client)
        self.assertEqual(paused["status"], "PAUSED")
        with self.assertRaises(ValueError):
            set_bot_status(self.tenant_a, self.bot_id, "STOPPED", client=self.client)

    def test_real_redis_price_cache_is_tenant_scoped(self):
        cache_latest_price(self.tenant_a, "EURUSD", {"bid": 1.08}, client=self.client)
        cache_latest_price(self.tenant_b, "EURUSD", {"bid": 1.18}, client=self.client)
        self.assertEqual(get_latest_price(self.tenant_a, "EURUSD", client=self.client), {"bid": 1.08})
        self.assertEqual(get_latest_price(self.tenant_b, "EURUSD", client=self.client), {"bid": 1.18})


if __name__ == "__main__":
    unittest.main()
