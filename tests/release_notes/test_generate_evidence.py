import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).parents[2] / "scripts" / "release_notes" / "generate_evidence.py"
SPEC = importlib.util.spec_from_file_location("nova_release_notes", MODULE_PATH)
agent = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent)


class ReleaseNotesEvidenceTests(unittest.TestCase):
    def test_lightweight_tag_resolves_to_commit(self):
        tag = {"name": "v1.0", "commit": {"sha": "abc123", "url": "https://api.github.com/commits/abc123"}}
        with patch.object(agent, "api", return_value={"object": {"sha": "abc123", "type": "commit"}}):
            self.assertEqual(agent.resolve_tag_commit(tag), "abc123")

    def test_annotated_tag_resolves_to_target_commit(self):
        tag = {"name": "v1.1", "commit": {"sha": "tag-object"}}
        responses = [{"object": {"sha": "tag-object", "type": "tag"}},
                     {"object": {"sha": "commit-sha", "type": "commit"}}]
        with patch.object(agent, "api", side_effect=responses):
            self.assertEqual(agent.resolve_tag_commit(tag), "commit-sha")

    def test_nested_annotated_tag_resolves(self):
        tag = {"name": "v1.2", "commit": {"sha": "outer-tag"}}
        responses = [{"object": {"sha": "outer-tag", "type": "tag"}},
                     {"object": {"sha": "inner-tag", "type": "tag"}},
                     {"object": {"sha": "final-commit", "type": "commit"}}]
        with patch.object(agent, "api", side_effect=responses):
            self.assertEqual(agent.resolve_tag_commit(tag), "final-commit")

    def test_unsupported_tag_target_fails_closed(self):
        tag = {"name": "bad-tag", "commit": {"sha": "blob-sha"}}
        with patch.object(agent, "api", return_value={"object": {"sha": "blob-sha", "type": "blob"}}):
            with self.assertRaises(RuntimeError):
                agent.resolve_tag_commit(tag)

    def test_compare_rejects_truncated_response(self):
        with patch.object(agent, "api", return_value={"total_commits": 2, "commits": [{"sha": "one"}]}):
            with self.assertRaisesRegex(RuntimeError, "returned 1 of 2"):
                agent.compare_commits("v1.0", "main")

    def test_compare_rejects_more_than_api_limit(self):
        with patch.object(agent, "api", return_value={"total_commits": 251, "commits": []}):
            with self.assertRaisesRegex(RuntimeError, "above the API safety limit"):
                agent.compare_commits("v1.0", "main")

    def test_compare_fetches_second_page(self):
        first = {"total_commits": 101, "commits": [{"sha": str(i)} for i in range(100)]}
        second = {"total_commits": 101, "commits": [{"sha": "100"}]}
        with patch.object(agent, "api", side_effect=[first, second]) as mocked:
            result = agent.compare_commits("v1.0", "main")
        self.assertEqual(len(result), 101)
        self.assertEqual(mocked.call_count, 2)

    def test_classification_deduplicates_and_uses_review_fallback(self):
        items = [{"sha": "a"*40, "commit": {"message": "feat: add dashboard"}, "html_url": "https://example/a"},
                 {"sha": "b"*40, "commit": {"message": "fix: correct parsing"}, "html_url": "https://example/b"},
                 {"sha": "c"*40, "commit": {"message": "random commit"}, "html_url": "https://example/c"},
                 {"sha": "a"*40, "commit": {"message": "feat: duplicate"}}]
        groups, records = agent.classify(items)
        self.assertEqual(len(records), 3)
        self.assertEqual(len(groups["Features"]), 1)
        self.assertEqual(len(groups["Bug Fixes"]), 1)
        self.assertEqual(len(groups["Other / Needs Review"]), 1)


if __name__ == "__main__":
    unittest.main()
