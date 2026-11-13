from __future__ import annotations

import asyncio
import hmac
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import MetaTrader5 as mt5
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from exposure_snapshot import build_exposure_snapshot
from risk_state import broker_day_start, load_or_capture_broker_day_baseline

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
RISK_STATE_DB = os.environ.get(
    "MT5_RISK_STATE_DB",
    str(Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) /
        "VOOM_SYSTEM" / "state" / "mt5-risk-state.sqlite3"),
)
BROKER_DAY_ANCHOR_SYMBOL = os.environ.get("MT5_BROKER_DAY_ANCHOR_SYMBOL", "").strip()
BROKER_DAY_CAPTURE_TASK: asyncio.Task | None = None
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


def _risk_anchor_symbol(candidate: dict[str, Any] | None, positions: Any, pending_orders: Any) -> str | None:
    if BROKER_DAY_ANCHOR_SYMBOL:
        return BROKER_DAY_ANCHOR_SYMBOL
    if candidate and isinstance(candidate.get("symbol"), str):
        return candidate["symbol"]
    for item in list(positions or []) + list(pending_orders or []):
        symbol = str(getattr(item, "symbol", "") or "")
        if symbol:
            return symbol
    symbols = mt5.symbols_get()
    if symbols:
        for item in symbols:
            if bool(getattr(item, "visible", False)):
                return str(getattr(item, "name", "") or "") or None
    return None


def _parse_candidate(value: str | None) -> dict[str, Any] | None:
    if value is None:
        return None
    try:
        candidate = json.loads(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid candidate JSON")
    if not isinstance(candidate, dict) or set(candidate) != {"symbol", "side", "volume", "entry_price", "stop_loss"}:
        raise HTTPException(status_code=400, detail="Candidate fields are invalid")
    return candidate


async def _broker_day_capture_loop() -> None:
    """Poll through the broker D1 rollover so the baseline is captured durably."""
    while True:
        try:
            with LOCK:
                _terminal, account = get_terminal_and_account()
                positions = mt5.positions_get() or []
                pending_orders = mt5.orders_get() or []
                anchor = _risk_anchor_symbol(None, positions, pending_orders)
                day_start = broker_day_start(mt5, anchor) if anchor else None
                load_or_capture_broker_day_baseline(
                    db_path=RISK_STATE_DB, tenant_id=TENANT_ID, account=account,
                    day_start_epoch=day_start,
                )
        except Exception:
            # A missing terminal, symbol, or broker D1 bar is not a zero-risk state.
            pass
        await asyncio.sleep(2)


@app.on_event("startup")
async def start_broker_day_capture() -> None:
    global BROKER_DAY_CAPTURE_TASK
    if BROKER_DAY_CAPTURE_TASK is None or BROKER_DAY_CAPTURE_TASK.done():
        BROKER_DAY_CAPTURE_TASK = asyncio.create_task(_broker_day_capture_loop())


@app.on_event("shutdown")
async def stop_broker_day_capture() -> None:
    global BROKER_DAY_CAPTURE_TASK
    if BROKER_DAY_CAPTURE_TASK is not None:
        BROKER_DAY_CAPTURE_TASK.cancel()
        try:
            await BROKER_DAY_CAPTURE_TASK
        except asyncio.CancelledError:
            pass
        BROKER_DAY_CAPTURE_TASK = None


@app.get("/api/exposure")
def exposure_snapshot(
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
    candidate: str | None = Query(default=None, max_length=512),
):
    """Return broker exposure, durable broker-day baseline and recalculated candidate risk."""
    require_token(authorization, tenant_id)
    parsed_candidate = _parse_candidate(candidate)
    with LOCK:
        _terminal, account = get_terminal_and_account()
        positions = mt5.positions_get()
        pending_orders = mt5.orders_get()
        if positions is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 positions unavailable: {error[0]}")
        if pending_orders is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 pending orders unavailable: {error[0]}")
        anchor_symbol = _risk_anchor_symbol(parsed_candidate, positions, pending_orders)
        day_start = broker_day_start(mt5, anchor_symbol) if anchor_symbol else None
        baseline = load_or_capture_broker_day_baseline(
            db_path=RISK_STATE_DB, tenant_id=TENANT_ID, account=account,
            day_start_epoch=day_start,
        )
        snapshot = build_exposure_snapshot(
            mt5, account, list(positions), list(pending_orders),
            broker_day_baseline=baseline, candidate=parsed_candidate,
        )
        market_symbol = parsed_candidate.get("symbol") if parsed_candidate else anchor_symbol
        tick = mt5.symbol_info_tick(market_symbol) if market_symbol else None
        tick_epoch = int(getattr(tick, "time", 0) or 0) if tick is not None else 0
        now_epoch = datetime.now(timezone.utc).timestamp()
        snapshot["market_data_at"] = datetime.fromtimestamp(tick_epoch, timezone.utc).isoformat() if tick_epoch > 0 else None
        snapshot["market_open"] = bool(tick_epoch > 0 and -5 <= now_epoch - tick_epoch <= 60)
        return snapshot


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
