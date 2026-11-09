"""Pure validation and serialization for MT5 historical OHLCV responses."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Iterable


def serialize_history_rates(
    rates: Iterable[Any],
    start_utc: datetime,
    end_utc: datetime,
    max_bars: int,
) -> list[dict[str, Any]]:
    """Validate broker rates and serialize a strictly ordered [start, end) UTC series.

    Raises ValueError for malformed, out-of-range, duplicate, unordered, or oversized data.
    """
    if start_utc.tzinfo is None or end_utc.tzinfo is None:
        raise ValueError("History bounds must be timezone-aware")
    start = start_utc.astimezone(timezone.utc)
    end = end_utc.astimezone(timezone.utc)
    if start >= end or max_bars < 1:
        raise ValueError("History bounds or bar limit are invalid")

    if len(rates) > max_bars:
        raise ValueError("History response exceeds the configured bar limit")

    bars: list[dict[str, Any]] = []
    previous_timestamp: int | None = None
    for rate in rates:
        timestamp = int(rate["time"])
        bar_time = datetime.fromtimestamp(timestamp, timezone.utc)
        if not start <= bar_time < end:
            raise ValueError("Broker returned a bar outside the requested UTC range")
        if previous_timestamp is not None and timestamp <= previous_timestamp:
            raise ValueError("Broker history must be strictly ordered without duplicate timestamps")
        previous_timestamp = timestamp

        open_price = float(rate["open"])
        high_price = float(rate["high"])
        low_price = float(rate["low"])
        close_price = float(rate["close"])
        if not all(math.isfinite(value) for value in (open_price, high_price, low_price, close_price)):
            raise ValueError("OHLC prices must be finite numbers")
        if low_price > min(open_price, close_price) or high_price < max(open_price, close_price) or low_price > high_price:
            raise ValueError("OHLC price relationships are invalid")

        tick_volume = int(rate["tick_volume"])
        spread = int(rate["spread"])
        real_volume = int(rate["real_volume"])
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
