import os
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

import dispatcher_api


TENANT_ID = "11111111-1111-4111-8111-111111111111"
CONNECTION_ID = "22222222-2222-4222-8222-222222222222"


def valid_payload():
    return dispatcher_api.DispatchRequest(
        tenant_id=TENANT_ID,
        connection_id=CONNECTION_ID,
        symbol="eurusd",
        timeframe="5m",
        bars=[{
            "timestamp": f"2026-11-07T00:{index:02d}:00Z",
            "open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15, "volume": 10
        } for index in range(25)],
        last_bar_closed=True,
        source_metadata={
            "provider": "exness_mt5_demo",
            "connection_id": CONNECTION_ID,
            "fetched_at": "2026-11-07T01:00:00Z",
            "source_as_of": "2026-11-07T00:59:00Z"
        },
    )


class InternalDispatcherTests(unittest.TestCase):
    def test_requires_high_entropy_server_token(self):
        with patch.dict(os.environ, {"NOVA_ANALYSIS_INTERNAL_TOKEN": "short"}):
            with self.assertRaises(HTTPException) as raised:
                dispatcher_api._authorize_internal("Bearer short")
        self.assertEqual(raised.exception.status_code, 503)

    def test_rejects_wrong_internal_token(self):
        with patch.dict(os.environ, {"NOVA_ANALYSIS_INTERNAL_TOKEN": "a" * 48}):
            with self.assertRaises(HTTPException) as raised:
                dispatcher_api._authorize_internal("Bearer " + "b" * 48)
        self.assertEqual(raised.exception.status_code, 401)

    def test_dispatches_tenant_scoped_closed_bars_without_user_credentials(self):
        fake_task = Mock(id="task-123")
        fake_task.delay.return_value = fake_task
        with patch.dict(os.environ, {"NOVA_ANALYSIS_INTERNAL_TOKEN": "a" * 48}), \
             patch.object(dispatcher_api.scan_market_smc, "delay", return_value=fake_task) as delay, \
             patch.object(dispatcher_api, "get_redis_client") as redis_client:
            response = dispatcher_api.dispatch_smc(valid_payload(), authorization="Bearer " + "a" * 48)

        self.assertEqual(response["task_id"], "task-123")
        self.assertEqual(response["status"], "QUEUED")
        args, kwargs = delay.call_args
        self.assertEqual(args[0:2], ("EURUSD", "5m"))
        self.assertEqual(len(args[2]), 25)
        self.assertTrue(kwargs["last_bar_closed"])
        self.assertEqual(kwargs["tenant_id"], TENANT_ID)
        self.assertNotIn("bot_id", kwargs)
        self.assertEqual(kwargs["source_metadata"]["connection_id"], CONNECTION_ID)
        self.assertNotIn("access_token", kwargs)
        self.assertFalse(response["live_trading_enabled"])
        redis_client.return_value.setex.assert_called_once()
        owner_key, owner_ttl, owner_value = redis_client.return_value.setex.call_args.args
        self.assertEqual(owner_key, "nova:task-owner:task-123")
        self.assertEqual(owner_ttl, 3600)
        self.assertIn(TENANT_ID, owner_value)
        self.assertIn(CONNECTION_ID, owner_value)

    def test_rejects_unclosed_candle_payload(self):
        raw = valid_payload().model_dump()
        raw["last_bar_closed"] = False
        with self.assertRaises(Exception):
            dispatcher_api.DispatchRequest.model_validate(raw)

    def test_rejects_extra_fields_that_could_smuggle_credentials(self):
        raw = valid_payload().model_dump()
        raw["broker_password"] = "must-never-be-accepted"
        with self.assertRaises(Exception):
            dispatcher_api.DispatchRequest.model_validate(raw)

    def test_rejects_non_exness_market_source(self):
        raw = valid_payload().model_dump()
        raw["source_metadata"]["provider"] = "unknown_provider"
        with self.assertRaises(Exception):
            dispatcher_api.DispatchRequest.model_validate(raw)


    def test_rejects_source_connection_mismatch(self):
        raw = valid_payload().model_dump()
        raw["source_metadata"]["connection_id"] = "33333333-3333-4333-8333-333333333333"
        with self.assertRaises(Exception):
            dispatcher_api.DispatchRequest.model_validate(raw)


    def test_rejects_extra_fields_inside_ohlc_bar(self):
        raw = valid_payload().model_dump()
        raw["bars"][0]["broker_password"] = "must-never-be-accepted"
        with self.assertRaises(Exception):
            dispatcher_api.DispatchRequest.model_validate(raw)

    def test_rejects_non_chronological_ohlc_before_enqueue(self):
        raw = valid_payload().model_dump()
        raw["bars"][8]["timestamp"] = raw["bars"][7]["timestamp"]
        with self.assertRaises(Exception):
            dispatcher_api.DispatchRequest.model_validate(raw)

    def test_rejects_inconsistent_ohlc_before_enqueue(self):
        raw = valid_payload().model_dump()
        raw["bars"][0]["high"] = 0.5
        with self.assertRaises(Exception):
            dispatcher_api.DispatchRequest.model_validate(raw)


    def test_task_status_is_scoped_to_tenant_and_connection(self):
        import json
        fake_redis = Mock()
        fake_redis.get.return_value = json.dumps({
            "tenant_id": TENANT_ID, "connection_id": CONNECTION_ID
        })
        fake_result = Mock()
        fake_result.state = "SUCCESS"
        fake_result.ready.return_value = True
        fake_result.successful.return_value = True
        fake_result.failed.return_value = False
        fake_result.result = {"symbol": "EURUSD", "status": "COMPLETED"}
        with patch.dict(os.environ, {"NOVA_ANALYSIS_INTERNAL_TOKEN": "a" * 48}), \
             patch.object(dispatcher_api, "get_redis_client", return_value=fake_redis), \
             patch.object(dispatcher_api, "AsyncResult", return_value=fake_result):
            response = dispatcher_api.get_analysis_task(
                "task-123", TENANT_ID, CONNECTION_ID, "Bearer " + "a" * 48
            )
        self.assertEqual(response["status"], "SUCCESS")
        self.assertEqual(response["result"]["symbol"], "EURUSD")
        self.assertFalse(response["live_trading_enabled"])

    def test_task_status_hides_tasks_from_other_tenants(self):
        import json
        fake_redis = Mock()
        fake_redis.get.return_value = json.dumps({
            "tenant_id": TENANT_ID, "connection_id": CONNECTION_ID
        })
        with patch.dict(os.environ, {"NOVA_ANALYSIS_INTERNAL_TOKEN": "a" * 48}), \
             patch.object(dispatcher_api, "get_redis_client", return_value=fake_redis):
            with self.assertRaises(HTTPException) as raised:
                dispatcher_api.get_analysis_task(
                    "task-123", "33333333-3333-4333-8333-333333333333",
                    CONNECTION_ID, "Bearer " + "a" * 48
                )
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
