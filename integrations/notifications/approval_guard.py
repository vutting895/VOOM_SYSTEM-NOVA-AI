"""Single-use human approval guard for STRATEGY_DRAFT_ONLY proposals.

This module records authorization decisions only. It never invokes brokers or execution.
Production deployments must back the store with an atomic, durable database transaction.
"""
import hashlib
import hmac
import json
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Optional


class ApprovalState(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    EDITED = "EDITED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


def proposal_hash(proposal: dict) -> str:
    canonical = json.dumps(proposal, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass
class ApprovalRequest:
    approval_id: str
    owner_id: str
    thread_id: str
    proposal: dict
    proposal_sha256: str
    policy_version: str
    expires_at: datetime
    state: ApprovalState = ApprovalState.PENDING
    consumed: bool = False


class ApprovalGuard:
    def __init__(self, *, policy_version: str, mode: str = "STRATEGY_DRAFT_ONLY") -> None:
        if mode != "STRATEGY_DRAFT_ONLY":
            raise ValueError("Only STRATEGY_DRAFT_ONLY is supported")
        self.policy_version = policy_version
        self._requests: Dict[str, ApprovalRequest] = {}
        self._lock = threading.Lock()

    def create(self, *, approval_id: str, owner_id: str, thread_id: str,
               proposal: dict, expires_at: datetime) -> ApprovalRequest:
        if expires_at.tzinfo is None or expires_at <= datetime.now(timezone.utc):
            raise ValueError("expires_at must be a future timezone-aware timestamp")
        with self._lock:
            if approval_id in self._requests:
                raise ValueError("approval_id already exists")
            request = ApprovalRequest(approval_id, owner_id, thread_id, proposal,
                                      proposal_hash(proposal), self.policy_version, expires_at)
            self._requests[approval_id] = request
            return request

    def decide(self, *, approval_id: str, actor_id: str, thread_id: str,
               decision: ApprovalState, current_proposal: dict,
               policy_version: str, edited_proposal: Optional[dict] = None,
               now: Optional[datetime] = None) -> ApprovalRequest:
        if decision not in {ApprovalState.APPROVED, ApprovalState.EDITED, ApprovalState.REJECTED}:
            raise ValueError("invalid human decision")
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            request = self._requests.get(approval_id)
            if request is None:
                raise PermissionError("approval unavailable")
            if request.consumed or request.state != ApprovalState.PENDING:
                raise PermissionError("approval already consumed or not pending")
            if actor_id != request.owner_id or thread_id != request.thread_id:
                raise PermissionError("approval owner/thread mismatch")
            if policy_version != self.policy_version or request.policy_version != self.policy_version:
                raise PermissionError("approval policy version mismatch")
            if current_time.tzinfo is None:
                raise ValueError("now must be timezone-aware")
            if current_time >= request.expires_at:
                request.state = ApprovalState.EXPIRED
                request.consumed = True
                return request
            supplied_hash = proposal_hash(current_proposal)
            if not hmac.compare_digest(supplied_hash, request.proposal_sha256):
                raise PermissionError("proposal changed; approval invalid")
            if decision == ApprovalState.EDITED:
                if edited_proposal is None:
                    raise ValueError("edited_proposal is required for EDITED")
                request.proposal = edited_proposal
                request.proposal_sha256 = proposal_hash(edited_proposal)
            request.state = decision
            request.consumed = True
            return request
