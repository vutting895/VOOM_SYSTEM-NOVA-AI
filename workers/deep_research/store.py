"""Atomic append orchestration contract for a future Evidence Ledger adapter.

This module defines the storage boundary and retry behavior only. It includes
no Supabase client, SQL, filesystem persistence, authentication or deployment.
"""
from __future__ import annotations

from typing import Any, Protocol

from .contracts import ContractValidationError, _id
from .ledger import (
    GENESIS_SHA256,
    append_evidence_event,
    verify_evidence_event_chain,
)


class EvidenceLedgerStore(Protocol):
    """Required behavior for a durable owner-scoped store adapter.

    load_chain must return the complete chain for the exact research_id/owner_id
    pair and must never return another owner's rows.

    append_if_head_matches must atomically:
    - scope the append to event.research_id and event.owner_id;
    - verify the stored head still equals expected_head_sha256 (genesis for an
      empty chain);
    - enforce a unique event_id within the research chain;
    - append the full event and return True, or perform no write and return
      False when the head changed concurrently.

    A database adapter must implement these conditions in one transaction,
    backed by a unique constraint and least-privilege insert policy.
    """

    def load_chain(
        self, *, research_id: str, owner_id: str
    ) -> list[dict[str, Any]]:
        ...

    def append_if_head_matches(
        self,
        *,
        research_id: str,
        owner_id: str,
        expected_head_sha256: str,
        event: dict[str, Any],
    ) -> bool:
        ...


class LedgerConcurrencyError(RuntimeError):
    """Raised when the ledger head keeps changing during bounded append retries."""


def append_event_to_store(
    store: EvidenceLedgerStore,
    *,
    event_id: Any,
    research_id: Any,
    owner_id: Any,
    event_type: Any,
    recorded_at: Any,
    payload: Any,
    max_attempts: int = 3,
) -> dict[str, Any]:
    """Append an event through an atomic compare-and-swap storage contract.

    The caller must pass owner_id from authenticated, trusted NOVA server
    context. Do not pass an owner/tenant identifier from model-generated input.
    Event IDs are idempotency keys: an exact retry returns the stored event.
    """
    normalized_research_id = _id(research_id, "research_id")
    normalized_owner_id = _id(owner_id, "owner_id")
    if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or not 1 <= max_attempts <= 10:
        raise ContractValidationError("max_attempts must be an integer from 1 to 10")

    for _attempt in range(max_attempts):
        supplied_chain = store.load_chain(
            research_id=normalized_research_id,
            owner_id=normalized_owner_id,
        )
        chain = verify_evidence_event_chain(supplied_chain)
        for existing in chain:
            if (
                existing["research_id"] != normalized_research_id
                or existing["owner_id"] != normalized_owner_id
            ):
                raise ContractValidationError(
                    "ledger store returned an event outside the requested owner/research scope"
                )

        # The append primitive handles exact idempotent retries and rejects
        # reuse of the same event_id for changed content.
        event = append_evidence_event(
            chain,
            event_id=event_id,
            research_id=normalized_research_id,
            owner_id=normalized_owner_id,
            event_type=event_type,
            recorded_at=recorded_at,
            payload=payload,
        )
        existing_ids = {item["event_id"] for item in chain}
        if event["event_id"] in existing_ids:
            return event

        expected_head = chain[-1]["event_sha256"] if chain else GENESIS_SHA256
        appended = store.append_if_head_matches(
            research_id=normalized_research_id,
            owner_id=normalized_owner_id,
            expected_head_sha256=expected_head,
            event=event,
        )
        if appended:
            return event

    raise LedgerConcurrencyError(
        f"ledger head changed during {max_attempts} bounded append attempts"
    )
