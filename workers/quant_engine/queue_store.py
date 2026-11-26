"""Single-node durable QuantLab queue with tenant-scoped jobs and leased claims.

SQLite must live on a persistent, backed-up volume. This is deliberately not
advertised as a distributed/multi-region queue.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
from typing import Any


class QueueConflict(ValueError):
    pass


class QueueNotFound(LookupError):
    pass


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")).hexdigest()


class SQLiteQuantLabQueue:
    """Atomic queue, append-only event ledger, idempotency and expiring leases."""

    def __init__(self, database_path: str, *, busy_timeout_ms: int = 5000):
        if not isinstance(database_path, str) or not database_path.strip() or database_path == ":memory:":
            raise ValueError("QUANTLAB_DB_PATH must be a persistent filesystem path")
        if not Path(database_path).is_absolute():
            raise ValueError("QUANTLAB_DB_PATH must be absolute")
        self.path = database_path
        self.busy_timeout_ms = busy_timeout_ms
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=self.busy_timeout_ms / 1000, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(f"PRAGMA busy_timeout={self.busy_timeout_ms}")
        return db

    @contextmanager
    def connection(self):
        db = self.connect()
        try:
            yield db
            if db.in_transaction:
                db.commit()
        except Exception:
            if db.in_transaction:
                db.rollback()
            raise
        finally:
            db.close()

    def initialize(self) -> None:
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
              CREATE TABLE IF NOT EXISTS quantlab_jobs (
                job_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                requester_id TEXT NOT NULL,
                job_type TEXT NOT NULL CHECK(job_type IN ('dataset.validate','backtest','train','evaluate')),
                state TEXT NOT NULL CHECK(state IN ('QUEUED','VALIDATING','RUNNING','FINALIZING','SUCCEEDED','REJECTED','FAILED','CANCELLED','TIMED_OUT')),
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sequence INTEGER NOT NULL DEFAULT 0 CHECK(sequence >= 0),
                timeout_seconds INTEGER NOT NULL CHECK(timeout_seconds BETWEEN 1 AND 900),
                attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
                lease_owner TEXT,
                lease_token_hash TEXT,
                lease_expires_at TEXT,
                last_error_code TEXT,
                UNIQUE(tenant_id, job_id)
              );
              CREATE INDEX IF NOT EXISTS idx_quantlab_jobs_tenant_created
                ON quantlab_jobs(tenant_id, created_at DESC, job_id DESC);
              CREATE INDEX IF NOT EXISTS idx_quantlab_jobs_queue
                ON quantlab_jobs(state, created_at);
              CREATE TABLE IF NOT EXISTS quantlab_events (
                tenant_id TEXT NOT NULL,
                job_id TEXT NOT NULL,
                sequence INTEGER NOT NULL CHECK(sequence > 0),
                from_state TEXT,
                to_state TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                reason_code TEXT,
                PRIMARY KEY(tenant_id, job_id, sequence),
                FOREIGN KEY(tenant_id, job_id) REFERENCES quantlab_jobs(tenant_id, job_id)
              );
              CREATE TRIGGER IF NOT EXISTS quantlab_events_no_update
                BEFORE UPDATE ON quantlab_events BEGIN
                  SELECT RAISE(ABORT, 'quantlab_events is append-only');
                END;
              CREATE TRIGGER IF NOT EXISTS quantlab_events_no_delete
                BEFORE DELETE ON quantlab_events BEGIN
                  SELECT RAISE(ABORT, 'quantlab_events is append-only');
                END;
              CREATE TABLE IF NOT EXISTS quantlab_idempotency (
                tenant_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                request_sha256 TEXT NOT NULL,
                job_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(tenant_id, idempotency_key),
                FOREIGN KEY(tenant_id, job_id) REFERENCES quantlab_jobs(tenant_id, job_id)
              );
            """)

    @staticmethod
    def public_job(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "job_id": row["job_id"], "state": row["state"], "job_type": row["job_type"],
            "created_at": row["created_at"], "updated_at": row["updated_at"],
            "timeout_seconds": row["timeout_seconds"], "attempt_count": row["attempt_count"],
            "last_error_code": row["last_error_code"],
        }

    @staticmethod
    def _event(db: sqlite3.Connection, *, tenant: str, job_id: str, sequence: int,
               previous: str | None, target: str, actor: str, reason: str | None = None) -> None:
        db.execute(
            """INSERT INTO quantlab_events
               (tenant_id,job_id,sequence,from_state,to_state,actor_id,occurred_at,reason_code)
               VALUES(?,?,?,?,?,?,?,?)""",
            (tenant, job_id, sequence, previous, target, actor, utcnow(), reason),
        )

    def create(self, *, tenant_id: str, requester_id: str, job_type: str,
               payload: dict[str, Any], timeout_seconds: int, idempotency_key: str) -> tuple[dict, bool]:
        request_hash = canonical_hash({"job_type": job_type, "payload": payload, "timeout_seconds": timeout_seconds})
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT request_sha256,job_id FROM quantlab_idempotency WHERE tenant_id=? AND idempotency_key=?",
                (tenant_id, idempotency_key),
            ).fetchone()
            if old:
                if old["request_sha256"] != request_hash:
                    raise QueueConflict("idempotency_key_reused_with_different_request")
                row = db.execute("SELECT * FROM quantlab_jobs WHERE tenant_id=? AND job_id=?",
                                 (tenant_id, old["job_id"])).fetchone()
                return self.public_job(row), True
            job_id = "ql_" + secrets.token_urlsafe(18)
            now = utcnow()
            db.execute(
                """INSERT INTO quantlab_jobs
                   (job_id,tenant_id,requester_id,job_type,state,payload_json,created_at,updated_at,sequence,timeout_seconds)
                   VALUES(?,?,?,?,?,?,?,?,0,?)""",
                (job_id, tenant_id, requester_id, job_type, "QUEUED",
                 json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False), now, now, timeout_seconds),
            )
            self._event(db, tenant=tenant_id, job_id=job_id, sequence=1,
                        previous=None, target="QUEUED", actor=requester_id, reason="job_created")
            db.execute("UPDATE quantlab_jobs SET sequence=1 WHERE job_id=?", (job_id,))
            db.execute(
                "INSERT INTO quantlab_idempotency VALUES(?,?,?,?,?)",
                (tenant_id, idempotency_key, request_hash, job_id, now),
            )
            row = db.execute("SELECT * FROM quantlab_jobs WHERE job_id=?", (job_id,)).fetchone()
            return self.public_job(row), False

    def get(self, *, tenant_id: str, job_id: str) -> dict:
        with self.connection() as db:
            row = db.execute("SELECT * FROM quantlab_jobs WHERE tenant_id=? AND job_id=?",
                             (tenant_id, job_id)).fetchone()
        if not row:
            raise QueueNotFound("job_not_found")
        return self.public_job(row)

    def list(self, *, tenant_id: str, limit: int, state: str = "", cursor: str = "") -> dict:
        params: list[Any] = [tenant_id]
        where = "tenant_id=?"
        if state:
            where += " AND state=?"
            params.append(state)
        if cursor:
            try:
                created_at, job_id = json.loads(__import__("base64").urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
                if not isinstance(created_at, str) or not isinstance(job_id, str):
                    raise ValueError
            except Exception as exc:
                raise ValueError("invalid_cursor") from exc
            where += " AND (created_at < ? OR (created_at = ? AND job_id < ?))"
            params.extend([created_at, created_at, job_id])
        with self.connection() as db:
            rows = db.execute(
                f"SELECT * FROM quantlab_jobs WHERE {where} ORDER BY created_at DESC,job_id DESC LIMIT ?",
                (*params, limit + 1),
            ).fetchall()
        more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = None
        if more and rows:
            import base64
            next_cursor = base64.urlsafe_b64encode(json.dumps(
                [rows[-1]["created_at"], rows[-1]["job_id"]], separators=(",", ":")
            ).encode()).decode().rstrip("=")
        return {"jobs": [self.public_job(row) for row in rows], "next_cursor": next_cursor}

    def events(self, *, tenant_id: str, job_id: str) -> dict:
        self.get(tenant_id=tenant_id, job_id=job_id)
        with self.connection() as db:
            rows = db.execute(
                """SELECT sequence,from_state,to_state,actor_id,occurred_at,reason_code
                   FROM quantlab_events WHERE tenant_id=? AND job_id=? ORDER BY sequence""",
                (tenant_id, job_id),
            ).fetchall()
        return {"events": [dict(row) for row in rows]}

    def claim(self, *, worker_id: str, lease_seconds: int = 30) -> dict | None:
        now = datetime.now(timezone.utc)
        expiry = (now + timedelta(seconds=lease_seconds)).isoformat()
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            # Expired leases are returned to the queue; attempts remain recorded.
            expired = db.execute(
                """SELECT * FROM quantlab_jobs
                   WHERE state='RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?""",
                (now.isoformat(),),
            ).fetchall()
            for row in expired:
                seq = row["sequence"] + 1
                db.execute(
                    """UPDATE quantlab_jobs SET state='QUEUED',updated_at=?,sequence=?,
                       lease_owner=NULL,lease_token_hash=NULL,lease_expires_at=NULL,last_error_code='lease_expired'
                       WHERE tenant_id=? AND job_id=? AND state='RUNNING' AND sequence=?""",
                    (now.isoformat(), seq, row["tenant_id"], row["job_id"], row["sequence"]),
                )
                self._event(db, tenant=row["tenant_id"], job_id=row["job_id"], sequence=seq,
                            previous="RUNNING", target="QUEUED", actor="dispatcher", reason="lease_expired")
            row = db.execute(
                "SELECT * FROM quantlab_jobs WHERE state='QUEUED' ORDER BY created_at,job_id LIMIT 1"
            ).fetchone()
            if not row:
                return None
            token = secrets.token_urlsafe(32)
            seq = row["sequence"] + 1
            changed = db.execute(
                """UPDATE quantlab_jobs SET state='RUNNING',updated_at=?,sequence=?,attempt_count=attempt_count+1,
                   lease_owner=?,lease_token_hash=?,lease_expires_at=?,last_error_code=NULL
                   WHERE tenant_id=? AND job_id=? AND state='QUEUED' AND sequence=?""",
                (now.isoformat(), seq, worker_id, hashlib.sha256(token.encode()).hexdigest(),
                 expiry, row["tenant_id"], row["job_id"], row["sequence"]),
            )
            if changed.rowcount != 1:
                return None
            self._event(db, tenant=row["tenant_id"], job_id=row["job_id"], sequence=seq,
                        previous="QUEUED", target="RUNNING", actor=worker_id, reason="lease_claimed")
            updated = db.execute("SELECT * FROM quantlab_jobs WHERE job_id=?", (row["job_id"],)).fetchone()
            return {"job": {**self.public_job(updated), "tenant_id": updated["tenant_id"], "requester_id": updated["requester_id"]}, "payload": json.loads(updated["payload_json"]),
                    "lease_token": token, "lease_expires_at": expiry}

    def heartbeat(self, *, job_id: str, worker_id: str, lease_token: str, lease_seconds: int = 30) -> str:
        token_hash = hashlib.sha256(lease_token.encode()).hexdigest()
        expiry = (datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)).isoformat()
        with self.connection() as db:
            cur = db.execute(
                """UPDATE quantlab_jobs SET lease_expires_at=?,updated_at=?
                   WHERE job_id=? AND state='RUNNING' AND lease_owner=? AND lease_token_hash=?
                     AND lease_expires_at >= ?""",
                (expiry, utcnow(), job_id, worker_id, token_hash, utcnow()),
            )
            if cur.rowcount != 1:
                raise QueueConflict("lease_invalid_or_expired")
        return expiry

    def finish(self, *, job_id: str, worker_id: str, lease_token: str,
               state: str, error_code: str | None = None) -> dict:
        if state not in {"SUCCEEDED", "FAILED", "REJECTED", "TIMED_OUT"}:
            raise ValueError("invalid_terminal_state")
        token_hash = hashlib.sha256(lease_token.encode()).hexdigest()
        now = utcnow()
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM quantlab_jobs WHERE job_id=?", (job_id,)).fetchone()
            if not row:
                raise QueueNotFound("job_not_found")
            if (row["state"] != "RUNNING" or row["lease_owner"] != worker_id
                    or row["lease_token_hash"] != token_hash or not row["lease_expires_at"]
                    or row["lease_expires_at"] < now):
                raise QueueConflict("lease_invalid_or_expired")
            seq = row["sequence"] + 1
            db.execute(
                """UPDATE quantlab_jobs SET state=?,updated_at=?,sequence=?,lease_owner=NULL,
                   lease_token_hash=NULL,lease_expires_at=NULL,last_error_code=?
                   WHERE job_id=? AND state='RUNNING' AND sequence=?""",
                (state, now, seq, error_code, job_id, row["sequence"]),
            )
            self._event(db, tenant=row["tenant_id"], job_id=job_id, sequence=seq,
                        previous="RUNNING", target=state, actor=worker_id, reason=error_code)
            updated = db.execute("SELECT * FROM quantlab_jobs WHERE job_id=?", (job_id,)).fetchone()
            return self.public_job(updated)
