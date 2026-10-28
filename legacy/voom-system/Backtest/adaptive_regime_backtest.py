# -*- coding: utf-8 -*-
"""VOOM Adaptive Regime v0.1 multi-timeframe research backtester.
Offline only: no MT5 APIs, no order execution, no customer promotion.
"""
import argparse, json, hashlib
from pathlib import Path
import numpy as np
import pandas as pd

def ema(s, n):
    return s.ewm(span=n, adjust=False).mean()

def rsi(s, n=14):
    delta=s.diff()
    gain=delta.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    loss=(-delta.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs=gain/loss.replace(0,np.nan)
    return (100-100/(1+rs)).fillna(50)

def atr(df,n=14):
    prev=df.close.shift()
    tr=pd.concat([df.high-df.low,(df.high-prev).abs(),(df.low-prev).abs()],axis=1).max(axis=1)
    return tr.ewm(alpha=1/n,adjust=False).mean()

def pivot_confirm_flags(series,left=3,right=3,kind="low"):
    a=series.to_numpy(float); flags=np.zeros(len(a),dtype=bool)
    for i in range(left,len(a)-right):
        w=a[i-left:i+right+1]
        if kind=="low" and a[i]==np.min(w) and np.sum(w==a[i])==1: flags[i+right]=True
        if kind=="high" and a[i]==np.max(w) and np.sum(w==a[i])==1: flags[i+right]=True
    return flags

def divergences(df,left=3,right=3,max_gap=60):
    lo=pivot_confirm_flags(df.low,left,right,"low"); hi=pivot_confirm_flags(df.high,left,right,"high")
    bull=np.zeros(len(df),bool); bear=np.zeros(len(df),bool); lows=[]; highs=[]
    for i in range(len(df)):
        if lo[i]:
            j=i-right; lows=[k for k in lows if i-k<=max_gap+right]; lows.append(j)
            if len(lows)>=2:
                a,b=lows[-2:]
                if df.low.iloc[b]<df.low.iloc[a] and df.rsi.iloc[b]>df.rsi.iloc[a]: bull[i]=True
        if hi[i]:
            j=i-right; highs=[k for k in highs if i-k<=max_gap+right]; highs.append(j)
            if len(highs)>=2:
                a,b=highs[-2:]
                if df.high.iloc[b]>df.high.iloc[a] and df.rsi.iloc[b]<df.rsi.iloc[a]: bear[i]=True
    return bull,bear,lo,hi

def prepare(path, divergence_recency=8):
    raw=pd.read_csv(path,encoding="utf-8-sig")
    need={"time","open","high","low","close","spread"}
    if not need.issubset(raw.columns): raise ValueError("CSV missing columns: "+str(sorted(need-set(raw.columns))))
    raw["time"]=pd.to_datetime(raw.time,utc=True,errors="raise")
    for c in ["open","high","low","close","spread"]: raw[c]=pd.to_numeric(raw[c],errors="coerce")
    raw=raw.dropna(subset=["time","open","high","low","close","spread"]).sort_values("time").drop_duplicates("time").reset_index(drop=True)
    if len(raw)<10000: raise ValueError("Insufficient valid bars")
    if (raw[["open","high","low","close"]]<=0).any().any(): raise ValueError("Nonpositive OHLC")
    if ((raw.high < raw[["open","close","low"]].max(axis=1)) | (raw.low > raw[["open","close","high"]].min(axis=1))).any(): raise ValueError("Invalid OHLC")
    raw["ema20"]=ema(raw.close,20); raw["ema50"]=ema(raw.close,50)
    raw["rsi"]=rsi(raw.close,14); raw["atr"]=atr(raw,14)
    raw["cross_up"]=(raw.ema20>raw.ema50)&(raw.ema20.shift()<=raw.ema50.shift())
    raw["cross_down"]=(raw.ema20<raw.ema50)&(raw.ema20.shift()>=raw.ema50.shift())
    raw["bull_div"],raw["bear_div"],raw["pivot_low_conf"],raw["pivot_high_conf"]=divergences(raw)
    # Store the actual swing price on the later confirmation bar (3-bar right confirmation).
    raw["confirmed_pivot_low_price"]=raw.low.shift(3).where(raw.pivot_low_conf)
    raw["confirmed_pivot_high_price"]=raw.high.shift(3).where(raw.pivot_high_conf)
    # A divergence may be confirmed within the prior 8 M15 bars before the EMA trigger.
    raw["bull_div_recent"]=raw.bull_div.rolling(divergence_recency,min_periods=1).max().astype(bool)
    raw["bear_div_recent"]=raw.bear_div.rolling(divergence_recency,min_periods=1).max().astype(bool)
    # Resample timestamps label the candle CLOSE. Merge backward means only already-closed higher TF bars are visible.
    idx=raw.set_index("time")
    frames={}
    for tf in ["1h","4h"]:
        x=idx[["open","high","low","close"]].resample(tf,label="right",closed="right").agg(
            {"open":"first","high":"max","low":"min","close":"last"}).dropna().reset_index()
        x["ema200"]=ema(x.close,200)
        x["ema200_slope"]=x.ema200-x.ema200.shift(3)
        if tf=="1h":
            x["piv_hi"]=pivot_confirm_flags(x.high,3,3,"high")
            x["piv_lo"]=pivot_confirm_flags(x.low,3,3,"low")
            last_hi=None; last_lo=None; prev_hi=None; prev_lo=None
            hh=[]; ll=[]
            for i,row in x.iterrows():
                # Pivot is three H1 bars before its confirmation bar.
                if row.piv_hi and i >= 3:
                    prev_hi,last_hi=last_hi,float(x.high.iloc[i-3])
                if row.piv_lo and i >= 3:
                    prev_lo,last_lo=last_lo,float(x.low.iloc[i-3])
                # both latest confirmed swings must progress in same direction
                hh.append(last_hi is not None and prev_hi is not None and last_hi>prev_hi)
                ll.append(last_lo is not None and prev_lo is not None and last_lo>prev_lo)
            x["bull_structure"]=np.array(hh)&np.array(ll)
            # mirror lower high/lower low
            last_hi=None; last_lo=None; prev_hi=None; prev_lo=None; lh=[]; lower=[]
            for i,row in x.iterrows():
                # Use the actual pivot candle, not the later confirmation candle.
                if row.piv_hi and i >= 3: prev_hi,last_hi=last_hi,float(x.high.iloc[i-3])
                if row.piv_lo and i >= 3: prev_lo,last_lo=last_lo,float(x.low.iloc[i-3])
                lh.append(last_hi is not None and prev_hi is not None and last_hi<prev_hi)
                lower.append(last_lo is not None and prev_lo is not None and last_lo<prev_lo)
            x["bear_structure"]=np.array(lh)&np.array(lower)
        frames[tf]=x
    out=raw
    for tf,x in frames.items():
        cols=["time","close","ema200","ema200_slope"]
        if tf=="1h": cols += ["bull_structure","bear_structure"]
        x=x[cols].rename(columns={c:f"{tf}_{c}" for c in cols if c!="time"})
        out=pd.merge_asof(out.sort_values("time"),x.sort_values("time"),left_on="time",right_on="time",direction="backward")
    out["long_regime"]=(out["4h_close"]>out["4h_ema200"])&(out["4h_ema200_slope"]>=0)
    out["short_regime"]=(out["4h_close"]<out["4h_ema200"])&(out["4h_ema200_slope"]<=0)
    out["long_signal"]=out.long_regime & out["1h_bull_structure"].fillna(False) & out.cross_up & (out.close>out.ema50) & out.bull_div_recent
    out["short_signal"]=out.short_regime & out["1h_bear_structure"].fillna(False) & out.cross_down & (out.close<out.ema50) & out.bear_div_recent
    # Transparent score: recent confirmed divergence remains valid for 8 M15 bars.
    out["long_score"]=25*out.long_regime.astype(int)+20*out["1h_bull_structure"].fillna(False).astype(int)+20*(out.cross_up&(out.close>out.ema50)).astype(int)+20*out.bull_div_recent.astype(int)+15*(out.close>out.open).astype(int)
    out["short_score"]=25*out.short_regime.astype(int)+20*out["1h_bear_structure"].fillna(False).astype(int)+20*(out.cross_down&(out.close<out.ema50)).astype(int)+20*out.bear_div_recent.astype(int)+15*(out.close<out.open).astype(int)
    return out

def run_bt(df, start, end, cash0=10000, risk_pct=.0025, slippage_points=2, min_score=80, target_r=2.0):
    cash=float(cash0); peak=cash; maxdd=0.0; pos=None; trades=[]; equity=[]
    # Input hybrid spread is in broker points; external segment is estimated and not broker-native.
    spreads=df.spread.where(df.spread>0,df.loc[df.spread>0,"spread"].median()).fillna(30).to_numpy()
    point=.01
    day_pnl={}; halted_days=set(); cooldown_until=-1
    for i in range(max(start,1),min(end,len(df)-1)):
        row=df.iloc[i]; nxt=df.iloc[i+1]
        if pos:
            reason=None; exit_raw=None
            if pos["side"]=="long":
                stop_hit=row.low<=pos["sl"]; tp_hit=row.high>=pos["tp"]
            else:
                stop_hit=row.high>=pos["sl"]; tp_hit=row.low<=pos["tp"]
            # Conservative if stop and target both hit on same OHLC bar: assume stop first.
            if stop_hit: reason,exit_raw="stop",pos["sl"]
            elif tp_hit: reason,exit_raw="target_2R",pos["tp"]
            elif (pos["side"]=="long" and row.bear_div) or (pos["side"]=="short" and row.bull_div):
                reason,exit_raw="opposite_confirmed_divergence",float(nxt.open)
            elif (pos["side"]=="long" and row.cross_down) or (pos["side"]=="short" and row.cross_up):
                reason,exit_raw="opposite_ema_cross",float(nxt.open)
            if reason:
                spr=spreads[i]*point; slip=slippage_points*point
                fill=exit_raw-spr/2-slip if pos["side"]=="long" else exit_raw+spr/2+slip
                pnl=(fill-pos["entry"])*pos["units"] if pos["side"]=="long" else (pos["entry"]-fill)*pos["units"]
                cash+=pnl; day= pd.Timestamp(row.time).strftime("%Y-%m-%d"); day_pnl[day]=day_pnl.get(day,0)+pnl
                trades.append({"side":pos["side"],"entry_time":pos["time"].isoformat(),"exit_time":nxt.time.isoformat(),
                    "entry_price":pos["entry"],"exit_price":fill,"stop_price":pos["sl"],"target_price":pos["tp"],
                    "units_proxy":pos["units"],"risk_cash_proxy":pos["risk_cash"],"pnl_proxy":pnl,"r_multiple_proxy":pnl/max(pos["risk_cash"],1e-9),
                    "equity_after":cash,"exit_reason":reason,"bars_held":i-pos["index"],"entry_score":pos["score"]})
                pos=None; cooldown_until=i+3
                peak=max(peak,cash); maxdd=min(maxdd,(cash/peak-1)*100 if peak else -100)
        # Daily loss / drawdown guard. Proxy only, not a broker-account guarantee.
        day=pd.Timestamp(row.time).strftime("%Y-%m-%d")
        if day_pnl.get(day,0)<=-cash0*.02: halted_days.add(day)
        peak=max(peak,cash); maxdd=min(maxdd,(cash/peak-1)*100 if peak else -100)
        if pos is None and i>=cooldown_until and day not in halted_days and cash>0 and peak>0 and (cash/peak-1)>-.07:
            candidates=[]
            if bool(row.long_signal) and row.long_score>=min_score: candidates.append(("long",float(row.long_score)))
            if bool(row.short_signal) and row.short_score>=min_score: candidates.append(("short",float(row.short_score)))
            if candidates and np.isfinite(row.atr) and row.atr>0:
                side,score=candidates[0]
                # stop beyond latest confirmed swing when known, otherwise 1.5 ATR; never below 1.5 ATR.
                if side=="long":
                    prior=df.iloc[max(0,i-60):i+1]
                    lows=prior.loc[prior.pivot_low_conf,"confirmed_pivot_low_price"].dropna()
                    swing=float(lows.iloc[-1]) if len(lows) else float(row.close-1.5*row.atr)
                    stop=min(swing,float(row.close-1.5*row.atr))
                    dist=float(row.close-stop)
                else:
                    prior=df.iloc[max(0,i-60):i+1]
                    highs=prior.loc[prior.pivot_high_conf,"confirmed_pivot_high_price"].dropna()
                    swing=float(highs.iloc[-1]) if len(highs) else float(row.close+1.5*row.atr)
                    stop=max(swing,float(row.close+1.5*row.atr))
                    dist=float(stop-row.close)
                if dist>0 and np.isfinite(dist):
                    risk_cash=cash*risk_pct
                    units=int(risk_cash/dist)
                    if units>=1:
                        spr=spreads[i+1]*point; slip=slippage_points*point; op=float(nxt.open)
                        entry=op+spr/2+slip if side=="long" else op-spr/2-slip
                        actual_dist=max(dist,1.5*float(row.atr))
                        sl=entry-actual_dist if side=="long" else entry+actual_dist
                        tp=entry+target_r*actual_dist if side=="long" else entry-target_r*actual_dist
                        pos={"side":side,"time":nxt.time,"entry":entry,"sl":sl,"tp":tp,"units":units,
                             "risk_cash":risk_cash,"index":i+1,"score":score}
        equity.append({"time":row.time.isoformat(),"equity_proxy":cash,"peak_proxy":peak})
    if pos:
        row=df.iloc[min(end,len(df)-1)]; spr=spreads[min(end,len(df)-1)]*point; slip=slippage_points*point
        fill=float(row.close)-spr/2-slip if pos["side"]=="long" else float(row.close)+spr/2+slip
        pnl=(fill-pos["entry"])*pos["units"] if pos["side"]=="long" else (pos["entry"]-fill)*pos["units"]
        cash+=pnl; trades.append({"side":pos["side"],"entry_time":pos["time"].isoformat(),"exit_time":row.time.isoformat(),
            "entry_price":pos["entry"],"exit_price":fill,"stop_price":pos["sl"],"target_price":pos["tp"],
            "units_proxy":pos["units"],"risk_cash_proxy":pos["risk_cash"],"pnl_proxy":pnl,
            "r_multiple_proxy":pnl/max(pos["risk_cash"],1e-9),"equity_after":cash,"exit_reason":"end_of_segment",
            "bars_held":min(end,len(df)-1)-pos["index"],"entry_score":pos["score"]})
    return {"trades":trades,"equity_curve":equity,"initial_equity_proxy":cash0,"final_equity_proxy":cash,
            "return_pct_proxy":(cash/cash0-1)*100,"max_drawdown_pct_proxy":maxdd}

def summarize(trades):
    if not trades: return {"trades":0,"net_pnl_proxy":0,"return_on_initial_pct_proxy":0,"win_rate_pct":None,"profit_factor":None,"expectancy_R_proxy":None}
    p=np.array([t["pnl_proxy"] for t in trades],float); r=np.array([t["r_multiple_proxy"] for t in trades],float)
    wins=p[p>0].sum(); losses=-p[p<0].sum()
    return {"trades":len(trades),"net_pnl_proxy":round(float(p.sum()),4),"return_on_initial_pct_proxy":round(float(p.sum()/10000*100),4),
            "win_rate_pct":round(float((p>0).mean()*100),3),"profit_factor":round(float(wins/losses),4) if losses else None,
            "expectancy_R_proxy":round(float(r.mean()),4),"best_trade_proxy":round(float(p.max()),4),"worst_trade_proxy":round(float(p.min()),4)}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--csv",required=True); p.add_argument("--meta",required=True); p.add_argument("--output-dir",required=True)
    p.add_argument("--cash",type=float,default=10000); p.add_argument("--risk-pct",type=float,default=.0025)
    p.add_argument("--slippage-points",type=float,default=2); p.add_argument("--min-score",type=int,default=80)
    p.add_argument("--target-r",type=float,default=2.0)
    p.add_argument("--divergence-recency-bars",type=int,default=8)
    a=p.parse_args()
    if not 0<a.risk_pct<=.01: p.error("risk-pct must be >0 and <=1%")
    root=Path(__file__).resolve().parent; csv_path=Path(a.csv); meta_path=Path(a.meta)
    meta=json.loads(meta_path.read_text(encoding="utf-8-sig"))
    df=prepare(csv_path,a.divergence_recency_bars)
    digest=hashlib.sha256(csv_path.read_bytes()).hexdigest()
    # Freeze 60/20/20 chronologically. Final 20% is not used for tuning.
    n=len(df); i60=int(n*.6); i80=int(n*.8)
    results={}
    for name,start,end in [("development",0,i60),("validation",i60,i80),("out_of_sample",i80,n-1)]:
        r=run_bt(df,start,end,a.cash,a.risk_pct,a.slippage_points,a.min_score,a.target_r)
        results[name]={"start_utc":df.time.iloc[start].isoformat(),"end_utc":df.time.iloc[min(end,n-1)].isoformat(),
                       "metrics":summarize(r["trades"]),"return_pct_proxy":round(r["return_pct_proxy"],4),
                       "max_drawdown_pct_proxy":round(r["max_drawdown_pct_proxy"],4),
                       "trades":r["trades"],"equity_curve":r["equity_curve"]}
    out=Path(a.output_dir); out.mkdir(parents=True,exist_ok=True)
    all_trades=[]
    for seg in results.values():
        for t in seg["trades"]: t["segment"]=next(k for k,v in results.items() if v is seg)
        all_trades.extend(seg["trades"])
    pd.DataFrame(all_trades).to_csv(out/"adaptive_regime_trades.csv",index=False)
    for name,seg in results.items():
        pd.DataFrame(seg.pop("equity_curve")).to_csv(out/f"equity_{name}.csv",index=False)
    report={"status":"research-only; no MT5 connection; no orders sent","strategy":"VOOM Adaptive Regime + EMA/RSI Divergence v0.1",
        "data_file":str(csv_path),"data_sha256":digest,"bars":len(df),"timeframe":"M15 with closed H1/H4 resampling",
        "actual_start_utc":df.time.iloc[0].isoformat(),"actual_end_utc":df.time.iloc[-1].isoformat(),
        "source_counts":meta.get("sources"),"hybrid_source_warning":"External spot XAUUSD supplement is not broker-native XAUUSDc.",
        "parameters":{"H4_EMA":200,"H1_structure_pivots":[3,3],"M15_EMA":[20,50],"RSI":14,"ATR":14,"divergence_recency_bars":a.divergence_recency_bars,"minimum_score":a.min_score,
                      "risk_pct":a.risk_pct,"stop_min_ATR":1.5,"target_R":a.target_r,"cooldown_bars":3,"slippage_points_per_fill":a.slippage_points},
        "split":"chronological 60% development / 20% validation / 20% final out-of-sample; independently simulated, equity reset per segment",
        "segments":results,
        "limitations":["Signals are research approximations and are not a validated strategy.",
            "Higher-timeframe bars are merged only after their close; pivot structure is delayed until confirmation.",
            "Score threshold is a rule gate, not a calibrated probability.",
            "P/L uses abstract whole-unit price movement, not verified USC account/lot conversion.",
            "Spread is a bar-level proxy; external XAUUSD segment does not use broker XAUUSDc spread.",
            "Commission, swap and tick-level execution are not modeled; stop/target ordering assumes stop first if both touched.",
            "Each split resets equity to the same initial proxy; segment results are not a compounded equity curve.",
            "Do not deploy to MT5 or customer UI; require broker-native data, realistic cost model, walk-forward tests and human risk approval."]}
    report_path=out/"adaptive_regime_report.json"
    report_path.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps({"ok":True,"report":str(report_path.resolve()),"trades_csv":str((out/"adaptive_regime_trades.csv").resolve()),
        "data_sha256":digest,"bars":len(df),"segments":{k:{"metrics":v["metrics"],"return_pct_proxy":v["return_pct_proxy"],"max_drawdown_pct_proxy":v["max_drawdown_pct_proxy"]} for k,v in results.items()},
        "live_trading_enabled":False,"customer_visible":False},indent=2,ensure_ascii=False))
if __name__=="__main__": main()
