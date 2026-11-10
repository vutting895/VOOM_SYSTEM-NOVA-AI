"""Pure decision contract for Profit-First Flatten.

This module never calls MetaTrader5 and never submits broker mutations.
It evaluates a verified USD-normalized snapshot and returns an auditable plan.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Mapping


class ProfitFirstFlattenError(ValueError):
    """Raised when account or PnL inputs are incomplete or unsafe."""


def _money(value: Any, field: str) -> Decimal:
    if isinstance(value, (bool, float)) or value is None:
        raise ProfitFirstFlattenError(f"{field} must be a finite USD amount")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ProfitFirstFlattenError(f"{field} must be a finite USD amount") from None
    if not amount.is_finite():
        raise ProfitFirstFlattenError(f"{field} must be a finite USD amount")
    return amount


def evaluate_profit_first_flatten(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    """Evaluate net_positive/all for one authenticated Exness Demo snapshot.

    Required snapshot fields:
      account_environment: exactly EXNESS_DEMO
      currency_normalization_status: exactly verified
      positions: sequence with profit_usd, swap_usd, commission_usd, fee_usd per position
      pending_orders: sequence of pending-order records

    A positive aggregate means strictly greater than USD 0.00. Commission and
    swap are included. Missing or ambiguous values fail closed. No broker action
    is performed here.
    """
    if not isinstance(snapshot, Mapping):
        raise ProfitFirstFlattenError("snapshot must be a mapping")
    if snapshot.get("account_environment") != "EXNESS_DEMO":
        raise ProfitFirstFlattenError("only a positively verified Exness Demo account is allowed")
    if snapshot.get("currency_normalization_status") != "verified":
        raise ProfitFirstFlattenError("USD currency normalization must be verified")

    positions = snapshot.get("positions")
    pending_orders = snapshot.get("pending_orders")
    if not isinstance(positions, (list, tuple)):
        raise ProfitFirstFlattenError("positions must be a list or tuple")
    if not isinstance(pending_orders, (list, tuple)):
        raise ProfitFirstFlattenError("pending_orders must be a list or tuple")

    net_pnl_usd = Decimal("0")
    for index, position in enumerate(positions):
        if not isinstance(position, Mapping):
            raise ProfitFirstFlattenError(f"positions[{index}] must be a mapping")
        for field in ("profit_usd", "swap_usd", "commission_usd", "fee_usd"):
            if field not in position:
                raise ProfitFirstFlattenError(f"positions[{index}].{field} is required")
        net_pnl_usd += (
            _money(position["profit_usd"], f"positions[{index}].profit_usd")
            + _money(position["swap_usd"], f"positions[{index}].swap_usd")
            + _money(position["commission_usd"], f"positions[{index}].commission_usd")
        )

    triggered = net_pnl_usd > Decimal("0")
    has_positions = len(positions) > 0
    has_pending_orders = len(pending_orders) > 0
    return {
        "policy": "profit_first_flatten",
        "condition": "net_positive",
        "scope": "all",
        "account_environment": "EXNESS_DEMO",
        "net_pnl_usd": format(net_pnl_usd, "f"),
        "triggered": triggered,
        "close_positions": bool(triggered and has_positions),
        "cancel_pending_orders": bool(triggered and has_pending_orders),
        "reason": "net_positive" if triggered else "net_not_positive",
        "execution_performed": False,
    }
