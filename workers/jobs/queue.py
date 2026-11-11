"""PostgreSQL-backed durable queue primitives for NOVA research jobs.

This module is intentionally not wired to HTTP routes or broker execution.
A future runner must register explicit handlers for the allow-listed job types.
"""
from __future__ import annotations

import json
import re
from typing import Any, Mapping, Protocol

ALLOWED_JOB_TYPES = frozenset({
    "dataset.validate",
    "dataset.manifest",
    "research.backtest",
})
_IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._/-]{7,199}$")
_FORBIDDEN_KEYS = frozenset({
    "authorization", "access_token", "refresh_token", "api_key",
    "secret", "password", "private_key", "broker_token",
})


class QueueError(ValueError):
    """Base class for rejected queue operations."""


class IdempotencyConflict(QueueError):
    """An idempotency key was reused for a different job request."""


class Connection(Protocol):
    async def fetchrow(self, query: str, *args: Any) -> Any: ...
    async def execute(self, query: str, *args: Any) -> str: ...


def _validate_payload(payload: Mapping[str, Any]) -> str:
    if not isinstance(payload, Mapping):
        raise QueueError("payload must be a JSON object")

    def inspect(value: Any) -> None:
        if isinstance(value, Mapping):
            for key, child in value.items():
                if not isinstance(key, str):
                    raise QueueError("payload keys must be strings")
                if key.lower() in _FORBIDDEN_KEYS or any(
                    marker in key.lower() for marker in ("token", "secret", "password", "credential")
                ):
                    raise QueueError("credential-like fields are forbidden in job payloads")
                inspect(child)
        elif isinstance(value, list):
            for child in value:
                inspect(child)

    inspect(payload)
    try:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise QueueError("payload must contain finite JSON-compatible values") from exc
    if len(encoded.encode("utf-8")) > 65_536:
        raise QueueError("payload exceeds 64 KiB")
    return encoded


async def enqueue_job(
    conn: Connection,
    *,
    job_type: str,
    payload: Mapping[str, Any],
    idempotency_key: str,
    max_attempts: int = 3,
    priority: int = 0,
) -> dict[str, Any]:
    """Insert one queued job; identical retries return the original row."""
    if job_type not in ALLOWED_JOB_TYPES:
        raise QueueError("job_type is not allow-listed")
    if not isinstance(idempotency_key, str) or not _IDEMPOTENCY_RE.fullmatch(idempotency_key):
        raise QueueError("idempotency_key must be 8..200 safe characters")
    if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or not 1 <= max_attempts <= 10:
        raise QueueError("max_attempts must be an integer from 1 to 10")
    if isinstance(priority, bool) or not isinstance(priority, int) or not -10 <= priority <= 10:
        raise QueueError("priority must be an integer from -10 to 10")

    encoded = _validate_payload(payload)
    row = await conn.fetchrow(
        """
        INSERT INTO nova_jobs (job_type, payload, idempotency_key, max_attempts, priority)
        VALUES ($1, $2::jsonb, $3, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING *
        """,
        job_type, encoded, idempotency_key, max_attempts, priority,
    )
    if row is not None:
        return dict(row)

    existing = await conn.fetchrow(
        "SELECT * FROM nova_jobs WHERE idempotency_key = $1",
        idempotency_key,
    )
    if existing is None:
        raise RuntimeError("idempotency conflict row disappeared")
    current = dict(existing)
    existing_payload = current.get("payload")
    if isinstance(existing_payload, str):
        existing_payload = json.loads(existing_payload)
    if current.get("job_type") != job_type or existing_payload != json.loads(encoded):
        raise IdempotencyConflict("idempotency_key already belongs to a different job")
    return current


async def claim_job(
    conn: Connection,
    *,
    worker_id: str,
    lease_seconds: int = 60,
) -> dict[str, Any] | None:
    """Atomically claim one eligible job using PostgreSQL SKIP LOCKED."""
    if not isinstance(worker_id, str) or not worker_id.strip() or len(worker_id) > 128:
        raise QueueError("worker_id must be a non-empty string up to 128 characters")
    if isinstance(lease_seconds, bool) or not isinstance(lease_seconds, int) or not 5 <= lease_seconds <= 900:
        raise QueueError("lease_seconds must be an integer from 5 to 900")

    # Expired leases that exhausted their retry budget must not remain running forever.
    await conn.execute(
        """
        UPDATE nova_jobs
        SET status = 'dead', worker_id = NULL, lease_expires_at = NULL,
            last_error_code = COALESCE(last_error_code, 'LEASE_EXPIRED'),
            updated_at = now()
        WHERE status = 'running'
          AND lease_expires_at < now()
          AND attempts >= max_attempts
        """
    )
    row = await conn.fetchrow(
        """
        WITH candidate AS (
          SELECT id
          FROM nova_jobs
          WHERE attempts < max_attempts
            AND (
              (status IN ('queued', 'retry') AND available_at <= now())
              OR (status = 'running' AND lease_expires_at < now())
            )
          ORDER BY priority DESC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE nova_jobs AS job
        SET status = 'running',
            attempts = job.attempts + 1,
            worker_id = $1,
            lease_expires_at = now() + make_interval(secs => $2),
            updated_at = now()
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.*
        """,
        worker_id, lease_seconds,
    )
    return dict(row) if row is not None else None


async def heartbeat_job(
    conn: Connection,
    *,
    job_id: str,
    worker_id: str,
    lease_seconds: int = 60,
) -> bool:
    if isinstance(lease_seconds, bool) or not isinstance(lease_seconds, int) or not 5 <= lease_seconds <= 900:
        raise QueueError("lease_seconds must be an integer from 5 to 900")
    result = await conn.execute(
        """
        UPDATE nova_jobs
        SET lease_expires_at = now() + make_interval(secs => $3),
            updated_at = now()
        WHERE id = $1 AND worker_id = $2 AND status = 'running'
          AND lease_expires_at > now()
        """,
        job_id, worker_id, lease_seconds,
    )
    return result.endswith(" 1")


async def complete_job(conn: Connection, *, job_id: str, worker_id: str) -> bool:
    result = await conn.execute(
        """
        UPDATE nova_jobs
        SET status = 'succeeded', worker_id = NULL, lease_expires_at = NULL,
            last_error_code = NULL, updated_at = now()
        WHERE id = $1 AND worker_id = $2 AND status = 'running'
          AND lease_expires_at > now()
        """,
        job_id, worker_id,
    )
    return result.endswith(" 1")


async def fail_job(
    conn: Connection,
    *,
    job_id: str,
    worker_id: str,
    error_code: str,
    retry_delay_seconds: int = 30,
) -> str:
    """Record a bounded error code; return retry or dead, never raw exception text."""
    if not re.fullmatch(r"[A-Z0-9_]{1,64}", error_code or ""):
        raise QueueError("error_code must be a short uppercase code")
    if isinstance(retry_delay_seconds, bool) or not isinstance(retry_delay_seconds, int) or not 1 <= retry_delay_seconds <= 86_400:
        raise QueueError("retry_delay_seconds must be from 1 to 86400")

    row = await conn.fetchrow(
        """
        UPDATE nova_jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'retry' END,
            available_at = CASE WHEN attempts >= max_attempts THEN available_at
                                ELSE now() + make_interval(secs => $4) END,
            worker_id = NULL, lease_expires_at = NULL,
            last_error_code = $3, updated_at = now()
        WHERE id = $1 AND worker_id = $2 AND status = 'running'
          AND lease_expires_at > now()
        RETURNING status
        """,
        job_id, worker_id, error_code, retry_delay_seconds,
    )
    if row is None:
        raise QueueError("job is not leased by this worker")
    return str(row["status"])
