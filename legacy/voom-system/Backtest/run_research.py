# -*- coding: utf-8 -*-
"""Offline, no-orders research benchmark for GOLD M15."""
from pathlib import Path
import json
import math
import warnings
import numpy as np
import pandas as pd
from backtesting import Backtest, Strategy

BASE = Path(__file__).resolve().parent.parent
CSV = BASE / "GOLD_M15_3mo_20260721_20261021.csv"
OUT = Path(__file__).resolve().parent / "research_report.json"
TRADES_OUT = Path(__file__).resolve().parent / "research_trades.csv"
INITIAL_CASH = 10_000.0  # research normalization only; not the live account balance


def ema(a, n):
    return pd.Series(a).ewm(span=n, adjust=False).mean().to_numpy()


def atr(high, low, close, n=14):
    h, l, c = pd.Series(high), pd.Series(low), pd.Series(close)
    pc = c.shift(1)
    tr = pd.concat([h-l, (h-pc).abs(), (l-pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/n, adjust=False).mean().to_numpy()


def rsi(close, n=14):
    c = pd.Series(close)
    d = c.diff()
    gain = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean().replace(0, np.nan)
    return (100 - 100/(1 + gain/loss)).fillna(50).to_numpy()


class EMARsiAtr(Strategy):
    fast = 20
    slow = 50
    rsi_period = 14
    atr_period = 14
    sl_atr = 2.0
    tp_atr = 2.0
    risk_fraction = 0.0025

    def init(self):
        self.ema_fast = self.I(ema, self.data.Close, self.fast)
        self.ema_slow = self.I(ema, self.data.Close, self.slow)
        self.rsi_v = self.I(rsi, self.data.Close, self.rsi_period)
        self.atr_v = self.I(atr, self.data.High, self.data.Low, self.data.Close, self.atr_period)

    def next(self):
        price = float(self.data.Close[-1])
        av = float(self.atr_v[-1])
        if not np.isfinite(av) or av <= 0 or self.position:
            return
        stop_dist = av * self.sl_atr
        # One unit is treated as approximately one ounce for a research proxy only.
        risk_cash = self.equity * self.risk_fraction
        units = math.floor(risk_cash / stop_dist)
        if units < 1:
            return
        ef, es, rv = float(self.ema_fast[-1]), float(self.ema_slow[-1]), float(self.rsi_v[-1])
        if ef > es and price > ef and 50 <= rv <= 72:
            self.buy(size=units, sl=price-stop_dist, tp=price+av*self.tp_atr)
        elif ef < es and price < ef and 28 <= rv <= 50:
            self.sell(size=units, sl=price+stop_dist, tp=price-av*self.tp_atr)


def main():
    if not CSV.exists():
        raise FileNotFoundError(f"Missing historical data: {CSV}")
    raw = pd.read_csv(CSV)
    needed = {"time", "open", "high", "low", "close", "spread"}
    if not needed.issubset(raw.columns) or len(raw) < 1000:
        raise ValueError("Historical CSV missing required columns or too few bars")
    raw["time"] = pd.to_datetime(raw["time"], utc=True).dt.tz_convert(None)
    raw = raw.sort_values("time").drop_duplicates("time").set_index("time")
    split = int(len(raw) * 0.8)
    train, test = raw.iloc[:split].copy(), raw.iloc[split:].copy()
    med_spread_points = float(train["spread"].median())
    med_close = float(train["close"].median())
    spread_rate = max(0.0, med_spread_points * 0.01 / med_close)
    data = test.rename(columns={"open":"Open", "high":"High", "low":"Low", "close":"Close", "tick_volume":"Volume"})
    data = data[["Open", "High", "Low", "Close"] + (["Volume"] if "Volume" in data else [])].astype(float)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        bt = Backtest(data, EMARsiAtr, cash=INITIAL_CASH, spread=spread_rate,
                      commission=0.0, exclusive_orders=True, finalize_trades=True)
        stats = bt.run()
    trades = stats["_trades"]
    trades.to_csv(TRADES_OUT, index=False)
    keys = ["Return [%]", "Equity Final [$]", "Max. Drawdown [%]", "# Trades", "Win Rate [%]", "Profit Factor", "Sharpe Ratio"]
    metrics = {}
    for k in keys:
        v = stats[k]
        metrics[k] = float(v) if isinstance(v, (int,float,np.integer,np.floating)) and np.isfinite(v) else None
    report = {
        "status": "research-only; no orders sent", "symbol": "GOLD", "timeframe": "M15",
        "csv_start_utc": str(raw.index.min()), "csv_end_utc": str(raw.index.max()),
        "bars_total": int(len(raw)), "development_bars_80pct": int(len(train)),
        "holdout_bars_20pct": int(len(test)), "holdout_start_utc": str(test.index.min()),
        "holdout_end_utc": str(test.index.max()), "initial_cash_normalized": INITIAL_CASH,
        "median_training_spread_points": med_spread_points, "spread_rate_proxy": spread_rate,
        "strategy": "EMA20/EMA50 trend + RSI14 band + ATR14 SL/TP; risk fraction 0.25%; integer units proxy",
        "parameters": {"fast_ema":20,"slow_ema":50,"rsi_period":14,"atr_period":14,"sl_atr":2.0,"tp_atr":2.0,"risk_fraction":0.0025},
        "metrics": metrics, "trade_rows": int(len(trades)),
        "caveats": ["Illustrative EMA/RSI baseline, not the production RandomForest/SMC strategy.",
          "Backtesting.py uses a fixed spread rate; it does not model each historical spread change.",
          "Commission, slippage, swap, tick-level stop ordering, MT5 broker volume rules, and daily account-wide P/L guard are not modeled.",
          "Whole units are only a rough gold exposure proxy and are not equivalent to broker lot sizing.",
          "No parameter optimization was run on the holdout. Results are not evidence of future profitability."]
    }
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"REPORT={OUT}")
    print(f"TRADES={TRADES_OUT}")

if __name__ == "__main__":
    main()
