"""Validate the canonical historical Exness USD high-impact news calendar."""
from __future__ import annotations

import argparse
import csv
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

EXPECTED_ROWS = 2166
COVERAGE_START = "2022-07-21T00:00:00Z"
COVERAGE_END_EXCLUSIVE = "2026-10-30T00:00:00Z"
REQUIRED_COLUMNS = {
    "timestamp", "impact", "currency", "event", "country", "time_mode",
    "calendar_source", "calendar_timezone", "coverage_start_utc",
    "coverage_end_exclusive_utc", "event_id", "value_id",
}


def validate_calendar(path: str | Path, expected_rows: int = EXPECTED_ROWS) -> dict:
    source = Path(path)
    seen: set[tuple[str, str]] = set()
    modes: Counter[str] = Counter()
    timestamps: list[datetime] = []
    count = 0
    start = datetime.fromisoformat(COVERAGE_START.replace("Z", "+00:00"))
    end = datetime.fromisoformat(COVERAGE_END_EXCLUSIVE.replace("Z", "+00:00"))

    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"calendar schema missing columns: {sorted(missing)}")
        for line_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"calendar row {line_number} has extra columns")
            if any(not (row.get(column) or "").strip() for column in REQUIRED_COLUMNS):
                raise ValueError(f"calendar row {line_number} has blank required fields")
            if row["impact"].strip().lower() != "high":
                raise ValueError(f"calendar row {line_number} is not high impact")
            if row["currency"].strip().upper() != "USD" or row["country"].strip().upper() != "US":
                raise ValueError(f"calendar row {line_number} is not a US USD event")
            if row["calendar_source"] != "MQL5 Economic Calendar":
                raise ValueError(f"calendar row {line_number} has unexpected source")
            if "GMT+0" not in row["calendar_timezone"]:
                raise ValueError(f"calendar row {line_number} has unexpected timezone metadata")
            if row["coverage_start_utc"] != COVERAGE_START or row["coverage_end_exclusive_utc"] != COVERAGE_END_EXCLUSIVE:
                raise ValueError(f"calendar row {line_number} has inconsistent coverage metadata")
            if row["time_mode"] != "datetime":
                raise ValueError(f"calendar row {line_number} has unsupported time_mode={row['time_mode']!r}")
            try:
                timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError(f"calendar row {line_number} has invalid timestamp") from exc
            if timestamp.tzinfo is None or timestamp.utcoffset() != timezone.utc.utcoffset(timestamp):
                raise ValueError(f"calendar row {line_number} timestamp is not explicit UTC")
            if not start <= timestamp < end:
                raise ValueError(f"calendar row {line_number} is outside requested UTC coverage")
            key = (row["event_id"].strip(), row["value_id"].strip())
            if key in seen:
                raise ValueError(f"calendar duplicate event/value id at row {line_number}: {key}")
            seen.add(key)
            timestamps.append(timestamp)
            modes[row["time_mode"]] += 1
            count += 1

    if count != expected_rows:
        raise ValueError(f"calendar row count mismatch: expected={expected_rows} actual={count}")
    if not timestamps:
        raise ValueError("calendar contains no events")
    return {
        "rows": count,
        "time_mode_counts": dict(modes),
        "coverage_start_utc": COVERAGE_START,
        "coverage_end_exclusive_utc": COVERAGE_END_EXCLUSIVE,
        "unique_event_value_ids": len(seen),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("calendar_csv", type=Path)
    parser.add_argument("--expected-rows", type=int, default=EXPECTED_ROWS)
    args = parser.parse_args()
    result = validate_calendar(args.calendar_csv, args.expected_rows)
    print("NEWS_CALENDAR_VALIDATED " + " ".join(f"{key}={value}" for key, value in result.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
