import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ai_learning

class AILearningTests(unittest.TestCase):
    def test_capability_report_does_not_expose_secret(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "do-not-return-this", "VOOM_MCP_LLM_ENABLED": "1"}):
            result = ai_learning.capabilities()
        self.assertTrue(result["capabilities"]["llm_research_analysis"]["api_key_configured"])
        self.assertNotIn("do-not-return-this", repr(result))
        self.assertFalse(result["safety"]["live_trading_enabled"])
        self.assertFalse(result["safety"]["mt5_order_path_modified"])

    def test_llm_requires_explicit_opt_in(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "fake-test-key"}, clear=False):
            os.environ.pop("VOOM_MCP_LLM_ENABLED", None)
            result = ai_learning.analyze_with_llm("test", "evidence")
        self.assertIn("disabled", result["error"])

    def test_llm_input_limits(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIn("question", ai_learning.analyze_with_llm("", "evidence")["error"])
            self.assertIn("evidence", ai_learning.analyze_with_llm("question", "")["error"])
            self.assertIn("12000", ai_learning.analyze_with_llm("question", "x" * 12001)["error"])

if __name__ == "__main__":
    unittest.main()
