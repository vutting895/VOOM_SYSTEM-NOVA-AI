# -*- coding: utf-8 -*-
"""Offline EMA12/26 + RSI14 strategy test. No MT5 connection or order APIs."""
from pathlib import Path
import argparse, hashlib, json
import numpy as np
import pandas as pd

def rsi(close, n=14):
    d = close.diff()
    gain = d.clip(lower=0).ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    rs = gain / loss.replace(0, np.nan)
    out = 100 - 100/(1+rs)
    out = out.where(loss.ne(0), 100.0)
    return out.fillna(50.0)

def run_segment(df, start, end, initial_cash, risk_fraction, sl_atr, target_r, max_loss_fraction, slippage_points, point):
    x = df.iloc[start:end].copy()
    equity = float(initial_cash)
    peak = equity
    max_dd = 0.0
    pos = None
    trades = []
    pending = None
    curve = []
    for j in range(len(x)):
        row = x.iloc[j]
        ts = x.index[j]
        # Fill prior confirmed signal at this bar's open
        if pending is not None and pos is None:
            side = pending["side"]
            entry = float(row.open) + (1 if side == 1 else -1) * (float(row.spread)*point/2 + slippage_points*point)
            atrv = float(row.atr)
            if np.isfinite(atrv) and atrv > 0:
                stop_dist = max(atrv*sl_atr, entry*0.0001)
                risk_cash = max(0.0, equity*risk_fraction)
                units = risk_cash/stop_dist
                if units > 0:
                    pos = {"side":side,"entry":entry,"entry_time":ts,"units":units,
                           "stop":entry-side*stop_dist,"target":entry+side*stop_dist*target_r,
                           "risk":stop_dist*units,"entry_signal_time":pending["signal_time"]}
            pending = None
        # Exit checks use current bar OHLC; if both stop and target touched, assume stop first
        if pos is not None:
            side = pos["side"]
            hi, lo, close = float(row.high), float(row.low), float(row.close)
            exit_price = None; reason = None
            if side == 1:
                if lo <= pos["stop"]:
                    exit_price, reason = pos["stop"], "stop_loss_atr_or_max_loss"
                elif hi >= pos["target"]:
                    exit_price, reason = pos["target"], "take_profit_target"
                elif bool(row.cross_down):
                    exit_price, reason = close, "opposite_ema_cross"
                elif float(row.rsi) >= 70 and float(row.rsi) < float(row.rsi_prev):
                    exit_price, reason = close, "rsi_overbought_turn_down"
                elif close < float(row.ema26):
                    exit_price, reason = close, "close_below_ema26"
                elif (pos["entry"]-close)*pos["units"] >= initial_cash*max_loss_fraction:
                    exit_price, reason = close, "max_loss_limit"
            else:
                if hi >= pos["stop"]:
                    exit_price, reason = pos["stop"], "stop_loss_atr_or_max_loss"
                elif lo <= pos["target"]:
                    exit_price, reason = pos["target"], "take_profit_target"
                elif bool(row.cross_up):
                    exit_price, reason = close, "opposite_ema_cross"
                elif float(row.rsi) <= 30 and float(row.rsi) > float(row.rsi_prev):
                    exit_price, reason = close, "rsi_oversold_turn_up"
                elif close > float(row.ema26):
                    exit_price, reason = close, "close_above_ema26"
                elif (close-pos["entry"])*pos["units"] >= initial_cash*max_loss_fraction:
                    exit_price, reason = close, "max_loss_limit"
            if exit_price is not None:
                exit_price += (-side) * (float(row.spread)*point/2 + slippage_points*point)
                pnl = (exit_price-pos["entry"])*side*pos["units"]
                equity += pnl
                trades.append({"entry_time":str(pos["entry_time"]),"exit_time":str(ts),"side":"LONG" if side==1 else "SHORT",
                    "entry_price":pos["entry"],"exit_price":exit_price,"units_proxy":pos["units"],
                    "pnl_proxy":pnl,"r_multiple_proxy":pnl/pos["risk"] if pos["risk"] else None,"exit_reason":reason})
                pos = None
        # Build signal from fully closed bar; execute no earlier than next bar
        if pos is None and pending is None and j < len(x)-1:
            if bool(row.cross_up) and float(row.close) > float(row.cross_level) and 50 < float(row.rsi) < 70 and float(row.rsi) > float(row.rsi_prev):
                pending={"side":1,"signal_time":ts}
            elif bool(row.cross_down) and float(row.close) < float(row.cross_level) and 30 < float(row.rsi) < 50 and float(row.rsi) < float(row.rsi_prev):
                pending={"side":-1,"signal_time":ts}
        peak = max(peak,equity)
        max_dd = min(max_dd,(equity/peak-1)*100 if peak else 0)
        curve.append({"time":str(ts),"equity_proxy":equity,"drawdown_pct":(equity/peak-1)*100 if peak else 0})
    # Force-close any remaining position at segment's last close
    if pos is not None and len(x):
        row=x.iloc[-1]; ts=x.index[-1]; side=pos["side"]
        px=float(row.close)+(-side)*(float(row.spread)*point/2+slippage_points*point)
        pnl=(px-pos["entry"])*side*pos["units"]; equity+=pnl
        trades.append({"entry_time":str(pos["entry_time"]),"exit_time":str(ts),"side":"LONG" if side==1 else "SHORT",
            "entry_price":pos["entry"],"exit_price":px,"units_proxy":pos["units"],"pnl_proxy":pnl,
            "r_multiple_proxy":pnl/pos["risk"] if pos["risk"] else None,"exit_reason":"segment_end"})
    t=pd.DataFrame(trades)
    wins=t[t.pnl_proxy>0] if len(t) else pd.DataFrame()
    losses=t[t.pnl_proxy<0] if len(t) else pd.DataFrame()
    gp=float(wins.pnl_proxy.sum()) if len(wins) else 0.0
    gl=float(-losses.pnl_proxy.sum()) if len(losses) else 0.0
    metrics={"bars":len(x),"trades":len(t),"initial_equity_proxy":initial_cash,"final_equity_proxy":equity,
        "net_pnl_proxy":equity-initial_cash,"return_pct_proxy":(equity/initial_cash-1)*100 if initial_cash else None,
        "max_drawdown_pct_proxy":max_dd,"win_rate_pct":(len(wins)/len(t)*100 if len(t) else 0),
        "profit_factor":gp/gl if gl else (None if gp==0 else "infinite"),
        "avg_trade_pnl_proxy":float(t.pnl_proxy.mean()) if len(t) else 0,
        "avg_r_multiple_proxy":float(t.r_multiple_proxy.mean()) if len(t) else 0,
        "exit_reasons":t.exit_reason.value_counts().to_dict() if len(t) else {}}
    return metrics,t,pd.DataFrame(curve)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--csv",required=True); p.add_argument("--meta",required=True); p.add_argument("--out",required=True)
    p.add_argument("--cash",type=float,default=10000); p.add_argument("--risk",type=float,default=.0025)
    p.add_argument("--sl-atr",type=float,default=2.0); p.add_argument("--target-r",type=float,default=2.0)
    p.add_argument("--max-loss-fraction",type=float,default=.02); p.add_argument("--slippage-points",type=float,default=2.0)
    args=p.parse_args()
    path=Path(args.csv); out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    raw=pd.read_csv(path)
    req={"time","open","high","low","close","spread"}
    if not req.issubset(raw.columns): raise ValueError("Missing required OHLC/spread columns")
    raw["time"]=pd.to_datetime(raw.time,utc=True)
    raw=raw.sort_values("time").drop_duplicates("time").set_index("time")
    for c in ["open","high","low","close","spread"]: raw[c]=pd.to_numeric(raw[c],errors="coerce")
    raw=raw.dropna(subset=["open","high","low","close","spread"])
    raw["ema12"]=raw.close.ewm(span=12,adjust=False).mean()
    raw["ema26"]=raw.close.ewm(span=26,adjust=False).mean()
    raw["rsi"]=rsi(raw.close,14)
    pc=raw.close.shift()
    tr=pd.concat([(raw.high-raw.low),(raw.high-pc).abs(),(raw.low-pc).abs()],axis=1).max(axis=1)
    raw["atr"]=tr.ewm(alpha=1/14,adjust=False,min_periods=14).mean()
    diff=raw.ema12-raw.ema26
    raw["cross_up"]=(diff.shift(1)<=0)&(diff>0)
    raw["cross_down"]=(diff.shift(1)>=0)&(diff<0)
    prevdiff=diff.shift(1); curdiff=diff
    frac=(-prevdiff/(curdiff-prevdiff)).clip(0,1)
    raw["cross_level"]=raw.ema12.shift(1)+(raw.ema12-raw.ema12.shift(1))*frac
    raw["rsi_prev"]=raw.rsi.shift(1)
    raw=raw.dropna(subset=["atr","cross_level","rsi_prev"])
    n=len(raw)
    if n<5000: raise ValueError(f"Insufficient usable bars: {n}")
    i1=int(n*.6); i2=int(n*.8)
    meta=json.loads(Path(args.meta).read_text(encoding="utf-8"))
    try: point=float(meta.get("broker_spec",{}).get("point",.01))
    except Exception: point=.01
    segments=[("development",0,i1),("validation",i1,i2),("out_of_sample",i2,n)]
    reports={}; alltr=[]
    for name,a,b in segments:
        metrics,trades,curve=run_segment(raw,a,b,args.cash,args.risk,args.sl_atr,args.target_r,args.max_loss_fraction,args.slippage_points,point)
        reports[name]=metrics
        if len(trades):
            trades.insert(0,"segment",name); alltr.append(trades)
        curve.to_csv(out/f"equity_{name}.csv",index=False)
    trades=pd.concat(alltr,ignore_index=True) if alltr else pd.DataFrame()
    trades.to_csv(out/"trades.csv",index=False)
    data_hash=hashlib.sha256(path.read_bytes()).hexdigest()
    report={"status":"RESEARCH_ONLY_NO_MT5_CONNECTION_NO_ORDERS_SENT","strategy":"EMA12/EMA26 crossover + RSI14 strict band/slope; completed-bar signals; next-bar-open fills",
      "data_file":str(path),"data_sha256":data_hash,"data_start_utc":str(raw.index.min()),"data_end_utc":str(raw.index.max()),
      "bars_used":n,"segments":{"development_bars":i1,"validation_bars":i2-i1,"out_of_sample_bars":n-i2},
      "data_source_note":meta.get("notes",[]),"data_sources":meta.get("sources",{}),
      "parameters":{"ema_fast":12,"ema_slow":26,"rsi_period":14,"long_rsi":"50 < RSI < 70 and RSI rising vs prior bar",
        "short_rsi":"30 < RSI < 50 and RSI falling vs prior bar","stop_atr_multiple":args.sl_atr,
        "take_profit_R":args.target_r,"risk_fraction_proxy":args.risk,"max_loss_fraction_of_segment_initial_equity":args.max_loss_fraction,
        "slippage_points_per_fill":args.slippage_points,"point_size_used":point},
      "results":reports,"trade_rows":len(trades),
      "caveats":["Mixed-source history includes external XAUUSD candles, not broker-native XAUUSDc for the entire span.",
        "P&L, units and equity are proxies, not verified USC account P&L or broker lot sizing.",
        "Historical spread is a per-bar proxy; commissions, swaps, exact bid/ask path and tick replay are omitted.",
        "If both SL and TP touch in one bar, stop is assumed first; bar-level data cannot determine intrabar sequence.",
        "Because no target/stop amount was specified by the user, test uses 2R take-profit, 2x ATR stop, 2% segment-initial-equity max-loss exit as explicit research defaults.",
        "Indicators use only current/past bars; each segment is reset to flat and initial normalized equity.",
        "This report is not evidence of future profitability and must not be used to enable live trading."]}
    (out/"report.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(report,indent=2,ensure_ascii=False))
    print("REPORT="+str(out/"report.json")); print("TRADES="+str(out/"trades.csv"))
if __name__=="__main__": main()
