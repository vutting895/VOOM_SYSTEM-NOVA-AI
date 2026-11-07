#!/usr/bin/env python3
"""Audit the committed Exness XAUUSDm H1 Demo dataset before training.

This validator never repairs or fabricates bars. A historical coverage gap over
96 hours blocks training even when OHLC and tick_volume columns are valid.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

EXPECTED_COLUMNS = [
    "timestamp_utc", "open", "high", "low", "close", "tick_volume"
]
DEFAULT_MAX_GAP_HOURS = 96.0


def _parse_utc(value: str) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("timestamp_must_be_utc_z")
    parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    if parsed.utcoffset() != timedelta(0):
        raise ValueError("timestamp_must_be_utc_z")
    return parsed.astimezone(timezone.utc)


def audit_rows(
    rows: list[dict[str, str]], *, max_gap_hours: float = DEFAULT_MAX_GAP_HOURS
) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    timestamps: list[str] = []
    volumes: list[int] = []
    gaps_over_one_hour = 0
    long_gaps: list[dict[str, Any]] = []
    previous: datetime | None = None
    max_gap_observed = 0.0
    duplicate_count = 0
    ordering_errors = 0
    invalid_ohlc_rows = 0
    missing_volume_rows = 0
    negative_volume_rows = 0
    fractional_volume_rows = 0
    zero_volume_rows = 0

    for row_number, row in enumerate(rows, start=2):
        try:
            stamp = _parse_utc(row.get("timestamp_utc", ""))
        except (TypeError, ValueError, OverflowError):
            errors.append(f"row_{row_number}:invalid_utc_timestamp")
            continue
        timestamps.append(row["timestamp_utc"])

        if previous is not None:
            delta_hours = (stamp - previous).total_seconds() / 3600.0
            if delta_hours <= 0:
                ordering_errors += 1
                if delta_hours == 0:
                    duplicate_count += 1
                errors.append(f"row_{row_number}:timestamps_not_strictly_increasing")
            else:
                max_gap_observed = max(max_gap_observed, delta_hours)
                if delta_hours > 1.0:
                    gaps_over_one_hour += 1
                if delta_hours > max_gap_hours:
                    gap = {
                        "from_utc": previous.isoformat().replace("+00:00", "Z"),
                        "to_utc": stamp.isoformat().replace("+00:00", "Z"),
                        "hours": delta_hours,
                    }
                    long_gaps.append(gap)
                    errors.append(
                        f"row_{row_number}:historical_gap_exceeds_{max_gap_hours:g}_hours:{delta_hours:g}"
                    )
        if previous is None or stamp > previous:
            previous = stamp

        try:
            prices = {
                key: Decimal(row[key])
                for key in ("open", "high", "low", "close")
            }
            if not all(value.is_finite() for value in prices.values()):
                raise InvalidOperation
        except (KeyError, InvalidOperation, TypeError, ValueError):
            invalid_ohlc_rows += 1
            errors.append(f"row_{row_number}:ohlc_missing_or_non_finite")
            continue

        open_price = prices["open"]
        high_price = prices["high"]
        low_price = prices["low"]
        close_price = prices["close"]
        if (
            high_price < low_price
            or open_price < low_price
            or open_price > high_price
            or close_price < low_price
            or close_price > high_price
        ):
            invalid_ohlc_rows += 1
            errors.append(f"row_{row_number}:invalid_ohlc_bounds")

        raw_volume = row.get("tick_volume")
        try:
            volume_decimal = Decimal(raw_volume) if raw_volume is not None else Decimal("NaN")
        except (InvalidOperation, TypeError, ValueError):
            volume_decimal = Decimal("NaN")
        if not volume_decimal.is_finite():
            missing_volume_rows += 1
            errors.append(f"row_{row_number}:tick_volume_missing_or_non_numeric")
            continue
        if volume_decimal != volume_decimal.to_integral_value():
            fractional_volume_rows += 1
            errors.append(f"row_{row_number}:tick_volume_not_integer")
            continue
        volume = int(volume_decimal)
        if volume < 0:
            negative_volume_rows += 1
            errors.append(f"row_{row_number}:tick_volume_negative")
            continue
        if volume == 0:
            zero_volume_rows += 1
        volumes.append(volume)

    summary: dict[str, Any] = {
        "rows": len(rows),
        "first_timestamp_utc": timestamps[0] if timestamps else None,
        "last_timestamp_utc": timestamps[-1] if timestamps else None,
        "gaps_over_1h": gaps_over_one_hour,
        "max_gap_hours": max_gap_observed,
        "long_gap_count": len(long_gaps),
        "long_gaps": long_gaps,
        "duplicate_timestamps": duplicate_count,
        "timestamp_order_errors": ordering_errors,
        "invalid_ohlc_rows": invalid_ohlc_rows,
        "tick_volume_min": min(volumes) if volumes else None,
        "tick_volume_max": max(volumes) if volumes else None,
        "tick_volume_zero_rows": zero_volume_rows,
        "tick_volume_missing_rows": missing_volume_rows,
        "tick_volume_negative_rows": negative_volume_rows,
        "tick_volume_fractional_rows": fractional_volume_rows,
        "max_allowed_gap_hours": max_gap_hours,
    }
    return summary, errors


def audit_dataset(
    csv_path: Path,
    manifest_path: Path,
    *,
    max_gap_hours: float = DEFAULT_MAX_GAP_HOURS,
) -> dict[str, Any]:
    raw = csv_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(text.splitlines())
    columns = reader.fieldnames or []
    rows = list(reader)

    summary, errors = audit_rows(rows, max_gap_hours=max_gap_hours)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    checks = {
        "columns_match": columns == EXPECTED_COLUMNS and manifest.get("columns") == EXPECTED_COLUMNS,
        "row_count_matches": manifest.get("rows") == summary["rows"],
        "csv_bytes_match": manifest.get("csv_bytes") == len(raw),
        "sha256_matches": manifest.get("sha256_csv") == digest,
        "first_timestamp_matches": manifest.get("first_timestamp_utc") == summary["first_timestamp_utc"],
        "last_timestamp_matches": manifest.get("last_completed_bar_utc") == summary["last_timestamp_utc"],
        "gap_count_matches": manifest.get("gaps_over_1h") == summary["gaps_over_1h"],
        "tick_volume_min_matches": manifest.get("tick_volume_min") == summary["tick_volume_min"],
        "tick_volume_max_matches": manifest.get("tick_volume_max") == summary["tick_volume_max"],
        "tick_volume_zero_rows_match": manifest.get("tick_volume_zero_rows") == summary["tick_volume_zero_rows"],
        "tick_volume_missing_rows_match": manifest.get("tick_volume_missing_rows") == summary["tick_volume_missing_rows"],
    }
    for name, passed in checks.items():
        if not passed:
            errors.append(f"manifest_mismatch:{name}")

    volume_error_prefixes = (
        "tick_volume_missing_or_non_numeric",
        "tick_volume_not_integer",
        "tick_volume_negative",
    )
    volume_errors = [
        error for error in errors
        if any(marker in error for marker in volume_error_prefixes)
    ]
    coverage_errors = [
        error for error in errors if "historical_gap_exceeds" in error
    ]

    return {
        **summary,
        "csv_bytes": len(raw),
        "sha256_csv": digest,
        "manifest_checks": checks,
        "volume_status": "PASS" if not volume_errors else "BLOCKED",
        "coverage_status": "PASS" if not coverage_errors else "BLOCKED",
        "status": "PASS" if not errors else "BLOCKED",
        "training_eligible": not errors,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path("data/market/exness/XAUUSDm_H1_3Y.csv"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("data/market/exness/XAUUSDm_H1_3Y.manifest.json"),
    )
    parser.add_argument("--max-gap-hours", type=float, default=DEFAULT_MAX_GAP_HOURS)
    parser.add_argument("--require-training-eligible", action="store_true")
    args = parser.parse_args()

    if not math.isfinite(args.max_gap_hours) or args.max_gap_hours <= 1:
        parser.error("--max-gap-hours must be finite and greater than 1")

    report = audit_dataset(
        args.csv, args.manifest, max_gap_hours=args.max_gap_hours
    )
    print(json.dumps(report, indent=2))
    if args.require_training_eligible and not report["training_eligible"]:
        print("Dataset validation blocked: do not start training.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
