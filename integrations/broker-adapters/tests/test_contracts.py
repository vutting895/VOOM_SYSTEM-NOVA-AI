import unittest
from datetime import datetime, timezone

from nova_broker_adapters.contracts import (
    AccountBalance,
    AccountSnapshot,
    AdapterError,
    BrokerConnection,
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

    def test_capability_contract_exposes_only_read_operations(self):
        capabilities = ReadOnlyCapabilities(
            connection_verify=True,
            account_read=True,
            market_data_read=True,
        )
        self.assertEqual(
            capabilities.operations(),
            frozenset({"connection.verify", "account.read", "market_data.read"}),
        )
        self.assertFalse(hasattr(capabilities, "order_submit"))
        self.assertFalse(hasattr(capabilities, "withdraw"))

    def test_adapter_error_uses_safe_diagnostic_code(self):
        error = AdapterError("provider_timeout")
        self.assertEqual(error.code, "provider_timeout")
        with self.assertRaises(ValueError):
            AdapterError("provider timeout with details")

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
