import hashlib
import tempfile
import unittest
from pathlib import Path

from workers.quant_engine.universe import UNIVERSE_16, validate_dataset_manifests


class UniverseRegistryTests(unittest.TestCase):
    def make_manifest(self, asset, path, timeframe="H1"):
        return {
            "asset_id": asset.asset_id,
            "symbol": asset.symbol,
            "timeframe": timeframe,
            "source": asset.source_candidates[0],
            "path": str(path),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "start_utc": "2024-01-01T00:00:00Z",
            "end_utc": "2024-01-02T00:00:00Z",
            "row_count": 24,
            "quality_status": "PASS",
            "coverage_status": "COMPLETE",
        }

    def test_registry_has_sixteen_unique_assets(self):
        self.assertEqual(len(UNIVERSE_16), 16)
        self.assertEqual(len({a.asset_id for a in UNIVERSE_16}), 16)
        self.assertEqual(len({a.symbol for a in UNIVERSE_16}), 16)

    def test_missing_data_blocks_combined_training(self):
        result = validate_dataset_manifests([], required_timeframes=("H1",))
        self.assertFalse(result["combined_training_eligible"])
        self.assertEqual(result["ready_asset_count"], 0)
        self.assertFalse(result["live_trading_enabled"])

    def test_valid_file_is_accepted_but_partial_universe_is_blocked(self):
        asset = UNIVERSE_16[0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bars.csv"
            path.write_bytes(b"timestamp,open,high,low,close,volume\n")
            result = validate_dataset_manifests(
                [self.make_manifest(asset, path)], required_timeframes=("H1",)
            )
            self.assertEqual(result["accepted_manifest_count"], 1)
            self.assertFalse(result["combined_training_eligible"])
            self.assertEqual(result["manifest_verification_mode"], "FILE_AND_SHA256")

    def test_hash_mismatch_blocks_manifest(self):
        asset = UNIVERSE_16[0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bars.csv"
            path.write_bytes(b"real-data")
            manifest = self.make_manifest(asset, path)
            manifest["sha256"] = "0" * 64
            result = validate_dataset_manifests([manifest], required_timeframes=("H1",))
            self.assertEqual(result["rejections"][0]["reason"], "DATA_SHA256_MISMATCH")

    def test_known_gaps_are_not_accepted(self):
        asset = UNIVERSE_16[0]
        manifest = {
            "asset_id": asset.asset_id, "symbol": asset.symbol, "timeframe": "H1",
            "source": asset.source_candidates[0], "path": "/not-used",
            "sha256": "a" * 64, "start_utc": "2024-01-01T00:00:00Z",
            "end_utc": "2024-01-02T00:00:00Z", "row_count": 24,
            "quality_status": "PASS", "coverage_status": "ACCEPTED_WITH_KNOWN_GAPS",
        }
        result = validate_dataset_manifests(
            [manifest], required_timeframes=("H1",), verify_files=False
        )
        self.assertFalse(result["combined_training_eligible"])
        self.assertEqual(result["rejections"][0]["reason"], "COVERAGE_NOT_COMPLETE")
        self.assertEqual(result["manifest_verification_mode"], "METADATA_ONLY")

    def test_metadata_only_mode_can_never_authorize_training(self):
        result = validate_dataset_manifests(
            [], required_timeframes=("H1",), verify_files=False
        )
        self.assertFalse(result["combined_training_eligible"])

    def test_duplicate_required_manifest_is_rejected(self):
        asset = UNIVERSE_16[0]
        manifest = {
            "asset_id": asset.asset_id, "symbol": asset.symbol, "timeframe": "H1",
            "source": asset.source_candidates[0], "path": "/unused",
            "sha256": "a" * 64, "start_utc": "2024-01-01T00:00:00Z",
            "end_utc": "2024-01-02T00:00:00Z", "row_count": 24,
            "quality_status": "PASS", "coverage_status": "COMPLETE",
        }
        result = validate_dataset_manifests(
            [manifest, manifest], required_timeframes=("H1",), verify_files=False
        )
        self.assertEqual(result["rejections"][0]["reason"], "DUPLICATE_ASSET_TIMEFRAME")
        self.assertFalse(result["combined_training_eligible"])

    def test_invalid_or_naive_timestamps_are_rejected(self):
        asset = UNIVERSE_16[0]
        manifest = {
            "asset_id": asset.asset_id, "symbol": asset.symbol, "timeframe": "H1",
            "source": asset.source_candidates[0], "path": "/unused",
            "sha256": "a" * 64, "start_utc": "2024-01-01 00:00:00",
            "end_utc": "2024-01-02T00:00:00Z", "row_count": 24,
            "quality_status": "PASS", "coverage_status": "COMPLETE",
        }
        result = validate_dataset_manifests(
            [manifest], required_timeframes=("H1",), verify_files=False
        )
        self.assertTrue(result["rejections"][0]["reason"].startswith("INVALID_UTC_RANGE"))
        self.assertFalse(result["combined_training_eligible"])


if __name__ == "__main__":
    unittest.main()
