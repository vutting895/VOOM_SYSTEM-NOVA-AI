# -*- coding: utf-8 -*-
"""Authenticated, read-only HTTP adapter for the local MT5 Python Bridge.

Only PING, GET_PARAMS and ANALYZE are exposed. No order/trade commands exist here.
"""
import hmac
import json
import os
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 8081
HTTP_HOST = "127.0.0.1"
HTTP_PORT = 8082
TOKEN_FILE = Path(__file__).with_name(".bridge_http_token")
TOKEN = os.environ.get("VOOM_BRIDGE_TOKEN", "").strip()
if not TOKEN and TOKEN_FILE.is_file():
    TOKEN = TOKEN_FILE.read_text(encoding="utf-8").strip()
if len(TOKEN) < 40:
    raise RuntimeError("Bridge adapter token missing or too short; refusing to start")

LAST_REQUEST = {}
MIN_INTERVAL_SECONDS = 0.75

def bridge_command(command: str, timeout: float = 25.0) -> str:
    if command not in {"PING", "GET_PARAMS", "ANALYZE"}:
        raise ValueError("Command not allowed")
    with socket.create_connection((BRIDGE_HOST, BRIDGE_PORT), timeout=3.0) as sock:
        sock.settimeout(timeout)
        sock.sendall((command + "\n").encode("ascii"))
        data = bytearray()
        while len(data) < 8192:
            chunk = sock.recv(2048)
            if not chunk:
                break
            data.extend(chunk)
            if b"\n" in chunk:
                break
    response = bytes(data).split(b"\n", 1)[0].decode("utf-8", "replace").strip()
    if not response or response.startswith("ERROR|") or response == "UNKNOWN":
        raise RuntimeError("Local Bridge returned an invalid response")
    return response

def parse_signal(raw: str) -> dict:
    if not raw.startswith("SIGNAL|"):
        raise RuntimeError("Bridge did not return a signal")
    result = {}
    for part in raw.split("|")[1:]:
        if "=" in part:
            k, v = part.split("=", 1)
            result[k.strip()] = v.strip()
    direction = result.get("dir", "").upper()
    if direction not in {"BUY", "SELL", "HOLD"}:
        raise RuntimeError("Bridge direction is invalid")
    def number(name, default=0.0):
        try:
            n = float(result.get(name, default))
            if n != n or abs(n) == float("inf"):
                raise ValueError()
            return n
        except (ValueError, TypeError):
            raise RuntimeError("Bridge numeric field is invalid")
    confidence = number("conf")
    lot = number("lot")
    if not 0.0 <= confidence <= 1.0 or lot < 0.0 or lot > 100.0:
        raise RuntimeError("Bridge signal is outside accepted bounds")
    return {
        "direction": direction,
        "confidence": confidence,
        "lot": lot,
        "stopLoss": number("sl"),
        "takeProfit": number("tp"),
        "reason": result.get("reason", "")[:240],
        "source": "local-mt5-bridge",
        "executionEnabled": False,
    }

class Handler(BaseHTTPRequestHandler):
    server_version = "VOOM-Bridge-Adapter"
    sys_version = ""

    def log_message(self, fmt, *args):
        # Never log headers, request bodies, or bearer tokens.
        print("VOOM bridge adapter: " + (fmt % args)[:180], flush=True)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        auth = self.headers.get("Authorization", "")
        expected = "Bearer " + TOKEN
        return hmac.compare_digest(auth.encode("utf-8"), expected.encode("utf-8"))

    def rate_limited(self):
        key = self.client_address[0]
        now = time.monotonic()
        last = LAST_REQUEST.get(key, 0.0)
        if now - last < MIN_INTERVAL_SECONDS:
            return True
        LAST_REQUEST[key] = now
        return False

    def do_OPTIONS(self):
        self.send_json(405, {"ok": False, "error": "method_not_allowed"})

    def do_GET(self):
        if not self.authorized():
            self.send_json(401, {"ok": False, "error": "unauthorized"})
            return
        if self.rate_limited():
            self.send_json(429, {"ok": False, "error": "rate_limited"})
            return
        if self.path != "/health":
            self.send_json(404, {"ok": False, "error": "not_found"})
            return
        try:
            pong = bridge_command("PING", timeout=3.0)
            if pong != "PONG":
                raise RuntimeError("Unexpected Bridge health response")
            params = bridge_command("GET_PARAMS", timeout=3.0)
            self.send_json(200, {"ok": True, "bridge": "connected", "params": params})
        except Exception as exc:
            self.send_json(503, {"ok": False, "bridge": "unavailable", "error": type(exc).__name__})

    def do_POST(self):
        if not self.authorized():
            self.send_json(401, {"ok": False, "error": "unauthorized"})
            return
        if self.rate_limited():
            self.send_json(429, {"ok": False, "error": "rate_limited"})
            return
        if self.path not in {"/analyze", "/params"}:
            self.send_json(404, {"ok": False, "error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > 1024:
                self.send_json(413, {"ok": False, "error": "request_too_large"})
                return
            if length:
                # Only accept empty JSON objects; no arbitrary Bridge commands from callers.
                body = self.rfile.read(length)
                if body.strip() not in {b"", b"{}", b"null"}:
                    self.send_json(400, {"ok": False, "error": "invalid_body"})
                    return
            if self.path == "/params":
                raw = bridge_command("GET_PARAMS", timeout=3.0)
                self.send_json(200, {"ok": True, "params": raw, "source": "local-mt5-bridge"})
            else:
                raw = bridge_command("ANALYZE", timeout=25.0)
                self.send_json(200, {"ok": True, "signal": parse_signal(raw)})
        except socket.timeout:
            self.send_json(504, {"ok": False, "error": "bridge_timeout"})
        except Exception as exc:
            self.send_json(503, {"ok": False, "error": type(exc).__name__})

if __name__ == "__main__":
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), Handler)
    server.daemon_threads = True
    print(f"VOOM read-only adapter listening on {HTTP_HOST}:{HTTP_PORT}; Bridge={BRIDGE_HOST}:{BRIDGE_PORT}", flush=True)
    server.serve_forever()
