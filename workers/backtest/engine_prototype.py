"""Deterministic OHLCV EMA-crossover backtest. Research only; never sends orders."""
from __future__ import annotations

from math import sqrt
from typing import Any

REQUIRED = {"timestamp", "open", "high", "low", "close", "volume"}


class BacktestInputError(ValueError):
    pass


def ema_series(values: list[float], period: int) -> list[float]:
    """Return an EMA series seeded with the first observation."""
    if period < 1:
        raise ValueError("period must be >= 1")
    if not values:
        return []
    alpha = 2.0 / (period + 1)
    result = [float(values[0])]
    for value in values[1:]:
        result.append(alpha * float(value) + (1.0 - alpha) * result[-1])
    return result


class BacktestWorker:
    def __init__(self, fee: float = 0.001, slippage: float = 0.0005, initial_cash: float = 10000):
        if not 0 <= fee < 0.1 or not 0 <= slippage < 0.1 or initial_cash <= 0:
            raise ValueError("Invalid cost or initial cash configuration")
        self.fee, self.slippage, self.initial_cash = fee, slippage, initial_cash

    def run(self, strategy: dict[str, Any], candles: list[dict[str, Any]]) -> dict[str, Any]:
        if not isinstance(candles, list) or len(candles) < 30:
            raise BacktestInputError("At least 30 OHLCV candles are required")
        closes = []
        previous_ts = None
        for row in candles:
            if not REQUIRED.issubset(row):
                raise BacktestInputError("Each candle must contain timestamp, OHLCV")
            vals = [float(row[k]) for k in ("open", "high", "low", "close", "volume")]
            if any(v < 0 for v in vals) or vals[3] <= 0 or vals[1] < max(vals[0], vals[3]) or vals[2] > min(vals[0], vals[3]):
                raise BacktestInputError("Invalid OHLCV candle")
            ts = str(row["timestamp"])
            if previous_ts is not None and ts <= previous_ts:
                raise BacktestInputError("Candles must be strictly chronological")
            previous_ts = ts
            closes.append(vals[3])

        fast = int(strategy.get("fast_period", 12))
        slow = int(strategy.get("slow_period", 26))
        if not 2 <= fast < slow <= len(closes):
            raise BacktestInputError("Require 2 <= fast_period < slow_period <= candle count")

        fast_values = ema_series(closes, fast)
        slow_values = ema_series(closes, slow)
        cash = self.initial_cash
        units = 0.0
        equity = []
        trade_returns = []
        wins = 0
        position_entry = 0.0

        for i, price in enumerate(closes):
            if i >= slow:
                fast_ema = fast_values[i]
                slow_ema = slow_values[i]
                prev_fast = fast_values[i - 1]
                prev_slow = slow_values[i - 1]
                cross_up = (i == slow and fast_ema > slow_ema) or (
                    i > slow and prev_fast <= prev_slow and fast_ema > slow_ema
                )
                cross_down = i > slow and prev_fast >= prev_slow and fast_ema < slow_ema
                if units == 0 and cross_up:
                    fill = price * (1 + self.slippage)
                    units = cash * (1 - self.fee) / fill
                    cash = 0.0
                    position_entry = fill
                elif units > 0 and cross_down:
                    fill = price * (1 - self.slippage)
                    cash = units * fill * (1 - self.fee)
                    ret = (fill - position_entry) / position_entry - 2 * self.fee
                    trade_returns.append(ret)
                    wins += ret > 0
                    units = 0.0
            equity.append(round(cash + units * price, 8))

        if units > 0:
            fill = closes[-1] * (1 - self.slippage)
            cash = units * fill * (1 - self.fee)
            trade_returns.append((fill - position_entry) / position_entry - 2 * self.fee)
            wins += trade_returns[-1] > 0
            equity[-1] = round(cash, 8)

        returns = [(equity[i] / equity[i - 1] - 1) for i in range(1, len(equity)) if equity[i - 1]]
        mean = sum(returns) / len(returns) if returns else 0.0
        variance = sum((r - mean) ** 2 for r in returns) / max(1, len(returns) - 1) if returns else 0.0
        peak = self.initial_cash
        max_dd = 0.0
        for value in equity:
            peak = max(peak, value)
            max_dd = max(max_dd, (peak - value) / peak)
        gains = sum(x for x in trade_returns if x > 0)
        losses = abs(sum(x for x in trade_returns if x < 0))
        return {
            "status": "completed",
            "source": "historical_ohlcv",
            "strategy": str(strategy.get("name", "EMA crossover")),
            "indicator": "exponential_moving_average",
            "candles": len(candles),
            "total_trades": len(trade_returns),
            "winrate_pct": round(100 * wins / len(trade_returns), 2) if trade_returns else 0.0,
            "total_return_pct": round((equity[-1] / self.initial_cash - 1) * 100, 4),
            "max_drawdown_pct": round(max_dd * 100, 4),
            "sharpe_annualized": round(mean / (variance ** 0.5) * sqrt(252), 4) if variance > 0 else 0.0,
            "profit_factor": round(gains / losses, 4) if losses else (None if not gains else "undefined_no_losses"),
            "final_equity": round(equity[-1], 2),
            "equity_curve": equity[-500:],
            "fees_rate": self.fee,
            "slippage_rate": self.slippage,
            "execution_enabled": False,
            "warning": "Historical simulation only; results depend on data quality and do not predict future returns.",
        }


if __name__ == "__main__":
    print("BacktestWorker ready: provide chronological historical OHLCV rows; no mock data is generated.")
