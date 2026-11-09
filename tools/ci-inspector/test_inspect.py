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
classify_github_check_runs = MODULE.classify_github_check_runs
classify_commit_statuses = MODULE.classify_commit_statuses
fetch_github_check_runs = MODULE.fetch_github_check_runs
count_secret_matches = MODULE.count_secret_matches
redact_sensitive_text = MODULE.redact_sensitive_text
classify_netlify_deploy = MODULE.classify_netlify_deploy
sanitize_netlify_deploy = MODULE.sanitize_netlify_deploy


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

    @patch.object(MODULE, "request_json")
    def test_circleci_rejects_malformed_pagination_response(self, request):
        request.return_value = ["not", "an", "object"]
        with self.assertRaises(MODULE.InspectorError):
            fetch_circleci_items("https://circleci.test/pipeline", {})

    def test_diff_scan_blocks_incomplete_file_coverage(self):
        self.assertEqual(classify_diff_scan(0, False, 0), "BLOCKED")

    def test_diff_scan_blocks_files_without_text_patches(self):
        self.assertEqual(classify_diff_scan(0, True, 1), "BLOCKED")

    def test_diff_scan_fails_on_detected_secret(self):
        self.assertEqual(classify_diff_scan(1, True, 0), "FAIL")

    def test_diff_scan_passes_only_complete_clean_text_diff(self):
        self.assertEqual(classify_diff_scan(0, True, 0), "PASS")


    def test_secret_scan_counts_each_match(self):
        sample = "ghp_" + "A" * 30 + " and " + "ghp_" + "B" * 30
        self.assertEqual(count_secret_matches(sample), 2)

    def test_bearer_token_is_redacted(self):
        value = "Authorization failed: Bearer abc.def-123"
        self.assertNotIn("abc.def-123", redact_sensitive_text(value))
        self.assertIn("Bearer [REDACTED]", redact_sensitive_text(value))

    def test_github_check_runs_pass_only_when_complete_and_terminal(self):
        self.assertEqual(classify_github_check_runs([{"status": "completed", "conclusion": "success"}]), "PASS")
        self.assertEqual(classify_github_check_runs([{"status": "completed", "conclusion": "success"}], False), "BLOCKED")

    def test_github_check_runs_block_pending_and_empty_evidence(self):
        self.assertEqual(classify_github_check_runs([{"status": "in_progress"}]), "BLOCKED")
        self.assertEqual(classify_github_check_runs([]), "BLOCKED")

    def test_github_check_runs_fail_on_unsuccessful_conclusion(self):
        self.assertEqual(classify_github_check_runs([{"status": "completed", "conclusion": "failure"}]), "FAIL")

    def test_commit_statuses_can_be_empty_when_check_runs_exist(self):
        self.assertEqual(classify_commit_statuses([], [{"status": "completed", "conclusion": "success"}]), "PASS")

    def test_commit_status_failure_takes_precedence(self):
        self.assertEqual(classify_commit_statuses([{"state": "failure"}], []), "FAIL")

    def test_commit_status_pending_is_blocked(self):
        self.assertEqual(classify_commit_statuses([{"state": "pending"}], []), "BLOCKED")

    def test_provider_configuration_error_is_blocked_not_test_failure(self):
        status = {
            "state": "error",
            "description": "No configuration was found in your project.",
            "context": "CircleCI Pipeline",
        }
        self.assertEqual(classify_commit_statuses([status], []), "BLOCKED")

    def test_unrelated_commit_status_error_still_fails(self):
        status = {"state": "error", "description": "Internal provider error"}
        self.assertEqual(classify_commit_statuses([status], []), "FAIL")

    def test_failed_check_without_runner_is_blocked(self):
        checks = [{"name": "Python unit tests and syntax validation",
                   "status": "completed", "conclusion": "failure"}]
        self.assertEqual(
            classify_github_check_runs(
                checks, True, {"Python unit tests and syntax validation"}
            ),
            "BLOCKED",
        )

    def test_failed_check_with_runner_evidence_still_fails(self):
        checks = [{"name": "Python unit tests and syntax validation",
                   "status": "completed", "conclusion": "failure"}]
        self.assertEqual(classify_github_check_runs(checks, True), "FAIL")

    @patch.object(MODULE, "request_json")
    def test_actions_runner_diagnostics_detect_unassigned_runner(self, request):
        request.side_effect = [
            {"workflow_runs": [{"id": 7}]},
            {"jobs": [{
                "name": "Python unit tests and syntax validation",
                "runner_id": 0, "runner_name": "", "steps": [],
                "conclusion": "failure", "html_url": "https://github.com/example/job",
            }]},
        ]
        names, evidence = MODULE.fetch_github_actions_runner_evidence(
            "https://api.github.test/repos/a/b", "sha", {}
        )
        self.assertEqual(names, {"Python unit tests and syntax validation"})
        self.assertEqual(evidence[0]["runner_id"], 0)
        self.assertEqual(evidence[0]["steps"], 0)

    @patch.object(MODULE, "request_json")
    def test_actions_runner_diagnostics_ignore_started_runner(self, request):
        request.side_effect = [
            {"workflow_runs": [{"id": 7}]},
            {"jobs": [{
                "name": "Python unit tests and syntax validation",
                "runner_id": 42, "runner_name": "GitHub Actions 100",
                "steps": [{"name": "Checkout", "conclusion": "success"}],
                "conclusion": "failure",
            }]},
        ]
        names, evidence = MODULE.fetch_github_actions_runner_evidence(
            "https://api.github.test/repos/a/b", "sha", {}
        )
        self.assertEqual(names, set())
        self.assertEqual(evidence, [])

    @patch.object(MODULE, "request_json")
    def test_github_check_runs_follow_pagination(self, request):
        request.side_effect = [
            {"check_runs": [{"id": 1}] * 100},
            {"check_runs": [{"id": 101}]},
        ]
        runs, complete = fetch_github_check_runs("https://api.github.test/repos/a/b", "sha", {})
        self.assertTrue(complete)
        self.assertEqual(len(runs), 101)
        self.assertIn("page=2", request.call_args_list[1].args[0])

    @patch.object(MODULE, "request_json")
    def test_github_check_runs_cap_is_not_reported_complete(self, request):
        request.return_value = {"check_runs": [{"id": 1}] * 100}
        runs, complete = fetch_github_check_runs("https://api.github.test/repos/a/b", "sha", {}, max_pages=2)
        self.assertFalse(complete)
        self.assertEqual(len(runs), 200)


    def test_netlify_preview_requires_exact_sha_and_branch(self):
        deploy = {"commit_ref": "abc123", "branch": "feature", "context": "deploy-preview", "state": "ready"}
        self.assertEqual(classify_netlify_deploy(deploy, "abc123", "feature"), "PASS")
        self.assertEqual(classify_netlify_deploy(deploy, "other", "feature"), "BLOCKED")
        self.assertEqual(classify_netlify_deploy(deploy, "abc123", "other"), "BLOCKED")

    def test_netlify_production_deploy_is_not_a_preview_pass(self):
        deploy = {"commit_ref": "abc123", "branch": "main", "context": "production", "state": "ready"}
        self.assertEqual(classify_netlify_deploy(deploy, "abc123", "main"), "BLOCKED")

    def test_netlify_error_state_fails_exact_preview(self):
        deploy = {"commit_ref": "abc123", "branch": "feature", "context": "deploy-preview", "state": "error"}
        self.assertEqual(classify_netlify_deploy(deploy, "abc123", "feature"), "FAIL")

    def test_netlify_report_whitelist_excludes_private_deploy_token(self):
        deploy = {
            "id": "deploy-1", "state": "ready", "context": "deploy-preview",
            "commit_ref": "abc123", "branch": "feature",
            "skew_protection_token": "private-token-value",
            "user_id": "private-user-id",
        }
        safe = sanitize_netlify_deploy(deploy)
        self.assertNotIn("skew_protection_token", safe)
        self.assertNotIn("user_id", safe)
        self.assertEqual(safe["commit_ref"], "abc123")


if __name__ == "__main__":
    unittest.main()
