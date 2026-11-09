import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("nova_ci_inspector", Path(__file__).with_name("inspect.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SENSITIVE_PATTERNS = MODULE.SENSITIVE_PATTERNS
status_item = MODULE.status_item
classify_circleci_status = MODULE.classify_circleci_status
classify_diff_scan = MODULE.classify_diff_scan
fetch_circleci_items = MODULE.fetch_circleci_items


class InspectorUnitTests(unittest.TestCase):
    def test_detects_github_token_shape(self):
        self.assertIsNotNone(SENSITIVE_PATTERNS[0].search("ghp_" + "A" * 30))

    def test_detects_assignment_credential_shape(self):
        self.assertIsNotNone(SENSITIVE_PATTERNS[1].search('api_key = "this-looks-like-a-secret-value"'))

    def test_does_not_flag_plain_description(self):
        self.assertIsNone(SENSITIVE_PATTERNS[1].search("API key is read from environment variables"))

    def test_status_item_shape(self):
        item = status_item("CircleCI", "BLOCKED", "token missing")
        self.assertEqual(item["status"], "BLOCKED")
        self.assertIsNone(item["url"])

    def test_circleci_success_requires_all_workflows_and_jobs_to_succeed(self):
        workflows = [{"status": "success"}]
        jobs = [{"status": "success"}, {"status": "success"}]
        self.assertEqual(classify_circleci_status(workflows, jobs), "PASS")

    def test_circleci_cancelled_workflow_is_blocked(self):
        self.assertEqual(
            classify_circleci_status([{"status": "canceled"}], [{"status": "success"}]),
            "BLOCKED",
        )

    def test_circleci_not_run_job_is_not_a_pass(self):
        self.assertEqual(
            classify_circleci_status([{"status": "success"}], [{"status": "not_run"}]),
            "BLOCKED",
        )

    def test_circleci_failure_takes_precedence(self):
        self.assertEqual(
            classify_circleci_status([{"status": "failed"}], [{"status": "canceled"}]),
            "FAIL",
        )

    def test_missing_circleci_evidence_is_blocked(self):
        self.assertEqual(classify_circleci_status([], []), "BLOCKED")

    def test_circleci_incomplete_pagination_is_blocked(self):
        self.assertEqual(
            classify_circleci_status([{"status": "success"}], [{"status": "success"}], False),
            "BLOCKED",
        )

    @patch.object(MODULE, "request_json")
    def test_circleci_pagination_follows_next_page_token(self, request):
        request.side_effect = [
            {"items": [{"id": "first"}], "next_page_token": "next-page"},
            {"items": [{"id": "second"}], "next_page_token": None},
        ]
        items, complete = fetch_circleci_items("https://circleci.test/pipeline", {"Circle-Token": "test"})
        self.assertTrue(complete)
        self.assertEqual([item["id"] for item in items], ["first", "second"])
        self.assertIn("page-token=next-page", request.call_args_list[1].args[0])

    @patch.object(MODULE, "request_json")
    def test_circleci_pagination_cap_is_not_reported_complete(self, request):
        request.return_value = {"items": [{"id": "page"}], "next_page_token": "more"}
        items, complete = fetch_circleci_items("https://circleci.test/pipeline", {}, max_pages=2)
        self.assertFalse(complete)
        self.assertEqual(len(items), 2)

    def test_diff_scan_blocks_incomplete_file_coverage(self):
        self.assertEqual(classify_diff_scan(0, False, 0), "BLOCKED")

    def test_diff_scan_blocks_files_without_text_patches(self):
        self.assertEqual(classify_diff_scan(0, True, 1), "BLOCKED")

    def test_diff_scan_fails_on_detected_secret(self):
        self.assertEqual(classify_diff_scan(1, True, 0), "FAIL")

    def test_diff_scan_passes_only_complete_clean_text_diff(self):
        self.assertEqual(classify_diff_scan(0, True, 0), "PASS")


if __name__ == "__main__":
    unittest.main()
