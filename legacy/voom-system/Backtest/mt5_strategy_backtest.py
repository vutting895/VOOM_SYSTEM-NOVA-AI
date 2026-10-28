# -*- coding: utf-8 -*-
"""Offline, research-only backtest of Source 1 Mean Rejection + simplified SMC rules.
Consumes imported MT5 OHLCV/spread bars. Never connects to MT5 and never sends orders.
"""
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
SOURCE1_DEFAULT = {
    "CONFLUENCE_MIN": 4, "DIST_ATR_MULT": 1.8, "Z_SCORE_THRESH": 2.2,
    "RISK_PCT": 0.01, "RR_TP1": 1.5, "RR_TP2": 3.1,
    "RR_TP1_CLOSE_PCT": 0.5, "VOLATILITY_ATR_MIN": 0.4, "VOLATILITY_ATR_MAX": 3.5,
    "MEAN_PERIOD": 50, "SMC_OB_LOOKBACK": 20, "FVG_MIN_SIZE_ATR": 0.3,
    "PA_CONFIRMATION": True, "SESSION_FILTER": ["London", "NY"],
}
def indicators(df, cfg):
    x = df.copy()
    c, h, l = x.close, x.high, x.low
    pc = c.shift(1)
    tr = pd.concat([h-l, (h-pc).abs(), (l-pc).abs()], axis=1).max(axis=1)
    x["atr"] = tr.ewm(alpha=1/14, adjust=False).mean()
    x["atr_ma"] = x.atr.rolling(50, min_periods=20).mean()
    x["mean"] = c.rolling(cfg["MEAN_PERIOD"], min_periods=cfg["MEAN_PERIOD"]).mean()
    x["std"] = c.rolling(cfg["MEAN_PERIOD"], min_periods=cfg["MEAN_PERIOD"]).std()
    x["z"] = (c-x["mean"])/(x["std"]+1e-9)
    # Source 1's simplified OB/FVG checks are reproduced as bar-based research proxies.
    x["ob_bull"] = (l.shift(2) < l.shift(3)) & (c > x.open)
    x["ob_bear"] = (h.shift(2) > h.shift(3)) & (c < x.open)
    x["fvg_size"] = (h.shift(1)-l.shift(1)).abs()
    x["fvg_valid"] = x["fvg_size"] > cfg["FVG_MIN_SIZE_ATR"]*x.atr
    x["dist_atr"] = (c-x["mean"]).abs()/x.atr.replace(0, np.nan)
    x["bullish_engulf"] = (c > x.open.shift(1)) & (c.shift(1) < x.open.shift(1))
    # Deterministic session filter: use UTC bar time, never the wall-clock time.
    hour = x.index.hour
    x["session_ok"] = ((hour >= 7) & (hour <= 16)) | ((hour >= 12) & (hour <= 21))
    x["vol_ok"] = (x.atr/x.atr_ma).between(cfg["VOLATILITY_ATR_MIN"], cfg["VOLATILITY_ATR_MAX"])
    return x

def signal_at(x, i, cfg):
    r = x.iloc[i]
    vals = [r["atr"], r["atr_ma"], r["mean"], r["std"], r["z"], r["dist_atr"]]
    if not all(np.isfinite(v) for v in vals) or r.atr <= 0 or not r.session_ok or not r.vol_ok:
        return None
    side = None; confluence = 0
    if r.z < -cfg["Z_SCORE_THRESH"] and r.ob_bull and r.fvg_valid:
        side = "LONG"; confluence += 2
    elif r.z > cfg["Z_SCORE_THRESH"] and r.ob_bear and r.fvg_valid:
        side = "SHORT"; confluence += 2
    if side is None: return None
    if cfg["PA_CONFIRMATION"]:
        if (side == "LONG" and r.bullish_engulf) or (side == "SHORT" and not r.bullish_engulf):
            confluence += 1
    # No validated DL ensemble is available for historical inference; DL score stays 0.
    if r.dist_atr < cfg["DIST_ATR_MULT"]: return None
    confluence += 1
    if confluence < cfg["CONFLUENCE_MIN"]: return None
    return {"side": side, "signal_time": x.index[i], "signal_close": float(r.close), "atr": float(r.atr),
            "z": float(r.z), "confluence": int(confluence)}

def metrics(trades, start_equity, end_equity, equity_curve):
    pnl = np.array([t["net_pnl"] for t in trades], dtype=float)
    wins, losses = pnl[pnl > 0], pnl[pnl < 0]
    curve = np.array(equity_curve or [start_equity], dtype=float)
    peak = np.maximum.accumulate(curve)
    dd = np.min((curve-peak)/np.where(peak == 0, 1, peak))*100 if len(curve) else 0.0
    daily = pd.Series(curve).pct_change().dropna()
    sharpe = float(daily.mean()/daily.std()*math.sqrt(252)) if len(daily) > 1 and daily.std() > 0 else None
    gp, gl = float(wins.sum()), float(abs(losses.sum()))
    return {"initial_equity": round(start_equity, 2), "final_equity": round(end_equity, 2),
        "net_pnl": round(end_equity-start_equity, 2), "return_pct": round((end_equity/start_equity-1)*100, 4),
        "max_drawdown_pct": round(float(dd), 4), "trades": len(trades),
        "win_rate_pct": round(float((pnl > 0).mean()*100), 3) if len(pnl) else 0.0,
        "profit_factor": round(gp/gl, 4) if gl > 0 else (None if gp == 0 else "inf"),
        "average_trade_pnl": round(float(pnl.mean()), 4) if len(pnl) else 0.0, "sharpe_approx": sharpe}

def run_segment(x, start_i, end_i, cfg, meta, initial_cash, risk_pct, commission_per_lot_side, slippage_points):
    spec = meta.get("broker_spec", {})
    point = float(spec.get("point", 0) or 0)
    tick_size = float(spec.get("trade_tick_size", 0) or 0)
    tick_value = float(spec.get("trade_tick_value", 0) or 0)
    vmin = float(spec.get("volume_min", 0.01) or 0.01)
    vmax = float(spec.get("volume_max", 100) or 100)
    vstep = float(spec.get("volume_step", 0.01) or 0.01)
    if point <= 0 or tick_size <= 0 or tick_value <= 0:
        raise ValueError("Missing broker tick value/size/point in .meta.json. Re-import from MT5; refusing fake P/L.")
    equity = float(initial_cash); peak = equity; trades = []; curve = [equity]; pos = None
    current_day = None; day_start_equity = equity; daily_blocked = False; dd_blocked = False
    # Mirrors the existing research Risk Guard: 3% daily loss, 7% peak drawdown.
    # Signals use completed bar i and execute at next bar open, preventing same-close fills/lookahead.
    for i in range(max(start_i, 60), min(end_i, len(x)-1)):
        r = x.iloc[i]
        day = x.index[i].date()
        if day != current_day:
            current_day = day
            day_start_equity = equity
            daily_blocked = False
        if peak > 0 and (peak-equity)/peak*100 >= 7.0:
            dd_blocked = True
        spr = max(0.0, float(r.spread))*point
        slip = max(0.0, slippage_points)*point
        # Manage a position with current bar's bid OHLC; conservative rule if SL and TP are both touched: SL first.
        if pos is not None:
            hi, lo = float(r.high), float(r.low)
            side = pos["side"]
            exit_price = None; reason = None
            spread_now = spr
            if side == "LONG":
                sl_hit = lo <= pos["sl"]; tp1_hit = (not pos["tp1_done"]) and hi >= pos["tp1"]; tp2_hit = hi >= pos["tp2"]
                if sl_hit:
                    exit_price, reason = pos["sl"]-slip, "SL"
                elif tp1_hit:
                    q = pos["lots"]*cfg["RR_TP1_CLOSE_PCT"]
                    exit_price, reason = pos["tp1"]-slip, "TP1"
                    p = ((exit_price-pos["entry"])/tick_size)*tick_value*q
                    fee = commission_per_lot_side*q*2
                    equity += p-fee; pos["realized"] += p-fee; pos["lots"] -= q; pos["tp1_done"] = True
                    trades.append({"symbol":meta.get("symbol"),"side":side,"entry_time":str(pos["entry_time"]),"exit_time":str(x.index[i]),
                        "exit_reason":"TP1_PARTIAL","lots":q,"gross_pnl":round(p,6),"commission":round(fee,6),"net_pnl":round(p-fee,6),"equity_after":round(equity,4)})
                    if pos["lots"] <= vstep/2: pos = None
                    else: exit_price = None
                elif tp2_hit:
                    exit_price, reason = pos["tp2"]-slip, "TP2"
            else:
                sl_hit = hi+spread_now >= pos["sl"]; tp1_hit = (not pos["tp1_done"]) and lo+spread_now <= pos["tp1"]; tp2_hit = lo+spread_now <= pos["tp2"]
                if sl_hit:
                    exit_price, reason = pos["sl"]+slip, "SL"
                elif tp1_hit:
                    q = pos["lots"]*cfg["RR_TP1_CLOSE_PCT"]
                    exit_price, reason = pos["tp1"]+slip, "TP1"
                    p = ((pos["entry"]-exit_price)/tick_size)*tick_value*q
                    fee = commission_per_lot_side*q*2
                    equity += p-fee; pos["realized"] += p-fee; pos["lots"] -= q; pos["tp1_done"] = True
                    trades.append({"symbol":meta.get("symbol"),"side":side,"entry_time":str(pos["entry_time"]),"exit_time":str(x.index[i]),
                        "exit_reason":"TP1_PARTIAL","lots":q,"gross_pnl":round(p,6),"commission":round(fee,6),"net_pnl":round(p-fee,6),"equity_after":round(equity,4)})
                    if pos["lots"] <= vstep/2: pos = None
                    else: exit_price = None
                elif tp2_hit:
                    exit_price, reason = pos["tp2"]+slip, "TP2"
            if pos is not None and exit_price is not None:
                q = pos["lots"]
                p = ((exit_price-pos["entry"])/tick_size)*tick_value*q if side == "LONG" else ((pos["entry"]-exit_price)/tick_size)*tick_value*q
                fee = commission_per_lot_side*q*2
                net = p-fee
                equity += net
                trades.append({"symbol":meta.get("symbol"),"side":side,"entry_time":str(pos["entry_time"]),"exit_time":str(x.index[i]),
                    "exit_reason":reason,"lots":q,"gross_pnl":round(p,6),"commission":round(fee,6),"net_pnl":round(net,6),
                    "signal_time":str(pos["signal_time"]),"signal_z":pos["z"],"confluence":pos["confluence"],"equity_after":round(equity,4)})
                pos = None
            peak = max(peak, equity); curve.append(equity)
            if day_start_equity > 0 and (day_start_equity-equity)/day_start_equity*100 >= 3.0:
                daily_blocked = True
            if peak > 0 and (peak-equity)/peak*100 >= 7.0:
                dd_blocked = True
            if pos is not None: continue
        if day_start_equity > 0 and (day_start_equity-equity)/day_start_equity*100 >= 3.0:
            daily_blocked = True
        if daily_blocked or dd_blocked:
            continue
        sig = signal_at(x, i, cfg)
        if not sig: continue
        nxt = x.iloc[i+1]
        entry_spread = max(0.0, float(nxt.spread))*point
        raw_open = float(nxt.open)
        # MT5 bar OHLC are treated as bid prices: long opens at ask, short opens at bid.
        entry = raw_open + (entry_spread if sig["side"] == "LONG" else 0.0) + (slip if sig["side"] == "LONG" else -slip)
        stop_dist = sig["atr"]*1.2
        risk_cash = equity*risk_pct
        loss_per_lot = (stop_dist/tick_size)*float(spec.get("trade_tick_value_loss", tick_value) or tick_value)
        if loss_per_lot <= 0: continue
        lots = math.floor((risk_cash/loss_per_lot)/vstep)*vstep
        lots = min(lots, vmax)
        if lots < vmin: continue
        # Use actual entry as anchor to avoid a gap silently changing the intended RR.
        if sig["side"] == "LONG":
            sl, tp1, tp2 = entry-stop_dist, entry+stop_dist*cfg["RR_TP1"], entry+stop_dist*cfg["RR_TP2"]
        else:
            sl, tp1, tp2 = entry+stop_dist, entry-stop_dist*cfg["RR_TP1"], entry-stop_dist*cfg["RR_TP2"]
        pos = {"side":sig["side"],"entry":entry,"entry_time":x.index[i+1],"signal_time":sig["signal_time"],
               "lots":lots,"sl":sl,"tp1":tp1,"tp2":tp2,"tp1_done":False,"realized":0.0,
               "z":sig["z"],"confluence":sig["confluence"]}
    # Do not invent an exit after data ends. Mark open position to market with a disclosed end-of-data close.
    if pos is not None:
        r=x.iloc[min(end_i, len(x)-1)]; spr=max(0.0,float(r.spread))*point; q=pos["lots"]
        close=float(r.close)-(spr if pos["side"]=="LONG" else 0.0)
        p=((close-pos["entry"])/tick_size)*tick_value*q if pos["side"]=="LONG" else ((pos["entry"]-close)/tick_size)*tick_value*q
        fee=commission_per_lot_side*q*2; net=p-fee; equity+=net
        trades.append({"symbol":meta.get("symbol"),"side":pos["side"],"entry_time":str(pos["entry_time"]),"exit_time":str(x.index[min(end_i,len(x)-1)]),
            "exit_reason":"END_OF_DATA_MARK_TO_MARKET","lots":q,"gross_pnl":round(p,6),"commission":round(fee,6),"net_pnl":round(net,6),
            "signal_time":str(pos["signal_time"]),"signal_z":pos["z"],"confluence":pos["confluence"],"equity_after":round(equity,4)})
    # Combine partial TP1 legs and final exits into one round-trip trade for accurate trade metrics.
    if trades:
        frame = pd.DataFrame(trades)
        consolidated = []
        for _, group in frame.groupby(["entry_time", "side"], sort=False, dropna=False):
            row = group.iloc[-1].to_dict()
            for col in ("gross_pnl", "commission", "net_pnl", "lots"):
                row[col] = float(group[col].fillna(0).sum())
            row["exit_time"] = str(group["exit_time"].iloc[-1])
            row["exit_reason"] = " + ".join(dict.fromkeys(group["exit_reason"].astype(str)))
            for col in ("signal_time", "signal_z", "confluence"):
                if col in group:
                    values = group[col].dropna()
                    if len(values): row[col] = values.iloc[0]
            row["equity_after"] = float(group["equity_after"].iloc[-1])
            consolidated.append(row)
        trades = consolidated
    return trades, equity, curve

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--csv",required=True); p.add_argument("--meta",help="Importer .meta.json; default same stem as CSV")
    p.add_argument("--output-dir",default=str(ROOT/"results")); p.add_argument("--cash",type=float,default=10000)
    p.add_argument("--risk-pct",type=float,default=0.005,help="Research risk per trade, default 0.5%%; hard-capped at 1%%")
    p.add_argument("--commission-per-lot-side",type=float,default=0.0,help="Set broker's commission per lot per side in account currency")
    p.add_argument("--slippage-points",type=float,default=2.0,help="Adverse slippage per fill, points; set using broker evidence")
    p.add_argument("--min-bars",type=int,default=1000); args=p.parse_args()
    csv=Path(args.csv).resolve(); meta_path=Path(args.meta).resolve() if args.meta else csv.with_suffix(".meta.json")
    if not csv.exists() or not meta_path.exists(): raise FileNotFoundError("CSV or matching .meta.json missing. Run import_mt5_history.py first.")
    raw=pd.read_csv(csv)
    needed={"time","open","high","low","close","spread","tick_volume"}
    if not needed.issubset(raw.columns): raise ValueError(f"CSV needs columns {sorted(needed)}")
    raw["time"]=pd.to_datetime(raw.time,utc=True,errors="coerce")
    raw=raw.dropna(subset=["time"]).sort_values("time").drop_duplicates("time").set_index("time")
    if len(raw)<args.min_bars: raise ValueError(f"Only {len(raw)} bars; minimum is {args.min_bars}")
    for col in ["open","high","low","close","spread","tick_volume"]: raw[col]=pd.to_numeric(raw[col],errors="coerce")
    raw=raw.dropna(subset=["open","high","low","close","spread"])
    zero_spread_rows = int((raw["spread"] <= 0).sum())
    positive_spreads = raw.loc[raw["spread"] > 0, "spread"]
    if len(positive_spreads) == 0: raise ValueError("No positive historical spread values; refusing to assume zero transaction cost.")
    # Zero spread in bars is commonly missing/closed-session data; use the dataset median as a conservative proxy.
    spread_fallback = float(positive_spreads.median())
    raw.loc[raw["spread"] <= 0, "spread"] = spread_fallback
    if (raw[["open","high","low","close"]] <= 0).any().any(): raise ValueError("Non-positive prices found")
    if ((raw.high < raw[["open","close","low"]].max(axis=1)) | (raw.low > raw[["open","close","high"]].min(axis=1))).any(): raise ValueError("Invalid OHLC data")
    meta=json.loads(meta_path.read_text(encoding="utf-8"))
    if not meta.get("read_only") or meta.get("orders_sent") is not False: raise ValueError("Metadata does not confirm read-only import")
    if args.cash<=0 or args.risk_pct<=0 or args.risk_pct>0.01: raise ValueError("--cash must be positive and --risk-pct must be >0 and <=0.01")
    x=indicators(raw,SOURCE1_DEFAULT)
    n=len(x); train_end=int(n*0.6); val_end=int(n*0.8)
    # Run each time block independently with fresh normalized cash; features may use earlier bars as warm-up.
    periods=[("development",60,max(61,train_end)),("validation",train_end,max(train_end+1,val_end)),("out_of_sample",val_end,n-1)]
    report={"status":"research-only","orders_sent":False,"mt5_connection_used_by_backtester":False,
      "symbol":meta.get("symbol"),"timeframe":meta.get("timeframe"),"account_currency":meta.get("account_currency","UNKNOWN"),"source":"MT5 copy_rates_range export",
      "data_start_utc":str(x.index.min()),"data_end_utc":str(x.index.max()),"bars":n,
      "coverage_days":round((x.index.max()-x.index.min()).total_seconds()/86400,2),
      "split":"chronological 60% development / 20% validation / 20% out-of-sample; fixed Source 1-inspired parameters, no test-set tuning",
      "strategy":"Source 1 Mean Rejection + simplified OB/FVG + volatility/session filters; deterministic DL score=0 because validated historical ensemble is unavailable",
      "parameters":SOURCE1_DEFAULT,"risk_pct":args.risk_pct,"commission_per_lot_side":args.commission_per_lot_side,
      "slippage_points_per_fill":args.slippage_points,"broker_spec":meta.get("broker_spec",{}),
      "risk_guard":{"max_daily_loss_pct":3.0,"max_peak_drawdown_pct":7.0,"behavior":"block new entries after limit; open position remains governed by its SL/TP"},
      "data_quality":{"zero_or_negative_spread_bars":zero_spread_rows,"fallback_spread_points":spread_fallback},
      "cost_model":"per-bar historical spread, adverse slippage assumption, optional commission; not tick replay, swap not modeled",
      "segments":{},"caveats":[
        "OHLC spread uses bar-level spread, not historical tick bid/ask sequence.",
        "If SL and TP are both touched within one candle, SL is assumed first (conservative).",
        "DL score is fixed at zero; this is not a test of the unvalidated deep-learning ensemble.",
        "Source 1 OB/FVG checks are simplified bar-based rules, not institutional order-flow truth.",
        "Commission defaults to zero unless explicitly configured; swap and market impact are not modeled.",
        "Validate broker tick value/currency, commission, lot rules and results against MT5 Strategy Tester before any strategy promotion.",
        "No live orders, no model deployment, and no production parameters changed."
      ]}
    alltrades=[]; outdir=Path(args.output_dir).resolve(); outdir.mkdir(parents=True,exist_ok=True)
    for name,lo,hi in periods:
        lo=max(60,min(lo,n-2)); hi=max(lo+1,min(hi,n-1))
        ts,end_equity,curve=run_segment(x,lo,hi,SOURCE1_DEFAULT,meta,args.cash,args.risk_pct,args.commission_per_lot_side,args.slippage_points)
        alltrades.extend([{**t,"segment":name} for t in ts])
        report["segments"][name]={"start_utc":str(x.index[lo]),"end_utc":str(x.index[hi]),"bars":hi-lo,
            "metrics":metrics(ts,args.cash,end_equity,curve),"trades":len(ts)}
    trades_path=outdir/f"{csv.stem}_trades.csv"; report_path=outdir/f"{csv.stem}_report.json"
    pd.DataFrame(alltrades).to_csv(trades_path,index=False)
    report["trade_rows"]=len(alltrades); report["trades_csv"]=str(trades_path)
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2,default=str)); print(f"REPORT={report_path}")
if __name__=="__main__": main()
