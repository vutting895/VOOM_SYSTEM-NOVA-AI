"""Causal, research-only FVG event definitions for the isolated Wave3 challenger.

This module does not change the frozen v6.2.6.3 benchmark feature matrix,
select a winning definition, create trading signals, train a model, or submit orders.
Only the most recently created bullish FVG is active, matching the benchmark's
most-recent-gap selection and 48-bar age bound.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
import math


def _finite_number(value, field: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{field}_must_be_finite_number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field}_must_be_finite_number") from exc
    if not math.isfinite(result):
        raise ValueError(f"{field}_must_be_finite_number")
    return result


def _validated_bars(bars: Sequence[Mapping[str, object]]) -> list[dict[str, float]]:
    if isinstance(bars, (str, bytes)) or not isinstance(bars, Sequence) or not bars:
        raise ValueError("bars_must_be_non_empty_sequence")
    result = []
    for index, raw in enumerate(bars):
        if not isinstance(raw, Mapping):
            raise ValueError(f"bar_{index}_must_be_mapping")
        values = {
            key: _finite_number(raw.get(key), f"bar_{index}_{key}")
            for key in ("open", "high", "low", "close")
        }
        if (
            values["low"] > values["high"]
            or not values["low"] <= values["open"] <= values["high"]
            or not values["low"] <= values["close"] <= values["high"]
        ):
            raise ValueError(f"bar_{index}_ohlc_invalid")
        result.append(values)
    return result


def build_bullish_fvg_event_trace(bars, *, max_age_bars: int = 48) -> list[dict[str, object]]:
    """Return three preregistered bullish-FVG event definitions, bar by bar.

    FVG creation is confirmed only at the close of the third candle (index i):
    low[i] > high[i-2], with the gap [high[i-2], low[i]]. The new gap becomes
    active for the next candle; the existing active gap is evaluated first on
    the creation candle, so a same-candle new gap cannot rewrite history.

    Definitions:
    - first_touch_only: one event on the first candle-range overlap.
    - first_full_mitigation_only: one event when low first reaches/crosses the
      lower gap boundary (the same OHLC convention recorded by the benchmark
      diagnostic); later touches do not reactivate this event.
    - repeat_touch_within_48: every candle-range overlap while the latest gap
      is 1..max_age_bars old, retained only as the comparator.

    A post_full_mitigation_retouch is diagnostic only. The function reads no
    future bars and never changes workers/strategy/wave3_ml_pipeline.py.
    """
    if type(max_age_bars) is not int or max_age_bars < 1:
        raise ValueError("max_age_bars_must_be_positive_integer")

    market = _validated_bars(bars)
    active = None
    trace: list[dict[str, object]] = []

    for index, bar in enumerate(market):
        row: dict[str, object] = {
            "bar_index": index,
            "active_origin_index": None,
            "active_lower": None,
            "active_upper": None,
            "active_age_bars": None,
            "overlap_now": False,
            "fully_mitigated_now": False,
            "first_touch_index": None,
            "first_full_mitigation_index": None,
            "first_touch_only": False,
            "first_full_mitigation_only": False,
            "repeat_touch_within_48": False,
            "post_full_mitigation_retouch": False,
            "created_now": False,
            "created_origin_index": None,
            "created_lower": None,
            "created_upper": None,
        }

        # Evaluate the previously active gap using only this closed candle.
        if active is not None:
            age = index - active["origin_index"]
            if age > max_age_bars:
                active = None
            elif age >= 1:
                lower = active["lower"]
                upper = active["upper"]
                overlap = bar["low"] <= upper and bar["high"] >= lower
                full_now = bar["low"] <= lower
                first_touch = overlap and active["first_touch_index"] is None
                first_full = full_now and active["first_full_mitigation_index"] is None
                post_full_retouch = (
                    overlap
                    and active["first_full_mitigation_index"] is not None
                    and active["first_full_mitigation_index"] < index
                )

                if first_touch:
                    active["first_touch_index"] = index
                if first_full:
                    active["first_full_mitigation_index"] = index

                row.update({
                    "active_origin_index": active["origin_index"],
                    "active_lower": lower,
                    "active_upper": upper,
                    "active_age_bars": age,
                    "overlap_now": overlap,
                    "fully_mitigated_now": full_now,
                    "first_touch_index": active["first_touch_index"],
                    "first_full_mitigation_index": active["first_full_mitigation_index"],
                    "first_touch_only": first_touch,
                    "first_full_mitigation_only": first_full,
                    "repeat_touch_within_48": overlap,
                    "post_full_mitigation_retouch": post_full_retouch,
                })

        # A bullish FVG is observable only after the current third candle closes.
        if index >= 2 and bar["low"] > market[index - 2]["high"]:
            lower = market[index - 2]["high"]
            upper = bar["low"]
            row.update({
                "created_now": True,
                "created_origin_index": index,
                "created_lower": lower,
                "created_upper": upper,
            })
            active = {
                "origin_index": index,
                "lower": lower,
                "upper": upper,
                "first_touch_index": None,
                "first_full_mitigation_index": None,
            }

        trace.append(row)

    return trace
