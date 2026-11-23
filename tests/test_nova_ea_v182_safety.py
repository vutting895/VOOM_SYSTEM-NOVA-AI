import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
EA_PATH = ROOT / "integrations/mt5/NOVA_EA_v1.82.mq5"
CORE_PATH = ROOT / "integrations/mt5/NOVA_CoreStrategy_v1.82.mqh"
EA = EA_PATH.read_text(encoding="utf-8")
CORE = CORE_PATH.read_text(encoding="utf-8")


class TestNovaEA182Safety(unittest.TestCase):
    def test_identity_and_read_only_are_fixed(self):
        self.assertIn('#property version   "1.82"', EA)
        self.assertIn('#define NOVA_READ_ONLY_MODE true', EA)
        self.assertIn('if(NOVA_READ_ONLY_MODE)', EA)
        self.assertIn('NovaCoreOnTick();', EA)

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

    def test_core_strategy_is_closed_bar_signal_only(self):
        for token in ('CopyRates(_Symbol,NOVA_CORE_TF,0,96,rates)',
                      'rates[0].time==gNovaCoreLastBar',
                      'NovaCoreDetectBos(rates,atr[1])',
                      'NovaCoreBullWick', 'NovaCoreBearWick',
                      'NOVA_CORE_RR 2.5', 'mode=READ-ONLY / NO ORDER'):
            self.assertIn(token, CORE)

    def test_core_strategy_has_mtf_and_volatility_gates(self):
        for token in ('PERIOD_H1', 'PERIOD_H4', 'PERIOD_M15',
                      'h1Up && h4Up && m15Up', 'h1Down && h4Down && m15Down',
                      'volRatio<0.55 || volRatio>1.80'):
            self.assertIn(token, CORE)

    def test_core_strategy_contains_no_execution_api(self):
        forbidden = ('OrderSend(', 'CTrade', '.Buy(', '.Sell(', 'PositionClose(',
                     'PositionModify(', 'OrderModify(', 'OrderDelete(')
        for token in forbidden:
            self.assertNotIn(token, CORE)
        self.assertNotIn('Trade.mqh', CORE)


if __name__ == '__main__':
    unittest.main()
