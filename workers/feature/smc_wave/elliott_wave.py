"""Pivot and five-swing candidate utilities for Elliott Wave research.

Newly authored heuristic scaffold; this does not certify Elliott Wave counts.
"""
from __future__ import annotations
from typing import Any

def find_pivots(candles: list[dict[str, Any]], left: int = 2, right: int = 2) -> list[dict[str, Any]]:
    if left < 1 or right < 1:
        raise ValueError("left and right must be >= 1")
    if not isinstance(candles, list):
        raise ValueError("candles must be a list")
    for i, row in enumerate(candles):
        if not isinstance(row, dict) or not {"high", "low"}.issubset(row):
            raise ValueError(f"candle {i} must include high and low")
        if float(row["high"]) < float(row["low"]):
            raise ValueError(f"candle {i} high is below low")
    pivots = []
    for i in range(left, len(candles) - right):
        hi = float(candles[i]["high"])
        lo = float(candles[i]["low"])
        window = candles[i-left:i+right+1]
        if hi == max(float(c["high"]) for c in window) and sum(float(c["high"]) == hi for c in window) == 1:
            pivots.append({"index": i, "price": hi, "kind": "high"})
        elif lo == min(float(c["low"]) for c in window) and sum(float(c["low"]) == lo for c in window) == 1:
            pivots.append({"index": i, "price": lo, "kind": "low"})
    return pivots

def five_swing_candidate(pivots: list[dict[str, Any]]) -> dict[str, Any]:
    """Report last six alternating pivots as a possible 0-1-2-3-4-5 sequence."""
    if not isinstance(pivots, list) or len(pivots) < 6:
        return {"candidate": False, "reason": "at least six pivots are needed", "pivots": []}
    tail = pivots[-6:]
    kinds = [p.get("kind") for p in tail]
    if any(k not in ("high", "low") for k in kinds) or any(kinds[i] == kinds[i-1] for i in range(1, 6)):
        return {"candidate": False, "reason": "pivots must alternate high/low", "pivots": tail}
    prices = [float(p["price"]) for p in tail]
    bullish = kinds[0] == "low" and kinds[-1] == "high"
    bearish = kinds[0] == "high" and kinds[-1] == "low"
    if not (bullish or bearish):
        return {"candidate": False, "reason": "could not infer a directional swing sequence", "pivots": tail}
    return {"candidate": True, "direction": "bullish_candidate" if bullish else "bearish_candidate",
            "swing_prices": prices, "pivots": tail,
            "warning": "heuristic six-pivot sequence only; Elliott Wave rules and degree are not fully validated"}
