"""Append-only, tenant-scoped SQLite inbox for NOVA Brain telemetry.

This is a storage adapter, not an HTTP endpoint. The caller must supply a
tenant_id from authenticated server context; never accept it from event JSON.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from typing import Any, Callable

from validate_event import validate_event

_TENANT = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$")
_MAX_EVENT_BYTES = 256 * 1024


class IngestionError(ValueError):
    """Rejected telemetry event or tenant scope."""


class EventIdConflict(IngestionError):
    """An event ID was reused with a different payload in one tenant."""


@dataclass(frozen=True)
class IngestResult:
    status: str
    event_id: str
    payload_sha256: str


def _canonical_payload(event: dict[str, Any]) -> tuple[str, str]:
    encoded = json.dumps(
        event, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        allow_nan=False,
    )
    raw = encoded.encode("utf-8")
    if len(raw) > _MAX_EVENT_BYTES:
        raise IngestionError("event exceeds maximum payload size")
    return encoded, hashlib.sha256(raw).hexdigest()


class SQLiteEventInbox:
    """Tenant-isolated, append-only event inbox with idempotent event IDs."""

    def __init__(self, database_path: str):
        self.database_path = database_path
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS nova_brain_events (
                    tenant_id TEXT NOT NULL,
                    event_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    payload_sha256 TEXT NOT NULL,
                    inserted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                    PRIMARY KEY (tenant_id, event_id)
                )
            """)
            db.execute("""
                CREATE INDEX IF NOT EXISTS idx_nova_events_tenant_time
                ON nova_brain_events (tenant_id, occurred_at)
            """)

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.database_path, timeout=10.0)
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        return db

    def ingest(self, authenticated_tenant_id: str, event: Any) -> IngestResult:
        # Tenant identity is a trusted argument from the host auth layer.
        if not isinstance(authenticated_tenant_id, str) or not _TENANT.fullmatch(authenticated_tenant_id):
            raise IngestionError("invalid authenticated tenant scope")

        validate_event(event)
        payload_json, digest = _canonical_payload(event)
        event_id = event["event_id"]

        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT payload_sha256 FROM nova_brain_events WHERE tenant_id=? AND event_id=?",
                (authenticated_tenant_id, event_id),
            ).fetchone()
            if existing:
                if existing[0] != digest:
                    raise EventIdConflict("event_id already exists with a different payload")
                return IngestResult("duplicate", event_id, digest)

            db.execute(
                """INSERT INTO nova_brain_events
                   (tenant_id,event_id,event_type,occurred_at,payload_json,payload_sha256)
                   VALUES (?,?,?,?,?,?)""",
                (
                    authenticated_tenant_id, event_id, event["event_type"],
                    event["occurred_at"], payload_json, digest,
                ),
            )
            return IngestResult("inserted", event_id, digest)

    def count_for_tenant(self, authenticated_tenant_id: str) -> int:
        if not isinstance(authenticated_tenant_id, str) or not _TENANT.fullmatch(authenticated_tenant_id):
            raise IngestionError("invalid authenticated tenant scope")
        with self._connect() as db:
            row = db.execute(
                "SELECT COUNT(*) FROM nova_brain_events WHERE tenant_id=?",
                (authenticated_tenant_id,),
            ).fetchone()
            return int(row[0])

    def get_for_tenant(self, authenticated_tenant_id: str, event_id: str) -> dict[str, Any] | None:
        if not isinstance(authenticated_tenant_id, str) or not _TENANT.fullmatch(authenticated_tenant_id):
            raise IngestionError("invalid authenticated tenant scope")
        with self._connect() as db:
            row = db.execute(
                "SELECT payload_json FROM nova_brain_events WHERE tenant_id=? AND event_id=?",
                (authenticated_tenant_id, event_id),
            ).fetchone()
            return json.loads(row[0]) if row else None
