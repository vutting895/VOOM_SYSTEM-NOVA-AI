"""Small standard-library regression tests for NOVA research workers."""
import sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for folder in ("backtest","risk","data-ingestion"):
    sys.path.insert(0,str(ROOT/"workers"/folder))
from engine_prototype import BacktestWorker, BacktestInputError
from manager_prototype import RiskWorker
from main_prototype import fetch_ohlcv

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
