"""Pure validation and serialization for MT5 historical OHLCV responses."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from numbers import Integral, Real
from typing import Any, Iterable


def _integer_field(rate: Any, name: str) -> int:
    value = rate[name]
    if isinstance(value, bool) or not isinstance(value, Integral):
        raise ValueError(f"{name} must be an integer")
    return int(value)


def _price_field(rate: Any, name: str) -> float:
    value = rate[name]
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(f"{name} must be numeric")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be finite")
    return result


def serialize_history_rates(
    rates: Iterable[Any],
    start_utc: datetime,
    end_utc: datetime,
    max_bars: int,
) -> list[dict[str, Any]]:
    """Validate broker rates and serialize a strictly ordered [start, end) UTC series.

    Raises ValueError for malformed, out-of-range, duplicate, unordered, or oversized data.
    The input may be a generator; processing stops as soon as the hard bar limit is exceeded.
    """
    if not isinstance(start_utc, datetime) or not isinstance(end_utc, datetime):
        raise ValueError("History bounds must be datetime values")
    if start_utc.utcoffset() is None or end_utc.utcoffset() is None:
        raise ValueError("History bounds must be timezone-aware")
    if isinstance(max_bars, bool) or not isinstance(max_bars, Integral) or max_bars < 1:
        raise ValueError("History bar limit must be a positive integer")

    start = start_utc.astimezone(timezone.utc)
    end = end_utc.astimezone(timezone.utc)
    if start >= end:
        raise ValueError("History bounds are invalid")

    bars: list[dict[str, Any]] = []
    previous_timestamp: int | None = None
    for rate in rates:
        if len(bars) >= max_bars:
            raise ValueError("History response exceeds the configured bar limit")

        timestamp = _integer_field(rate, "time")
        try:
            bar_time = datetime.fromtimestamp(timestamp, timezone.utc)
        except (OverflowError, OSError, ValueError) as exc:
            raise ValueError("History timestamp is outside the supported range") from exc
        if not start <= bar_time < end:
            raise ValueError("Broker returned a bar outside the requested UTC range")
        if previous_timestamp is not None and timestamp <= previous_timestamp:
            raise ValueError("Broker history must be strictly ordered without duplicate timestamps")
        previous_timestamp = timestamp

        open_price = _price_field(rate, "open")
        high_price = _price_field(rate, "high")
        low_price = _price_field(rate, "low")
        close_price = _price_field(rate, "close")
        if low_price > min(open_price, close_price) or high_price < max(open_price, close_price) or low_price > high_price:
            raise ValueError("OHLC price relationships are invalid")

        tick_volume = _integer_field(rate, "tick_volume")
        spread = _integer_field(rate, "spread")
        real_volume = _integer_field(rate, "real_volume")
        if min(tick_volume, spread, real_volume) < 0:
            raise ValueError("Volume and spread fields cannot be negative")

        bars.append({
            "time": bar_time.isoformat().replace("+00:00", "Z"),
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "tick_volume": tick_volume,
            "spread": spread,
            "real_volume": real_volume,
        })
    return bars
