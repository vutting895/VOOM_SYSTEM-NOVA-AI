"""Unit tests for broker-sourced MT5 exposure calculations."""
import unittest
from types import SimpleNamespace

from exposure_snapshot import build_exposure_snapshot


class FakeMT5:
    POSITION_TYPE_BUY = 0
    POSITION_TYPE_SELL = 1
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    ORDER_TYPE_BUY_LIMIT = 2
    ORDER_TYPE_SELL_LIMIT = 3
    ORDER_TYPE_BUY_STOP = 4
    ORDER_TYPE_SELL_STOP = 5
    ORDER_TYPE_BUY_STOP_LIMIT = 6
    ORDER_TYPE_SELL_STOP_LIMIT = 7

    @staticmethod
    def order_calc_profit(side, symbol, volume, entry, stop):
        direction = 1 if side == FakeMT5.ORDER_TYPE_BUY else -1
        return (stop - entry) * volume * 100 * direction


class ExposureSnapshotTests(unittest.TestCase):
    def test_positions_and_pending_orders_are_aggregated_in_account_currency(self):
        position = SimpleNamespace(
            ticket=101, symbol="XAUUSDm", type=FakeMT5.POSITION_TYPE_BUY,
            volume=1.0, price_open=2000.0, price_current=2005.0, sl=1990.0, tp=2020.0,
        )
        pending = SimpleNamespace(
            ticket=202, symbol="XAUUSDm", type=FakeMT5.ORDER_TYPE_SELL_LIMIT,
            volume_current=0.5, price_open=2010.0, sl=2020.0, tp=1990.0,
        )
        account = SimpleNamespace(equity=10000.0, currency="USD", login=12345678, server="Exness-MT5Trial")

        result = build_exposure_snapshot(FakeMT5, account, [position], [pending])

        self.assertEqual(result["open_positions_count"], 1)
        self.assertEqual(result["pending_orders_count"], 1)
        self.assertEqual(result["open_orders_count"], 2)
        self.assertEqual(result["aggregate_position_risk_money"], 1500.0)
        self.assertEqual(result["aggregate_pending_risk_money"], 500.0)
        self.assertEqual(result["aggregate_open_risk_money"], 2000.0)
        self.assertEqual(result["aggregate_open_risk_pct_current_equity"], 20.0)
        self.assertTrue(result["risk_calculation_complete"])
        self.assertEqual(result["account_currency"], "USD")
        self.assertEqual(result["account_login"], "12345678")
        self.assertEqual(result["broker_server"], "Exness-MT5Trial")
        self.assertEqual(result["mode"], "read-only")
        self.assertFalse(result["order_submission_enabled"])
        self.assertEqual(result["policy_attestation"]["status"], "not_attested")

    def test_missing_stop_loss_fails_closed_instead_of_reporting_zero_risk(self):
        position = SimpleNamespace(
            ticket=303, symbol="XAUUSDm", type=FakeMT5.POSITION_TYPE_BUY,
            volume=1.0, price_open=2000.0, sl=0.0, tp=2020.0,
        )
        account = SimpleNamespace(equity=10000.0, currency="USD", login=12345678, server="Exness-MT5Trial")

        result = build_exposure_snapshot(FakeMT5, account, [position], [])

        self.assertFalse(result["risk_calculation_complete"])
        self.assertIsNone(result["aggregate_position_risk_money"])
        self.assertIsNone(result["aggregate_open_risk_money"])
        self.assertIsNone(result["aggregate_open_risk_pct_current_equity"])
        self.assertEqual(result["positions"][0]["risk_status"], "unknown_fail_closed")

    def test_invalid_equity_does_not_produce_a_risk_percentage(self):
        account = SimpleNamespace(equity=0.0, currency="USD")
        result = build_exposure_snapshot(FakeMT5, account, [], [])
        self.assertFalse(result["risk_calculation_complete"])
        self.assertIsNone(result["aggregate_open_risk_money"])
        self.assertIsNone(result["aggregate_open_risk_pct_current_equity"])


if __name__ == "__main__":
    unittest.main()
