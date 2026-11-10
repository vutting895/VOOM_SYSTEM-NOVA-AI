from __future__ import annotations

import hmac
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

import MetaTrader5 as mt5
from history_contract import serialize_history_rates
from terminal_contract import AccountNotExnessDemo, TerminalUnavailable, validate_exness_demo_terminal
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

APP_NAME = "voom-mt5-readonly-bridge"
BRIDGE_TOKEN = os.environ.get("MT5_BRIDGE_TOKEN", "")
TENANT_ID = os.environ.get("MT5_TENANT_ID", "").strip()
TERMINAL_PATH = os.environ.get("MT5_TERMINAL_PATH", "").strip() or None
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "MT5_BRIDGE_CORS_ORIGINS",
        "https://voomsystem.netlify.app,https://voom-system-nova-ui.suwapat787.workers.dev",
    ).split(",")
    if origin.strip()
]
MAX_BARS = 500
MAX_HISTORY_BARS = 2000
MAX_HISTORY_DAYS = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 180, "D1": 730}
LOCK = threading.RLock()


def read_only_metadata() -> dict[str, Any]:
    """Capabilities exposed by this bridge; terminal permissions never enable API execution."""
    return {
        "mode": "read-only",
        "order_submission_enabled": False,
        "ordersEnabled": False,
        "executionEnabled": False,
        "liveTradingEnabled": False,
    }


app = FastAPI(
    title=APP_NAME,
    version="1.0.0",
    description="Read-only MT5 account and market-data bridge. No trading endpoints.",
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
            content={"error": "forbidden", **read_only_metadata()},
        )
    if request.method not in {"GET", "OPTIONS"}:
        return JSONResponse(
            status_code=405,
            content={"error": "method_not_allowed", **read_only_metadata()},
        )
    return await call_next(request)


def require_token(authorization: str | None, tenant_id: str | None) -> None:
    # Report an unavailable service first, then authenticate before disclosing tenant-boundary results.
    if not TENANT_ID or not BRIDGE_TOKEN:
        raise HTTPException(status_code=503, detail="Bridge is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    supplied = authorization[7:].strip()
    if not hmac.compare_digest(supplied, BRIDGE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    if not tenant_id or not hmac.compare_digest(tenant_id, TENANT_ID):
        raise HTTPException(status_code=403, detail="Bridge tenant mismatch")


def initialize_mt5() -> None:
    """Initialize the terminal only when needed; never issue a trading command."""
    initialized = mt5.initialize(path=TERMINAL_PATH) if TERMINAL_PATH else mt5.initialize()
    if not initialized:
        error = mt5.last_error()
        code = error[0] if error else "unknown"
        raise HTTPException(status_code=503, detail=f"MT5 initialize failed: {code}")


def ensure_connection() -> tuple[Any, Any]:
    """Reuse a healthy session and reinitialize a disconnected terminal once."""
    terminal = mt5.terminal_info()
    account = mt5.account_info()
    if terminal is None or not bool(getattr(terminal, "connected", False)) or account is None:
        initialize_mt5()
        terminal = mt5.terminal_info()
        account = mt5.account_info()
    if terminal is None or not bool(getattr(terminal, "connected", False)):
        raise HTTPException(status_code=503, detail="MT5 terminal is not connected")
    if account is None:
        error = mt5.last_error()
        code = error[0] if error else "unknown"
        raise HTTPException(status_code=503, detail=f"MT5 account unavailable: {code}")
    return terminal, account


def get_open_positions(limit: int = 100) -> tuple[list[dict[str, Any]], int]:
    """Read a bounded snapshot of open positions; this function cannot modify them."""
    found = mt5.positions_get()
    if found is None:
        error = mt5.last_error()
        code = error[0] if error else "unknown"
        raise HTTPException(status_code=503, detail=f"MT5 positions unavailable: {code}")
    position_types = {
        getattr(mt5, "POSITION_TYPE_BUY", 0): "BUY",
        getattr(mt5, "POSITION_TYPE_SELL", 1): "SELL",
    }
    positions: list[dict[str, Any]] = []
    for item in found[:limit]:
        raw_time = getattr(item, "time", None)
        positions.append({
            "ticket": int(getattr(item, "ticket", 0)),
            "symbol": str(getattr(item, "symbol", "")),
            "type": position_types.get(getattr(item, "type", None), "UNKNOWN"),
            "volume": float(getattr(item, "volume", 0.0)),
            "price_open": float(getattr(item, "price_open", 0.0)),
            "price_current": float(getattr(item, "price_current", 0.0)),
            "stop_loss": float(getattr(item, "sl", 0.0)),
            "take_profit": float(getattr(item, "tp", 0.0)),
            "profit": float(getattr(item, "profit", 0.0)),
            "swap": float(getattr(item, "swap", 0.0)),
            "time_utc": (
                datetime.fromtimestamp(int(raw_time), timezone.utc).isoformat()
                if raw_time is not None else None
            ),
            "magic": int(getattr(item, "magic", 0)),
            "comment": str(getattr(item, "comment", ""))[:128],
        })
    return positions, len(found)


def get_terminal_and_account() -> tuple[Any, Any]:
    with LOCK:
        terminal, account = ensure_connection()
        try:
            validate_exness_demo_terminal(
                terminal,
                account,
                getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", None),
            )
        except TerminalUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except AccountNotExnessDemo as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from None
        return terminal, account


def timeframe_value(name: str) -> int:
    values = {
        "M1": mt5.TIMEFRAME_M1,
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30,
        "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1,
    }
    value = values.get(name.upper())
    if value is None:
        raise HTTPException(status_code=400, detail="Unsupported timeframe")
    return value


@app.get("/health")
def health(authorization: str | None = Header(default=None), tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID")):
    require_token(authorization, tenant_id)
    with LOCK:
        terminal, account = get_terminal_and_account()
        return {
            "service": APP_NAME,
            "status": "ok",
            "terminal_connected": bool(terminal.connected),
            "account_session_available": account is not None,
            "account_environment": "EXNESS_DEMO",
            **read_only_metadata(),
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/account")
def account_summary(authorization: str | None = Header(default=None), tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID")):
    require_token(authorization, tenant_id)
    with LOCK:
        terminal, account = get_terminal_and_account()
        positions, positions_total = get_open_positions(limit=100)
        return {
            "connected": bool(terminal.connected),
            "server": str(getattr(account, "server", "")),
            "account_environment": "EXNESS_DEMO",
            "currency": str(getattr(account, "currency", "")),
            "balance": float(account.balance),
            "equity": float(account.equity),
            "margin": float(account.margin),
            "free_margin": float(account.margin_free),
            "margin_level": float(account.margin_level) if account.margin_level else None,
            "terminal_trade_allowed_by_terminal": bool(terminal.trade_allowed),
            "open_positions": positions,
            "open_positions_count": positions_total,
            "open_positions_truncated": positions_total > len(positions),
            **read_only_metadata(),
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
    with LOCK:
        get_terminal_and_account()
        found = mt5.symbols_get(group=f"*{q}*" if q else None)
        if found is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 symbols unavailable: {error[0]}")
        return {
            "symbols": [
                {
                    "name": item.name,
                    "description": item.description,
                    "visible": bool(item.visible),
                    "digits": int(item.digits),
                    "base_currency": str(item.currency_base),
                    "profit_currency": str(item.currency_profit),
                }
                for item in found[:limit]
            ],
            "count": min(len(found), limit),
            "truncated": len(found) > limit,
            "account_environment": "EXNESS_DEMO",
            **read_only_metadata(),
            "as_of": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/quotes")
def quotes(
    symbol: str = Query(min_length=1, max_length=40),
    timeframe: str = Query(default="M5", max_length=4),
    count: int = Query(default=100, ge=1, le=MAX_BARS),
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    require_token(authorization, tenant_id)
    with LOCK:
        get_terminal_and_account()
        info = mt5.symbol_info(symbol)
        if info is None:
            raise HTTPException(status_code=404, detail=f"Unknown MT5 symbol: {symbol}")
        if not info.visible and not mt5.symbol_select(symbol, True):
            raise HTTPException(status_code=503, detail="Could not select requested symbol")
        tick = mt5.symbol_info_tick(symbol)
        rates = mt5.copy_rates_from_pos(symbol, timeframe_value(timeframe), 0, count)
        if rates is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 rates unavailable: {error[0]}")
        bars = []
        for rate in rates:
            bars.append({
                "time": datetime.fromtimestamp(int(rate["time"]), timezone.utc).isoformat(),
                "open": float(rate["open"]),
                "high": float(rate["high"]),
                "low": float(rate["low"]),
                "close": float(rate["close"]),
                "tick_volume": int(rate["tick_volume"]),
                "spread": int(rate["spread"]),
                "real_volume": int(rate["real_volume"]),
            })
        return {
            "symbol": symbol,
            "timeframe": timeframe.upper(),
            "digits": int(info.digits),
            "account_environment": "EXNESS_DEMO",
            "tick": None if tick is None else {
                "bid": float(tick.bid),
                "ask": float(tick.ask),
                "last": float(tick.last),
                "time": datetime.fromtimestamp(int(tick.time), timezone.utc).isoformat(),
            },
            "bars": bars,
            "count": len(bars),
            **read_only_metadata(),
            "as_of": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/history")
def history(
    symbol: str = Query(min_length=1, max_length=40),
    timeframe: str = Query(default="H1", max_length=4),
    start_utc: str = Query(min_length=20, max_length=32),
    end_utc: str = Query(min_length=20, max_length=32),
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    """Return bounded UTC half-open history; GET-only and tenant-authenticated."""
    require_token(authorization, tenant_id)
    tf = timeframe.upper()
    if tf not in MAX_HISTORY_DAYS:
        raise HTTPException(status_code=400, detail="Unsupported timeframe")
    utc_pattern = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"
    if not re.fullmatch(utc_pattern, start_utc) or not re.fullmatch(utc_pattern, end_utc):
        raise HTTPException(status_code=400, detail="Timestamps must use strict UTC ISO-8601 Z format")
    try:
        start = datetime.fromisoformat(start_utc.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_utc.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Timestamps must be valid UTC ISO-8601 values")
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(status_code=400, detail="Timestamps must include a UTC offset")
    start, end = start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    if start >= end:
        raise HTTPException(status_code=400, detail="start_utc must be earlier than end_utc")
    if end - start > timedelta(days=MAX_HISTORY_DAYS[tf]):
        raise HTTPException(status_code=400, detail="Requested range too large; split into smaller chunks")
    with LOCK:
        get_terminal_and_account()
        info = mt5.symbol_info(symbol)
        if info is None:
            raise HTTPException(status_code=404, detail=f"Unknown MT5 symbol: {symbol}")
        if not info.visible and not mt5.symbol_select(symbol, True):
            raise HTTPException(status_code=503, detail="Could not select requested symbol")
        rates = mt5.copy_rates_range(symbol, timeframe_value(tf), start, end - timedelta(seconds=1))
        if rates is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 history unavailable: {error[0]}")
        try:
            bars = serialize_history_rates(rates, start, end, MAX_HISTORY_BARS)
        except (ValueError, TypeError, KeyError, OverflowError, OSError):
            # Do not expose malformed broker payloads as trusted historical market data.
            raise HTTPException(status_code=502, detail="MT5 returned invalid historical data") from None
        return {
            "symbol": symbol, "timeframe": tf, "digits": int(info.digits),
            "start_utc": start.isoformat().replace("+00:00", "Z"),
            "end_utc": end.isoformat().replace("+00:00", "Z"),
            "bars": bars, "count": len(bars), "account_environment": "EXNESS_DEMO",
            **read_only_metadata(),
            "as_of": datetime.now(timezone.utc).isoformat(),
        }
