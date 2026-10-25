"""Deterministic grid tuner driven by a real historical-data backtest callback."""
from __future__ import annotations
from typing import Callable

class TuningWorker:
    def __init__(self, max_trials: int = 30):
        if not 1 <= max_trials <= 500: raise ValueError("max_trials must be 1..500")
        self.max_trials=max_trials

    def tune(self, candles: list[dict], backtest_fn: Callable, objective: str = "sharpe_annualized") -> dict:
        if not candles: raise ValueError("Historical candles are required; random/mock tuning is prohibited")
        candidates=[]
        for fast in (5,8,10,12,16,20):
            for slow in (21,26,30,40,50):
                if fast >= slow: continue
                candidates.append({"fast_period":fast,"slow_period":slow})
        candidates=candidates[:self.max_trials]; results=[]
        for params in candidates:
            report=backtest_fn({"name":"EMA crossover",**params},candles)
            score=report.get(objective)
            if not isinstance(score,(int,float)): continue
            results.append({"params":params,"score":float(score),"backtest":report})
        if not results: raise RuntimeError("No valid backtest scores produced")
        best=max(results,key=lambda r:r["score"])
        return {"status":"completed","objective":objective,"trials":len(results),"best_params":best["params"],
                "best_score":best["score"],"best_backtest":best["backtest"],
                "warning":"Optimization is in-sample unless caller provides a separate chronological holdout set."}

if __name__=="__main__":
    print("TuningWorker ready; supply historical OHLCV and a real backtest callback.")