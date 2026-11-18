"""
╔══════════════════════════════════════════════════════════════════════════════╗
║         SMC MEAN REJECTION STRATEGY — QUANTITATIVE BACKTESTER               ║
║         ─────────────────────────────────────────────────────────────────── ║
║  Strategy Logic:                                                             ║
║    • 4H Timeframe  → Bias (BOS/CHoCH) + Wave Direction + OB/FVG Zones       ║
║    • 5M Timeframe  → Entry Trigger (Price Action Rejection Candle)           ║
║    • Mean = EQ of 4H swing (50% retracement — premium/discount filter)      ║
║    • Risk per trade = 1% of equity                                           ║
║    • Target RR = 1:2.5 minimum (soft cap 1:3)                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np
import yfinance as yf
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from tabulate import tabulate
from colorama import Fore, Style, init

init(autoreset=True)

CONFIG = {
    "SYMBOL":        "BTC-USD",
    "START_DATE":    "2023-01-01",
    "END_DATE":      "2025-12-31",
    "INITIAL_EQUITY": 10_000,
    "RISK_PCT":      0.01,
    "MIN_RR":        2.5,
    "MAX_RR":        3.0,
    "SWING_LOOKBACK": 10,
    "OB_LOOKBACK":   3,
    "FVG_MIN_SIZE_PCT": 0.001,
    "SESSION_FILTER": True,
    "LONDON_OPEN":   7,
    "NY_CLOSE":      21,
}

def cprint(text, color=Fore.WHITE, bold=False):
    style = Style.BRIGHT if bold else ""
    print(f"{style}{color}{text}{Style.RESET_ALL}")

def banner():
    cprint("╔" + "═"*62 + "╗", Fore.CYAN, bold=True)
    cprint("║   SMC MEAN REJECTION STRATEGY  ─  BACKTEST ENGINE        ║", Fore.CYAN, bold=True)
    cprint("╚" + "═"*62 + "╝", Fore.CYAN, bold=True)
    print()

def fetch_data(symbol: str, start: str, end: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    cprint(f"[DATA] Downloading {symbol} from {start} to {end} ...", Fore.YELLOW)
    start_dt = pd.Timestamp(start)
    end_dt = pd.Timestamp(end)

    df_1h = yf.download(symbol, start=start, end=end, interval="1h", auto_adjust=True, progress=False)
    if not df_1h.empty:
        df_1h.columns = [c.lower() for c in df_1h.columns]
        df_1h.index = pd.to_datetime(df_1h.index, utc=True)
        df_1h = df_1h[["open", "high", "low", "close", "volume"]].dropna()

    df_4h = df_1h.resample("4h").agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna() if not df_1h.empty else pd.DataFrame()

    chunks = []
    cur = start_dt
    while cur < end_dt:
        nxt = min(cur + timedelta(days=59), end_dt)
        chunk = yf.download(symbol, start=cur.strftime("%Y-%m-%d"), end=nxt.strftime("%Y-%m-%d"), interval="5m", auto_adjust=True, progress=False)
        if not chunk.empty:
            chunk.columns = [c.lower() for c in chunk.columns]
            chunks.append(chunk)
        cur = nxt
    df_5m = pd.concat(chunks) if chunks else pd.DataFrame()
    if not df_5m.empty:
        df_5m.index = pd.to_datetime(df_5m.index, utc=True)
        df_5m = df_5m[["open", "high", "low", "close", "volume"]].dropna()
        df_5m = df_5m[~df_5m.index.duplicated(keep="first")]

    cprint(f"[DATA] 4H bars: {len(df_4h):,} | 5M bars: {len(df_5m):,}", Fore.GREEN)
    return df_4h, df_5m

def find_swing_points(df: pd.DataFrame, lookback: int = 10) -> pd.DataFrame:
    """Mark pivots only when their right-side confirmation bars have closed."""
    if isinstance(lookback, bool) or not isinstance(lookback, int) or lookback < 1:
        raise ValueError("lookback must be a positive integer")
    if not {"high", "low"}.issubset(df.columns):
        raise ValueError("dataframe must contain high and low columns")
    df = df.copy()
    df["swing_high"] = np.nan
    df["swing_low"] = np.nan
    df["swing_high_origin"] = np.nan
    df["swing_low_origin"] = np.nan
    for pivot_index in range(lookback, len(df) - lookback):
        window_h = df["high"].iloc[pivot_index - lookback : pivot_index + lookback + 1]
        window_l = df["low"].iloc[pivot_index - lookback : pivot_index + lookback + 1]
        confirmed_index = pivot_index + lookback
        if df["high"].iloc[pivot_index] == window_h.max() and (window_h == df["high"].iloc[pivot_index]).sum() == 1:
            df.iloc[confirmed_index, df.columns.get_loc("swing_high")] = df["high"].iloc[pivot_index]
            df.iloc[confirmed_index, df.columns.get_loc("swing_high_origin")] = pivot_index
        if df["low"].iloc[pivot_index] == window_l.min() and (window_l == df["low"].iloc[pivot_index]).sum() == 1:
            df.iloc[confirmed_index, df.columns.get_loc("swing_low")] = df["low"].iloc[pivot_index]
            df.iloc[confirmed_index, df.columns.get_loc("swing_low_origin")] = pivot_index
    return df

def detect_market_structure(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["bos"] = 0
    df["choch"] = 0
    df["trend"] = 0
    last_sh, last_sl, trend = np.nan, np.nan, 0

    for i in range(1, len(df)):
        if not np.isnan(df["swing_high"].iloc[i]):
            last_sh = df["swing_high"].iloc[i]
        if not np.isnan(df["swing_low"].iloc[i]):
            last_sl = df["swing_low"].iloc[i]
        close = df["close"].iloc[i]

        if not np.isnan(last_sh) and not np.isnan(last_sl):
            if close > last_sh:
                if trend == -1:
                    df.iloc[i, df.columns.get_loc("choch")] = 1
                    trend = 1
                else:
                    df.iloc[i, df.columns.get_loc("bos")] = 1
                    trend = 1
            elif close < last_sl:
                if trend == 1:
                    df.iloc[i, df.columns.get_loc("choch")] = -1
                    trend = -1
                else:
                    df.iloc[i, df.columns.get_loc("bos")] = -1
                    trend = -1
        df.iloc[i, df.columns.get_loc("trend")] = trend
    return df

def detect_order_blocks(df: pd.DataFrame, ob_lookback: int = 3) -> list:
    obs = []
    for i in range(ob_lookback + 1, len(df)):
        if df["bos"].iloc[i] == 1 or df["choch"].iloc[i] == 1:
            for j in range(i - 1, max(i - ob_lookback - 1, 0), -1):
                if df["close"].iloc[j] < df["open"].iloc[j]:
                    obs.append({
                        "type": "bullish",
                        "top": df["open"].iloc[j],
                        "bottom": df["low"].iloc[j],
                        "eq": (df["open"].iloc[j] + df["low"].iloc[j]) / 2,
                        "bar_idx": i,
                        "ts": df.index[i]
                    })
                    break
        if df["bos"].iloc[i] == -1 or df["choch"].iloc[i] == -1:
            for j in range(i - 1, max(i - ob_lookback - 1, 0), -1):
                if df["close"].iloc[j] > df["open"].iloc[j]:
                    obs.append({
                        "type": "bearish",
                        "top": df["high"].iloc[j],
                        "bottom": df["open"].iloc[j],
                        "eq": (df["high"].iloc[j] + df["open"].iloc[j]) / 2,
                        "bar_idx": i,
                        "ts": df.index[i]
                    })
                    break
    return obs

def is_rejection_candle(row: pd.Series, direction: str) -> bool:
    o, h, l, c = row["open"], row["high"], row["low"], row["close"]
    total_range = h - l
    if total_range == 0:
        return False
    body = abs(c - o)
    upper_wick = h - max(o, c)
    lower_wick = min(o, c) - l
    body_ratio = body / total_range

    if direction == "bullish":
        return lower_wick >= 2 * body and body_ratio < 0.40 and c > (h + l) / 2
    elif direction == "bearish":
        return upper_wick >= 2 * body and body_ratio < 0.40 and c < (h + l) / 2
    return False

def run_backtest(df_4h: pd.DataFrame, df_5m: pd.DataFrame, cfg: dict) -> dict:
    cprint("\n[BACKTEST] Running SMC Mean Rejection quantitative simulation...", Fore.YELLOW)
    df4 = find_swing_points(df_4h, cfg["SWING_LOOKBACK"])
    df4 = detect_market_structure(df4)
    obs = detect_order_blocks(df4, cfg["OB_LOOKBACK"])

    equity = cfg["INITIAL_EQUITY"]
    trades = []
    equity_curve = [equity]
    open_trade = None
    df4_ts = df4.index

    for i in range(2, len(df_5m)):
        ts_now = df_5m.index[i]
        bar = df_5m.iloc[i]

        if cfg["SESSION_FILTER"]:
            hour_utc = ts_now.hour
            if not (cfg["LONDON_OPEN"] <= hour_utc < cfg["NY_CLOSE"]):
                continue

        if open_trade is not None:
            d = open_trade["direction"]
            tp1 = open_trade["tp1"]
            tp2 = open_trade["tp2"]
            sl = open_trade["sl"]
            size = open_trade["size"]
            en = open_trade["entry"]

            hit_tp2 = (d == "long" and bar["high"] >= tp2) or (d == "short" and bar["low"] <= tp2)
            hit_tp1 = (d == "long" and bar["high"] >= tp1) or (d == "short" and bar["low"] <= tp1)
            hit_sl = (d == "long" and bar["low"] <= sl) or (d == "short" and bar["high"] >= sl)

            exit_price, result = None, None
            # OHLC bars do not reveal intrabar event order. If a bar touches
            # both stop and target, assume the adverse stop was reached first.
            if hit_sl:
                exit_price = sl
                pnl = size * (sl - en) if d == "long" else size * (en - sl)
                result = "SL"
            elif hit_tp1:
                # TP1 is the first target. A single bar spanning TP1 and TP2
                # cannot prove the path, so do not award the more favorable TP2.
                exit_price = tp1
                pnl = size * (tp1 - en) if d == "long" else size * (en - tp1)
                result = "TP1"

            if exit_price is not None:
                equity += pnl
                equity_curve.append(equity)
                open_trade["exit_ts"] = ts_now
                open_trade["exit_price"] = exit_price
                open_trade["pnl"] = pnl
                open_trade["result"] = result
                open_trade["equity"] = equity
                open_trade["rr_actual"] = abs(exit_price - en) / abs(en - sl)
                trades.append(open_trade)
                open_trade = None
        else:
            # Look for entry
            h4_idx = df4_ts.searchsorted(ts_now, side="right") - 1
            if h4_idx < 0:
                continue
            h4_row = df4.iloc[h4_idx]
            trend = h4_row["trend"]

            # Check if price is inside recent bullish/bearish OB
            price = bar["close"]
            # Exclude order blocks discovered after this 5M bar.
            recent_obs = [ob for ob in obs if ob["ts"] <= ts_now][-10:]
            for ob in recent_obs:
                if ob["type"] == "bullish" and trend == 1:
                    if ob["bottom"] <= price <= ob["top"] and is_rejection_candle(bar, "bullish"):
                        sl = ob["bottom"] - (ob["top"] - ob["bottom"]) * 0.2
                        en = bar["close"]
                        if en > sl:
                            risk_amt = equity * cfg["RISK_PCT"]
                            size = risk_amt / (en - sl)
                            sl_dist = en - sl
                            tp1 = en + sl_dist * cfg["MIN_RR"]
                            tp2 = en + sl_dist * cfg["MAX_RR"]
                            open_trade = {
                                "direction": "long",
                                "entry_ts": ts_now,
                                "entry": en,
                                "sl": sl,
                                "tp1": tp1,
                                "tp2": tp2,
                                "size": size
                            }
                            break
                elif ob["type"] == "bearish" and trend == -1:
                    if ob["bottom"] <= price <= ob["top"] and is_rejection_candle(bar, "bearish"):
                        sl = ob["top"] + (ob["top"] - ob["bottom"]) * 0.2
                        en = bar["close"]
                        if sl > en:
                            risk_amt = equity * cfg["RISK_PCT"]
                            size = risk_amt / (sl - en)
                            sl_dist = sl - en
                            tp1 = en - sl_dist * cfg["MIN_RR"]
                            tp2 = en - sl_dist * cfg["MAX_RR"]
                            open_trade = {
                                "direction": "short",
                                "entry_ts": ts_now,
                                "entry": en,
                                "sl": sl,
                                "tp1": tp1,
                                "tp2": tp2,
                                "size": size
                            }
                            break

    return {"trades": trades, "equity_curve": equity_curve, "final_equity": equity}

def print_performance(results: dict, cfg: dict):
    trades = results["trades"]
    eq_curve = results["equity_curve"]
    final_eq = results["final_equity"]
    initial_eq = cfg["INITIAL_EQUITY"]

    total_trades = len(trades)
    if total_trades == 0:
        cprint("[RESULT] No trades executed during backtest period.", Fore.RED)
        return

    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    win_rate = len(wins) / total_trades * 100
    net_profit = final_eq - initial_eq
    net_profit_pct = (net_profit / initial_eq) * 100

    peak = initial_eq
    max_dd = 0
    for eq in eq_curve:
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak * 100
        if dd > max_dd:
            max_dd = dd

    gross_profit = sum(t["pnl"] for t in wins) if wins else 0
    gross_loss = abs(sum(t["pnl"] for t in losses)) if losses else 1
    profit_factor = gross_profit / gross_loss

    summary_table = [
        ["Initial Equity", f"${initial_eq:,.2f}"],
        ["Final Equity", f"${final_eq:,.2f}"],
        ["Net Profit", f"${net_profit:,.2f} ({net_profit_pct:+.2f}%)"],
        ["Total Trades", total_trades],
        ["Win Rate", f"{win_rate:.2f}%"],
        ["Profit Factor", f"{profit_factor:.2f}"],
        ["Max Drawdown", f"-{max_dd:.2f}%"],
    ]

    banner()
    cprint(tabulate(summary_table, headers=["Metric", "Value"], tablefmt="fancy_grid"), Fore.CYAN)

if __name__ == "__main__":
    banner()
    df_4h, df_5m = fetch_data(CONFIG["SYMBOL"], CONFIG["START_DATE"], CONFIG["END_DATE"])
    if not df_4h.empty and not df_5m.empty:
        results = run_backtest(df_4h, df_5m, CONFIG)
        print_performance(results, CONFIG)
    else:
        cprint("[ERROR] Failed to fetch valid market data from yfinance.", Fore.RED)
