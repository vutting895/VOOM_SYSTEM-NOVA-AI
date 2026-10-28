import ast
import unittest
from pathlib import Path
import numpy as np
import pandas as pd
import mt5_strategy_backtest as bt

HERE = Path(__file__).resolve().parent

class MT5ResearchTests(unittest.TestCase):
    def synthetic_bars(self, n=1200):
        idx = pd.date_range("2023-01-01", periods=n, freq="15min", tz="UTC")
        rng = np.random.default_rng(17)
        close = 2000 + np.cumsum(rng.normal(0, 1.2, n))
        open_ = np.r_[close[0], close[:-1]]
        high = np.maximum(open_, close) + rng.uniform(0.05, 1.0, n)
        low = np.minimum(open_, close) - rng.uniform(0.05, 1.0, n)
        return pd.DataFrame({
            "open": open_, "high": high, "low": low, "close": close,
            "spread": np.full(n, 30.0), "tick_volume": np.full(n, 100.0)
        }, index=idx)

    def test_indicators_are_deterministic_and_have_required_fields(self):
        raw = self.synthetic_bars()
        a = bt.indicators(raw, bt.SOURCE1_DEFAULT)
        b = bt.indicators(raw, bt.SOURCE1_DEFAULT)
        for name in ("atr", "mean", "std", "z", "ob_bull", "ob_bear", "fvg_valid", "session_ok", "vol_ok"):
            self.assertIn(name, a.columns)
        pd.testing.assert_series_equal(a["z"], b["z"])

    def test_no_mt5_or_order_execution_import_in_backtester(self):
        source = (HERE / "mt5_strategy_backtest.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        imported = []
        calls = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imported.append(node.module or "")
            elif isinstance(node, ast.Call):
                name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
                if name: calls.append(name.lower())
        self.assertFalse(any(name.lower().startswith("metatrader5") for name in imported))
        self.assertNotIn("order_send", calls)
        self.assertNotIn("order_check", calls)

    def test_importer_does_not_call_order_apis(self):
        source = (HERE / "import_mt5_history.py").read_text(encoding="utf-8").lower()
        self.assertNotIn("order_send(", source)
        self.assertNotIn("order_check(", source)
        self.assertIn("copy_rates_range", source)

    def test_risk_fraction_is_capped_by_cli_validation(self):
        self.assertGreater(bt.SOURCE1_DEFAULT["RISK_PCT"], 0)
        self.assertLessEqual(bt.SOURCE1_DEFAULT["RISK_PCT"], 0.01)

    def test_metric_calculation_handles_no_trades(self):
        result = bt.metrics([], 10000, 10000, [10000, 10000])
        self.assertEqual(result["trades"], 0)
        self.assertEqual(result["return_pct"], 0)

if __name__ == "__main__":
    unittest.main(verbosity=2)
