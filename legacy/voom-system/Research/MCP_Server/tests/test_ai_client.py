import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voom_ai_client import READ_ONLY_TOOLS, result_text, tool_schema, system_prompt

class FakeText:
    def __init__(self, text):
        self.text = text

class FakeResult:
    def __init__(self, content, is_error=False):
        self.content = content
        self.isError = is_error

class ClientSafetyTests(unittest.TestCase):
    def test_read_only_allowlist_excludes_writes(self):
        self.assertIn("search_knowledge", READ_ONLY_TOOLS)
        self.assertIn("list_ai_trading_candidates", READ_ONLY_TOOLS)
        self.assertIn("get_ai_trading_candidate", READ_ONLY_TOOLS)
        self.assertNotIn("ingest_conversation", READ_ONLY_TOOLS)
        self.assertNotIn("review_learning_candidate", READ_ONLY_TOOLS)
        self.assertNotIn("export_skill_package", READ_ONLY_TOOLS)
        self.assertNotIn("rebuild_semantic_index", READ_ONLY_TOOLS)

    def test_function_schema(self):
        value = tool_schema("search_knowledge", "Search", {
            "type": "object", "properties": {"query": {"type": "string"}}
        })
        self.assertEqual(value["type"], "function")
        self.assertEqual(value["function"]["name"], "search_knowledge")

    def test_result_output_is_bounded(self):
        value = result_text(FakeResult([FakeText("x" * 20000)]))
        self.assertLessEqual(len(value), 12000)

    def test_errors_are_labeled(self):
        value = result_text(FakeResult([FakeText("denied")], True))
        self.assertTrue(value.startswith("MCP tool error:"))

    def test_safety_prompt(self):
        value = system_prompt().lower()
        self.assertIn("read-only", value)
        self.assertIn("live trading is disabled", value)
        self.assertIn("untrusted data", value)

if __name__ == "__main__":
    unittest.main()
