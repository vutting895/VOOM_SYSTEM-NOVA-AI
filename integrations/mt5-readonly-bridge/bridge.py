from __future__ import annotations

import hmac
import math
import os
import re
import threading
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
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
            "account_denomination": (
                "standard-cent" if str(getattr(account, "currency", "")).upper() == "USC"
                else "unsupported-cent" if str(getattr(account, "currency", "")).upper().endswith("C")
                else "currency-native"
            ),
            "balance": float(account.balance),
            "balance_decimal": optional_decimal_string(account, "balance"),
            "equity": float(account.equity),
            "equity_decimal": optional_decimal_string(account, "equity"),
            "margin": float(account.margin),
            "margin_decimal": optional_decimal_string(account, "margin"),
            "free_margin": float(account.margin_free),
            "free_margin_decimal": optional_decimal_string(account, "margin_free"),
            "margin_level": float(account.margin_level) if account.margin_level else None,
            "terminal_trade_allowed": bool(terminal.trade_allowed),
            "order_submission_enabled": False,
            "mode": "read-only",
            "as_of": datetime.now(timezone.utc).isoformat(),
        }


@app.get("/api/profit-calculation")
def profit_calculation(
    symbol: str = Query(min_length=1, max_length=40),
    side: str = Query(min_length=3, max_length=4),
    volume: Decimal = Query(gt=0),
    open_price: Decimal = Query(gt=0),
    stop_price: Decimal = Query(gt=0),
    authorization: str | None = Header(default=None),
    tenant_id: str | None = Header(default=None, alias="X-VOOM-TENANT-ID"),
):
    """Calculate a hypothetical stop loss in account currency; never sends an order."""
    require_token(authorization, tenant_id)
    normalized_side = side.strip().lower()
    if normalized_side not in {"buy", "sell"}:
        raise HTTPException(status_code=400, detail="Side must be buy or sell")
    if (normalized_side == "buy" and stop_price >= open_price) or (
        normalized_side == "sell" and stop_price <= open_price
    ):
        raise HTTPException(status_code=400, detail="Stop price must represent a loss for the selected side")
    with LOCK:
        _, account = get_terminal_and_account()
        info = mt5.symbol_info(symbol)
        if info is None:
            raise HTTPException(status_code=404, detail=f"Unknown MT5 symbol: {symbol}")
        if not info.visible and not mt5.symbol_select(symbol, True):
            raise HTTPException(status_code=503, detail="Could not select requested symbol")
        minimum = optional_decimal_string(info, "volume_min")
        maximum = optional_decimal_string(info, "volume_max")
        step = optional_decimal_string(info, "volume_step")
        tick_size_raw = optional_decimal_string(info, "trade_tick_size")
        if minimum is None or maximum is None or step is None or tick_size_raw is None:
            raise HTTPException(status_code=503, detail="MT5 volume or tick constraints unavailable")
        min_volume, max_volume, volume_step = Decimal(minimum), Decimal(maximum), Decimal(step)
        tick_size = Decimal(tick_size_raw)
        if tick_size <= 0:
            raise HTTPException(status_code=503, detail="MT5 tick size is invalid")
        if ((open_price / tick_size) != (open_price / tick_size).to_integral_value()
                or (stop_price / tick_size) != (stop_price / tick_size).to_integral_value()):
            raise HTTPException(status_code=400, detail="Prices do not match broker tick size")
        if min_volume <= 0 or max_volume < min_volume or volume_step <= 0:
            raise HTTPException(status_code=503, detail="MT5 volume constraints are invalid")
        if volume < min_volume or volume > max_volume:
            raise HTTPException(status_code=400, detail="Volume is outside broker min/max constraints")
        step_units = (volume - min_volume) / volume_step
        if step_units != step_units.to_integral_value():
            raise HTTPException(status_code=400, detail="Volume does not match broker volume step")
        order_type = mt5.ORDER_TYPE_BUY if normalized_side == "buy" else mt5.ORDER_TYPE_SELL
        result = mt5.order_calc_profit(
            order_type, symbol, float(volume), float(open_price), float(stop_price)
        )
        if result is None:
            error = mt5.last_error()
            raise HTTPException(status_code=503, detail=f"MT5 profit calculation unavailable: {error[0]}")
        native_profit = Decimal(str(result))
        if not native_profit.is_finite() or native_profit >= 0:
            raise HTTPException(status_code=503, detail="MT5 did not return a valid negative stop-loss result")
        account_currency = str(getattr(account, "currency", "") or "").upper()
        if not account_currency:
            raise HTTPException(status_code=503, detail="MT5 account currency unavailable")
        if account_currency == "USC" and not symbol.strip().upper().endswith("C"):
            raise HTTPException(status_code=403, detail="Exness USC Cent accounts require a cent-suffixed symbol")
        return {
            "symbol": symbol,
            "side": normalized_side,
            "volume_decimal": format(volume, "f"),
            "open_price_decimal": format(open_price, "f"),
            "stop_price_decimal": format(stop_price, "f"),
            "profit_native_decimal": format(native_profit, "f"),
            "loss_native_decimal": format(abs(native_profit), "f"),
            "account_currency": account_currency,
            "account_denomination": (
                "standard-cent" if account_currency == "USC"
                else "unsupported-cent" if account_currency.endswith("C")
                else "currency-native"
            ),
            "calculation_method": "mt5.order_calc_profit",
            "mode": "read-only",
            "order_submission_enabled": False,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }


def optional_number(source: Any, field: str) -> float | None:
    """Return finite broker metadata as a JSON number; missing/invalid stays null."""
    value = getattr(source, field, None)
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) else None


def optional_decimal_string(source: Any, field: str) -> str | None:
    """Preserve broker numeric precision as a decimal string for risk consumers."""
    value = getattr(source, field, None)
    if value is None:
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return format(result, "f") if result.is_finite() else None


def symbol_spec(item: Any) -> dict[str, Any]:
    """Expose read-only MT5 contract, tick, currency and volume constraints."""
    spec = {
        "name": str(getattr(item, "name", "")),
        "description": str(getattr(item, "description", "")),
        "visible": bool(getattr(item, "visible", False)),
        "digits": int(getattr(item, "digits", 0)),
        "base_currency": str(getattr(item, "currency_base", "") or ""),
        "profit_currency": str(getattr(item, "currency_profit", "") or ""),
        "margin_currency": str(getattr(item, "currency_margin", "") or ""),
        "trade_calc_mode": getattr(item, "trade_calc_mode", None),
        "contract_size": optional_number(item, "trade_contract_size"),
        "contract_size_decimal": optional_decimal_string(item, "trade_contract_size"),
        "point": optional_number(item, "point"),
        "point_decimal": optional_decimal_string(item, "point"),
        "tick_size": optional_number(item, "trade_tick_size"),
        "tick_size_decimal": optional_decimal_string(item, "trade_tick_size"),
        "tick_value": optional_number(item, "trade_tick_value"),
        "tick_value_decimal": optional_decimal_string(item, "trade_tick_value"),
        "tick_value_profit": optional_number(item, "trade_tick_value_profit"),
        "tick_value_profit_decimal": optional_decimal_string(item, "trade_tick_value_profit"),
        "tick_value_loss": optional_number(item, "trade_tick_value_loss"),
        "tick_value_loss_decimal": optional_decimal_string(item, "trade_tick_value_loss"),
        "volume_min": optional_number(item, "volume_min"),
        "volume_min_decimal": optional_decimal_string(item, "volume_min"),
        "volume_max": optional_number(item, "volume_max"),
        "volume_max_decimal": optional_decimal_string(item, "volume_max"),
        "volume_step": optional_number(item, "volume_step"),
        "volume_step_decimal": optional_decimal_string(item, "volume_step"),
        "stops_level_points": getattr(item, "trade_stops_level", None),
        "freeze_level_points": getattr(item, "trade_freeze_level", None),
        "trade_mode": getattr(item, "trade_mode", None),
    }
    required = (
        "contract_size", "tick_size", "tick_value_profit", "tick_value_loss",
        "volume_min", "volume_max", "volume_step",
    )
    spec["risk_metadata_complete"] = all(
        spec[field] is not None and spec[field] > 0 for field in required
    ) and bool(spec["profit_currency"]) and bool(spec["margin_currency"])
    return spec


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
            "symbols": [symbol_spec(item) for item in found[:limit]],
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
