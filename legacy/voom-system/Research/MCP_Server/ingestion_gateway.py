"""Loopback-only authenticated gateway for consented VOOM conversation ingestion.

This is a local adapter for a client application; it does not passively read chats.
No CORS, no transcript logging, no arbitrary paths, no trading commands.
"""
from __future__ import annotations
import hmac, json, os, re, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
import learning_store

HOST = "127.0.0.1"
PORT = 8766
MAX_BODY = 2_000_000
MAX_MESSAGES = 200
TOKEN_ENV = "VOOM_MCP_INGEST_TOKEN"
_RATE: dict[str, list[float]] = {}

def _json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")

class Handler(BaseHTTPRequestHandler):
    server_version = "VOOM-MCP-Ingest/1.0"
    sys_version = ""

    def log_message(self, format: str, *args: Any) -> None:
        # Deliberately do not log paths, headers, payloads, tokens, or transcript text.
        return

    def _reply(self, status: int, payload: dict[str, Any]) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/health":
            self._reply(404, {"error": "not_found"})
            return
        self._reply(200, {"ok": True, "service": "voom-mcp-ingest", "bind": HOST, "port": self.server.server_port,
                          "raw_transcripts_saved": False, "consent_required": True})

    def do_POST(self) -> None:
        if self.path != "/ingest":
            self._reply(404, {"error": "not_found"})
            return
        configured = os.environ.get(TOKEN_ENV, "")
        supplied = self.headers.get("Authorization", "")
        if len(configured) < 40 or not supplied.startswith("Bearer ") or not hmac.compare_digest(supplied[7:], configured):
            self._reply(401, {"error": "unauthorized"})
            return
        now = time.monotonic()
        recent = [stamp for stamp in _RATE.get(self.client_address[0], []) if now - stamp < 60]
        if len(recent) >= 30:
            self._reply(429, {"error": "rate_limited"})
            return
        recent.append(now)
        _RATE[self.client_address[0]] = recent
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            self._reply(415, {"error": "application_json_required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._reply(400, {"error": "invalid_content_length"})
            return
        if length < 1 or length > MAX_BODY:
            self._reply(413 if length > MAX_BODY else 400, {"error": "body_size_invalid"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._reply(400, {"error": "invalid_json"})
            return
        if not isinstance(payload, dict) or payload.get("consent_confirmed") is not True:
            self._reply(400, {"error": "explicit_consent_required"})
            return
        conversation_id = payload.get("conversation_id")
        messages = payload.get("messages")
        if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 300:
            self._reply(400, {"error": "invalid_conversation_id"})
            return
        if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
            self._reply(400, {"error": "messages_must_be_list_with_1_to_200_items"})
            return
        # Pass only the consented payload into the existing privacy-filtered learning pipeline.
        result = learning_store.ingest_conversation(
            conversation_id=conversation_id,
            messages_json=json.dumps(messages, ensure_ascii=False),
            consent_confirmed=True,
        )
        status = 200 if result.get("ok") else 400
        self._reply(status, result)

def main() -> int:
    token = os.environ.get(TOKEN_ENV, "")
    if len(token) < 40:
        print(f"Refusing to start: set {TOKEN_ENV} to a random value of at least 40 characters in this process environment.")
        return 2
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"VOOM MCP ingestion gateway listening on http://{HOST}:{PORT} (loopback only).")
    print("POST /ingest requires Bearer token and consent_confirmed=true. No transcript logging. Ctrl+C to stop.")
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
