import importlib.util
import sys
import unittest
from pathlib import Path
MODULE = Path(__file__).with_name("risk_guard_optimizer.py")
spec = importlib.util.spec_from_file_location("risk_guard_optimizer", MODULE)
guard = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = guard
spec.loader.exec_module(guard)
class RiskGuardTests(unittest.TestCase):
    def test_rejects_too_few_trades(self):
        ok, _ = guard.validate_metrics({"trades": 99, "profit_factor": 2, "max_drawdown_pct": 1, "oos_profit_factor": 2})
        self.assertFalse(ok)
    def test_rejects_bad_oos(self):
        ok, _ = guard.validate_metrics({"trades": 120, "profit_factor": 1.4, "max_drawdown_pct": 2, "oos_profit_factor": 0.9})
        self.assertFalse(ok)
    def test_risk_is_clamped(self):
        self.assertLessEqual(guard.clamp_params({"RISK_PCT": 0.5})["RISK_PCT"], 0.01)
    def test_daily_loss_blocks_trade(self):
        self.assertFalse(guard.can_open_trade(3.0, 1.0, 0.5)[0])
    def test_drawdown_blocks_trade(self):
        self.assertFalse(guard.can_open_trade(0.0, 7.0, 0.5)[0])
    def test_risk_over_limit_blocks_trade(self):
        self.assertFalse(guard.can_open_trade(0.0, 1.0, 2.0)[0])
    def test_valid_paper_trade_risk_passes(self):
        self.assertTrue(guard.can_open_trade(0.0, 1.0, 0.5)[0])
    def test_metrics_reject_nan(self):
        ok, _ = guard.validate_metrics({"trades": 120, "profit_factor": float("nan"), "max_drawdown_pct": 2, "oos_profit_factor": 1.1})
        self.assertFalse(ok)
if __name__ == "__main__":
    unittest.main(verbosity=2)
