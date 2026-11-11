"""Fail-closed NOVA -> MTRADERS trade-intent contract. Validation only; never submits orders."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable


@dataclass(frozen=True)
class DemoAccount:
    login: int
    server: str
    trade_mode: str
    currency: str
    tenant_id: str


@dataclass(frozen=True)
class RiskSnapshot:
    equity: float
    proposed_risk_money: float
    open_risk_pct: float
    daily_loss_pct: float
    open_positions: int
    quote_age_seconds: float


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
    issued_at: datetime
    expires_at: datetime
    magic: int


@dataclass(frozen=True)
class GateResult:
    allowed: bool
    reason: str


def validate_intent(
    intent: TradeIntent,
    account: DemoAccount,
    risk: RiskSnapshot,
    *,
    allowed_symbols: Iterable[str],
    consumed_command_ids: set[str],
    now: datetime | None = None,
    magic_base: int = 690711000,
    module_count: int = 30,
    max_single_risk_pct: float = 1.0,
    max_open_risk_pct: float = 9.0,
    max_daily_loss_pct: float = 10.0,
    max_positions: int = 9,
    max_quote_age_seconds: float = 5.0,
) -> GateResult:
    """Validate a proposed intent. This function has no broker/execution side effects."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or intent.issued_at.tzinfo is None or intent.expires_at.tzinfo is None:
        return GateResult(False, "timezone_required")
    if account.trade_mode != "DEMO" or "exness" not in account.server.casefold():
        return GateResult(False, "exness_demo_only")
    if account.currency != "USD":
        return GateResult(False, "account_currency_must_be_usd")
    if not account.tenant_id or intent.tenant_id != account.tenant_id:
        return GateResult(False, "tenant_mismatch")
    if intent.account_login != account.login or intent.account_server != account.server:
        return GateResult(False, "account_binding_mismatch")
    if not intent.command_id or intent.command_id in consumed_command_ids:
        return GateResult(False, "duplicate_or_missing_command_id")
    if intent.expires_at <= now or intent.issued_at > now:
        return GateResult(False, "intent_expired_or_from_future")
    if (intent.expires_at - intent.issued_at).total_seconds() > 30:
        return GateResult(False, "intent_ttl_exceeds_30_seconds")
    if intent.symbol not in set(allowed_symbols):
        return GateResult(False, "symbol_not_allowlisted")
    if intent.side not in {"BUY", "SELL"}:
        return GateResult(False, "invalid_side")
    if not (magic_base <= intent.magic < magic_base + module_count):
        return GateResult(False, "magic_not_nova_owned")
    numbers = (intent.volume, intent.entry, intent.stop_loss, intent.take_profit,
               risk.equity, risk.proposed_risk_money, risk.open_risk_pct,
               risk.daily_loss_pct, risk.quote_age_seconds)
    if any(not isinstance(value, (int, float)) or value != value for value in numbers):
        return GateResult(False, "non_finite_numeric_value")
    if intent.volume <= 0 or intent.entry <= 0 or intent.stop_loss <= 0 or intent.take_profit <= 0:
        return GateResult(False, "invalid_order_geometry")
    if intent.side == "BUY" and not (intent.stop_loss < intent.entry < intent.take_profit):
        return GateResult(False, "invalid_buy_sl_tp_geometry")
    if intent.side == "SELL" and not (intent.take_profit < intent.entry < intent.stop_loss):
        return GateResult(False, "invalid_sell_sl_tp_geometry")
    if risk.equity <= 0 or risk.proposed_risk_money <= 0:
        return GateResult(False, "risk_snapshot_unavailable")
    proposed_pct = risk.proposed_risk_money / risk.equity * 100.0
    if proposed_pct > max_single_risk_pct:
        return GateResult(False, "single_trade_risk_limit")
    if risk.open_risk_pct + proposed_pct > max_open_risk_pct:
        return GateResult(False, "aggregate_open_risk_limit")
    if risk.daily_loss_pct >= max_daily_loss_pct:
        return GateResult(False, "daily_loss_lock")
    if risk.open_positions >= max_positions:
        return GateResult(False, "max_positions_reached")
    if risk.quote_age_seconds < 0 or risk.quote_age_seconds > max_quote_age_seconds:
        return GateResult(False, "stale_quote")
    return GateResult(True, "validated_demo_intent_only")
