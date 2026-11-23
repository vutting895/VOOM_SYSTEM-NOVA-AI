"""Point-in-time primitives for leakage-resistant OHLC backtests."""
from __future__ import annotations
from collections.abc import Sequence, Mapping
from typing import Any

def confirmed_pivots(highs: Sequence[float], lows: Sequence[float], left_bars: int, right_bars: int) -> list[dict[str, Any]]:
    """A pivot at i is available only at i + right_bars; tied extrema are rejected."""
    if isinstance(left_bars, bool) or isinstance(right_bars, bool) or not isinstance(left_bars, int) or not isinstance(right_bars, int) or left_bars < 1 or right_bars < 1:
        raise ValueError("pivot windows must be positive integers")
    if len(highs) != len(lows):
        raise ValueError("highs and lows must have equal lengths")
    pivots = []
    for i in range(left_bars, len(highs) - right_bars):
        hs, ls = list(highs[i-left_bars:i+right_bars+1]), list(lows[i-left_bars:i+right_bars+1])
        if highs[i] == max(hs) and hs.count(highs[i]) == 1:
            pivots.append({"kind": "high", "index": i, "available_at_index": i + right_bars, "value": highs[i]})
        if lows[i] == min(ls) and ls.count(lows[i]) == 1:
            pivots.append({"kind": "low", "index": i, "available_at_index": i + right_bars, "value": lows[i]})
    return pivots

def visible_zones(zones: Sequence[Mapping[str, Any]], as_of_index: int) -> list[Mapping[str, Any]]:
    """Filter zones by their point-in-time known_at_index timestamp."""
    if isinstance(as_of_index, bool) or not isinstance(as_of_index, int):
        raise ValueError("as_of_index must be an integer")
    visible = []
    for zone in zones:
        if "known_at_index" not in zone:
            raise ValueError("every zone must include known_at_index")
        known_at = zone["known_at_index"]
        if isinstance(known_at, bool) or not isinstance(known_at, int):
            raise ValueError("zone known_at_index must be an integer")
        if known_at <= as_of_index:
            visible.append(zone)
    return visible

def next_bar_entry(opens: Sequence[float], signal_index: int) -> tuple[int, float]:
    """Fill a completed-bar signal at the next bar open; never same-bar."""
    if isinstance(signal_index, bool) or not isinstance(signal_index, int):
        raise ValueError("signal_index must be an integer")
    fill_index = signal_index + 1
    if signal_index < 0 or fill_index >= len(opens):
        raise IndexError("next bar is unavailable; signal cannot be filled")
    return fill_index, opens[fill_index]

def resolve_barrier_hit(direction: str, bar_high: float, bar_low: float, stop_price: float, target_price: float) -> dict[str, Any] | None:
    """OHLC ambiguity is resolved pessimistically: stop wins if both barriers touch."""
    if direction not in {"long", "short"}:
        raise ValueError("direction must be long or short")
    if bar_low > bar_high:
        raise ValueError("bar_low cannot exceed bar_high")
    if direction == "long":
        stop_hit, target_hit = bar_low <= stop_price, bar_high >= target_price
    else:
        stop_hit, target_hit = bar_high >= stop_price, bar_low <= target_price
    if stop_hit:
        return {"result": "stop", "price": stop_price, "ambiguous": target_hit}
    if target_hit:
        return {"result": "target", "price": target_price, "ambiguous": False}
    return None
