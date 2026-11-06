#!/usr/bin/env python3
"""Integrity checks for versioned NOVA historical research datasets.

Checks immutable bytes before parsing, then verifies schema and candle order.
Missing hourly candles are reported, never synthesized. Legacy reports are
integrity-checked but are not accepted as labels or training data.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from validate_exness_dataset import main as validate_exness_dataset

ROOT = Path(__file__).resolve().parents[1]
BINANCE_DIR = ROOT / "datasets/public/binance/btcusdt_h1"
BINANCE_MANIFEST = BINANCE_DIR / "dataset_manifest.json"
LEGACY_MANIFEST = ROOT / "reports/legacy-learning-universe/manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_file(path: Path, *, expected_bytes: int, expected_sha256: str) -> None:
    if not path.is_file():
        raise SystemExit(f"FAIL: missing dataset artifact: {path.relative_to(ROOT)}")
    if path.stat().st_size != int(expected_bytes):
        raise SystemExit(
            f"FAIL: byte size mismatch for {path.relative_to(ROOT)}: "
            f"{path.stat().st_size} != {expected_bytes}"
        )
    actual_hash = sha256_file(path)
    if actual_hash != expected_sha256:
        raise SystemExit(
            f"FAIL: SHA-256 mismatch for {path.relative_to(ROOT)}: "
            f"{actual_hash} != {expected_sha256}"
        )


def parse_utc(value: str) -> datetime:
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise SystemExit(f"FAIL: invalid ISO timestamp: {value!r}") from exc
    if result.tzinfo is None or result.utcoffset() is None:
        raise SystemExit(f"FAIL: timestamp must be timezone-aware: {value!r}")
    if result.utcoffset() != timedelta(0):
        raise SystemExit(f"FAIL: timestamp must be UTC: {value!r}")
    return result.astimezone(timezone.utc)


def decimal_value(candle: dict[str, Any], key: str) -> Decimal:
    try:
        value = candle[key]
        result = value if isinstance(value, Decimal) else Decimal(str(value))
    except (KeyError, TypeError, ValueError) as exc:
        raise SystemExit(f"FAIL: invalid/missing Binance candle field {key!r}") from exc
    if not result.is_finite():
        raise SystemExit(f"FAIL: non-finite Binance candle field {key!r}")
    return result


def validate_binance_snapshot(filename: str, expected: dict[str, Any], manifest: dict[str, Any]) -> int:
    path = BINANCE_DIR / filename
    verify_file(path, expected_bytes=expected["bytes"], expected_sha256=expected["sha256"])
    try:
        payload = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SystemExit(f"FAIL: invalid Binance JSON: {filename}") from exc

    if payload.get("symbol") != manifest["symbol"] or payload.get("timeframe") != manifest["timeframe"]:
        raise SystemExit(f"FAIL: Binance instrument mismatch: {filename}")
    bars = payload.get("bars")
    if not isinstance(bars, list) or len(bars) != int(expected["row_count"]):
        raise SystemExit(f"FAIL: Binance row count mismatch: {filename}")

    previous = None
    first = last = None
    gap_count = 0
    for candle in bars:
        if candle.get("is_closed") is not True:
            raise SystemExit(f"FAIL: Binance file includes a non-closed candle: {filename}")
        timestamp = parse_utc(candle.get("timestamp"))
        close_timestamp = parse_utc(candle.get("close_timestamp"))
        if close_timestamp < timestamp or close_timestamp >= timestamp + timedelta(hours=1):
            raise SystemExit(f"FAIL: invalid Binance close timestamp: {filename}")
        if previous is not None:
            if timestamp <= previous:
                raise SystemExit(f"FAIL: Binance timestamps are duplicate/out of order: {filename}")
            delta = timestamp - previous
            if delta.total_seconds() % 3600 != 0:
                raise SystemExit(f"FAIL: Binance timestamps are not on hourly boundaries: {filename}")
            if delta > timedelta(hours=1):
                gap_count += int(delta.total_seconds() // 3600) - 1
        else:
            first = timestamp
        previous = last = timestamp

        open_ = decimal_value(candle, "open")
        high = decimal_value(candle, "high")
        low = decimal_value(candle, "low")
        close = decimal_value(candle, "close")
        volume = decimal_value(candle, "volume")
        if min(open_, high, low, close) <= 0 or volume < 0:
            raise SystemExit(f"FAIL: non-positive price or negative volume: {filename}")
        if high < max(open_, close) or low > min(open_, close) or high < low:
            raise SystemExit(f"FAIL: invalid OHLC range: {filename}")

    if first.isoformat() != expected["first_bar_utc"] or last.isoformat() != expected["last_bar_utc"]:
        raise SystemExit(f"FAIL: Binance date range mismatch: {filename}")
    return gap_count


def validate_binance() -> None:
    manifest = json.loads(BINANCE_MANIFEST.read_text(encoding="utf-8"))
    five_year_gaps = validate_binance_snapshot(
        manifest["five_year"]["file"], manifest["five_year"], manifest
    )
    recent_gaps = validate_binance_snapshot(
        manifest["recent_500"]["file"], manifest["recent_500"], manifest
    )
    # Known gaps are preserved as missing observations; never invent bars.
    print(
        "PASS: Binance BTCUSDT H1 snapshots "
        f"(5Y rows={manifest['five_year']['row_count']}, gaps={five_year_gaps}; "
        f"500 rows={manifest['recent_500']['row_count']}, gaps={recent_gaps})"
    )


def validate_legacy_reports() -> None:
    manifest = json.loads(LEGACY_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("status") != "historical_exploratory_reports":
        raise SystemExit("FAIL: unexpected legacy report manifest status")
    for item in manifest.get("files", []):
        path = ROOT / item["path"]
        verify_file(path, expected_bytes=item["bytes"], expected_sha256=item["sha256"])
    print("PASS: legacy report artifact hashes (integrity only; not training labels)")


def main() -> None:
    validate_exness_dataset()
    validate_binance()
    validate_legacy_reports()


if __name__ == "__main__":
    main()
