#!/usr/bin/env python3
"""Validate the committed Exness Demo XAUUSDm M15 research dataset."""
from __future__ import annotations

import csv
import hashlib
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "datasets/exness/demo/xauusdm_m15"
CSV_PATH = DATA_DIR / "ohlcv_2022-07-21_2026-10-29.csv"
MANIFEST_PATH = DATA_DIR / "dataset_manifest.json"
EXPECTED_COLUMNS = {
    "timestamp", "open", "high", "low", "close", "volume",
    "tick_volume", "spread_points", "spread_price", "real_volume",
}


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    digest = hashlib.sha256(CSV_PATH.read_bytes()).hexdigest()
    if digest != manifest["csv_sha256"]:
        raise SystemExit("FAIL: CSV SHA-256 does not match manifest")
    if CSV_PATH.stat().st_size != manifest["csv_size_bytes"]:
        raise SystemExit("FAIL: CSV byte size does not match manifest")

    count = 0
    previous = None
    first = last = None
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if set(reader.fieldnames or ()) != EXPECTED_COLUMNS:
            raise SystemExit("FAIL: unexpected CSV schema")
        for row in reader:
            count += 1
            timestamp = row["timestamp"]
            if first is None:
                first = timestamp
            if previous is not None and timestamp <= previous:
                raise SystemExit("FAIL: timestamps are duplicate or not ascending")
            previous = last = timestamp
            try:
                open_, high, low, close, volume = (
                    Decimal(row[key])
                    for key in ("open", "high", "low", "close", "volume")
                )
            except (InvalidOperation, KeyError) as exc:
                raise SystemExit("FAIL: invalid numeric OHLCV value") from exc
            if high < max(open_, close) or low > min(open_, close):
                raise SystemExit("FAIL: OHLC range does not contain open/close")
            if high < low or volume < 0:
                raise SystemExit("FAIL: invalid high/low or negative volume")

    if count != manifest["row_count"]:
        raise SystemExit("FAIL: row count does not match manifest")
    if first != manifest["first_bar_utc"] or last != manifest["last_closed_bar_utc"]:
        raise SystemExit("FAIL: date range does not match manifest")
    print(
        f"PASS: rows={count}, sha256={digest}, "
        f"first={first}, last={last}"
    )


if __name__ == "__main__":
    main()
