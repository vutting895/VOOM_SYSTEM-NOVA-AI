#!/usr/bin/env python3
"""Read-only Exness MT5 Demo XAUUSDm OHLCV export for M1..D1.

Exports one CSV and provenance manifest per timeframe. Uses native MT5
tick_volume, UTC bar-open timestamps, bounded copy_rates_range calls, and
atomic file replacement. This tool never creates candles or enables training.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

UTC = timezone.utc
DEFAULT_SERVER = "Exness-MT5Trial7"
DEFAULT_SYMBOL = "XAUUSDm"
TIMEFRAMES = {
    "M1": ("TIMEFRAME_M1", 60),
    "M5": ("TIMEFRAME_M5", 300),
    "M15": ("TIMEFRAME_M15", 900),
    "M30": ("TIMEFRAME_M30", 1800),
    "H1": ("TIMEFRAME_H1", 3600),
    "H4": ("TIMEFRAME_H4", 14400),
    "D1": ("TIMEFRAME_D1", 86400),
}
COLUMNS = ["timestamp_utc", "open", "high", "low", "close", "tick_volume"]


def parse_utc(value: str) -> datetime:
    if not value.endswith("Z"):
        raise ValueError("timestamp_must_end_in_Z")
    parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    if parsed.utcoffset() != timedelta(0):
        raise ValueError("timestamp_must_be_utc")
    return parsed.astimezone(UTC)


def field(rate: Any, name: str) -> Any:
    try:
        return rate[name]
    except (TypeError, KeyError, IndexError):
        try:
            return getattr(rate, name)
        except AttributeError as exc:
            raise ValueError(f"missing_mt5_field:{name}") from exc


def number(value: Any, name: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"invalid_numeric_field:{name}") from exc
    if not result.is_finite():
        raise ValueError(f"non_finite_numeric_field:{name}")
    return result


def rate_row(rate: Any, start: datetime, end: datetime, seconds: int,
             completed_at: datetime) -> dict[str, str] | None:
    epoch = int(field(rate, "time"))
    stamp = datetime.fromtimestamp(epoch, UTC)
    if stamp < start or stamp > end:
        raise ValueError("returned_bar_outside_requested_range")
    # Intraday bars up to H1 have UTC epoch alignment. H4/D1 opens follow
    # broker-session boundaries (and DST), so UTC modulo alignment is invalid.
    if seconds <= 3600 and int(stamp.timestamp()) % seconds:
        raise ValueError("bar_timestamp_not_timeframe_aligned")
    if seconds > 3600 and (stamp.minute or stamp.second or stamp.microsecond):
        raise ValueError("higher_timeframe_timestamp_not_minute_aligned")
    if stamp + timedelta(seconds=seconds) > completed_at:
        return None  # Never export a forming bar.
    prices = {k: number(field(rate, k), k) for k in ("open", "high", "low", "close")}
    if (prices["high"] < prices["low"] or
        not prices["low"] <= prices["open"] <= prices["high"] or
        not prices["low"] <= prices["close"] <= prices["high"]):
        raise ValueError("invalid_ohlc_bounds")
    volume = number(field(rate, "tick_volume"), "tick_volume")
    if volume < 0 or volume != volume.to_integral_value():
        raise ValueError("tick_volume_must_be_non_negative_integer")
    return {
        "timestamp_utc": stamp.isoformat(timespec="seconds").replace("+00:00", "Z"),
        **{k: format(v, "f") for k, v in prices.items()},
        "tick_volume": str(int(volume)),
    }


def atomic_write(path: Path, payload: bytes) -> None:
    """Atomically create one immutable file without replacing an existing file."""
    atomic_write_pair(((path, payload),))


def atomic_write_pair(files: tuple[tuple[Path, bytes], ...]) -> None:
    """Create a related artifact set; roll back created paths if any link fails.

    Each destination is immutable. This is not a crash-atomic multi-file
    transaction, so consumers must treat the manifest as the commit marker and
    ignore a CSV without its matching manifest.
    """
    if not files or len({path for path, _ in files}) != len(files):
        raise ValueError("artifact_paths_must_be_non_empty_and_unique")
    parents = {path.parent for path, _ in files}
    if len(parents) != 1:
        raise ValueError("artifact_pair_must_share_output_directory")
    parent = next(iter(parents))
    if not parent.is_dir():
        raise ValueError(f"output_directory_missing:{parent}")
    for path, _ in files:
        if path.exists():
            raise FileExistsError(f"output_exists_refusing_to_overwrite:{path}")

    temporary: list[Path] = []
    created: list[Path] = []
    try:
        for path, payload in files:
            fd, temp_name = tempfile.mkstemp(
                prefix=f".{path.name}.", suffix=".tmp", dir=parent
            )
            temp_path = Path(temp_name)
            temporary.append(temp_path)
            with os.fdopen(fd, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())

        # Hard links are atomic per destination and never overwrite. If a later
        # link fails, remove only paths created by this invocation.
        for (path, _), temp_path in zip(files, temporary, strict=True):
            os.link(temp_path, path)
            created.append(path)
    except Exception:
        for path in reversed(created):
            path.unlink(missing_ok=True)
        raise
    finally:
        for temp_path in temporary:
            temp_path.unlink(missing_ok=True)


def export_timeframe(mt5: Any, name: str, seconds: int, mt5_constant: int,
                     start: datetime, end: datetime, out_dir: Path,
                     symbol: str, server: str, chunk_days: int) -> dict[str, Any]:
    if start >= end:
        raise ValueError("range_start_must_precede_end")
    terminal, account, instrument = mt5.terminal_info(), mt5.account_info(), mt5.symbol_info(symbol)
    if terminal is None or account is None or instrument is None:
        raise RuntimeError("mt5_identity_or_symbol_metadata_unavailable")
    if getattr(terminal, "connected", False) is not True:
        raise RuntimeError("mt5_terminal_not_connected")
    if str(getattr(account, "server", "")) != server:
        raise RuntimeError("unexpected_mt5_server")
    if getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", None) is None or getattr(account, "trade_mode", None) != mt5.ACCOUNT_TRADE_MODE_DEMO:
        raise RuntimeError("mt5_account_is_not_confirmed_demo")
    if str(getattr(instrument, "name", "")) != symbol:
        raise RuntimeError("unexpected_mt5_symbol")
    company = str(getattr(account, "company", "") or getattr(terminal, "company", "") or "")
    if "exness" not in company.casefold():
        raise RuntimeError("mt5_company_does_not_identify_exness")
    if getattr(instrument, "chart_mode", None) != 0:
        raise RuntimeError("mt5_symbol_chart_mode_must_be_bid")

    completed_at = datetime.now(UTC)
    by_stamp: dict[str, dict[str, str]] = {}
    cursor = start
    chunk = timedelta(days=chunk_days)
    while cursor <= end:
        chunk_end = min(cursor + chunk - timedelta(seconds=1), end)
        rates = mt5.copy_rates_range(symbol, mt5_constant, cursor, chunk_end)
        if rates is None:
            raise RuntimeError(f"copy_rates_range_failed:{mt5.last_error()}")
        for rate in rates:
            row = rate_row(rate, start, end, seconds, completed_at)
            if row is None:
                continue
            key = row["timestamp_utc"]
            old = by_stamp.get(key)
            if old is not None and old != row:
                raise RuntimeError(f"conflicting_duplicate_bar:{name}:{key}")
            by_stamp[key] = row
        cursor = chunk_end + timedelta(seconds=1)

    rows = [by_stamp[key] for key in sorted(by_stamp)]
    if not rows:
        raise RuntimeError(f"no_completed_bars_returned:{name}")
    csv_buffer = __import__("io").StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    csv_bytes = csv_buffer.getvalue().encode("utf-8")
    digest = hashlib.sha256(csv_bytes).hexdigest()
    stamps = [datetime.fromisoformat(row["timestamp_utc"].replace("Z", "+00:00")) for row in rows]
    gaps = []
    for left, right in zip(stamps, stamps[1:]):
        delta = int((right - left).total_seconds())
        if delta > seconds:
            gaps.append({"from_utc": left.isoformat().replace("+00:00", "Z"),
                         "to_utc": right.isoformat().replace("+00:00", "Z"),
                         "elapsed_seconds": delta, "missing_intervals_estimate": max(0, delta // seconds - 1)})
    stem = f"{symbol}_{name}"
    csv_path = out_dir / f"{stem}.csv"
    manifest_path = out_dir / f"{stem}.manifest.json"
    manifest = {
        "dataset": f"Exness {symbol} {name} historical OHLCV",
        "source": "Exness MT5 Python API (read-only)",
        "server": server, "company": company, "account_environment": "Demo",
        "symbol": symbol, "timeframe": name, "timeframe_seconds": seconds,
        "timezone": "UTC", "timestamp_semantics": "MT5 bar-open timestamp",
        "price_basis": "Bid chart OHLC", "retrieval_method": "copy_rates_range bounded UTC chunks",
        "requested_from_utc": start.isoformat().replace("+00:00", "Z"),
        "requested_to_utc": end.isoformat().replace("+00:00", "Z"),
        "retrieved_at_utc": completed_at.isoformat().replace("+00:00", "Z"),
        "rows": len(rows), "columns": COLUMNS,
        "first_timestamp_utc": rows[0]["timestamp_utc"],
        "last_timestamp_utc": rows[-1]["timestamp_utc"],
        "csv_bytes": len(csv_bytes), "sha256_csv": digest,
        "volume_basis": "Native MT5 tick_volume; tick count, not exchange-traded volume",
        "tick_volume_missing_rows": 0,
        "gap_count": len(gaps), "gaps": gaps,
        "completeness_status": "PENDING_INDEPENDENT_SESSION_AND_COVERAGE_AUDIT",
        "training_eligible": False,
        "safety": {"market_data_only": True, "trading_actions_called": False,
                   "orders_enabled": False, "execution_enabled": False,
                   "live_trading_enabled": False},
        "notes": ["No bars or volume are synthesized.",
                  "A timeframe export is not automatically training eligible.",
                  "Validate session closures, gaps, source identity and hash before use."]
    }
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
    atomic_write_pair(((csv_path, csv_bytes), (manifest_path, manifest_bytes)))
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-utc", required=True, help="Inclusive UTC bar-open time, e.g. 2023-01-01T00:00:00Z")
    parser.add_argument("--to-utc", required=True, help="Inclusive UTC bar-open time")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--symbol", default=DEFAULT_SYMBOL)
    parser.add_argument("--expected-server", default=DEFAULT_SERVER)
    parser.add_argument("--chunk-days", type=int, default=7)
    parser.add_argument("--timeframes", default="M1,M5,M15,M30,H1,H4,D1")
    parser.add_argument("--terminal-path")
    args = parser.parse_args()
    if not 1 <= args.chunk_days <= 30:
        parser.error("--chunk-days must be between 1 and 30")
    try:
        start, end = parse_utc(args.from_utc), parse_utc(args.to_utc)
    except ValueError as exc:
        parser.error(str(exc))
    requested = [item.strip().upper() for item in args.timeframes.split(",") if item.strip()]
    if not requested or len(set(requested)) != len(requested) or any(item not in TIMEFRAMES for item in requested):
        parser.error("timeframes must be unique values from " + ",".join(TIMEFRAMES))
    try:
        import MetaTrader5 as mt5
    except ImportError:
        print("MetaTrader5 package is not installed", file=__import__("sys").stderr)
        return 2
    initialized = mt5.initialize(path=args.terminal_path) if args.terminal_path else mt5.initialize()
    if not initialized:
        print(f"MT5 initialize failed: {mt5.last_error()}", file=__import__("sys").stderr)
        return 2
    try:
        reports = []
        for name in requested:
            constant_name, seconds = TIMEFRAMES[name]
            constant = getattr(mt5, constant_name, None)
            if constant is None:
                raise RuntimeError(f"mt5_timeframe_constant_missing:{constant_name}")
            reports.append(export_timeframe(mt5, name, seconds, constant, start, end,
                                            args.output_dir, args.symbol,
                                            args.expected_server, args.chunk_days))
        print(json.dumps(reports, indent=2))
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Export blocked: {exc}", file=__import__("sys").stderr)
        return 2
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
