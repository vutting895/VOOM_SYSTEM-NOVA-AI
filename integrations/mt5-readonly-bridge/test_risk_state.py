"""Durable broker-day and candidate-risk unit tests."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from risk_state import calculate_candidate_risk, load_or_capture_broker_day_baseline


class FakeMT5:
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1

    @staticmethod
    def symbol_info(symbol):
        if symbol != "XAUUSDm":
            return None
        return SimpleNamespace(volume_min=0.01, volume_max=100.0, volume_step=0.01)

    @staticmethod
    def order_calc_profit(side, symbol, volume, entry, stop):
        direction = 1 if side == FakeMT5.ORDER_TYPE_BUY else -1
        return (stop - entry) * volume * 100 * direction


class DurableBrokerDayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / "risk-state.sqlite3"
        self.account = SimpleNamespace(
            login=12345678, server="Exness-MT5Trial7", currency="USD", equity=9950.0,
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_captures_baseline_once_and_survives_reopen(self):
        first = load_or_capture_broker_day_baseline(
            db_path=self.db, tenant_id="tenant_12345678", account=self.account,
            day_start_epoch=1_800_000_000, now_epoch=1_800_000_012,
        )
        self.assertTrue(first["available"])
        self.assertEqual(first["broker_day_start_equity"], 9950.0)

        self.account.equity = 9000.0
        after_restart = load_or_capture_broker_day_baseline(
            db_path=self.db, tenant_id="tenant_12345678", account=self.account,
            day_start_epoch=1_800_000_000, now_epoch=1_800_010_000,
        )
        self.assertTrue(after_restart["available"])
        self.assertEqual(after_restart["broker_day_start_equity"], 9950.0)

    def test_does_not_invent_starting_equity_if_first_seen_too_late(self):
        result = load_or_capture_broker_day_baseline(
            db_path=self.db, tenant_id="tenant_12345678", account=self.account,
            day_start_epoch=1_800_000_000, now_epoch=1_800_000_031,
        )
        self.assertFalse(result["available"])
        self.assertEqual(result["reason"], "broker_day_baseline_not_observed_at_rollover")

    def test_baseline_isolated_by_tenant_account_and_broker_server(self):
        first = load_or_capture_broker_day_baseline(
            db_path=self.db, tenant_id="tenant_12345678", account=self.account,
            day_start_epoch=1_800_000_000, now_epoch=1_800_000_005,
        )
        other_account = SimpleNamespace(
            login=87654321, server="Exness-MT5Trial8", currency="USD", equity=5000.0,
        )
        second = load_or_capture_broker_day_baseline(
            db_path=self.db, tenant_id="tenant_87654321", account=other_account,
            day_start_epoch=1_800_000_000, now_epoch=1_800_000_005,
        )
        self.assertEqual(first["broker_day_start_equity"], 9950.0)
        self.assertEqual(second["broker_day_start_equity"], 5000.0)


class CandidateRiskTests(unittest.TestCase):
    def test_recalculates_buy_candidate_using_broker_profit_calculator(self):
        result = calculate_candidate_risk(FakeMT5, {
            "symbol": "XAUUSDm", "side": "BUY", "volume": 0.10,
            "entry_price": 2600.0, "stop_loss": 2590.0,
        })
        self.assertTrue(result["complete"])
        self.assertEqual(result["risk_money"], 100.0)
        self.assertFalse(result["includes_commission"])
        self.assertFalse(result["includes_slippage_or_gap_buffer"])

    def test_rejects_invalid_stop_geometry_and_volume_step(self):
        bad_stop = calculate_candidate_risk(FakeMT5, {
            "symbol": "XAUUSDm", "side": "BUY", "volume": 0.10,
            "entry_price": 2600.0, "stop_loss": 2601.0,
        })
        self.assertFalse(bad_stop["complete"])
        self.assertEqual(bad_stop["reason"], "candidate_stop_loss_geometry_invalid")
        bad_volume = calculate_candidate_risk(FakeMT5, {
            "symbol": "XAUUSDm", "side": "BUY", "volume": 0.105,
            "entry_price": 2600.0, "stop_loss": 2590.0,
        })
        self.assertFalse(bad_volume["complete"])
        self.assertEqual(bad_volume["reason"], "candidate_volume_step_invalid")

    def test_rejects_candidate_when_broker_profit_calculation_is_not_a_loss(self):
        class ProfitMT5(FakeMT5):
            @staticmethod
            def order_calc_profit(side, symbol, volume, entry, stop):
                return 10.0
        result = calculate_candidate_risk(ProfitMT5, {
            "symbol": "XAUUSDm", "side": "BUY", "volume": 0.1,
            "entry_price": 2600.0, "stop_loss": 2590.0,
        })
        self.assertFalse(result["complete"])
        self.assertEqual(result["reason"], "candidate_stop_loss_not_loss_making")

    def test_missing_candidate_fails_closed(self):
        result = calculate_candidate_risk(FakeMT5, None)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["risk_money"])


if __name__ == "__main__":
    unittest.main()
