"""Fail-closed policy core for the isolated Exness MT5 Demo adapter.

This module deliberately does not expose order_send. Broker mutation is blocked
until the signed command protocol, durable ledger, and dedicated relay are implemented.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class PolicyRejected(RuntimeError):
    """A command failed a mandatory execution policy check."""


@dataclass(frozen=True)
class DemoIdentity:
    login: int
    server: str
    company: str
    currency: str
    trade_mode: int


@dataclass(frozen=True)
class OrderIntent:
    idempotency_key: str
    symbol: str
    side: str
    volume: float
    stop_loss: float
    take_profit: float
    expires_at: int
    policy_version: str
    payload_hash: str


def _safe_text(value: Any, limit: int = 128) -> str:
    return str(value or "").strip()[:limit]


def verify_demo_identity(account: Any, terminal: Any, mt5: Any,
                         expected_login: int, expected_server: str) -> DemoIdentity:
    """Verify account mode, Exness identity and pinned account identity."""
    if account is None or terminal is None:
        raise PolicyRejected("MT5 account or terminal is unavailable")
    demo_mode = getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", None)
    trade_mode = getattr(account, "trade_mode", None)
    server = _safe_text(getattr(account, "server", ""))
    company = _safe_text(getattr(terminal, "company", ""))
    login = getattr(account, "login", None)
    if demo_mode is None or trade_mode != demo_mode:
        raise PolicyRejected("Only MT5 Demo accounts are permitted")
    if "exness" not in (server + " " + company).lower():
        raise PolicyRejected("Broker identity is not on the Exness allowlist")
    if not isinstance(login, int) or login != expected_login:
        raise PolicyRejected("MT5 account login does not match the pinned account")
    if not expected_server or server.casefold() != expected_server.casefold():
        raise PolicyRejected("MT5 server does not match the pinned account")
    if not bool(getattr(terminal, "connected", False)):
        raise PolicyRejected("MT5 terminal is disconnected")
    return DemoIdentity(
        login=login, server=server, company=company,
        currency=_safe_text(getattr(account, "currency", "")),
        trade_mode=trade_mode,
    )


def require_execution_switches(environ: dict[str, str] | None = None) -> None:
    """Require explicit Demo enablement while permanently rejecting Live mode."""
    env = os.environ if environ is None else environ
    if env.get("NOVA_DEMO_EXECUTION_ENABLED") != "true":
        raise PolicyRejected("Demo execution feature flag is not enabled")
    if env.get("NOVA_LIVE_TRADING_ENABLED", "false").lower() != "false":
        raise PolicyRejected("Live trading must remain disabled")
    if env.get("NOVA_ORDERS_ENABLED") != "true":
        raise PolicyRejected("Order capability is not explicitly enabled for Demo")


def validate_order_intent(payload: dict[str, Any], now: int | None = None) -> OrderIntent:
    """Validate a narrow market-order intent; this does not submit it."""
    if not isinstance(payload, dict):
        raise PolicyRejected("Command payload must be an object")
    required = {
        "idempotency_key", "symbol", "side", "volume", "stop_loss",
        "take_profit", "expires_at", "policy_version", "payload_hash",
        "risk_approved",
    }
    if set(payload) != required:
        raise PolicyRejected("Command payload fields do not match the strict schema")
    key = payload["idempotency_key"]
    symbol = payload["symbol"]
    side = payload["side"]
    if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", key):
        raise PolicyRejected("Invalid idempotency key")
    if not isinstance(symbol, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", symbol):
        raise PolicyRejected("Invalid symbol")
    if side not in {"buy", "sell"}:
        raise PolicyRejected("Only explicit buy or sell side is allowed")
    if payload["risk_approved"] is not True:
        raise PolicyRejected("Server-side risk approval is required")
    try:
        volume = float(payload["volume"])
        sl = float(payload["stop_loss"])
        tp = float(payload["take_profit"])
        expiry = int(payload["expires_at"])
    except (TypeError, ValueError, OverflowError):
        raise PolicyRejected("Invalid numeric command fields") from None
    if not all(map(lambda n: n > 0 and n < float("inf"), (volume, sl, tp))):
        raise PolicyRejected("Volume, SL and TP must be finite positive values")
    current = int(time.time()) if now is None else int(now)
    if expiry <= current or expiry > current + 60:
        raise PolicyRejected("Command is expired or exceeds the 60-second lifetime")
    policy_version = payload["policy_version"]
    if not isinstance(policy_version, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", policy_version):
        raise PolicyRejected("Invalid policy version")
    canonical = {k: payload[k] for k in sorted(payload) if k != "payload_hash"}
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if not isinstance(payload["payload_hash"], str) or not __import__("hmac").compare_digest(digest, payload["payload_hash"]):
        raise PolicyRejected("Command payload hash mismatch")
    return OrderIntent(key, symbol, side, volume, sl, tp, expiry, policy_version, digest)


class IdempotencyLedger:
    """SQLite-backed intent ledger. A key can be claimed only once."""
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS command_ledger (
                    idempotency_key TEXT PRIMARY KEY,
                    payload_hash TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level="IMMEDIATE")
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        return db

    def claim(self, intent: OrderIntent, now: int | None = None) -> bool:
        """Return True only for a newly persisted command; duplicates never dispatch."""
        timestamp = int(time.time()) if now is None else int(now)
        with self._connect() as db:
            try:
                db.execute(
                    "INSERT INTO command_ledger(idempotency_key,payload_hash,state,created_at) VALUES(?,?,?,?)",
                    (intent.idempotency_key, intent.payload_hash, "accepted_not_dispatched", timestamp),
                )
                return True
            except sqlite3.IntegrityError:
                row = db.execute(
                    "SELECT payload_hash FROM command_ledger WHERE idempotency_key=?",
                    (intent.idempotency_key,),
                ).fetchone()
                if row and row[0] != intent.payload_hash:
                    raise PolicyRejected("Idempotency key was reused with a different payload")
                return False

    def set_state(self, key: str, state: str) -> None:
        allowed = {"accepted_not_dispatched", "dispatch_started", "broker_confirmed",
                   "rejected", "unknown_reconciliation_required"}
        if state not in allowed:
            raise PolicyRejected("Invalid command state")
        with self._connect() as db:
            cursor = db.execute(
                "UPDATE command_ledger SET state=? WHERE idempotency_key=?", (state, key)
            )
            if cursor.rowcount != 1:
                raise PolicyRejected("Unknown command idempotency key")
