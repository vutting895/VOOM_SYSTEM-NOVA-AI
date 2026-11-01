"""Optional VectorBT benchmark adapter.

StrategyBacktestEngine remains NOVA's canonical event-driven accounting path.
VectorBT is used only for fast vectorized signal screening and parameter sweeps;
its results must not be substituted for canonical fill/ledger results.
"""
from __future__ import annotations

from typing import Any, Sequence


class OptionalDependencyError(RuntimeError):
    pass


def run_vectorbt_benchmark(
    candles: Sequence[dict[str, Any]],
    signals: Sequence[int],
    *,
    initial_cash: float = 10_000.0,
    fee_bps: float = 0.0,
    spread_bps: float = 0.0,
    slippage_bps: float = 0.0,
) -> dict[str, Any]:
    """Screen a close-derived signal stream with next-open VectorBT fills."""
    try:
        import numpy as np
        import pandas as pd
        import vectorbt as vbt
    except ImportError as exc:
        raise OptionalDependencyError(
            "Install the optional research dependencies: pandas, numpy, vectorbt"
        ) from exc

    try:
        from strategy_engine import StrategyBacktestEngine
    except ImportError:
        from .strategy_engine import StrategyBacktestEngine

    bars, timestamps = StrategyBacktestEngine._validate(candles, signals)
    index = pd.to_datetime(timestamps, utc=True)
    close = pd.Series([bar["close"] for bar in bars], index=index, name="close")
    open_price = pd.Series([bar["open"] for bar in bars], index=index, name="open")
    raw_signals = pd.Series(list(signals), index=index)
    # Strategy signals are known at candle close. Shift by one bar so fills
    # occur at the next bar's open, matching NOVA's event-driven timing.
    entries = raw_signals.eq(1).shift(1, fill_value=False)
    exits = raw_signals.eq(-1).shift(1, fill_value=False)

    fee_rate = float(fee_bps) / 10_000
    slippage_rate = (float(spread_bps) / 2 + float(slippage_bps)) / 10_000
    if not 0 <= fee_rate <= 0.1 or not 0 <= slippage_rate <= 0.1:
        raise ValueError("VectorBT benchmark costs are outside the supported range")

    portfolio = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        price=open_price,
        size=np.inf,
        init_cash=float(initial_cash),
        fees=fee_rate,
        slippage=slippage_rate,
        freq=None,
    )
    final_value = float(portfolio.value().iloc[-1])
    return {
        "status": "completed",
        "benchmark": "vectorbt_vectorized_signal_screen",
        "execution_timing": "next_bar_open",
        "candles": len(bars),
        "total_return_pct": round(float(portfolio.total_return()) * 100, 6),
        "max_drawdown_pct": round(abs(float(portfolio.max_drawdown())) * 100, 6),
        "total_trades": int(portfolio.trades.count()),
        "win_rate_pct": round(float(portfolio.trades.win_rate()) * 100, 6),
        "final_value": round(final_value, 8),
        "fees_rate": fee_rate,
        "slippage_rate_includes_half_spread": slippage_rate,
        "terminal_position_marked_to_market": True,
        "canonical_engine": "StrategyBacktestEngine",
        "warning": (
            "VectorBT is a vectorized screening cross-check only. Its terminal "
            "position is marked to market; NOVA's canonical engine owns the "
            "trade ledger, forced end-of-data close, and acceptance metrics."
        ),
    }
