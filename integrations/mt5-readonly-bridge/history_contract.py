"""Pure validation and serialization for MT5 historical OHLCV responses."""
from __future__ import annotations
import math
from datetime import datetime, timezone
from numbers import Integral, Real
from typing import Any, Iterable

def _integer(rate: Any, name: str) -> int:
    value = rate[name]
    if isinstance(value, bool) or not isinstance(value, Integral): raise ValueError(f"{name} must be an integer")
    return int(value)

def _price(rate: Any, name: str) -> float:
    value = rate[name]
    if isinstance(value, bool) or not isinstance(value, Real): raise ValueError(f"{name} must be numeric")
    result = float(value)
    if not math.isfinite(result): raise ValueError(f"{name} must be finite")
    return result

def serialize_history_rates(rates: Iterable[Any], start_utc: datetime, end_utc: datetime, max_bars: int) -> list[dict[str, Any]]:
    """Validate strictly ascending, unique and bounded [start, end) UTC rates."""
    if not isinstance(start_utc, datetime) or not isinstance(end_utc, datetime) or start_utc.utcoffset() is None or end_utc.utcoffset() is None:
        raise ValueError("History bounds must be timezone-aware datetimes")
    if isinstance(max_bars, bool) or not isinstance(max_bars, Integral) or max_bars < 1: raise ValueError("Invalid history bar limit")
    start, end = start_utc.astimezone(timezone.utc), end_utc.astimezone(timezone.utc)
    if start >= end: raise ValueError("History bounds are invalid")
    bars, previous = [], None
    for rate in rates:
        if len(bars) >= max_bars: raise ValueError("History response exceeds the configured bar limit")
        stamp = _integer(rate, "time")
        try: moment = datetime.fromtimestamp(stamp, timezone.utc)
        except (OverflowError, OSError, ValueError) as exc: raise ValueError("History timestamp is invalid") from exc
        if not start <= moment < end or (previous is not None and stamp <= previous):
            raise ValueError("History timestamps must be in-range, strictly ascending and unique")
        previous = stamp
        op, hi, lo, cl = (_price(rate, key) for key in ("open", "high", "low", "close"))
        if lo > min(op, cl) or hi < max(op, cl) or lo > hi: raise ValueError("OHLC relationships are invalid")
        tv, spread, rv = (_integer(rate, key) for key in ("tick_volume", "spread", "real_volume"))
        if min(tv, spread, rv) < 0: raise ValueError("Volume and spread cannot be negative")
        bars.append({"time": moment.isoformat().replace("+00:00", "Z"), "open": op, "high": hi, "low": lo, "close": cl,
                     "tick_volume": tv, "spread": spread, "real_volume": rv})
    return bars
