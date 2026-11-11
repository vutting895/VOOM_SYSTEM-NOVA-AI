"""Fail-closed aggregate profit target logic. Calculation/configuration only; never sends broker commands."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from enum import Enum
from math import isfinite
from typing import Iterable, Optional
from uuid import uuid4


CENT = Decimal("0.01")
DEFAULT_TARGET_USD = Decimal("100.00")
DEFAULT_MAX_TARGET_USD = Decimal("1000000.00")


def _decimal(value: object, field_name: str) -> Decimal:
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be a finite decimal")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{field_name} must be a finite decimal") from None
    if not result.is_finite():
        raise ValueError(f"{field_name} must be finite")
    return result


def validate_target_usd(value: object, *, maximum: Decimal = DEFAULT_MAX_TARGET_USD) -> Decimal:
    """Validate and normalize a positive configurable USD target."""
    target = _decimal(value, "target_usd")
    maximum = _decimal(maximum, "maximum")
    if maximum <= 0:
        raise ValueError("maximum must be positive")
    if target <= 0:
        raise ValueError("target_usd must be greater than zero")
    if target > maximum:
        raise ValueError("target_usd exceeds configured maximum")
    if target != target.quantize(CENT, rounding=ROUND_HALF_UP):
        raise ValueError("target_usd supports at most two decimal places")
    return target.quantize(CENT)


@dataclass(frozen=True)
class ProfitTargetConfig:
    target_usd: Decimal = DEFAULT_TARGET_USD
    scope: str = "all_nova_positions"
    version: int = 1

    def __post_init__(self) -> None:
        object.__setattr__(self, "target_usd", validate_target_usd(self.target_usd))
        if self.scope != "all_nova_positions":
            raise ValueError("unsupported scope")
        if isinstance(self.version, bool) or not isinstance(self.version, int) or self.version < 1:
            raise ValueError("version must be a positive integer")


@dataclass(frozen=True)
class TargetChange:
    actor_id: str
    account_binding: str
    old_target_usd: Decimal
    new_target_usd: Decimal
    changed_at: str
    reason: str


class BasketState(str, Enum):
    DISABLED = "DISABLED"
    MONITORING = "MONITORING"
    TRIGGERED = "TRIGGERED"
    CLOSING = "CLOSING"
    RECONCILING = "RECONCILING"
    COMPLETED = "COMPLETED"
    PARTIAL_OR_BLOCKED = "PARTIAL_OR_BLOCKED"


ACTIVE_CLOSE_STATES = {
    BasketState.TRIGGERED,
    BasketState.CLOSING,
    BasketState.RECONCILING,
}


@dataclass(frozen=True)
class PositionProfit:
    """Broker snapshot for one position; commission inputs must be attributable to its identifier."""
    position_id: str
    account_binding: str
    tenant_id: str
    magic: int
    symbol: str
    profit: Decimal
    swap: Decimal = Decimal("0")
    entry_commission: Decimal = Decimal("0")
    exit_cost_estimate: Optional[Decimal] = None
    quote_age_seconds: float = 0.0
    is_open: bool = True
    is_pending_order: bool = False

    def __post_init__(self) -> None:
        for name in ("profit", "swap", "entry_commission"):
            object.__setattr__(self, name, _decimal(getattr(self, name), name))
        if self.exit_cost_estimate is not None:
            object.__setattr__(self, "exit_cost_estimate", _decimal(self.exit_cost_estimate, "exit_cost_estimate"))


@dataclass(frozen=True)
class BasketCalculation:
    complete: bool
    net_profit_usd: Optional[Decimal]
    target_usd: Decimal
    remaining_usd: Optional[Decimal]
    should_trigger: bool
    included_position_ids: tuple[str, ...]
    excluded_position_ids: tuple[str, ...]
    reason_codes: tuple[str, ...]
    calculated_at: str


@dataclass(frozen=True)
class BasketCycle:
    cycle_id: str
    config: ProfitTargetConfig
    account_binding: str
    tenant_id: str
    position_ids: tuple[str, ...]
    created_at: str
    state: BasketState = BasketState.TRIGGERED


def is_nova_owned(position: PositionProfit, *, account_binding: str, tenant_id: str,
                  registered_magic_numbers: set[int]) -> bool:
    """Strict ownership filter. Magic zero/manual positions are never NOVA-owned."""
    return (
        position.is_open
        and not position.is_pending_order
        and bool(position.position_id)
        and position.account_binding == account_binding
        and position.tenant_id == tenant_id
        and isinstance(position.magic, int)
        and not isinstance(position.magic, bool)
        and position.magic != 0
        and position.magic in registered_magic_numbers
    )


def calculate_basket_profit(
    positions: Iterable[PositionProfit],
    *,
    config: ProfitTargetConfig,
    account_binding: str,
    tenant_id: str,
    account_currency: str,
    registered_magic_numbers: set[int],
    max_quote_age_seconds: float = 5.0,
) -> BasketCalculation:
    """Calculate current net basket profit. Incomplete evidence never triggers."""
    included: list[PositionProfit] = []
    excluded: list[str] = []
    reasons: list[str] = []

    if account_currency.upper() != "USD":
        reasons.append("unsupported_account_currency")
    if not account_binding or not tenant_id:
        reasons.append("missing_account_or_tenant_binding")
    if not registered_magic_numbers or 0 in registered_magic_numbers:
        reasons.append("invalid_nova_magic_registry")
    if isinstance(max_quote_age_seconds, bool) or not isinstance(max_quote_age_seconds, (int, float)) or not isfinite(max_quote_age_seconds) or max_quote_age_seconds <= 0:
        reasons.append("invalid_quote_age_policy")

    for position in positions:
        if not is_nova_owned(position, account_binding=account_binding, tenant_id=tenant_id,
                             registered_magic_numbers=registered_magic_numbers):
            excluded.append(position.position_id)
            continue
        if not isfinite(position.quote_age_seconds) or position.quote_age_seconds < 0 or position.quote_age_seconds > max_quote_age_seconds:
            reasons.append("stale_or_invalid_quote")
        if position.exit_cost_estimate is None:
            reasons.append("missing_exit_cost_estimate")
        included.append(position)

    if not included:
        reasons.append("empty_nova_basket")

    net = Decimal("0")
    for position in included:
        # Costs are represented as non-negative amounts; reject negative values rather than
        # allowing a malformed fee/rebate to inflate the target calculation.
        if position.entry_commission < 0 or (position.exit_cost_estimate is not None and position.exit_cost_estimate < 0):
            reasons.append("invalid_cost_attribution")
            continue
        if position.exit_cost_estimate is None:
            continue
        net += position.profit + position.swap - position.entry_commission - position.exit_cost_estimate

    complete = not reasons
    net = net.quantize(CENT, rounding=ROUND_HALF_UP) if complete else None
    remaining = (config.target_usd - net).quantize(CENT, rounding=ROUND_HALF_UP) if complete else None
    trigger = bool(complete and net is not None and net >= config.target_usd)

    return BasketCalculation(
        complete=complete,
        net_profit_usd=net,
        target_usd=config.target_usd,
        remaining_usd=remaining,
        should_trigger=trigger,
        included_position_ids=tuple(p.position_id for p in included),
        excluded_position_ids=tuple(excluded),
        reason_codes=tuple(sorted(set(reasons))),
        calculated_at=datetime.now(timezone.utc).isoformat(),
    )


class AggregateProfitTargetController:
    """In-memory configuration/audit and immutable-cycle guard; deliberately no execution API."""

    def __init__(self, *, config: ProfitTargetConfig = ProfitTargetConfig(), enabled: bool = False):
        self._config = config
        self._enabled = bool(enabled)
        self._state = BasketState.MONITORING if enabled else BasketState.DISABLED
        self._pending_config: Optional[ProfitTargetConfig] = None
        self._audit: list[TargetChange] = []
        self._cycle: Optional[BasketCycle] = None

    @property
    def config(self) -> ProfitTargetConfig:
        return self._config

    @property
    def state(self) -> BasketState:
        return self._state

    @property
    def audit_log(self) -> tuple[TargetChange, ...]:
        return tuple(self._audit)

    @property
    def active_cycle(self) -> Optional[BasketCycle]:
        return self._cycle

    @property
    def pending_config(self) -> Optional[ProfitTargetConfig]:
        return self._pending_config

    def set_target(self, value: object, *, actor_id: str, account_binding: str,
                   authorized_owner: bool, reason: str = "owner_update") -> ProfitTargetConfig:
        if not authorized_owner:
            raise PermissionError("authorized NOVA owner required")
        if not actor_id or not account_binding:
            raise ValueError("actor_id and account_binding are required")
        target = validate_target_usd(value)
        next_config = ProfitTargetConfig(target_usd=target, version=self._config.version + 1)
        change = TargetChange(
            actor_id=actor_id,
            account_binding=account_binding,
            old_target_usd=self._config.target_usd,
            new_target_usd=target,
            changed_at=datetime.now(timezone.utc).isoformat(),
            reason=reason,
        )
        if self._state in ACTIVE_CLOSE_STATES:
            self._pending_config = next_config
        else:
            self._config = next_config
        self._audit.append(change)
        return next_config

    def begin_cycle(self, *, calculation: BasketCalculation, account_binding: str,
                    tenant_id: str) -> BasketCycle:
        if not self._enabled or self._state != BasketState.MONITORING:
            raise RuntimeError("aggregate profit monitor is disabled or not monitoring")
        if not calculation.complete or not calculation.should_trigger:
            raise ValueError("complete calculation at or above target is required")
        if calculation.target_usd != self._config.target_usd:
            raise ValueError("calculation target does not match current configuration")
        self._cycle = BasketCycle(
            cycle_id=str(uuid4()),
            config=self._config,
            account_binding=account_binding,
            tenant_id=tenant_id,
            position_ids=calculation.included_position_ids,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._state = BasketState.TRIGGERED
        return self._cycle

    def set_cycle_state(self, state: BasketState) -> None:
        if self._cycle is None:
            raise RuntimeError("no active basket cycle")
        allowed = {
            BasketState.TRIGGERED: {BasketState.CLOSING, BasketState.PARTIAL_OR_BLOCKED},
            BasketState.CLOSING: {BasketState.RECONCILING, BasketState.PARTIAL_OR_BLOCKED},
            BasketState.RECONCILING: {BasketState.COMPLETED, BasketState.PARTIAL_OR_BLOCKED, BasketState.CLOSING},
            BasketState.PARTIAL_OR_BLOCKED: {BasketState.RECONCILING},
            BasketState.COMPLETED: set(),
        }
        if state not in allowed[self._state]:
            raise ValueError(f"invalid state transition: {self._state.value} -> {state.value}")
        self._state = state

    def complete_cycle(self, *, broker_confirmed_no_remaining_positions: bool) -> None:
        if self._state != BasketState.RECONCILING or not broker_confirmed_no_remaining_positions:
            raise ValueError("broker reconciliation must confirm no captured positions remain")
        self._state = BasketState.COMPLETED
        self._cycle = None
        if self._pending_config is not None:
            self._config = self._pending_config
            self._pending_config = None
        self._state = BasketState.MONITORING if self._enabled else BasketState.DISABLED

    def disable(self) -> None:
        if self._state in ACTIVE_CLOSE_STATES:
            raise RuntimeError("cannot disable during an active close cycle")
        self._enabled = False
        self._state = BasketState.DISABLED
