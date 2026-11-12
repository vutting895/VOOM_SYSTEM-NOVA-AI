"""Fail-closed, side-effect-free NOVA risk governor.

This module validates a proposed trade intent against an authenticated snapshot.
It does not connect to a broker, reserve capacity, submit, modify, or close orders.
A passing result means proposal validation only, never execution authorization.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
from typing import FrozenSet


MAX_SINGLE_TRADE_RISK_PCT = 1.0
MAX_AGGREGATE_OPEN_RISK_PCT = 9.0
MAX_DAILY_LOSS_PCT = 10.0
MAX_TOTAL_EXPOSURE_ORDERS = 5
MAX_QUOTE_AGE_SECONDS = 5.0
MAX_SNAPSHOT_AGE_SECONDS = 5.0
MAX_INTENT_TTL_SECONDS = 30.0
NOVA_MAGIC_BASE = 690711000
NOVA_MAGIC_MODULES = 30


@dataclass(frozen=True)
class DemoAccount:
    tenant_id: str
    login: int
    server: str
    trade_mode: str
    currency: str


@dataclass(frozen=True)
class ExposureSnapshot:
    tenant_id: str
    account_login: int
    account_server: str
    equity: float
    proposed_risk_money: float
    aggregate_open_risk_pct: float
    daily_loss_pct: float
    open_positions: int
    open_pending_orders: int
    quote_age_seconds: float
    as_of: datetime


@dataclass(frozen=True)
class TradeIntent:
    command_id: str
    tenant_id: str
    account_login: int
    account_server: str
    symbol: str
    side: str
    volume: float
    entry: float
    stop_loss: float
    take_profit: float
    magic: int
    issued_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class RiskDecision:
    allowed: bool
    reason: str
    proposed_risk_pct: float | None = None
    total_exposure_orders: int | None = None


def _aware(value: object) -> bool:
    return isinstance(value, datetime) and value.tzinfo is not None and value.utcoffset() is not None


def _finite_number(value: object) -> bool:
    return type(value) in (int, float) and math.isfinite(value)


def validate_trade_proposal(
    intent: TradeIntent,
    account: DemoAccount,
    snapshot: ExposureSnapshot,
    *,
    allowed_symbols: FrozenSet[str],
    consumed_command_ids: frozenset[str],
    now: datetime | None = None,
) -> RiskDecision:
    """Validate a proposal only; never performs execution or external I/O."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(intent, TradeIntent) or not isinstance(account, DemoAccount):
        return RiskDecision(False, "invalid_intent_or_account")
    if not isinstance(snapshot, ExposureSnapshot) or not _aware(now):
        return RiskDecision(False, "invalid_snapshot_or_clock")
    if not all(_aware(value) for value in (intent.issued_at, intent.expires_at, snapshot.as_of)):
        return RiskDecision(False, "timezone_required")

    if account.trade_mode != "DEMO" or "exness" not in account.server.casefold():
        return RiskDecision(False, "exness_demo_only")
    if account.currency != "USD":
        return RiskDecision(False, "account_currency_must_be_usd")
    if type(account.login) is not int or account.login <= 0 or not account.tenant_id:
        return RiskDecision(False, "invalid_account_identity")
    if (intent.tenant_id != account.tenant_id or snapshot.tenant_id != account.tenant_id):
        return RiskDecision(False, "tenant_mismatch")
    if (intent.account_login != account.login or snapshot.account_login != account.login
            or intent.account_server != account.server or snapshot.account_server != account.server):
        return RiskDecision(False, "account_binding_mismatch")

    if not isinstance(intent.command_id, str) or not intent.command_id.strip():
        return RiskDecision(False, "missing_command_id")
    if intent.command_id in consumed_command_ids:
        return RiskDecision(False, "duplicate_command_id")
    ttl = (intent.expires_at - intent.issued_at).total_seconds()
    if intent.issued_at > now or intent.expires_at <= now or ttl <= 0 or ttl > MAX_INTENT_TTL_SECONDS:
        return RiskDecision(False, "intent_expired_or_ttl_invalid")
    snapshot_age = (now - snapshot.as_of).total_seconds()
    if snapshot_age < -1.0 or snapshot_age > MAX_SNAPSHOT_AGE_SECONDS:
        return RiskDecision(False, "stale_or_future_exposure_snapshot")

    if not isinstance(allowed_symbols, frozenset) or not allowed_symbols or intent.symbol not in allowed_symbols:
        return RiskDecision(False, "symbol_not_allowlisted")
    if intent.side not in {"BUY", "SELL"}:
        return RiskDecision(False, "invalid_side")
    if type(intent.magic) is not int or not (NOVA_MAGIC_BASE <= intent.magic < NOVA_MAGIC_BASE + NOVA_MAGIC_MODULES):
        return RiskDecision(False, "magic_not_nova_owned")

    order_numbers = (intent.volume, intent.entry, intent.stop_loss, intent.take_profit,
                     snapshot.equity, snapshot.proposed_risk_money,
                     snapshot.aggregate_open_risk_pct, snapshot.daily_loss_pct,
                     snapshot.quote_age_seconds)
    if any(not _finite_number(value) for value in order_numbers):
        return RiskDecision(False, "non_finite_numeric_value")
    if intent.volume <= 0 or min(intent.entry, intent.stop_loss, intent.take_profit) <= 0:
        return RiskDecision(False, "invalid_order_geometry")
    if intent.side == "BUY" and not (intent.stop_loss < intent.entry < intent.take_profit):
        return RiskDecision(False, "invalid_buy_sl_tp_geometry")
    if intent.side == "SELL" and not (intent.take_profit < intent.entry < intent.stop_loss):
        return RiskDecision(False, "invalid_sell_sl_tp_geometry")

    if (type(snapshot.open_positions) is not int or snapshot.open_positions < 0
            or type(snapshot.open_pending_orders) is not int or snapshot.open_pending_orders < 0):
        return RiskDecision(False, "invalid_exposure_counts")
    if snapshot.equity <= 0 or snapshot.proposed_risk_money <= 0:
        return RiskDecision(False, "invalid_risk_snapshot")
    if snapshot.aggregate_open_risk_pct < 0:
        return RiskDecision(False, "invalid_aggregate_open_risk")
    if snapshot.daily_loss_pct >= MAX_DAILY_LOSS_PCT:
        return RiskDecision(False, "daily_loss_lock")
    if snapshot.quote_age_seconds < 0 or snapshot.quote_age_seconds > MAX_QUOTE_AGE_SECONDS:
        return RiskDecision(False, "stale_quote")

    proposed_pct = snapshot.proposed_risk_money / snapshot.equity * 100.0
    total_orders = snapshot.open_positions + snapshot.open_pending_orders
    if proposed_pct > MAX_SINGLE_TRADE_RISK_PCT:
        return RiskDecision(False, "single_trade_risk_limit", proposed_pct, total_orders)
    if snapshot.aggregate_open_risk_pct + proposed_pct > MAX_AGGREGATE_OPEN_RISK_PCT:
        return RiskDecision(False, "aggregate_open_risk_limit", proposed_pct, total_orders)
    if total_orders >= MAX_TOTAL_EXPOSURE_ORDERS:
        return RiskDecision(False, "max_total_exposure_orders", proposed_pct, total_orders)

    return RiskDecision(True, "proposal_validated_no_execution", proposed_pct, total_orders)
