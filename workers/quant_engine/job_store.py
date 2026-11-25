"""SQLite-backed durable storage for NOVA research jobs.

This is a local/worker-side persistence adapter, not a network API or a
multi-region queue. Deploy it only on a persistent worker volume. Tenant
identity must be resolved by the trusted Hub before calling this module.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any

from .job_lifecycle import (
    JobEvent,
    JobLifecycleError,
    JobState,
    JobType,
    ResearchJob,
    create_research_job,
    transition_research_job,
)


class JobStoreError(RuntimeError):
    """Base error for durable job storage."""


class JobNotFoundError(JobStoreError):
    """Raised when a tenant-scoped job lookup cannot find a record."""


class JobConflictError(JobStoreError):
    """Raised for duplicate IDs, stale writes, or idempotency-key reuse."""


def _canonical_hash(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _job_dict(job: ResearchJob) -> dict[str, Any]:
    value = asdict(job)
    value["job_type"] = job.job_type.value
    value["state"] = job.state.value
    return value


def _job_from_json(value: str | dict[str, Any]) -> ResearchJob:
    raw = json.loads(value) if isinstance(value, str) else dict(value)
    raw["job_type"] = JobType(raw["job_type"])
    raw["state"] = JobState(raw["state"])
    return ResearchJob(**raw)


def _event_dict(event: JobEvent) -> dict[str, Any]:
    value = asdict(event)
    value["from_state"] = event.from_state.value if event.from_state else None
    value["to_state"] = event.to_state.value
    return value


def _event_from_json(value: str | dict[str, Any]) -> JobEvent:
    raw = json.loads(value) if isinstance(value, str) else dict(value)
    raw["from_state"] = JobState(raw["from_state"]) if raw["from_state"] else None
    raw["to_state"] = JobState(raw["to_state"])
    return JobEvent(**raw)


class SQLiteResearchJobStore:
    """Atomic tenant-scoped job/event store with idempotent writes.

    Use a persistent filesystem path, not an ephemeral container layer.
    Each operation opens its own SQLite connection and uses BEGIN IMMEDIATE
    so concurrent writers serialize before reading the current sequence.
    """

    def __init__(self, database_path: str | Path, *, busy_timeout_ms: int = 5000):
        self.database_path = str(Path(database_path).expanduser())
        if self.database_path == ":memory:":
            raise ValueError("a persistent database path is required")
        if isinstance(busy_timeout_ms, bool) or not isinstance(busy_timeout_ms, int) or busy_timeout_ms < 1:
            raise ValueError("busy_timeout_ms must be a positive integer")
        self.busy_timeout_ms = busy_timeout_ms
        Path(self.database_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path,
            timeout=self.busy_timeout_ms / 1000,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {self.busy_timeout_ms}")
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            yield connection
            if connection.in_transaction:
                connection.commit()
        except Exception:
            if connection.in_transaction:
                connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS research_jobs (
                    job_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    requester_id TEXT NOT NULL,
                    job_type TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    sequence INTEGER NOT NULL CHECK(sequence >= 0),
                    resource_profile TEXT NOT NULL CHECK(resource_profile = 'free-cpu'),
                    timeout_seconds INTEGER NOT NULL CHECK(timeout_seconds BETWEEN 1 AND 900),
                    UNIQUE(tenant_id, job_id)
                );
                CREATE INDEX IF NOT EXISTS idx_research_jobs_tenant_created
                    ON research_jobs(tenant_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS research_job_events (
                    job_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL CHECK(sequence > 0),
                    from_state TEXT,
                    to_state TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    reason_code TEXT,
                    PRIMARY KEY(job_id, sequence),
                    FOREIGN KEY(job_id) REFERENCES research_jobs(job_id)
                );
                CREATE INDEX IF NOT EXISTS idx_research_job_events_tenant
                    ON research_job_events(tenant_id, job_id, sequence);
                CREATE TABLE IF NOT EXISTS research_job_idempotency (
                    tenant_id TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    request_sha256 TEXT NOT NULL,
                    response_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(tenant_id, idempotency_key)
                );
                """
            )

    @staticmethod
    def _validate_idempotency_key(value: str) -> str:
        if not isinstance(value, str) or not value.strip() or len(value) > 128:
            raise JobLifecycleError("idempotency_key must contain 1..128 characters")
        return value

    @staticmethod
    def _idempotent_response(
        connection: sqlite3.Connection,
        *,
        tenant_id: str,
        idempotency_key: str,
        operation: str,
        request_sha256: str,
    ) -> str | None:
        row = connection.execute(
            """SELECT operation, request_sha256, response_json
               FROM research_job_idempotency
               WHERE tenant_id = ? AND idempotency_key = ?""",
            (tenant_id, idempotency_key),
        ).fetchone()
        if row is None:
            return None
        if row["operation"] != operation or row["request_sha256"] != request_sha256:
            raise JobConflictError("idempotency key was already used for a different request")
        return row["response_json"]

    @staticmethod
    def _save_idempotency(
        connection: sqlite3.Connection,
        *,
        tenant_id: str,
        idempotency_key: str,
        operation: str,
        request_sha256: str,
        response_json: str,
    ) -> None:
        connection.execute(
            """INSERT INTO research_job_idempotency
               (tenant_id, idempotency_key, operation, request_sha256, response_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                tenant_id,
                idempotency_key,
                operation,
                request_sha256,
                response_json,
                datetime.now(timezone.utc).isoformat(),
            ),
        )

    @staticmethod
    def _write_job(connection: sqlite3.Connection, job: ResearchJob) -> None:
        connection.execute(
            """INSERT INTO research_jobs
               (job_id, tenant_id, requester_id, job_type, state, created_at, updated_at,
                sequence, resource_profile, timeout_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job.job_id, job.tenant_id, job.requester_id, job.job_type.value,
                job.state.value, job.created_at, job.updated_at, job.sequence,
                job.resource_profile, job.timeout_seconds,
            ),
        )

    @staticmethod
    def _update_job(
        connection: sqlite3.Connection,
        previous: ResearchJob,
        updated: ResearchJob,
    ) -> None:
        cursor = connection.execute(
            """UPDATE research_jobs
               SET state = ?, updated_at = ?, sequence = ?
               WHERE tenant_id = ? AND job_id = ? AND state = ? AND sequence = ?""",
            (
                updated.state.value, updated.updated_at, updated.sequence,
                previous.tenant_id, previous.job_id, previous.state.value, previous.sequence,
            ),
        )
        if cursor.rowcount != 1:
            raise JobConflictError("job changed concurrently; reload before retrying")

    def create(
        self,
        *,
        job_id: str,
        tenant_id: str,
        requester_id: str,
        job_type: str | JobType,
        created_at: str,
        idempotency_key: str,
        resource_profile: str = "free-cpu",
        timeout_seconds: int = 900,
    ) -> ResearchJob:
        key = self._validate_idempotency_key(idempotency_key)
        job = create_research_job(
            job_id=job_id,
            tenant_id=tenant_id,
            requester_id=requester_id,
            job_type=job_type,
            created_at=created_at,
            resource_profile=resource_profile,
            timeout_seconds=timeout_seconds,
        )
        request = {
            "job": _job_dict(job),
            "resource_profile": resource_profile,
            "timeout_seconds": timeout_seconds,
        }
        digest = _canonical_hash(request)
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            replay = self._idempotent_response(
                connection, tenant_id=tenant_id, idempotency_key=key,
                operation="create", request_sha256=digest,
            )
            if replay is not None:
                return _job_from_json(replay)
            try:
                self._write_job(connection, job)
            except sqlite3.IntegrityError as exc:
                raise JobConflictError("job_id already exists") from exc
            self._save_idempotency(
                connection, tenant_id=tenant_id, idempotency_key=key,
                operation="create", request_sha256=digest,
                response_json=json.dumps(_job_dict(job), sort_keys=True),
            )
            return job

    def get(self, *, tenant_id: str, job_id: str) -> ResearchJob:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM research_jobs WHERE tenant_id = ? AND job_id = ?",
                (tenant_id, job_id),
            ).fetchone()
        if row is None:
            raise JobNotFoundError("research job not found")
        return ResearchJob(
            job_id=row["job_id"], tenant_id=row["tenant_id"],
            requester_id=row["requester_id"], job_type=JobType(row["job_type"]),
            state=JobState(row["state"]), created_at=row["created_at"],
            updated_at=row["updated_at"], sequence=row["sequence"],
            resource_profile=row["resource_profile"], timeout_seconds=row["timeout_seconds"],
        )

    def list_events(self, *, tenant_id: str, job_id: str) -> tuple[JobEvent, ...]:
        # Verify tenant ownership before returning the event stream.
        self.get(tenant_id=tenant_id, job_id=job_id)
        with self._connection() as connection:
            rows = connection.execute(
                """SELECT * FROM research_job_events
                   WHERE tenant_id = ? AND job_id = ? ORDER BY sequence ASC""",
                (tenant_id, job_id),
            ).fetchall()
        return tuple(
            JobEvent(
                job_id=row["job_id"], tenant_id=row["tenant_id"],
                sequence=row["sequence"],
                from_state=JobState(row["from_state"]) if row["from_state"] else None,
                to_state=JobState(row["to_state"]), actor_id=row["actor_id"],
                occurred_at=row["occurred_at"], reason_code=row["reason_code"],
            )
            for row in rows
        )

    def transition(
        self,
        *,
        tenant_id: str,
        job_id: str,
        expected_state: str | JobState,
        next_state: str | JobState,
        actor_id: str,
        occurred_at: str,
        idempotency_key: str,
        reason_code: str | None = None,
    ) -> tuple[ResearchJob, JobEvent]:
        key = self._validate_idempotency_key(idempotency_key)
        request = {
            "job_id": job_id,
            "expected_state": str(expected_state),
            "next_state": str(next_state),
            "actor_id": actor_id,
            "occurred_at": occurred_at,
            "reason_code": reason_code,
        }
        digest = _canonical_hash(request)
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            replay = self._idempotent_response(
                connection, tenant_id=tenant_id, idempotency_key=key,
                operation="transition", request_sha256=digest,
            )
            if replay is not None:
                value = json.loads(replay)
                return _job_from_json(value["job"]), _event_from_json(value["event"])
            row = connection.execute(
                "SELECT * FROM research_jobs WHERE tenant_id = ? AND job_id = ?",
                (tenant_id, job_id),
            ).fetchone()
            if row is None:
                raise JobNotFoundError("research job not found")
            previous = ResearchJob(
                job_id=row["job_id"], tenant_id=row["tenant_id"],
                requester_id=row["requester_id"], job_type=JobType(row["job_type"]),
                state=JobState(row["state"]), created_at=row["created_at"],
                updated_at=row["updated_at"], sequence=row["sequence"],
                resource_profile=row["resource_profile"], timeout_seconds=row["timeout_seconds"],
            )
            try:
                updated, event = transition_research_job(
                    previous,
                    expected_state=expected_state,
                    next_state=next_state,
                    actor_id=actor_id,
                    occurred_at=occurred_at,
                    reason_code=reason_code,
                )
            except JobLifecycleError:
                raise
            self._update_job(connection, previous, updated)
            connection.execute(
                """INSERT INTO research_job_events
                   (job_id, tenant_id, sequence, from_state, to_state, actor_id, occurred_at, reason_code)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event.job_id, event.tenant_id, event.sequence,
                    event.from_state.value if event.from_state else None,
                    event.to_state.value, event.actor_id, event.occurred_at, event.reason_code,
                ),
            )
            response = json.dumps(
                {"job": _job_dict(updated), "event": _event_dict(event)},
                sort_keys=True,
            )
            self._save_idempotency(
                connection, tenant_id=tenant_id, idempotency_key=key,
                operation="transition", request_sha256=digest,
                response_json=response,
            )
            return updated, event
