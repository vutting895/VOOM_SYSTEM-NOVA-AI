"""Read-only MT5 Bridge plus outbound WebSocket relay client.

No public listener is created. The local FastAPI service binds to 127.0.0.1 only;
this process initiates an authenticated TLS WebSocket to the stable workers.dev relay.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen

from websockets.asyncio.client import connect

RELAY_HOST = "voom-mt5-bridge-relay.suwapat787.workers.dev"
DEFAULT_RELAY_URL = "wss://voom-mt5-bridge-relay.suwapat787.workers.dev/connect"
LOCAL_ORIGIN = "http://127.0.0.1:8787"
MAX_MESSAGE_BYTES = 1024 * 1024
TENANT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,100}$")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{1,64}$")
ALLOWED_PATHS = {"/health", "/api/account", "/api/exposure", "/api/symbols", "/api/quotes"}
TIMEFRAMES = {"M1", "M5", "M15", "M30", "H1", "H4", "D1"}


def validate_relay_url(value: str) -> str:
    parsed = urlsplit(value)
    if (
        parsed.scheme != "wss"
        or parsed.hostname != RELAY_HOST
        or parsed.path != "/connect"
        or parsed.username
        or parsed.password
        or parsed.port is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Relay URL must use the approved HTTPS Worker endpoint.")
    return value


def normalize_read_path(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 2048:
        raise ValueError("Invalid request path.")
    if "\r" in value or "\n" in value or "\\" in value:
        raise ValueError("Invalid request path.")

    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.fragment or parsed.path not in ALLOWED_PATHS:
        raise ValueError("Read path is not allowed.")

    params = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=False)
    if any(len(items) != 1 for items in params.values()):
        raise ValueError("Duplicate query parameters are not allowed.")

    if parsed.path in {"/health", "/api/account"}:
        if params:
            raise ValueError("This read endpoint does not accept query parameters.")
        return parsed.path

    if parsed.path == "/api/symbols":
        if set(params) - {"q", "limit"}:
            raise ValueError("Query parameter is not allowed.")
        q = params.get("q", [""])[0]
        if len(q) > 40:
            raise ValueError("Symbol filter is too long.")
        limit = params.get("limit", ["100"])[0]
        if not limit.isdigit() or not 1 <= int(limit) <= 500:
            raise ValueError("Symbol limit is invalid.")
    else:
        if set(params) - {"symbol", "timeframe", "count"}:
            raise ValueError("Query parameter is not allowed.")
        symbol = params.get("symbol", [""])[0]
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", symbol):
            raise ValueError("Symbol is invalid.")
        timeframe = params.get("timeframe", ["M5"])[0].upper()
        if timeframe not in TIMEFRAMES:
            raise ValueError("Timeframe is invalid.")
        count = params.get("count", ["100"])[0]
        if not count.isdigit() or not 1 <= int(count) <= 500:
            raise ValueError("Candle count is invalid.")

    return parsed.path + (("?" + urlencode({key: items[0] for key, items in params.items()})) if params else "")


def local_read(path: str, tenant_id: str, token: str) -> tuple[int, str]:
    """Call only the authenticated localhost GET endpoints; never log payloads."""
    try:
        safe_path = normalize_read_path(path)
    except ValueError:
        return 400, json.dumps({"error": "read_path_not_allowed", "mode": "read-only", "order_submission_enabled": False})

    request = Request(
        LOCAL_ORIGIN + safe_path,
        headers={
            "Authorization": "Bearer " + token,
            "X-VOOM-TENANT-ID": tenant_id,
            "Accept": "application/json"
        },
        method="GET"
    )
    try:
        with urlopen(request, timeout=6) as response:
            body = response.read(MAX_MESSAGE_BYTES + 1)
            if len(body) > MAX_MESSAGE_BYTES:
                return 502, json.dumps({"error": "bridge_response_too_large", "mode": "read-only", "order_submission_enabled": False})
            return response.status, body.decode("utf-8", errors="replace")
    except HTTPError as exc:
        body = exc.read(MAX_MESSAGE_BYTES + 1)
        if len(body) > MAX_MESSAGE_BYTES:
            body = b'{"error":"bridge_response_too_large","mode":"read-only","order_submission_enabled":false}'
        return exc.code, body.decode("utf-8", errors="replace")
    except (URLError, TimeoutError, OSError):
        return 503, json.dumps({"error": "local_bridge_unavailable", "mode": "read-only", "order_submission_enabled": False})


async def serve_request(websocket, send_lock: asyncio.Lock, message: object, tenant_id: str, token: str) -> None:
    if not isinstance(message, dict) or message.get("type") != "request":
        return
    request_id = message.get("id")
    if not isinstance(request_id, str) or not REQUEST_ID_PATTERN.fullmatch(request_id):
        return
    if message.get("method") != "GET":
        status, body = 405, json.dumps({"error": "method_not_allowed", "mode": "read-only", "order_submission_enabled": False})
    else:
        status, body = await asyncio.to_thread(local_read, message.get("path"), tenant_id, token)

    payload = json.dumps(
        {"type": "response", "id": request_id, "status": int(status), "body": body},
        separators=(",", ":")
    )
    if len(payload.encode("utf-8")) > MAX_MESSAGE_BYTES:
        payload = json.dumps({
            "type": "response",
            "id": request_id,
            "status": 502,
            "body": '{"error":"relay_response_too_large","mode":"read-only","order_submission_enabled":false}'
        }, separators=(",", ":"))
    try:
        async with send_lock:
            await websocket.send(payload)
    except Exception:
        # The reconnect loop owns transport failures; do not log credentials or payloads.
        return


async def wait_for_local_bridge(process: asyncio.subprocess.Process, tenant_id: str, token: str) -> None:
    for _ in range(40):
        if process.returncode is not None:
            raise RuntimeError("Local MT5 Bridge process exited before becoming ready.")
        status, body = await asyncio.to_thread(local_read, "/health", tenant_id, token)
        try:
            health = json.loads(body)
        except (TypeError, json.JSONDecodeError):
            health = {}
        if (
            status == 200
            and health.get("status") == "ok"
            and health.get("mode") == "read-only"
            and health.get("order_submission_enabled") is False
        ):
            return
        await asyncio.sleep(0.5)
    raise RuntimeError("Local MT5 Bridge did not pass the protected read-only health check.")


async def run_relay(relay_url: str, tenant_id: str, token: str) -> None:
    backoff = 2
    headers = {
        "Authorization": "Bearer " + token,
        "X-VOOM-TENANT-ID": tenant_id
    }
    while True:
        try:
            async with connect(
                relay_url,
                additional_headers=headers,
                open_timeout=10,
                ping_interval=20,
                ping_timeout=20,
                max_size=MAX_MESSAGE_BYTES
            ) as websocket:
                print("[mt5-relay] authenticated outbound connection established; read-only mode")
                backoff = 2
                send_lock = asyncio.Lock()
                async for raw in websocket:
                    if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
                        continue
                    try:
                        message = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    await serve_request(websocket, send_lock, message, tenant_id, token)
        except asyncio.CancelledError:
            raise
        except Exception:
            print("[mt5-relay] outbound connection unavailable; retrying with backoff")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


async def main() -> None:
    tenant_id = Path(os.path.join(os.environ["LOCALAPPDATA"], "VOOM_SYSTEM", "secrets", "mt5-tenant-id.txt")).read_text(encoding="utf-8").strip()
    if not TENANT_ID_PATTERN.fullmatch(tenant_id):
        raise RuntimeError("Private MT5 tenant ID is missing or invalid.")

    token_path = Path(os.environ["LOCALAPPDATA"]) / "VOOM_SYSTEM" / "secrets" / ("mt5-bridge-" + tenant_id + ".token")
    token = token_path.read_text(encoding="utf-8").strip()
    if len(token) < 32:
        raise RuntimeError("Private tenant-specific bridge token is missing or invalid.")

    relay_url = validate_relay_url(os.environ.get("MT5_BRIDGE_RELAY_URL", DEFAULT_RELAY_URL))
    root = Path(__file__).resolve().parent
    bridge_process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "uvicorn",
        "bridge:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8787",
        cwd=str(root)
    )
    try:
        await wait_for_local_bridge(bridge_process, tenant_id, token)
        print("[mt5-relay] local Bridge health verified; no public local port is opened")
        await run_relay(relay_url, tenant_id, token)
    finally:
        if bridge_process.returncode is None:
            bridge_process.terminate()
            try:
                await asyncio.wait_for(bridge_process.wait(), timeout=5)
            except asyncio.TimeoutError:
                bridge_process.kill()
                await bridge_process.wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[mt5-relay] stopped")
