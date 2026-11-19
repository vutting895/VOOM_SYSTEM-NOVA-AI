"""Canonical 16-asset universe registry and fail-closed dataset readiness checks.

This module prepares a combined training plan only. It does not fetch data, fit
models, connect to brokers, or submit orders.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import re
from typing import Any, Iterable, Mapping

_SHA256 = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class UniverseAsset:
    asset_id: str
    symbol: str
    asset_class: str
    source_candidates: tuple[str, ...]
    market_calendar: str


UNIVERSE_16: tuple[UniverseAsset, ...] = (
    UniverseAsset("xau_usdm", "XAU/USDm", "metal", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("eur_usdm", "EUR/USDm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
    UniverseAsset("gbp_usdm", "GBP/USDm", "forex", ("exness_mt5_demo_readonly",), "fx_metals"),
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
    digest = sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_dataset_manifests(
    manifests: Iterable[Mapping[str, Any]],
    *,
    required_timeframes: tuple[str, ...] = ("H1", "H4", "D1"),
    verify_files: bool = True,
) -> dict[str, Any]:
    """Validate immutable per-asset/timeframe manifests without repairing data.

    Required fields: asset_id, symbol, timeframe, source, path, sha256,
    start_utc, end_utc, row_count, quality_status, coverage_status.
    Known gaps are not silently accepted: coverage must be COMPLETE.
    """
    if not required_timeframes or any(not isinstance(tf, str) or not tf for tf in required_timeframes):
        raise ValueError("required_timeframes must be a non-empty tuple of timeframe strings")

    seen: set[tuple[str, str]] = set()
    accepted: dict[tuple[str, str], dict[str, Any]] = {}
    rejected: list[dict[str, str]] = []

    for index, raw in enumerate(manifests):
        if not isinstance(raw, Mapping):
            rejected.append({"index": str(index), "reason": "INVALID_MANIFEST"})
            continue
        item = dict(raw)
        asset_id = item.get("asset_id")
        timeframe = item.get("timeframe")
        key = (str(asset_id), str(timeframe))
        if key in seen:
            rejected.append({"index": str(index), "reason": "DUPLICATE_ASSET_TIMEFRAME"})
            continue
        seen.add(key)

        asset = ASSET_BY_ID.get(str(asset_id))
        if asset is None or item.get("symbol") != asset.symbol:
            rejected.append({"index": str(index), "reason": "UNKNOWN_ASSET_OR_SYMBOL_MISMATCH"})
            continue
        if timeframe not in required_timeframes:
            continue
        required = (
            "source", "path", "sha256", "start_utc", "end_utc",
            "row_count", "quality_status", "coverage_status",
        )
        missing = [field for field in required if item.get(field) in (None, "")]
        if missing:
            rejected.append({"index": str(index), "reason": "MISSING_FIELDS:" + ",".join(missing)})
            continue
        if item["source"] not in asset.source_candidates:
            rejected.append({"index": str(index), "reason": "UNAPPROVED_SOURCE"})
            continue
        if not isinstance(item["row_count"], int) or isinstance(item["row_count"], bool) or item["row_count"] <= 0:
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

        file_path = Path(str(item["path"]))
        if verify_files:
            if not file_path.is_file():
                rejected.append({"index": str(index), "reason": "DATA_FILE_MISSING"})
                continue
            if sha256_file(file_path) != item["sha256"]:
                rejected.append({"index": str(index), "reason": "DATA_SHA256_MISMATCH"})
                continue

        accepted[key] = item

    per_asset = []
    for asset in UNIVERSE_16:
        missing_tfs = [tf for tf in required_timeframes if (asset.asset_id, tf) not in accepted]
        per_asset.append({
            "asset_id": asset.asset_id,
            "symbol": asset.symbol,
            "status": "READY" if not missing_tfs else "BLOCKED",
            "missing_timeframes": missing_tfs,
        })

    ready_assets = sum(item["status"] == "READY" for item in per_asset)
    combined_ready = ready_assets == len(UNIVERSE_16) and not rejected
    return {
        "schema_version": "nova.universe-dataset-gate.v1",
        "universe_asset_count": len(UNIVERSE_16),
        "required_timeframes": list(required_timeframes),
        "ready_asset_count": ready_assets,
        "blocked_asset_count": len(UNIVERSE_16) - ready_assets,
        "combined_training_eligible": combined_ready,
        "accepted_manifest_count": len(accepted),
        "rejected_manifest_count": len(rejected),
        "assets": per_asset,
        "rejections": rejected,
        "training_started": False,
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
