#!/usr/bin/env python3
"""Validate the immutable Exness Demo MT5 historical USD calendar export."""
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "VOOM_USD_High_Impact_2022_2026.csv"
MANIFEST_PATH = ROOT / "VOOM_USD_High_Impact_2022_2026.manifest.json"
EXPECTED_SHA256 = "317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37"
EXPECTED_ROWS = 2166
START = datetime(2022, 7, 21, tzinfo=timezone.utc)
END = datetime(2026, 10, 30, tzinfo=timezone.utc)


def validate() -> dict:
    raw = CSV_PATH.read_bytes()
    if len(raw) != 386146:
        raise ValueError(f"unexpected canonical byte size: {len(raw)}")
    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError(f"canonical SHA-256 mismatch: {digest}")
    if b"\r\n" in raw:
        raise ValueError("canonical dataset must use LF line endings")

    rows = list(csv.DictReader(raw.decode("utf-8-sig").splitlines()))
    if len(rows) != EXPECTED_ROWS:
        raise ValueError(f"expected {EXPECTED_ROWS} rows, found {len(rows)}")

    required = (
        "timestamp", "impact", "currency", "event", "country",
        "time_mode", "calendar_source", "calendar_timezone",
        "coverage_start_utc", "coverage_end_exclusive_utc",
        "event_id", "value_id",
    )
    keys = set()
    for number, row in enumerate(rows, start=2):
        for field in required:
            if not row.get(field, "").strip():
                raise ValueError(f"blank {field} at CSV line {number}")
        if (row["impact"], row["currency"], row["country"], row["time_mode"]) != (
            "high", "USD", "US", "datetime"
        ):
            raise ValueError(f"unexpected event classification at CSV line {number}")
        if row["coverage_start_utc"] != "2022-07-21T00:00:00Z":
            raise ValueError(f"unexpected coverage start at CSV line {number}")
        if row["coverage_end_exclusive_utc"] != "2026-10-30T00:00:00Z":
            raise ValueError(f"unexpected coverage end at CSV line {number}")
        timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
        if timestamp.tzinfo != timezone.utc or not START <= timestamp < END:
            raise ValueError(f"timestamp out of range or not UTC at CSV line {number}")
        key = (row["event_id"], row["value_id"])
        if key in keys:
            raise ValueError(f"duplicate event/value identifiers at CSV line {number}")
        keys.add(key)

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest["integrity"]["canonical_git_lf_sha256"] != EXPECTED_SHA256:
        raise ValueError("manifest canonical SHA-256 does not match")
    if manifest["validation"]["rows"] != EXPECTED_ROWS:
        raise ValueError("manifest row count does not match")
    if manifest["export_evidence"] != {
        "success_markers": 2,
        "events": 2166,
        "queried_values": 15853,
        "unknown_time_modes": 0,
        "exported_at": "2026-10-30",
    }:
        raise ValueError("manifest export evidence changed unexpectedly")
    if not manifest["qualification"].startswith("Historical export evidence only."):
        raise ValueError("manifest must retain historical-export qualification")

    return {"status": "passed", "rows": len(rows), "bytes": len(raw), "sha256": digest}


if __name__ == "__main__":
    print(json.dumps(validate(), sort_keys=True))
