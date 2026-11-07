"""Strict, deterministic schema for NOVA strategy research signals.

This module validates research proposals only. It has no broker, account,
tenant, credential, persistence, network, or order-execution capabilities.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
import re
from typing import Any, Mapping

SCHEMA_VERSION = "nova.strategy-signal.v1"
_DECISION = {"BUY_CANDIDATE", "SELL_CANDIDATE", "HOLD", "REJECTED"}
_FRESHNESS = {"FRESH", "STALE", "UNKNOWN"}
_COVERAGE = {"COMPLETE", "INCOMPLETE", "UNKNOWN"}
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_SYMBOL = re.compile(r"^[A-Z0-9._-]{2,32}$")
_TIMEFRAME = re.compile(r"^(M[1-9]|M[1-5][0-9]|H[1-9]|D1|W1|MN1)$")
_REQUIRED = {
    "schema_version", "strategy_id", "strategy_version", "run_id",
    "symbol", "timeframe", "bar_closed_at_utc", "generated_at_utc",
    "decision", "reason_codes", "evidence_refs", "feature_version",
    "model_version", "config_hash", "dataset_sha256", "data_freshness",
    "coverage_status",
}
_OPTIONAL = {"confidence", "calibration_ref"}
_FORBIDDEN_PARTS = (
    "tenant", "owner", "account", "broker", "credential", "secret",
    "token", "password", "connectionid", "order", "position",
)


class StrategySignalValidationError(ValueError):
    """Raised when a strategy signal violates the public v1 contract."""


def _text(value: Any, name: str, limit: int = 256) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise StrategySignalValidationError(f"{name} must be a non-empty string of at most {limit} characters")
    return value.strip()


def _identifier(value: Any, name: str) -> str:
    result = _text(value, name, 128)
    if not _ID.fullmatch(result):
        raise StrategySignalValidationError(f"{name} has an invalid identifier")
    return result


def _timestamp(value: Any, name: str) -> datetime:
    raw = _text(value, name, 64)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise StrategySignalValidationError(f"{name} must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise StrategySignalValidationError(f"{name} must include a timezone")
    return parsed.astimezone(timezone.utc)


def validate_strategy_signal(payload: Any) -> dict[str, Any]:
    """Validate and normalize a signal; does not persist or execute it."""
    if not isinstance(payload, Mapping) or any(not isinstance(k, str) for k in payload):
        raise StrategySignalValidationError("signal must be a string-keyed object")

    keys = set(payload)
    missing = _REQUIRED - keys
    unknown = keys - _REQUIRED - _OPTIONAL
    if missing:
        raise StrategySignalValidationError("missing fields: " + ", ".join(sorted(missing)))
    if unknown:
        raise StrategySignalValidationError("unknown fields: " + ", ".join(sorted(unknown)))

    for key in keys:
        normalized = "".join(c for c in key.lower() if c.isalnum())
        if any(part in normalized for part in _FORBIDDEN_PARTS):
            raise StrategySignalValidationError(f"forbidden field: {key}")

    if payload["schema_version"] != SCHEMA_VERSION:
        raise StrategySignalValidationError(f"schema_version must be {SCHEMA_VERSION}")

    result: dict[str, Any] = {"schema_version": SCHEMA_VERSION}
    for key in ("strategy_id", "strategy_version", "run_id", "feature_version", "model_version"):
        result[key] = _identifier(payload[key], key)

    symbol = _text(payload["symbol"], "symbol", 32).upper()
    timeframe = _text(payload["timeframe"], "timeframe", 4).upper()
    if not _SYMBOL.fullmatch(symbol):
        raise StrategySignalValidationError("symbol has an invalid format")
    if not _TIMEFRAME.fullmatch(timeframe):
        raise StrategySignalValidationError("timeframe is unsupported")
    result["symbol"] = symbol
    result["timeframe"] = timeframe

    closed_at = _timestamp(payload["bar_closed_at_utc"], "bar_closed_at_utc")
    generated_at = _timestamp(payload["generated_at_utc"], "generated_at_utc")
    if generated_at < closed_at:
        raise StrategySignalValidationError("generated_at_utc cannot precede bar_closed_at_utc")
    result["bar_closed_at_utc"] = closed_at.isoformat().replace("+00:00", "Z")
    result["generated_at_utc"] = generated_at.isoformat().replace("+00:00", "Z")

    decision = payload["decision"]
    if not isinstance(decision, str) or decision not in _DECISION:
        raise StrategySignalValidationError("decision is unsupported")
    result["decision"] = decision

    for key in ("reason_codes", "evidence_refs"):
        values = payload[key]
        if not isinstance(values, list) or not 1 <= len(values) <= 32:
            raise StrategySignalValidationError(f"{key} must contain 1..32 items")
        normalized = [_identifier(item, f"{key}[]") for item in values]
        if len(set(normalized)) != len(normalized):
            raise StrategySignalValidationError(f"{key} must be unique")
        result[key] = normalized

    for key in ("config_hash", "dataset_sha256"):
        digest = _text(payload[key], key, 64)
        if not _SHA256.fullmatch(digest):
            raise StrategySignalValidationError(f"{key} must be a lowercase SHA-256 digest")
        result[key] = digest

    freshness = payload["data_freshness"]
    coverage = payload["coverage_status"]
    if not isinstance(freshness, str) or freshness not in _FRESHNESS or not isinstance(coverage, str) or coverage not in _COVERAGE:
        raise StrategySignalValidationError("invalid data freshness or coverage status")
    result["data_freshness"] = freshness
    result["coverage_status"] = coverage
    if decision != "REJECTED" and (freshness != "FRESH" or coverage != "COMPLETE"):
        raise StrategySignalValidationError("non-rejected signals require fresh data and complete coverage")

    if "confidence" in payload or "calibration_ref" in payload:
        if "confidence" not in payload or "calibration_ref" not in payload:
            raise StrategySignalValidationError("confidence requires a calibration_ref")
        confidence = payload["confidence"]
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
            raise StrategySignalValidationError("confidence must be finite and in range 0..1")
        result["confidence"] = float(confidence)
        result["calibration_ref"] = _identifier(payload["calibration_ref"], "calibration_ref")

    encoded = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return json.loads(encoded)


def strategy_signal_sha256(payload: Any) -> str:
    """Return a stable digest of a validated signal's canonical JSON bytes."""
    normalized = validate_strategy_signal(payload)
    encoded = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
