"""Fail-closed USD PnL reconciliation for active MT5 positions.

Pure calculation only: no MetaTrader5 dependency and no broker mutations.
The caller must supply a complete deal-history window covering every active
position's lifetime and an independently verified account-currency/USD rate.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Mapping, Sequence


class PnlReconciliationError(ValueError):
    """Raised when a reliable, complete USD PnL snapshot cannot be built."""


def _decimal(value: Any, field: str) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise PnlReconciliationError(f"{field} must be a finite decimal")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise PnlReconciliationError(f"{field} must be a finite decimal") from None
    if not result.is_finite():
        raise PnlReconciliationError(f"{field} must be a finite decimal")
    return result


def build_net_pnl_snapshot(
    *,
    account_environment: str,
    account_currency: str,
    currency_to_usd_rate: Any,
    fx_rate_status: str,
    deal_history_complete: bool,
    deal_history_truncated: bool,
    positions: Sequence[Mapping[str, Any]],
    deals: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build portfolio net PnL from active positions and their associated deals.

    MT5 position fields: identifier, profit, swap.
    MT5 deal fields: position_id, profit, commission, swap, fee.
    Current-position floating profit and swap are included once. Deal profit,
    commission and fee are included for realized/charged components. Deal-level
    swap is deliberately excluded because MT5 POSITION_SWAP is the authoritative
    accumulated swap for the currently open position; adding both can double count.
    Because broker accounting conventions vary, caller must ensure that deal
    history covers the full lifetime of every active position.
    """
    if account_environment != "EXNESS_DEMO":
        raise PnlReconciliationError("only Exness Demo is permitted")
    if not account_currency or not isinstance(account_currency, str):
        raise PnlReconciliationError("account currency is required")
    if fx_rate_status != "verified":
        raise PnlReconciliationError("FX conversion rate is not verified")
    if not deal_history_complete or deal_history_truncated:
        raise PnlReconciliationError("complete, non-truncated deal history is required")
    if not isinstance(positions, (list, tuple)) or not isinstance(deals, (list, tuple)):
        raise PnlReconciliationError("positions and deals must be sequences")

    rate = _decimal(currency_to_usd_rate, "currency_to_usd_rate")
    if rate <= 0:
        raise PnlReconciliationError("currency_to_usd_rate must be greater than zero")

    active_ids: set[int] = set()
    floating = Decimal("0")
    for index, position in enumerate(positions):
        if not isinstance(position, Mapping):
            raise PnlReconciliationError(f"positions[{index}] must be a mapping")
        try:
            position_id = int(position["identifier"])
        except (KeyError, TypeError, ValueError):
            raise PnlReconciliationError(f"positions[{index}].identifier is required") from None
        if position_id <= 0 or position_id in active_ids:
            raise PnlReconciliationError("position identifiers must be unique positive integers")
        active_ids.add(position_id)
        floating += _decimal(position.get("profit"), f"positions[{index}].profit")
        floating += _decimal(position.get("swap"), f"positions[{index}].swap")

    realized = Decimal("0")
    commissions = Decimal("0")
    fees = Decimal("0")
    seen_tickets: set[int] = set()
    for index, deal in enumerate(deals):
        if not isinstance(deal, Mapping):
            raise PnlReconciliationError(f"deals[{index}] must be a mapping")
        try:
            position_id = int(deal["position_id"])
            ticket = int(deal["ticket"])
        except (KeyError, TypeError, ValueError):
            raise PnlReconciliationError(f"deals[{index}] requires position_id and ticket") from None
        if ticket <= 0 or ticket in seen_tickets:
            raise PnlReconciliationError("deal tickets must be unique positive integers")
        seen_tickets.add(ticket)
        if position_id not in active_ids:
            continue
        for field in ("profit", "commission", "fee"):
            if field not in deal:
                raise PnlReconciliationError(f"deals[{index}].{field} is required")
        realized += _decimal(deal["profit"], f"deals[{index}].profit")
        commissions += _decimal(deal["commission"], f"deals[{index}].commission")
        fees += _decimal(deal["fee"], f"deals[{index}].fee")

    net_account_currency = floating + realized + commissions + fees
    net_usd = net_account_currency * rate
    return {
        "account_environment": "EXNESS_DEMO",
        "account_currency": account_currency.upper(),
        "currency_to_usd_rate": format(rate, "f"),
        "fx_rate_status": "verified",
        "deal_history_complete": True,
        "deal_history_truncated": False,
        "active_position_count": len(active_ids),
        "net_pnl_account_currency": format(net_account_currency, "f"),
        "net_pnl_usd": format(net_usd, "f"),
        "currency_normalization_status": "verified",
        "components_account_currency": {
            "floating_profit_and_swap": format(floating, "f"),
            "realized_deal_profit": format(realized, "f"),
            "deal_commission": format(commissions, "f"),
            "deal_fee": format(fees, "f"),
        },
    }
