"""Contract tests for immutable NOVA dataset manifests and artifact storage."""
import unittest
from hashlib import sha256

from workers.quant_engine import (
    DatasetRegistryError,
    build_dataset_manifest,
    canonical_dataset_sha256,
    register_dataset_snapshot,
)


def sample_rows():
    rows = []
    for index, close in enumerate((100.0, 101.0, 102.0)):
        rows.append({
            "timestamp": f"2026-01-01T0{index}:00:00Z",
            "open": close - 0.2,
            "high": close + 0.5,
            "low": close - 0.5,
            "close": close,
            "volume": 10,
        })
    return rows


def metadata(ingested_at="2026-01-02T00:00:00Z"):
    return {
        "provider": "test-provider",
        "source": "fixture",
        "symbol": "xauusdm",
        "timeframe": "1h",
        "asset_class": "metal",
        "requested_start": "2026-01-01T00:00:00Z",
        "requested_end": "2026-01-01T03:00:00Z",
        "ingested_at": ingested_at,
        "expected_interval_seconds": 3600,
    }


class FakeImmutableStore:
    def __init__(self):
        self.objects = {}

    def put_if_absent(self, key, payload, content_sha256):
        self.assert_hash(payload, content_sha256)
        if key in self.objects and self.objects[key] != payload:
            raise RuntimeError("immutable object conflict")
        self.objects[key] = payload
        return {"storage_uri": f"test://{key}", "object_version": content_sha256}

    @staticmethod
    def assert_hash(payload, expected):
        if sha256(payload).hexdigest() != expected:
            raise AssertionError("artifact checksum mismatch")


class DatasetRegistryTests(unittest.TestCase):
    def test_manifest_is_canonical_and_checksum_matches_payload(self):
        manifest, payload = build_dataset_manifest(sample_rows(), **metadata())
        self.assertEqual(manifest["schema_version"], "nova.dataset.v1")
        self.assertEqual(manifest["symbol"], "XAUUSDM")
        self.assertEqual(manifest["quality_status"], "passed")
        self.assertEqual(manifest["row_count"], 3)
        self.assertEqual(manifest["content_sha256"], canonical_dataset_sha256(sample_rows()))
        self.assertEqual(payload.count(b'"timestamp"'), 3)

    def test_dataset_identity_is_stable_across_ingestion_time(self):
        first, _ = build_dataset_manifest(sample_rows(), **metadata("2026-01-02T00:00:00Z"))
        second, _ = build_dataset_manifest(sample_rows(), **metadata("2026-01-03T00:00:00Z"))
        self.assertEqual(first["dataset_id"], second["dataset_id"])
        self.assertNotEqual(first["ingested_at"], second["ingested_at"])

    def test_gaps_are_reported_and_can_be_rejected(self):
        rows = sample_rows()
        rows[2]["timestamp"] = "2026-01-01T04:00:00Z"
        manifest, _ = build_dataset_manifest(rows, **metadata())
        self.assertEqual(manifest["gap_count"], 1)
        self.assertEqual(manifest["quality_status"], "warning")
        with self.assertRaises(Exception):
            build_dataset_manifest(rows, **{**metadata(), "reject_gaps": True})

    def test_duplicate_or_out_of_order_rows_are_rejected(self):
        rows = sample_rows()
        rows[2]["timestamp"] = rows[1]["timestamp"]
        with self.assertRaises(Exception):
            build_dataset_manifest(rows, **metadata())

    def test_registration_requires_immutable_store_and_returns_versioned_reference(self):
        store = FakeImmutableStore()
        result = register_dataset_snapshot(sample_rows(), store=store, **metadata())
        self.assertTrue(result["storage_uri"].startswith("test://datasets/"))
        self.assertTrue(result["object_version"])
        self.assertEqual(result["artifact_sha256"], sha256(next(iter(store.objects.values()))).hexdigest())

    def test_invalid_metadata_is_rejected(self):
        bad = metadata()
        bad["requested_start"] = "2026-01-01T00:00:00"
        with self.assertRaises(DatasetRegistryError):
            build_dataset_manifest(sample_rows(), **bad)


if __name__ == "__main__":
    unittest.main(verbosity=2)
