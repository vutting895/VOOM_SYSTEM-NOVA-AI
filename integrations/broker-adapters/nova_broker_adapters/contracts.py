"""Typed, dependency-free contracts for isolated NOVA broker adapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol, runtime_checkable


_ALLOWED_OPERATIONS = frozenset({"connection.verify", "account.read", "market_data.read"})


class AdapterError(RuntimeError):
    """Safe adapter failure carrying a non-secret diagnostic code."""

    def __init__(self, code: str, message: str = "Broker adapter operation failed") -> None:
        if not code or not code.replace("_", "").isalnum():
            raise ValueError("Adapter error code must be a stable alphanumeric identifier")
        super().__init__(message)
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
        "configured",
        "reachable",
        "authenticated",
        "identity_verified",
        "data_verified",
        "degraded",
        "reauth_required",
        "revoked",
        "disconnected",
        "unavailable",
    ]
    capabilities: ReadOnlyCapabilities

    def __post_init__(self) -> None:
        for name, value in (
            ("connection_id", self.connection_id),
            ("owner_id", self.owner_id),
            ("provider_id", self.provider_id),
        ):
            if not value or value.strip() != value:
                raise ValueError(f"{name} must be a non-empty normalized identifier")
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
        if self.checked_at.tzinfo is None:
            raise ValueError("checked_at must be timezone-aware")
        if self.latency_ms is not None and self.latency_ms < 0:
            raise ValueError("latency_ms cannot be negative")


@dataclass(frozen=True, slots=True)
class AccountBalance:
    currency: str
    total: float
    available: float | None = None

    def __post_init__(self) -> None:
        # ISO fiat and common exchange tickers (e.g. USDT) are both supported.
        if not 2 <= len(self.currency) <= 12 or not self.currency.isalnum():
            raise ValueError("currency must be a 2-12 character alphanumeric code")
        if self.total < 0 and self.available is not None and self.available < 0:
            raise ValueError("invalid negative balance values")


@dataclass(frozen=True, slots=True)
class AccountSnapshot:
    provider_id: str
    connection_id: str
    balances: tuple[AccountBalance, ...]
    as_of: datetime
    provider_account_id_masked: str | None = None

    def __post_init__(self) -> None:
        if self.as_of.tzinfo is None:
            raise ValueError("as_of must be timezone-aware")
        if not self.provider_id or not self.connection_id:
            raise ValueError("provider_id and connection_id are required")


@runtime_checkable
class BrokerReadOnlyAdapter(Protocol):
    """Provider adapter surface. No order/write methods are part of this protocol."""

    provider_id: str

    async def verify(self, connection: BrokerConnection) -> ConnectionVerification:
        """Perform a bounded, provider-specific read-only verification."""

    async def account_snapshot(self, connection: BrokerConnection) -> AccountSnapshot:
        """Return a normalized, timestamped account snapshot."""

    async def close(self) -> None:
        """Release provider sessions, sockets, and SDK resources."""
