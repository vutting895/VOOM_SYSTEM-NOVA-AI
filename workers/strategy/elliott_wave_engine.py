"""Causal Elliott impulse-wave detector for completed OHLC bars.

The detector confirms pivots only after right-hand bars have closed. It emits
per-bar snapshots and never backfills future information into earlier rows.
It is a research feature generator, not a trade-signal or execution engine.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _validate(frame: pd.DataFrame) -> None:
    required = {"open", "high", "low", "close"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"missing OHLC columns: {sorted(missing)}")
    if frame.empty:
        raise ValueError("OHLC frame must not be empty")
    values = frame[["open", "high", "low", "close"]].to_numpy(dtype=float)
    if not np.isfinite(values).all():
        raise ValueError("OHLC values must be finite")
    o, h, l, c = values.T
    if np.any(h < l) or np.any(o < l) or np.any(o > h) or np.any(c < l) or np.any(c > h):
        raise ValueError("invalid OHLC bounds")
    if "timestamp" in frame:
        timestamps = pd.to_datetime(frame["timestamp"], utc=True, errors="raise")
        if not timestamps.is_monotonic_increasing or not timestamps.is_unique:
            raise ValueError("timestamps must be strictly chronological and unique")


def _confirmed_pivots(high: np.ndarray, low: np.ndarray, left: int, right: int):
    """Yield (confirmed_at, pivot_index, kind, price) without future backfill."""
    for pivot in range(left, len(high) - right):
        hi_window = high[pivot - left:pivot + right + 1]
        lo_window = low[pivot - left:pivot + right + 1]
        is_high = (
            high[pivot] == hi_window.max()
            and np.count_nonzero(hi_window == high[pivot]) == 1
        )
        is_low = (
            low[pivot] == lo_window.min()
            and np.count_nonzero(lo_window == low[pivot]) == 1
        )
        # An outside bar can be both a local high and low. Its intrabar
        # ordering is unknown on OHLC data, so reject the ambiguous pivot
        # instead of manufacturing two consecutive Elliott swings.
        if is_high == is_low:
            continue
        if is_high:
            yield pivot + right, pivot, "high", float(high[pivot])
        else:
            yield pivot + right, pivot, "low", float(low[pivot])


def _impulse(pivots: list[dict[str, Any]], direction: int) -> dict[str, Any] | None:
    """Validate the latest six alternating pivots as a 1-5 impulse."""
    if len(pivots) < 6:
        return None
    p = pivots[-6:]
    expected = ["low", "high", "low", "high", "low", "high"] if direction > 0 else [
        "high", "low", "high", "low", "high", "low"
    ]
    if [x["kind"] for x in p] != expected:
        return None
    prices = [float(x["price"]) for x in p]
    if direction > 0:
        start, w1, w2, w3, w4, w5 = prices
        lengths = (w1 - start, w3 - w2, w5 - w4)
        if not (start < w2 < w1 < w3 and w1 < w4 < w3 and w5 > w3):
            return None
    else:
        start, w1, w2, w3, w4, w5 = prices
        lengths = (start - w1, w2 - w3, w4 - w5)
        if not (start > w2 > w1 > w3 and w1 > w4 > w3 and w5 < w3):
            return None
    if min(lengths) <= 0 or lengths[1] <= min(lengths[0], lengths[2]):
        return None
    return {"pivots": p, "lengths": lengths}


def build_elliott_wave_features(
    frame: pd.DataFrame, left: int = 3, right: int = 3
) -> pd.DataFrame:
    """Return causal per-bar Elliott 1-5 labels, validation and trace features.

    Wave 1-5 are only labelled after the relevant swing has been confirmed.
    A completed impulse is a structural classification; no probability or
    profitability claim is implied. Corrective ABC classification is reserved
    for a later separately tested extension.
    """
    _validate(frame)
    if not (1 <= left <= 10 and 1 <= right <= 10):
        raise ValueError("left and right must be between 1 and 10")
    high = frame["high"].to_numpy(dtype=float)
    low = frame["low"].to_numpy(dtype=float)
    close = frame["close"].to_numpy(dtype=float)
    n = len(frame)
    pivots: list[dict[str, Any]] = []
    events = sorted(_confirmed_pivots(high, low, left, right), key=lambda x: (x[0], x[1], x[2]))
    cursor = 0
    columns = {
        "elliott_wave_number": np.zeros(n, dtype=np.int8),
        "elliott_direction": np.zeros(n, dtype=np.int8),
        "elliott_impulse_valid": np.zeros(n, dtype=np.int8),
        "elliott_impulse_complete": np.zeros(n, dtype=np.int8),
        "elliott_wave1_length": np.full(n, np.nan),
        "elliott_wave3_length": np.full(n, np.nan),
        "elliott_wave5_length": np.full(n, np.nan),
        "elliott_wave2_retrace": np.full(n, np.nan),
        "elliott_wave4_retrace": np.full(n, np.nan),
        "elliott_pivot_1_index": np.full(n, np.nan),
        "elliott_pivot_2_index": np.full(n, np.nan),
        "elliott_pivot_3_index": np.full(n, np.nan),
        "elliott_pivot_4_index": np.full(n, np.nan),
        "elliott_pivot_5_index": np.full(n, np.nan),
        "elliott_pivot_6_index": np.full(n, np.nan),
    }
    for i in range(n):
        while cursor < len(events) and events[cursor][0] <= i:
            confirmed_at, pivot_index, kind, price = events[cursor]
            point = {"index": pivot_index, "confirmed_at": confirmed_at, "kind": kind, "price": price}
            if pivots and pivots[-1]["kind"] == kind:
                # Keep the more extreme same-direction swing, but only from
                # this confirmation onward; already emitted rows stay frozen.
                more_extreme = price > pivots[-1]["price"] if kind == "high" else price < pivots[-1]["price"]
                if more_extreme:
                    pivots[-1] = point
            else:
                pivots.append(point)
            cursor += 1

        chosen = None
        for direction in (1, -1):
            candidate = _impulse(pivots, direction)
            if candidate is not None:
                chosen = (direction, candidate)
                break

        if chosen:
            direction, candidate = chosen
            p = candidate["pivots"]
            l1, l3, l5 = candidate["lengths"]
            columns["elliott_wave_number"][i] = 5
            columns["elliott_direction"][i] = direction
            columns["elliott_impulse_valid"][i] = 1
            columns["elliott_impulse_complete"][i] = 1
            columns["elliott_wave1_length"][i] = l1
            columns["elliott_wave3_length"][i] = l3
            columns["elliott_wave5_length"][i] = l5
            columns["elliott_wave2_retrace"][i] = abs(p[1]["price"] - p[2]["price"]) / l1
            columns["elliott_wave4_retrace"][i] = abs(p[3]["price"] - p[4]["price"]) / l3
            for j, point in enumerate(p, start=1):
                columns[f"elliott_pivot_{j}_index"][i] = point["index"]
            origin_price = float(p[0]["price"])
            if (direction > 0 and close[i] < origin_price) or (direction < 0 and close[i] > origin_price):
                columns["elliott_impulse_valid"][i] = 0
                columns["elliott_impulse_complete"][i] = 0
                columns["elliott_wave_number"][i] = 0
                columns["elliott_direction"][i] = 0
            continue

        # A six-pivot alternating sequence is a completed impulse candidate.
        # If it fails Elliott geometry, do not relabel its tail as a valid partial wave.
        if len(pivots) >= 6:
            latest_kinds = [x["kind"] for x in pivots[-6:]]
            if latest_kinds in (
                ["low", "high", "low", "high", "low", "high"],
                ["high", "low", "high", "low", "high", "low"],
            ):
                continue

        # Partial impulse state, using only pivots confirmed by this bar.
        # The number is the latest completed leg; Wave 5 requires all six pivots.
        direction, wave_number, valid = 0, 0, False
        length1 = length3 = retrace2 = retrace4 = np.nan
        if len(pivots) >= 5:
            tail5 = pivots[-5:]
            kinds = [x["kind"] for x in tail5]
            if kinds == ["low", "high", "low", "high", "low"]:
                direction = 1
                a, b, c, d, e = [float(x["price"]) for x in tail5]
                length1 = b - a
                length3 = d - c
                valid = a < c < b < d and b < e < d and length3 > length1
                retrace2 = (b - c) / length1 if length1 > 0 else np.nan
                retrace4 = (d - e) / length3 if length3 > 0 else np.nan
                wave_number = 4
            elif kinds == ["high", "low", "high", "low", "high"]:
                direction = -1
                a, b, c, d, e = [float(x["price"]) for x in tail5]
                length1 = a - b
                length3 = c - d
                valid = a > c > b > d and b > e > d and length3 > length1
                retrace2 = (c - b) / length1 if length1 > 0 else np.nan
                retrace4 = (e - d) / length3 if length3 > 0 else np.nan
                wave_number = 4
        if not valid and len(pivots) >= 4:
            tail4 = pivots[-4:]
            kinds = [x["kind"] for x in tail4]
            if kinds == ["low", "high", "low", "high"]:
                direction = 1
                a, b, c, d = [float(x["price"]) for x in tail4]
                valid = a < c < b < d
                length1 = b - a
                length3 = d - c
                retrace2 = (b - c) / length1 if length1 > 0 else np.nan
                wave_number = 3
            elif kinds == ["high", "low", "high", "low"]:
                direction = -1
                a, b, c, d = [float(x["price"]) for x in tail4]
                valid = a > c > b > d
                length1 = a - b
                length3 = c - d
                retrace2 = (c - b) / length1 if length1 > 0 else np.nan
                wave_number = 3
        if not valid and len(pivots) >= 3:
            tail3 = pivots[-3:]
            kinds = [x["kind"] for x in tail3]
            if kinds == ["low", "high", "low"]:
                direction = 1
                a, b, c = [float(x["price"]) for x in tail3]
                valid = a < c < b
                length1 = b - a
                retrace2 = (b - c) / length1 if length1 > 0 else np.nan
                wave_number = 2
            elif kinds == ["high", "low", "high"]:
                direction = -1
                a, b, c = [float(x["price"]) for x in tail3]
                valid = a > c > b
                length1 = a - b
                retrace2 = (c - b) / length1 if length1 > 0 else np.nan
                wave_number = 2
        if not valid and len(pivots) >= 2:
            tail2 = pivots[-2:]
            kinds = [x["kind"] for x in tail2]
            if kinds == ["low", "high"] and tail2[1]["price"] > tail2[0]["price"]:
                direction, wave_number, valid = 1, 1, True
                length1 = tail2[1]["price"] - tail2[0]["price"]
            elif kinds == ["high", "low"] and tail2[0]["price"] > tail2[1]["price"]:
                direction, wave_number, valid = -1, 1, True
                length1 = tail2[0]["price"] - tail2[1]["price"]
        if valid:
            columns["elliott_wave_number"][i] = wave_number
            columns["elliott_direction"][i] = direction
            columns["elliott_impulse_valid"][i] = 1
            columns["elliott_wave1_length"][i] = length1
            columns["elliott_wave3_length"][i] = length3
            columns["elliott_wave2_retrace"][i] = retrace2
            columns["elliott_wave4_retrace"][i] = retrace4
            for j, point in enumerate(pivots[-min(wave_number + 1, 6):], start=1):
                columns[f"elliott_pivot_{j}_index"][i] = point["index"]

    return pd.DataFrame(columns, index=frame.index)
