"""Leakage-safe primitives for NOVA's research-only unified evaluation.

This module deliberately has no broker, order, deployment, or model-provider client.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Iterable


class DatasetGateError(ValueError):
    """Raised when a dataset cannot be admitted to a research run."""


REQUIRED_SAFETY_FLAGS = {
    "ordersEnabled": False,
    "executionEnabled": False,
    "liveTradingEnabled": False,
}


def file_sha256(path: str | Path) -> str:
    digest = sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_dataset_manifest(
    manifest: dict[str, Any],
    data_path: str | Path,
    expected_sha256: str | None = None,
) -> str:
    """Fail closed unless provenance, completeness, safety flags and bytes agree."""
    if not isinstance(manifest, dict):
        raise DatasetGateError("manifest must be a JSON object")
    required = (
        "dataset_id", "provider", "symbol", "timeframe", "timezone",
        "actual_start_utc", "actual_end_utc", "row_count",
        "completeness_status", "training_eligible",
    )
    missing = [key for key in required if key not in manifest]
    if missing:
        raise DatasetGateError(f"manifest missing required fields: {missing}")
    if manifest["completeness_status"] != "PASS" or manifest["training_eligible"] is not True:
        raise DatasetGateError("dataset is not explicitly complete and training eligible")
    if manifest["timezone"] != "UTC":
        raise DatasetGateError("dataset timezone must be UTC")
    for flag, required_value in REQUIRED_SAFETY_FLAGS.items():
        if manifest.get(flag) is not required_value:
            raise DatasetGateError(f"unsafe or missing safety flag: {flag}")
    path = Path(data_path)
    if not path.is_file():
        raise DatasetGateError("dataset file does not exist")
    actual = file_sha256(path)
    declared = manifest.get("content_sha256") or manifest.get("sha256")
    if not isinstance(declared, str) or actual != declared:
        raise DatasetGateError("dataset SHA-256 does not match manifest")
    if expected_sha256 is not None and actual != expected_sha256:
        raise DatasetGateError("dataset SHA-256 differs from pinned run input")
    return actual


@dataclass(frozen=True)
class Fold:
    train_start: int
    train_end: int
    valid_start: int
    valid_end: int
    purge_bars: int


def expanding_purged_walk_forward(
    n_rows: int,
    n_splits: int = 5,
    min_train_size: int = 500,
    horizon: int = 5,
) -> list[Fold]:
    """Create expanding, strictly chronological folds with label-horizon purging.

    train_end and valid_end are exclusive. Every training label must finish before
    the validation window starts. No future-to-past folds are produced.
    """
    if n_rows <= 0 or n_splits < 1 or min_train_size <= 0 or horizon < 1:
        raise ValueError("invalid walk-forward configuration")
    remaining = n_rows - min_train_size
    test_size = remaining // n_splits
    if test_size <= horizon:
        raise ValueError("not enough rows for requested folds and purge horizon")
    folds: list[Fold] = []
    for fold_idx in range(n_splits):
        valid_start = min_train_size + fold_idx * test_size
        valid_end = n_rows if fold_idx == n_splits - 1 else min_train_size + (fold_idx + 1) * test_size
        train_end = valid_start - horizon
        if train_end <= 0 or valid_end <= valid_start:
            raise ValueError("empty fold after purging")
        folds.append(Fold(0, train_end, valid_start, valid_end, horizon))
    return folds



def split_development_final_oos(
    event_timestamps: Iterable[Any],
    label_end_timestamps: Iterable[Any],
    final_oos_start: Any,
) -> tuple[list[bool], list[bool], list[bool]]:
    """Separate development and final OOS while purging labels crossing the boundary."""
    events = list(event_timestamps)
    label_ends = list(label_end_timestamps)
    if len(events) != len(label_ends) or not events:
        raise DatasetGateError("event and label-end timestamps must be non-empty and aligned")
    development: list[bool] = []
    final_oos: list[bool] = []
    boundary_purged: list[bool] = []
    for event_time, label_end in zip(events, label_ends):
        if event_time is None or label_end is None:
            development.append(False)
            final_oos.append(False)
            boundary_purged.append(False)
        elif event_time < final_oos_start and label_end >= final_oos_start:
            development.append(False)
            final_oos.append(False)
            boundary_purged.append(True)
        elif event_time < final_oos_start and label_end < final_oos_start:
            development.append(True)
            final_oos.append(False)
            boundary_purged.append(False)
        elif event_time >= final_oos_start:
            development.append(False)
            final_oos.append(True)
            boundary_purged.append(False)
        else:
            development.append(False)
            final_oos.append(False)
            boundary_purged.append(False)
    return development, final_oos, boundary_purged

def validate_point_in_time_rows(
    timestamps: Iterable[Any],
    available_at: Iterable[Any] | None = None,
) -> None:
    """Require unique, increasing event timestamps and no feature available in future."""
    times = list(timestamps)
    if not times:
        raise DatasetGateError("dataset has no timestamps")
    if any(t is None for t in times):
        raise DatasetGateError("null event timestamp")
    if any(times[i] >= times[i + 1] for i in range(len(times) - 1)):
        raise DatasetGateError("timestamps must be strictly increasing and unique")
    if available_at is not None:
        availability = list(available_at)
        if len(availability) != len(times):
            raise DatasetGateError("availability timestamps must align with event timestamps")
        if any(a is None or a > t for t, a in zip(times, availability)):
            raise DatasetGateError("feature availability occurs after its decision timestamp")


def require_immutable_llm_replay(
    record: dict[str, Any],
    decision_timestamp: Any,
) -> dict[str, Any]:
    """Accept only a previously logged LLM decision available by the replay time."""
    required = ("model_id", "prompt_sha256", "response_sha256", "created_at", "decision")
    missing = [key for key in required if key not in record]
    if missing:
        raise DatasetGateError(f"LLM replay record missing fields: {missing}")
    def as_datetime(value: Any) -> Any:
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        if hasattr(value, "to_pydatetime"):
            return value.to_pydatetime()
        return value

    created_at = as_datetime(record["created_at"])
    decision_at = as_datetime(decision_timestamp)
    if not isinstance(created_at, datetime) or not isinstance(decision_at, datetime):
        raise DatasetGateError("LLM replay timestamps must be timezone-aware datetimes")
    if created_at.tzinfo is None or decision_at.tzinfo is None:
        raise DatasetGateError("LLM replay timestamps must include an explicit timezone")
    if created_at > decision_at:
        raise DatasetGateError("LLM response was created after the historical decision time")
    for field in ("prompt_sha256", "response_sha256"):
        digest = record[field]
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest.lower()):
            raise DatasetGateError(f"LLM replay {field} is not a SHA-256 hex digest")
    if not record["model_id"]:
        raise DatasetGateError("LLM replay provenance is incomplete")
    return record


def fuse_research_signals(
    xgb_probability: float | None,
    lstm_probability: float | None,
    smc_signal: int | None,
    llm_signal: int | None,
    meta_probability: float | None,
    min_meta_probability: float = 0.60,
) -> dict[str, Any]:
    """Fail-closed meta decision; absent/stale inputs cause abstention.

    The meta_probability must come from a separately trained/calibrated meta-model
    using development-only out-of-fold predictions, never hand-set model weights.
    """
    inputs = (xgb_probability, lstm_probability, smc_signal, llm_signal, meta_probability)
    if any(value is None for value in inputs):
        return {"decision": "ABSTAIN", "reason": "missing model or strategy evidence"}
    if not all(0.0 <= float(p) <= 1.0 for p in (xgb_probability, lstm_probability, meta_probability)):
        raise ValueError("probabilities must be within [0, 1]")
    if smc_signal not in (-1, 0, 1) or llm_signal not in (-1, 0, 1):
        raise ValueError("SMC and LLM signals must be -1, 0, or 1")
    if not 0.5 < min_meta_probability < 1.0:
        raise ValueError("min_meta_probability must be between 0.5 and 1")
    if meta_probability >= min_meta_probability:
        meta_direction = 1
        meta_confidence = meta_probability
    elif meta_probability <= 1.0 - min_meta_probability:
        meta_direction = -1
        meta_confidence = 1.0 - meta_probability
    else:
        return {"decision": "ABSTAIN", "reason": "meta probability is inside the neutral band"}
    direction_votes = [
        1 if xgb_probability >= 0.5 else -1,
        1 if lstm_probability >= 0.5 else -1,
        smc_signal,
        llm_signal,
    ]
    non_neutral_votes = [vote for vote in direction_votes if vote != 0]
    if not non_neutral_votes or non_neutral_votes.count(meta_direction) <= len(non_neutral_votes) / 2:
        return {"decision": "ABSTAIN", "reason": "base-model/strategy votes conflict with meta direction"}
    return {
        "decision": "LONG" if meta_direction > 0 else "SHORT",
        "reason": "meta gate passed",
        "meta_confidence": float(meta_confidence),
    }
