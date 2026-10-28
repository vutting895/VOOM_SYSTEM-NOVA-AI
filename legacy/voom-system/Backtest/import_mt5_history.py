# -*- coding: utf-8 -*-
"""Read-only MT5 historical OHLCV/spread importer. This module never sends orders."""
from __future__ import annotations
import argparse, json, os, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pandas as pd

TF_NAMES = {
    "M1": "TIMEFRAME_M1", "M2": "TIMEFRAME_M2", "M3": "TIMEFRAME_M3",
    "M4": "TIMEFRAME_M4", "M5": "TIMEFRAME_M5", "M6": "TIMEFRAME_M6",
    "M10": "TIMEFRAME_M10", "M12": "TIMEFRAME_M12", "M15": "TIMEFRAME_M15",
    "M20": "TIMEFRAME_M20", "M30": "TIMEFRAME_M30", "H1": "TIMEFRAME_H1",
    "H2": "TIMEFRAME_H2", "H3": "TIMEFRAME_H3", "H4": "TIMEFRAME_H4",
    "H6": "TIMEFRAME_H6", "H8": "TIMEFRAME_H8", "H12": "TIMEFRAME_H12",
    "D1": "TIMEFRAME_D1", "W1": "TIMEFRAME_W1", "MN1": "TIMEFRAME_MN1",
}
ROOT = Path(__file__).resolve().parent
DEFAULT_MT5 = os.getenv("MT5_PATH", r"C:\Program Files\HFM Metatrader 5\terminal64.exe")

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--symbol", default="XAUUSDc", help="Exact broker symbol, e.g. XAUUSDc or GOLD")
    p.add_argument("--timeframe", default="M15", choices=sorted(TF_NAMES))
    p.add_argument("--years", type=float, default=3.0)
    p.add_argument("--start", help="UTC ISO date/time, overrides --years (YYYY-MM-DD)")
    p.add_argument("--end", help="UTC ISO date/time, defaults to current UTC time")
    p.add_argument("--terminal", default=DEFAULT_MT5, help="Path to terminal64.exe; can also use an already-running default terminal")
    p.add_argument("--output-dir", default=str(ROOT / "data"))
    p.add_argument("--allow-short-history", action="store_true", help="Save partial data instead of failing the 3-year coverage check")
    args = p.parse_args()

    try:
        import MetaTrader5 as mt5
    except ImportError:
        sys.exit("MetaTrader5 package is missing. Install it in the Python environment used by this script.")
    end = pd.to_datetime(args.end, utc=True) if args.end else pd.Timestamp.now(tz="UTC")
    start = pd.to_datetime(args.start, utc=True) if args.start else end - pd.Timedelta(days=365.25 * args.years)
    if start >= end:
        sys.exit("--start must be earlier than --end")
    terminal = args.terminal.strip().strip('"')
    initialized = mt5.initialize(path=terminal) if terminal and Path(terminal).exists() else mt5.initialize()
    if not initialized:
        sys.exit(f"MT5 initialize failed: {mt5.last_error()}. Open the broker terminal and verify --terminal/MT5_PATH.")
    try:
        if not mt5.symbol_select(args.symbol, True):
            sys.exit(f"Cannot select symbol {args.symbol}: {mt5.last_error()}. Use the exact broker symbol name.")
        info = mt5.symbol_info(args.symbol)
        if info is None:
            sys.exit(f"symbol_info unavailable for {args.symbol}")
        account = mt5.account_info()
        account_currency = str(getattr(account, "currency", "UNKNOWN")) if account else "UNKNOWN"
        tf = getattr(mt5, TF_NAMES[args.timeframe])
        # Fetch bounded windows: some terminals reject very large single range requests.
        chunks = []
        cursor = start
        while cursor < end:
            chunk_end = min(cursor + pd.Timedelta(days=90), end)
            part = mt5.copy_rates_range(args.symbol, tf, cursor.to_pydatetime(), chunk_end.to_pydatetime())
            if part is None:
                err = mt5.last_error()
                sys.exit(f"MT5 history request failed for {cursor} to {chunk_end}: {err}. Open/load chart history and retry.")
            if len(part): chunks.append(pd.DataFrame(part))
            cursor = chunk_end
        if not chunks:
            sys.exit(f"No historical bars returned: {mt5.last_error()}. Open chart/load history, then retry.")
        df = pd.concat(chunks, ignore_index=True)
        downloaded_rows = len(df)
        df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
        df = df.rename(columns={"tick_volume": "tick_volume"})
        required = ["time", "open", "high", "low", "close", "tick_volume", "spread", "real_volume"]
        for col in required:
            if col not in df:
                df[col] = 0
        df = df[required].sort_values("time").drop_duplicates("time").reset_index(drop=True)
        numeric = ["open", "high", "low", "close", "tick_volume", "spread", "real_volume"]
        df[numeric] = df[numeric].apply(pd.to_numeric, errors="coerce")
        df = df.dropna(subset=["open", "high", "low", "close"])
        bad = (df["high"] < df[["open", "close", "low"]].max(axis=1)) | (df["low"] > df[["open", "close", "high"]].min(axis=1))
        if bad.any():
            sys.exit(f"OHLC validation failed: {int(bad.sum())} invalid rows")
        actual_start, actual_end = df["time"].min(), df["time"].max()
        coverage_days = (actual_end - actual_start).total_seconds() / 86400
        expected_days = (end - start).total_seconds() / 86400
        coverage_ratio = coverage_days / expected_days if expected_days else 0
        # A weekend/session gap is normal. This is a date-coverage check, not a claim that every minute exists.
        if coverage_ratio < 0.95 and not args.allow_short_history:
            sys.exit(
                f"Only {coverage_days:.1f}/{expected_days:.1f} days of requested date coverage ({coverage_ratio:.1%}). "
                "No backtest was launched. Load more broker history or pass --allow-short-history to save partial data."
            )
        outdir = Path(args.output_dir).resolve()
        outdir.mkdir(parents=True, exist_ok=True)
        safe_symbol = "".join(c if c.isalnum() or c in "-_" else "_" for c in args.symbol)
        stem = f"{safe_symbol}_{args.timeframe}_{start:%Y%m%d}_{end:%Y%m%d}"
        csv_path = outdir / f"{stem}.csv"
        meta_path = outdir / f"{stem}.meta.json"
        df.assign(time=df["time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")).to_csv(csv_path, index=False)
        meta = {
            "source": "MetaTrader5.copy_rates_range", "read_only": True, "orders_sent": False,
            "symbol": args.symbol, "timeframe": args.timeframe, "account_currency": account_currency,
            "requested_start_utc": start.isoformat(), "requested_end_utc": end.isoformat(),
            "actual_start_utc": actual_start.isoformat(), "actual_end_utc": actual_end.isoformat(),
            "requested_coverage_days": round(expected_days, 3), "actual_coverage_days": round(coverage_days, 3),
            "coverage_ratio": round(coverage_ratio, 5), "bars": int(len(df)),
            "rows_removed_or_deduplicated": int(downloaded_rows - len(df)),
            "spread_points_min": float(df["spread"].min()), "spread_points_median": float(df["spread"].median()),
            "spread_points_max": float(df["spread"].max()),
            "broker_spec": {
                "digits": int(info.digits), "point": float(info.point),
                "trade_tick_size": float(info.trade_tick_size), "trade_tick_value": float(info.trade_tick_value),
                "trade_tick_value_profit": float(getattr(info, "trade_tick_value_profit", info.trade_tick_value)),
                "trade_tick_value_loss": float(getattr(info, "trade_tick_value_loss", info.trade_tick_value)),
                "volume_min": float(info.volume_min), "volume_max": float(info.volume_max),
                "volume_step": float(info.volume_step), "contract_size": float(info.trade_contract_size),
                "currency_profit": str(info.currency_profit), "currency_margin": str(info.currency_margin),
            },
            "notes": [
                "Rates and spread are broker-terminal historical data; completeness depends on broker/server history limits.",
                "Bar spread is used as a historical cost proxy; it is not tick-by-tick bid/ask replay.",
                "This importer only reads symbol metadata and rates; it does not read account credentials or send orders."
            ]
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"status": "imported", "csv": str(csv_path), "metadata": str(meta_path), **meta}, ensure_ascii=False, indent=2))
    finally:
        mt5.shutdown()

if __name__ == "__main__":
    main()
