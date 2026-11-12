"""Premium / Discount calculation module for SMC Quant Engine."""
from typing import Any

class PremiumDiscountInputError(ValueError):
    """Raised when premium discount input is invalid."""

def calculate_premium_discount(
    *,
    price: float,
    swing_low: float,
    swing_high: float,
    range_id: str,
    timeframe: str,
    swing_confirmed: bool = True,
    as_of_timestamp: str,
    swing_confirmed_at: str,
    confirmation_bars: int = 2
) -> dict[str, Any]:
    if not swing_confirmed:
        raise PremiumDiscountInputError("swing must be confirmed")
    if confirmation_bars < 2:
        raise PremiumDiscountInputError("confirmation_bars must be at least 2")
    if as_of_timestamp <= swing_confirmed_at:
        raise PremiumDiscountInputError("as_of_timestamp must be after swing_confirmed_at")
    
    if swing_high <= swing_low:
        raise PremiumDiscountInputError("swing_high must be greater than swing_low")
    
    eq = (swing_high + swing_low) / 2
    if price > eq:
        zone = "PREMIUM"
    elif price < eq:
        zone = "DISCOUNT"
    else:
        zone = "EQUILIBRIUM"

    return {
        "zone": zone,
        "range_id": range_id,
        "timeframe": timeframe,
        "equilibrium": eq,
    }
