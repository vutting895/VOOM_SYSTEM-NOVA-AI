#!/usr/bin/env python3
"""Fail-closed validator for Exness Demo XAUUSDm M15 CSV candidates.

This validates data integrity and continuity only. It does not grant benchmark
or training eligibility and never fills missing bars.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable, Mapping

REQUIRED_COLUMNS = {"timestamp", "open", "high", "low", "close", "tick_volume"}
DEFAULT_MAX_GAP_HOURS = 96


def parse_utc(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise ValueError(f"invalid ISO timestamp: {value!r}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError(f"timestamp must be timezone-aware UTC: {value!r}")
    parsed = parsed.astimezone(timezone.utc)
    if parsed.timestamp() % 900 != 0:
        raise ValueError(f"timestamp is not aligned to a 15-minute boundary: {value!r}")
    return parsed


def decimal_field(row: Mapping[str, str], field: str) -> Decimal:
    try:
        value = Decimal(row[field])
    except (KeyError, InvalidOperation, TypeError) as exc:
        raise ValueError(f"missing or invalid numeric field: {field}") from exc
    if not value.is_finite():
        raise ValueError(f"non-finite numeric field: {field}")
    return value


def validate_rows(
    rows: Iterable[Mapping[str, str]], *, max_gap_hours: int = DEFAULT_MAX_GAP_HOURS
) -> dict[str, object]:
    if max_gap_hours <= 0:
        raise ValueError("max_gap_hours must be positive")

    count = 0
    first: datetime | None = None
    previous: datetime | None = None
    largest_gap = timedelta(0)

    for row in rows:
        missing = REQUIRED_COLUMNS.difference(row.keys())
        if missing:
            raise ValueError(f"missing required columns: {', '.join(sorted(missing))}")

        timestamp = parse_utc(row["timestamp"])
        if previous is not None:
            delta = timestamp - previous
            if delta <= timedelta(0):
                raise ValueError("timestamps must be strictly ascending and unique")
            if delta.total_seconds() % 900 != 0:
                raise ValueError("timestamp interval must be a multiple of 15 minutes")
            largest_gap = max(largest_gap, delta)
            if delta > timedelta(hours=max_gap_hours):
                raise ValueError(
                    f"historical gap exceeds {max_gap_hours} hours: "
                    f"{previous.isoformat()} -> {timestamp.isoformat()} "
                    f"({delta.total_seconds() / 3600:g} hours)"
                )

        prices = {key: decimal_field(row, key) for key in ("open", "high", "low", "close")}
        if any(value <= 0 for value in prices.values()):
            raise ValueError("OHLC prices must be positive")
        if prices["high"] < max(prices["open"], prices["close"]):
            raise ValueError("high must be >= open and close")
        if prices["low"] > min(prices["open"], prices["close"]):
            raise ValueError("low must be <= open and close")
        if prices["high"] < prices["low"]:
            raise ValueError("high must be >= low")

        raw_tick_volume = row["tick_volume"]
        if not re.fullmatch(r"0|[1-9][0-9]*", raw_tick_volume or ""):
            raise ValueError("tick_volume must be a non-negative integer")
        int(raw_tick_volume)

        count += 1
        first = first or timestamp
        previous = timestamp

    if count == 0 or first is None or previous is None:
        raise ValueError("dataset is empty")

    return {
        "row_count": count,
        "first_bar_utc": first.isoformat(),
        "last_bar_utc": previous.isoformat(),
        "largest_observed_gap_hours": largest_gap.total_seconds() / 3600,
        "max_allowed_gap_hours": max_gap_hours,
        "continuity_status": "PASS",
        "training_eligible": False,
        "note": "Integrity pass only; separate provenance, benchmark, and training gates remain required.",
    }


def validate_manifest(manifest: Mapping[str, object]) -> None:
    expected = {
        "symbol": "XAUUSDm",
        "timeframe": "M15",
        "timezone": "UTC",
        "account_mode": "DEMO",
        "tick_volume_field": "tick_volume",
        "benchmark_eligibility": "candidate_only",
    }
    for key, value in expected.items():
        if manifest.get(key) != value:
            raise ValueError(f"manifest {key} must equal {value!r}")
    if manifest.get("training_eligible") is not False:
        raise ValueError("candidate manifest must keep training_eligible=false")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--max-gap-hours", type=int, default=DEFAULT_MAX_GAP_HOURS)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    validate_manifest(manifest)
    with args.csv.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        columns = set(reader.fieldnames or [])
        if not REQUIRED_COLUMNS.issubset(columns):
            raise ValueError("CSV must contain timestamp, OHLC, and tick_volume columns")
        result = validate_rows(reader, max_gap_hours=args.max_gap_hours)

    if result["row_count"] != manifest.get("row_count"):
        raise ValueError("row count does not match manifest")
    if result["first_bar_utc"] != manifest.get("first_bar_utc"):
        raise ValueError("first bar does not match manifest")
    if result["last_bar_utc"] != manifest.get("last_closed_bar_utc"):
        raise ValueError("last bar does not match manifest")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
