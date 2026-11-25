"""Causal, time-safe SMC primitives.

All event timestamps are the time at which information becomes observable,
not the historical pivot/source candle timestamp.
This module intentionally has no pandas/NumPy dependency so causality can be
unit-tested with the Python standard library.
"""
from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import isfinite
from typing import Iterable, Literal, Sequence

Kind = Literal["high", "low"]
Direction = Literal["bullish", "bearish"]
BreakKind = Literal["BOS", "CHOCH"]


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must be timezone-aware")
    if value.utcoffset() != timedelta(0):
        raise ValueError("timestamps must be expressed in UTC")
    return value.astimezone(timezone.utc)


@dataclass(frozen=True)
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float

    def __post_init__(self) -> None:
        _utc(self.timestamp)
        values = (self.open, self.high, self.low, self.close)
        if not all(isfinite(float(value)) for value in values):
            raise ValueError("OHLC values must be finite")
        if min(values) <= 0 or self.high < self.low:
            raise ValueError("invalid OHLC prices")
        if self.high < max(self.open, self.close) or self.low > min(self.open, self.close):
            raise ValueError("high/low must contain open/close")


@dataclass(frozen=True)
class SwingPoint:
    kind: Kind
    pivot_index: int
    confirmed_index: int
    pivot_timestamp: datetime
    confirmed_at: datetime
    price: float


@dataclass(frozen=True)
class StructureBreak:
    direction: Direction
    kind: BreakKind
    index: int
    timestamp: datetime
    level: float


@dataclass(frozen=True)
class OrderBlock:
    direction: Direction
    source_index: int
    source_timestamp: datetime
    created_index: int
    created_at: datetime
    top: float
    bottom: float

    def __post_init__(self) -> None:
        if self.bottom > self.top:
            raise ValueError("order block bottom must not exceed top")
        if _utc(self.source_timestamp) > _utc(self.created_at):
            raise ValueError("order block cannot be sourced from a future candle")


def validate_candles(candles: Sequence[Candle]) -> None:
    previous = None
    for candle in candles:
        timestamp = _utc(candle.timestamp)
        if previous is not None and timestamp <= previous:
            raise ValueError("candle timestamps must be strictly increasing")
        previous = timestamp


def confirm_swings(candles: Sequence[Candle], lookback: int = 10) -> list[SwingPoint]:
    """Emit pivots only on the bar where the right-side confirmation completes."""
    if lookback < 1:
        raise ValueError("lookback must be >= 1")
    validate_candles(candles)
    events: list[SwingPoint] = []
    for confirmed_index in range(2 * lookback, len(candles)):
        pivot_index = confirmed_index - lookback
        left = pivot_index - lookback
        window = candles[left : confirmed_index + 1]
        pivot = candles[pivot_index]
        highs = [item.high for item in window]
        lows = [item.low for item in window]
        if pivot.high == max(highs) and highs.count(pivot.high) == 1:
            events.append(SwingPoint(
                "high", pivot_index, confirmed_index, pivot.timestamp,
                candles[confirmed_index].timestamp, pivot.high
            ))
        if pivot.low == min(lows) and lows.count(pivot.low) == 1:
            events.append(SwingPoint(
                "low", pivot_index, confirmed_index, pivot.timestamp,
                candles[confirmed_index].timestamp, pivot.low
            ))
    return events


def detect_structure_breaks(
    candles: Sequence[Candle], lookback: int = 10
) -> tuple[list[SwingPoint], list[StructureBreak]]:
    """Detect close-confirmed BOS/CHOCH using only swings already confirmed."""
    swings = confirm_swings(candles, lookback)
    by_confirmation: dict[int, list[SwingPoint]] = {}
    for swing in swings:
        by_confirmation.setdefault(swing.confirmed_index, []).append(swing)

    last_high: SwingPoint | None = None
    last_low: SwingPoint | None = None
    broken_highs: set[int] = set()
    broken_lows: set[int] = set()
    trend = 0
    breaks: list[StructureBreak] = []

    for index, candle in enumerate(candles):
        for swing in by_confirmation.get(index, []):
            if swing.kind == "high":
                last_high = swing
            else:
                last_low = swing

        if last_high is not None and last_high.pivot_index not in broken_highs and candle.close > last_high.price:
            kind: BreakKind = "CHOCH" if trend == -1 else "BOS"
            breaks.append(StructureBreak("bullish", kind, index, candle.timestamp, last_high.price))
            broken_highs.add(last_high.pivot_index)
            trend = 1
        elif last_low is not None and last_low.pivot_index not in broken_lows and candle.close < last_low.price:
            kind = "CHOCH" if trend == 1 else "BOS"
            breaks.append(StructureBreak("bearish", kind, index, candle.timestamp, last_low.price))
            broken_lows.add(last_low.pivot_index)
            trend = -1
    return swings, breaks


def detect_order_blocks(
    candles: Sequence[Candle],
    breaks: Iterable[StructureBreak],
    lookback: int = 3,
) -> list[OrderBlock]:
    """Create an OB at the break time from an opposing candle strictly before it."""
    if lookback < 1:
        raise ValueError("lookback must be >= 1")
    validate_candles(candles)
    result: list[OrderBlock] = []
    for event in breaks:
        if event.index < 1 or event.index >= len(candles):
            raise ValueError("structure break index is outside candle data")
        if _utc(candles[event.index].timestamp) != _utc(event.timestamp):
            raise ValueError("structure break timestamp/index mismatch")
        start = max(0, event.index - lookback)
        for source_index in range(event.index - 1, start - 1, -1):
            source = candles[source_index]
            opposing = (
                event.direction == "bullish" and source.close < source.open
            ) or (
                event.direction == "bearish" and source.close > source.open
            )
            if not opposing:
                continue
            if event.direction == "bullish":
                top, bottom = source.open, source.low
            else:
                top, bottom = source.high, source.open
            result.append(OrderBlock(
                event.direction, source_index, source.timestamp,
                event.index, event.timestamp, top, bottom
            ))
            break
    return result


def visible_order_blocks(
    blocks: Iterable[OrderBlock], as_of: datetime, limit: int = 10
) -> list[OrderBlock]:
    """Return only OBs whose structure break was observable by as_of."""
    if limit < 1:
        raise ValueError("limit must be >= 1")
    cutoff = _utc(as_of)
    eligible = [block for block in blocks if _utc(block.created_at) <= cutoff]
    eligible.sort(key=lambda block: (block.created_at, block.created_index))
    return eligible[-limit:]


def last_closed_higher_timeframe_index(
    open_times: Sequence[datetime], as_of: datetime, duration: timedelta
) -> int:
    """Index of the latest HTF bar whose close time is <= as_of; else -1."""
    if duration <= timedelta(0):
        raise ValueError("duration must be positive")
    opens = [_utc(value) for value in open_times]
    if any(right <= left for left, right in zip(opens, opens[1:])):
        raise ValueError("higher-timeframe open times must be strictly increasing")
    closes = [value + duration for value in opens]
    return bisect_right(closes, _utc(as_of)) - 1


def is_rejection_candle(candle: Candle, direction: Direction) -> bool:
    total_range = candle.high - candle.low
    if total_range <= 0:
        return False
    body = abs(candle.close - candle.open)
    upper_wick = candle.high - max(candle.open, candle.close)
    lower_wick = min(candle.open, candle.close) - candle.low
    body_ratio = body / total_range
    if direction == "bullish":
        return lower_wick >= 2 * body and body_ratio < 0.40 and candle.close > (candle.high + candle.low) / 2
    return upper_wick >= 2 * body and body_ratio < 0.40 and candle.close < (candle.high + candle.low) / 2
