"""Deterministic close-back-inside liquidity-sweep detector.

This is a newly authored baseline because the supplied Liquidity Sweeps notebook
contains zero cells. It is a research event detector, not a trading signal.
"""
from __future__ import annotations
from typing import Any

def detect_liquidity_sweeps(candles: list[dict[str, Any]], lookback: int = 20) -> list[dict[str, Any]]:
    if not isinstance(candles, list):
        raise ValueError("candles must be a list")
    if lookback < 2:
        raise ValueError("lookback must be >= 2")
    required = {"high", "low", "close"}
    for i, row in enumerate(candles):
        if not isinstance(row, dict) or not required.issubset(row):
            raise ValueError(f"candle {i} must include high, low, close")
        hi, lo, close = float(row["high"]), float(row["low"]), float(row["close"])
        if hi < lo or not (lo <= close <= hi):
            raise ValueError(f"candle {i} has invalid OHLC bounds")
    events = []
    for i in range(lookback, len(candles)):
        prior = candles[i-lookback:i]
        prior_high = max(float(c["high"]) for c in prior)
        prior_low = min(float(c["low"]) for c in prior)
        high, low, close = (float(candles[i][k]) for k in ("high", "low", "close"))
        if high > prior_high and close < prior_high:
            events.append({"index": i, "type": "buy_side_sweep", "level": prior_high,
                           "extreme": high, "close": close,
                           "note": "price swept prior highs and closed back below"})
        if low < prior_low and close > prior_low:
            events.append({"index": i, "type": "sell_side_sweep", "level": prior_low,
                           "extreme": low, "close": close,
                           "note": "price swept prior lows and closed back above"})
    return events
