"""Bounded local Ollama provider for the NOVA LLM Core.

The provider accepts only application-validated chat messages. It has no broker,
filesystem, shell, tool-call, or arbitrary URL capability.
"""
from __future__ import annotations

import json
import os
import re
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlsplit
from typing import Any, Protocol


class LLMProviderError(RuntimeError):
    """Safe-to-report provider failure without request or credential contents."""


class ChatProvider(Protocol):
    provider_name: str
    model_name: str

    def generate(self, messages: list[dict[str, str]], *, max_tokens: int) -> str: ...


@dataclass(frozen=True)
class OllamaConfig:
    base_url: str = "http://127.0.0.1:11434"
    model: str = "llama3.2:1b"
    timeout_seconds: float = 45.0
    max_response_bytes: int = 16_384

    @classmethod
    def from_env(cls) -> "OllamaConfig":
        return cls(
            base_url=os.getenv("NOVA_LLM_BASE_URL", "http://127.0.0.1:11434"),
            model=os.getenv("NOVA_LLM_MODEL", "llama3.2:1b"),
            timeout_seconds=float(os.getenv("NOVA_LLM_TIMEOUT_SECONDS", "45")),
        )

    def validate(self) -> "OllamaConfig":
        parsed = urlsplit(self.base_url)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("NOVA_LLM_BASE_URL must target local loopback Ollama over HTTP")
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("NOVA_LLM_BASE_URL must be an origin without credentials, path, query, or fragment")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}", self.model):
            raise ValueError("invalid NOVA_LLM_MODEL")
        if not 1 <= self.timeout_seconds <= 120:
            raise ValueError("NOVA_LLM_TIMEOUT_SECONDS must be between 1 and 120")
        if not 1024 <= self.max_response_bytes <= 65536:
            raise ValueError("max_response_bytes must be between 1024 and 65536")
        return self


class OllamaProvider:
    provider_name = "ollama-local"

    def __init__(self, config: OllamaConfig | None = None) -> None:
        self.config = (config or OllamaConfig.from_env()).validate()
        self.model_name = self.config.model

    def generate(self, messages: list[dict[str, str]], *, max_tokens: int = 700) -> str:
        if not 1 <= max_tokens <= 1200:
            raise ValueError("max_tokens must be between 1 and 1200")
        payload = {
            "model": self.model_name,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": max_tokens},
        }
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.config.base_url.rstrip("/") + "/api/chat",
            data=encoded,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                raw = response.read(self.config.max_response_bytes + 1)
            if len(raw) > self.config.max_response_bytes:
                raise LLMProviderError("llm_provider_response_too_large")
            envelope: Any = json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise LLMProviderError("llm_provider_http_error") from exc
        except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as exc:
            raise LLMProviderError("llm_provider_unavailable") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise LLMProviderError("llm_provider_invalid_json") from exc
        message = envelope.get("message") if isinstance(envelope, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip() or len(content) > 10_000:
            raise LLMProviderError("llm_provider_invalid_response")
        return content.strip()
