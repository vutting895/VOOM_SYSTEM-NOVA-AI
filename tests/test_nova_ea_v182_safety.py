import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
EA = (ROOT / "integrations/mt5/NOVA_EA_v1.82.mq5").read_text(encoding="utf-8")

class TestNovaEA182Safety(unittest.TestCase):
    def test_identity_and_read_only_are_fixed(self):
        self.assertIn('#property version   "1.82"', EA)
        self.assertIn('#define NOVA_READ_ONLY_MODE true', EA)
        self.assertIn('if(NOVA_READ_ONLY_MODE) return;', EA)

    def test_legacy_trade_enable_fails_initialization(self):
        self.assertIn('if(InpTradeEnabled)', EA)
        self.assertIn('return(INIT_FAILED);', EA)

    def test_guarded_risk_defaults(self):
        for expected in ('InpRiskPercent          = 1.0', 'InpAllowBoundedMinLot    = false',
                         'InpMaxSingleRiskPct      = 1.0', 'InpMaxOpenRiskPct        = 9.0',
                         'InpDailyLossPct          = 10.0'):
            self.assertIn(expected, EA)

    def test_account_order_ceiling_is_five(self):
        self.assertIn('#define NOVA_MAX_TOTAL_ORDERS 5', EA)
        self.assertIn('return PositionsTotal()+OrdersTotal();', EA)
        self.assertIn('return CountAccountExposureOrders()<NOVA_MAX_TOTAL_ORDERS;', EA)

    def test_exposure_snapshot_not_atomic(self):
        self.assertIn('not an atomic reservation', EA)

if __name__ == '__main__':
    unittest.main()
