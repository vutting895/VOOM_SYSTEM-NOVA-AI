"""Offline tests for the opt-in research worker."""
import unittest
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import research_worker

class ResearchWorkerTests(unittest.TestCase):
    def test_dry_run_never_searches(self):
        fake = {"requests": [{"id": 4, "query": "latest MQL5 docs"}], "count": 1}
        with patch.object(research_worker.learning_store, "list_research_requests", return_value=fake), patch.object(research_worker, "brave_search", side_effect=AssertionError("must not search")):
            result = research_worker.run_once(execute=False)
        self.assertEqual(result["mode"], "dry_run")
        self.assertEqual(result["queries"][0]["id"], 4)
        self.assertFalse(result["auto_publish_enabled"])

    def test_execute_without_key_fails_closed(self):
        with patch.object(research_worker.learning_store, "list_research_requests", return_value={"requests": [{"id": 1, "query": "test?"}]}):
            result = research_worker.run_once(execute=True, api_key="")
        self.assertEqual(result["processed"], 0)
        self.assertIn("BRAVE_SEARCH_API_KEY", result["errors"][0])

    def test_parser_rejects_non_https_and_duplicates(self):
        payload = {"web": {"results": [
            {"title": "Good", "description": "A snippet", "url": "https://example.org/a"},
            {"title": "Bad", "description": "No TLS", "url": "http://example.org/b"},
            {"title": "Duplicate", "description": "Duplicate URL", "url": "https://example.org/a"},
            {"title": "No snippet", "description": "", "url": "https://example.org/c"}]}}
        results = research_worker.parse_results(payload)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Good")

    def test_redirect_handler_refuses_redirects(self):
        handler = research_worker._NoRedirect()
        result = handler.redirect_request(None, None, 302, "Found", {}, "https://attacker.example/collect")
        self.assertIsNone(result)

    def test_bad_queries_rejected_before_network(self):
        with self.assertRaises(ValueError): research_worker.brave_search("x" * 501, "test-token-123")
        with self.assertRaises(ValueError): research_worker.brave_search("valid query", "")

if __name__ == "__main__":
    unittest.main(verbosity=2)
