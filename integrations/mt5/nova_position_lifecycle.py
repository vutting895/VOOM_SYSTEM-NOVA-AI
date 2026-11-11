"""Fail-closed planner for NOVA-owned MT5 position-close requests.

This module only validates and plans ticket IDs. It never calls a broker API.
Durable idempotency and the actual close operation belong to the future adapter.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
from typing import Iterable


@dataclass(frozen=True)
class PositionSnapshot:
    ticket: int
    symbol: str
    magic: int
    volume: float
    account_login: int
    account_server: str


@dataclass(frozen=True)
class CloseIntent:
    command_id: str
    tenant_id: str
    account_login: int
    account_server: str
    position_tickets: tuple[int, ...]
    issued_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class ClosePlan:
    allowed: bool
    reason: str
    position_tickets: tuple[int, ...] = ()


def plan_owned_position_closes(
    intent: CloseIntent,
    positions: Iterable[PositionSnapshot],
    *,
    expected_tenant_id: str,
    expected_login: int,
    expected_server: str,
    consumed_command_ids: set[str],
    now: datetime | None = None,
    magic_base: int = 690711000,
    module_count: int = 30,
    max_ttl_seconds: int = 30,
) -> ClosePlan:
    """Return a close plan only for explicitly requested NOVA-owned positions."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or intent.issued_at.tzinfo is None or intent.expires_at.tzinfo is None:
        return ClosePlan(False, "timezone_required")
    if not expected_tenant_id or intent.tenant_id != expected_tenant_id:
        return ClosePlan(False, "tenant_mismatch")
    if (intent.account_login != expected_login or intent.account_server != expected_server):
        return ClosePlan(False, "account_binding_mismatch")
    if not intent.command_id or intent.command_id in consumed_command_ids:
        return ClosePlan(False, "duplicate_or_missing_command_id")
    if intent.expires_at <= now or intent.issued_at > now:
        return ClosePlan(False, "intent_expired_or_from_future")
    ttl = (intent.expires_at - intent.issued_at).total_seconds()
    if ttl <= 0 or ttl > max_ttl_seconds:
        return ClosePlan(False, "intent_ttl_invalid")
    tickets = intent.position_tickets
    if not tickets:
        return ClosePlan(False, "empty_close_request")
    if any(not isinstance(ticket, int) or ticket <= 0 for ticket in tickets):
        return ClosePlan(False, "invalid_position_ticket")
    if len(set(tickets)) != len(tickets):
        return ClosePlan(False, "duplicate_position_ticket")

    by_ticket = {p.ticket: p for p in positions}
    if len(by_ticket) != len(list(positions)) if not isinstance(positions, (list, tuple)) else False:
        return ClosePlan(False, "duplicate_snapshot_ticket")
    selected = []
    for ticket in tickets:
        position = by_ticket.get(ticket)
        if position is None:
            return ClosePlan(False, "position_not_found_or_already_closed")
        if position.account_login != expected_login or position.account_server != expected_server:
            return ClosePlan(False, "position_account_mismatch")
        if not (magic_base <= position.magic < magic_base + module_count):
            return ClosePlan(False, "position_not_nova_owned")
        if not position.symbol or not math.isfinite(position.volume) or position.volume <= 0:
            return ClosePlan(False, "invalid_position_snapshot")
        selected.append(ticket)
    return ClosePlan(True, "validated_nova_owned_close_plan", tuple(selected))
