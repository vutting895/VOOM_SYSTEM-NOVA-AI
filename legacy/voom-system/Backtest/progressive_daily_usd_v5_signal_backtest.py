from pathlib import Path
import json
import pandas as pd
import numpy as np

ROOT = Path(r"C:\Users\Administrator\Documents\Voom_system")
DATA = ROOT / "Backtest" / "data" / "XAUUSDc_M15_20211023_20261023_hybrid.csv"
OUT = ROOT / "Backtest" / "results" / "progressive_daily_usd_v5_signal"
OUT.mkdir(parents=True, exist_ok=True)

LOOKBACK = 20
MIN_FVG_POINTS = 50.0
POINT = 0.01
EMA_PERIOD = 200

df = pd.read_csv(DATA)
required = {"time", "open", "high", "low", "close", "source"}
missing = sorted(required - set(df.columns))
if missing:
    raise SystemExit(f"Missing required columns: {missing}")
df["time"] = pd.to_datetime(df["time"], utc=True, errors="coerce")
df = df.dropna(subset=["time", "open", "high", "low", "close"]).sort_values("time")
df = df.drop_duplicates("time", keep="last").reset_index(drop=True)
for c in ["open", "high", "low", "close"]:
    df[c] = pd.to_numeric(df[c], errors="coerce")
df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)

# Reconstruct H1 from complete four-bar M15 hours; not native H1 rates.
indexed = df.set_index("time")
hourly = indexed.resample("1h", label="left", closed="left").agg(
    open=("open", "first"), high=("high", "max"), low=("low", "min"),
    close=("close", "last"), count=("close", "count"))
hourly = hourly[hourly["count"] == 4].copy()
hourly["ema200"] = hourly["close"].ewm(span=EMA_PERIOD, adjust=False, min_periods=EMA_PERIOD).mean()

# At next M15 bar open, use the last fully completed H1 candle (shift 1).
current_bar_time = df["time"] + pd.Timedelta(minutes=15)
last_completed_h1_time = current_bar_time.dt.floor("1h") - pd.Timedelta(hours=1)
df["htf_ema200"] = last_completed_h1_time.map(hourly["ema200"])

n = len(df)
prior_low = np.full(n, np.nan)
prior_high = np.full(n, np.nan)
lows = df["low"].to_numpy(dtype=float)
highs = df["high"].to_numpy(dtype=float)
close = df["close"].to_numpy(dtype=float)
ema = df["htf_ema200"].to_numpy(dtype=float)
for i in range(LOOKBACK, n):
    prior_low[i] = np.min(lows[i-LOOKBACK:i])
    prior_high[i] = np.max(highs[i-LOOKBACK:i])

sweep_low = (lows < prior_low) & (close > prior_low)
sweep_high = (highs > prior_high) & (close < prior_high)
bull_gap = np.full(n, np.nan)
bear_gap = np.full(n, np.nan)
bull_fvg = np.zeros(n, dtype=bool)
bear_fvg = np.zeros(n, dtype=bool)
for i in range(2, n):
    bull_gap[i] = (lows[i] - highs[i-2]) / POINT
    bear_gap[i] = (lows[i-2] - highs[i]) / POINT
    bull_fvg[i] = bull_gap[i] >= MIN_FVG_POINTS
    bear_fvg[i] = bear_gap[i] >= MIN_FVG_POINTS

trend_up = np.isfinite(ema) & (close > ema)
trend_down = np.isfinite(ema) & (close < ema)
buy = trend_up & sweep_low & bull_fvg
sell = trend_down & sweep_high & bear_fvg
recent_sweep_bars = 3
recent_bullish_sweep = np.zeros(n, dtype=bool)
recent_bearish_sweep = np.zeros(n, dtype=bool)
for i in range(recent_sweep_bars, n):
    recent_bullish_sweep[i] = bool(np.any(sweep_low[i-recent_sweep_bars:i]))
    recent_bearish_sweep[i] = bool(np.any(sweep_high[i-recent_sweep_bars:i]))
# Diagnostic-only alternative: require the sweep in one of the prior 3 closed bars,
# with the FVG and HTF trend on the current closed bar. This does not change the EA.
buy_recent_sweep = trend_up & recent_bullish_sweep & bull_fvg
sell_recent_sweep = trend_down & recent_bearish_sweep & bear_fvg
component_counts = {
    "bullish_sweep_bars": int(sweep_low.sum()),
    "bearish_sweep_bars": int(sweep_high.sum()),
    "bullish_fvg_bars": int(bull_fvg.sum()),
    "bearish_fvg_bars": int(bear_fvg.sum()),
    "uptrend_bars_with_ema": int(trend_up.sum()),
    "downtrend_bars_with_ema": int(trend_down.sum()),
    "buy_confluence_same_bar": int(buy.sum()),
    "sell_confluence_same_bar": int(sell.sum()),
}

df["trend_ema200"] = np.where(trend_up, "UP", np.where(trend_down, "DOWN", "UNAVAILABLE_OR_EQUAL"))
df["sweep_low"] = sweep_low
df["sweep_high"] = sweep_high
df["bull_fvg_gap_points"] = bull_gap
df["bear_fvg_gap_points"] = bear_gap
df["structural_signal"] = np.where(buy, "BUY", np.where(sell, "SELL", ""))

signals = df.loc[buy | sell, [
    "time", "open", "high", "low", "close", "source", "htf_ema200",
    "trend_ema200", "sweep_low", "sweep_high", "bull_fvg_gap_points",
    "bear_fvg_gap_points", "structural_signal"]].copy()
signals["year"] = signals["time"].dt.year
signals.to_csv(OUT / "structural_signals.csv", index=False)

source_counts = df.groupby("source").size().to_dict()
by_source = signals.groupby(["source", "structural_signal"]).size().to_dict()
by_year = signals.groupby(["year", "structural_signal"]).size().to_dict()
by_year_json = {}
for (year, direction), count in by_year.items():
    by_year_json.setdefault(str(year), {})[direction] = int(count)

report = {
    "title": "VOOM Progressive Daily USD v5.0 structural signal audit",
    "mode": "signal-count only; no trade/PnL simulation",
    "dataset": str(DATA),
    "dataset_type": "mixed-source M15 research data; external spot XAUUSD supplement is not broker-native XAUUSDc",
    "bars": int(len(df)),
    "start_utc": df["time"].iloc[0].isoformat(),
    "end_utc": df["time"].iloc[-1].isoformat(),
    "source_bar_counts": {str(k): int(v) for k, v in source_counts.items()},
    "parameters": {"chart_timeframe": "M15", "higher_timeframe": "H1 reconstructed from M15",
                   "ema_period": EMA_PERIOD, "sweep_lookback_bars": LOOKBACK,
                   "minimum_fvg_points": MIN_FVG_POINTS, "point_size_assumption": POINT},
    "component_counts": component_counts,
    "signals": {"total": int(len(signals)), "buy": int(buy.sum()), "sell": int(sell.sum()),
                "per_year": by_year_json,
                "by_source_and_direction": {f"{source}|{direction}": int(count)
                                            for (source, direction), count in by_source.items()}},
    "limitations": [
        "Tick velocity cannot be evaluated from M15 OHLC bars; counts are structural candidates before the tick-event gate.",
        "No Order Block detector exists in the source; only three-candle FVG is evaluated.",
        "No entries/exits/SL/TP/daily target/loss guard/spread/slippage/commission are simulated; no P/L, win rate, profit factor or drawdown is claimed.",
        "H1 EMA is reconstructed from complete groups of four M15 bars, not native H1 history; EMA initialization and bar availability may differ from MT5.",
        "Dataset mixes broker-native XAUUSDc with an external XAUUSD segment; the external segment is exploratory only.",
        "This is an independent structural approximation, not a bit-for-bit MT5 replay."
    ],
    "orders_sent": False, "live_trading_enabled_or_changed": False
}
(OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
lines = [
    "# VOOM Progressive Daily USD v5.0 — Structural Signal Count", "",
    "Generated by Backtest/progressive_daily_usd_v5_signal_backtest.py.", "",
    "## Scope",
    f"- Bars analyzed: {len(df):,}",
    f"- Period: {report['start_utc']} to {report['end_utc']}",
    f"- BUY structural candidates: {int(buy.sum()):,}",
    f"- SELL structural candidates: {int(sell.sum()):,}",
    f"- Total structural candidates: {len(signals):,}",
    f"- Bullish sweep bars: {component_counts['bullish_sweep_bars']:,}; bullish FVG bars: {component_counts['bullish_fvg_bars']:,}",
    f"- Bearish sweep bars: {component_counts['bearish_sweep_bars']:,}; bearish FVG bars: {component_counts['bearish_fvg_bars']:,}", "",
    "## Interpretation",
    "These are not confirmed EA signals because M15 OHLC data cannot reproduce the configured tick-event velocity gate. No financial performance metrics are calculated.",
    "", "## Limitations"]
lines += [f"- {x}" for x in report["limitations"]]
lines += ["", "## By year", "", "| Year | BUY candidates | SELL candidates | Total |",
          "|---:|---:|---:|---:|"]
for year in sorted(by_year_json):
    d = by_year_json[year]
    b, s = d.get("BUY", 0), d.get("SELL", 0)
    lines.append(f"| {year} | {b} | {s} | {b+s} |")
lines += ["", "No orders sent. No live settings changed.", ""]
(OUT / "report.md").write_text("\n".join(lines), encoding="utf-8")
print(json.dumps({"status": "completed", "report_json": str(OUT / "report.json"),
                  "report_markdown": str(OUT / "report.md"),
                  "signals_csv": str(OUT / "structural_signals.csv"),
                  "bars": len(df), "buy_candidates": int(buy.sum()),
                  "sell_candidates": int(sell.sum()), "total_candidates": int(len(signals)),
                  "orders_sent": False}, indent=2))
