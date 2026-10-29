from __future__ import annotations

import hmac
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import rpyc
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

APP_NAME = "voom-mt5-headless-readonly-bridge"
MAX_BARS = 500
TENANT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,100}$")
TOKEN_MIN_LENGTH = 32
SYMBOL_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,40}$")
TIMEFRAME_NAMES = {"M1", "M5", "M15", "M30", "H1", "H4", "D1"}
REMOTE_ALLOWED_METHODS = frozenset({
    "initialize", "last_error", "terminal_info", "account_info", "symbols_get",
    "symbol_info", "symbol_select", "symbol_info_tick", "copy_rates_from_pos", "shutdown",
})
CORS_ORIGINS = [
    item.strip()
    for item in os.environ.get(
        "MT5_BRIDGE_CORS_ORIGINS",
        "https://voom-system-nova-ui.suwapat787.workers.dev",
    ).split(",")
    if item.strip()
]

REMOTE_HELPERS = r"""
import MetaTrader5 as mt5
def _voom_plain(value):
    if hasattr(value, "_asdict"):
        return {str(key): _voom_plain(item) for key, item in value._asdict().items()}
    dtype = getattr(value, "dtype", None)
    names = getattr(dtype, "names", None)
    if names:
        return [{str(name): _voom_plain(row[name]) for name in names} for row in value]
    if isinstance(value, dict):
        return {str(key): _voom_plain(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_voom_plain(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    item_method = getattr(value, "item", None)
    if callable(item_method):
        try:
            return _voom_plain(item_method())
        except Exception:
            pass
    return str(value)
def _voom_call(method, args, kwargs):
    return _voom_plain(getattr(mt5, method)(*args, **kwargs))
def _voom_constant(name):
    return _voom_plain(getattr(mt5, name))
"""


def _read_secret(env_name: str) -> str:
    path = os.environ.get(env_name, "").strip()
    if not path:
        return ""
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return ""


class RemoteMT5:
    """Read-only client for the private mt5linux RPyC listener.

    RPyC must only be reachable on the private Docker network. No host port is published.
    """

    def __init__(self) -> None:
        self.host = os.environ.get("MT5_HEADLESS_RPC_HOST", "mt5-engine").strip() or "mt5-engine"
        self.port = int(os.environ.get("MT5_HEADLESS_RPC_PORT", "18812"))
        self.timeout = float(os.environ.get("MT5_HEADLESS_RPC_TIMEOUT", "15"))
        self._connection = None
        self._lock = threading.RLock()

    def _get_connection(self):
        if self._connection is not None:
            return self._connection
        try:
            connection = rpyc.classic.connect(
                self.host,
                self.port,
                config={"sync_request_timeout": self.timeout},
            )
            connection.execute(REMOTE_HELPERS)
            self._connection = connection
            return connection
        except Exception as exc:
            raise RuntimeError("headless_mt5_engine_unavailable") from exc

    def _eval(self, expression: str) -> Any:
        with self._lock:
            try:
                connection = self._get_connection()
                return rpyc.classic.obtain(connection.eval(expression))
            except Exception as exc:
                if self._connection is not None:
                    try:
                        self._connection.close()
                    except Exception:
                        pass
                    self._connection = None
                raise RuntimeError("headless_mt5_read_failed") from exc

    def call(self, method: str, *args: Any, **kwargs: Any) -> Any:
        if method not in REMOTE_ALLOWED_METHODS:
            raise ValueError("MT5 method is not allowlisted")
        return self._eval(f"_voom_call({method!r}, {args!r}, {kwargs!r})")

    def constant(self, name: str) -> int:
        if name not in {f"TIMEFRAME_{item}" for item in TIMEFRAME_NAMES}:
            raise ValueError("MT5 constant is not allowlisted")
        value = self._eval(f"_voom_constant({name!r})")
        if not isinstance(value, int):
            raise RuntimeError("headless_mt5_constant_unavailable")
        return value


MT5 = RemoteMT5()
LOCK = threading.RLock()

app = FastAPI(
    title=APP_NAME,
    version="1.0.0",
    description="Tenant-isolated read-only Exness MT5 bridge for a headless Linux runtime.",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-VOOM-TENANT-ID"],
    max_age=600,
)


@app.middleware("http")
async def enforce_read_only(request: Request, call_next):
    if re.search(r"/(orders?|trades?|execute|withdraw|transfer)(/|$)", request.url.path, re.I):
        return JSONResponse(
            status_code=403,
            content={"error": "forbidden", "mode": "read-only", "order_submission_enabled": False},
        )
    if request.method not in {"GET", "OPTIONS"}:
        return JSONResponse(
            status_code=405,
            content={"error": "method_not_allowed", "mode": "read-only", "order_submission_enabled": False},
        )
    return await call_next(request)


def require_token(authorization: str | None, tenant_id: str | None) -> None:
    configured_tenant = _read_secret("MT5_TENANT_ID_FILE")
    token = _read_secret("MT5_BRIDGE_TOKEN_FILE")
    if not TENANT_ID_PATTERN.fullmatch(configured_tenant):
        raise HTTPException(status_code=503, detail="Bridge tenant is not configured")
    if len(token) < TOKEN_MIN_LENGTH:
        raise HTTPException(status_code=503, detail="Bridge is not configured")
    if not authorization or not re.fullmatch(r"Bearer\s+\S+", authorization, re.I):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if not tenant_id or not hmac.compare_digest(tenant_id, configured_tenant):
        raise HTTPException(status_code=403, detail="Bridge tenant mismatch")
    supplied = re.sub(r"^Bearer\s+", "", authorization, flags=re.I).strip()
    if not hmac.compare_digest(supplied, token):
        raise HTTPException(status_code=401, detail="Invalid bearer token")


def _ensure_terminal() -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        initialized = MT5.call("initialize")
        if not initialized:
            result = MT5.call("last_error")
            code = result[0] if isinstance(result, (list, tuple)) and result else "unknown"
            raise HTTPException(status_code=503, detail=f"MT5 initialize failed: {code}")
        terminal = MT5.call("terminal_info")
        account = MT5.call("account_info")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Headless MT5 engine unavailable") from exc
    if not isinstance(terminal, dict):
        raise HTTPException(status_code=503, detail="MT5 terminal status unavailable")
    if not isinstance(account, dict):
        raise HTTPException(status_code=503, detail="No MT5 account session detected")
    if not bool(terminal.get("connected")):
        raise HTTPException(status_code=503, detail="MT5 terminal is disconnected")
    return terminal, account


def _iso_epoch(value: Any) -> str | None:
    try:
        return datetime.fromtimestamp(int(value), timezone.utc).isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        return None


@app.get("/livez")
def livez():
    # Process liveness only. The outbound relay client never forwards this path.
    return {"status": "up", "service": APP_NAME}


@app.get("/health")
def health(
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    require_token(authorization, tenant_id)
    with LOCK:
        _ensure_terminal()
        return {
            "service": APP_NAME,
            "status": "ok",
            "terminal_connected": True,
            "account_session_available": True,
            "mode": "read-only",
            "order_submission_enabled": False,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/account")
def account_summary(
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    require_token(authorization, tenant_id)
    with LOCK:
        terminal, account = _ensure_terminal()
        return {
            "connected": True,
            "server": str(account.get("server", "")),
            "currency": str(account.get("currency", "")),
            "balance": float(account.get("balance", 0.0)),
            "equity": float(account.get("equity", 0.0)),
            "margin": float(account.get("margin", 0.0)),
            "free_margin": float(account.get("margin_free", 0.0)),
            "margin_level": float(account["margin_level"]) if account.get("margin_level") else None,
            "terminal_trade_allowed": bool(terminal.get("trade_allowed")),
            "order_submission_enabled": False,
            "mode": "read-only",
            "as_of": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/symbols")
def symbols(
    q: str = Query(default="", max_length=40),
    limit: int = Query(default=100, ge=1, le=500),
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    require_token(authorization, tenant_id)
    if q and not re.fullmatch(r"[A-Za-z0-9._ -]{1,40}", q):
        raise HTTPException(status_code=400, detail="Symbol filter is invalid")
    with LOCK:
        _ensure_terminal()
        try:
            found = MT5.call("symbols_get", group=f"*{q}*" if q else None)
        except Exception as exc:
            raise HTTPException(status_code=503, detail="MT5 symbols unavailable") from exc
        if found is None or not isinstance(found, list):
            raise HTTPException(status_code=503, detail="MT5 symbols unavailable")
        result = []
        for item in found[:limit]:
            if not isinstance(item, dict):
                continue
            result.append({
                "name": str(item.get("name", "")),
                "description": str(item.get("description", "")),
                "visible": bool(item.get("visible", False)),
                "digits": int(item.get("digits", 0)),
                "base_currency": str(item.get("currency_base", "")),
                "profit_currency": str(item.get("currency_profit", "")),
            })
        return {
            "symbols": result,
            "count": len(result),
            "truncated": len(found) > limit,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }


def timeframe_value(name: str) -> int:
    normalized = name.upper()
    if normalized not in TIMEFRAME_NAMES:
        raise HTTPException(status_code=400, detail="Unsupported timeframe")
    try:
        return MT5.constant(f"TIMEFRAME_{normalized}")
    except Exception as exc:
        raise HTTPException(status_code=503, detail="MT5 timeframe configuration unavailable") from exc


@app.get("/api/quotes")
def quotes(
    symbol: str = Query(min_length=1, max_length=40),
    timeframe: str = Query(default="M5", max_length=4),
    count: int = Query(default=100, ge=1, le=MAX_BARS),
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    require_token(authorization, tenant_id)
    if not SYMBOL_PATTERN.fullmatch(symbol):
        raise HTTPException(status_code=400, detail="Symbol is invalid")
    tf = timeframe_value(timeframe)
    with LOCK:
        _ensure_terminal()
        try:
            info = MT5.call("symbol_info", symbol)
            if not isinstance(info, dict):
                raise HTTPException(status_code=404, detail="Unknown MT5 symbol")
            if not bool(info.get("visible", False)) and not MT5.call("symbol_select", symbol, True):
                raise HTTPException(status_code=503, detail="Could not select requested symbol")
            tick = MT5.call("symbol_info_tick", symbol)
            rates = MT5.call("copy_rates_from_pos", symbol, tf, 0, count)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail="MT5 quote data unavailable") from exc
        if rates is None or not isinstance(rates, list):
            raise HTTPException(status_code=503, detail="MT5 rates unavailable")
        bars = []
        for rate in rates:
            if not isinstance(rate, dict):
                continue
            bars.append({
                "time": _iso_epoch(rate.get("time")),
                "open": float(rate.get("open", 0.0)),
                "high": float(rate.get("high", 0.0)),
                "low": float(rate.get("low", 0.0)),
                "close": float(rate.get("close", 0.0)),
                "tick_volume": int(rate.get("tick_volume", 0)),
                "spread": int(rate.get("spread", 0)),
                "real_volume": int(rate.get("real_volume", 0)),
            })
        return {
            "symbol": symbol,
            "timeframe": timeframe.upper(),
            "digits": int(info.get("digits", 0)),
            "tick": None if not isinstance(tick, dict) else {
                "bid": float(tick.get("bid", 0.0)),
                "ask": float(tick.get("ask", 0.0)),
                "last": float(tick.get("last", 0.0)),
                "time": _iso_epoch(tick.get("time")),
            },
            "bars": bars,
            "count": len(bars),
            "mode": "read-only",
            "order_submission_enabled": False,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }
