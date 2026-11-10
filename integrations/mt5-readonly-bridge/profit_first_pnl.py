"""Fail-closed USD PnL reconciliation for active MT5 positions.

Pure calculation only: no MetaTrader5 dependency and no broker mutations.
Deal records are consumed from the exact history response chunks whose
coverage metadata is validated; a detached caller-provided deal list is
intentionally not accepted.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
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


def _utc(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise PnlReconciliationError(f"{field} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise PnlReconciliationError(f"{field} must be an ISO-8601 timestamp") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise PnlReconciliationError(f"{field} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _verify_history_coverage(
    *,
    account_login: Any,
    account_server: str,
    snapshot_as_of: str,
    positions: Sequence[Mapping[str, Any]],
    deal_history_chunks: Sequence[Mapping[str, Any]],
    account_currency: str,
) -> list[Mapping[str, Any]]:
    if isinstance(account_login, bool) or not isinstance(account_login, int) or account_login <= 0:
        raise PnlReconciliationError("authenticated account login is required")
    if not isinstance(account_server, str) or not account_server.strip():
        raise PnlReconciliationError("authenticated account server is required")
    snapshot_time = _utc(snapshot_as_of, "snapshot_as_of")
    if not deal_history_chunks:
        raise PnlReconciliationError("at least one deal-history coverage chunk is required")

    if positions:
        opened_times = []
        for index, position in enumerate(positions):
            if not isinstance(position, Mapping):
                raise PnlReconciliationError(f"positions[{index}] must be a mapping")
            opened_times.append(_utc(position.get("time"), f"positions[{index}].time"))
        earliest_required = min(opened_times)
    else:
        earliest_required = snapshot_time

    chunks: list[tuple[datetime, datetime, list[Mapping[str, Any]]]] = []
    for index, chunk in enumerate(deal_history_chunks):
        if not isinstance(chunk, Mapping):
            raise PnlReconciliationError(f"deal_history_chunks[{index}] must be a mapping")
        if chunk.get("account_login") != account_login or chunk.get("account_server") != account_server:
            raise PnlReconciliationError("deal-history account identity does not match the position snapshot")
        chunk_currency = chunk.get("currency")
        if not isinstance(chunk_currency, str) or chunk_currency.upper() != account_currency.upper():
            raise PnlReconciliationError("deal-history currency does not match the authenticated account currency")
        if chunk.get("truncated") is not False:
            raise PnlReconciliationError("deal-history chunk is truncated or lacks an explicit false flag")
        start = _utc(chunk.get("from_time"), f"deal_history_chunks[{index}].from_time")
        end = _utc(chunk.get("to_time"), f"deal_history_chunks[{index}].to_time")
        if end <= start or end - start > timedelta(days=7):
            raise PnlReconciliationError("deal-history chunk must be positive and no longer than 7 days")
        chunk_deals = chunk.get("deals")
        if not isinstance(chunk_deals, list):
            raise PnlReconciliationError("each history chunk must carry its own deals array")
        count = chunk.get("count")
        if isinstance(count, bool) or not isinstance(count, int) or count != len(chunk_deals):
            raise PnlReconciliationError("history chunk count does not match its attached deals array")
        for deal_index, deal in enumerate(chunk_deals):
            if not isinstance(deal, Mapping):
                raise PnlReconciliationError(f"deal_history_chunks[{index}].deals[{deal_index}] must be a mapping")
            deal_time = _utc(deal.get("time"), f"deal_history_chunks[{index}].deals[{deal_index}].time")
            if not start <= deal_time <= end:
                raise PnlReconciliationError("deal timestamp falls outside its declared history chunk")
        chunks.append((start, end, chunk_deals))

    chunks.sort(key=lambda item: item[0])
    if chunks[0][0] > earliest_required or chunks[-1][1] < snapshot_time:
        raise PnlReconciliationError("deal-history chunks do not cover every active position through snapshot time")
    for previous, current in zip(chunks, chunks[1:]):
        if previous[1] != current[0]:
            raise PnlReconciliationError("deal-history chunks contain a gap or overlap")

    all_deals: list[Mapping[str, Any]] = []
    for _, _, chunk_deals in chunks:
        all_deals.extend(chunk_deals)
    return all_deals


def build_net_pnl_snapshot(
    *,
    account_environment: str,
    account_currency: str,
    currency_to_usd_rate: Any,
    fx_rate_status: str,
    account_login: int,
    account_server: str,
    snapshot_as_of: str,
    deal_history_chunks: Sequence[Mapping[str, Any]],
    positions: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build portfolio net PnL from identity-bound, complete Bridge response chunks.

    Position fields: identifier, time, profit, swap.
    Each deal-history chunk is the complete Bridge JSON response, including
    deals, count, truncated, from_time, to_time, account_login and account_server.
    Detached deal lists are deliberately rejected by this interface.
    """
    if account_environment != "EXNESS_DEMO":
        raise PnlReconciliationError("only Exness Demo is permitted")
    if not account_currency or not isinstance(account_currency, str):
        raise PnlReconciliationError("account currency is required")
    if fx_rate_status != "verified":
        raise PnlReconciliationError("FX conversion rate is not verified")
    if not isinstance(positions, (list, tuple)) or not isinstance(deal_history_chunks, (list, tuple)):
        raise PnlReconciliationError("positions and deal_history_chunks must be sequences")

    deals = _verify_history_coverage(
        account_login=account_login,
        account_server=account_server,
        snapshot_as_of=snapshot_as_of,
        positions=positions,
        deal_history_chunks=deal_history_chunks,
        account_currency=account_currency,
    )
    rate = _decimal(currency_to_usd_rate, "currency_to_usd_rate")
    if rate <= 0:
        raise PnlReconciliationError("currency_to_usd_rate must be greater than zero")

    snapshot_time = _utc(snapshot_as_of, "snapshot_as_of")
    earliest_required = min(
        (_utc(position.get("time"), f"positions[{index}].time") for index, position in enumerate(positions)),
        default=snapshot_time,
    )
    active_ids: set[int] = set()
    floating = Decimal("0")
    for index, position in enumerate(positions):
        if not isinstance(position, Mapping):
            raise PnlReconciliationError(f"positions[{index}] must be a mapping")
        try:
            position_id = int(position["identifier"])
        except (KeyError, TypeError, ValueError):
            raise PnlReconciliationError(f"positions[{index}].identifier is required") from None
        if isinstance(position.get("identifier"), bool) or position_id <= 0 or position_id in active_ids:
            raise PnlReconciliationError("position identifiers must be unique positive integers")
        active_ids.add(position_id)
        _utc(position.get("time"), f"positions[{index}].time")
        floating += _decimal(position.get("profit"), f"positions[{index}].profit")
        floating += _decimal(position.get("swap"), f"positions[{index}].swap")

    realized = Decimal("0")
    commissions = Decimal("0")
    fees = Decimal("0")
    seen_tickets: set[int] = set()
    for index, deal in enumerate(deals):
        try:
            position_id = int(deal["position_id"])
            ticket = int(deal["ticket"])
        except (KeyError, TypeError, ValueError):
            raise PnlReconciliationError(f"deals[{index}] requires position_id and ticket") from None
        if isinstance(deal.get("ticket"), bool) or isinstance(deal.get("position_id"), bool) or ticket <= 0 or ticket in seen_tickets:
            raise PnlReconciliationError("deal tickets must be unique positive integers")
        seen_tickets.add(ticket)
        deal_time = _utc(deal.get("time"), f"deals[{index}].time")
        if position_id == 0:
            amounts = [_decimal(deal.get(field), f"deals[{index}].{field}") for field in ("profit", "commission", "swap", "fee")]
            if any(amount != 0 for amount in amounts):
                raise PnlReconciliationError("non-zero account-level deal cannot be attributed to an active position")
            continue
        if position_id not in active_ids:
            continue
        if deal_time < earliest_required or deal_time > _utc(snapshot_as_of, "snapshot_as_of"):
            raise PnlReconciliationError("deal timestamp falls outside the verified active-position history window")
        for field in ("profit", "commission", "swap", "fee"):
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
        "deal_history_coverage_verified": True,
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
