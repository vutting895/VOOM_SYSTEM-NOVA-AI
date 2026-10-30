"""Strict, privacy-minimized Agent and Provider learning observations.

This is a pure contract validator. Trusted server-side adapters must derive
ownership/tenant context from NOVA Hub; model output must never create it.
Raw prompts, transcripts, provider payloads, credentials and broker data are
intentionally outside this contract.
"""
from __future__ import annotations

from datetime import datetime
import math
import re
from typing import Any, Mapping


OBSERVATION_CONTRACT = "nova.learning-observation.v1"
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")

SOURCE_TYPES = frozenset({"internal_agent", "external_provider"})
OUTCOMES = frozenset({"success", "partial", "failed", "abstained", "rejected"})
TASK_CLASSES = frozenset({
    "chat",
    "research",
    "strategy_research",
    "code_assistance",
    "tool_workflow",
    "customer_support",
})
PROVIDER_IDS = frozenset({
    "gemini",
    "openai",
    "anthropic",
    "cloudflare_workers_ai",
    "ollama_compatible",
})

_ALLOWED_FIELDS = frozenset({
    "contract",
    "observation_id",
    "source_type",
    "source_id",
    "source_version",
    "provider_id",
    "provider_model",
    "provider_version",
    "fallback_from",
    "task_class",
    "outcome",
    "occurred_at",
    "policy_version",
    "sanitization_receipt_id",
    "data_minimized",
    "evidence_refs",
    "quality_signals",
})
_QUALITY_RANGES = {
    "correctness": (0.0, 1.0),
    "completeness": (0.0, 1.0),
    "groundedness": (0.0, 1.0),
    "policy_compliance": (0.0, 1.0),
}
_MAX_EVIDENCE_REFS = 20


class LearningObservationError(ValueError):
    """Raised when an observation is not safe or valid for learning."""


def _identifier(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise LearningObservationError(f"{field} must be a bounded opaque identifier")
    return value


def _bounded_text(value: Any, field: str, max_length: int = 160) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        raise LearningObservationError(f"{field} must be non-empty and at most {max_length} characters")
    if any(ord(char) < 32 for char in value):
        raise LearningObservationError(f"{field} must not contain control characters")
    return value.strip()


def _aware_timestamp(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise LearningObservationError("occurred_at must be a timezone-aware ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise LearningObservationError("occurred_at must be a timezone-aware ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise LearningObservationError("occurred_at must include a timezone offset")
    return value


def _references(value: Any, field: str, *, minimum: int = 1) -> list[str]:
    if not isinstance(value, list) or not minimum <= len(value) <= _MAX_EVIDENCE_REFS:
        raise LearningObservationError(f"{field} must contain {minimum} to {_MAX_EVIDENCE_REFS} opaque references")
    refs = [_identifier(item, field) for item in value]
    if len(set(refs)) != len(refs):
        raise LearningObservationError(f"{field} must not contain duplicate references")
    return refs


def _quality_signals(value: Any) -> dict[str, int | float]:
    if not isinstance(value, Mapping) or len(value) > len(_QUALITY_RANGES) + 1:
        raise LearningObservationError("quality_signals must be a small object of registered numeric metrics")
    result: dict[str, int | float] = {}
    for key, metric in value.items():
        if key == "latency_ms":
            if type(metric) is not int or not 0 <= metric <= 600_000:
                raise LearningObservationError("latency_ms must be an integer from 0 to 600000")
            result[key] = metric
            continue
        bounds = _QUALITY_RANGES.get(key)
        if bounds is None or isinstance(metric, bool) or not isinstance(metric, (int, float)):
            raise LearningObservationError(f"quality metric is not registered: {key}")
        if not math.isfinite(float(metric)) or not bounds[0] <= float(metric) <= bounds[1]:
            raise LearningObservationError(f"{key} must be finite and between 0 and 1")
        result[key] = float(metric)
    return result


def validate_observation(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and return a normalized observation envelope.

    Tenant/owner IDs, transcripts and raw provider output are not accepted.
    The trusted ingestion adapter binds the authenticated owner scope outside
    this model-facing envelope.
    """
    if not isinstance(raw, Mapping):
        raise LearningObservationError("observation must be an object")
    unknown = set(raw) - _ALLOWED_FIELDS
    missing = _ALLOWED_FIELDS - set(raw)
    if unknown:
        raise LearningObservationError("unexpected observation fields: " + ", ".join(sorted(map(str, unknown))))
    if missing:
        raise LearningObservationError("missing observation fields: " + ", ".join(sorted(missing)))
    if raw["contract"] != OBSERVATION_CONTRACT:
        raise LearningObservationError("unsupported observation contract")
    if raw["source_type"] not in SOURCE_TYPES:
        raise LearningObservationError("unsupported source_type")
    if raw["outcome"] not in OUTCOMES:
        raise LearningObservationError("unsupported outcome")
    if raw["task_class"] not in TASK_CLASSES:
        raise LearningObservationError("unsupported task_class")
    if raw["data_minimized"] is not True:
        raise LearningObservationError("data_minimized must be true")

    source_type = raw["source_type"]
    provider_id = raw["provider_id"]
    provider_model = raw["provider_model"]
    provider_version = raw["provider_version"]
    fallback_from = raw["fallback_from"]

    if source_type == "external_provider":
        if provider_id not in PROVIDER_IDS:
            raise LearningObservationError("external provider_id is not registered")
        provider_model = _bounded_text(provider_model, "provider_model", 80)
        provider_version = _bounded_text(provider_version, "provider_version", 80)
    else:
        if any(item is not None for item in (provider_id, provider_model, provider_version, fallback_from)):
            raise LearningObservationError("internal-agent observations must not contain provider metadata")

    if fallback_from is not None:
        if fallback_from not in PROVIDER_IDS or fallback_from == provider_id:
            raise LearningObservationError("fallback_from must identify a different registered provider")

    dataset_sha = raw.get("dataset_sha256")
    # No raw dataset or payload is admitted; hashes can only appear as evidence references.
    if dataset_sha is not None:
        raise LearningObservationError("dataset hashes belong in the evidence ledger, not the observation payload")

    return {
        "contract": OBSERVATION_CONTRACT,
        "observation_id": _identifier(raw["observation_id"], "observation_id"),
        "source_type": source_type,
        "source_id": _identifier(raw["source_id"], "source_id"),
        "source_version": _bounded_text(raw["source_version"], "source_version", 80),
        "provider_id": provider_id,
        "provider_model": provider_model,
        "provider_version": provider_version,
        "fallback_from": fallback_from,
        "task_class": raw["task_class"],
        "outcome": raw["outcome"],
        "occurred_at": _aware_timestamp(raw["occurred_at"]),
        "policy_version": _identifier(raw["policy_version"], "policy_version"),
        "sanitization_receipt_id": _identifier(raw["sanitization_receipt_id"], "sanitization_receipt_id"),
        "data_minimized": True,
        "evidence_refs": _references(raw["evidence_refs"], "evidence_refs"),
        "quality_signals": _quality_signals(raw["quality_signals"]),
    }
