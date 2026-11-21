"""Authenticated client for NOVA's durable Supabase approval lifecycle.

The database migration is the source of truth: owner scoping, thread ownership,
expiry, policy version, immutable proposal hash, and single-use transitions are
enforced atomically by nova_create_approval / nova_resolve_approval RPCs.
This client never performs broker operations.
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx


POLICY_VERSION = "nova-approval.v1"
REQUEST_TYPE = "strategy_draft_review"


class ApprovalState:
    PENDING = "pending"
    APPROVED = "approved"
    EDITED = "edited"
    REJECTED = "rejected"
    EXPIRED = "expired"


def proposal_hash(proposal: dict) -> str:
    canonical = json.dumps(proposal, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class ApprovalGuard:
    """Thin RPC client; never use process-local state for approval decisions."""

    def __init__(self, *, supabase_url: str, publishable_key: str,
                 policy_version: str = POLICY_VERSION, timeout_seconds: float = 10.0,
                 client: Optional[httpx.Client] = None) -> None:
        if not supabase_url.startswith("https://"):
            raise ValueError("Supabase URL must use HTTPS")
        if not publishable_key:
            raise ValueError("Supabase publishable key is required")
        if policy_version != POLICY_VERSION:
            raise ValueError("unsupported approval policy version")
        if timeout_seconds <= 0 or timeout_seconds > 30:
            raise ValueError("timeout_seconds must be in (0, 30]")
        self.base_url = supabase_url.rstrip("/")
        self.publishable_key = publishable_key
        self.policy_version = policy_version
        self.timeout_seconds = timeout_seconds
        self._client = client

    def _rpc(self, name: str, body: dict, access_token: str) -> Any:
        if not access_token or any(c.isspace() for c in access_token):
            raise PermissionError("authenticated user access token required")
        headers = {
            "apikey": self.publishable_key,
            "Authorization": "Bearer " + access_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        url = self.base_url + "/rest/v1/rpc/" + name
        try:
            if self._client is not None:
                response = self._client.post(url, headers=headers, json=body,
                                              timeout=self.timeout_seconds)
            else:
                response = httpx.post(url, headers=headers, json=body,
                                      timeout=self.timeout_seconds, follow_redirects=False)
            if 300 <= response.status_code < 400:
                raise RuntimeError("approval service redirect rejected")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError:
            raise RuntimeError("approval service unavailable; details suppressed") from None

    def create(self, *, thread_id: str, proposal: dict, access_token: str,
               expires_in_minutes: int = 10) -> Any:
        if not isinstance(expires_in_minutes, int) or not 2 <= expires_in_minutes <= 15:
            raise ValueError("expires_in_minutes must be between 2 and 15")
        if not isinstance(proposal, dict):
            raise ValueError("proposal must be an object")
        expires_at = (datetime.now(timezone.utc) +
                      timedelta(minutes=expires_in_minutes)).isoformat()
        body = {
            "p_thread_id": thread_id,
            "p_request_type": REQUEST_TYPE,
            "p_proposal": proposal,
            "p_proposal_hash": proposal_hash(proposal),
            "p_policy_version": self.policy_version,
            "p_expires_at": expires_at,
        }
        return self._rpc("nova_create_approval", body, access_token)

    def decide(self, *, approval_id: str, decision: str, access_token: str,
               note: Optional[str] = None, edited_proposal: Optional[dict] = None) -> Any:
        if decision not in {"approve", "reject", "edit"}:
            raise ValueError("decision must be approve, reject, or edit")
        if decision == "edit" and not isinstance(edited_proposal, dict):
            raise ValueError("edited_proposal is required for edit")
        if decision != "edit" and edited_proposal is not None:
            raise ValueError("edited_proposal is allowed only for edit")
        body = {
            "p_approval_id": approval_id,
            "p_decision": decision,
            "p_decision_note": note,
            "p_decision_payload": edited_proposal,
            "p_policy_version": self.policy_version,
        }
        return self._rpc("nova_resolve_approval", body, access_token)
