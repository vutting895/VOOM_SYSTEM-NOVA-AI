"""Fail-closed research job lifecycle primitives for the NOVA Quant Engine.

This module is a pure domain state machine. It does not persist jobs, enqueue
workers, create leases, call brokers, or expose an HTTP endpoint. The Hub/job
service must provide durable storage, tenant authorization, idempotency and
worker lease handling around these primitives.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
import re


_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_REASON = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")


class JobLifecycleError(ValueError):
    """Raised when a research job or state transition violates its contract."""


class JobType(StrEnum):
    DATASET_VALIDATE = "dataset.validate"
    BACKTEST = "backtest"
    TRAIN = "train"
    EVALUATE = "evaluate"


class JobState(StrEnum):
    QUEUED = "QUEUED"
    VALIDATING = "VALIDATING"
    RUNNING = "RUNNING"
    FINALIZING = "FINALIZING"
    SUCCEEDED = "SUCCEEDED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"


TERMINAL_STATES = frozenset({
    JobState.SUCCEEDED,
    JobState.REJECTED,
    JobState.FAILED,
    JobState.CANCELLED,
    JobState.TIMED_OUT,
})

_ALLOWED_TRANSITIONS = {
    JobState.QUEUED: frozenset({
        JobState.VALIDATING, JobState.REJECTED, JobState.CANCELLED, JobState.TIMED_OUT,
    }),
    JobState.VALIDATING: frozenset({
        JobState.RUNNING, JobState.REJECTED, JobState.FAILED,
        JobState.CANCELLED, JobState.TIMED_OUT,
    }),
    JobState.RUNNING: frozenset({
        JobState.FINALIZING, JobState.FAILED, JobState.CANCELLED, JobState.TIMED_OUT,
    }),
    JobState.FINALIZING: frozenset({
        JobState.SUCCEEDED, JobState.FAILED, JobState.TIMED_OUT,
    }),
}


@dataclass(frozen=True, slots=True)
class ResearchJob:
    """Immutable snapshot; tenant/requester must be resolved by the trusted Hub."""

    job_id: str
    tenant_id: str
    requester_id: str
    job_type: JobType
    state: JobState
    created_at: str
    updated_at: str
    sequence: int = 0
    resource_profile: str = "free-cpu"
    timeout_seconds: int = 900


@dataclass(frozen=True, slots=True)
class JobEvent:
    """Append-only event value to persist in the durable event ledger."""

    job_id: str
    tenant_id: str
    sequence: int
    from_state: JobState | None
    to_state: JobState
    actor_id: str
    occurred_at: str
    reason_code: str | None = None


def _identifier(value: object, field: str) -> str:
    if not isinstance(value, str) or not _ID.fullmatch(value):
        raise JobLifecycleError(f"{field} must be a valid non-empty identifier")
    return value


def _timestamp(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise JobLifecycleError(f"{field} must be a timezone-aware ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise JobLifecycleError(f"{field} must be a timezone-aware ISO-8601 string") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise JobLifecycleError(f"{field} must include a timezone")
    return parsed


def create_research_job(
    *,
    job_id: str,
    tenant_id: str,
    requester_id: str,
    job_type: str | JobType,
    created_at: str,
    resource_profile: str = "free-cpu",
    timeout_seconds: int = 900,
) -> ResearchJob:
    """Create a queued research job after Hub-side identity/tenant resolution.

    Only allowlisted research workloads are accepted. Broker/order/execution
    operations are intentionally absent from JobType and cannot be submitted
    through this domain contract.
    """
    try:
        kind = JobType(job_type)
    except (ValueError, TypeError) as exc:
        raise JobLifecycleError("job_type is not an allowlisted research workload") from exc

    if resource_profile != "free-cpu":
        raise JobLifecycleError("resource_profile must be free-cpu")
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int):
        raise JobLifecycleError("timeout_seconds must be an integer")
    if not 1 <= timeout_seconds <= 900:
        raise JobLifecycleError("timeout_seconds must be in range 1..900")

    _identifier(job_id, "job_id")
    _identifier(tenant_id, "tenant_id")
    _identifier(requester_id, "requester_id")
    _timestamp(created_at, "created_at")

    return ResearchJob(
        job_id=job_id,
        tenant_id=tenant_id,
        requester_id=requester_id,
        job_type=kind,
        state=JobState.QUEUED,
        created_at=created_at,
        updated_at=created_at,
        sequence=0,
        resource_profile=resource_profile,
        timeout_seconds=timeout_seconds,
    )


def transition_research_job(
    job: ResearchJob,
    *,
    expected_state: str | JobState,
    next_state: str | JobState,
    actor_id: str,
    occurred_at: str,
    reason_code: str | None = None,
) -> tuple[ResearchJob, JobEvent]:
    """Apply one legal transition with optimistic state checking.

    The caller must persist the returned snapshot and event atomically. This
    function does not implement database concurrency or durable idempotency.
    Terminal jobs are immutable; retry must create a new job linked by the
    persistence layer rather than mutate a completed/failed job.
    """
    try:
        expected = JobState(expected_state)
        target = JobState(next_state)
    except (ValueError, TypeError) as exc:
        raise JobLifecycleError("unknown job state") from exc

    if job.state != expected:
        raise JobLifecycleError("job state conflict: expected_state does not match current state")
    if job.state in TERMINAL_STATES:
        raise JobLifecycleError("terminal job states are immutable")
    if target not in _ALLOWED_TRANSITIONS.get(job.state, frozenset()):
        raise JobLifecycleError(f"illegal job transition: {job.state.value} -> {target.value}")

    actor = _identifier(actor_id, "actor_id")
    event_time = _timestamp(occurred_at, "occurred_at")
    created_time = _timestamp(job.created_at, "created_at")
    updated_time = _timestamp(job.updated_at, "updated_at")
    if event_time < created_time or event_time < updated_time:
        raise JobLifecycleError("occurred_at cannot precede job creation or last update")

    if reason_code is not None and (
        not isinstance(reason_code, str) or not _REASON.fullmatch(reason_code)
    ):
        raise JobLifecycleError("reason_code must be a short lowercase code")

    sequence = job.sequence + 1
    updated = ResearchJob(
        job_id=job.job_id,
        tenant_id=job.tenant_id,
        requester_id=job.requester_id,
        job_type=job.job_type,
        state=target,
        created_at=job.created_at,
        updated_at=occurred_at,
        sequence=sequence,
        resource_profile=job.resource_profile,
        timeout_seconds=job.timeout_seconds,
    )
    event = JobEvent(
        job_id=job.job_id,
        tenant_id=job.tenant_id,
        sequence=sequence,
        from_state=job.state,
        to_state=target,
        actor_id=actor,
        occurred_at=occurred_at,
        reason_code=reason_code,
    )
    return updated, event
