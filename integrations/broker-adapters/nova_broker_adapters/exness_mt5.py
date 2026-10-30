"""Exness MT5 Demo adapter backed by the existing authenticated System Hub.

The adapter never connects to MetaTrader5 directly. The injected Hub client must
be bound to the currently authenticated NOVA customer and expose only the Hub's
read-only check/account/quotes routes.
"""
from __future__ import annotations

from datetime import datetime
import math
import re
from typing import Any, Mapping, Protocol
from uuid import UUID

from .contracts import (
    AccountBalance,
    AccountMetrics,
    AccountSnapshot,
    AdapterError,
    BrokerConnection,
    ConnectionVerification,
    MarketDataPoint,
)

_SYMBOL = re.compile(r"^[A-Za-z0-9._-]{1,40}$")
_TIMEFRAMES = frozenset({"M1", "M5", "M15", "M30", "H1", "H4", "D1"})


@dataclass(frozen=True, slots=True)
class HubResponse:
    """Sanitized HTTP response from the authenticated System Hub client."""

    status_code: int
    body: Mapping[str, Any]

    def __post_init__(self) -> None:
        if isinstance(self.status_code, bool) or not isinstance(self.status_code, int) or not 100 <= self.status_code <= 599:
            raise ValueError("status_code must be a valid HTTP status")
        if not isinstance(self.body, Mapping):
            raise ValueError("body must be a mapping")


class ExnessSystemHubClient(Protocol):
    """User-bound client. Authentication token handling stays outside the adapter."""

    @property
    def authenticated_owner_id(self) -> str: ...

    async def check_connection(self, connection_id: str) -> HubResponse: ...
    async def read_account(self, connection_id: str) -> HubResponse: ...
    async def read_quotes(self, connection_id: str, *, symbol: str, timeframe: str, count: int) -> HubResponse: ...
    async def close(self) -> None: ...


class ExnessMT5Adapter:
    provider_id = "exness_mt5"
    environment = "demo"

    def __init__(self, hub_client: ExnessSystemHubClient, *, timeframe: str = "M5") -> None:
        if timeframe not in _TIMEFRAMES:
            raise ValueError("unsupported MT5 timeframe")
        self._hub = hub_client
        self._timeframe = timeframe

    def _validate_connection(self, connection: BrokerConnection, capability: str) -> None:
        try:
            UUID(connection.connection_id)
        except ValueError:
            raise AdapterError("invalid_connection_id") from None
        if connection.provider_id != self.provider_id:
            raise AdapterError("provider_not_supported")
        if connection.environment != self.environment:
            raise AdapterError("environment_not_supported")
        if connection.state in {"revoked", "reauth_required", "disconnected", "disabled", "unavailable"}:
            raise AdapterError("connection_not_active")
        if not getattr(connection.capabilities, capability):
            raise AdapterError("capability_not_granted")
        # The injected Hub client is already bound to Supabase Auth. Never trust
        # an owner ID supplied only by a model/request body.
        try:
            authenticated_owner = self._hub.authenticated_owner_id
        except Exception:
            raise AdapterError("hub_identity_unavailable") from None
        if not isinstance(authenticated_owner, str) or authenticated_owner != connection.owner_id:
            raise AdapterError("owner_scope_mismatch")

    async def _request(self, method_name: str, *args: Any, **kwargs: Any) -> Mapping[str, Any]:
        try:
            method = getattr(self._hub, method_name)
            response = await method(*args, **kwargs)
        except Exception:
            # Never propagate SDK/HTTP exception text; it may contain request data.
            raise AdapterError("hub_request_failed") from None
        if not isinstance(response, HubResponse):
            raise AdapterError("hub_invalid_response")
        if response.status_code != 200:
            raise AdapterError(self._status_code(response.status_code))
        return response.body

    @staticmethod
    def _status_code(status: int) -> str:
        return {
            400: "hub_invalid_request",
            401: "reauth_required",
            403: "permission_denied",
            404: "connection_not_found",
            409: "connection_not_ready",
            502: "upstream_unavailable",
            503: "upstream_unavailable",
            504: "upstream_timeout",
        }.get(status, "hub_request_failed")

    @staticmethod
    def _timestamp(value: Any) -> datetime:
        if not isinstance(value, str) or not value:
            raise AdapterError("hub_timestamp_missing")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            raise AdapterError("hub_timestamp_invalid") from None
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise AdapterError("hub_timestamp_invalid")
        return parsed

    @staticmethod
    def _finite(value: Any) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise AdapterError("hub_numeric_field_invalid")
        try:
            if not math.isfinite(value):
                raise AdapterError("hub_numeric_field_invalid")
        except OverflowError:
            raise AdapterError("hub_numeric_field_invalid") from None
        return float(value)

    @staticmethod
    def _assert_read_only_response(body: Mapping[str, Any], connection_id: str) -> None:
        if body.get("connectionId") != connection_id:
            raise AdapterError("hub_connection_mismatch")
        if body.get("ordersEnabled") is not False or body.get("liveTradingEnabled") is not False:
            raise AdapterError("read_only_guard_missing")
        if body.get("dataVerified") is not True or body.get("state") != "data_verified":
            raise AdapterError("connection_not_data_verified")

    async def verify(self, connection: BrokerConnection) -> ConnectionVerification:
        self._validate_connection(connection, "connection_verify")
        body = await self._request("check_connection", connection.connection_id)
        self._assert_read_only_response(body, connection.connection_id)
        if body.get("accountReadSucceeded") is not True:
            raise AdapterError("account_read_not_verified")
        checked_at = self._timestamp(body.get("checkedAt"))
        return ConnectionVerification(state="data_verified", checked_at=checked_at)

    async def account_snapshot(self, connection: BrokerConnection) -> AccountSnapshot:
        self._validate_connection(connection, "account_read")
        body = await self._request("read_account", connection.connection_id)
        self._assert_read_only_response(body, connection.connection_id)
        account = body.get("account")
        if not isinstance(account, Mapping):
            raise AdapterError("hub_account_payload_invalid")
        if (
            account.get("connected") is not True
            or account.get("broker") != "Exness"
            or account.get("platform") != "MT5"
            or account.get("environment") != "demo"
            or account.get("mode") != "read-only"
            or account.get("order_submission_enabled") is not False
        ):
            raise AdapterError("broker_identity_or_read_only_guard_invalid")
        currency = account.get("currency")
        if not isinstance(currency, str) or not 2 <= len(currency) <= 12 or not currency.isascii() or not currency.isalnum() or currency != currency.upper():
            raise AdapterError("hub_currency_invalid")
        metrics = AccountMetrics(
            currency=currency,
            balance=self._finite(account.get("balance")),
            equity=self._finite(account.get("equity")),
            margin=self._finite(account.get("margin")),
            free_margin=self._finite(account.get("free_margin")),
            margin_level=None if account.get("margin_level") is None else self._finite(account.get("margin_level")),
        )
        as_of = self._timestamp(account.get("as_of"))
        return AccountSnapshot(
            provider_id=self.provider_id,
            connection_id=connection.connection_id,
            balances=(AccountBalance(currency=currency, total=metrics.balance),),
            as_of=as_of,
            metrics=metrics,
        )

    async def market_data_snapshot(
        self,
        connection: BrokerConnection,
        symbols: tuple[str, ...],
    ) -> tuple[MarketDataPoint, ...]:
        self._validate_connection(connection, "market_data_read")
        if not isinstance(symbols, tuple) or not 1 <= len(symbols) <= 10:
            raise AdapterError("symbol_count_out_of_range")
        if any(not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol) for symbol in symbols):
            raise AdapterError("invalid_market_symbol")
        if len(set(symbols)) != len(symbols):
            raise AdapterError("duplicate_market_symbol")

        points: list[MarketDataPoint] = []
        # Sequential bounded reads avoid unbounded provider fan-out.
        for symbol in symbols:
            body = await self._request(
                "read_quotes",
                connection.connection_id,
                symbol=symbol,
                timeframe=self._timeframe,
                count=1,
            )
            self._assert_read_only_response(body, connection.connection_id)
            quote = body.get("quote")
            if not isinstance(quote, Mapping) or quote.get("mode") != "read-only" or quote.get("order_submission_enabled") is not False:
                raise AdapterError("hub_quote_payload_invalid")
            if quote.get("symbol") != symbol:
                raise AdapterError("hub_symbol_mismatch")
            timeframe = quote.get("timeframe")
            if timeframe not in _TIMEFRAMES:
                raise AdapterError("hub_timeframe_invalid")
            tick = quote.get("tick")
            tick = tick if isinstance(tick, Mapping) else {}
            bid = None if tick.get("bid") is None else self._finite(tick.get("bid"))
            ask = None if tick.get("ask") is None else self._finite(tick.get("ask"))
            last = None if tick.get("last") is None else self._finite(tick.get("last"))
            if bid is not None and ask is not None:
                price = (bid + ask) / 2.0
                price_basis = "mid"
            elif last is not None:
                price = last
                price_basis = "last"
            else:
                bars = quote.get("bars")
                first_bar = bars[0] if isinstance(bars, list) and bars else None
                if not isinstance(first_bar, Mapping) or first_bar.get("close") is None:
                    raise AdapterError("quote_price_unavailable")
                price = self._finite(first_bar.get("close"))
                price_basis = "bar_close"
            timestamp_value = tick.get("time") if isinstance(tick.get("time"), str) else quote.get("as_of")
            points.append(MarketDataPoint(
                symbol=symbol,
                price=price,
                currency=None,  # The current Hub quote response has no quote-currency field.
                as_of=self._timestamp(timestamp_value),
                bid=bid,
                ask=ask,
                last=last,
                timeframe=timeframe,
                price_basis=price_basis,
            ))
        return tuple(points)

    async def close(self) -> None:
        try:
            await self._hub.close()
        except Exception:
            raise AdapterError("hub_close_failed") from None
