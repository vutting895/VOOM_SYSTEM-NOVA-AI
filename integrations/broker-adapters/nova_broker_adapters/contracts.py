"""Typed, dependency-free contracts for isolated NOVA broker adapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
import re
from typing import Literal, Protocol, runtime_checkable


_ALLOWED_OPERATIONS = frozenset({"connection.verify", "account.read", "market_data.read"})
_ALLOWED_ENVIRONMENTS = frozenset({"demo", "paper", "live"})
_ALLOWED_CONNECTION_STATES = frozenset({
    # Persisted System Hub statuses plus normalized adapter readiness states.
    "pending",
    "configured",
    "connected",
    "reachable",
    "authenticated",
    "identity_verified",
    "data_verified",
    "degraded",
    "reauth_required",
    "revoked",
    "disconnected",
    "disabled",
    "unavailable",
})
_ALLOWED_VERIFICATION_STATES = frozenset({
    "reachable",
    "authenticated",
    "identity_verified",
    "data_verified",
    "degraded",
    "reauth_required",
    "unavailable",
})
_DIAGNOSTIC_CODE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_MASK_MARKERS = ("*", "x", "X", "•", "·")


def _validate_timestamp(name: str, value: datetime) -> None:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")


def _validate_masked_account_id(value: str | None) -> None:
    if value is None:
        return
    if (
        not isinstance(value, str)
        or not 4 <= len(value) <= 32
        or value.strip() != value
        or any(character.isspace() for character in value)
        or not any(marker in value for marker in _MASK_MARKERS)
    ):
        raise ValueError("provider_account_id_masked must contain an explicit mask marker")


def _validate_currency(currency: str) -> None:
    if (
        not isinstance(currency, str)
        or not 2 <= len(currency) <= 12
        or not currency.isascii()
        or not currency.isalnum()
        or currency != currency.upper()
    ):
        raise ValueError("currency must be a 2-12 character uppercase ASCII ticker")


def _validate_finite_number(name: str, value: int | float) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number")
    try:
        finite = isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        raise ValueError(f"{name} must be a finite number")


class AdapterError(RuntimeError):
    """Safe adapter failure carrying a non-secret diagnostic code only."""

    def __init__(self, code: str) -> None:
        if not isinstance(code, str) or _DIAGNOSTIC_CODE.fullmatch(code) is None:
            raise ValueError("Adapter error code must be a stable lowercase identifier")
        # Provider exception text must never be copied into this exception.
        super().__init__("Broker adapter operation failed")
        self.code = code


@dataclass(frozen=True, slots=True)
class ReadOnlyCapabilities:
    """Explicitly bounded capabilities; write capabilities do not exist."""

    connection_verify: bool = True
    account_read: bool = True
    market_data_read: bool = False

    def operations(self) -> frozenset[str]:
        result: set[str] = set()
        if self.connection_verify:
            result.add("connection.verify")
        if self.account_read:
            result.add("account.read")
        if self.market_data_read:
            result.add("market_data.read")
        return frozenset(result)

    def validate(self) -> None:
        for name in ("connection_verify", "account_read", "market_data_read"):
            if type(getattr(self, name)) is not bool:
                raise AdapterError("invalid_capability")
        if not self.operations().issubset(_ALLOWED_OPERATIONS):
            raise AdapterError("unsupported_capability")


@dataclass(frozen=True, slots=True)
class BrokerConnection:
    """Non-secret connection metadata resolved by the trusted control plane."""

    connection_id: str
    owner_id: str
    provider_id: str
    environment: Literal["demo", "paper", "live"]
    state: Literal[
        "pending",
        "configured",
        "connected",
        "reachable",
        "authenticated",
        "identity_verified",
        "data_verified",
        "degraded",
        "reauth_required",
        "revoked",
        "disconnected",
        "disabled",
        "unavailable",
    ]
    capabilities: ReadOnlyCapabilities

    def __post_init__(self) -> None:
        for name, value in (
            ("connection_id", self.connection_id),
            ("owner_id", self.owner_id),
            ("provider_id", self.provider_id),
        ):
            if not isinstance(value, str) or not value or value.strip() != value:
                raise ValueError(f"{name} must be a non-empty normalized identifier")
        if self.environment not in _ALLOWED_ENVIRONMENTS:
            raise ValueError("unsupported broker environment")
        if self.state not in _ALLOWED_CONNECTION_STATES:
            raise ValueError("unsupported broker connection state")
        if not isinstance(self.capabilities, ReadOnlyCapabilities):
            raise ValueError("capabilities must be ReadOnlyCapabilities")
        self.capabilities.validate()


@dataclass(frozen=True, slots=True)
class ConnectionVerification:
    state: Literal[
        "reachable",
        "authenticated",
        "identity_verified",
        "data_verified",
        "degraded",
        "reauth_required",
        "unavailable",
    ]
    checked_at: datetime
    provider_account_id_masked: str | None = None
    latency_ms: int | None = None
    diagnostic_code: str | None = None

    def __post_init__(self) -> None:
        if self.state not in _ALLOWED_VERIFICATION_STATES:
            raise ValueError("unsupported connection verification state")
        _validate_timestamp("checked_at", self.checked_at)
        _validate_masked_account_id(self.provider_account_id_masked)
        if self.latency_ms is not None and (
            isinstance(self.latency_ms, bool)
            or not isinstance(self.latency_ms, int)
            or self.latency_ms < 0
        ):
            raise ValueError("latency_ms must be a non-negative integer")
        if self.diagnostic_code is not None and _DIAGNOSTIC_CODE.fullmatch(self.diagnostic_code) is None:
            raise ValueError("diagnostic_code must be a stable lowercase identifier")


@dataclass(frozen=True, slots=True)
class AccountBalance:
    currency: str
    total: float
    available: float | None = None

    def __post_init__(self) -> None:
        _validate_currency(self.currency)
        _validate_finite_number("total", self.total)
        if self.available is not None:
            _validate_finite_number("available", self.available)
        # Signed values are preserved: some providers report liabilities or
        # negative available margin. Callers must not silently clamp balances.


@dataclass(frozen=True, slots=True)
class AccountMetrics:
    """Normalized account-level margin metrics for brokers such as MT5."""

    currency: str
    balance: float
    equity: float
    margin: float
    free_margin: float
    margin_level: float | None = None

    def __post_init__(self) -> None:
        _validate_currency(self.currency)
        for name in ("balance", "equity", "margin", "free_margin"):
            _validate_finite_number(name, getattr(self, name))
        if self.margin_level is not None:
            _validate_finite_number("margin_level", self.margin_level)


@dataclass(frozen=True, slots=True)
class AccountSnapshot:
    provider_id: str
    connection_id: str
    balances: tuple[AccountBalance, ...]
    as_of: datetime
    provider_account_id_masked: str | None = None
    metrics: AccountMetrics | None = None

    def __post_init__(self) -> None:
        for name, value in (("provider_id", self.provider_id), ("connection_id", self.connection_id)):
            if not isinstance(value, str) or not value or value.strip() != value:
                raise ValueError(f"{name} must be a non-empty normalized identifier")
        if not isinstance(self.balances, tuple) or any(
            not isinstance(balance, AccountBalance) for balance in self.balances
        ):
            raise ValueError("balances must be a tuple of AccountBalance values")
        _validate_timestamp("as_of", self.as_of)
        _validate_masked_account_id(self.provider_account_id_masked)
        if self.metrics is not None and not isinstance(self.metrics, AccountMetrics):
            raise ValueError("metrics must be AccountMetrics when supplied")


@dataclass(frozen=True, slots=True)
class MarketDataPoint:
    """A normalized bid/ask/last observation; currency stays unknown unless supplied."""

    symbol: str
    price: float
    currency: str | None
    as_of: datetime
    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    timeframe: str = "M5"
    price_basis: Literal["mid", "last", "bar_close"] = "last"

    def __post_init__(self) -> None:
        if (
            not isinstance(self.symbol, str)
            or not 1 <= len(self.symbol) <= 32
            or self.symbol.strip() != self.symbol
            or any(character.isspace() for character in self.symbol)
        ):
            raise ValueError("symbol must be a normalized non-empty ticker")
        _validate_finite_number("price", self.price)
        if self.price < 0:
            raise ValueError("price cannot be negative")
        if self.currency is not None:
            _validate_currency(self.currency)
        for name in ("bid", "ask", "last"):
            value = getattr(self, name)
            if value is not None:
                _validate_finite_number(name, value)
                if value < 0:
                    raise ValueError(f"{name} cannot be negative")
        if self.timeframe not in {"M1", "M5", "M15", "M30", "H1", "H4", "D1"}:
            raise ValueError("unsupported market data timeframe")
        if self.price_basis not in {"mid", "last", "bar_close"}:
            raise ValueError("unsupported market data price basis")
        _validate_timestamp("as_of", self.as_of)


@runtime_checkable
class BrokerReadOnlyAdapter(Protocol):
    """Provider adapter surface. No order/write methods are part of this protocol."""

    provider_id: str

    async def verify(self, connection: BrokerConnection) -> ConnectionVerification:
        """Perform a bounded, provider-specific read-only verification."""

    async def account_snapshot(self, connection: BrokerConnection) -> AccountSnapshot:
        """Return a normalized, timestamped account snapshot."""

    async def market_data_snapshot(
        self,
        connection: BrokerConnection,
        symbols: tuple[str, ...],
    ) -> tuple[MarketDataPoint, ...]:
        """Return data only when market_data_read is granted; otherwise fail closed."""

    async def close(self) -> None:
        """Release provider sessions, sockets, and SDK resources."""
