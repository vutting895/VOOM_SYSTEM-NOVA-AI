"""HMAC-authenticated, tenant-bound command envelope for the Demo adapter.

Secrets are injected out-of-band. This module contains no network or broker code.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

from adapter import PolicyRejected, validate_order_intent


class CommandAuthenticationError(PolicyRejected):
    """Signed command failed authentication, scope or replay checks."""


def _canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def sign_command(envelope: dict[str, Any], secret: bytes) -> str:
    if not isinstance(secret, bytes) or len(secret) < 32:
        raise CommandAuthenticationError("HMAC secret must contain at least 32 bytes")
    return hmac.new(secret, _canonical(envelope), hashlib.sha256).hexdigest()


def verify_signed_command(message: dict[str, Any], *, secret: bytes,
                           expected_tenant_id: str, expected_connection_id: str,
                           expected_login: int, expected_server: str,
                           now: int | None = None):
    if not isinstance(secret, bytes) or len(secret) < 32:
        raise CommandAuthenticationError("HMAC secret is missing or too short")
    if not isinstance(message, dict) or set(message) != {"envelope", "signature"}:
        raise CommandAuthenticationError("invalid signed message structure")
    envelope, signature = message["envelope"], message["signature"]
    required = {
        "tenant_id", "connection_id", "account_login", "account_server",
        "command_id", "issued_at", "expires_at", "nonce", "intent",
    }
    if not isinstance(envelope, dict) or set(envelope) != required:
        raise CommandAuthenticationError("invalid command envelope schema")
    if not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{64}", signature):
        raise CommandAuthenticationError("invalid signature format")
    expected_signature = sign_command(envelope, secret)
    if not hmac.compare_digest(expected_signature, signature):
        raise CommandAuthenticationError("command signature verification failed")
    for field, expected in (("tenant_id", expected_tenant_id), ("connection_id", expected_connection_id), ("account_server", expected_server)):
        actual = envelope[field]
        if not isinstance(actual, str) or not hmac.compare_digest(actual, expected):
            raise CommandAuthenticationError(f"{field} scope mismatch")
    if type(envelope["account_login"]) is not int or envelope["account_login"] != expected_login:
        raise CommandAuthenticationError("account login scope mismatch")
    current = int(time.time()) if now is None else int(now)
    issued, expires = envelope["issued_at"], envelope["expires_at"]
    if type(issued) is not int or type(expires) is not int or issued > current + 5 or expires <= current or expires <= issued or expires - issued > 60:
        raise CommandAuthenticationError("command is expired or outside the allowed clock window")
    nonce = envelope["nonce"]
    command_id = envelope["command_id"]
    if not isinstance(nonce, str) or not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", nonce):
        raise CommandAuthenticationError("invalid command nonce")
    if not isinstance(command_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", command_id):
        raise CommandAuthenticationError("invalid command ID")
    intent = validate_order_intent(envelope["intent"], now=current)
    if intent.command_id != command_id or intent.expires_at != expires:
        raise CommandAuthenticationError("command and intent identity/expiry mismatch")
    return intent, nonce


class ReplayGuard:
    """SQLite-backed one-time nonce store for isolated adapter preflight."""
    def __init__(self, database_path: str | Path):
        self.database_path = str(database_path)
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS consumed_nonces (nonce TEXT PRIMARY KEY, command_id TEXT NOT NULL, consumed_at INTEGER NOT NULL)")

    def _connect(self):
        db = sqlite3.connect(self.database_path, timeout=10, isolation_level="IMMEDIATE")
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        return db

    def consume(self, nonce: str, command_id: str, now: int | None = None) -> None:
        timestamp = int(time.time()) if now is None else int(now)
        with self._connect() as db:
            try:
                db.execute("INSERT INTO consumed_nonces(nonce,command_id,consumed_at) VALUES(?,?,?)", (nonce, command_id, timestamp))
            except sqlite3.IntegrityError:
                raise CommandAuthenticationError("command nonce has already been consumed") from None
