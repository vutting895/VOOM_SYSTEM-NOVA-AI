"""
NOVA MT5 Bridge — Exness Demo read-only adapter.

Safety contract:
- Disabled by default; requires MT5_BRIDGE_ENABLED=true and an out-of-band token.
- Uses the already-authenticated local MT5 terminal session; no login/password defaults.
- Refuses non-Demo accounts and non-Exness terminals.
- Exposes read-only account/quote endpoints only. No order, modify, cancel, or close routes.
- Binds to localhost by default. Never expose this process directly to the public internet.
"""

from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import FastAPI, Header, HTTPException
import uvicorn

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False


BRIDGE_ENABLED = os.getenv("MT5_BRIDGE_ENABLED", "false").strip().lower() == "true"
BRIDGE_TOKEN = os.getenv("MT5_BRIDGE_TOKEN", "")
BRIDGE_HOST = os.getenv("MT5_BRIDGE_HOST", "127.0.0.1")
BRIDGE_PORT = int(os.getenv("MT5_BRIDGE_PORT", "8005"))

app = FastAPI(title="NOVA Exness Demo Read-only Bridge", version="1.0.0")


def require_bridge_token(x_bridge_token: str | None) -> None:
    if not BRIDGE_TOKEN:
        raise HTTPException(status_code=503, detail="Bridge token is not configured")
    if not x_bridge_token or not secrets.compare_digest(x_bridge_token, BRIDGE_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


def connect_demo_terminal() -> Any:
    if not BRIDGE_ENABLED:
        raise HTTPException(status_code=503, detail="MT5 Demo read-only bridge is disabled")
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MetaTrader5 package is unavailable")
    if not mt5.initialize():
        raise HTTPException(status_code=503, detail="MT5 terminal is not initialized")

    account = mt5.account_info()
    if account is None:
        mt5.shutdown()
        raise HTTPException(status_code=503, detail="MT5 account session is unavailable")

    trade_mode = getattr(account, "trade_mode", None)
    demo_mode = getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", None)
    server = str(getattr(account, "server", "") or "")
    company = str(getattr(account, "company", "") or "")
    exness_terminal = "exness" in f"{server} {company}".lower()

    if trade_mode != demo_mode or not exness_terminal:
        mt5.shutdown()
        raise HTTPException(
            status_code=403,
            detail="Only an Exness Demo terminal is permitted; account access was refused.",
        )
    return account


def account_snapshot(account: Any) -> dict[str, Any]:
    positions = mt5.positions_get() or []
    return {
        "connected": True,
        "mode": "demo-read-only",
        "environment": "demo",
        "currency": str(getattr(account, "currency", "") or ""),
        "balance": float(getattr(account, "balance", 0.0)),
        "equity": float(getattr(account, "equity", 0.0)),
        "margin": float(getattr(account, "margin", 0.0)),
        "freeMargin": float(getattr(account, "margin_free", 0.0)),
        "floatingPnl": float(getattr(account, "profit", 0.0)),
        "openPositionsCount": len(positions),
        "openPositions": [
            {
                "ticket": str(position.ticket),
                "symbol": str(position.symbol),
                "side": "BUY" if position.type == mt5.POSITION_TYPE_BUY else "SELL",
                "lots": float(position.volume),
                "openPrice": float(position.price_open),
                "currentPrice": float(position.price_current),
                "profit": float(position.profit),
            }
            for position in positions
        ],
        "ordersEnabled": False,
        "executionEnabled": False,
        "liveTradingEnabled": False,
    }


@app.get("/health")
def health_check() -> dict[str, Any]:
    # Deliberately does not reveal account state or secrets.
    return {
        "service": "nova-mt5-bridge",
        "enabled": BRIDGE_ENABLED,
        "mode": "demo-read-only",
        "ordersEnabled": False,
        "executionEnabled": False,
        "liveTradingEnabled": False,
    }


@app.get("/account")
def read_account(x_bridge_token: str | None = Header(default=None, alias="X-Bridge-Token")) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    account = connect_demo_terminal()
    return account_snapshot(account)


@app.get("/quotes/{symbol}")
def read_quote(
    symbol: str,
    x_bridge_token: str | None = Header(default=None, alias="X-Bridge-Token"),
) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    connect_demo_terminal()
    if not mt5.symbol_select(symbol, True):
        raise HTTPException(status_code=404, detail="Symbol is not available in the Demo terminal")
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise HTTPException(status_code=503, detail="Quote is unavailable")
    return {
        "symbol": symbol,
        "bid": float(tick.bid),
        "ask": float(tick.ask),
        "time": int(tick.time),
        "mode": "demo-read-only",
        "ordersEnabled": False,
        "executionEnabled": False,
        "liveTradingEnabled": False,
    }


if __name__ == "__main__":
    uvicorn.run(app, host=BRIDGE_HOST, port=BRIDGE_PORT)
