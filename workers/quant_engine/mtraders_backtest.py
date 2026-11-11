"""Causal, cost-aware next-bar-open research backtest for NOVA strategy signals."""
from __future__ import annotations
from collections.abc import Callable, Mapping, Sequence
from math import isfinite
from typing import Any
from .mtraders_native import _bars

SignalFunction = Callable[[Sequence[Mapping[str, Any]]], int]

def run_next_bar_backtest(candles: Sequence[Mapping[str, Any]], signal_fn: SignalFunction, *,
    warmup_bars: int = 55, start_index: int | None = None,
    commission_bps_round_trip: float = 0.0, spread_bps_round_trip: float = 0.0,
    slippage_bps_round_trip: float = 0.0, max_bars: int = 20_000) -> dict[str, Any]:
    """Signal at close[i], enter open[i+1], exit open[i+2]; no overlapping positions."""
    if not callable(signal_fn): raise ValueError("signal_fn must be callable")
    for name, value, minimum in (("warmup_bars", warmup_bars, 2), ("max_bars", max_bars, 3)):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise ValueError(f"{name} must be an integer >= {minimum}")
    if start_index is not None and (isinstance(start_index, bool) or not isinstance(start_index, int)):
        raise ValueError("start_index must be an integer or None")
    costs = {}
    for name, value in (("commission_bps_round_trip", commission_bps_round_trip),
                        ("spread_bps_round_trip", spread_bps_round_trip),
                        ("slippage_bps_round_trip", slippage_bps_round_trip)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(float(value)) or not 0 <= value <= 500:
            raise ValueError(f"{name} must be finite and in [0, 500]")
        costs[name] = float(value)
    b = _bars(candles)
    if len(b) > max_bars: raise ValueError(f"candles exceeds max_bars={max_bars}")
    first = max(warmup_bars, start_index if start_index is not None else warmup_bars)
    if first >= len(b) - 2: raise ValueError("start_index leaves no eligible signal bars after warmup")
    cost_return = sum(costs.values()) / 10_000.0
    trades = []
    i = first
    while i < len(b) - 2:
        direction = signal_fn(b[:i + 1])
        if isinstance(direction, bool) or not isinstance(direction, int) or direction not in (-1, 0, 1):
            raise ValueError(f"signal_fn returned invalid direction at index {i}")
        if direction == 0:
            i += 1
            continue
        entry_i, exit_i = i + 1, i + 2
        entry, exit_price = b[entry_i]["open"], b[exit_i]["open"]
        gross = direction * (exit_price - entry) / entry
        trades.append({"signal_index": i, "entry_index": entry_i, "exit_index": exit_i,
            "direction": direction, "entry_price": entry, "exit_price": exit_price,
            "gross_return": gross, "cost_return": cost_return, "net_return": gross - cost_return})
        i = exit_i
    wins = [x["net_return"] for x in trades if x["net_return"] > 0]
    losses = [x["net_return"] for x in trades if x["net_return"] < 0]
    equity = peak = 1.0
    max_dd = 0.0
    for trade in trades:
        equity *= 1 + trade["net_return"]
        peak = max(peak, equity)
        max_dd = max(max_dd, (peak - equity) / peak if peak else 0.0)
    gp, gl = sum(wins), abs(sum(losses))
    return {"engine":"next_bar_open_one_bar_hold_v1","research_only":True,
        "orders_submitted":False,"execution_enabled":False,"live_trading_enabled":False,
        "bars":len(b),"warmup_bars":warmup_bars,"first_signal_index":first,
        "last_closed_exit_index":trades[-1]["exit_index"] if trades else None,
        "costs_bps_round_trip":costs,"trade_count":len(trades),
        "win_rate":len(wins)/len(trades) if trades else 0.0,
        "profit_factor":gp/gl if gl else (float("inf") if gp else 0.0),
        "net_return":equity-1,"max_drawdown":max_dd,
        "average_trade_return":sum(x["net_return"] for x in trades)/len(trades) if trades else 0.0,
        "trades":trades,"limitations":["one-bar holding; no intrabar stop/target simulation",
        "no position sizing, compounding risk limits, financing, or swap",
        "costs are user-supplied round-trip estimates, not broker quotes",
        "signal callback receives only completed history; causal behavior remains caller responsibility",
        "no claim of statistical significance or out-of-sample validity"]}
