"""Small standard-library regression tests for NOVA research workers."""
import sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for folder in ("backtest","risk","data-ingestion"):
    sys.path.insert(0,str(ROOT/"workers"/folder))
from engine import BacktestWorker, BacktestInputError
from manager_prototype import RiskWorker
from main_prototype import fetch_ohlcv
from workers.tuning.engine import TuningWorker

def candles():
    closes=[100+i*0.8 for i in range(35)]+[128-i*0.9 for i in range(35)]
    rows=[]
    for i,c in enumerate(closes):
        o=closes[i-1] if i else c-0.1
        rows.append({"timestamp":f"2026-01-{i//24+1:02d}T{i%24:02d}:00:00+00:00",
                     "open":o,"high":max(o,c)+0.5,"low":min(o,c)-0.5,"close":c,"volume":1000})
    return rows

class WorkerTests(unittest.TestCase):
    def test_backtest_is_deterministic(self):
        worker=BacktestWorker(fee=0,slippage=0)
        a=worker.run({"fast_period":3,"slow_period":8},candles())
        self.assertEqual(a,worker.run({"fast_period":3,"slow_period":8},candles()))
        self.assertGreater(a["total_trades"],0)
        self.assertFalse(a["execution_enabled"])
        self.assertIsNone(a["sharpe_annualized"])
        self.assertIn("sharpe_per_period",a)
    def test_backtest_fills_on_next_bar_open_and_omits_unqualified_annualization(self):
        rows=candles()
        report=BacktestWorker(fee=0,slippage=0).run({"fast_period":3,"slow_period":8},rows)
        fills=[fill for fill in report["fills"] if fill["side"]=="buy"]
        self.assertTrue(fills)
        fill=fills[0]
        signal_index=next(i for i,row in enumerate(rows) if row["timestamp"]==fill["signal_timestamp"])
        fill_index=next(i for i,row in enumerate(rows) if row["timestamp"]==fill["fill_timestamp"])
        self.assertEqual(fill_index,signal_index+1)
        self.assertEqual(fill["fill_price"],rows[fill_index]["open"])
        self.assertIsNone(report["sharpe_annualized"])
    def test_backtest_annualizes_only_with_explicit_period_frequency(self):
        report=BacktestWorker(fee=0,slippage=0).run(
            {"fast_period":3,"slow_period":8,"periods_per_year":8760},candles())
        self.assertIsInstance(report["sharpe_annualized"],float)
    def test_backtest_rejects_non_finite_ohlcv(self):
        bad=candles()
        bad[10]["close"]=float("nan")
        with self.assertRaises(BacktestInputError): BacktestWorker().run({"fast_period":3,"slow_period":8},bad)
    def test_tuner_uses_real_backtest_callback_and_is_deterministic(self):
        worker=BacktestWorker(fee=0,slippage=0)
        tuner=TuningWorker(max_trials=5)
        a=tuner.tune(candles(),worker.run)
        self.assertEqual(a,tuner.tune(candles(),worker.run))
        self.assertEqual(a["source"],"historical_ohlcv")
        self.assertFalse(a["execution_enabled"])
    def test_tuner_rejects_empty_data(self):
        with self.assertRaises(ValueError): TuningWorker().tune([],lambda *_: {})
    def test_backtest_rejects_short_input(self):
        with self.assertRaises(BacktestInputError): BacktestWorker().run({},candles()[:5])
    def test_risk_rejects_overallocation(self):
        result=RiskWorker().check(allocation_pct=99,daily_loss_pct=0,drawdown_pct=0,paper_mode=True)
        self.assertEqual(result["status"],"reject")
    def test_risk_never_authorizes_live(self):
        result=RiskWorker().check(allocation_pct=10,daily_loss_pct=0,drawdown_pct=0,paper_mode=True)
        self.assertFalse(result["live_execution_allowed"])
    def test_ingestion_rejects_bad_interval_without_network(self):
        with self.assertRaises(ValueError): fetch_ohlcv("BTCUSDT","BAD",10)

if __name__=="__main__": unittest.main(verbosity=2)