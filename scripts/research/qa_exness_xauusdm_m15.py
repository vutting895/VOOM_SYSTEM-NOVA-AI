#!/usr/bin/env python3
"""Reproducible structural QA for the Exness XAUUSDm M15 candidate CSV."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

EXPECTED_COLUMNS = [
    "timestamp", "open", "high", "low", "close", "volume",
    "tick_volume", "spread_points", "spread_price", "real_volume",
]
SPREAD_POINT = Decimal("0.001")
SPREAD_TOLERANCE = Decimal("1e-12")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError(f"timestamp must be timezone-aware UTC: {value!r}")
    return parsed.astimezone(timezone.utc)


def decimal_field(row: dict[str, str], key: str) -> Decimal:
    value = Decimal(row[key])
    if not value.is_finite():
        raise ValueError(f"non-finite numeric field: {key}")
    return value


def validate(csv_path: Path, manifest_path: Path) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: Counter[str] = Counter()
    interval_counts: Counter[int] = Counter()
    nonstandard_gaps: list[dict[str, Any]] = []
    row_count = 0
    first = last = previous = None
    zero_volume = zero_tick_volume = zero_real_volume = 0
    volume_equals_tick_volume = 0
    spread_rounding_rows = 0
    spread_max_abs_diff = Decimal(0)

    actual_bytes = csv_path.stat().st_size
    actual_sha = sha256_file(csv_path)
    if actual_bytes != int(manifest["csv_size_bytes"]):
        errors["csv_byte_size_mismatch"] += 1
    if actual_sha != manifest["csv_sha256"]:
        errors["csv_sha256_mismatch"] += 1

    with csv_path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != EXPECTED_COLUMNS:
            errors["schema_mismatch"] += 1
        for row in reader:
            row_count += 1
            try:
                timestamp = parse_utc(row["timestamp"])
            except (ValueError, TypeError, KeyError):
                errors["invalid_or_non_utc_timestamp"] += 1
                continue

            if first is None:
                first = timestamp
            if previous is not None:
                delta = timestamp - previous
                if delta <= timedelta(0):
                    errors["duplicate_or_unsorted_timestamp"] += 1
                elif delta != timedelta(minutes=15):
                    minutes = int(delta.total_seconds() // 60)
                    interval_counts[minutes] += 1
                    if minutes not in (75, 2955):
                        nonstandard_gaps.append({
                            "previous_bar_utc": previous.isoformat(),
                            "next_bar_utc": timestamp.isoformat(),
                            "elapsed_minutes": minutes,
                        })
            previous = last = timestamp

            try:
                values = {
                    key: decimal_field(row, key)
                    for key in (
                        "open", "high", "low", "close", "volume",
                        "tick_volume", "spread_points", "spread_price", "real_volume",
                    )
                }
            except (InvalidOperation, ValueError, KeyError):
                errors["invalid_numeric_value"] += 1
                continue

            prices = [values[key] for key in ("open", "high", "low", "close")]
            if min(prices) <= 0:
                errors["non_positive_price"] += 1
            if values["high"] < max(values["open"], values["close"]) or values["low"] > min(values["open"], values["close"]) or values["high"] < values["low"]:
                errors["invalid_ohlc_range"] += 1
            if min(values["volume"], values["tick_volume"], values["real_volume"]) < 0:
                errors["negative_volume"] += 1
            if min(values["spread_points"], values["spread_price"]) < 0:
                errors["negative_spread"] += 1

            zero_volume += values["volume"] == 0
            zero_tick_volume += values["tick_volume"] == 0
            zero_real_volume += values["real_volume"] == 0
            volume_equals_tick_volume += values["volume"] == values["tick_volume"]
            diff = abs(values["spread_price"] - values["spread_points"] * SPREAD_POINT)
            spread_max_abs_diff = max(spread_max_abs_diff, diff)
            if diff != 0:
                spread_rounding_rows += 1
            if diff > SPREAD_TOLERANCE:
                errors["spread_formula_outside_tolerance"] += 1

    if row_count != int(manifest["row_count"]):
        errors["row_count_mismatch"] += 1
    if first is None or first.isoformat() != manifest["first_bar_utc"]:
        errors["first_timestamp_mismatch"] += 1
    if last is None or last.isoformat() != manifest["last_closed_bar_utc"]:
        errors["last_timestamp_mismatch"] += 1

    structural_pass = not errors
    report = {
        "dataset_id": manifest.get("dataset_id"),
        "symbol": manifest.get("symbol"),
        "timeframe": manifest.get("timeframe"),
        "benchmark_eligibility": manifest.get("benchmark_eligibility"),
        "csv": {
            "path": csv_path.name,
            "bytes": actual_bytes,
            "expected_bytes": int(manifest["csv_size_bytes"]),
            "sha256": actual_sha,
            "expected_sha256": manifest["csv_sha256"],
            "hash_match": actual_sha == manifest["csv_sha256"],
            "rows": row_count,
            "expected_rows": int(manifest["row_count"]),
            "first_bar_utc": first.isoformat() if first else None,
            "last_bar_utc": last.isoformat() if last else None,
            "columns": EXPECTED_COLUMNS,
        },
        "structural_checks": {
            "status": "PASS" if structural_pass else "FAIL",
            "errors": dict(errors),
            "duplicate_or_unsorted_timestamps": errors["duplicate_or_unsorted_timestamp"],
            "zero_volume_rows": zero_volume,
            "zero_tick_volume_rows": zero_tick_volume,
            "zero_real_volume_rows": zero_real_volume,
            "volume_equals_tick_volume_rows": volume_equals_tick_volume,
            "spread_formula_rounding_rows": spread_rounding_rows,
            "spread_formula_max_abs_diff": str(spread_max_abs_diff),
            "spread_formula_tolerance": str(SPREAD_TOLERANCE),
        },
        "gap_analysis": {
            "non_15m_intervals": sum(interval_counts.values()),
            "interval_counts_minutes": {str(k): v for k, v in sorted(interval_counts.items())},
            "repeating_daily_maintenance_pattern_75m": interval_counts[75],
            "repeating_weekend_pattern_2955m": interval_counts[2955],
            "nonstandard_intervals_pending_broker_calendar": len(nonstandard_gaps),
            "nonstandard_gaps": nonstandard_gaps,
            "status": "PENDING_BROKER_SESSION_CALENDAR" if nonstandard_gaps else "PASS",
        },
        "overall_status": "PARTIAL_PASS" if structural_pass and nonstandard_gaps else ("PASS" if structural_pass else "FAIL"),
        "limitations": [
            "A non-15-minute interval is not automatically a missing bar; scheduled closures must be reconciled against the historical broker/server calendar.",
            "This report verifies structural integrity only; it does not validate strategy profitability or OOS performance.",
            "The dataset is candidate_only and must not replace the frozen Wave3 benchmark.",
            "volume equals tick_volume in this export and real_volume is zero; do not treat it as exchange traded volume.",
        ],
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = validate(args.csv, args.manifest)
    rendered = json.dumps(report, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    if report["overall_status"] == "FAIL":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
