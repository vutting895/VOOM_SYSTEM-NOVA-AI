"""Validated OHLC analysis for NOVA SMC and Elliott Wave research."""

from __future__ import annotations
import math
from datetime import datetime, timezone
from typing import Any
from elliott_wave import detect_elliott_impulses

REQUIRED_BAR_FIELDS = ("timestamp", "open", "high", "low", "close")


def validate_bars(raw_bars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(raw_bars, list) or len(raw_bars) < 25:
        raise ValueError("bars must contain at least 25 OHLC records")
    if len(raw_bars) > 5000:
        raise ValueError("bars exceeds the 5000-record limit")
    normalized = []
    previous_timestamp = None
    for index, raw in enumerate(raw_bars):
        if not isinstance(raw, dict):
            raise ValueError(f"bar {index} must be an object")
        missing = [field for field in REQUIRED_BAR_FIELDS if field not in raw]
        if missing:
            raise ValueError(f"bar {index} missing fields: {', '.join(missing)}")
        timestamp = raw["timestamp"]
        if not isinstance(timestamp, str) or not timestamp.strip():
            raise ValueError(f"bar {index} timestamp must be a non-empty string")
        try:
            parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"bar {index} timestamp must be ISO-8601") from exc
        if parsed.tzinfo is None:
            raise ValueError(f"bar {index} timestamp must include a timezone")
        parsed_utc = parsed.astimezone(timezone.utc)
        if previous_timestamp is not None and parsed_utc <= previous_timestamp:
            raise ValueError("bars must be strictly chronological without duplicate timestamps")
        previous_timestamp = parsed_utc
        timestamp_utc = parsed_utc.isoformat().replace("+00:00", "Z")
        row = {"timestamp": timestamp_utc}
        for field in ("open", "high", "low", "close"):
            try:
                value = float(raw[field])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"bar {index} {field} must be numeric") from exc
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"bar {index} {field} must be finite and positive")
            row[field] = value
        if row["high"] < max(row["open"], row["close"], row["low"]):
            raise ValueError(f"bar {index} has inconsistent high")
        if row["low"] > min(row["open"], row["close"], row["high"]):
            raise ValueError(f"bar {index} has inconsistent low")
        if raw.get("volume") is not None:
            try:
                volume = float(raw["volume"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"bar {index} volume must be numeric") from exc
            if not math.isfinite(volume) or volume < 0:
                raise ValueError(f"bar {index} volume must be finite and non-negative")
            row["volume"] = volume
        normalized.append(row)
    return normalized


def detect_fvg(bars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    found = []
    for i in range(2, len(bars)):
        older, current = bars[i - 2], bars[i]
        if current["low"] > older["high"]:
            found.append({"index": i, "timestamp": current["timestamp"], "type": "BULLISH_FVG",
                          "zone_low": older["high"], "zone_high": current["low"], "status": "ACTIVE"})
        elif current["high"] < older["low"]:
            found.append({"index": i, "timestamp": current["timestamp"], "type": "BEARISH_FVG",
                          "zone_low": current["high"], "zone_high": older["low"], "status": "ACTIVE"})
    return found


def detect_liquidity_sweeps(bars: list[dict[str, Any]], lookback: int = 20) -> list[dict[str, Any]]:
    if not isinstance(lookback, int) or lookback < 2 or lookback > 500:
        raise ValueError("lookback must be an integer between 2 and 500")
    found = []
    for i in range(lookback, len(bars)):
        prior = bars[i - lookback:i]
        swing_high = max(row["high"] for row in prior)
        swing_low = min(row["low"] for row in prior)
        current = bars[i]
        if current["high"] > swing_high and current["close"] < swing_high:
            found.append({"index": i, "timestamp": current["timestamp"], "type": "BEARISH_SWEEP",
                          "sweep_level": swing_high, "wick_high": current["high"], "close": current["close"]})
        if current["low"] < swing_low and current["close"] > swing_low:
            found.append({"index": i, "timestamp": current["timestamp"], "type": "BULLISH_SWEEP",
                          "sweep_level": swing_low, "wick_low": current["low"], "close": current["close"]})
    return found


def analyze_market(raw_bars: list[dict[str, Any]], *, lookback: int = 20,
                   pivot_left_bars: int = 2, pivot_right_bars: int = 2) -> dict[str, Any]:
    bars = validate_bars(raw_bars)
    fvg = detect_fvg(bars)
    sweeps = detect_liquidity_sweeps(bars, lookback=lookback)
    elliott = detect_elliott_impulses(bars, left_bars=pivot_left_bars, right_bars=pivot_right_bars)
    return {
        "engine": "NOVA_SMC_ELLIOTT_CORE", "schema_version": "1.0.0", "status": "SUCCESS",
        "bar_count": len(bars), "last_bar_timestamp": bars[-1]["timestamp"],
        "fvg": fvg, "liquidity_sweeps": sweeps, "elliott_wave": elliott,
        "summary": {"fvg_count": len(fvg), "liquidity_sweep_count": len(sweeps),
                    "elliott_pattern_count": len(elliott["patterns"])},
        "execution": {"orders_enabled": False, "execution_enabled": False, "live_trading_enabled": False},
    }
