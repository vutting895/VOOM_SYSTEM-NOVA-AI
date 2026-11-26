"""CSV ingestion and validation for canonical XAUUSD OHLCV bars.

Expected CSV headers: timestamp,open,high,low,close,tick_volume.
Timestamps must be ISO-8601 with an explicit UTC offset (prefer Z).
This module intentionally uses only the Python standard library.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from nova_engine.domain.contracts import Candle, Timeframe

_TIMEFRAMES = {
    "M1": 60, "M5": 300, "M15": 900, "M30": 1800, "H1": 3600,
}


@dataclass(frozen=True, slots=True)
class DataQualityReport:
    source: str
    rows_read: int
    accepted_rows: int
    rejected_rows: int
    duplicate_timestamps: int
    out_of_order_rows: int
    gaps: tuple[str, ...]


def _parse_utc(value: str) -> datetime:
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError("timestamp must include UTC timezone")
    return parsed.astimezone(timezone.utc)


def load_csv(path: Path, symbol: str = "XAUUSD", timeframe: str = "M1") -> tuple[list[Candle], DataQualityReport]:
    if timeframe not in _TIMEFRAMES:
        raise ValueError(f"Unsupported timeframe: {timeframe}")
    rows: list[Candle] = []
    rejected = duplicates = out_of_order = 0
    seen: set[datetime] = set()
    previous: datetime | None = None
    rows_read = 0

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"timestamp", "open", "high", "low", "close", "tick_volume"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"CSV requires columns: {', '.join(sorted(required))}")
        for record in reader:
            rows_read += 1
            try:
                stamp = _parse_utc(record["timestamp"])
                candle = Candle(
                    symbol=symbol,
                    timeframe=Timeframe(timeframe),
                    timestamp=stamp,
                    open=float(record["open"]),
                    high=float(record["high"]),
                    low=float(record["low"]),
                    close=float(record["close"]),
                    tick_volume=int(record["tick_volume"]),
                )
                candle.validate()
                if stamp in seen:
                    duplicates += 1
                    rejected += 1
                    continue
                if previous is not None and stamp < previous:
                    out_of_order += 1
                seen.add(stamp)
                previous = stamp
                rows.append(candle)
            except (ValueError, TypeError, KeyError):
                rejected += 1

    rows.sort(key=lambda item: item.timestamp)
    gaps: list[str] = []
    seconds = _TIMEFRAMES[timeframe]
    for left, right in zip(rows, rows[1:]):
        delta = int((right.timestamp - left.timestamp).total_seconds())
        if delta > seconds:
            gaps.append(f"{left.timestamp.isoformat()} -> {right.timestamp.isoformat()} ({delta}s)")
    report = DataQualityReport(
        source=str(path), rows_read=rows_read, accepted_rows=len(rows),
        rejected_rows=rejected, duplicate_timestamps=duplicates,
        out_of_order_rows=out_of_order, gaps=tuple(gaps),
    )
    return rows, report


def aggregate_bars(candles: Iterable[Candle], target: str) -> list[Candle]:
    """Aggregate complete M1-aligned buckets only; never fill missing minutes."""
    if target not in _TIMEFRAMES:
        raise ValueError(f"Unsupported timeframe: {target}")
    width = _TIMEFRAMES[target]
    source = sorted(candles, key=lambda item: item.timestamp)
    if target == "M1":
        return source
    buckets: dict[datetime, list[Candle]] = {}
    for candle in source:
        epoch = int(candle.timestamp.timestamp())
        start = datetime.fromtimestamp(epoch - epoch % width, tz=timezone.utc)
        buckets.setdefault(start, []).append(candle)

    output: list[Candle] = []
    expected = width // 60
    for start, group in sorted(buckets.items()):
        group.sort(key=lambda item: item.timestamp)
        if len(group) != expected:
            continue
        expected_times = [start + timedelta(minutes=i) for i in range(expected)]
        if [item.timestamp for item in group] != expected_times:
            continue
        first, last = group[0], group[-1]
        output.append(Candle(
            symbol=first.symbol, timeframe=Timeframe(target), timestamp=start,
            open=first.open, high=max(x.high for x in group),
            low=min(x.low for x in group), close=last.close,
            tick_volume=sum(x.tick_volume for x in group),
        ))
    return output
