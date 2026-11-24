"""Immutable OHLCV dataset manifest construction and storage boundary.

This module does not provision cloud storage or claim durable persistence by itself.
A production adapter must implement put_if_absent with immutable/versioned semantics.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from hashlib import sha256
import json
import re
from typing import Protocol, Any

from .quality import canonical_dataset_sha256, validate_ohlcv

SCHEMA_VERSION = "nova.dataset.v1"
_ID_PART = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")


class DatasetRegistryError(ValueError):
    """Raised when dataset metadata or immutable storage registration is invalid."""


class ImmutableArtifactStore(Protocol):
    def put_if_absent(self, key: str, payload: bytes, content_sha256: str) -> Mapping[str, str]:
        """Store bytes immutably; return storage_uri and object_version.

        Implementations must fail if the key already exists with different bytes.
        """
        ...


def _required_text(value: Any, field: str, *, identifier: bool = False) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 128:
        raise DatasetRegistryError(f"{field} must be a non-empty string of at most 128 characters")
    result = value.strip()
    if identifier and not _ID_PART.fullmatch(result):
        raise DatasetRegistryError(f"{field} contains unsupported characters")
    return result


def _utc_iso(value: str | datetime, field: str) -> str:
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise DatasetRegistryError(f"{field} must be ISO-8601") from exc
    elif isinstance(value, datetime):
        parsed = value
    else:
        raise DatasetRegistryError(f"{field} must be an ISO-8601 string or datetime")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise DatasetRegistryError(f"{field} must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def build_dataset_manifest(
    rows: Sequence[Mapping[str, Any]],
    *,
    provider: str,
    source: str,
    symbol: str,
    timeframe: str,
    asset_class: str,
    requested_start: str | datetime,
    requested_end: str | datetime,
    ingested_at: str | datetime,
    expected_interval_seconds: int | None = None,
    reject_gaps: bool = False,
) -> tuple[dict[str, Any], bytes]:
    """Build canonical immutable dataset manifest and normalized OHLCV bytes."""
    provider = _required_text(provider, "provider", identifier=True)
    source = _required_text(source, "source", identifier=True)
    symbol = _required_text(symbol, "symbol", identifier=True).upper()
    timeframe = _required_text(timeframe, "timeframe", identifier=True)
    asset_class = _required_text(asset_class, "asset_class", identifier=True).lower()
    start = _utc_iso(requested_start, "requested_start")
    end = _utc_iso(requested_end, "requested_end")
    ingested = _utc_iso(ingested_at, "ingested_at")
    if start >= end:
        raise DatasetRegistryError("requested_start must be earlier than requested_end")

    quality = validate_ohlcv(
        rows,
        expected_interval_seconds=expected_interval_seconds,
        reject_gaps=reject_gaps,
    )
    content_hash = canonical_dataset_sha256(rows)
    normalized = []
    for row in rows:
        timestamp = row["timestamp"]
        if isinstance(timestamp, datetime):
            timestamp = timestamp.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
        elif timestamp.endswith("Z"):
            pass
        else:
            parsed = datetime.fromisoformat(timestamp)
            timestamp = parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
        normalized.append({
            "timestamp": timestamp,
            "open": str(row["open"]),
            "high": str(row["high"]),
            "low": str(row["low"]),
            "close": str(row["close"]),
            "volume": str(row["volume"]),
        })
    normalized_payload = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

    manifest_core = {
        "schema_version": SCHEMA_VERSION,
        "content_sha256": content_hash,
        "provider": provider,
        "source": source,
        "symbol": symbol,
        "timeframe": timeframe,
        "asset_class": asset_class,
        "requested_start": start,
        "requested_end": end,
        "actual_start": quality.start_timestamp,
        "actual_end": quality.end_timestamp,
        "row_count": quality.row_count,
        "schema": "nova.ohlcv.v1",
        "ingested_at": ingested,
        "quality_status": "warning" if quality.warnings else "passed",
        "quality_warnings": list(quality.warnings),
        "gap_count": quality.observed_gap_count,
        "irregular_interval_count": quality.observed_irregular_interval_count,
        "duplicate_count": 0,
        "expected_interval_seconds": expected_interval_seconds,
    }
    identity_payload = json.dumps(manifest_core, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    manifest_id = sha256(identity_payload.encode("utf-8")).hexdigest()
    manifest = {"dataset_id": f"dataset-{manifest_id[:32]}", **manifest_core}
    return manifest, normalized_payload


def register_dataset_snapshot(
    rows: Sequence[Mapping[str, Any]],
    *,
    store: ImmutableArtifactStore,
    **metadata: Any,
) -> dict[str, Any]:
    """Persist normalized rows through a caller-supplied immutable object store."""
    if not hasattr(store, "put_if_absent") or not callable(store.put_if_absent):
        raise DatasetRegistryError("store must implement immutable put_if_absent")
    manifest, payload = build_dataset_manifest(rows, **metadata)
    artifact_hash = sha256(payload).hexdigest()
    key = f"datasets/{manifest['dataset_id']}/{artifact_hash}.json"
    reference = store.put_if_absent(key, payload, artifact_hash)
    if not isinstance(reference, Mapping):
        raise DatasetRegistryError("artifact store must return a mapping")
    storage_uri = reference.get("storage_uri")
    object_version = reference.get("object_version")
    if not isinstance(storage_uri, str) or not storage_uri.strip():
        raise DatasetRegistryError("artifact store did not return storage_uri")
    if not isinstance(object_version, str) or not object_version.strip():
        raise DatasetRegistryError("artifact store did not return object_version")
    return {
        **manifest,
        "storage_uri": storage_uri,
        "object_version": object_version,
        "artifact_sha256": artifact_hash,
    }
