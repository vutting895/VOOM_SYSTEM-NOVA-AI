"""Canonical 16-asset registry and fail-closed dataset manifest gate.

This module validates metadata and file identity only. It never downloads data,
repairs candles, fits models, promotes models, or connects to a broker.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import re
from typing import Any, Iterable, Mapping

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_SUPPORTED_TIMEFRAMES = frozenset({"M1", "M5", "M15", "M30", "H1", "H4", "D1"})


@dataclass(frozen=True)
class UniverseAsset:
    asset_id: str
    symbol: str
    asset_class: str
    source_candidates: tuple[str, ...]
    market_calendar: str


# Identifiers match the repository's ALL_MAJOR_PAIRS declaration.
# These identifiers do not prove that any provider feed is connected.
UNIVERSE_16: tuple[UniverseAsset, ...] = (
    UniverseAsset("xau_usdm", "XAU/USDm", "metal", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("eur_usdm", "EUR/USDm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("gbp_usdm", "GBP/USDm", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("usd_jpym", "USD/JPYm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("usd_chfm", "USD/CHFm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("aud_usdm", "AUD/USDm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("usd_cadm", "USD/CADm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("nzd_usdm", "NZD/USDm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("btc_usdt", "BTC/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
    UniverseAsset("eth_usdt", "ETH/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
    UniverseAsset("sol_usdt", "SOL/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
    UniverseAsset("bnb_usdt", "BNB/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
    UniverseAsset("xrp_usdt", "XRP/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
    UniverseAsset("ada_usdt", "ADA/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
    UniverseAsset("doge_usdt", "DOGE/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
    UniverseAsset("ton_usdt", "TON/USDT", "crypto", ("binance_public", "bybit_public"), "crypto_24x7"),
)

ASSET_BY_ID = {asset.asset_id: asset for asset in UNIVERSE_16}
ASSET_BY_SYMBOL = {asset.symbol: asset for asset in UNIVERSE_16}


def sha256_file(path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    """Hash incrementally so large market files are not loaded into memory."""
    if isinstance(chunk_size, bool) or not isinstance(chunk_size, int) or chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")
    digest = sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _utc_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty ISO-8601 timestamp")
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(f"{field} must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field} must include an explicit UTC timezone")
    return parsed.astimezone(timezone.utc)


def validate_dataset_manifests(
    manifests: Iterable[Mapping[str, Any]],
    *,
    required_timeframes: tuple[str, ...] = ("H1", "H4", "D1"),
    verify_files: bool = True,
) -> dict[str, Any]:
    """Validate one manifest per asset/timeframe; reject ambiguous evidence.

    Required fields: asset_id, symbol, timeframe, source, path, sha256,
    start_utc, end_utc, row_count, quality_status, coverage_status.
    Only COMPLETE coverage is eligible. Metadata-only mode can never authorize
    training and exists solely to test manifest rejection logic.
    """
    if not isinstance(required_timeframes, tuple) or not required_timeframes:
        raise ValueError("required_timeframes must be a non-empty tuple")
    normalized_tfs = tuple(tf.strip().upper() if isinstance(tf, str) else "" for tf in required_timeframes)
    if any(tf not in _SUPPORTED_TIMEFRAMES for tf in normalized_tfs):
        raise ValueError("required_timeframes contains an unsupported timeframe")
    if len(set(normalized_tfs)) != len(normalized_tfs):
        raise ValueError("required_timeframes must not contain duplicates")
    if not isinstance(verify_files, bool):
        raise ValueError("verify_files must be boolean")

    seen: set[tuple[str, str]] = set()
    accepted: dict[tuple[str, str], dict[str, Any]] = {}
    rejected: list[dict[str, str]] = []

    for index, raw in enumerate(manifests):
        if not isinstance(raw, Mapping):
            rejected.append({"index": str(index), "reason": "INVALID_MANIFEST"})
            continue
        item = dict(raw)
        asset_id = item.get("asset_id")
        raw_tf = item.get("timeframe")
        timeframe = raw_tf.strip().upper() if isinstance(raw_tf, str) else ""
        key = (str(asset_id), timeframe)

        asset = ASSET_BY_ID.get(str(asset_id))
        if asset is None or item.get("symbol") != asset.symbol:
            rejected.append({"index": str(index), "reason": "UNKNOWN_ASSET_OR_SYMBOL_MISMATCH"})
            continue
        if timeframe not in _SUPPORTED_TIMEFRAMES:
            rejected.append({"index": str(index), "reason": "UNSUPPORTED_TIMEFRAME"})
            continue
        if key in seen:
            rejected.append({"index": str(index), "reason": "DUPLICATE_ASSET_TIMEFRAME"})
            continue
        seen.add(key)
        if timeframe not in normalized_tfs:
            continue

        required = ("source", "path", "sha256", "start_utc", "end_utc",
                    "row_count", "quality_status", "coverage_status")
        missing = [field for field in required if item.get(field) in (None, "")]
        if missing:
            rejected.append({"index": str(index), "reason": "MISSING_FIELDS:" + ",".join(missing)})
            continue
        if item["source"] not in asset.source_candidates:
            rejected.append({"index": str(index), "reason": "UNAPPROVED_SOURCE"})
            continue
        if isinstance(item["row_count"], bool) or not isinstance(item["row_count"], int) or item["row_count"] <= 0:
            rejected.append({"index": str(index), "reason": "INVALID_ROW_COUNT"})
            continue
        if not isinstance(item["sha256"], str) or not _SHA256.fullmatch(item["sha256"]):
            rejected.append({"index": str(index), "reason": "INVALID_SHA256"})
            continue
        if item["quality_status"] != "PASS":
            rejected.append({"index": str(index), "reason": "QUALITY_GATE_NOT_PASS"})
            continue
        if item["coverage_status"] != "COMPLETE":
            rejected.append({"index": str(index), "reason": "COVERAGE_NOT_COMPLETE"})
            continue
        try:
            start = _utc_timestamp(item["start_utc"], "start_utc")
            end = _utc_timestamp(item["end_utc"], "end_utc")
        except ValueError as exc:
            rejected.append({"index": str(index), "reason": "INVALID_UTC_RANGE:" + str(exc)})
            continue
        if end <= start:
            rejected.append({"index": str(index), "reason": "INVALID_UTC_RANGE: end_utc must be after start_utc"})
            continue

        file_path = Path(str(item["path"])).expanduser()
        if verify_files:
            if not file_path.is_file():
                rejected.append({"index": str(index), "reason": "DATA_FILE_MISSING"})
                continue
            try:
                actual_hash = sha256_file(file_path)
            except OSError:
                rejected.append({"index": str(index), "reason": "DATA_FILE_UNREADABLE"})
                continue
            if actual_hash != item["sha256"]:
                rejected.append({"index": str(index), "reason": "DATA_SHA256_MISMATCH"})
                continue
        accepted[key] = item

    per_asset = []
    for asset in UNIVERSE_16:
        missing_tfs = [tf for tf in normalized_tfs if (asset.asset_id, tf) not in accepted]
        per_asset.append({
            "asset_id": asset.asset_id,
            "symbol": asset.symbol,
            "status": "READY" if not missing_tfs else "BLOCKED",
            "missing_timeframes": missing_tfs,
        })

    ready_assets = sum(item["status"] == "READY" for item in per_asset)
    combined_ready = (
        verify_files
        and ready_assets == len(UNIVERSE_16)
        and not rejected
        and len(accepted) == len(UNIVERSE_16) * len(normalized_tfs)
    )
    return {
        "schema_version": "nova.universe-dataset-gate.v1",
        "universe_asset_count": len(UNIVERSE_16),
        "required_timeframes": list(normalized_tfs),
        "ready_asset_count": ready_assets,
        "blocked_asset_count": len(UNIVERSE_16) - ready_assets,
        "combined_training_eligible": combined_ready,
        "accepted_manifest_count": len(accepted),
        "rejected_manifest_count": len(rejected),
        "manifest_verification_mode": "FILE_AND_SHA256" if verify_files else "METADATA_ONLY",
        "assets": per_asset,
        "rejections": rejected,
        "training_started": False,
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
