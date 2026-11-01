"""Normalize authenticated NOVA System Hub market-data payloads for research backtests.

The Hub is the only supported Exness MT5 access path here. This module never
connects to a terminal, handles credentials, or submits broker operations.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any

TIMEFRAME_SECONDS = {
    "M1": 60, "M5": 300, "M15": 900, "M30": 1800,
    "H1": 3600, "H4": 14400, "D1": 86400,
}


class MarketDataError(ValueError):
    """Raised when a provider payload cannot safely enter a backtest."""


def _utc_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise MarketDataError(f"{field} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise MarketDataError(f"{field} must be a valid ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise MarketDataError(f"{field} must include a timezone")
    return parsed.astimezone(timezone.utc)


def normalize_mt5_quote_payload(
    payload: dict[str, Any],
    *,
    drop_latest_bar: bool = True,
) -> dict[str, Any]:
    """Convert the Hub's data_verified quote response into StrategyBacktestEngine candles.

    MT5 position zero is the active/current candle. The bridge returns the
    candle history in chronological order, so the newest bar is excluded by
    default to avoid feeding a partially formed candle into historical tests.
    The current tick remains separate metadata and is never treated as a bar.
    """
    if not isinstance(payload, dict) or payload.get("state") != "data_verified":
        raise MarketDataError("Only data_verified market data can be backtested")
    if payload.get("mode") != "read-only" or payload.get("ordersEnabled") is not False:
        raise MarketDataError("Market data must be explicitly read-only")
    symbol = payload.get("symbol")
    timeframe = payload.get("timeframe")
    if not isinstance(symbol, str) or not symbol or len(symbol) > 40:
        raise MarketDataError("A valid provider symbol is required")
    if timeframe not in TIMEFRAME_SECONDS:
        raise MarketDataError("Unsupported MT5 timeframe")
    raw_bars = payload.get("bars")
    if not isinstance(raw_bars, list) or len(raw_bars) < 4:
        raise MarketDataError("At least 4 provider bars are required before excluding the active bar")

    candles: list[dict[str, Any]] = []
    previous: datetime | None = None
    for index, row in enumerate(raw_bars):
        if not isinstance(row, dict):
            raise MarketDataError(f"bar[{index}] must be an object")
        stamp = _utc_timestamp(row.get("timestamp"), f"bar[{index}].timestamp")
        if previous is not None and stamp <= previous:
            raise MarketDataError("Provider bars must be strictly chronological and unique")
        previous = stamp
        values: dict[str, float] = {}
        for key in ("open", "high", "low", "close"):
            try:
                value = float(row.get(key))
            except (TypeError, ValueError, OverflowError) as exc:
                raise MarketDataError(f"bar[{index}].{key} must be numeric") from exc
            if not math.isfinite(value) or value <= 0:
                raise MarketDataError(f"bar[{index}].{key} must be finite and positive")
            values[key] = value
        try:
            volume = float(row.get("volume", row.get("tick_volume", row.get("real_volume", 0))))
        except (TypeError, ValueError, OverflowError) as exc:
            raise MarketDataError(f"bar[{index}].volume must be numeric") from exc
        if not math.isfinite(volume) or volume < 0:
            raise MarketDataError(f"bar[{index}].volume must be finite and non-negative")
        if values["high"] < max(values["open"], values["close"], values["low"]):
            raise MarketDataError(f"bar[{index}] has inconsistent high")
        if values["low"] > min(values["open"], values["close"], values["high"]):
            raise MarketDataError(f"bar[{index}] has inconsistent low")
        candles.append({
            "timestamp": stamp.isoformat().replace("+00:00", "Z"),
            **values,
            "volume": volume,
        })

    if drop_latest_bar:
        candles = candles[:-1]
    if len(candles) < 3:
        raise MarketDataError("At least 3 closed candles are required for a backtest")

    return {
        "provider": "exness_mt5",
        "environment": "demo",
        "source": payload.get("source", "nova_system_hub"),
        "symbol": symbol,
        "timeframe": timeframe,
        "candles": candles,
        "closed_bar_count": len(candles),
        "active_bar_excluded": bool(drop_latest_bar),
        "tick": payload.get("tick"),
        "received_at": payload.get("receivedAt"),
        "as_of": payload.get("asOf"),
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
