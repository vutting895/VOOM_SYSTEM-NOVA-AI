"""NOVA local LLM adapter: Ollama JSON generation with strict validation.

No cloud API key is used. This is an inference adapter, not a model trained from
scratch. A model must already be installed in the local Ollama runtime.
"""
from __future__ import annotations
import json
import os
import urllib.error
import urllib.request
from typing import Any

ALLOWED_WORKERS = {
    "EMATrendWorker", "RSIWorker", "ATRVolatilityFilter",
    "BollingerBandWorker", "VolumeSpikeWorker", "DonchianBreakoutWorker",
}


class LocalLLMError(RuntimeError):
    pass


class LocalLLMStrategy:
    def __init__(self, base_url: str | None = None, model: str | None = None, timeout: int = 45):
        self.base_url = (base_url or os.getenv("NOVA_LLM_BASE_URL", "http://127.0.0.1:11434")).rstrip("/")
        self.model = model or os.getenv("NOVA_LLM_MODEL", "llama3.2:1b")
        self.timeout = timeout

    def generate(self, prompt: str, market: str = "BTC/USDT",
                 timeframe: str = "1h", risk: str = "medium") -> dict[str, Any]:
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("prompt is required")
        if timeframe not in {"5m", "15m", "1h", "4h", "1d"}:
            raise ValueError("unsupported timeframe")
        if risk not in {"low", "medium", "high"}:
            raise ValueError("unsupported risk profile")
        instruction = (
            "Act as NOVA strategy research assistant. Return JSON only with fields "
            "name, entryWorkers, exit:{takeProfitPct,stopLossPct}, rationale. "
            "Allowed workers: " + ", ".join(sorted(ALLOWED_WORKERS)) + ". "
            "Never claim backtested performance. TP must be >0 and <=20; SL >0 and <=10. "
            "These are research drafts, not trade instructions.\n"
            + json.dumps({"goal": prompt[:1200], "market": market[:30],
                          "timeframe": timeframe, "risk": risk}, ensure_ascii=False)
        )
        data = json.dumps({"model": self.model, "stream": False, "format": "json",
                           "options": {"temperature": 0.2}, "prompt": instruction}).encode()
        req = urllib.request.Request(self.base_url + "/api/generate", data=data,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                envelope = json.loads(response.read().decode("utf-8"))
            raw = json.loads(envelope["response"]) if isinstance(envelope.get("response"), str) else envelope.get("response")
        except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
            raise LocalLLMError(f"local LLM unavailable or invalid response: {exc}") from exc
        if not isinstance(raw, dict):
            raise LocalLLMError("model response must be a JSON object")
        workers = list(dict.fromkeys(x for x in raw.get("entryWorkers", [])
                                     if isinstance(x, str) and x in ALLOWED_WORKERS))[:6]
        exit_data = raw.get("exit") if isinstance(raw.get("exit"), dict) else {}
        try:
            tp, sl = float(exit_data["takeProfitPct"]), float(exit_data["stopLossPct"])
        except (KeyError, TypeError, ValueError) as exc:
            raise LocalLLMError("model returned invalid exit parameters") from exc
        if not workers or not (0 < tp <= 20) or not (0 < sl <= 10):
            raise LocalLLMError("model response failed safety/schema validation")
        return {
            "name": str(raw.get("name", "NOVA AI Draft"))[:100],
            "market": market[:30], "timeframe": timeframe, "riskProfile": risk,
            "entryWorkers": workers, "exit": {"takeProfitPct": tp, "stopLossPct": sl},
            "rationale": str(raw.get("rationale", ""))[:1200],
            "source": "local-ollama-llm", "modelUsed": self.model,
            "status": "draft", "executionEnabled": False, "backtestStatus": "not_run",
        }