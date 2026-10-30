"""Tamper-evident, storage-neutral event-chain primitives for Deep Research.

The hash chain detects modification, deletion, reordering and broken linkage when
its head/checkpoints are retained independently. It is not a database, access
control system, immutable storage guarantee, or substitute for RLS.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import datetime
from typing import Any, Mapping

from .contracts import ContractValidationError, _id, _iso_timestamp

GENESIS_SHA256 = "0" * 64
_MAX_EVENTS = 10_000
_MAX_PAYLOAD_BYTES = 64 * 1024
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_EVENT_TYPES = {
    "research_plan_created",
    "research_plan_revised",
    "source_snapshot_registered",
    "claim_recorded",
    "claim_reclassified",
    "hypothesis_recorded",
    "hypothesis_revised",
    "experiment_spec_compiled",
    "experiment_run_recorded",
    "review_decision_recorded",
}
_FORBIDDEN_PAYLOAD_KEYS = {
    "access_token",
    "api_key",
    "apikey",
    "authorization",
    "bridge_token",
    "client_secret",
    "credential",
    "password",
    "private_key",
    "refresh_token",
    "secret",
    "service_role_key",
    "token",
}


def _ensure_json_value(value: Any, *, depth: int = 0) -> None:
    if depth > 20:
        raise ContractValidationError("event payload nesting exceeds 20 levels")
    if value is None or isinstance(value, (str, bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContractValidationError("event payload must not contain NaN or infinity")
        return
    if isinstance(value, list):
        for item in value:
            _ensure_json_value(item, depth=depth + 1)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ContractValidationError("event payload object keys must be strings")
            normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
            forbidden_normalized = {re.sub(r"[^a-z0-9]", "", name) for name in _FORBIDDEN_PAYLOAD_KEYS}
            if normalized_key in forbidden_normalized:
                raise ContractValidationError(
                    f"event payload must not contain credential field: {key}"
                )
            _ensure_json_value(item, depth=depth + 1)
        return
    raise ContractValidationError("event payload must contain JSON-compatible values only")


def _canonical_json_bytes(value: Any) -> bytes:
    _ensure_json_value(value)
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeError) as exc:
        raise ContractValidationError("event data cannot be serialized as canonical JSON") from exc


def _event_digest(body: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_json_bytes(dict(body))).hexdigest()


def _copy_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ContractValidationError("event payload must be an object")
    encoded = _canonical_json_bytes(payload)
    if len(encoded) > _MAX_PAYLOAD_BYTES:
        raise ContractValidationError(
            f"event payload exceeds the {_MAX_PAYLOAD_BYTES}-byte limit"
        )
    return json.loads(encoded.decode("utf-8"))


def append_evidence_event(
    existing_events: Any,
    *,
    event_id: Any,
    research_id: Any,
    owner_id: Any,
    event_type: Any,
    recorded_at: Any,
    payload: Any,
) -> dict[str, Any]:
    """Build the next event without mutating the supplied chain.

    The owner ID must come from trusted NOVA server context. This function
    validates its shape but cannot authenticate or authorize the caller.
    """
    verified = verify_evidence_event_chain(existing_events)
    normalized_event_id = _id(event_id, "event_id")
    normalized_research_id = _id(research_id, "research_id")
    normalized_owner_id = _id(owner_id, "owner_id")
    if not isinstance(event_type, str) or event_type not in _EVENT_TYPES:
        raise ContractValidationError("event_type is not supported")
    normalized_recorded_at = _iso_timestamp(recorded_at, "recorded_at")
    normalized_payload = _copy_payload(payload)

    existing = next(
        (item for item in verified if item["event_id"] == normalized_event_id),
        None,
    )
    if existing is not None:
        same_intent = (
            existing["research_id"] == normalized_research_id
            and existing["owner_id"] == normalized_owner_id
            and existing["event_type"] == event_type
            and existing["recorded_at"] == normalized_recorded_at
            and _canonical_json_bytes(existing["payload"])
            == _canonical_json_bytes(normalized_payload)
        )
        if same_intent:
            # event_id is the idempotency key: a retry returns the already
            # committed event, including when later events have been appended.
            return dict(existing)
        raise ContractValidationError(
            "event_id already exists with different event content"
        )

    if len(verified) >= _MAX_EVENTS:
        raise ContractValidationError(f"event chain exceeds {_MAX_EVENTS} events")

    if verified:
        previous = verified[-1]
        if previous["research_id"] != normalized_research_id:
            raise ContractValidationError("event chain cannot mix research_id values")
        if previous["owner_id"] != normalized_owner_id:
            raise ContractValidationError("event chain cannot mix owner_id values")
        previous_time = datetime.fromisoformat(previous["recorded_at"].replace("Z", "+00:00"))
        new_time = datetime.fromisoformat(normalized_recorded_at.replace("Z", "+00:00"))
        if new_time < previous_time:
            raise ContractValidationError("recorded_at must not move backwards in the event chain")
        sequence = previous["sequence"] + 1
        previous_hash = previous["event_sha256"]
    else:
        sequence = 1
        previous_hash = GENESIS_SHA256

    body = {
        "schema_version": "nova.evidence-event.v1",
        "event_id": normalized_event_id,
        "research_id": normalized_research_id,
        "owner_id": normalized_owner_id,
        "sequence": sequence,
        "event_type": event_type,
        "recorded_at": normalized_recorded_at,
        "previous_event_sha256": previous_hash,
        "payload": normalized_payload,
    }
    return {**body, "event_sha256": _event_digest(body)}


def _validate_event(event: Any) -> dict[str, Any]:
    allowed = {
        "schema_version",
        "event_id",
        "research_id",
        "owner_id",
        "sequence",
        "event_type",
        "recorded_at",
        "previous_event_sha256",
        "payload",
        "event_sha256",
    }
    if not isinstance(event, Mapping):
        raise ContractValidationError("event must be an object")
    if any(not isinstance(key, str) for key in event):
        raise ContractValidationError("event field names must be strings")
    unknown = set(event) - allowed
    missing = allowed - set(event)
    if unknown:
        raise ContractValidationError(
            "event contains unknown fields: " + ", ".join(sorted(unknown))
        )
    if missing:
        raise ContractValidationError(
            "event is missing fields: " + ", ".join(sorted(missing))
        )
    if event["schema_version"] != "nova.evidence-event.v1":
        raise ContractValidationError("schema_version must be nova.evidence-event.v1")

    event_id = _id(event["event_id"], "event_id")
    research_id = _id(event["research_id"], "research_id")
    owner_id = _id(event["owner_id"], "owner_id")
    sequence = event["sequence"]
    if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
        raise ContractValidationError("sequence must be a positive integer")
    event_type = event["event_type"]
    if not isinstance(event_type, str) or event_type not in _EVENT_TYPES:
        raise ContractValidationError("event_type is not supported")
    recorded_at = _iso_timestamp(event["recorded_at"], "recorded_at")
    previous_hash = event["previous_event_sha256"]
    event_hash = event["event_sha256"]
    if not isinstance(previous_hash, str) or not _SHA256.fullmatch(previous_hash):
        raise ContractValidationError("previous_event_sha256 must be a lowercase SHA-256 digest")
    if not isinstance(event_hash, str) or not _SHA256.fullmatch(event_hash):
        raise ContractValidationError("event_sha256 must be a lowercase SHA-256 digest")

    body = {
        "schema_version": "nova.evidence-event.v1",
        "event_id": event_id,
        "research_id": research_id,
        "owner_id": owner_id,
        "sequence": sequence,
        "event_type": event_type,
        "recorded_at": recorded_at,
        "previous_event_sha256": previous_hash,
        "payload": _copy_payload(event["payload"]),
    }
    if _event_digest(body) != event_hash:
        raise ContractValidationError(f"event {event_id} hash verification failed")
    return {**body, "event_sha256": event_hash}


def verify_evidence_event_chain(events: Any) -> list[dict[str, Any]]:
    """Verify a complete event chain and return normalized copies of its events."""
    if not isinstance(events, list) or len(events) > _MAX_EVENTS:
        raise ContractValidationError(
            f"events must be a list containing at most {_MAX_EVENTS} events"
        )

    verified: list[dict[str, Any]] = []
    seen_event_ids: set[str] = set()
    previous_hash = GENESIS_SHA256
    previous_time: datetime | None = None
    chain_research_id: str | None = None
    chain_owner_id: str | None = None

    for expected_sequence, supplied_event in enumerate(events, start=1):
        event = _validate_event(supplied_event)
        if event["sequence"] != expected_sequence:
            raise ContractValidationError(
                f"event sequence mismatch: expected {expected_sequence}"
            )
        if event["previous_event_sha256"] != previous_hash:
            raise ContractValidationError(
                f"event {event['event_id']} previous hash does not match the chain"
            )
        if event["event_id"] in seen_event_ids:
            raise ContractValidationError("event_id values must be unique in a chain")
        if chain_research_id is not None and event["research_id"] != chain_research_id:
            raise ContractValidationError("event chain cannot mix research_id values")
        if chain_owner_id is not None and event["owner_id"] != chain_owner_id:
            raise ContractValidationError("event chain cannot mix owner_id values")

        current_time = datetime.fromisoformat(event["recorded_at"].replace("Z", "+00:00"))
        if previous_time is not None and current_time < previous_time:
            raise ContractValidationError("recorded_at must not move backwards in the event chain")

        seen_event_ids.add(event["event_id"])
        chain_research_id = event["research_id"]
        chain_owner_id = event["owner_id"]
        previous_hash = event["event_sha256"]
        previous_time = current_time
        verified.append(event)

    return verified
