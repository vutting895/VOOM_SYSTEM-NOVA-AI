"""Deterministic bounded grid tuner using a real historical-data backtest callback."""
from __future__ import annotations

from math import isfinite
from typing import Callable, Any

from workers.quant_engine.quality import DatasetValidationError, validate_ohlcv

class TuningInputError(ValueError):
    pass

class TuningWorker:
    def __init__(self, max_trials: int = 30):
        if isinstance(max_trials, bool) or not isinstance(max_trials, int) or not 1 <= max_trials <= 500:
            raise ValueError("max_trials must be an integer in 1..500")
        self.max_trials = max_trials

    def tune(self, candles: list[dict], backtest_fn: Callable, objective: str = "sharpe_per_period") -> dict[str, Any]:
        if not isinstance(candles, list) or len(candles) < 30:
            raise TuningInputError("At least 30 historical OHLCV candles are required")
        if not callable(backtest_fn):
            raise TuningInputError("backtest_fn must be a callable historical backtest")
        if objective not in {"sharpe_per_period", "total_return_pct", "profit_factor"}:
            raise TuningInputError("Unsupported optimization objective")
        try:
            quality = validate_ohlcv(candles)
        except DatasetValidationError as exc:
            raise TuningInputError(str(exc)) from exc

        candidates = []
        for fast in (5, 8, 10, 12, 16, 20):
            for slow in (21, 26, 30, 40, 50):
                if fast < slow:
                    candidates.append({"fast_period": fast, "slow_period": slow})
        candidates = candidates[:self.max_trials]
        results = []
        for params in candidates:
            report = backtest_fn({"name": "EMA crossover", **params}, candles)
            score = report.get(objective) if isinstance(report, dict) else None
            if isinstance(score, bool) or not isinstance(score, (int, float)) or not isfinite(float(score)):
                continue
            results.append({"params": params, "score": float(score), "backtest": report})
        if not results:
            raise RuntimeError("No valid historical backtest scores produced")
        best = max(results, key=lambda item: item["score"])
        return {
            "status": "completed",
            "source": "historical_ohlcv",
            "dataset_start": quality.start_timestamp,
            "dataset_end": quality.end_timestamp,
            "dataset_rows": quality.row_count,
            "objective": objective,
            "trials": len(results),
            "best_params": best["params"],
            "best_score": best["score"],
            "best_backtest": best["backtest"],
            "execution_enabled": False,
            "live_trading_enabled": False,
            "warning": "Parameter search is in-sample unless evaluated on a separate untouched chronological holdout; optimization does not establish OOS profitability."
        }

if __name__ == "__main__":
    print("TuningWorker ready; supply validated historical OHLCV and a real backtest callback. No random/mock objective is used.")
