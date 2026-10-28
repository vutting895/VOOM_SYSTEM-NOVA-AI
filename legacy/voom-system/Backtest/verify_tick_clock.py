# Read-only clock/tick verification. No orders, no account/position reads.
import json, time
from datetime import datetime, timezone
import MetaTrader5 as mt5
TERMINAL = r"C:\\Program Files\\HFM Metatrader 5\\terminal64.exe"
SYMBOL = "XAUUSDc"
if not mt5.initialize(path=TERMINAL):
    raise SystemExit(json.dumps({"connected":False,"error":str(mt5.last_error())}))
try:
    info = mt5.symbol_info(SYMBOL)
    if info is None or not mt5.symbol_select(SYMBOL, True):
        raise SystemExit(json.dumps({"connected":True,"symbol_available":False,"error":str(mt5.last_error())}))
    results=[]
    for i in range(3):
        now=datetime.now(timezone.utc)
        tick=mt5.symbol_info_tick(SYMBOL)
        if tick is None:
            results.append({"host_utc":now.isoformat(),"tick":None,"error":str(mt5.last_error())})
        else:
            tt=datetime.fromtimestamp(tick.time, timezone.utc)
            age=(now-tt).total_seconds()
            results.append({"host_utc":now.isoformat(),"tick_utc":tt.isoformat(),"age_seconds":round(age,2),"bid":float(tick.bid),"ask":float(tick.ask),"freshness":"FRESH" if abs(age)<=120 else ("FUTURE_TIMESTAMP_CLOCK_SKEW" if age < -120 else "STALE_OR_MARKET_CLOSED")})
        if i<2: time.sleep(10)
    print(json.dumps({"connected":True,"symbol":SYMBOL,"digits":int(info.digits),"point":float(info.point),"trade_mode":int(info.trade_mode),"orders_sent":False,"samples":results},indent=2))
finally:
    mt5.shutdown()
