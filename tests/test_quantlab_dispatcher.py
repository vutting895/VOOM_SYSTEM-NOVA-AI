from __future__ import annotations

import csv
import hashlib
import json

from workers.quant_engine.dispatcher import process_claim
from workers.quant_engine.queue_store import SQLiteQuantLabQueue


def _artifact(root):
    folder = root / "tenant-a" / "dataset-a"
    folder.mkdir(parents=True)
    path = folder / "data.csv"
    rows = [
        {"timestamp": "2026-01-01T00:00:00Z", "open": "100", "high": "102", "low": "99", "close": "101", "volume": "10"},
        {"timestamp": "2026-01-01T01:00:00Z", "open": "101", "high": "103", "low": "100", "close": "102", "volume": "11"},
    ]
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    raw = path.read_bytes()
    manifest = {
        "schema_version": "nova.dataset-artifact.v1",
        "dataset_id": "dataset-a",
        "symbol": "XAUUSDm",
        "timeframe": "H1",
        "interval_seconds": 3600,
        "row_count": 2,
        "data_file": "data.csv",
        "data_size_bytes": len(raw),
        "data_sha256": hashlib.sha256(raw).hexdigest(),
        "source": {"provider": "test", "source_ref": "fixture", "exported_at": "2026-01-01T02:00:00Z"},
    }
    (folder / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def _claim(queue, job_type, experiment):
    queue.create(tenant_id="tenant-a", requester_id="user-a", job_type=job_type,
                 payload={"experiment": experiment}, timeout_seconds=60,
                 idempotency_key="dispatcher-test-key-01")
    claim = queue.claim(worker_id="test-worker", lease_seconds=30)
    assert claim is not None
    return claim


def test_dispatcher_validates_dataset_and_persists_success(tmp_path):
    db = SQLiteQuantLabQueue(str(tmp_path / "queue.sqlite3"))
    artifacts = tmp_path / "artifacts"
    _artifact(artifacts)
    claim = _claim(db, "dataset.validate", {"dataset_artifact_id": "dataset-a", "reject_gaps": True})

    result = process_claim(db, claim, "test-worker", artifact_root=str(artifacts))

    assert result["state"] == "SUCCEEDED"
    persisted = db.get(tenant_id="tenant-a", job_id=claim["job"]["job_id"])
    assert persisted["result"]["validation"] == "PASSED"


def test_dispatcher_rejects_unimplemented_training_without_fake_result(tmp_path):
    db = SQLiteQuantLabQueue(str(tmp_path / "queue.sqlite3"))
    claim = _claim(db, "train", {"model": "not-executable"})

    result = process_claim(db, claim, "test-worker")

    assert result["state"] == "REJECTED"
    persisted = db.get(tenant_id="tenant-a", job_id=claim["job"]["job_id"])
    assert persisted["result"] is None
    assert persisted["last_error_code"] == "executor_not_implemented"
