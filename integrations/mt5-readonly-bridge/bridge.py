from __future__ import annotations

import hmac
import math
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


def _required_deal_integer(deal: Any, field: str, *, allow_zero: bool = False) -> int:
    raw = getattr(deal, field, None)
    if isinstance(raw, bool) or raw is None:
        raise HTTPException(status_code=502, detail=f"MT5 deal {field} metadata unavailable")
    try:
        value = int(raw)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(status_code=502, detail=f"MT5 deal {field} metadata invalid") from None
    if value < 0 or (value == 0 and not allow_zero):
        raise HTTPException(status_code=502, detail=f"MT5 deal {field} metadata invalid")
    return value


def _required_deal_money(deal: Any, field: str) -> float:
    raw = getattr(deal, field, None)
    if isinstance(raw, bool) or raw is None:
        raise HTTPException(status_code=502, detail=f"MT5 deal {field} metadata unavailable")
    try:
        value = float(raw)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(status_code=502, detail=f"MT5 deal {field} metadata invalid") from None
    if not math.isfinite(value):
        raise HTTPException(status_code=502, detail=f"MT5 deal {field} metadata invalid")
    return value



def _required_position_integer(position: Any, field: str, *, allow_zero: bool = False) -> int:
    raw = getattr(position, field, None)
    if isinstance(raw, bool) or raw is None:
        raise HTTPException(status_code=502, detail=f"MT5 position {field} metadata unavailable")
    try:
        value = int(raw)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(status_code=502, detail=f"MT5 position {field} metadata invalid") from None
    if value < 0 or (value == 0 and not allow_zero):
        raise HTTPException(status_code=502, detail=f"MT5 position {field} metadata invalid")
    return value


def _required_position_number(position: Any, field: str) -> float:
    raw = getattr(position, field, None)
    if isinstance(raw, bool) or raw is None:
        raise HTTPException(status_code=502, detail=f"MT5 position {field} metadata unavailable")
    try:
        value = float(raw)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(status_code=502, detail=f"MT5 position {field} metadata invalid") from None
    if not math.isfinite(value):
        raise HTTPException(status_code=502, detail=f"MT5 position {field} metadata invalid")
    return value


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



@app.get("/api/positions")
def open_positions(
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    """Return the complete current open-position snapshot; read-only only."""
    require_token(authorization, tenant_id)
    with LOCK:
        get_terminal_and_account()
        positions = mt5.positions_get()
        if positions is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 positions unavailable: {error[0]}")
        account = mt5.account_info()
        selected = []
        for position in positions:
            selected.append({
                "ticket": _required_position_integer(position, "ticket"),
                "identifier": _required_position_integer(position, "identifier"),
                "time": datetime.fromtimestamp(int(position.time), timezone.utc).isoformat(),
                "type": _required_position_integer(position, "type", allow_zero=True),
                "magic": int(getattr(position, "magic", 0)),
                "symbol": str(getattr(position, "symbol", "")),
                "volume": _required_position_number(position, "volume"),
                "price_open": _required_position_number(position, "price_open"),
                "price_current": _required_position_number(position, "price_current"),
                "sl": _required_position_number(position, "sl"),
                "tp": _required_position_number(position, "tp"),
                "profit": _required_position_number(position, "profit"),
                "swap": _required_position_number(position, "swap"),
                "comment": str(getattr(position, "comment", "")),
            })
        return {
            "positions": selected,
            "count": len(selected),
            "truncated": False,
            "currency": str(getattr(account, "currency", "")),
            "mode": "read-only",
            "order_submission_enabled": False,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/history/deals")
def deal_history(
    from_time: str = Query(min_length=20, max_length=40),
    to_time: str = Query(min_length=20, max_length=40),
    limit: int = Query(default=1000, ge=1, le=5000),
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    """Return bounded, read-only MT5 deal history for commission reconciliation."""
    require_token(authorization, tenant_id)
    try:
        start = datetime.fromisoformat(from_time.replace("Z", "+00:00"))
        end = datetime.fromisoformat(to_time.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="from_time and to_time must be ISO-8601 timestamps") from None
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(status_code=400, detail="timestamps must include a timezone")
    start = start.astimezone(timezone.utc)
    end = end.astimezone(timezone.utc)
    if end <= start:
        raise HTTPException(status_code=400, detail="to_time must be later than from_time")
    if (end - start).total_seconds() > 7 * 24 * 60 * 60:
        raise HTTPException(status_code=400, detail="deal history range cannot exceed 7 days")

    with LOCK:
        get_terminal_and_account()
        deals = mt5.history_deals_get(start, end)
        if deals is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 deal history unavailable: {error[0]}")
        selected = deals[-limit:]
        account = mt5.account_info()
        return {
            "deals": [
                {
                    "ticket": _required_deal_integer(deal, "ticket"),
                    "order": int(getattr(deal, "order", 0)),
                    "position_id": _required_deal_integer(deal, "position_id", allow_zero=True),
                    "time": datetime.fromtimestamp(int(deal.time), timezone.utc).isoformat(),
                    "type": int(getattr(deal, "type", -1)),
                    "entry": int(getattr(deal, "entry", -1)),
                    "symbol": str(getattr(deal, "symbol", "")),
                    "volume": float(getattr(deal, "volume", 0.0)),
                    "price": float(getattr(deal, "price", 0.0)),
                    "profit": _required_deal_money(deal, "profit"),
                    "commission": _required_deal_money(deal, "commission"),
                    "swap": float(getattr(deal, "swap", 0.0)),
                    "fee": _required_deal_money(deal, "fee"),
                }
                for deal in selected
            ],
            "count": len(selected),
            "truncated": len(deals) > limit,
            "from_time": start.isoformat(),
            "to_time": end.isoformat(),
            "currency": str(getattr(account, "currency", "")),
            "mode": "read-only",
            "order_submission_enabled": False,
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
