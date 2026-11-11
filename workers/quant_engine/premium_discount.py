"""Causal Premium/Discount zone calculation from confirmed swing bounds."""
from __future__ import annotations

from datetime import datetime
import math
from typing import Any


class PremiumDiscountInputError(ValueError):
    """Raised when dealing-range inputs are incomplete or invalid."""


def _utc(value: str, label: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise PremiumDiscountInputError(f"{label} is required")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise PremiumDiscountInputError(f"{label} must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise PremiumDiscountInputError(f"{label} must include a timezone")
    return parsed


def calculate_premium_discount(*, price: float, swing_low: float, swing_high: float,
                               range_id: str, timeframe: str, swing_confirmed: bool,
                               as_of_timestamp: str, swing_confirmed_at: str,
                               confirmation_bars: int, equilibrium_ratio: float = 0.5) -> dict[str, Any]:
    """Classify price in a confirmed range; caller supplies causal swing evidence."""
    for name, value in (("price", price), ("swing_low", swing_low), ("swing_high", swing_high)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise PremiumDiscountInputError(f"{name} must be finite numeric data")
    if swing_high <= swing_low:
        raise PremiumDiscountInputError("swing_high must exceed swing_low")
    if not isinstance(swing_confirmed, bool) or not swing_confirmed:
        raise PremiumDiscountInputError("unconfirmed swing range cannot define a dealing range")
    if isinstance(confirmation_bars, bool) or not isinstance(confirmation_bars, int) or confirmation_bars < 2:
        raise PremiumDiscountInputError("at least two right-side confirmation bars are required")
    if not isinstance(range_id, str) or not range_id.strip() or not isinstance(timeframe, str) or not timeframe.strip():
        raise PremiumDiscountInputError("range_id and timeframe are required")
    as_of = _utc(as_of_timestamp, "as_of_timestamp")
    confirmed_at = _utc(swing_confirmed_at, "swing_confirmed_at")
    if confirmed_at > as_of:
        raise PremiumDiscountInputError("swing cannot be used before its confirmation timestamp")
    if isinstance(equilibrium_ratio, bool) or not isinstance(equilibrium_ratio, (int, float)) or not 0.0 < float(equilibrium_ratio) < 1.0:
        raise PremiumDiscountInputError("equilibrium_ratio must be between 0 and 1")
    ratio = (float(price) - float(swing_low)) / (float(swing_high) - float(swing_low))
    eq = float(equilibrium_ratio)
    zone = "DISCOUNT" if ratio < eq else "PREMIUM" if ratio > eq else "EQUILIBRIUM"
    return {
        "schema_version": "nova.premium-discount.v1",
        "range_id": range_id,
        "timeframe": timeframe,
        "as_of_timestamp": as_of_timestamp,
        "swing_confirmed_at": swing_confirmed_at,
        "confirmation_bars": confirmation_bars,
        "swing_low": float(swing_low),
        "swing_high": float(swing_high),
        "equilibrium_ratio": eq,
        "price_location_ratio": round(ratio, 8),
        "zone": zone,
        "outside_dealing_range": ratio < 0.0 or ratio > 1.0,
        "causal_status": "CONFIRMED_SWING_INPUT",
    }
