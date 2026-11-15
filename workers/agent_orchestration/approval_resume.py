"""Owner-bound approval resume contracts for NOVA Agent workflows.

This module validates a decision snapshot fetched by a trusted server adapter.
It performs no database, network, LangGraph, or broker operation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from .contracts import (
    AgentRunState,
    ContractError,
    validate_agent_state,
    _require_uuid,
    _require_aware_datetime,
)

ApprovalStatus = Literal["pending", "approved", "rejected", "edited", "expired"]
_HASH_RE = re.compile(r"^[a-f0-9]{64}$")


@dataclass(frozen=True)
class ApprovalDecisionSnapshot:
    """Minimal owner-scoped approval record loaded by a trusted server-side adapter."""

    approval_id: str
    thread_id: str
    owner_id: str
    status: ApprovalStatus
    proposal_hash: str
    policy_version: str
    expires_at: str
    decided_at: str | None


@dataclass(frozen=True)
class VerifiedApprovalResume:
    """Non-secret resume authorization; deliberately contains no owner or token."""

    approval_id: str
    thread_id: str
    proposal_hash: str
    policy_version: str
    resumed_at: str


def validate_approval_resume(
    state: AgentRunState,
    approval: ApprovalDecisionSnapshot,
    authenticated_owner_id: str,
    now: datetime,
) -> VerifiedApprovalResume:
    """Validate an approval snapshot before a future LangGraph resume command.

    The caller must obtain the snapshot from a trusted, owner-scoped persistence/API
    adapter using the current authenticated session. This package does not implement
    that store or an atomic one-time consume operation. Never construct the snapshot
    from model output or a browser-supplied approval payload.
    """
    validate_agent_state(state)
    if not isinstance(approval, ApprovalDecisionSnapshot):
        raise ContractError("approval snapshot must be server-loaded approval data")
    if state.status != "awaiting_approval":
        raise ContractError("agent run is not awaiting approval")
    if not isinstance(now, datetime) or now.tzinfo is None or now.utcoffset() is None:
        raise ContractError("resume time must include a timezone")

    _require_uuid(authenticated_owner_id, "authenticated_owner_id")
    _require_uuid(approval.owner_id, "approval.owner_id")
    _require_uuid(approval.approval_id, "approval.approval_id")
    _require_uuid(approval.thread_id, "approval.thread_id")

    if approval.owner_id != authenticated_owner_id:
        raise ContractError("approval owner does not match authenticated owner")
    if approval.thread_id != state.thread_id:
        raise ContractError("approval thread does not match agent checkpoint")
    if approval.approval_id != state.pending_approval_id:
        raise ContractError("approval id does not match pending checkpoint")
    if not isinstance(approval.proposal_hash, str) or not _HASH_RE.fullmatch(approval.proposal_hash):
        raise ContractError("approval proposal hash is invalid")
    if approval.proposal_hash != state.pending_proposal_hash:
        raise ContractError("approval proposal hash does not match checkpoint")
    if approval.policy_version != state.pending_approval_policy_version:
        raise ContractError("approval policy version does not match checkpoint")
    if approval.status != "approved":
        raise ContractError("approval is not approved")

    _require_aware_datetime(approval.expires_at, "approval.expires_at")
    expires_at = datetime.fromisoformat(approval.expires_at.replace("Z", "+00:00"))
    if expires_at <= now:
        raise ContractError("approval has expired before resume")
    if approval.decided_at is None:
        raise ContractError("approved decision is missing decided_at")
    _require_aware_datetime(approval.decided_at, "approval.decided_at")
    decided_at = datetime.fromisoformat(approval.decided_at.replace("Z", "+00:00"))
    if decided_at > now:
        raise ContractError("approval decision timestamp is in the future")
    if decided_at > expires_at:
        raise ContractError("approval decision occurred after expiry")

    return VerifiedApprovalResume(
        approval_id=approval.approval_id,
        thread_id=approval.thread_id,
        proposal_hash=approval.proposal_hash,
        policy_version=approval.policy_version,
        resumed_at=now.isoformat(),
    )
