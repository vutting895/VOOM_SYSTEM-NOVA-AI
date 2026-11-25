"""Cost-aware trade-metric objective adapter for strategy/EA parameter research.

The supplied runner must be a deterministic, causal backtester. Each returned
trade must contain realized net PnL after spread, commission, swap and slippage.
No market data is fabricated and no execution/broker interface exists here.
"""
from __future__ import annotations
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
import math
from typing import Any

@dataclass(frozen=True)
class TradeMetrics:
    closed_trades: int
    net_profit: float
    profit_factor: float
    max_drawdown_pct: float
    gross_profit: float
    gross_loss: float
    win_rate_pct: float

def calculate_trade_metrics(trades: Sequence[Mapping[str, Any]], initial_equity: float) -> TradeMetrics:
    if isinstance(initial_equity, bool) or not isinstance(initial_equity, (int, float)) or not math.isfinite(initial_equity) or initial_equity <= 0:
        raise ValueError("initial_equity must be finite and > 0")
    equity = peak = float(initial_equity)
    max_dd = gross_profit = gross_loss = 0.0
    wins = 0
    for index, trade in enumerate(trades):
        if not isinstance(trade, Mapping) or "net_pnl" not in trade:
            raise ValueError(f"trade {index} must provide net_pnl after all trading costs")
        pnl = trade["net_pnl"]
        if isinstance(pnl, bool) or not isinstance(pnl, (int, float)) or not math.isfinite(float(pnl)):
            raise ValueError(f"trade {index} net_pnl must be finite")
        pnl = float(pnl)
        equity += pnl
        if pnl > 0:
            gross_profit += pnl
            wins += 1
        elif pnl < 0:
            gross_loss += abs(pnl)
        peak = max(peak, equity)
        if peak > 0:
            max_dd = max(max_dd, (peak - equity) / peak * 100.0)
    net = gross_profit - gross_loss
    pf = gross_profit / gross_loss if gross_loss > 0 else (10.0 if gross_profit > 0 else 0.0)
    pf = min(pf, 10.0)
    count = len(trades)
    return TradeMetrics(count, net, pf, max_dd, gross_profit, gross_loss, (wins / count * 100.0) if count else 0.0)

def score_trade_metrics(metrics: TradeMetrics, *, minimum_closed_trades: int = 30,
                         max_drawdown_limit_pct: float = 20.0) -> float:
    """Deterministic maximization score; hard-fails insufficient/negative edge."""
    if minimum_closed_trades < 1 or not math.isfinite(max_drawdown_limit_pct) or max_drawdown_limit_pct <= 0:
        raise ValueError("invalid objective constraints")
    if metrics.closed_trades < minimum_closed_trades:
        return -1_000_000.0 + metrics.closed_trades
    if metrics.net_profit <= 0 or metrics.profit_factor <= 1.0:
        return -100_000.0 + min(metrics.net_profit, 0.0) - max(0.0, 1.0 - metrics.profit_factor) * 100.0
    if metrics.max_drawdown_pct >= max_drawdown_limit_pct:
        return -10_000.0 - metrics.max_drawdown_pct
    return (metrics.net_profit / 100.0) + (metrics.profit_factor * 10.0) - (metrics.max_drawdown_pct * 2.0)

def make_trade_objective(runner: Callable[[Any, Mapping[str, float]], Sequence[Mapping[str, Any]]],
                         market_data: Any, parameter_bounds: Mapping[str, tuple[float, float]], *,
                         strategy_id: str, initial_equity: float, costs_included: bool,
                         minimum_closed_trades: int = 30,
                         max_drawdown_limit_pct: float = 20.0) -> Callable[[Sequence[float]], float]:
    """Build a bounded objective for SMC or EA parameters from an injected backtester.

    costs_included=True is an explicit caller attestation, not an automatic
    calculation. This adapter refuses to optimize gross-PnL data.
    """
    if not callable(runner) or not isinstance(strategy_id, str) or not strategy_id.strip() or not parameter_bounds:
        raise ValueError("runner, strategy_id and parameter_bounds are required")
    if costs_included is not True:
        raise ValueError("runner must include spread, commission, swap and slippage in net_pnl")
    names = tuple(parameter_bounds)
    bounds = tuple(parameter_bounds[name] for name in names)
    for lo, hi in bounds:
        if not math.isfinite(float(lo)) or not math.isfinite(float(hi)) or lo >= hi:
            raise ValueError("parameter bounds must be finite with lower < upper")
    def objective(position: Sequence[float]) -> float:
        if len(position) != len(names):
            raise ValueError("position dimension does not match parameter_bounds")
        params = {}
        for name, value, (lo, hi) in zip(names, position, bounds):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or not lo <= value <= hi:
                raise ValueError(f"parameter {name} is outside its finite bounds")
            params[name] = float(value)
        trades = runner(market_data, params)
        metrics = calculate_trade_metrics(trades, initial_equity)
        return score_trade_metrics(metrics, minimum_closed_trades=minimum_closed_trades,
                                   max_drawdown_limit_pct=max_drawdown_limit_pct)
    return objective
