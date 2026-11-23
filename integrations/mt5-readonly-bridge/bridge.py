from __future__ import annotations

import hmac
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5
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
LOCK = threading.RLock()
EA_BRIDGE_TOKEN = os.environ.get("MT5_EA_BRIDGE_TOKEN", "").strip()
EA_HEARTBEAT: dict[str, Any] | None = None

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
            content={"error": "forbidden", "mode": "read-only", "order_submission_enabled": False},
        )
    if request.method == "POST" and request.url.path == "/api/ea/heartbeat":
        # This is local EA telemetry ingestion only, not a broker write operation.
        host = request.client.host if request.client else ""
        if host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            return JSONResponse(status_code=403, content={"error": "loopback_only"})
        return await call_next(request)
    if request.method not in {"GET", "OPTIONS"}:
        return JSONResponse(
            status_code=405,
            content={"error": "method_not_allowed", "mode": "read-only"},
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
    initialized = mt5.initialize(path=TERMINAL_PATH) if TERMINAL_PATH else mt5.initialize()
    if not initialized:
        error = mt5.last_error()
        raise HTTPException(status_code=503, detail=f"MT5 initialize failed: {error[0]}")


def get_terminal_and_account() -> tuple[Any, Any]:
    with LOCK:
        initialize_mt5()
        terminal = mt5.terminal_info()
        account = mt5.account_info()
        if terminal is None:
            raise HTTPException(status_code=503, detail="MT5 terminal status unavailable")
        if account is None:
            raise HTTPException(status_code=503, detail="No MT5 account session detected")

        # Restrict this tenant-bound terminal to Exness Demo only.
        trade_mode = getattr(account, "trade_mode", None)
        demo_mode = getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", None)
        server_name = str(getattr(account, "server", "") or "")
        company_name = str(getattr(terminal, "company", "") or "")
        if trade_mode != demo_mode or "exness" not in f"{server_name} {company_name}".lower():
            raise HTTPException(
                status_code=403,
                detail="Only an Exness Demo MT5 terminal is permitted.",
            )
        return terminal, account


def timeframe_duration_seconds(name: str) -> int:
    durations = {
        "M1": 60, "M2": 120, "M3": 180, "M4": 240, "M5": 300,
        "M6": 360, "M10": 600, "M12": 720, "M15": 900, "M20": 1200,
        "M30": 1800, "H1": 3600, "H2": 7200, "H3": 10800,
        "H4": 14400, "H6": 21600, "H8": 28800, "H12": 43200,
        "D1": 86400, "W1": 604800,
    }
    value = durations.get(name.upper())
    if value is None:
        raise HTTPException(status_code=400, detail="Unsupported fixed-duration timeframe")
    return value


def timeframe_close_time(bar_open_time: int, name: str) -> datetime:
    normalized = name.upper()
    opened = datetime.fromtimestamp(bar_open_time, timezone.utc)
    if normalized == "MN1":
        if opened.month == 12:
            return opened.replace(year=opened.year + 1, month=1, day=1)
        return opened.replace(month=opened.month + 1, day=1)
    return datetime.fromtimestamp(
        bar_open_time + timeframe_duration_seconds(normalized), timezone.utc
    )


def timeframe_value(name: str) -> int:
    values = {
        "M1": mt5.TIMEFRAME_M1, "M2": mt5.TIMEFRAME_M2,
        "M3": mt5.TIMEFRAME_M3, "M4": mt5.TIMEFRAME_M4,
        "M5": mt5.TIMEFRAME_M5, "M6": mt5.TIMEFRAME_M6,
        "M10": mt5.TIMEFRAME_M10, "M12": mt5.TIMEFRAME_M12,
        "M15": mt5.TIMEFRAME_M15, "M20": mt5.TIMEFRAME_M20,
        "M30": mt5.TIMEFRAME_M30, "H1": mt5.TIMEFRAME_H1,
        "H2": mt5.TIMEFRAME_H2, "H3": mt5.TIMEFRAME_H3,
        "H4": mt5.TIMEFRAME_H4, "H6": mt5.TIMEFRAME_H6,
        "H8": mt5.TIMEFRAME_H8, "H12": mt5.TIMEFRAME_H12,
        "D1": mt5.TIMEFRAME_D1, "W1": mt5.TIMEFRAME_W1,
        "MN1": mt5.TIMEFRAME_MN1,
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
            "mode": "read-only",
            "order_submission_enabled": False,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }




@app.post("/api/ea/heartbeat")
async def ingest_ea_heartbeat(
    request: Request,
    x_nova_ea_token: str | None = Header(default=None, alias="X-NOVA-EA-TOKEN"),
):
    """Accept a narrow loopback-only heartbeat from the read-only NOVA EA."""
    global EA_HEARTBEAT
    if not EA_BRIDGE_TOKEN:
        raise HTTPException(status_code=503, detail="EA telemetry token is not configured")
    if not x_nova_ea_token or not hmac.compare_digest(x_nova_ea_token, EA_BRIDGE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid EA telemetry token")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    required = {
        "ea_id", "version", "symbol", "timeframe", "mode",
        "orders_enabled", "live_trading_enabled",
        "last_tick_utc", "last_bar_utc", "signal_count"
    }
    if not isinstance(payload, dict) or set(payload) != required:
        raise HTTPException(status_code=400, detail="Heartbeat schema mismatch")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", str(payload["ea_id"])):
        raise HTTPException(status_code=400, detail="Invalid EA identity")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,24}", str(payload["version"])):
        raise HTTPException(status_code=400, detail="Invalid EA version")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", str(payload["symbol"])):
        raise HTTPException(status_code=400, detail="Invalid symbol")
    if payload["timeframe"] not in {"M1", "M2", "M3", "M4", "M5", "M6", "M10", "M12", "M15", "M20", "M30", "H1", "H2", "H3", "H4", "H6", "H8", "H12", "D1", "W1", "MN1"}:
        raise HTTPException(status_code=400, detail="Invalid timeframe")
    if payload["mode"] != "read-only" or payload["orders_enabled"] is not False or payload["live_trading_enabled"] is not False:
        raise HTTPException(status_code=403, detail="Only READ-ONLY telemetry is accepted")
    if isinstance(payload["signal_count"], bool) or not isinstance(payload["signal_count"], int) or payload["signal_count"] < 0:
        raise HTTPException(status_code=400, detail="Invalid signal counter")
    for field in ("last_tick_utc", "last_bar_utc"):
        if not isinstance(payload[field], str) or len(payload[field]) > 40:
            raise HTTPException(status_code=400, detail="Invalid timestamp")
        try:
            parsed = datetime.fromisoformat(payload[field].replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError("timezone required")
        except ValueError:
            raise HTTPException(status_code=400, detail="Timestamp must include timezone")
    record = dict(payload)
    record["received_at"] = datetime.now(timezone.utc).isoformat()
    with LOCK:
        EA_HEARTBEAT = record
    return {
        "accepted": True,
        "mode": "read-only",
        "orders_enabled": False,
        "live_trading_enabled": False,
        "received_at": record["received_at"],
    }


@app.get("/api/ea/status")
def ea_status(
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    require_token(authorization, tenant_id)
    with LOCK:
        record = dict(EA_HEARTBEAT) if EA_HEARTBEAT else None
    if record is None:
        return {
            "connected": False,
            "status": "never_seen",
            "mode": "read-only",
            "orders_enabled": False,
            "live_trading_enabled": False,
            "heartbeat_interval_seconds": 2,
        }
    received = datetime.fromisoformat(record["received_at"])
    age = max(0.0, (datetime.now(timezone.utc) - received).total_seconds())
    return {
        "connected": age <= 6.0,
        "status": "online" if age <= 6.0 else "stale",
        "heartbeat_age_seconds": round(age, 3),
        "heartbeat_interval_seconds": 2,
        **record,
        "orders_enabled": False,
        "live_trading_enabled": False,
    }

@app.get("/api/account")
def account_summary(authorization: str | None = Header(default=None), tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID")):
    require_token(authorization, tenant_id)
    with LOCK:
        terminal, account = get_terminal_and_account()
        return {
            "connected": bool(terminal.connected),
            "server": str(getattr(account, "server", "")),
            "currency": str(getattr(account, "currency", "")),
            "balance": float(account.balance),
            "equity": float(account.equity),
            "margin": float(account.margin),
            "free_margin": float(account.margin_free),
            "margin_level": float(account.margin_level) if account.margin_level else None,
            "terminal_trade_allowed": bool(terminal.trade_allowed),
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
        # Reading quotes must not mutate MT5 Market Watch state. Ask the user
        # to select hidden symbols manually in the terminal before retrying.
        if not info.visible:
            raise HTTPException(status_code=409, detail="symbol_not_selected_in_terminal")
        tick = mt5.symbol_info_tick(symbol)
        # Position 0 is the still-forming candle in MT5. Quant Core only accepts completed bars.
        rates = mt5.copy_rates_from_pos(symbol, timeframe_value(timeframe), 1, count)
        if rates is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 rates unavailable: {error[0]}")
        bars = []
        for rate in rates:
            bar_open_time = int(rate["time"])
            bars.append({
                "time": datetime.fromtimestamp(bar_open_time, timezone.utc).isoformat(),
                "bar_close_time": timeframe_close_time(bar_open_time, timeframe).isoformat(),
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
            "tick": None if tick is None else {
                "bid": float(tick.bid),
                "ask": float(tick.ask),
                "last": float(tick.last),
                "time": datetime.fromtimestamp(int(tick.time), timezone.utc).isoformat(),
            },
            "bars": bars,
            "count": len(bars),
            "mode": "read-only",
            "order_submission_enabled": False,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }
