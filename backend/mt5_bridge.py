"""
=========================================================================================
NOVA OS v2.5 — Real Exness MT5 Bridge (backend/mt5_bridge.py)
=========================================================================================
สคริปต์สะพานเชื่อมบัญชี Exness จริง (MetaTrader 5) เข้ากับเว็บ NOVA AI Trading Platform
หน้าที่:
  1. เชื่อมต่อกับโปรแกรม MetaTrader 5 ที่ล็อกอินบัญชี Exness จริง (เช่น Exness-MT5Real)
  2. ซิงค์ยอดเงินจริง (Balance, Equity, Free Margin, Floating P/L) และออเดอร์ที่เปิดอยู่ขึ้นหน้าเว็บ
  3. รับคำสั่งจากสมองกล Quantum VQC / Dynamic Grid / หน้าแชท NOVA AI เพื่อยิงออเดอร์จริง (order_send)
  4. รองรับคำสั่งปิดรวบกำไรทั้งหมด (Close All Positions) ในพอร์ต Exness จริง

วิธีใช้งานบนเครื่องคอมพิวเตอร์ หรือ Windows VPS:
  1. ติดตั้งไลบรารี: pip install MetaTrader5 requests fastapi uvicorn
  2. เปิดโปรแกรม MetaTrader 5 ของ Exness และเปิดใช้งาน "Allow Algo Trading"
  3. ตั้งค่าตัวแปร EXNESS_LOGIN, EXNESS_PASSWORD, EXNESS_SERVER ด้านล่าง แล้วรัน:
     python mt5_bridge.py
=========================================================================================
"""

import os
import time
import threading
from typing import Optional, List, Dict, Any
import requests

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# ==============================================================================
# 1. ตั้งค่าบัญชี Exness จริงของคุณ (หรือกำหนดผ่าน Environment Variables)
# ==============================================================================
EXNESS_LOGIN = int(os.getenv("EXNESS_LOGIN", "23908764"))
EXNESS_PASSWORD = os.getenv("EXNESS_PASSWORD", "YOUR_EXNESS_MT5_PASSWORD")
EXNESS_SERVER = os.getenv("EXNESS_SERVER", "Exness-MT5Real15")  # เช่น Exness-MT5Real, Exness-MT5Trial
NOVA_WEB_URL = os.getenv("NOVA_WEB_URL", "http://localhost:3000")
BRIDGE_SECRET_KEY = os.getenv("BRIDGE_SECRET_KEY", "nova-exness-bridge-key")
DEFAULT_SYMBOL = os.getenv("EXNESS_SYMBOL", "XAUUSDm")
MAGIC_NUMBER = 20261103

app = FastAPI(title="NOVA Exness Real MT5 Bridge", version="2.5.0")


class OrderRequest(BaseModel):
    symbol: str = DEFAULT_SYMBOL
    side: str  # "BUY" or "SELL"
    lots: float = 0.01
    sl: Optional[float] = None
    tp: Optional[float] = None
    comment: str = "NOVA_QUANTUM_AUTO"


def init_exness_mt5() -> bool:
    """เชื่อมต่อเข้ากับเทอร์มินัล MetaTrader 5 ของ Exness จริง"""
    if not MT5_AVAILABLE:
        print("[MT5 Bridge] ไม่พบไลบรารี MetaTrader5 (กรุณารัน pip install MetaTrader5 บน Windows)")
        return False

    if not mt5.initialize(login=EXNESS_LOGIN, password=EXNESS_PASSWORD, server=EXNESS_SERVER):
        print(f"[MT5 Bridge] เชื่อมต่อ Exness MT5 ล้มเหลว: {mt5.last_error()}")
        return False

    account_info = mt5.account_info()
    if account_info is None:
        print("[MT5 Bridge] ไม่สามารถดึงข้อมูลบัญชี Exness ได้")
        return False

    print(
        f"[MT5 Bridge] ✅ เชื่อมต่อบัญชี Exness จริงสำเร็จ! "
        f"Login: #{account_info.login} | Server: {account_info.server} | "
        f"Balance: ${account_info.balance:.2f} | Equity: ${account_info.equity:.2f}"
    )
    return True


def get_live_account_snapshot() -> Dict[str, Any]:
    """ดึงสถานะพอร์ตจริงและรายการออเดอร์ที่เปิดอยู่จาก Exness MT5"""
    if not MT5_AVAILABLE or not mt5.initialize():
        raise RuntimeError("MT5 Terminal ยังไม่ได้เชื่อมต่อ")

    acc = mt5.account_info()
    positions = mt5.positions_get() or []

    open_orders: List[Dict[str, Any]] = []
    for pos in positions:
        open_orders.append(
            {
                "ticket": str(pos.ticket),
                "symbol": pos.symbol,
                "side": "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
                "lots": float(pos.volume),
                "openPrice": float(pos.price_open),
                "currentPrice": float(pos.price_current),
                "profitUsd": float(pos.profit),
                "sl": float(pos.sl),
                "tp": float(pos.tp),
            }
        )

    return {
        "connected": True,
        "mode": "LIVE_EXNESS_MT5",
        "login": acc.login,
        "server": acc.server,
        "currency": acc.currency,
        "balance": float(acc.balance),
        "equity": float(acc.equity),
        "margin": float(acc.margin),
        "freeMargin": float(acc.margin_free),
        "floatingPnl": float(acc.profit),
        "openPositionsCount": len(open_orders),
        "openPositions": open_orders,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@app.get("/health")
def health_check():
    """ตรวจสอบสถานะการเชื่อมต่อพอร์ต Exness จริง"""
    try:
        return get_live_account_snapshot()
    except Exception as exc:
        return {"connected": False, "error": str(exc)}


@app.post("/order")
def execute_real_order(req: OrderRequest):
    """ยิงคำสั่งซื้อขายจริง (BUY / SELL) เข้าพอร์ต Exness MT5"""
    if not MT5_AVAILABLE or not mt5.initialize():
        raise HTTPException(status_code=503, detail="Exness MT5 Terminal not initialized")

    symbol_info = mt5.symbol_info(req.symbol)
    if symbol_info is None:
        raise HTTPException(status_code=404, detail=f"ไม่พบสัญลักษณ์ {req.symbol} ใน Exness")

    if not symbol_info.visible:
        mt5.symbol_select(req.symbol, True)

    tick = mt5.symbol_info_tick(req.symbol)
    order_type = mt5.ORDER_TYPE_BUY if req.side.upper() == "BUY" else mt5.ORDER_TYPE_SELL
    price = tick.ask if order_type == mt5.ORDER_TYPE_BUY else tick.bid

    mt5_request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": req.symbol,
        "volume": float(req.lots),
        "type": order_type,
        "price": price,
        "sl": float(req.sl) if req.sl else 0.0,
        "tp": float(req.tp) if req.tp else 0.0,
        "deviation": 20,
        "magic": MAGIC_NUMBER,
        "comment": req.comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(mt5_request)
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        raise HTTPException(
            status_code=400,
            detail=f"Exness order_send failed (retcode={result.retcode}): {result.comment}",
        )

    return {
        "ok": True,
        "ticket": str(result.order),
        "symbol": req.symbol,
        "side": req.side.upper(),
        "lots": req.lots,
        "executedPrice": float(result.price),
        "comment": req.comment,
    }


@app.post("/close-all")
def close_all_positions(symbol: Optional[str] = None):
    """ปิดรวบกำไร/ปิดออเดอร์ทั้งหมดในพอร์ต Exness จริงทันที"""
    if not MT5_AVAILABLE or not mt5.initialize():
        raise HTTPException(status_code=503, detail="Exness MT5 Terminal not initialized")

    positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
    if not positions:
        return {"ok": True, "closedCount": 0}

    closed_count = 0
    for pos in positions:
        tick = mt5.symbol_info_tick(pos.symbol)
        close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask

        close_req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": float(pos.volume),
            "type": close_type,
            "position": pos.ticket,
            "price": price,
            "deviation": 20,
            "magic": MAGIC_NUMBER,
            "comment": "NOVA_CLOSE_ALL",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        res = mt5.order_send(close_req)
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            closed_count += 1

    return {"ok": True, "closedCount": closed_count}


def background_telemetry_sync():
    """ส่งข้อมูลพอร์ต Exness จริงขึ้นไปอัปเดตบนหน้าเว็บ NOVA OS ทุกๆ 2 วินาที"""
    while True:
        try:
            if MT5_AVAILABLE:
                snapshot = get_live_account_snapshot()
                requests.post(
                    f"{NOVA_WEB_URL}/api/exness/bridge-sync",
                    json=snapshot,
                    headers={"x-bridge-key": BRIDGE_SECRET_KEY},
                    timeout=3,
                )
        except Exception:
            pass
        time.sleep(2.0)


if __name__ == "__main__":
    init_exness_mt5()
    sync_thread = threading.Thread(target=background_telemetry_sync, daemon=True)
    sync_thread.start()
    uvicorn.run(app, host="0.0.0.0", port=8005)
