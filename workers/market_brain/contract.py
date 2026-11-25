"""Point-in-time-safe input and output contracts for the market brain."""
from __future__ import annotations
from datetime import datetime
from math import isfinite, log
from statistics import mean, pstdev
from typing import Any, Sequence

_REQUIRED = ("timestamp", "open", "high", "low", "close", "volume")
_EPS = 1e-12

def _timestamp(value: Any, index: int) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"candle {index} timestamp must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"candle {index} timestamp is invalid") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"candle {index} timestamp must include a timezone")
    return parsed

def validate_market_window(candles: Sequence[dict[str, Any]], *, min_bars: int = 64) -> None:
    """Validate a strictly chronological, completed OHLCV window."""
    if not isinstance(candles, (list, tuple)) or len(candles) < min_bars:
        raise ValueError(f"candles must contain at least {min_bars} completed bars")
    previous = None
    for index, candle in enumerate(candles):
        if not isinstance(candle, dict) or any(key not in candle for key in _REQUIRED):
            raise ValueError(f"candle {index} must include timestamp and OHLCV")
        stamp = _timestamp(candle["timestamp"], index)
        if previous is not None and stamp <= previous:
            raise ValueError("candles must have unique, strictly increasing timestamps")
        previous = stamp
        try:
            o, h, low, close, volume = (float(candle[k]) for k in _REQUIRED[1:])
        except (TypeError, ValueError):
            raise ValueError(f"candle {index} contains non-numeric OHLCV") from None
        if not all(isfinite(v) for v in (o, h, low, close, volume)):
            raise ValueError(f"candle {index} contains non-finite OHLCV")
        if low <= 0 or h < low or not (low <= o <= h and low <= close <= h):
            raise ValueError(f"candle {index} has invalid OHLC bounds")
        if volume < 0:
            raise ValueError(f"candle {index} volume cannot be negative")

def build_market_features(candles: Sequence[dict[str, Any]], *, min_bars: int = 64,
                          volume_window: int = 20) -> list[list[float]]:
    """Build causal features from current and earlier completed bars only.
    Order: log return, range/close, body/close, close location, volume z-score.
    """
    validate_market_window(candles, min_bars=min_bars)
    if isinstance(volume_window, bool) or not isinstance(volume_window, int) or volume_window < 2:
        raise ValueError("volume_window must be an integer >= 2")
    closes = [float(c["close"]) for c in candles]
    volumes = [float(c["volume"]) for c in candles]
    output = []
    for i, candle in enumerate(candles):
        o, h, low, close = (float(candle[k]) for k in ("open", "high", "low", "close"))
        previous_close = closes[i - 1] if i else close
        candle_range = max(h - low, _EPS)
        history = volumes[max(0, i - volume_window + 1):i + 1]
        vol_mean = mean(history)
        vol_std = pstdev(history) if len(history) > 1 else 0.0
        volume_z = (volumes[i] - vol_mean) / vol_std if vol_std > _EPS else 0.0
        features = [log(close / previous_close) if i else 0.0, candle_range / close,
                    (close - o) / close, (close - low) / candle_range,
                    max(-8.0, min(8.0, volume_z))]
        if not all(isfinite(value) for value in features):
            raise ValueError(f"feature generation produced non-finite values at candle {i}")
        output.append(features)
    return output

def decision_from_probabilities(*, direction_probabilities: Sequence[float],
                                 regime_probabilities: Sequence[float],
                                 expected_move_bps: float, estimated_cost_bps: float,
                                 min_confidence: float = 0.60,
                                 min_net_edge_bps: float = 2.0) -> dict[str, Any]:
    """Convert model heads to a conservative research signal; WAIT is the default."""
    if len(direction_probabilities) != 3 or len(regime_probabilities) != 3:
        raise ValueError("direction and regime heads must each contain three probabilities")
    values = [float(x) for x in (*direction_probabilities, *regime_probabilities)]
    if not all(isfinite(x) and 0 <= x <= 1 for x in values):
        raise ValueError("probabilities must be finite values between zero and one")
    if abs(sum(values[:3]) - 1.0) > 1e-5 or abs(sum(values[3:]) - 1.0) > 1e-5:
        raise ValueError("each probability head must sum to one")
    try:
        expected_move = float(expected_move_bps)
        estimated_cost = float(estimated_cost_bps)
        confidence_floor = float(min_confidence)
        edge_floor = float(min_net_edge_bps)
    except (TypeError, ValueError):
        raise ValueError("edge and decision thresholds must be numeric") from None
    if not all(isfinite(x) for x in (expected_move, estimated_cost, confidence_floor, edge_floor)):
        raise ValueError("edge and decision thresholds must be finite")
    if estimated_cost < 0 or not (0.5 < confidence_floor <= 1.0) or edge_floor < 0:
        raise ValueError("invalid decision thresholds or negative cost")
    labels = ("SELL", "WAIT", "BUY")
    index = max(range(3), key=lambda i: values[i])
    confidence = values[index]
    net_edge = abs(expected_move) - estimated_cost
    direction_matches_edge = (index == 0 and expected_move < 0) or (index == 2 and expected_move > 0)
    action = labels[index] if (index != 1 and direction_matches_edge and
        confidence >= confidence_floor and net_edge >= edge_floor) else "WAIT"
    regime_labels = ("TRENDING", "RANGING", "HIGH_VOLATILITY")
    regime_index = max(range(3), key=lambda i: values[3 + i])
    return {"schema": "voom.market-brain.signal.v1", "action": action,
            "confidence": confidence, "regime": regime_labels[regime_index],
            "expected_move_bps": expected_move, "estimated_cost_bps": estimated_cost,
            "estimated_net_edge_bps": net_edge, "research_only": True,
            "orders_submitted": False, "live_trading_enabled": False}
