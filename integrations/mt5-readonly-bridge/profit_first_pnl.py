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


def _integer(value: Any, field: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise PnlReconciliationError(f"{field} must be an integer >= {minimum}")
    return value


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
    _integer(account_login, "account_login", minimum=1)
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
            opened_at = _utc(position.get("time"), f"positions[{index}].time")
            if opened_at > snapshot_time:
                raise PnlReconciliationError("position open time is later than the positions snapshot")
            opened_times.append(opened_at)
        earliest_required = min(opened_times)
    else:
        earliest_required = snapshot_time

    chunks: list[tuple[datetime, datetime, list[Mapping[str, Any]]]] = []
    for index, chunk in enumerate(deal_history_chunks):
        if not isinstance(chunk, Mapping):
            raise PnlReconciliationError(f"deal_history_chunks[{index}] must be a mapping")
        try:
            chunk_login = _integer(chunk.get("account_login"), f"deal_history_chunks[{index}].account_login", minimum=1)
        except PnlReconciliationError:
            raise
        if chunk.get("account_environment") != "EXNESS_DEMO":
            raise PnlReconciliationError("deal-history response is not explicitly Exness Demo")
        if chunk_login != account_login or chunk.get("account_server") != account_server:
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
    currency_to_usd_rate: Any,
    fx_rate_status: str,
    positions_snapshot: Mapping[str, Any],
    deal_history_chunks: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build net PnL from the exact read-only Bridge snapshots being reconciled.

    The positions_snapshot is the complete /api/positions response. Each
    deal_history_chunks item is the complete /api/history/deals response,
    including its own deals array and account identity. Callers cannot pass
    detached account metadata or a separate deals list.
    """
    if not isinstance(positions_snapshot, Mapping):
        raise PnlReconciliationError("positions_snapshot must be the complete Bridge response")
    if positions_snapshot.get("account_environment") != "EXNESS_DEMO":
        raise PnlReconciliationError("only Exness Demo is permitted")
    if positions_snapshot.get("mode") != "read-only" or positions_snapshot.get("order_submission_enabled") is not False:
        raise PnlReconciliationError("positions snapshot is not explicitly read-only")
    if positions_snapshot.get("truncated") is not False:
        raise PnlReconciliationError("positions snapshot is truncated or lacks an explicit false flag")
    positions = positions_snapshot.get("positions")
    if not isinstance(positions, list):
        raise PnlReconciliationError("positions snapshot must contain a positions array")
    count = positions_snapshot.get("count")
    if isinstance(count, bool) or not isinstance(count, int) or count != len(positions):
        raise PnlReconciliationError("positions snapshot count does not match its positions array")
    account_currency = positions_snapshot.get("currency")
    if not isinstance(account_currency, str) or not account_currency.strip():
        raise PnlReconciliationError("positions snapshot account currency is required")
    account_login = _integer(positions_snapshot.get("account_login"), "positions_snapshot.account_login", minimum=1)
    account_server = positions_snapshot.get("account_server")
    if not isinstance(account_server, str) or not account_server.strip():
        raise PnlReconciliationError("positions snapshot account server is required")
    snapshot_as_of = positions_snapshot.get("as_of")
    _utc(snapshot_as_of, "positions_snapshot.as_of")
    if fx_rate_status != "verified":
        raise PnlReconciliationError("FX conversion rate is not verified")
    if not isinstance(deal_history_chunks, (list, tuple)):
        raise PnlReconciliationError("deal_history_chunks must be a sequence")

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
    active_ids: set[int] = set()
    position_open_times: dict[int, datetime] = {}
    floating = Decimal("0")
    for index, position in enumerate(positions):
        if not isinstance(position, Mapping):
            raise PnlReconciliationError(f"positions[{index}] must be a mapping")
        if "identifier" not in position:
            raise PnlReconciliationError(f"positions[{index}].identifier is required")
        position_id = _integer(position["identifier"], f"positions[{index}].identifier", minimum=1)
        if position_id in active_ids:
            raise PnlReconciliationError("position identifiers must be unique positive integers")
        active_ids.add(position_id)
        position_open_times[position_id] = _utc(position.get("time"), f"positions[{index}].time")
        floating += _decimal(position.get("profit"), f"positions[{index}].profit")
        floating += _decimal(position.get("swap"), f"positions[{index}].swap")

    realized = Decimal("0")
    commissions = Decimal("0")
    fees = Decimal("0")
    deal_swaps = Decimal("0")
    seen_tickets: set[int] = set()
    for index, deal in enumerate(deals):
        if "position_id" not in deal or "ticket" not in deal:
            raise PnlReconciliationError(f"deals[{index}] requires position_id and ticket")
        position_id = _integer(deal["position_id"], f"deals[{index}].position_id", minimum=0)
        ticket = _integer(deal["ticket"], f"deals[{index}].ticket", minimum=1)
        if ticket in seen_tickets:
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
        if deal_time < position_open_times[position_id] or deal_time > snapshot_time:
            raise PnlReconciliationError("deal timestamp falls outside its active position lifetime")
        for field in ("profit", "commission", "swap", "fee"):
            if field not in deal:
                raise PnlReconciliationError(f"deals[{index}].{field} is required")
        realized += _decimal(deal["profit"], f"deals[{index}].profit")
        commissions += _decimal(deal["commission"], f"deals[{index}].commission")
        fees += _decimal(deal["fee"], f"deals[{index}].fee")
        deal_swaps += _decimal(deal["swap"], f"deals[{index}].swap")

    net_account_currency = floating + realized + commissions + fees + deal_swaps
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
            "closed_deal_swap": format(closed_deal_swaps, "f"),
            "closed_deal_swap": format(deal_swaps, "f"),
        },
    }
