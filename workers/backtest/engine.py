"""Deterministic historical OHLCV backtest engine. Research only; never sends orders."""
from __future__ import annotations

from math import isfinite, sqrt
from typing import Any

from workers.quant_engine.quality import DatasetValidationError, validate_ohlcv


class BacktestInputError(ValueError):
    """Raised when historical market data or strategy parameters are invalid."""


def _ema_series(values: list[float], period: int) -> list[float | None]:
    """EMA seeded with the first period's SMA; earlier values are unavailable."""
    output: list[float | None] = [None] * len(values)
    if len(values) < period:
        return output
    seed = sum(values[:period]) / period
    output[period - 1] = seed
    alpha = 2.0 / (period + 1)
    previous = seed
    for index in range(period, len(values)):
        previous = alpha * values[index] + (1.0 - alpha) * previous
        output[index] = previous
    return output


class BacktestWorker:
    def __init__(self, fee: float = 0.001, slippage: float = 0.0005, initial_cash: float = 10000):
        if not all(isfinite(float(x)) for x in (fee, slippage, initial_cash)):
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
        opens = [float(row["open"]) for row in candles]
        fast, slow = strategy.get("fast_period", 12), strategy.get("slow_period", 26)
        if isinstance(fast, bool) or isinstance(slow, bool) or not isinstance(fast, int) or not isinstance(slow, int):
            raise BacktestInputError("EMA periods must be integers")
        if not 2 <= fast < slow <= len(closes):
            raise BacktestInputError("Require 2 <= fast_period < slow_period <= candle count")
        periods_per_year = strategy.get("periods_per_year")
        if periods_per_year is not None and (
            isinstance(periods_per_year, bool) or not isinstance(periods_per_year, int) or periods_per_year <= 0
        ):
            raise BacktestInputError("periods_per_year must be a positive integer when supplied")

        fast_ema, slow_ema = _ema_series(closes, fast), _ema_series(closes, slow)

        cash, units = self.initial_cash, 0.0
        equity: list[float] = []
        trade_returns: list[float] = []
        fills: list[dict[str, Any]] = []
        wins = 0
        pending_signal: str | None = None
        entry_cash = 0.0

        # A signal is known only after candle i closes; it is filled at candle
        # i+1 open. The final candle's close cannot create a same-bar fill.
        for i, row in enumerate(candles):
            if pending_signal == "buy" and units == 0:
                fill = opens[i] * (1 + self.slippage)
                entry_cash = cash
                units = cash * (1 - self.fee) / fill
                cash = 0.0
                fills.append({"side": "buy", "signal_timestamp": candles[i-1]["timestamp"],
                              "fill_timestamp": row["timestamp"], "fill_price": fill})
            elif pending_signal == "sell" and units > 0:
                fill = opens[i] * (1 - self.slippage)
                cash = units * fill * (1 - self.fee)
                trade_return = cash / entry_cash - 1 if entry_cash > 0 else 0.0
                trade_returns.append(trade_return)
                wins += trade_return > 0
                fills.append({"side": "sell", "signal_timestamp": candles[i-1]["timestamp"],
                              "fill_timestamp": row["timestamp"], "fill_price": fill})
                units = 0.0
                entry_cash = 0.0
            pending_signal = None
            equity.append(cash + units * closes[i])

            if i >= slow:
                fast_now, slow_now = fast_ema[i], slow_ema[i]
                fast_prev, slow_prev = fast_ema[i-1], slow_ema[i-1]
                if None in (fast_now, slow_now, fast_prev, slow_prev):
                    continue
                if units == 0 and ((i == slow and fast_now > slow_now) or (fast_prev <= slow_prev and fast_now > slow_now)):
                    pending_signal = "buy"
                elif units > 0 and fast_prev >= slow_prev and fast_now < slow_now:
                    pending_signal = "sell"

        # Mark open inventory to market only at the final close, with exit costs.
        if units > 0:
            fill = closes[-1] * (1 - self.slippage)
            cash = units * fill * (1 - self.fee)
            trade_return = cash / entry_cash - 1 if entry_cash > 0 else 0.0
            trade_returns.append(trade_return)
            wins += trade_return > 0
            fills.append({"side": "forced_close", "signal_timestamp": candles[-1]["timestamp"],
                          "fill_timestamp": candles[-1]["timestamp"], "fill_price": fill})
            equity[-1] = cash

        returns = [equity[i] / equity[i-1] - 1 for i in range(1, len(equity)) if equity[i-1] > 0]
        mean = sum(returns) / len(returns) if returns else 0.0
        variance = sum((r-mean)**2 for r in returns) / max(1, len(returns)-1) if returns else 0.0
        sharpe_per_period = mean / variance**0.5 if variance > 0 else 0.0
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
            "periods_per_year": periods_per_year,
            "candles": len(candles),
            "total_trades": len(trade_returns),
            "winrate_pct": round(100*wins/len(trade_returns), 2) if trade_returns else 0.0,
            "total_return_pct": round((equity[-1]/self.initial_cash-1)*100, 4),
            "max_drawdown_pct": round(max_dd*100, 4),
            "sharpe_per_period": round(sharpe_per_period, 6),
            "sharpe_annualized": round(sharpe_per_period*sqrt(periods_per_year), 4)
                if periods_per_year is not None else None,
            "profit_factor": round(profit_factor, 4) if isinstance(profit_factor, float) else profit_factor,
            "final_equity": round(equity[-1], 2),
            "equity_curve": [round(x, 8) for x in equity[-500:]],
            "fills": fills,
            "fees_rate": self.fee,
            "slippage_rate": self.slippage,
            "execution_enabled": False,
            "live_trading_enabled": False,
            "warning": "Historical OHLCV simulation using next-bar-open fills. Annualized Sharpe is omitted unless periods_per_year is explicitly supplied. Confirm data gaps, spread, funding, contract sizing and execution assumptions. Not a return forecast."
        }


if __name__ == "__main__":
    print("BacktestWorker ready: supply validated chronological historical OHLCV; no mock data is generated.")
