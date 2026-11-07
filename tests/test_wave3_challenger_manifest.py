import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "research" / "wave3_challenger" / "challenger_manifest.json"


class TestWave3ChallengerManifest(unittest.TestCase):
    def test_benchmark_is_frozen_and_final_oos_is_excluded_from_selection(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertTrue(manifest["benchmark"]["frozen"])
        self.assertTrue(manifest["benchmark"]["do_not_modify"])
        self.assertEqual(manifest["fvg_comparison"]["selection"]["winner"], None)
        self.assertEqual(manifest["fvg_comparison"]["selection"]["final_oos_rows_parsed"], 0)
        self.assertFalse(manifest["fvg_comparison"]["selection"]["final_oos_used"])
        self.assertFalse(manifest["safety"]["frozen_benchmark_modified"])

    def test_three_fvg_definitions_are_preregistered_separately(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        ids = {item["id"] for item in manifest["fvg_comparison"]["definitions"]}
        self.assertEqual(ids, {"first_touch_only", "first_full_mitigation_only", "repeat_touch_within_48"})

    def test_first_hit_labels_fail_closed_until_both_cost_sources_are_verified(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        labels = manifest["first_hit_labels"]
        self.assertFalse(labels["label_generation_enabled"])
        self.assertEqual(labels["commission"]["status"], "unverified_for_connected_account_and_XAUUSDm")
        self.assertEqual(labels["swap_rollover"]["status"], "current_snapshot_verified_historical_schedule_unverified")
        self.assertFalse(labels["commission"]["terminal_evidence"]["commission_sum_usd"] == 0 and labels["required_inputs"]["commission_schedule_verified"])
        self.assertFalse(labels["required_inputs"]["commission_schedule_verified"])
        self.assertFalse(labels["required_inputs"]["swap_schedule_verified"])
        self.assertTrue(labels["required_inputs"]["commission_source_required"])
        self.assertTrue(labels["required_inputs"]["swap_schedule_source_required"])

    def test_future_holdout_is_fixed_and_sealed(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        holdout = manifest["future_holdout"]
        self.assertTrue(holdout["sealed"])
        self.assertEqual(holdout["start_utc"], "2026-11-06T00:00:00Z")
        self.assertEqual(holdout["end_exclusive_utc"], "2027-05-06T00:00:00Z")
        self.assertEqual(holdout["access_not_before_utc"], "2027-05-07T00:00:00Z")
        self.assertFalse(holdout["daily_capture"]["status"] == "verified")


if __name__ == "__main__":
    unittest.main()
