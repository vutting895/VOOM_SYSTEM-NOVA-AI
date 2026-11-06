#!/usr/bin/env python3
"""Validate the committed Exness Demo XAUUSDm M15 research dataset."""
from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "datasets/exness/demo/xauusdm_m15"
CSV_PATH = DATA_DIR / "ohlcv_2022-07-21_2026-10-29.csv"
METADATA_PATH = DATA_DIR / "source_metadata.json"
MANIFEST_PATH = DATA_DIR / "dataset_manifest.json"
EXPECTED_COLUMNS = {
    "timestamp", "open", "high", "low", "close", "volume",
    "tick_volume", "spread_points", "spread_price", "real_volume",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_utc(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SystemExit(f"FAIL: invalid ISO timestamp: {value!r}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise SystemExit(f"FAIL: timestamp must be timezone-aware: {value!r}")
    if parsed.utcoffset().total_seconds() != 0:
        raise SystemExit(f"FAIL: timestamp must be expressed in UTC: {value!r}")
    return parsed.astimezone(timezone.utc)


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    metadata_bytes = METADATA_PATH.read_bytes()
    metadata = json.loads(metadata_bytes.decode("utf-8"))

    metadata_hash = hashlib.sha256(metadata_bytes).hexdigest()
    if metadata_hash != manifest["metadata_source_sha256"]:
        raise SystemExit("FAIL: source metadata SHA-256 does not match manifest")
    if len(metadata_bytes) != manifest["source_metadata_size_bytes"]:
        raise SystemExit("FAIL: source metadata byte size does not match manifest")
    if metadata.get("sha256") != manifest["csv_sha256"]:
        raise SystemExit("FAIL: source metadata CSV hash disagrees with dataset manifest")
    if metadata.get("size_bytes") != manifest["csv_size_bytes"]:
        raise SystemExit("FAIL: source metadata CSV size disagrees with dataset manifest")
    if metadata.get("bar_count") != manifest["row_count"]:
        raise SystemExit("FAIL: source metadata bar count disagrees with dataset manifest")
    if metadata.get("symbol") != manifest["symbol"] or metadata.get("timeframe") != manifest["timeframe"]:
        raise SystemExit("FAIL: source metadata instrument disagrees with dataset manifest")
    if metadata.get("account_mode") != "DEMO" or metadata.get("account_identifier_stored") is not False:
        raise SystemExit("FAIL: source metadata account safety fields are invalid")

    csv_hash = sha256_file(CSV_PATH)
    if csv_hash != manifest["csv_sha256"]:
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
            parsed_timestamp = parse_utc(timestamp)
            if first is None:
                first = timestamp
            if previous is not None and parsed_timestamp <= previous:
                raise SystemExit("FAIL: timestamps are duplicate or not ascending")
            previous = parsed_timestamp
            last = timestamp
            try:
                open_, high, low, close, volume = (
                    Decimal(row[key])
                    for key in ("open", "high", "low", "close", "volume")
                )
            except (InvalidOperation, KeyError) as exc:
                raise SystemExit("FAIL: invalid numeric OHLCV value") from exc
            if not all(value.is_finite() for value in (open_, high, low, close, volume)):
                raise SystemExit("FAIL: non-finite OHLCV value")
            if min(open_, high, low, close) <= 0:
                raise SystemExit("FAIL: OHLC prices must be positive")
            if high < max(open_, close) or low > min(open_, close):
                raise SystemExit("FAIL: OHLC range does not contain open/close")
            if high < low or volume < 0:
                raise SystemExit("FAIL: invalid high/low or negative volume")

    if count != manifest["row_count"] or count != metadata["bar_count"]:
        raise SystemExit("FAIL: row count does not match manifest/metadata")
    if first != manifest["first_bar_utc"] or last != manifest["last_closed_bar_utc"]:
        raise SystemExit("FAIL: date range does not match manifest")
    if first != metadata["first_bar_utc"] or last != metadata["last_closed_bar_utc"]:
        raise SystemExit("FAIL: date range does not match source metadata")
    print(
        f"PASS: Exness rows={count}, csv_sha256={csv_hash}, "
        f"metadata_sha256={metadata_hash}, first={first}, last={last}"
    )


if __name__ == "__main__":
    main()
