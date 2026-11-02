"""Server-side Supabase REST persistence for NOVA market data.

Only trusted ingestion runtimes may construct this client. Never import it from
browser code or print its service-role credential.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Callable, Iterable
from urllib.parse import urlparse

ALLOWED_SOURCES = {"binance_public", "exness_mt5_demo", "exness_trader_api"}
ALLOWED_ENVIRONMENTS = {"public", "demo", "paper"}
ALLOWED_TIMEFRAMES = {"M1", "M5", "M15", "M30", "H1", "H4", "D1", "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"}
SYMBOL_RE = re.compile(r"^[A-Z0-9._/-]{2,32}$")


class SupabasePersistenceError(RuntimeError):
    """Sanitized persistence failure; never includes credentials or response bodies."""


def _iso_utc(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("invalid_bar_time")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid_bar_time") from exc
    if parsed.tzinfo is None:
        raise ValueError("bar_time_must_include_timezone")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _decimal_string(value: object, field: str) -> str:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"invalid_{field}") from exc
    if not parsed.is_finite():
        raise ValueError(f"invalid_{field}")
    return format(parsed, "f")


class SupabaseStore:
    """Minimal PostgREST client using a server-only service-role key."""

    def __init__(
        self,
        url: str,
        service_role_key: str,
        opener: Callable = urllib.request.urlopen,
        timeout: int = 20,
    ) -> None:
        parsed = urlparse(url.strip())
        host = (parsed.hostname or "").lower()
        local_host = host in {"localhost", "127.0.0.1"}
        if parsed.scheme != ("http" if local_host else "https") or not (
            local_host or host.endswith(".supabase.co")
        ):
            raise ValueError("invalid_supabase_url")
        if not service_role_key or "\n" in service_role_key or "\r" in service_role_key:
            raise ValueError("missing_supabase_service_role_key")
        self.base_url = url.rstrip("/")
        self._key = service_role_key
        self._opener = opener
        self._timeout = timeout

    @classmethod
    def from_env(cls, environ=None) -> "SupabaseStore":
        import os
        source = os.environ if environ is None else environ
        return cls(source.get("SUPABASE_URL", ""), source.get("SUPABASE_SERVICE_ROLE_KEY", ""))

    def _request(self, method: str, table: str, rows: list[dict], query: dict | None = None, prefer: str = "return=minimal"):
        suffix = "?" + urllib.parse.urlencode(query or {}) if query else ""
        url = f"{self.base_url}/rest/v1/{table}{suffix}"
        body = json.dumps(rows, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "apikey": self._key,
                "Authorization": "Bearer " + self._key,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": prefer,
            },
        )
        try:
            with self._opener(request, timeout=self._timeout) as response:
                status = getattr(response, "status", 200)
                response.read()
                if status < 200 or status >= 300:
                    raise SupabasePersistenceError(f"supabase_http_{status}")
        except urllib.error.HTTPError as exc:
            raise SupabasePersistenceError(f"supabase_http_{exc.code}") from None
        except urllib.error.URLError:
            raise SupabasePersistenceError("supabase_unreachable") from None
        except TimeoutError:
            raise SupabasePersistenceError("supabase_timeout") from None

    def upsert_candles(
        self,
        candles: Iterable[dict],
        *,
        symbol: str,
        timeframe: str,
        source: str,
        environment: str,
        owner_id: str | None = None,
        batch_size: int = 500,
    ) -> int:
        symbol = symbol.strip().upper()
        if not SYMBOL_RE.fullmatch(symbol):
            raise ValueError("invalid_symbol")
        if timeframe not in ALLOWED_TIMEFRAMES:
            raise ValueError("unsupported_timeframe")
        if source not in ALLOWED_SOURCES or environment not in ALLOWED_ENVIRONMENTS:
            raise ValueError("unsupported_source_or_environment")
        if source == "binance_public" and (environment != "public" or owner_id is not None):
            raise ValueError("source_environment_mismatch")
        if source.startswith("exness_") and (environment != "demo" or owner_id is None):
            raise ValueError("exness_demo_requires_owner")
        if owner_id is not None:
            try:
                owner_id = str(uuid.UUID(owner_id))
            except (ValueError, TypeError, AttributeError) as exc:
                raise ValueError("invalid_owner_id") from exc
        if not 1 <= batch_size <= 500:
            raise ValueError("invalid_batch_size")

        rows = []
        submitted = 0
        for candle in candles:
            if not isinstance(candle, dict):
                raise ValueError("invalid_candle")
            bar_time = _iso_utc(candle.get("bar_time") or candle.get("timestamp") or candle.get("open_time"))
            open_price = _decimal_string(candle.get("open"), "open")
            high = _decimal_string(candle.get("high"), "high")
            low = _decimal_string(candle.get("low"), "low")
            close = _decimal_string(candle.get("close"), "close")
            volume = _decimal_string(candle.get("volume", "0"), "volume")
            if Decimal(high) < max(Decimal(open_price), Decimal(close)) or Decimal(low) > min(Decimal(open_price), Decimal(close)) or Decimal(high) < Decimal(low) or Decimal(volume) < 0:
                raise ValueError("invalid_ohlcv_relationship")
            is_closed = candle.get("is_closed", True)
            if not isinstance(is_closed, bool):
                raise ValueError("invalid_is_closed")
            row = {
                "scope_key": owner_id or "shared",
                "owner_id": owner_id,
                "source": source,
                "environment": environment,
                "symbol": symbol,
                "timeframe": timeframe,
                "bar_time": bar_time,
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
                "tick_volume": int(candle["tick_volume"]) if candle.get("tick_volume") is not None else None,
                "spread_points": _decimal_string(candle["spread_points"], "spread_points") if candle.get("spread_points") is not None else None,
                "is_closed": is_closed,
            }
            rows.append(row)
            if len(rows) == batch_size:
                self._request("POST", "nova_market_candles", rows, {"on_conflict": "scope_key,symbol,timeframe,bar_time,source"}, "resolution=merge-duplicates,return=minimal")
                submitted += len(rows)
                rows = []
        if rows:
            self._request("POST", "nova_market_candles", rows, {"on_conflict": "scope_key,symbol,timeframe,bar_time,source"}, "resolution=merge-duplicates,return=minimal")
            submitted += len(rows)
        return submitted

    def record_ingestion_run(
        self,
        *,
        source: str,
        environment: str,
        symbol: str,
        timeframe: str,
        status: str,
        owner_id: str | None,
        received_count: int,
        submitted_count: int,
        error_code: str | None = None,
    ) -> None:
        if source not in ALLOWED_SOURCES or environment not in ALLOWED_ENVIRONMENTS:
            raise ValueError("unsupported_source_or_environment")
        if source == "binance_public" and (environment != "public" or owner_id is not None):
            raise ValueError("source_environment_mismatch")
        if source.startswith("exness_") and (environment != "demo" or owner_id is None):
            raise ValueError("exness_demo_requires_owner")
        if status not in {"completed", "failed", "partial"}:
            raise ValueError("invalid_ingestion_status")
        if owner_id is not None:
            owner_id = str(uuid.UUID(owner_id))
        row = {
            "owner_id": owner_id,
            "source": source,
            "environment": environment,
            "symbol": symbol.strip().upper(),
            "timeframe": timeframe,
            "status": status,
            "received_count": max(0, int(received_count)),
            "submitted_count": max(0, int(submitted_count)),
            "error_code": error_code if error_code and re.fullmatch(r"[a-z0-9_-]{2,64}", error_code) else None,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        self._request("POST", "nova_ingestion_runs", [row])
