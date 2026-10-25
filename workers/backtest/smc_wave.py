"""Research-only SMC + swing-structure backtest helpers.

This module is intentionally isolated from broker/execution code. It accepts
historical OHLCV data only and returns simulated trades; it cannot place orders.
Signals are evaluated on completed bars and entries occur on the next bar open
to reduce look-ahead bias. Pivot points are confirmed only after right_bars.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable
import pandas as pd


REQUIRED = {"open", "high", "low", "close"}


@dataclass(frozen=True)
class BacktestConfig:
    initial_cash: float = 10_000.0
    risk_fraction: float = 0.0025
    reward_risk: float = 2.0
    fee_fraction: float = 0.0002
    slippage_fraction: float = 0.0001
    left_bars: int = 3
    right_bars: int = 3
    ema_fast: int = 12
    ema_slow: int = 26
    rsi_period: int = 14


def validate_ohlcv(frame: pd.DataFrame) -> pd.DataFrame:
    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"Missing OHLC columns: {sorted(missing)}")
    df = frame.copy()
    if not df.index.is_monotonic_increasing:
        df = df.sort_index()
    if df.index.has_duplicates:
        raise ValueError("OHLCV index must not contain duplicate timestamps")
    for col in REQUIRED:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if df[list(REQUIRED)].isna().any().any():
        raise ValueError("OHLC data contains missing or non-numeric values")
    if (df["high"] < df[["open", "close", "low"]].max(axis=1)).any():
        raise ValueError("Invalid candle: high is below another OHLC value")
    if (df["low"] > df[["open", "close", "high"]].min(axis=1)).any():
        raise ValueError("Invalid candle: low is above another OHLC value")
    if (df[["open", "high", "low", "close"]] <= 0).any().any():
        raise ValueError("Prices must be positive")
    return df


def add_indicators(frame: pd.DataFrame, cfg: BacktestConfig = BacktestConfig()) -> pd.DataFrame:
    df = validate_ohlcv(frame)
    close = df["close"]
    df["ema_fast"] = close.ewm(span=cfg.ema_fast, adjust=False).mean()
    df["ema_slow"] = close.ewm(span=cfg.ema_slow, adjust=False).mean()
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / cfg.rsi_period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / cfg.rsi_period, adjust=False).mean()
    rs = gain / loss.replace(0, float("nan"))
    df["rsi"] = 100 - (100 / (1 + rs))
    df.loc[(loss == 0) & (gain > 0), "rsi"] = 100
    df.loc[(loss == 0) & (gain == 0), "rsi"] = 50
    return df


def confirmed_swings(frame: pd.DataFrame, left_bars: int = 3, right_bars: int = 3) -> pd.DataFrame:
    """Mark pivots on their confirmation bar, not their historical pivot bar."""
    if left_bars < 1 or right_bars < 1:
        raise ValueError("left_bars and right_bars must be >= 1")
    df = validate_ohlcv(frame)
    df["swing_high"] = False
    df["swing_low"] = False
    highs, lows = df["high"].to_numpy(), df["low"].to_numpy()
    for pivot in range(left_bars, len(df) - right_bars):
        end = pivot + right_bars + 1
        start = pivot - left_bars
        confirmed_at = pivot + right_bars
        if highs[pivot] == max(highs[start:end]) and (highs[start:end] == highs[pivot]).sum() == 1:
            df.iloc[confirmed_at, df.columns.get_loc("swing_high")] = True
        if lows[pivot] == min(lows[start:end]) and (lows[start:end] == lows[pivot]).sum() == 1:
            df.iloc[confirmed_at, df.columns.get_loc("swing_low")] = True
    return df


def run_backtest(frame: pd.DataFrame, cfg: BacktestConfig = BacktestConfig()) -> dict:
    """Single-position, long/short simulation; intrabar stop wins if stop and target both touch."""
    if cfg.initial_cash <= 0 or not 0 < cfg.risk_fraction <= 0.02:
        raise ValueError("initial_cash must be positive and risk_fraction in (0, 0.02]")
    if cfg.reward_risk <= 0 or cfg.fee_fraction < 0 or cfg.slippage_fraction < 0:
        raise ValueError("Invalid reward/risk, fee, or slippage")
    df = add_indicators(frame, cfg)
    cash = cfg.initial_cash
    trades = []
    position = None
    for i in range(1, len(df) - 1):
        bar = df.iloc[i]
        next_bar = df.iloc[i + 1]
        if position:
            stop_hit = bar["low"] <= position["stop"] if position["side"] == "long" else bar["high"] >= position["stop"]
            target_hit = bar["high"] >= position["target"] if position["side"] == "long" else bar["low"] <= position["target"]
            if stop_hit or target_hit:
                # Conservative assumption: if both levels touched in one candle, assume stop first.
                exit_price = position["stop"] if stop_hit else position["target"]
                direction = 1 if position["side"] == "long" else -1
                gross = direction * (exit_price - position["entry"]) * position["qty"]
                costs = (position["entry"] + exit_price) * position["qty"] * (cfg.fee_fraction + cfg.slippage_fraction)
                pnl = gross - costs
                cash += pnl
                trades.append({**position, "exit_time": df.index[i], "exit_price": float(exit_price),
                               "pnl": float(pnl), "cash_after": float(cash),
                               "result": "win" if pnl > 0 else "loss"})
                position = None
        if position is None:
            prev = df.iloc[i - 1]
            cross_up = prev["ema_fast"] <= prev["ema_slow"] and bar["ema_fast"] > bar["ema_slow"]
            cross_down = prev["ema_fast"] >= prev["ema_slow"] and bar["ema_fast"] < bar["ema_slow"]
            rsi_up = pd.notna(bar["rsi"]) and pd.notna(prev["rsi"]) and bar["rsi"] > prev["rsi"]
            rsi_down = pd.notna(bar["rsi"]) and pd.notna(prev["rsi"]) and bar["rsi"] < prev["rsi"]
            side = None
            if cross_up and bar["close"] > bar["ema_fast"] and 50 < bar["rsi"] < 70 and rsi_up:
                side = "long"
            elif cross_down and bar["close"] < bar["ema_fast"] and 30 < bar["rsi"] < 50 and rsi_down:
                side = "short"
            if side:
                entry = float(next_bar["open"] * (1 + cfg.slippage_fraction if side == "long" else 1 - cfg.slippage_fraction))
                # ATR-like local risk proxy: prior candle range; no trade if zero range.
                risk_distance = float(max(bar["high"] - bar["low"], entry * 0.0001))
                stop = entry - risk_distance if side == "long" else entry + risk_distance
                target = entry + risk_distance * cfg.reward_risk if side == "long" else entry - risk_distance * cfg.reward_risk
                risk_cash = max(0.0, cash) * cfg.risk_fraction
                qty = risk_cash / risk_distance
                if qty > 0:
                    position = {"side": side, "entry_time": df.index[i + 1], "entry": entry,
                                "stop": stop, "target": target, "qty": qty, "risk_cash": risk_cash}
    trades_df = pd.DataFrame(trades)
    pnl_series = trades_df["pnl"] if not trades_df.empty else pd.Series(dtype=float)
    equity = cfg.initial_cash + pnl_series.cumsum()
    peak = equity.cummax() if not equity.empty else pd.Series(dtype=float)
    drawdown = ((equity - peak) / peak).min() if not equity.empty else 0.0
    return {
        "mode": "BACKTEST_ONLY",
        "live_trading": False,
        "initial_cash": cfg.initial_cash,
        "final_cash": float(cash),
        "total_trades": int(len(trades)),
        "win_rate": float((trades_df["pnl"] > 0).mean()) if not trades_df.empty else 0.0,
        "net_pnl": float(pnl_series.sum()) if not trades_df.empty else 0.0,
        "max_drawdown_fraction": float(drawdown),
        "trades": trades,
    }
