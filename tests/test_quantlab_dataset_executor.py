from __future__ import annotations

import csv
import hashlib
import json

import pytest

from workers.quant_engine.dataset_artifact import DatasetArtifactError, validate_dataset_artifact
from workers.quant_engine.dataset_executor import UnsupportedJobType, execute_claimed_job


def make_artifact(root, *, tenant="user-a", dataset="xau-h1", rows=None):
    rows = rows or [
        {"timestamp": "2026-01-01T00:00:00Z", "open": "100", "high": "102", "low": "99", "close": "101", "volume": "12"},
        {"timestamp": "2026-01-01T01:00:00Z", "open": "101", "high": "103", "low": "100", "close": "102", "volume": "14"},
    ]
    folder = root / tenant / dataset
    folder.mkdir(parents=True)
    data = folder / "data.csv"
    with data.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["timestamp", "open", "high", "low", "close", "volume"])
        writer.writeheader()
        writer.writerows(rows)
    raw = data.read_bytes()
    manifest = {
        "schema_version": "nova.dataset-artifact.v1",
        "dataset_id": dataset,
        "symbol": "XAUUSDm",
        "timeframe": "H1",
        "interval_seconds": 3600,
        "row_count": len(rows),
        "data_file": "data.csv",
        "data_size_bytes": len(raw),
        "data_sha256": hashlib.sha256(raw).hexdigest(),
        "source": {"provider": "test-fixture", "source_ref": "fixture-01", "exported_at": "2026-01-01T02:00:00Z"},
    }
    (folder / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return folder


def test_valid_artifact_is_verified_and_fingerprinted(tmp_path):
    make_artifact(tmp_path)
    result = validate_dataset_artifact(artifact_root=str(tmp_path), tenant_id="user-a", dataset_id="xau-h1")
    assert result["validation"] == "PASSED"
    assert result["quality"]["row_count"] == 2
    assert len(result["dataset_sha256"]) == 64


def test_wrong_tenant_cannot_resolve_another_tenants_artifact(tmp_path):
    make_artifact(tmp_path)
    with pytest.raises(DatasetArtifactError, match="artifact_directory_missing_or_invalid"):
        validate_dataset_artifact(artifact_root=str(tmp_path), tenant_id="user-b", dataset_id="xau-h1")


def test_rejects_path_traversal_and_invalid_ids(tmp_path):
    make_artifact(tmp_path)
    with pytest.raises(DatasetArtifactError, match="invalid_dataset_id"):
        validate_dataset_artifact(artifact_root=str(tmp_path), tenant_id="user-a", dataset_id="../outside")


def test_rejects_symlink_escape(tmp_path):
    make_artifact(tmp_path)
    outside = tmp_path.parent / "outside-dataset"
    outside.mkdir()
    (outside / "data.csv").write_text("not allowed", encoding="utf-8")
    folder = tmp_path / "user-a" / "xau-h1"
    (folder / "data.csv").unlink()
    (folder / "data.csv").symlink_to(outside / "data.csv")
    with pytest.raises(DatasetArtifactError, match="symlink_not_allowed"):
        validate_dataset_artifact(artifact_root=str(tmp_path), tenant_id="user-a", dataset_id="xau-h1")


def test_rejects_modified_data_and_manifest_mismatch(tmp_path):
    folder = make_artifact(tmp_path)
    with (folder / "data.csv").open("a", encoding="utf-8") as handle:
        handle.write("\n")
    with pytest.raises(DatasetArtifactError, match="manifest_data_size_mismatch|data_sha256_mismatch"):
        validate_dataset_artifact(artifact_root=str(tmp_path), tenant_id="user-a", dataset_id="xau-h1")


def test_rejects_gaps_when_policy_requires_contiguous_candles(tmp_path):
    rows = [
        {"timestamp": "2026-01-01T00:00:00Z", "open": "100", "high": "102", "low": "99", "close": "101", "volume": "12"},
        {"timestamp": "2026-01-01T02:00:00Z", "open": "101", "high": "103", "low": "100", "close": "102", "volume": "14"},
    ]
    make_artifact(tmp_path, rows=rows)
    with pytest.raises(DatasetArtifactError, match="ohlcv_validation_failed"):
        validate_dataset_artifact(artifact_root=str(tmp_path), tenant_id="user-a",
                                  dataset_id="xau-h1", reject_gaps=True)


def test_executor_only_runs_dataset_validation(tmp_path):
    make_artifact(tmp_path)
    claim = {
        "job": {"job_type": "dataset.validate", "tenant_id": "user-a"},
        "payload": {"experiment": {"dataset_artifact_id": "xau-h1", "reject_gaps": True}},
    }
    result = execute_claimed_job(claim, artifact_root=str(tmp_path))
    assert result["validation"] == "PASSED"
    claim["job"]["job_type"] = "train"
    with pytest.raises(UnsupportedJobType):
        execute_claimed_job(claim, artifact_root=str(tmp_path))


def test_rejects_symlinked_tenant_directory(tmp_path):
    real = tmp_path / "real-tenant"
    make_artifact(real, tenant="user-a")
    (tmp_path / "user-a").symlink_to(real / "user-a", target_is_directory=True)
    with pytest.raises(DatasetArtifactError, match="symlink_not_allowed"):
        validate_dataset_artifact(artifact_root=str(tmp_path), tenant_id="user-a", dataset_id="xau-h1")
