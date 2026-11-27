#!/usr/bin/env python3
"""Export verified Exness MT5 Demo XAUUSDm H1 bars without trading actions.

The exporter is read-only. It refuses a server/account/symbol mismatch, writes
UTC bar-open timestamps and native MT5 tick_volume, and always marks the
result as not training eligible. A separate dataset audit and coverage review
must pass before any training workflow can consume the data.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from validate_exness_h1_dataset import audit_rows

UTC = timezone.utc
CSV_COLUMNS = ["timestamp_utc", "open", "high", "low", "close", "tick_volume"]
DEFAULT_SERVER = "Exness-MT5Trial7"
DEFAULT_SYMBOL = "XAUUSDm"
DEFAULT_CHUNK_DAYS = 30


def parse_utc(value: str) -> datetime:
    """Parse an explicit UTC ISO-8601 timestamp ending in Z."""
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("timestamp_must_end_in_Z")
    parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    if parsed.utcoffset() != timedelta(0):
        raise ValueError("timestamp_must_be_utc")
    parsed = parsed.astimezone(UTC)
    if parsed.minute or parsed.second or parsed.microsecond:
        raise ValueError("H1_range_boundary_must_be_on_the_hour")
    return parsed


def _value(rate: Any, key: str) -> Any:
    try:
        return rate[key]
    except (TypeError, KeyError, IndexError):
        try:
            return getattr(rate, key)
        except AttributeError as exc:
            raise ValueError(f"rate_field_missing:{key}") from exc


def _decimal_text(value: Any, field: str) -> str:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"invalid_numeric_field:{field}") from exc
    if not number.is_finite():
        raise ValueError(f"non_finite_numeric_field:{field}")
    return format(number, "f")


def _rate_to_row(rate: Any, *, start_utc: datetime, end_utc: datetime) -> dict[str, str]:
    try:
        epoch = int(_value(rate, "time"))
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("invalid_mt5_bar_epoch") from exc
    stamp = datetime.fromtimestamp(epoch, tz=UTC)
    if stamp.minute or stamp.second or stamp.microsecond:
        raise ValueError("mt5_bar_timestamp_not_h1_aligned")
    if stamp < start_utc or stamp > end_utc:
        raise ValueError("mt5_returned_bar_outside_requested_range")

    prices = {
        field: _decimal_text(_value(rate, field), field)
        for field in ("open", "high", "low", "close")
    }
    open_price = Decimal(prices["open"])
    high_price = Decimal(prices["high"])
    low_price = Decimal(prices["low"])
    close_price = Decimal(prices["close"])
    if (
        high_price < low_price
        or open_price < low_price
        or open_price > high_price
        or close_price < low_price
        or close_price > high_price
    ):
        raise ValueError("invalid_ohlc_bounds")

    raw_volume = _decimal_text(_value(rate, "tick_volume"), "tick_volume")
    volume = Decimal(raw_volume)
    if volume != volume.to_integral_value() or volume < 0:
        raise ValueError("tick_volume_must_be_non_negative_integer")

    return {
        "timestamp_utc": stamp.isoformat(timespec="seconds").replace("+00:00", "Z"),
        **prices,
        "tick_volume": str(int(volume)),
    }


def _terminal_metadata(mt5: Any, expected_server: str, symbol: str) -> dict[str, Any]:
    terminal = mt5.terminal_info()
    account = mt5.account_info()
    instrument = mt5.symbol_info(symbol)
    if terminal is None:
        raise RuntimeError(f"mt5_terminal_info_unavailable:{mt5.last_error()}")
    if account is None:
        raise RuntimeError(f"mt5_account_info_unavailable:{mt5.last_error()}")
    if instrument is None:
        raise RuntimeError(f"mt5_symbol_info_unavailable:{symbol}:{mt5.last_error()}")
    if getattr(terminal, "connected", False) is not True:
        raise RuntimeError("mt5_terminal_not_connected")
    actual_server = str(getattr(account, "server", "") or "")
    if actual_server != expected_server:
        raise RuntimeError(f"unexpected_mt5_server:{actual_server or 'missing'}")
    demo_mode = getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", None)
    if demo_mode is None or getattr(account, "trade_mode", None) != demo_mode:
        raise RuntimeError("mt5_account_is_not_confirmed_demo")
    actual_symbol = str(getattr(instrument, "name", "") or "")
    if actual_symbol != symbol:
        raise RuntimeError(f"unexpected_mt5_symbol:{actual_symbol or 'missing'}")

    company = str(
        getattr(account, "company", "")
        or getattr(terminal, "company", "")
        or ""
    )
    if not company:
        raise RuntimeError("mt5_company_metadata_missing")
    if "exness" not in company.casefold():
        raise RuntimeError("mt5_company_does_not_identify_exness")

    chart_mode_value = getattr(instrument, "chart_mode", None)
    if chart_mode_value != 0:
        raise RuntimeError("mt5_symbol_chart_mode_must_be_bid")
    chart_mode = "BID"
    version = mt5.version()
    return {
        "server": actual_server,
        "company": company or None,
        "account_environment": "Demo",
        "symbol": actual_symbol,
        "symbol_description": str(getattr(instrument, "description", "") or ""),
        "chart_mode": chart_mode,
        "terminal_version": list(version) if version is not None else None,
    }


def _gap_summary(rows: list[dict[str, str]]) -> dict[str, Any]:
    summary, _ = audit_rows(rows)
    return {
        "gap_count_over_1h": summary["gaps_over_1h"],
        "gap_count_over_96h": summary["long_gap_count"],
        "largest_gap_hours": summary["max_gap_hours"],
        "recognized_daily_rollover_count": summary["daily_rollover_gap_count"],
        "recognized_weekend_closure_count": summary["weekend_closure_gap_count"],
        "unexplained_gap_count": summary["unexplained_gap_count"],
        "unexplained_gaps": summary["unexplained_gaps"],
        "decision": "PENDING_MERGE_AND_FULL_DATASET_VALIDATION",
        "policy": "This segment is not training eligible on export; run the complete dataset validator after provenance-compatible merge.",
    }


def export_history(
    mt5: Any,
    *,
    symbol: str,
    expected_server: str,
    start_utc: datetime,
    end_utc: datetime,
    output_csv: Path,
    output_manifest: Path,
    chunk_days: int = DEFAULT_CHUNK_DAYS,
    now_utc: datetime | None = None,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Retrieve H1 bars in bounded read-only chunks and write CSV + manifest."""
    if start_utc.tzinfo is None or end_utc.tzinfo is None:
        raise ValueError("range_must_be_timezone_aware")
    start_utc = start_utc.astimezone(UTC)
    end_utc = end_utc.astimezone(UTC)
    if start_utc >= end_utc:
        raise ValueError("range_start_must_precede_end")
    if any((start_utc.minute, start_utc.second, start_utc.microsecond,
            end_utc.minute, end_utc.second, end_utc.microsecond)):
        raise ValueError("H1_range_boundary_must_be_on_the_hour")
    if not 1 <= chunk_days <= 90:
        raise ValueError("chunk_days_must_be_between_1_and_90")
    if output_csv.resolve() == output_manifest.resolve():
        raise ValueError("csv_and_manifest_paths_must_differ")
    if not output_csv.parent.is_dir() or not output_manifest.parent.is_dir():
        raise ValueError("output_directories_must_already_exist")
    if not overwrite and (output_csv.exists() or output_manifest.exists()):
        raise FileExistsError("output_exists_refusing_to_overwrite")
    metadata = _terminal_metadata(mt5, expected_server, symbol)

    completed_at = (now_utc or datetime.now(UTC)).astimezone(UTC)
    rows_by_timestamp: dict[str, dict[str, str]] = {}
    cursor = start_utc
    chunk = timedelta(days=chunk_days)
    while cursor <= end_utc:
        chunk_end = min(cursor + chunk - timedelta(seconds=1), end_utc)
        rates = mt5.copy_rates_range(
            symbol, mt5.TIMEFRAME_H1, cursor, chunk_end
        )
        if rates is None:
            raise RuntimeError(f"copy_rates_range_failed:{mt5.last_error()}")
        for rate in rates:
            row = _rate_to_row(rate, start_utc=start_utc, end_utc=end_utc)
            bar_open = datetime.fromisoformat(row["timestamp_utc"].replace("Z", "+00:00"))
            if bar_open + timedelta(hours=1) > completed_at:
                continue
            previous = rows_by_timestamp.get(row["timestamp_utc"])
            if previous is not None and previous != row:
                raise RuntimeError(f"conflicting_duplicate_h1_bar:{row['timestamp_utc']}")
            rows_by_timestamp[row["timestamp_utc"]] = row
        cursor = chunk_end + timedelta(seconds=1)

    rows = [rows_by_timestamp[key] for key in sorted(rows_by_timestamp)]
    if not rows:
        raise RuntimeError("no_completed_h1_bars_returned_for_requested_range")

    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    csv_bytes = csv_buffer.getvalue().encode("utf-8")
    digest = hashlib.sha256(csv_bytes).hexdigest()
    volumes = [int(row["tick_volume"]) for row in rows]
    manifest: dict[str, Any] = {
        "dataset": "Exness MT5 Demo XAUUSDm H1 historical OHLCV recovery segment",
        "source": "Exness MT5 Python API via authorized Windows MT5 terminal (read-only)",
        **metadata,
        "timeframe": "H1",
        "timezone": "UTC",
        "timestamp_semantics": "MT5 H1 bar-open timestamp, UTC",
        "price_basis": "MT5 broker chart OHLC (Bid chart mode)",
        "retrieval_method": "MetaTrader5.copy_rates_range in bounded UTC chunks",
        "requested_from_utc": start_utc.isoformat().replace("+00:00", "Z"),
        "requested_to_utc": end_utc.isoformat().replace("+00:00", "Z"),
        "retrieved_at_utc": completed_at.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "rows": len(rows),
        "columns": CSV_COLUMNS,
        "first_timestamp_utc": rows[0]["timestamp_utc"],
        "last_completed_bar_utc": rows[-1]["timestamp_utc"],
        "csv_bytes": len(csv_bytes),
        "sha256_csv": digest,
        "volume_basis": "Native MT5 tick_volume (tick count per H1 bar; not exchange-traded base volume)",
        "tick_volume_min": min(volumes),
        "tick_volume_max": max(volumes),
        "tick_volume_zero_rows": sum(volume == 0 for volume in volumes),
        "tick_volume_missing_rows": 0,
        "gap_audit": _gap_summary(rows),
        "max_allowed_gap_hours_for_training": 96,
        "completeness_status": "PENDING_MERGE_AND_FULL_DATASET_VALIDATION",
        "training_eligible": False,
        "safety": {
            "market_data_only": True,
            "trading_actions_called": False,
            "orders_enabled": False,
            "execution_enabled": False,
            "live_trading_enabled": False,
        },
        "notes": [
            "This is a recovery segment, not a complete training dataset.",
            "Merge only with a dataset whose server, environment, symbol, timeframe, timezone, price basis and chart mode match exactly.",
            "The exporter never sets training_eligible=true.",
            "No synthetic bars or volume values are generated.",
        ],
    }
    manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

    required_free = len(csv_bytes) + len(manifest_bytes) + 1024 * 1024
    free_bytes = shutil.disk_usage(output_csv.parent).free
    if output_csv.parent.resolve() != output_manifest.parent.resolve():
        free_bytes = min(free_bytes, shutil.disk_usage(output_manifest.parent).free)
    if free_bytes < required_free:
        raise OSError(
            f"insufficient_free_space:required_at_least={required_free}:available={free_bytes}"
        )

    temp_paths: list[Path] = []
    try:
        for target, payload in ((output_csv, csv_bytes), (output_manifest, manifest_bytes)):
            fd, temp_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
            temp_path = Path(temp_name)
            temp_paths.append(temp_path)
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
        if not overwrite and (output_csv.exists() or output_manifest.exists()):
            raise FileExistsError("output_appeared_during_export_refusing_to_overwrite")
        os.replace(temp_paths[0], output_csv)
        temp_paths.pop(0)
        os.replace(temp_paths[0], output_manifest)
        temp_paths.pop(0)
    finally:
        for temp_path in temp_paths:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass

    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-utc", required=True, help="Inclusive H1 bar-open range start, e.g. 2025-12-31T22:00:00Z")
    parser.add_argument("--to-utc", required=True, help="Inclusive H1 bar-open range end, e.g. 2026-11-06T00:00:00Z")
    parser.add_argument("--output", required=True, type=Path, help="CSV output path on a volume with free space")
    parser.add_argument("--manifest", type=Path, help="Manifest path; defaults to OUTPUT.manifest.json")
    parser.add_argument("--terminal-path", help="Optional path to the already-authorized MT5 terminal64.exe")
    parser.add_argument("--expected-server", default=DEFAULT_SERVER)
    parser.add_argument("--symbol", default=DEFAULT_SYMBOL)
    parser.add_argument("--chunk-days", type=int, default=DEFAULT_CHUNK_DAYS)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    try:
        start_utc = parse_utc(args.from_utc)
        end_utc = parse_utc(args.to_utc)
    except ValueError as exc:
        parser.error(str(exc))
    manifest_path = args.manifest or args.output.with_suffix(".manifest.json")
    try:
        import MetaTrader5 as mt5
    except ImportError:
        print("MetaTrader5 Python package is not installed in this environment.", file=sys.stderr)
        return 2

    initialized = mt5.initialize(path=args.terminal_path) if args.terminal_path else mt5.initialize()
    if not initialized:
        print(f"MT5 initialize failed: {mt5.last_error()}", file=sys.stderr)
        return 2
    try:
        manifest = export_history(
            mt5,
            symbol=args.symbol,
            expected_server=args.expected_server,
            start_utc=start_utc,
            end_utc=end_utc,
            output_csv=args.output,
            output_manifest=manifest_path,
            chunk_days=args.chunk_days,
            overwrite=args.overwrite,
        )
        print(json.dumps(manifest, indent=2, ensure_ascii=False))
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Export blocked: {exc}", file=sys.stderr)
        return 2
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
