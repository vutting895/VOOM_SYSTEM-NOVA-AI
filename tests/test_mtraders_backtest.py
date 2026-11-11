import unittest
from workers.quant_engine.mtraders_backtest import run_next_bar_backtest

def bars(closes):
    return [{"open":float(x),"high":float(x)+1,"low":float(x)-1,"close":float(x),"volume":100} for x in closes]

class BacktestTests(unittest.TestCase):
    def test_next_open_entry_and_following_open_exit(self):
        seen=[]
        result=run_next_bar_backtest(bars([100,101,102,103,104,105,106]),
            lambda h: (seen.append(len(h)) or (1 if len(h)==3 else 0)),warmup_bars=2)
        self.assertEqual(result["trade_count"],1)
        trade=result["trades"][0]
        self.assertEqual((trade["signal_index"],trade["entry_index"],trade["exit_index"]),(2,3,4))
        self.assertEqual((trade["entry_price"],trade["exit_price"]),(103.0,104.0))
        self.assertEqual(seen[0],3)
    def test_costs_deducted(self):
        result=run_next_bar_backtest(bars([100,100,100,101,102,103,104]),
            lambda h: 1 if len(h)==3 else 0,warmup_bars=2,
            commission_bps_round_trip=2,spread_bps_round_trip=1,slippage_bps_round_trip=2)
        self.assertAlmostEqual(result["trades"][0]["cost_return"],0.0005)
    def test_no_overlapping_positions(self):
        result=run_next_bar_backtest(bars([100+i for i in range(12)]),lambda h:1,warmup_bars=2)
        for a,b in zip(result["trades"],result["trades"][1:]): self.assertGreaterEqual(b["signal_index"],a["exit_index"])
    def test_invalid_signal_rejected(self):
        with self.assertRaises(ValueError): run_next_bar_backtest(bars([100+i for i in range(8)]),lambda h:True,warmup_bars=2)
    def test_bad_cost_rejected(self):
        with self.assertRaises(ValueError): run_next_bar_backtest(bars([100+i for i in range(8)]),lambda h:0,warmup_bars=2,spread_bps_round_trip=-1)
    def test_insufficient_history_rejected(self):
        with self.assertRaises(ValueError): run_next_bar_backtest(bars([100,101,102]),lambda h:0,warmup_bars=2)

if __name__=="__main__": unittest.main(verbosity=2)
