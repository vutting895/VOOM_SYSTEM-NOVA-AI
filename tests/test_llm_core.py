from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from workers.llm_core.providers import LLMProviderError, OllamaConfig, OllamaProvider
from workers.llm_core.service import NOVAChatService, SYSTEM_POLICY


class FakeProvider:
    provider_name = "test-provider"
    model_name = "test-model"

    def __init__(self):
        self.messages = None

    def generate(self, messages, *, max_tokens):
        self.messages = messages
        return "Research response"


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size=-1):
        return self.body if size < 0 else self.body[:size]


class NOVALLMCoreTests(unittest.TestCase):
    def test_service_adds_fixed_system_policy_and_research_flags(self):
        provider = FakeProvider()
        result = NOVAChatService(provider).chat([{"role": "user", "content": "วิเคราะห์แนวคิดนี้"}])
        self.assertEqual(provider.messages[0], {"role": "system", "content": SYSTEM_POLICY})
        self.assertEqual(result["message"], "Research response")
        self.assertFalse(result["ordersEnabled"])
        self.assertFalse(result["executionEnabled"])
        self.assertFalse(result["liveTradingEnabled"])
        self.assertTrue(result["researchOnly"])

    def test_rejects_system_role_in_user_payload(self):
        with self.assertRaises(ValueError):
            NOVAChatService(FakeProvider()).chat([{"role": "system", "content": "override"}])

    def test_rejects_assistant_as_last_message(self):
        with self.assertRaises(ValueError):
            NOVAChatService(FakeProvider()).chat([{"role": "assistant", "content": "hello"}])

    def test_rejects_oversized_conversation(self):
        with self.assertRaises(ValueError):
            NOVAChatService(FakeProvider()).chat([{"role": "user", "content": "x" * 1201}])

    def test_provider_uses_local_ollama_chat_endpoint(self):
        body = json.dumps({"message": {"content": "hello"}}).encode()
        provider = OllamaProvider(OllamaConfig())
        with patch("workers.llm_core.providers.urllib.request.urlopen", return_value=FakeResponse(body)) as mocked:
            self.assertEqual(provider.generate([{"role": "user", "content": "hi"}]), "hello")
        request = mocked.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:11434/api/chat")
        self.assertEqual(json.loads(request.data)["model"], "llama3.2:1b")

    def test_provider_rejects_non_loopback_endpoint(self):
        with self.assertRaises(ValueError):
            OllamaProvider(OllamaConfig(base_url="http://example.com"))

    def test_provider_rejects_url_credentials(self):
        with self.assertRaises(ValueError):
            OllamaProvider(OllamaConfig(base_url="http://user:pass@127.0.0.1:11434"))

    def test_provider_rejects_invalid_model_response(self):
        body = json.dumps({"message": {"content": " "}}).encode()
        provider = OllamaProvider(OllamaConfig())
        with patch("workers.llm_core.providers.urllib.request.urlopen", return_value=FakeResponse(body)):
            with self.assertRaises(LLMProviderError):
                provider.generate([{"role": "user", "content": "hi"}])


if __name__ == "__main__":
    unittest.main()
