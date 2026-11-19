from __future__ import annotations

import hmac
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5
from account_identity import matches_expected_identity
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

APP_NAME = "voom-mt5-readonly-bridge"
BRIDGE_TOKEN = os.environ.get("MT5_BRIDGE_TOKEN", "")
TENANT_ID = os.environ.get("MT5_TENANT_ID", "").strip()
# Provision these values locally for this dedicated tenant bridge; never accept them from a client.
EXPECTED_ACCOUNT_LOGIN = os.environ.get("MT5_EXPECTED_ACCOUNT_LOGIN", "")
EXPECTED_SERVER = os.environ.get("MT5_EXPECTED_SERVER", "")
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
MAX_HISTORY_DAYS = 90
MAX_HISTORY_DEALS = 500
LOCK = threading.RLock()

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


def validate_expected_account_identity(account: Any) -> None:
    # Identity is provisioned out-of-band on this tenant-dedicated Windows Bridge.
    # Missing configuration is an infrastructure error; mismatch is a hard authorization failure.
    if (
        not re.fullmatch(r"[1-9][0-9]{0,19}", EXPECTED_ACCOUNT_LOGIN)
        or not EXPECTED_SERVER
        or EXPECTED_SERVER != EXPECTED_SERVER.strip()
    ):
        raise HTTPException(status_code=503, detail="Expected MT5 account identity is not configured.")

    actual_login = getattr(account, "login", "")
    actual_server = getattr(account, "server", "")
    if not matches_expected_identity(actual_login, actual_server, EXPECTED_ACCOUNT_LOGIN, EXPECTED_SERVER):
        raise HTTPException(status_code=403, detail="Connected MT5 account does not match the provisioned Demo identity.")


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
        validate_expected_account_identity(account)
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
            "mode": "read-only",
            "order_submission_enabled": False,
            "checked_at": datetime.now(timezone.utc).isoformat(),
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


@app.get("/api/portfolio")
def portfolio(authorization: str | None = Header(default=None), tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID")):
    require_token(authorization, tenant_id)
    with LOCK:
        terminal, account = get_terminal_and_account()
        positions = mt5.positions_get()
        if positions is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 positions unavailable: {error[0]}")
        rows = []
        for item in positions[:500]:
            position_type = "buy" if item.type == mt5.POSITION_TYPE_BUY else "sell" if item.type == mt5.POSITION_TYPE_SELL else "unknown"
            rows.append({
                "ticket": int(item.ticket),
                "position_id": int(item.identifier),
                "time": datetime.fromtimestamp(int(item.time), timezone.utc).isoformat(),
                "type": position_type,
                "symbol": str(item.symbol),
                "volume": float(item.volume),
                "price_open": float(item.price_open),
                "price_current": float(item.price_current),
                "stop_loss": float(item.sl),
                "take_profit": float(item.tp),
                "swap": float(item.swap),
                "profit": float(item.profit),
            })
        return {
            "connected": bool(terminal.connected),
            "account": {
                "server": str(getattr(account, "server", "")),
                "currency": str(getattr(account, "currency", "")),
                "balance": float(account.balance),
                "equity": float(account.equity),
                "margin": float(account.margin),
                "free_margin": float(account.margin_free),
                "margin_level": float(account.margin_level) if account.margin_level else None,
                "as_of": datetime.now(timezone.utc).isoformat(),
            },
            "positions": rows,
            "count": len(rows),
            "truncated": len(positions) > 500,
            "mode": "read-only",
            "order_submission_enabled": False,
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


@app.get("/api/history")
def history(
    from_ts: int = Query(ge=1),
    to_ts: int = Query(ge=1),
    limit: int = Query(default=200, ge=1, le=MAX_HISTORY_DEALS),
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    require_token(authorization, tenant_id)
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if to_ts <= from_ts or to_ts > now_ts + 60 or to_ts - from_ts > MAX_HISTORY_DAYS * 86400:
        raise HTTPException(status_code=400, detail="History range must be chronological and no longer than 90 days.")
    with LOCK:
        get_terminal_and_account()
        start = datetime.fromtimestamp(from_ts, timezone.utc)
        end = datetime.fromtimestamp(to_ts, timezone.utc)
        deals = mt5.history_deals_get(start, end)
        if deals is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 history unavailable: {error[0]}")
        ordered = sorted(deals, key=lambda item: int(item.time), reverse=True)[:limit]
        rows = [{
            "ticket": int(item.ticket),
            "order": int(item.order),
            "position_id": int(item.position_id),
            "time": datetime.fromtimestamp(int(item.time), timezone.utc).isoformat(),
            "type": int(item.type),
            "entry": int(item.entry),
            "symbol": str(item.symbol),
            "volume": float(item.volume),
            "price": float(item.price),
            "commission": float(item.commission),
            "swap": float(item.swap),
            "profit": float(item.profit),
            "fee": float(getattr(item, "fee", 0.0)),
        } for item in ordered]
        return {
            "deals": rows,
            "count": len(rows),
            "range": {"from_ts": from_ts, "to_ts": to_ts},
            "mode": "read-only",
            "order_submission_enabled": False,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }
