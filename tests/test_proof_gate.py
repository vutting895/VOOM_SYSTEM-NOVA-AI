import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from proof_gate import evaluate_required_checks, latest_check_runs


class ProofGateTests(unittest.TestCase):
    def test_missing_required_check_fails(self):
        passed, evidence = evaluate_required_checks([], ["Unit Tests"])
        self.assertFalse(passed)
        self.assertEqual(evidence[0]["status"], "missing")

    def test_pending_check_fails(self):
        passed, _ = evaluate_required_checks(
            [{"name": "Unit Tests", "status": "in_progress", "conclusion": None}],
            ["Unit Tests"],
        )
        self.assertFalse(passed)

    def test_failure_check_fails(self):
        passed, _ = evaluate_required_checks(
            [{"name": "Unit Tests", "status": "completed", "conclusion": "failure"}],
            ["Unit Tests"],
        )
        self.assertFalse(passed)

    def test_completed_success_passes(self):
        passed, evidence = evaluate_required_checks(
            [{"name": "Unit Tests", "status": "completed", "conclusion": "success"}],
            ["Unit Tests"],
        )
        self.assertTrue(passed)
        self.assertTrue(evidence[0]["passed"])

    def test_latest_attempt_is_used(self):
        items = [
            {"name": "Unit Tests", "status": "completed", "conclusion": "success",
             "started_at": "2026-01-01T00:00:00Z"},
            {"name": "Unit Tests", "status": "completed", "conclusion": "failure",
             "started_at": "2026-01-02T00:00:00Z"},
        ]
        latest = latest_check_runs(items)
        self.assertEqual(latest["Unit Tests"]["conclusion"], "failure")


if __name__ == "__main__":
    unittest.main()
