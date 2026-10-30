"""Validation for the immutable nova.quant-experiment.v1 specification."""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
import json
import math
import re
from typing import Any

SCHEMA_VERSION = "nova.quant-experiment.v1"
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_GIT_REVISION = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
_MAX_ITEMS = 100
_MAX_BYTES = 64_000


class ExperimentValidationError(ValueError):
    """Raised for an invalid experiment specification."""


def _obj(value: Any, label: str, fields: set[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or any(not isinstance(k, str) for k in value):
        raise ExperimentValidationError(f"{label} must be a string-keyed object")
    unknown = set(value) - fields
    missing = fields - set(value)
    if unknown:
        raise ExperimentValidationError(f"{label} has unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        raise ExperimentValidationError(f"{label} is missing fields: {', '.join(sorted(missing))}")
    return value


def _text(value: Any, label: str, limit: int = 256) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ExperimentValidationError(f"{label} must be a non-empty string of at most {limit} characters")
    return value.strip()


def _id(value: Any, label: str) -> str:
    result = _text(value, label, 128)
    if not _ID.fullmatch(result):
        raise ExperimentValidationError(f"{label} has an invalid identifier")
    return result


def _integer(value: Any, label: str, maximum: int = 1_000_000_000) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
        raise ExperimentValidationError(f"{label} must be an integer in range 0..{maximum}")
    return value


def _json_tree(value: Any, label: str = "parameters", depth: int = 0) -> None:
    if depth > 8:
        raise ExperimentValidationError(f"{label} is too deeply nested")
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        if len(value) > 4096:
            raise ExperimentValidationError(f"{label} contains an oversized string")
        return
    if isinstance(value, int):
        if abs(value) > 2**63 - 1:
            raise ExperimentValidationError(f"{label} contains an out-of-range integer")
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ExperimentValidationError(f"{label} contains a non-finite number")
        return
    if isinstance(value, Mapping):
        if len(value) > _MAX_ITEMS or any(not isinstance(k, str) or not k or len(k) > 128 for k in value):
            raise ExperimentValidationError(f"{label} has invalid or excessive keys")
        for key, child in value.items():
            _json_tree(child, f"{label}.{key}", depth + 1)
        return
    if isinstance(value, list):
        if len(value) > _MAX_ITEMS:
            raise ExperimentValidationError(f"{label} contains too many items")
        for index, child in enumerate(value):
            _json_tree(child, f"{label}[{index}]", depth + 1)
        return
    raise ExperimentValidationError(f"{label} must contain JSON-compatible values")


def validate_quant_experiment(payload: Any) -> dict[str, Any]:
    """Validate immutable experiment inputs; this function does not run an experiment.

    Fold indexes are zero-based and end-exclusive. The validator checks the
    declared purge gap; embargo_bars is retained for the evaluator to apply and
    verify when it builds and runs the complete fold schedule.
    """
    fields = {
        "schema_version", "experiment_id", "research_id", "hypothesis_id",
        "dataset_manifest_id", "dataset_sha256", "quality_report_id",
        "strategy_id", "strategy_version", "feature_schema_id",
        "feature_schema_version", "code_revision", "runtime_revision",
        "parameters", "seed", "folds", "purge_bars", "embargo_bars",
        "cost_model_id", "baseline_ids", "evaluator_version", "created_at",
    }
    obj = _obj(payload, SCHEMA_VERSION, fields)
    if obj["schema_version"] != SCHEMA_VERSION:
        raise ExperimentValidationError(f"schema_version must be {SCHEMA_VERSION}")
    result = dict(obj)
    for key in (
        "experiment_id", "research_id", "hypothesis_id", "dataset_manifest_id",
        "quality_report_id", "strategy_id", "feature_schema_id", "cost_model_id",
    ):
        result[key] = _id(obj[key], key)
    digest = _text(obj["dataset_sha256"], "dataset_sha256", 64)
    if not _SHA256.fullmatch(digest):
        raise ExperimentValidationError("dataset_sha256 must be a lowercase SHA-256 digest")
    result["dataset_sha256"] = digest
    revision = _text(obj["code_revision"], "code_revision", 64)
    if not _GIT_REVISION.fullmatch(revision):
        raise ExperimentValidationError("code_revision must be a full Git revision")
    result["code_revision"] = revision
    for key in ("strategy_version", "feature_schema_version", "runtime_revision", "evaluator_version"):
        result[key] = _text(obj[key], key)
    if not isinstance(obj["parameters"], Mapping):
        raise ExperimentValidationError("parameters must be an object")
    _json_tree(obj["parameters"])
    result["parameters"] = dict(obj["parameters"])
    result["seed"] = _integer(obj["seed"], "seed", 2**31 - 1)
    purge = _integer(obj["purge_bars"], "purge_bars")
    result["purge_bars"] = purge
    result["embargo_bars"] = _integer(obj["embargo_bars"], "embargo_bars")
    baselines = obj["baseline_ids"]
    if not isinstance(baselines, list) or not 1 <= len(baselines) <= _MAX_ITEMS:
        raise ExperimentValidationError("baseline_ids must contain 1..100 items")
    result["baseline_ids"] = [_id(item, "baseline_ids[]") for item in baselines]
    if len(set(result["baseline_ids"])) != len(result["baseline_ids"]):
        raise ExperimentValidationError("baseline_ids must be unique")
    windows = obj["folds"]
    if not isinstance(windows, list) or not 1 <= len(windows) <= _MAX_ITEMS:
        raise ExperimentValidationError("folds must contain 1..100 windows")
    fold_fields = {"fold_id", "train_start", "train_end", "test_start", "test_end"}
    folds = []
    ids = set()
    last_test_end = -1
    last_train_start = -1
    for index, item in enumerate(windows):
        fold = _obj(item, f"folds[{index}]", fold_fields)
        fold_id = _id(fold["fold_id"], "fold_id")
        if fold_id in ids:
            raise ExperimentValidationError("fold_id values must be unique")
        ids.add(fold_id)
        values = {key: _integer(fold[key], f"folds[{index}].{key}") for key in fold_fields - {"fold_id"}}
        if values["train_end"] <= values["train_start"] or values["test_end"] <= values["test_start"]:
            raise ExperimentValidationError("fold windows must be non-empty")
        if values["train_end"] > values["test_start"] or values["test_start"] - values["train_end"] < purge:
            raise ExperimentValidationError("fold violates chronology or purge_bars")
        if values["test_start"] < last_test_end or values["train_start"] < last_train_start:
            raise ExperimentValidationError("folds must be chronologically ordered")
        last_test_end = values["test_end"]
        last_train_start = values["train_start"]
        folds.append({"fold_id": fold_id, **values})
    result["folds"] = folds
    timestamp = _text(obj["created_at"], "created_at", 64)
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ExperimentValidationError("created_at must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ExperimentValidationError("created_at must include a timezone")
    result["created_at"] = timestamp
    try:
        encoded = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise ExperimentValidationError("experiment must contain finite JSON values") from exc
    if len(encoded.encode("utf-8")) > _MAX_BYTES:
        raise ExperimentValidationError(f"experiment exceeds {_MAX_BYTES} bytes")
    return json.loads(encoded)
