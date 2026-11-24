"""Deterministic historical OHLCV backtest engine. Research only; never sends orders."""
from __future__ import annotations

from math import isfinite, sqrt
from typing import Any

from workers.quant_engine.quality import DatasetValidationError, validate_ohlcv

class BacktestInputError(ValueError):
    """Raised when historical market data or strategy parameters are invalid."""

class BacktestWorker:
    def __init__(self, fee: float = 0.001, slippage: float = 0.0005, initial_cash: float = 10000):
        if not isfinite(float(fee)) or not isfinite(float(slippage)) or not isfinite(float(initial_cash)):
            raise ValueError("Cost and initial cash values must be finite")
        if not 0 <= fee < 0.1 or not 0 <= slippage < 0.1 or initial_cash <= 0:
            raise ValueError("Invalid cost or initial cash configuration")
        self.fee, self.slippage, self.initial_cash = float(fee), float(slippage), float(initial_cash)

    def run(self, strategy: dict[str, Any], candles: list[dict[str, Any]]) -> dict[str, Any]:
        if not isinstance(strategy, dict):
            raise BacktestInputError("strategy must be an object")
        if not isinstance(candles, list) or len(candles) < 30:
            raise BacktestInputError("At least 30 historical OHLCV candles are required")
        try:
            quality = validate_ohlcv(candles)
        except DatasetValidationError as exc:
            raise BacktestInputError(str(exc)) from exc

        closes = [float(row["close"]) for row in candles]
        fast = strategy.get("fast_period", 12)
        slow = strategy.get("slow_period", 26)
        if isinstance(fast, bool) or isinstance(slow, bool) or not isinstance(fast, int) or not isinstance(slow, int):
            raise BacktestInputError("EMA periods must be integers")
        if not 2 <= fast < slow <= len(closes):
            raise BacktestInputError("Require 2 <= fast_period < slow_period <= candle count")

        cash, units = self.initial_cash, 0.0
        equity: list[float] = []
        trade_returns: list[float] = []
        wins = 0
        position_entry = 0.0

        # Signal is evaluated on the completed candle; fill uses that candle's
        # close with explicit slippage. This is a simplified bar-close model.
        for i, price in enumerate(closes):
            if i >= slow:
                fast_ma = sum(closes[i-fast+1:i+1]) / fast
                slow_ma = sum(closes[i-slow+1:i+1]) / slow
                prev_fast = sum(closes[i-fast:i]) / fast
                prev_slow = sum(closes[i-slow:i]) / slow
                cross_up = (i == slow and fast_ma > slow_ma) or (i > slow and prev_fast <= prev_slow and fast_ma > slow_ma)
                cross_down = i > slow and prev_fast >= prev_slow and fast_ma < slow_ma
                if units == 0 and cross_up:
                    fill = price * (1 + self.slippage)
                    units = cash * (1-self.fee) / fill
                    cash = 0.0
                    position_entry = fill
                elif units > 0 and cross_down:
                    fill = price * (1 - self.slippage)
                    cash = units * fill * (1-self.fee)
                    ret = (fill-position_entry)/position_entry - 2*self.fee
                    trade_returns.append(ret)
                    wins += ret > 0
                    units = 0.0
            equity.append(cash + units*price)

        if units > 0:
            fill = closes[-1] * (1-self.slippage)
            cash = units * fill * (1-self.fee)
            trade_returns.append((fill-position_entry)/position_entry - 2*self.fee)
            wins += trade_returns[-1] > 0
            equity[-1] = cash

        returns = [equity[i]/equity[i-1]-1 for i in range(1, len(equity)) if equity[i-1] > 0]
        mean = sum(returns)/len(returns) if returns else 0.0
        variance = sum((r-mean)**2 for r in returns)/max(1, len(returns)-1) if returns else 0.0
        peak, max_dd = self.initial_cash, 0.0
        for value in equity:
            peak = max(peak, value)
            max_dd = max(max_dd, (peak-value)/peak)
        gains = sum(x for x in trade_returns if x > 0)
        losses = abs(sum(x for x in trade_returns if x < 0))
        profit_factor = gains/losses if losses else (None if not gains else "undefined_no_losses")

        return {
            "status": "completed",
            "source": "historical_ohlcv",
            "dataset_start": quality.start_timestamp,
            "dataset_end": quality.end_timestamp,
            "dataset_rows": quality.row_count,
            "dataset_gap_count": quality.observed_gap_count,
            "strategy": str(strategy.get("name", "EMA crossover")),
            "fast_period": fast,
            "slow_period": slow,
            "candles": len(candles),
            "total_trades": len(trade_returns),
            "winrate_pct": round(100*wins/len(trade_returns), 2) if trade_returns else 0.0,
            "total_return_pct": round((equity[-1]/self.initial_cash-1)*100, 4),
            "max_drawdown_pct": round(max_dd*100, 4),
            "sharpe_annualized": round(mean/(variance**0.5)*sqrt(252), 4) if variance > 0 else 0.0,
            "profit_factor": round(profit_factor, 4) if isinstance(profit_factor, float) else profit_factor,
            "final_equity": round(equity[-1], 2),
            "equity_curve": [round(x, 8) for x in equity[-500:]],
            "fees_rate": self.fee,
            "slippage_rate": self.slippage,
            "execution_enabled": False,
            "live_trading_enabled": False,
            "warning": "Historical bar-close simulation only; confirm gaps, spread, funding, instrument sizing and execution assumptions. Not a return forecast."
        }

if __name__ == "__main__":
    print("BacktestWorker ready: provide timezone-aware chronological historical OHLCV; no mock data is generated.")
