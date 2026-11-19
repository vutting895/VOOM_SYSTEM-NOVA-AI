import hashlib
import tempfile
import unittest
from pathlib import Path

from workers.quant_engine.universe import UNIVERSE_16, validate_dataset_manifests


class UniverseRegistryTests(unittest.TestCase):
    def test_registry_has_sixteen_unique_assets(self):
        self.assertEqual(len(UNIVERSE_16), 16)
        self.assertEqual(len({a.asset_id for a in UNIVERSE_16}), 16)
        self.assertEqual(len({a.symbol for a in UNIVERSE_16}), 16)

    def test_missing_data_blocks_combined_training(self):
        result = validate_dataset_manifests([], required_timeframes=("H1",), verify_files=False)
        self.assertFalse(result["combined_training_eligible"])
        self.assertEqual(result["ready_asset_count"], 0)
        self.assertFalse(result["live_trading_enabled"])

    def test_complete_manifests_are_hash_checked(self):
        asset = UNIVERSE_16[0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bars.csv"
            path.write_bytes(b"timestamp,open,high,low,close,volume\n")
            manifest = {
                "asset_id": asset.asset_id,
                "symbol": asset.symbol,
                "timeframe": "H1",
                "source": asset.source_candidates[0],
                "path": str(path),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "start_utc": "2024-01-01T00:00:00Z",
                "end_utc": "2024-01-02T00:00:00Z",
                "row_count": 24,
                "quality_status": "PASS",
                "coverage_status": "COMPLETE",
            }
            result = validate_dataset_manifests([manifest], required_timeframes=("H1",))
            self.assertEqual(result["accepted_manifest_count"], 1)
            self.assertFalse(result["combined_training_eligible"])

            manifest["sha256"] = "0" * 64
            result = validate_dataset_manifests([manifest], required_timeframes=("H1",))
            self.assertEqual(result["rejections"][0]["reason"], "DATA_SHA256_MISMATCH")

    def test_known_gaps_are_not_implicitly_accepted(self):
        asset = UNIVERSE_16[0]
        manifest = {
            "asset_id": asset.asset_id, "symbol": asset.symbol, "timeframe": "H1",
            "source": asset.source_candidates[0], "path": "/not-used",
            "sha256": "a" * 64, "start_utc": "2024-01-01T00:00:00Z",
            "end_utc": "2024-01-02T00:00:00Z", "row_count": 24,
            "quality_status": "PASS", "coverage_status": "ACCEPTED_WITH_KNOWN_GAPS",
        }
        result = validate_dataset_manifests([manifest], required_timeframes=("H1",), verify_files=False)
        self.assertFalse(result["combined_training_eligible"])
        self.assertEqual(result["rejections"][0]["reason"], "COVERAGE_NOT_COMPLETE")


if __name__ == "__main__":
    unittest.main()
