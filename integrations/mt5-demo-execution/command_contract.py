"""Authenticated command envelope for the isolated Demo execution relay.

The HMAC key is provisioned out-of-band and must be shared only between the
NOVA API signer and the Windows Demo adapter. This module has no network listener.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

from adapter import PolicyRejected, OrderIntent, validate_order_intent


class CommandAuthenticationError(PolicyRejected):
    """Signed command failed authentication, tenancy or replay checks."""


def _canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def sign_command(envelope: dict[str, Any], secret: bytes) -> str:
    """Signing helper for trusted API-side tests/tooling; never expose secret to clients."""
    if len(secret) < 32:
        raise CommandAuthenticationError("HMAC secret must contain at least 32 bytes")
    return hmac.new(secret, _canonical(envelope), hashlib.sha256).hexdigest()


def verify_signed_command(
    message: dict[str, Any],
    *,
    secret: bytes,
    expected_tenant_id: str,
    expected_connection_id: str,
    expected_login: int,
    expected_server: str,
    now: int | None = None,
) -> tuple[OrderIntent, str]:
    if len(secret) < 32:
        raise CommandAuthenticationError("HMAC secret is missing or too short")
    if not isinstance(message, dict) or set(message) != {"envelope", "signature"}:
        raise CommandAuthenticationError("Invalid signed message structure")
    envelope = message["envelope"]
    signature = message["signature"]
    fields = {
        "tenant_id", "connection_id", "account_login", "account_server",
        "command_id", "issued_at", "expires_at", "nonce", "intent",
    }
    if not isinstance(envelope, dict) or set(envelope) != fields:
        raise CommandAuthenticationError("Invalid command envelope schema")
    if not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{64}", signature):
        raise CommandAuthenticationError("Invalid command signature format")
    expected = hmac.new(secret, _canonical(envelope), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise CommandAuthenticationError("Command signature verification failed")
    if not hmac.compare_digest(str(envelope["tenant_id"]), expected_tenant_id):
        raise CommandAuthenticationError("Tenant scope mismatch")
    if not hmac.compare_digest(str(envelope["connection_id"]), expected_connection_id):
        raise CommandAuthenticationError("Broker connection scope mismatch")
    if envelope["account_login"] != expected_login:
        raise CommandAuthenticationError("Account login scope mismatch")
    if not hmac.compare_digest(str(envelope["account_server"]), expected_server):
        raise CommandAuthenticationError("Account server scope mismatch")
    issued = envelope["issued_at"]
    expires = envelope["expires_at"]
    current = int(time.time()) if now is None else int(now)
    if type(issued) is not int or type(expires) is not int:
        raise CommandAuthenticationError("Invalid command timestamps")
    if issued > current + 5 or expires <= current or expires <= issued or expires - issued > 60:
        raise CommandAuthenticationError("Command is expired or outside the allowed clock window")
    nonce = envelope["nonce"]
    command_id = envelope["command_id"]
    if not isinstance(nonce, str) or not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", nonce):
        raise CommandAuthenticationError("Invalid command nonce")
    if not isinstance(command_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", command_id):
        raise CommandAuthenticationError("Invalid command ID")
    intent_payload = envelope["intent"]
    if not isinstance(intent_payload, dict):
        raise CommandAuthenticationError("Intent must be an object")
    intent = validate_order_intent(intent_payload, now=current)
    if intent.idempotency_key != command_id:
        raise CommandAuthenticationError("Command ID and idempotency key do not match")
    if intent.expires_at != expires:
        raise CommandAuthenticationError("Envelope and intent expiry do not match")
    return intent, nonce


class ReplayGuard:
    """Durable one-time nonce store. Rejects replay even after process restart."""
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS consumed_nonces (
                    nonce TEXT PRIMARY KEY,
                    command_id TEXT NOT NULL,
                    consumed_at INTEGER NOT NULL
                )
            """)

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level="IMMEDIATE")
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        return db

    def consume(self, nonce: str, command_id: str, now: int | None = None) -> None:
        timestamp = int(time.time()) if now is None else int(now)
        with self._connect() as db:
            try:
                db.execute(
                    "INSERT INTO consumed_nonces(nonce,command_id,consumed_at) VALUES(?,?,?)",
                    (nonce, command_id, timestamp),
                )
            except sqlite3.IntegrityError:
                raise CommandAuthenticationError("Command nonce has already been consumed") from None
