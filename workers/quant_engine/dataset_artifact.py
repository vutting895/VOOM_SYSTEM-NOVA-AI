"""Tenant-scoped, read-only dataset artifact resolver for QuantLab.

Artifacts are pre-staged by a trusted ingestion process. User requests may
reference an artifact ID only; they can never supply filesystem paths or URLs.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import stat
from dataclasses import asdict
from pathlib import Path
from typing import Any

from workers.quant_engine.quality import (
    DatasetValidationError,
    canonical_dataset_sha256,
    validate_ohlcv,
)

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_REQUIRED_MANIFEST = {
    "schema_version", "dataset_id", "symbol", "timeframe",
    "interval_seconds", "row_count", "data_file", "data_size_bytes",
    "data_sha256", "source",
}
_MAX_MANIFEST_BYTES = 32_768
_MAX_DATA_BYTES = 32 * 1024 * 1024
_MAX_ROWS = 250_000
_MAX_LINE_BYTES = 4096


class DatasetArtifactError(ValueError):
    """An artifact is missing, unsafe, malformed, or inconsistent."""


def _safe_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _ID.fullmatch(value):
        raise DatasetArtifactError(f"invalid_{label}")
    return value


def _regular_file(path: Path, root: Path) -> Path:
    try:
        current = path
        while current != root:
            if current.is_symlink():
                raise DatasetArtifactError("symlink_not_allowed")
            current = current.parent
        if root.is_symlink() or not path.is_file():
            raise DatasetArtifactError("artifact_file_missing_or_not_regular")
        resolved = path.resolve(strict=True)
        resolved.relative_to(root)
        info = resolved.stat()
        if not stat.S_ISREG(info.st_mode):
            raise DatasetArtifactError("artifact_file_not_regular")
        return resolved
    except (OSError, RuntimeError, ValueError) as exc:
        if isinstance(exc, DatasetArtifactError):
            raise
        raise DatasetArtifactError("artifact_path_invalid") from None


def _load_manifest(path: Path) -> dict[str, Any]:
    try:
        if path.stat().st_size > _MAX_MANIFEST_BYTES:
            raise DatasetArtifactError("manifest_too_large")
        raw = path.read_text(encoding="utf-8")
        manifest = json.loads(raw)
    except DatasetArtifactError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise DatasetArtifactError("manifest_unreadable_or_invalid") from None
    if not isinstance(manifest, dict) or set(manifest) != _REQUIRED_MANIFEST:
        raise DatasetArtifactError("manifest_schema_mismatch")
    if manifest["schema_version"] != "nova.dataset-artifact.v1":
        raise DatasetArtifactError("unsupported_manifest_version")
    _safe_id(manifest["dataset_id"], "dataset_id")
    if not isinstance(manifest["symbol"], str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,32}", manifest["symbol"]):
        raise DatasetArtifactError("invalid_symbol")
    if manifest["timeframe"] not in {"M1", "M5", "M15", "M30", "H1", "H4", "D1"}:
        raise DatasetArtifactError("invalid_timeframe")
    interval = manifest["interval_seconds"]
    if isinstance(interval, bool) or not isinstance(interval, int) or interval <= 0:
        raise DatasetArtifactError("invalid_interval")
    rows = manifest["row_count"]
    size = manifest["data_size_bytes"]
    if isinstance(rows, bool) or not isinstance(rows, int) or not 1 <= rows <= _MAX_ROWS:
        raise DatasetArtifactError("invalid_row_count")
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= _MAX_DATA_BYTES:
        raise DatasetArtifactError("invalid_data_size")
    if manifest["data_file"] != "data.csv":
        raise DatasetArtifactError("unsupported_data_file")
    if not isinstance(manifest["data_sha256"], str) or not _SHA256.fullmatch(manifest["data_sha256"]):
        raise DatasetArtifactError("invalid_data_sha256")
    source = manifest["source"]
    if (not isinstance(source, dict) or set(source) != {"provider", "source_ref", "exported_at"}
            or any(not isinstance(source[k], str) or not source[k].strip() or len(source[k]) > 256
                   for k in source)):
        raise DatasetArtifactError("invalid_source_provenance")
    return manifest


def _read_csv(path: Path, expected_rows: int) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    required = ["timestamp", "open", "high", "low", "close", "volume"]
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, strict=True)
            if reader.fieldnames != required:
                raise DatasetArtifactError("csv_header_mismatch")
            for index, row in enumerate(reader):
                if index >= _MAX_ROWS:
                    raise DatasetArtifactError("dataset_row_limit_exceeded")
                if None in row or any(value is None or len(value) > _MAX_LINE_BYTES for value in row.values()):
                    raise DatasetArtifactError("csv_row_malformed")
                rows.append(row)
    except DatasetArtifactError:
        raise
    except (OSError, UnicodeError, csv.Error):
        raise DatasetArtifactError("csv_unreadable_or_invalid") from None
    if len(rows) != expected_rows:
        raise DatasetArtifactError("manifest_row_count_mismatch")
    return rows


def validate_dataset_artifact(
    *, artifact_root: str, tenant_id: str, dataset_id: str,
    expected_dataset_sha256: str | None = None, reject_gaps: bool = False,
) -> dict[str, Any]:
    """Resolve and validate one immutable tenant artifact without network access."""
    tenant = _safe_id(tenant_id, "tenant_id")
    dataset = _safe_id(dataset_id, "dataset_id")
    if expected_dataset_sha256 is not None and (
        not isinstance(expected_dataset_sha256, str) or not _SHA256.fullmatch(expected_dataset_sha256)
    ):
        raise DatasetArtifactError("invalid_expected_dataset_sha256")
    if not isinstance(reject_gaps, bool):
        raise DatasetArtifactError("invalid_reject_gaps")
    try:
        root_path = Path(artifact_root)
        if not root_path.is_absolute() or not root_path.exists() or root_path.is_symlink():
            raise DatasetArtifactError("artifact_root_not_configured")
        root = root_path.resolve(strict=True)
        tenant_dir = _regular_dir(root / tenant, root)
        dataset_dir = _regular_dir(tenant_dir / dataset, root)
        manifest_path = _regular_file(dataset_dir / "manifest.json", root)
        manifest = _load_manifest(manifest_path)
        if manifest["dataset_id"] != dataset:
            raise DatasetArtifactError("manifest_dataset_id_mismatch")
        data_path = _regular_file(dataset_dir / "data.csv", root)
        if data_path.stat().st_size != manifest["data_size_bytes"]:
            raise DatasetArtifactError("manifest_data_size_mismatch")
        digest = hashlib.sha256()
        with data_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != manifest["data_sha256"]:
            raise DatasetArtifactError("data_sha256_mismatch")
        rows = _read_csv(data_path, manifest["row_count"])
        report = validate_ohlcv(
            rows, expected_interval_seconds=manifest["interval_seconds"], reject_gaps=reject_gaps
        )
        canonical_sha = canonical_dataset_sha256(rows)
        if expected_dataset_sha256 and canonical_sha != expected_dataset_sha256:
            raise DatasetArtifactError("canonical_dataset_sha256_mismatch")
        return {
            "schema_version": "nova.dataset-validation-result.v1",
            "dataset_id": dataset,
            "symbol": manifest["symbol"],
            "timeframe": manifest["timeframe"],
            "dataset_sha256": canonical_sha,
            "data_sha256": manifest["data_sha256"],
            "quality": asdict(report),
            "provenance": manifest["source"],
            "validation": "PASSED",
        }
    except DatasetArtifactError:
        raise
    except DatasetValidationError as exc:
        raise DatasetArtifactError("ohlcv_validation_failed: " + str(exc)[:240]) from None
    except OSError:
        raise DatasetArtifactError("artifact_io_error") from None


def _regular_dir(path: Path, root: Path) -> Path:
    try:
        current = path
        while current != root:
            if current.is_symlink():
                raise DatasetArtifactError("symlink_not_allowed")
            current = current.parent
        resolved = path.resolve(strict=True)
        resolved.relative_to(root)
        if not resolved.is_dir():
            raise DatasetArtifactError("artifact_directory_invalid")
        return resolved
    except DatasetArtifactError:
        raise
    except (OSError, RuntimeError, ValueError):
        raise DatasetArtifactError("artifact_directory_missing_or_invalid") from None
