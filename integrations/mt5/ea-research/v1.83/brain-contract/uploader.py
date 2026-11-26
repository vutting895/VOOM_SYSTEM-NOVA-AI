#!/usr/bin/env python3
"""Host-side NOVA Brain event uploader. Secrets are read only from environment."""
from __future__ import annotations
import argparse, hashlib, hmac, json, os, sys, urllib.error, urllib.request
from pathlib import Path
from urllib.parse import urlsplit

MAX_EVENT_BYTES = 64 * 1024
MAX_RESPONSE_BYTES = MAX_EVENT_BYTES + 4096

class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward a bearer token to a redirect target."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)

def account_scope_hmac(account_scope: str, key: str) -> str:
    if not account_scope or not key:
        raise ValueError("local account scope and HMAC key are required")
    return hmac.new(key.encode(), account_scope.encode(), hashlib.sha256).hexdigest()

def validate_endpoint(endpoint: str) -> str:
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("ingestion endpoint must be a clean HTTPS origin/path without credentials, query or fragment")
    return endpoint.rstrip("/")

def load_schema(schema_path: Path):
    try:
        import jsonschema
    except ImportError as exc:
        raise RuntimeError("Install jsonschema>=4.20; full Draft 2020-12 validation is mandatory") from exc
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(schema)
    return jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())

def validate_event(event, validator):
    validator.validate(event)
    if event.get("event_type") in {"signal", "decision"} and event.get("market", {}).get("bar_closed") is not True:
        raise ValueError("signal/decision events must reference a closed bar")
    if event.get("event_type") == "execution_audit":
        audit = event.get("execution_audit", {})
        if audit.get("mode") != "READ_ONLY" or audit.get("broker_request_attempted") is not False or audit.get("broker_transport_calls") != 0:
            raise ValueError("execution audit must prove read-only mode and zero broker transport calls")
    return event

def request_json(url: str, token: str, method: str, payload: bytes | None = None):
    req = urllib.request.Request(url, data=payload, method=method, headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "NOVA-MT5-Event-Uploader"
    })
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=20) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES:
                raise RuntimeError("API response exceeded size limit")
            return response.status, json.loads(body.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read(2048).decode("utf-8", "replace")
        raise RuntimeError(f"ingestion API rejected request: HTTP {exc.code}: {body}") from exc

def send(endpoint: str, token: str, payload: bytes):
    status, result = request_json(endpoint + "/v1/events", token, "POST", payload)
    if status not in {200, 201}:
        raise RuntimeError(f"unexpected ingestion HTTP status: {status}")
    return status, result

def read_back(endpoint: str, token: str, event_id: str, expected_payload: bytes, validator):
    status, result = request_json(endpoint + "/v1/events/" + event_id, token, "GET")
    if status != 200 or not isinstance(result, dict) or not isinstance(result.get("event"), dict):
        raise RuntimeError("API read-back response is invalid")
    returned_event = validate_event(result["event"], validator)
    returned_payload = canonical(returned_event).encode("utf-8")
    expected_digest = hashlib.sha256(expected_payload).hexdigest()
    receipt = result.get("receipt", {})
    if returned_payload != expected_payload or receipt.get("payload_sha256") != expected_digest:
        raise RuntimeError("API read-back payload or SHA-256 receipt mismatch")
    if receipt.get("event_id") != event_id:
        raise RuntimeError("API read-back event ID mismatch")
    return receipt

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("jsonl", type=Path)
    parser.add_argument("--schema", type=Path, required=True)
    args = parser.parse_args()
    try:
        endpoint = validate_endpoint(os.environ.get("NOVA_INGESTION_API_URL", "").strip())
    except ValueError as exc:
        parser.error(str(exc))
    token = os.environ.get("NOVA_SUPABASE_ACCESS_TOKEN", "")
    key = os.environ.get("NOVA_ACCOUNT_SCOPE_HMAC_KEY", "")
    account_scope = os.environ.get("NOVA_LOCAL_ACCOUNT_SCOPE", "")
    if not token or not key or not account_scope:
        parser.error("Set access token, local account scope and HMAC key in environment; never in source/CLI")
    validator = load_schema(args.schema)
    count = 0
    with args.jsonl.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            if len(line.encode("utf-8")) > MAX_EVENT_BYTES:
                raise ValueError(f"line {line_number}: event exceeds 64 KiB")
            event = json.loads(line)
            scope = event.setdefault("scope", {})
            if not isinstance(scope, dict) or "magic_scope" not in scope:
                raise ValueError(f"line {line_number}: scope.magic_scope missing")
            scope["account_scope_hmac"] = account_scope_hmac(account_scope, key)
            validate_event(event, validator)
            payload = canonical(event).encode("utf-8")
            status, result = send(endpoint, token, payload)
            expected = hashlib.sha256(payload).hexdigest()
            if result.get("receipt", {}).get("payload_sha256") != expected:
                raise RuntimeError(f"line {line_number}: ingestion receipt digest mismatch")
            receipt = read_back(endpoint, token, event["event_id"], payload, validator)
            print(json.dumps({"line": line_number, "http_status": status, "receipt": receipt}, sort_keys=True))
            count += 1
    print(json.dumps({"status": "UPLOADED_AND_READ_BACK_VERIFIED", "events": count}, sort_keys=True))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
