import math
import unittest
from datetime import datetime, timezone

from nova_broker_adapters.contracts import (
    AccountBalance,
    AccountSnapshot,
    AdapterError,
    BrokerConnection,
    BrokerReadOnlyAdapter,
    ConnectionVerification,
    MarketDataPoint,
    ReadOnlyCapabilities,
)


class BrokerContractTests(unittest.TestCase):
    def test_connection_contract_contains_only_non_secret_metadata(self):
        connection = BrokerConnection(
            connection_id="conn_123",
            owner_id="user_123",
            provider_id="exness_mt5",
            environment="demo",
            state="configured",
            capabilities=ReadOnlyCapabilities(),
        )
        self.assertEqual(connection.provider_id, "exness_mt5")
        self.assertNotIn("password", connection.__dataclass_fields__)
        self.assertNotIn("api_key", connection.__dataclass_fields__)
        self.assertNotIn("secret", connection.__dataclass_fields__)

    def test_capabilities_match_read_only_adapter_methods(self):
        capabilities = ReadOnlyCapabilities(
            connection_verify=True,
            account_read=True,
            market_data_read=True,
        )
        self.assertEqual(
            capabilities.operations(),
            frozenset({"connection.verify", "account.read", "market_data.read"}),
        )
        self.assertTrue(hasattr(BrokerReadOnlyAdapter, "market_data_snapshot"))
        self.assertFalse(hasattr(BrokerReadOnlyAdapter, "order_submit"))
        self.assertFalse(hasattr(BrokerReadOnlyAdapter, "withdraw"))

    def test_adapter_error_contains_only_safe_code_and_generic_message(self):
        error = AdapterError("provider_timeout")
        self.assertEqual(error.code, "provider_timeout")
        self.assertEqual(str(error), "Broker adapter operation failed")
        with self.assertRaises(ValueError):
            AdapterError("provider timeout with details")
        with self.assertRaises(TypeError):
            AdapterError("provider_timeout", "raw provider response with secret")

    def test_connection_capability_flags_must_be_boolean(self):
        with self.assertRaises(AdapterError):
            ReadOnlyCapabilities(account_read="yes").validate()

    def test_account_snapshot_requires_timestamp_and_currency(self):
        snapshot = AccountSnapshot(
            provider_id="binance",
            connection_id="conn_123",
            balances=(AccountBalance(currency="USDT", total=12.5),),
            as_of=datetime.now(timezone.utc),
        )
        self.assertEqual(snapshot.balances[0].currency, "USDT")
        with self.assertRaises(ValueError):
            AccountBalance(currency="USDT$", total=12.5)
        with self.assertRaises(ValueError):
            AccountBalance(currency="ยูเอสดี", total=12.5)

    def test_balance_values_must_be_finite_but_signed_values_are_preserved(self):
        balance = AccountBalance(currency="USD", total=-10.0, available=-2.0)
        self.assertEqual(balance.total, -10.0)
        self.assertEqual(balance.available, -2.0)
        for invalid in (math.nan, math.inf, -math.inf):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    AccountBalance(currency="USD", total=invalid)
                with self.assertRaises(ValueError):
                    AccountBalance(currency="USD", total=1.0, available=invalid)

    def test_masked_provider_account_id_requires_a_mask_marker(self):
        valid = ConnectionVerification(
            state="identity_verified",
            checked_at=datetime.now(timezone.utc),
            provider_account_id_masked="****1234",
        )
        self.assertEqual(valid.provider_account_id_masked, "****1234")
        with self.assertRaises(ValueError):
            ConnectionVerification(
                state="identity_verified",
                checked_at=datetime.now(timezone.utc),
                provider_account_id_masked="1234567890",
            )

    def test_market_data_capability_has_a_typed_read_surface(self):
        point = MarketDataPoint(
            symbol="BTC/USDT",
            price=65000.0,
            currency="USDT",
            as_of=datetime.now(timezone.utc),
        )
        self.assertEqual(point.symbol, "BTC/USDT")
        self.assertEqual(point.price, 65000.0)
        with self.assertRaises(ValueError):
            MarketDataPoint(
                symbol="BTC/USDT",
                price=math.nan,
                currency="USDT",
                as_of=datetime.now(timezone.utc),
            )

    def test_naive_timestamp_is_rejected(self):
        with self.assertRaises(ValueError):
            AccountSnapshot(
                provider_id="ibkr",
                connection_id="conn_123",
                balances=(),
                as_of=datetime.now(),
            )


if __name__ == "__main__":
    unittest.main()
