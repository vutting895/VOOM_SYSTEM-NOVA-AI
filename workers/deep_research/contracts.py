"""Strict, dependency-free validators for versioned Deep Research contracts.

These functions validate untrusted data only. They do not authorize a caller,
fetch URLs, persist records, invoke tools, or establish tenant identity.
Trusted owner/tenant identifiers must be injected by the NOVA control plane.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from ipaddress import ip_address
from typing import Any, Mapping
from urllib.parse import parse_qsl, urlparse

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_RFC3339 = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SENSITIVE_QUERY_KEYS = {"access_token", "api_key", "apikey", "auth", "authorization", "client_secret", "code", "credential", "password", "private_key", "refresh_token", "secret", "signature", "sig", "token", "x-amz-credential", "x-amz-signature"}
_CLASSIFICATIONS = {"observed", "corroborated", "inferred", "hypothesis", "disputed", "unsupported", "rejected"}
_SOURCE_TYPES = {"official_documentation", "academic_paper", "repository", "market_data", "user_file", "other"}
_TASK_STATES = {
    "draft", "planned", "collecting_sources", "evidence_ready", "synthesizing",
    "experiment_ready", "running", "evaluated", "human_review",
    "approved_for_paper_or_shadow", "rejected", "archived", "blocked", "failed", "cancelled",
}
_MAX_TEXT = 12_000
_MAX_ITEMS = 100
_MAX_JSON_BYTES = 64_000


class ContractValidationError(ValueError):
    """Raised when a Deep Research contract is invalid or contains unknown fields."""


def _object(value: Any, name: str, allowed: set[str], required: set[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractValidationError(f"{name} must be an object")
    if any(not isinstance(key, str) for key in value):
        raise ContractValidationError(f"{name} field names must be strings")
    unknown = set(value) - allowed
    missing = required - set(value)
    if unknown:
        raise ContractValidationError(f"{name} contains unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        raise ContractValidationError(f"{name} is missing fields: {', '.join(sorted(missing))}")
    return value


def _text(value: Any, name: str, *, maximum: int = _MAX_TEXT) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ContractValidationError(f"{name} must be a non-empty string of at most {maximum} characters")
    return value.strip()


def _iso_timestamp(value: Any, name: str, *, allow_date_only: bool = False) -> str:
    raw = _text(value, name, maximum=64)
    if allow_date_only and _DATE_ONLY.fullmatch(raw):
        try:
            date.fromisoformat(raw)
        except ValueError as exc:
            raise ContractValidationError(f"{name} must be a valid ISO-8601 date") from exc
        return raw
    if not _RFC3339.fullmatch(raw):
        raise ContractValidationError(f"{name} must be an ISO-8601 timestamp with an explicit timezone")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractValidationError(f"{name} must be a valid ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ContractValidationError(f"{name} must include an explicit timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _timestamp_value(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _id(value: Any, name: str) -> str:
    text = _text(value, name, maximum=128)
    if not _ID.fullmatch(text):
        raise ContractValidationError(f"{name} has an invalid identifier format")
    return text


def _ids(value: Any, name: str, *, minimum: int = 0) -> list[str]:
    if not isinstance(value, list) or len(value) > _MAX_ITEMS or len(value) < minimum:
        raise ContractValidationError(f"{name} must be a list with {minimum}..{_MAX_ITEMS} items")
    result = [_id(item, f"{name}[]") for item in value]
    if len(set(result)) != len(result):
        raise ContractValidationError(f"{name} must not contain duplicate identifiers")
    return result


def _base(payload: Any, name: str, allowed: set[str], required: set[str]) -> Mapping[str, Any]:
    obj = _object(payload, name, allowed, required)
    # Bound serialization size so callers cannot submit unbounded nested content.
    try:
        import json
        encoded = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ContractValidationError(f"{name} must contain finite JSON-compatible values") from exc
    if len(encoded) > _MAX_JSON_BYTES:
        raise ContractValidationError(f"{name} exceeds the {_MAX_JSON_BYTES}-byte contract limit")
    return obj


def validate_research_task(payload: Any) -> dict[str, Any]:
    allowed = {
        "schema_version", "research_id", "owner_id", "tenant_id", "objective",
        "question_tree", "constraints", "source_policy", "plan_version", "state",
        "created_at", "updated_at", "correlation_id", "idempotency_key",
    }
    obj = _base(payload, "nova.research-task.v1", allowed, allowed)
    if obj["schema_version"] != "nova.research-task.v1":
        raise ContractValidationError("schema_version must be nova.research-task.v1")
    result = dict(obj)
    for field in ("research_id", "owner_id", "tenant_id", "correlation_id", "idempotency_key"):
        result[field] = _id(obj[field], field)
    result["objective"] = _text(obj["objective"], "objective", maximum=2_000)
    if not isinstance(obj["question_tree"], list) or not obj["question_tree"] or len(obj["question_tree"]) > 30:
        raise ContractValidationError("question_tree must contain 1..30 questions")
    result["question_tree"] = [_text(q, "question_tree[]", maximum=1_000) for q in obj["question_tree"]]
    for field in ("constraints", "source_policy"):
        if not isinstance(obj[field], Mapping):
            raise ContractValidationError(f"{field} must be an object")
    if isinstance(obj["plan_version"], bool) or not isinstance(obj["plan_version"], int) or obj["plan_version"] < 1:
        raise ContractValidationError("plan_version must be a positive integer")
    if not isinstance(obj["state"], str) or obj["state"] not in _TASK_STATES:
        raise ContractValidationError("state is not a supported research task state")
    result["created_at"] = _iso_timestamp(obj["created_at"], "created_at")
    result["updated_at"] = _iso_timestamp(obj["updated_at"], "updated_at")
    if _timestamp_value(result["updated_at"]) < _timestamp_value(result["created_at"]):
        raise ContractValidationError("updated_at must not precede created_at")
    return result


def validate_research_source(payload: Any) -> dict[str, Any]:
    allowed = {
        "schema_version", "source_id", "uri", "title", "publisher", "source_type",
        "published_at", "accessed_at", "snapshot_sha256", "extractor_version",
        "passages", "retention_note",
    }
    required = allowed
    obj = _base(payload, "nova.research-source.v1", allowed, required)
    if obj["schema_version"] != "nova.research-source.v1":
        raise ContractValidationError("schema_version must be nova.research-source.v1")
    result = dict(obj)
    result["source_id"] = _id(obj["source_id"], "source_id")
    uri = _text(obj["uri"], "uri", maximum=2_048)
    try:
        parsed = urlparse(uri)
    except ValueError as exc:
        raise ContractValidationError("uri is malformed") from exc
    host = parsed.hostname or ""
    try:
        port = parsed.port
    except ValueError as exc:
        raise ContractValidationError("uri contains an invalid port") from exc
    if (
        parsed.scheme.lower() != "https"
        or not host
        or parsed.username
        or parsed.password
        or port not in (None, 443)
        or host.endswith(".")
        or "." not in host
    ):
        raise ContractValidationError("uri must be a public-shaped HTTPS URL without credentials or a non-standard port")
    try:
        ip_address(host)
    except ValueError:
        pass
    else:
        raise ContractValidationError("uri must use a hostname rather than an IP literal")
    if host.lower() in {"localhost", "localhost.localdomain"}:
        raise ContractValidationError("uri must not target a local hostname")
    if any(key.lower() in _SENSITIVE_QUERY_KEYS for key, _ in parse_qsl(parsed.query, keep_blank_values=True)):
        raise ContractValidationError("uri must not contain credential-like query parameters")
    result["uri"] = uri
    for field in ("title", "publisher", "extractor_version"):
        result[field] = _text(obj[field], field, maximum=1_000)
    result["accessed_at"] = _iso_timestamp(obj["accessed_at"], "accessed_at")
    if obj["published_at"] is not None:
        result["published_at"] = _iso_timestamp(obj["published_at"], "published_at", allow_date_only=True)
    if not isinstance(obj["source_type"], str) or obj["source_type"] not in _SOURCE_TYPES:
        raise ContractValidationError("source_type is not supported")
    digest = _text(obj["snapshot_sha256"], "snapshot_sha256", maximum=64)
    if not _SHA256.fullmatch(digest):
        raise ContractValidationError("snapshot_sha256 must be a lowercase SHA-256 digest")
    if not isinstance(obj["passages"], list) or len(obj["passages"]) > _MAX_ITEMS:
        raise ContractValidationError("passages must be a list of at most 100 passages")
    passages = []
    passage_ids: set[str] = set()
    for passage in obj["passages"]:
        item = _object(passage, "passage", {"passage_id", "text", "start_offset", "end_offset"}, {"passage_id", "text", "start_offset", "end_offset"})
        start, end = item["start_offset"], item["end_offset"]
        if any(isinstance(n, bool) or not isinstance(n, int) or n < 0 for n in (start, end)) or end <= start:
            raise ContractValidationError("passage offsets must be non-negative integers with end > start")
        passage_id = _id(item["passage_id"], "passage_id")
        if passage_id in passage_ids:
            raise ContractValidationError("passage_id values must be unique within a source snapshot")
        passage_ids.add(passage_id)
        passages.append({
            "passage_id": passage_id,
            "text": _text(item["text"], "passage.text", maximum=4_000),
            "start_offset": start,
            "end_offset": end,
        })
    result["passages"] = passages
    if obj["retention_note"] is not None:
        result["retention_note"] = _text(obj["retention_note"], "retention_note", maximum=1_000)
    return result


def validate_research_claim(payload: Any) -> dict[str, Any]:
    allowed = {
        "schema_version", "claim_id", "research_id", "claim_text", "classification",
        "source_ids", "supporting_evidence", "counter_evidence", "scope", "uncertainty",
    }
    obj = _base(payload, "nova.research-claim.v1", allowed, allowed)
    if obj["schema_version"] != "nova.research-claim.v1":
        raise ContractValidationError("schema_version must be nova.research-claim.v1")
    if not isinstance(obj["classification"], str) or obj["classification"] not in _CLASSIFICATIONS:
        raise ContractValidationError("classification is not supported")
    result = dict(obj)
    for field in ("claim_id", "research_id"):
        result[field] = _id(obj[field], field)
    result["claim_text"] = _text(obj["claim_text"], "claim_text", maximum=4_000)
    result["source_ids"] = _ids(obj["source_ids"], "source_ids")
    result["supporting_evidence"] = _ids(obj["supporting_evidence"], "supporting_evidence")
    result["counter_evidence"] = _ids(obj["counter_evidence"], "counter_evidence")
    result["scope"] = _text(obj["scope"], "scope", maximum=2_000)
    result["uncertainty"] = _text(obj["uncertainty"], "uncertainty", maximum=2_000)
    if obj["classification"] in {"observed", "corroborated", "disputed", "rejected"} and not result["source_ids"]:
        raise ContractValidationError("evidence-based claim classifications require at least one source_id")
    return result


def validate_research_hypothesis(payload: Any) -> dict[str, Any]:
    allowed = {
        "schema_version", "hypothesis_id", "research_id", "statement", "supporting_claim_ids",
        "counter_claim_ids", "alternatives", "observable_outcome", "null_expectation",
        "falsification_rule", "data_requirements", "stop_criteria", "status",
    }
    obj = _base(payload, "nova.research-hypothesis.v1", allowed, allowed)
    if obj["schema_version"] != "nova.research-hypothesis.v1":
        raise ContractValidationError("schema_version must be nova.research-hypothesis.v1")
    result = dict(obj)
    for field in ("hypothesis_id", "research_id"):
        result[field] = _id(obj[field], field)
    for field in ("statement", "observable_outcome", "null_expectation", "falsification_rule", "data_requirements", "stop_criteria"):
        result[field] = _text(obj[field], field, maximum=2_000)
    result["supporting_claim_ids"] = _ids(obj["supporting_claim_ids"], "supporting_claim_ids")
    result["counter_claim_ids"] = _ids(obj["counter_claim_ids"], "counter_claim_ids")
    if not isinstance(obj["alternatives"], list) or len(obj["alternatives"]) > 20:
        raise ContractValidationError("alternatives must be a list of at most 20 items")
    result["alternatives"] = [_text(x, "alternatives[]", maximum=1_000) for x in obj["alternatives"]]
    if not isinstance(obj["status"], str) or obj["status"] not in {"draft", "ready_for_review", "approved_for_experiment", "rejected", "tested", "falsified"}:
        raise ContractValidationError("status is not supported")
    if obj["status"] == "approved_for_experiment" and not result["falsification_rule"]:
        raise ContractValidationError("approved hypotheses require a falsification_rule")
    return result
