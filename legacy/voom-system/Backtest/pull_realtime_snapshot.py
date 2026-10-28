# -*- coding: utf-8 -*-
"""Read-only MT5 live snapshot for VOOM research. Never submits orders."""
import argparse, json, hashlib
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import MetaTrader5 as mt5

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--symbol",default="XAUUSDc")
    p.add_argument("--timeframe",default="M15")
    p.add_argument("--bars",type=int,default=2000)
    p.add_argument("--terminal",default=r"C:\Program Files\HFM Metatrader 5\terminal64.exe")
    p.add_argument("--out",default=str(Path(__file__).resolve().parent/"data"/"realtime"))
    a=p.parse_args()
    tfmap={"M1":mt5.TIMEFRAME_M1,"M5":mt5.TIMEFRAME_M5,"M15":mt5.TIMEFRAME_M15,"M30":mt5.TIMEFRAME_M30,"H1":mt5.TIMEFRAME_H1,"H4":mt5.TIMEFRAME_H4}
    if a.timeframe not in tfmap: raise ValueError("Unsupported timeframe")
    out=Path(a.out).resolve(); out.mkdir(parents=True,exist_ok=True)
    if not mt5.initialize(path=a.terminal):
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
    try:
        if not mt5.symbol_select(a.symbol,True): raise RuntimeError(f"symbol_select failed: {mt5.last_error()}")
        info=mt5.symbol_info(a.symbol); tick=mt5.symbol_info_tick(a.symbol)
        rates=mt5.copy_rates_from_pos(a.symbol,tfmap[a.timeframe],0,a.bars)
        if info is None or tick is None or rates is None or len(rates)==0:
            raise RuntimeError(f"Missing symbol/tick/rates: {mt5.last_error()}")
        now=datetime.now(timezone.utc)
        tick_time=datetime.fromtimestamp(tick.time,timezone.utc)
        age=(now-tick_time).total_seconds()
        df=pd.DataFrame(rates)
        df["time"]=pd.to_datetime(df["time"],unit="s",utc=True)
        df=df.sort_values("time").drop_duplicates("time")
        stamp=now.strftime("%Y%m%dT%H%M%SZ")
        csv=out/f"{a.symbol}_{a.timeframe}_latest_{stamp}.csv"
        df.to_csv(csv,index=False)
        snapshot={
          "captured_at_utc":now.isoformat(),"symbol":a.symbol,"timeframe":a.timeframe,
          "source":"MetaTrader5 read-only terminal snapshot","connected":True,"orders_sent":False,
          "live_tick_timestamp_utc":tick_time.isoformat(),"tick_age_seconds":round(age,2),
          "tick_freshness":"FRESH" if abs(age)<=120 else ("FUTURE_TIMESTAMP_CLOCK_SKEW" if age < -120 else "STALE_OR_MARKET_CLOSED"),
          "bid":float(tick.bid),"ask":float(tick.ask),"last":float(tick.last),
          "spread_price":round(float(tick.ask)-float(tick.bid),info.digits),
          "digits":int(info.digits),"point":float(info.point),"trade_mode":int(info.trade_mode),
          "bars_saved":int(len(df)),"bar_start_utc":df["time"].min().isoformat(),
          "bar_end_utc":df["time"].max().isoformat(),"latest_bar_is_potentially_open":True,
          "bars_csv":str(csv),"bars_sha256":hashlib.sha256(csv.read_bytes()).hexdigest(),
          "caveats":["No orders were sent; account balance and positions were not read.",
            "A stale tick is not real-time even if the terminal connection succeeds.",
            "The latest M15 bar may still be forming and must not be used as a confirmed close.",
            "This snapshot is research data only; it is not automatically added to the strategy's historical dataset."]
        }
        jp=out/f"snapshot_{a.symbol}_{stamp}.json"
        jp.write_text(json.dumps(snapshot,indent=2,ensure_ascii=False),encoding="utf-8")
        print(json.dumps(snapshot,indent=2,ensure_ascii=False))
        print("SNAPSHOT_JSON="+str(jp))
    finally:
        mt5.shutdown()
if __name__=="__main__": main()
