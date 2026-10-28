"""Isolated, paper-only Source 1 historical backtest. Does not send orders."""
from __future__ import annotations
import argparse, json, math, sys
from pathlib import Path
import pandas as pd
from main_bot_v62_best import MeanReversionEngine, BEST_CONFIG

DEFAULT_CSV = Path(r"C:\Program Files\AI_Bridge\GOLD_M15_3mo_20260721_20261021.csv")
OUT_DIR = Path(__file__).resolve().parents[1] / "Reports" / "source1_backtest"

def load_history(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    required = {"time", "open", "high", "low", "close", "tick_volume", "spread"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {sorted(missing)}")
    df["time"] = pd.to_datetime(df["time"], utc=True, errors="coerce")
    for col in ["open", "high", "low", "close", "tick_volume", "spread"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["time","open","high","low","close","spread"]).sort_values("time")
    valid = (df["high"] >= df[["open","close","low"]].max(axis=1)) & (df["low"] <= df[["open","close","high"]].min(axis=1))
    df = df.loc[valid].drop_duplicates("time").reset_index(drop=True)
    if len(df) < 300:
        raise ValueError(f"Only {len(df)} valid candles; need at least 300")
    return df

def max_drawdown_pct(equity: list[float]) -> float:
    peak = -float("inf")
    worst = 0.0
    for value in equity:
        peak = max(peak, value)
        if peak > 0:
            worst = max(worst, (peak - value) / peak * 100.0)
    return worst

def run_period(df: pd.DataFrame, start_idx: int, end_idx: int, label: str,
               initial_equity: float = 10000.0, spread_point: float = 0.01,
               max_hold_bars: int = 96) -> tuple[dict, list[dict], list[float]]:
    engine = MeanReversionEngine()
    # Keep Source 1 unchanged: inject the simulated candle timestamp only into this engine instance.
    engine.check_session = lambda: (
        7 <= simulated_time.hour <= 16 or 12 <= simulated_time.hour <= 21
    )
    equity = initial_equity
    curve = [equity]
    trades: list[dict] = []
    i = max(start_idx, 100)
    while i < end_idx - 1:
        if i < start_idx:
            i += 1
            continue
        window_start = max(0, i - 199)
        hist = df.iloc[window_start:i+1].copy()
        prev_close = hist["close"].shift(1)
        tr = pd.concat([
            hist["high"] - hist["low"],
            (hist["high"] - prev_close).abs(),
            (hist["low"] - prev_close).abs()
        ], axis=1).max(axis=1)
        hist["atr"] = tr.ewm(alpha=1/14, adjust=False).mean()
        simulated_time = df.iloc[i]["time"].to_pydatetime()
        try:
            signal = engine.generate("GOLD", hist, dl_score=0.0)
        except (IndexError, KeyError, TypeError, ValueError, ZeroDivisionError):
            signal = None
        if signal is None:
            i += 1
            continue

        # Signal only known after candle i closes; fill at candle i+1 open.
        entry_bar = i + 1
        row = df.iloc[entry_bar]
        spread_price = max(0.0, float(row["spread"])) * spread_point
        is_long = signal.side == "LONG"
        entry = float(row["open"]) + (spread_price if is_long else 0.0)
        sl, tp1, tp2 = float(signal.sl), float(signal.tp1), float(signal.tp2)
        risk = abs(float(signal.entry) - sl)
        if not all(math.isfinite(x) for x in [entry, sl, tp1, tp2, risk]) or risk <= 0:
            i += 1
            continue
        # Risk-normalized reporting (not a broker lot-size / cash P&L simulation).
        remaining = 1.0
        realized_r = 0.0
        tp1_hit = False
        exit_reason = "TIME_EXIT"
        exit_idx = min(entry_bar + max_hold_bars, end_idx - 1)
        j = entry_bar
        while j <= exit_idx:
            bar = df.iloc[j]
            hi, lo = float(bar["high"]), float(bar["low"])
            bar_spread = max(0.0, float(bar["spread"])) * spread_point
            # Candles are treated as bid OHLC. Convert short-side stop/target tests to ask prices.
            # Conservative tie-break: if stop and target are both touched, count stop first.
            stop_hit = (lo <= sl) if is_long else (hi + bar_spread >= sl)
            tp2_hit = (hi >= tp2) if is_long else (lo + bar_spread <= tp2)
            tp1_touch = (hi >= tp1) if is_long else (lo + bar_spread <= tp1)
            if stop_hit:
                bar_spread = max(0.0, float(bar["spread"])) * spread_point
                exit_price = sl if is_long else sl + bar_spread
                realized_r += remaining * ((exit_price - entry) / risk if is_long else (entry - exit_price) / risk)
                exit_reason = "SL" if not tp1_hit else "SL_AFTER_TP1"
                break
            if tp1_touch and not tp1_hit:
                bar_spread = max(0.0, float(bar["spread"])) * spread_point
                tp1_fill = tp1 if is_long else tp1 + bar_spread
                realized_r += 0.5 * ((tp1_fill - entry) / risk if is_long else (entry - tp1_fill) / risk)
                remaining = 0.5
                tp1_hit = True
            if tp2_hit:
                bar_spread = max(0.0, float(bar["spread"])) * spread_point
                exit_price = tp2 if is_long else tp2 + bar_spread
                realized_r += remaining * ((exit_price - entry) / risk if is_long else (entry - exit_price) / risk)
                remaining = 0.0
                exit_reason = "TP2"
                break
            if j == exit_idx:
                bar_spread = max(0.0, float(bar["spread"])) * spread_point
                exit_price = float(bar["close"]) if is_long else float(bar["close"]) + bar_spread
                realized_r += remaining * ((exit_price - entry) / risk if is_long else (entry - exit_price) / risk)
                break
            j += 1
        # If a position survives to the boundary, mark it to the last in-period close and don't cross split.
        pnl_r = realized_r
        equity += pnl_r * float(BEST_CONFIG["RISK_PCT"]) * (equity if equity > 0 else initial_equity)
        curve.append(equity)
        trades.append({
            "split": label, "signal_time_utc": df.iloc[i]["time"].isoformat(),
            "entry_time_utc": df.iloc[entry_bar]["time"].isoformat(),
            "exit_time_utc": df.iloc[min(j, exit_idx)]["time"].isoformat(),
            "side": signal.side, "entry": round(entry, 5), "sl": round(sl, 5),
            "tp1": round(tp1, 5), "tp2": round(tp2, 5), "confluence": int(signal.confluence),
            "score": round(float(signal.score), 5), "exit_reason": exit_reason,
            "tp1_hit": tp1_hit, "r_multiple_net_estimate": round(pnl_r, 5),
            "spread_points_assumed": float(row["spread"]), "execution": "SIMULATED_ONLY"
        })
        # One position at a time, no overlapping signals.
        i = max(i + 1, min(j + 1, end_idx))
    winners = [t for t in trades if t["r_multiple_net_estimate"] > 0]
    losers = [t for t in trades if t["r_multiple_net_estimate"] < 0]
    gross_win = sum(t["r_multiple_net_estimate"] for t in winners)
    gross_loss = abs(sum(t["r_multiple_net_estimate"] for t in losers))
    summary = {
        "split": label, "bars_in_period": max(0, end_idx-start_idx),
        "trades": len(trades), "wins": len(winners), "losses": len(losers),
        "win_rate_pct": round(100*len(winners)/len(trades), 2) if trades else 0.0,
        "profit_factor_r": round(gross_win/gross_loss, 4) if gross_loss else (None if gross_win == 0 else "Infinity"),
        "net_r_estimate": round(sum(t["r_multiple_net_estimate"] for t in trades), 4),
        "max_drawdown_equity_curve_pct": round(max_drawdown_pct(curve), 4),
        "initial_equity_reference": initial_equity,
        "final_equity_reference": round(equity, 2),
        "cash_pnl_status": "NOT_CALCULATED: contract size, account currency conversion, commissions and precise broker fill model not verified"
    }
    return summary, trades, curve

def main():
    parser = argparse.ArgumentParser(description="Source 1 paper-only historical backtest")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--spread-point", type=float, default=0.01,
                        help="Price units per CSV spread point; verify against broker contract specs")
    parser.add_argument("--initial-equity", type=float, default=10000.0)
    parser.add_argument("--output-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    if args.spread_point < 0 or args.initial_equity <= 0:
        parser.error("spread-point must be >=0 and initial-equity >0")
    df = load_history(args.csv)
    # Chronological 70/30 split; the OOS section remains later in time and is not shuffled.
    split = int(len(df) * 0.70)
    train_summary, train_trades, train_curve = run_period(df, 100, split, "in_sample", args.initial_equity, args.spread_point)
    oos_summary, oos_trades, oos_curve = run_period(df, split, len(df), "out_of_sample", args.initial_equity, args.spread_point)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "report_type": "Source1 exploratory backtest",
        "strategy": "Mean Rejection SMC Wave v6.2",
        "paper_only": True, "live_trading_enabled": False, "orders_sent": False,
        "risk_guard_enforced": False,
        "source_file": str(args.csv), "data_rows": len(df),
        "data_start_utc": df["time"].iloc[0].isoformat(), "data_end_utc": df["time"].iloc[-1].isoformat(),
        "timeframe": "M15 (source filename/data context)", "split_method": "chronological 70/30",
        "config": BEST_CONFIG, "spread_point_price_assumption": args.spread_point,
        "warnings": [
            ("Dataset coverage is about %.2f days; verify it against the MT5 export metadata." % ((df["time"].iloc[-1] - df["time"].iloc[0]).total_seconds() / 86400.0)),
            "Source 1 was not edited; simulated UTC session clock is injected into a separate engine instance.",
            "DL score fixed at 0 because the model is not validated; no fabricated positive score.",
            "R results are estimates; full broker execution, slippage, commission, swaps and cash P&L are not verified.",
            "Conservative stop-first rule when SL and TP are both touched in one candle.",
            "Risk Guard daily-loss and maximum-drawdown entry blocking is NOT applied in this diagnostic run; equity drawdown is unguarded.",
            "No parameter optimization, auto-approval, order execution, or live trading."
        ],
        "in_sample": train_summary, "out_of_sample": oos_summary,
        "gate_status": {
            "backtest_passed": False, "out_of_sample_passed": False,
            "demo_passed": False, "risk_review_passed": False,
            "reason": "Exploratory report only; independent review and complete broker-cost validation required."
        }
    }
    (args.output_dir / "summary.json").write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
    pd.DataFrame(train_trades + oos_trades).to_csv(args.output_dir / "trades.csv", index=False)
    pd.DataFrame([{"equity_index": n, "equity_reference": v} for n,v in enumerate(train_curve)]).to_csv(args.output_dir / "equity_in_sample.csv", index=False)
    pd.DataFrame([{"equity_index": n, "equity_reference": v} for n,v in enumerate(oos_curve)]).to_csv(args.output_dir / "equity_out_of_sample.csv", index=False)
    print(json.dumps(payload, indent=2, allow_nan=False))

if __name__ == "__main__":
    main()
