"""Best-effort Telegram alerts; never expose bot tokens or block trading safeguards."""
from __future__ import annotations
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ALLOWED_EVENTS = {
    "broker_disconnected", "broker_api_error", "high_slippage",
    "circuit_breaker", "worker_error", "database_unavailable",
}


def send_telegram_alert(message: str, *, token: str | None = None,
                        chat_id: str | None = None, timeout: float = 5.0) -> bool:
    """Send an alert using env credentials. Returns False if unconfigured or delivery fails."""
    bot_token = token or os.getenv("NOVA_TELEGRAM_BOT_TOKEN")
    target = chat_id or os.getenv("NOVA_TELEGRAM_CHAT_ID")
    if not bot_token or not target or not message.strip():
        return False
    if timeout <= 0:
        raise ValueError("timeout must be positive")
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = urllib.parse.urlencode({"chat_id": target, "text": message[:4000]}).encode()
    request = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result: dict[str, Any] = json.loads(response.read().decode("utf-8"))
            return response.status == 200 and result.get("ok") is True
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return False


def notify_event(event: str, detail: str, *, severity: str = "ERROR") -> bool:
    """Send allow-listed operational events; unknown event names are rejected."""
    if event not in ALLOWED_EVENTS:
        raise ValueError(f"unsupported alert event: {event}")
    safe_detail = str(detail).replace("\\n", " ")[:2500]
    return send_telegram_alert(f"[NOVA {severity.upper()}] {event}: {safe_detail}")
