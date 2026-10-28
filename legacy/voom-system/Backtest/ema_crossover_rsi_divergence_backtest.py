# -*- coding: utf-8 -*-
"""Offline EMA crossover + RSI divergence backtest. No MT5 connection or order APIs."""
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
import pandas as pd

POINT = 0.01  # verified XAUUSDc metadata; still a research proxy, not lot valuation

def ema(s, period):
    return s.ewm(span=period, adjust=False).mean()

def rsi(close, period=14):
    d = close.diff()
    gain = d.clip(lower=0).ewm(alpha=1/period, adjust=False).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1/period, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100/(1+rs)).fillna(50)

def atr(df, period=14):
    prev = df.close.shift(1)
    tr = pd.concat([df.high-df.low, (df.high-prev).abs(), (df.low-prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean()

def pivots(values, left=3, right=3, kind="low"):
    a = np.asarray(values, dtype=float)
    out = np.zeros(len(a), dtype=bool)
    for i in range(left, len(a)-right):
        w = a[i-left:i+right+1]
        if kind == "low" and a[i] == np.nanmin(w) and np.sum(w == a[i]) == 1:
            out[i+right] = True  # only known after right bars; mark confirmation bar
        elif kind == "high" and a[i] == np.nanmax(w) and np.sum(w == a[i]) == 1:
            out[i+right] = True
    return out

def divergence_flags(df, left=3, right=3, max_gap=60):
    # Confirm pivots only after right bars; compare confirmed pivots, avoiding future leakage.
    low_conf = pivots(df.low.to_numpy(), left, right, "low")
    high_conf = pivots(df.high.to_numpy(), left, right, "high")
    bull = np.zeros(len(df), dtype=bool)
    bear = np.zeros(len(df), dtype=bool)
    low_p, high_p = [], []
    for i in range(len(df)):
        if low_conf[i]:
            pivot_i = i-right
            low_p.append(pivot_i)
            low_p = [j for j in low_p if i-j <= max_gap+right]
            if len(low_p) >= 2:
                a, b = low_p[-2], low_p[-1]
                if df.low.iloc[b] < df.low.iloc[a] and df.rsi.iloc[b] > df.rsi.iloc[a]:
                    bull[i] = True
        if high_conf[i]:
            pivot_i = i-right
            high_p.append(pivot_i)
            high_p = [j for j in high_p if i-j <= max_gap+right]
            if len(high_p) >= 2:
                a, b = high_p[-2], high_p[-1]
                if df.high.iloc[b] > df.high.iloc[a] and df.rsi.iloc[b] < df.rsi.iloc[a]:
                    bear[i] = True
    return bull, bear

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--csv", required=True)
    p.add_argument("--meta", required=True)
    p.add_argument("--output-dir", required=True)
    p.add_argument("--cash", type=float, default=10000.0)
    p.add_argument("--fast-ema", type=int, default=20)
    p.add_argument("--slow-ema", type=int, default=50)
    p.add_argument("--rsi-period", type=int, default=14)
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--sl-atr", type=float, default=2.0)
    p.add_argument("--risk-pct", type=float, default=0.0025)
    p.add_argument("--pivot-left", type=int, default=3)
    p.add_argument("--pivot-right", type=int, default=3)
    p.add_argument("--max-pivot-gap", type=int, default=60)
    p.add_argument("--slippage-points", type=float, default=2.0)
    p.add_argument("--min-coverage", type=float, default=0.95)
    a = p.parse_args()
    if a.fast_ema < 2 or a.slow_ema <= a.fast_ema:
        p.error("Require 2 <= fast-ema < slow-ema")
    if not 0 < a.risk_pct <= 0.01:
        p.error("risk-pct must be > 0 and <= 0.01")
    src, meta_path = Path(a.csv), Path(a.meta)
    meta = json.loads(meta_path.read_text(encoding="utf-8-sig"))
    raw = pd.read_csv(src)
    req = {"time","open","high","low","close","spread"}
    if not req.issubset(raw.columns):
        raise ValueError(f"Missing CSV columns: {sorted(req-set(raw.columns))}")
    raw["time"] = pd.to_datetime(raw.time, utc=True, errors="raise")
    raw = raw.sort_values("time").drop_duplicates("time").reset_index(drop=True)
    for c in ["open","high","low","close","spread"]:
        raw[c] = pd.to_numeric(raw[c], errors="coerce")
    raw = raw.dropna(subset=["open","high","low","close","spread"]).reset_index(drop=True)
    if len(raw) < 5000:
        raise ValueError(f"Too few valid bars: {len(raw)}")
    actual_days = (raw.time.iloc[-1]-raw.time.iloc[0]).total_seconds()/86400
    requested_days = float(meta.get("requested_coverage_days", 0))
    coverage = actual_days/requested_days if requested_days else 0
    if coverage < a.min_coverage:
        raise SystemExit(f"FAIL CLOSED: only {coverage:.1%} date coverage ({actual_days:.1f}/{requested_days:.1f} days); no 5-year-complete backtest.")
    raw["ema_fast"] = ema(raw.close, a.fast_ema)
    raw["ema_slow"] = ema(raw.close, a.slow_ema)
    raw["rsi"] = rsi(raw.close, a.rsi_period)
    raw["atr"] = atr(raw, a.atr_period)
    raw["bull_div"], raw["bear_div"] = divergence_flags(raw, a.pivot_left, a.pivot_right, a.max_pivot_gap)
    raw["cross_up"] = (raw.ema_fast > raw.ema_slow) & (raw.ema_fast.shift(1) <= raw.ema_slow.shift(1))
    raw["cross_down"] = (raw.ema_fast < raw.ema_slow) & (raw.ema_fast.shift(1) >= raw.ema_slow.shift(1))
    # Chronological 60/20/20 date segments. Signals execute at next bar open only.
    i60, i80 = int(len(raw)*0.6), int(len(raw)*0.8)
    cut60, cut80 = raw.time.iloc[i60], raw.time.iloc[i80]
    cash = float(a.cash)
    equity_peak = cash
    day_pnl = {}
    pos = None
    trades, curve = [], []
    spread_points = raw.spread.where(raw.spread > 0, raw.loc[raw.spread > 0, "spread"].median())
    if spread_points.isna().all():
        spread_points = pd.Series(30.0, index=raw.index)
    spread_points = spread_points.fillna(30.0).to_numpy()
    point = float(meta.get("broker_spec", {}).get("point", POINT))
    # Research valuation proxy: units are abstract gold units; broker lot conversion is deliberately not assumed.
    for i in range(1, len(raw)-1):
        row, nxt = raw.iloc[i], raw.iloc[i+1]
        now = row.time
        dkey = now.strftime("%Y-%m-%d")
        # Exit checks on completed candle; execute next open, except stop hit within bar.
        if pos is not None:
            exit_reason, exit_px = None, None
            if pos["side"] == "long" and row.low <= pos["sl"]:
                exit_reason, exit_px = "protective_sl", pos["sl"]
            elif pos["side"] == "short" and row.high >= pos["sl"]:
                exit_reason, exit_px = "protective_sl", pos["sl"]
            elif (pos["side"] == "long" and row.bear_div) or (pos["side"] == "short" and row.bull_div):
                exit_reason, exit_px = "rsi_divergence_tp", float(nxt.open)
            elif (pos["side"] == "long" and row.cross_down) or (pos["side"] == "short" and row.cross_up):
                exit_reason, exit_px = "opposite_ema_cross", float(nxt.open)
            if exit_reason:
                spr = spread_points[i+1] * point
                slip = a.slippage_points * point
                if pos["side"] == "long":
                    fill = exit_px - spr/2 - slip
                    pnl = (fill-pos["entry"]) * pos["units"]
                else:
                    fill = exit_px + spr/2 + slip
                    pnl = (pos["entry"]-fill) * pos["units"]
                cash += pnl
                trades.append({
                    "side":pos["side"], "entry_time":pos["time"].isoformat(), "exit_time":nxt.time.isoformat(),
                    "entry_price":pos["entry"], "exit_price":fill, "units_proxy":pos["units"],
                    "stop_price":pos["sl"], "pnl":pnl, "equity_after":cash,
                    "exit_reason":exit_reason, "bars_held":i-pos["index"]
                })
                pos = None
        # Entries at next bar open based on current completed bar crossover.
        if pos is None and np.isfinite(row.atr) and row.atr > 0 and cash > 0:
            side = "long" if row.cross_up else ("short" if row.cross_down else None)
            if side:
                stop_dist = float(row.atr) * a.sl_atr
                units = math.floor((cash*a.risk_pct)/stop_dist)
                # Avoid zero exposure; unit size is abstract, not a broker lot.
                if units >= 1:
                    spr = spread_points[i+1] * point
                    slip = a.slippage_points * point
                    op = float(nxt.open)
                    entry = op + spr/2 + slip if side == "long" else op - spr/2 - slip
                    sl = entry-stop_dist if side == "long" else entry+stop_dist
                    pos = {"side":side,"time":nxt.time,"entry":entry,"sl":sl,"units":units,"index":i+1,"entry_equity":cash}
        equity_peak = max(equity_peak, cash)
        curve.append({"time":now.isoformat(),"equity":cash,"peak_equity":equity_peak})
    # Force-close any final position at last close, with spread/slippage.
    if pos is not None:
        last = raw.iloc[-1]
        spr = spread_points[-1]*point
        slip = a.slippage_points*point
        px = float(last.close)
        fill = px-spr/2-slip if pos["side"]=="long" else px+spr/2+slip
        pnl = (fill-pos["entry"])*pos["units"] if pos["side"]=="long" else (pos["entry"]-fill)*pos["units"]
        cash += pnl
        trades.append({"side":pos["side"],"entry_time":pos["time"].isoformat(),"exit_time":last.time.isoformat(),
                       "entry_price":pos["entry"],"exit_price":fill,"units_proxy":pos["units"],"stop_price":pos["sl"],
                       "pnl":pnl,"equity_after":cash,"exit_reason":"end_of_data","bars_held":len(raw)-1-pos["index"]})
    td = pd.DataFrame(trades)
    out = Path(a.output_dir); out.mkdir(parents=True, exist_ok=True)
    trade_path = out/"ema_crossover_rsi_divergence_trades.csv"
    td.to_csv(trade_path, index=False)
    def metrics(frame, start_equity):
        if frame.empty:
            return {"trades":0,"net_pnl":0.0,"return_pct":0.0,"win_rate_pct":None,"profit_factor":None,"avg_trade_pnl":None}
        pnl = frame.pnl.astype(float)
        wins, losses = pnl[pnl>0].sum(), -pnl[pnl<0].sum()
        return {"trades":int(len(frame)),"net_pnl":round(float(pnl.sum()),4),
                "return_pct":round(float(pnl.sum()/start_equity*100),4) if start_equity else None,
                "win_rate_pct":round(float((pnl>0).mean()*100),3),
                "profit_factor":round(float(wins/losses),4) if losses>0 else (None if wins==0 else "infinity"),
                "avg_trade_pnl":round(float(pnl.mean()),4),
                "best_trade":round(float(pnl.max()),4),"worst_trade":round(float(pnl.min()),4)}
    segments = {}
    if len(td):
        ent = pd.to_datetime(td.entry_time, utc=True)
        for name, lo, hi in [("development",None,cut60),("validation",cut60,cut80),("out_of_sample",cut80,None)]:
            mask = (ent < hi) if lo is None else ((ent >= lo) if hi is None else ((ent >= lo)&(ent < hi)))
            part = td.loc[mask]
            segments[name] = {"start_utc":str(raw.time.iloc[0] if lo is None else lo),
                              "end_utc":str(raw.time.iloc[-1] if hi is None else hi),
                              "metrics":metrics(part,a.cash)}
    pnl = td.pnl.astype(float) if len(td) else pd.Series(dtype=float)
    wins, losses = (pnl[pnl>0].sum(), -pnl[pnl<0].sum()) if len(pnl) else (0,0)
    equity_series = np.array([a.cash]+(a.cash+pnl.cumsum()).tolist(),dtype=float)
    peaks = np.maximum.accumulate(equity_series)
    dd = (equity_series/peaks-1)*100
    report = {
        "status":"research-only; no MT5 connection in backtester; no orders sent",
        "symbol":meta.get("symbol","unknown"),"timeframe":meta.get("timeframe","unknown"),
        "requested_start_utc":meta.get("requested_start_utc"),"requested_end_utc":meta.get("requested_end_utc"),
        "actual_start_utc":raw.time.iloc[0].isoformat(),"actual_end_utc":raw.time.iloc[-1].isoformat(),
        "actual_coverage_days":round(actual_days,3),"requested_coverage_days":round(requested_days,3),
        "date_coverage_ratio":round(coverage,5),"bars":int(len(raw)),"initial_cash_normalized":a.cash,
        "final_equity_normalized":round(float(cash),4),"net_pnl_proxy":round(float(cash-a.cash),4),
        "return_pct_proxy":round(float((cash/a.cash-1)*100),4),"max_drawdown_pct_trade_equity":round(float(dd.min()),4),
        "trades":int(len(td)),"win_rate_pct":round(float((pnl>0).mean()*100),3) if len(pnl) else None,
        "profit_factor":round(float(wins/losses),4) if losses>0 else (None if wins==0 else "infinity"),
        "avg_trade_pnl_proxy":round(float(pnl.mean()),4) if len(pnl) else None,
        "segments_by_entry_time":segments,
        "strategy":{"entry":"EMA fast/slow crossover on completed candle; execute next bar open",
                    "fast_ema":a.fast_ema,"slow_ema":a.slow_ema,
                    "tp":"Exit long on confirmed bearish RSI divergence; exit short on confirmed bullish RSI divergence",
                    "divergence":"price swing high/low vs RSI swing high/low; pivots confirmed after right bars to avoid look-ahead",
                    "rsi_period":a.rsi_period,"pivot_left":a.pivot_left,"pivot_right":a.pivot_right,"max_pivot_gap_bars":a.max_pivot_gap,
                    "protective_sl":"ATR-based stop at 2x ATR (risk control; no fixed take-profit target)",
                    "atr_period":a.atr_period,"sl_atr":a.sl_atr,"risk_pct":a.risk_pct},
        "costs":{"per_bar_spread":"uses the input spread column; external supplement spread is estimated from ask-open minus bid-open, broker section uses MT5 spread points; non-positive spread replaced with median positive spread (or 30 points if unavailable)",
                 "slippage_points_each_fill":a.slippage_points,"commission":"not modeled","swap":"not modeled"},
        "broker_spec_reference":meta.get("broker_spec",{}),
        "caveats":["This input may be mixed-source: external XAUUSD spot candles supplement MT5 XAUUSDc broker history. Full date-span coverage does not make the external segment broker-native; see input metadata and source column.",
                   "P/L and position sizing use abstract whole gold units as a research proxy; they are NOT broker lot sizing or reliable account-currency valuation.",
                   "RSI divergence is pivot-based and only recognized after the right-hand confirmation bars; this introduces detection delay by design.",
                   "Bar-level OHLC simulation cannot reconstruct exact tick order; if stop is hit intrabar it is filled at stop price with spread/slippage approximation.",
                   "Commission and swap are omitted; results are not proof of future profitability.",
                   "Out-of-sample period is chronological and was not used to tune parameters.",
                   "No MT5 order APIs, live-trading flags, EA settings or production order path are modified."],
        "trades_csv":str(trade_path.resolve())
    }
    rp = out/"ema_crossover_rsi_divergence_report.json"
    rp.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(report,indent=2,ensure_ascii=False))
    print("REPORT="+str(rp.resolve()))
    print("TRADES="+str(trade_path.resolve()))

if __name__ == "__main__":
    main()
