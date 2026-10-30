import unittest
from datetime import datetime, timezone

from nova_broker_adapters.contracts import AdapterError, BrokerConnection, ReadOnlyCapabilities
from nova_broker_adapters.exness_mt5 import ExnessMT5Adapter, HubResponse

NOW = datetime.now(timezone.utc).isoformat()
CONNECTION_ID = "e9a5f624-14ec-4f1d-8caf-97f2b91d0441"
OWNER_ID = "customer-a"


def connection(*, owner=OWNER_ID, provider="exness_mt5", environment="demo", state="connected", market_data=True):
    return BrokerConnection(
        connection_id=CONNECTION_ID,
        owner_id=owner,
        provider_id=provider,
        environment=environment,
        state=state,
        capabilities=ReadOnlyCapabilities(True, True, market_data),
    )


class FakeHubClient:
    def __init__(self, owner=OWNER_ID, check=None, account=None, quotes=None, error=None):
        self.authenticated_owner_id = owner
        self.check_response = check or HubResponse(200, {
            "connectionId": CONNECTION_ID, "state": "data_verified", "dataVerified": True,
            "accountReadSucceeded": True, "checkedAt": NOW,
            "ordersEnabled": False, "liveTradingEnabled": False,
        })
        self.account_response = account or HubResponse(200, {
            "connectionId": CONNECTION_ID, "state": "data_verified", "dataVerified": True,
            "ordersEnabled": False, "liveTradingEnabled": False,
            "account": {
                "connected": True, "broker": "Exness", "platform": "MT5", "environment": "demo",
                "currency": "USD", "balance": 1000.0, "equity": 980.0, "margin": 120.0,
                "free_margin": 860.0, "margin_level": 816.6667, "mode": "read-only",
                "order_submission_enabled": False, "as_of": NOW,
            },
        })
        self.quotes = quotes or {}
        self.error = error
        self.calls = []
        self.closed = False

    async def check_connection(self, connection_id):
        self.calls.append(("check", connection_id))
        if self.error:
            raise RuntimeError(self.error)
        return self.check_response

    async def read_account(self, connection_id):
        self.calls.append(("account", connection_id))
        if self.error:
            raise RuntimeError(self.error)
        return self.account_response

    async def read_quotes(self, connection_id, *, symbol, timeframe, count):
        self.calls.append(("quotes", connection_id, symbol, timeframe, count))
        if self.error:
            raise RuntimeError(self.error)
        return self.quotes.get(symbol, HubResponse(200, {
            "connectionId": CONNECTION_ID, "state": "data_verified", "dataVerified": True,
            "ordersEnabled": False, "liveTradingEnabled": False,
            "quote": {
                "symbol": symbol, "timeframe": timeframe,
                "tick": {"bid": 2000.0, "ask": 2000.2, "last": 2000.1, "time": NOW},
                "bars": [], "mode": "read-only", "order_submission_enabled": False, "as_of": NOW,
            },
        }))

    async def close(self):
        self.closed = True


class ExnessMT5AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_verify_uses_user_bound_system_hub_and_reports_data_verified(self):
        hub = FakeHubClient()
        result = await ExnessMT5Adapter(hub).verify(connection())
        self.assertEqual(result.state, "data_verified")
        self.assertEqual(hub.calls, [("check", CONNECTION_ID)])

    async def test_owner_mismatch_fails_before_any_hub_request(self):
        hub = FakeHubClient(owner="customer-b")
        with self.assertRaises(AdapterError) as caught:
            await ExnessMT5Adapter(hub).account_snapshot(connection())
        self.assertEqual(caught.exception.code, "owner_scope_mismatch")
        self.assertEqual(hub.calls, [])

    async def test_invalid_connection_id_is_rejected_before_hub_request(self):
        hub = FakeHubClient()
        invalid = BrokerConnection("not-a-uuid", OWNER_ID, "exness_mt5", "demo", "connected", ReadOnlyCapabilities())
        with self.assertRaises(AdapterError) as caught:
            await ExnessMT5Adapter(hub).verify(invalid)
        self.assertEqual(caught.exception.code, "invalid_connection_id")
        self.assertEqual(hub.calls, [])

    async def test_provider_environment_and_revocation_are_fail_closed(self):
        hub = FakeHubClient()
        adapter = ExnessMT5Adapter(hub)
        for conn in (
            connection(provider="binance"),
            connection(environment="live"),
            connection(state="revoked"),
            connection(state="disabled"),
        ):
            with self.subTest(connection=conn):
                with self.assertRaises(AdapterError):
                    await adapter.verify(conn)
        self.assertEqual(hub.calls, [])

    async def test_account_snapshot_maps_balance_and_margin_metrics(self):
        result = await ExnessMT5Adapter(FakeHubClient()).account_snapshot(connection())
        self.assertEqual(result.provider_id, "exness_mt5")
        self.assertEqual(result.balances[0].currency, "USD")
        self.assertEqual(result.balances[0].total, 1000.0)
        self.assertEqual(result.metrics.equity, 980.0)
        self.assertEqual(result.metrics.free_margin, 860.0)

    async def test_account_snapshot_rejects_write_enabled_response(self):
        body = dict(FakeHubClient().account_response.body)
        body["ordersEnabled"] = True
        hub = FakeHubClient(account=HubResponse(200, body))
        with self.assertRaises(AdapterError) as caught:
            await ExnessMT5Adapter(hub).account_snapshot(connection())
        self.assertEqual(caught.exception.code, "read_only_guard_missing")

    async def test_market_data_returns_mid_without_inventing_quote_currency(self):
        hub = FakeHubClient()
        points = await ExnessMT5Adapter(hub).market_data_snapshot(connection(), ("XAUUSDm",))
        self.assertEqual(len(points), 1)
        self.assertEqual(points[0].price, 2000.1)
        self.assertEqual(points[0].price_basis, "mid")
        self.assertIsNone(points[0].currency)
        self.assertEqual(hub.calls[0], ("quotes", CONNECTION_ID, "XAUUSDm", "M5", 1))

    async def test_market_data_rejects_wrong_symbol_and_unbounded_inputs(self):
        wrong = HubResponse(200, {
            "connectionId": CONNECTION_ID, "state": "data_verified", "dataVerified": True,
            "ordersEnabled": False, "liveTradingEnabled": False,
            "quote": {
                "symbol": "EURUSD", "timeframe": "M5", "tick": {"last": 1.1, "time": NOW},
                "mode": "read-only", "order_submission_enabled": False, "as_of": NOW,
            },
        })
        hub = FakeHubClient(quotes={"XAUUSDm": wrong})
        adapter = ExnessMT5Adapter(hub)
        with self.assertRaises(AdapterError) as caught:
            await adapter.market_data_snapshot(connection(), ("XAUUSDm",))
        self.assertEqual(caught.exception.code, "hub_symbol_mismatch")
        with self.assertRaises(AdapterError):
            await adapter.market_data_snapshot(connection(), tuple(f"SYM{i}" for i in range(11)))
        with self.assertRaises(AdapterError):
            await adapter.market_data_snapshot(connection(), (["not-hashable"],))

    async def test_market_data_capability_is_enforced(self):
        adapter = ExnessMT5Adapter(FakeHubClient())
        with self.assertRaises(AdapterError) as caught:
            await adapter.market_data_snapshot(connection(market_data=False), ("XAUUSDm",))
        self.assertEqual(caught.exception.code, "capability_not_granted")

    async def test_raw_transport_exception_is_not_exposed(self):
        hub = FakeHubClient(error="token=do-not-leak")
        with self.assertRaises(AdapterError) as caught:
            await ExnessMT5Adapter(hub).verify(connection())
        self.assertEqual(str(caught.exception), "Broker adapter operation failed")
        self.assertNotIn("do-not-leak", str(caught.exception))

    async def test_close_delegates_to_injected_hub_client(self):
        hub = FakeHubClient()
        await ExnessMT5Adapter(hub).close()
        self.assertTrue(hub.closed)


if __name__ == "__main__":
    unittest.main()
