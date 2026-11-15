"""Pure, non-I/O request contracts for the NOVA Data Guardian W1 foundation.

This module deliberately has no filesystem, database, network, scanner, or cloud
provider integration. Actor/tenant identity is injected by a trusted server
boundary and is never accepted from this request envelope.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

SCHEMA_VERSION = "nova.data-guardian.job.v1"

OPERATIONS = {
    "inventory",
    "transform",
    "scan",
    "cleanup_candidate",
    "backup",
    "restore",
}
JOB_STATES = {
    "requested",
    "authorized",
    "planned",
    "approval_pending",
    "staged",
    "executing",
    "verifying",
    "committed",
    "quarantined",
    "rejected",
    "failed",
    "reconciliation_required",
}
SCANNER_VERDICTS = {"clean", "detected", "indeterminate", "not_scanned"}
FORMATS = {"png", "jpeg", "webp", "pdf", "docx", "xlsx", "csv", "json", "zip"}
OBJECT_REF_RE = re.compile(r"^obj_[A-Za-z0-9_-]{8,120}$")
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")

REQUEST_FIELDS = {
    "schema_version",
    "job_id",
    "idempotency_key",
    "operation",
    "object_refs",
    "options",
}


class ContractError(ValueError):
    """Raised when an untrusted request does not match the allow-listed contract."""


def _exact_keys(value: dict[str, Any], allowed: set[str], label: str) -> None:
    unknown = set(value) - allowed
    if unknown:
        raise ContractError(f"{label}_fields_not_allowed")


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_job_request(value: Any) -> dict[str, Any]:
    """Validate and return a shallow normalized copy of an untrusted job envelope."""
    if not isinstance(value, dict):
        raise ContractError("request_must_be_object")
    _exact_keys(value, REQUEST_FIELDS, "request")

    if value.get("schema_version") != SCHEMA_VERSION:
        raise ContractError("schema_version_invalid")

    job_id = value.get("job_id")
    try:
        parsed_job_id = uuid.UUID(job_id) if isinstance(job_id, str) else None
    except (ValueError, AttributeError):
        parsed_job_id = None
    if parsed_job_id is None or str(parsed_job_id) != job_id.lower():
        raise ContractError("job_id_invalid")

    idempotency_key = value.get("idempotency_key")
    if not isinstance(idempotency_key, str) or not IDEMPOTENCY_RE.fullmatch(idempotency_key):
        raise ContractError("idempotency_key_invalid")

    operation = value.get("operation")
    if not isinstance(operation, str) or operation not in OPERATIONS:
        raise ContractError("operation_not_allowed")

    refs = value.get("object_refs")
    if not isinstance(refs, list) or not 1 <= len(refs) <= 100:
        raise ContractError("object_refs_count_invalid")
    if any(not isinstance(ref, str) or not OBJECT_REF_RE.fullmatch(ref) for ref in refs):
        raise ContractError("object_ref_invalid")
    if len(set(refs)) != len(refs):
        raise ContractError("object_refs_duplicate")

    options = value.get("options", {})
    if not isinstance(options, dict):
        raise ContractError("options_must_be_object")

    normalized_options = _validate_options(operation, options)
    return {
        "schema_version": SCHEMA_VERSION,
        "job_id": str(parsed_job_id),
        "idempotency_key": idempotency_key,
        "operation": operation,
        "object_refs": list(refs),
        "options": normalized_options,
    }


def _validate_options(operation: str, options: dict[str, Any]) -> dict[str, Any]:
    if operation in {"inventory", "scan"}:
        _exact_keys(options, set(), "options")
        return {}

    if operation == "transform":
        _exact_keys(options, {"target_format", "width", "height", "quality"}, "options")
        target_format = options.get("target_format")
        if not isinstance(target_format, str) or target_format not in FORMATS:
            raise ContractError("target_format_not_allowed")
        result: dict[str, Any] = {"target_format": target_format}
        for dimension in ("width", "height"):
            if dimension in options:
                value = options[dimension]
                if not _is_int(value) or not 1 <= value <= 12000:
                    raise ContractError("transform_dimension_invalid")
                result[dimension] = value
        if "quality" in options:
            quality = options["quality"]
            if not _is_int(quality) or not 1 <= quality <= 100:
                raise ContractError("transform_quality_invalid")
            result["quality"] = quality
        return result

    if operation == "cleanup_candidate":
        _exact_keys(options, {"reason_class"}, "options")
        reason = options.get("reason_class")
        if not isinstance(reason, str) or reason not in {"temporary", "cache", "exact_duplicate", "abandoned_staging"}:
            raise ContractError("cleanup_reason_not_allowed")
        return {"reason_class": reason}

    if operation == "backup":
        _exact_keys(options, {"backup_class"}, "options")
        backup_class = options.get("backup_class", "standard")
        if not isinstance(backup_class, str) or backup_class not in {"standard", "critical"}:
            raise ContractError("backup_class_not_allowed")
        return {"backup_class": backup_class}

    if operation == "restore":
        _exact_keys(options, {"restore_target"}, "options")
        if options.get("restore_target") != "isolated":
            raise ContractError("restore_target_must_be_isolated")
        return {"restore_target": "isolated"}

    raise ContractError("operation_not_allowed")


def validate_job_result(value: Any) -> dict[str, Any]:
    """Validate sanitized result metadata; never accepts payload bytes or credentials."""
    if not isinstance(value, dict):
        raise ContractError("result_must_be_object")
    allowed = {
        "schema_version",
        "job_id",
        "state",
        "source_sha256",
        "result_sha256",
        "scanner_verdict",
        "error_code",
    }
    _exact_keys(value, allowed, "result")
    if value.get("schema_version") != SCHEMA_VERSION:
        raise ContractError("schema_version_invalid")
    job_id = value.get("job_id")
    try:
        parsed_job_id = uuid.UUID(job_id) if isinstance(job_id, str) else None
    except (ValueError, AttributeError):
        parsed_job_id = None
    if parsed_job_id is None:
        raise ContractError("job_id_invalid")
    if not isinstance(value.get("state"), str) or value.get("state") not in JOB_STATES:
        raise ContractError("job_state_invalid")

    result: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "job_id": str(parsed_job_id),
        "state": value["state"],
    }
    for field in ("source_sha256", "result_sha256"):
        digest = value.get(field)
        if digest is not None:
            if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
                raise ContractError("sha256_invalid")
            result[field] = digest

    verdict = value.get("scanner_verdict")
    if verdict is not None:
        if not isinstance(verdict, str) or verdict not in SCANNER_VERDICTS:
            raise ContractError("scanner_verdict_invalid")
        result["scanner_verdict"] = verdict

    error_code = value.get("error_code")
    if error_code is not None:
        if not isinstance(error_code, str) or not re.fullmatch(r"[a-z][a-z0-9_]{1,63}", error_code):
            raise ContractError("error_code_invalid")
        result["error_code"] = error_code
    return result
