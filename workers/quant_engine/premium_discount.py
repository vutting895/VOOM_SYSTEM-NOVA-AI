"""Causal Premium/Discount zone calculation from confirmed swing bounds."""
from __future__ import annotations

from collections.abc import Mapping
import math
from typing import Any


class PremiumDiscountInputError(ValueError):
    """Raised when dealing-range inputs are incomplete or invalid."""


def calculate_premium_discount(*, price: float, swing_low: float, swing_high: float,
                               range_id: str, timeframe: str, swing_confirmed: bool,
                               as_of_timestamp: str, equilibrium_ratio: float = 0.5) -> dict[str, Any]:
    """Classify price inside a confirmed dealing range; no swing discovery is implied."""
    for name, value in (("price", price), ("swing_low", swing_low), ("swing_high", swing_high)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise PremiumDiscountInputError(f"{name} must be finite numeric data")
    if swing_high <= swing_low:
        raise PremiumDiscountInputError("swing_high must exceed swing_low")
    if not isinstance(swing_confirmed, bool) or not swing_confirmed:
        raise PremiumDiscountInputError("unconfirmed swing range cannot define a dealing range")
    if not isinstance(range_id, str) or not range_id.strip() or not isinstance(timeframe, str) or not timeframe.strip():
        raise PremiumDiscountInputError("range_id and timeframe are required")
    if not isinstance(as_of_timestamp, str) or not as_of_timestamp.strip():
        raise PremiumDiscountInputError("as_of_timestamp is required")
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
        "swing_low": float(swing_low),
        "swing_high": float(swing_high),
        "equilibrium_ratio": eq,
        "price_location_ratio": round(ratio, 8),
        "zone": zone,
        "outside_dealing_range": ratio < 0.0 or ratio > 1.0,
        "causal_status": "CONFIRMED_SWING_INPUT",
    }
