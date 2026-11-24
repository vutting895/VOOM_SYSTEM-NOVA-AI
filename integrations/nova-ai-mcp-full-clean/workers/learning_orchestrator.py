"""Evidence-based orchestration for offline NOVA model research."""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime
from numbers import Integral, Real
from typing import Any, Callable, Dict, Iterable, Optional

import pandas as pd


class LearningGateError(ValueError):
    """Raised when a dataset or experiment fails a hard research gate."""


@dataclass(frozen=True)
class ChronologicalSplit:
    train_end: int
    validation_start: int
    validation_end: int
    test_start: int
    sample_count: int
    purge_bars: int


def _aware_timestamp(value: Any) -> bool:
    if not isinstance(value, (datetime, pd.Timestamp)):
        return False
    try:
        return value.tzinfo is not None and value.tzinfo.utcoffset(value) is not None
    except (TypeError, ValueError, AttributeError):
        return False


def validate_market_frame(
    frame: Any,
    required_columns: Iterable[str] = ("timestamp", "open", "high", "low", "close", "volume"),
) -> None:
    if not hasattr(frame, "columns") or not hasattr(frame, "iloc"):
        raise LearningGateError("market_frame_must_be_tabular")
    missing = [name for name in required_columns if name not in frame.columns]
    if missing:
        raise LearningGateError("missing_required_columns:" + ",".join(missing))
    if len(frame) < 100:
        raise LearningGateError("insufficient_rows")

    timestamps = frame["timestamp"]
    if timestamps.isna().any():
        raise LearningGateError("null_timestamp")
    if not all(_aware_timestamp(value) for value in timestamps):
        raise LearningGateError("timezone_aware_timestamp_required")
    if not timestamps.is_monotonic_increasing:
        raise LearningGateError("timestamps_not_chronological")
    if timestamps.duplicated().any():
        raise LearningGateError("duplicate_timestamp")

    numeric: Dict[str, list[float]] = {}
    for name in ("open", "high", "low", "close", "volume"):
        try:
            values = [float(value) for value in frame[name]]
        except (TypeError, ValueError, OverflowError):
            raise LearningGateError("invalid_numeric:" + name) from None
        if not all(math.isfinite(value) for value in values):
            raise LearningGateError("non_finite_numeric:" + name)
        numeric[name] = values

    for index, (open_price, high, low, close, volume) in enumerate(
        zip(numeric["open"], numeric["high"], numeric["low"], numeric["close"], numeric["volume"])
    ):
        if high < max(open_price, close, low):
            raise LearningGateError("invalid_ohlc_high")
        if low > min(open_price, close, high):
            raise LearningGateError("invalid_ohlc_low")
        if volume < 0:
            raise LearningGateError("negative_volume")


def chronological_split(
    sample_count: int,
    horizon: int = 5,
    train_ratio: float = 0.70,
    validation_ratio: float = 0.15,
) -> ChronologicalSplit:
    if (
        isinstance(sample_count, bool)
        or not isinstance(sample_count, Integral)
        or isinstance(horizon, bool)
        or not isinstance(horizon, Integral)
        or sample_count <= 0
        or horizon < 1
    ):
        raise LearningGateError("invalid_split_parameters")
    if (
        isinstance(train_ratio, bool)
        or isinstance(validation_ratio, bool)
        or not isinstance(train_ratio, Real)
        or not isinstance(validation_ratio, Real)
        or not math.isfinite(float(train_ratio))
        or not math.isfinite(float(validation_ratio))
        or not (0.5 <= train_ratio < 1 and 0 < validation_ratio < 0.5 and train_ratio + validation_ratio < 1)
    ):
        raise LearningGateError("invalid_split_ratios")

    train_end = int(sample_count * train_ratio)
    validation_start = train_end + horizon
    validation_end = int(sample_count * (train_ratio + validation_ratio))
    test_start = validation_end + horizon
    if train_end < 1 or validation_start >= validation_end or test_start >= sample_count:
        raise LearningGateError("insufficient_rows_after_purge")
    return ChronologicalSplit(
        train_end, validation_start, validation_end, test_start, int(sample_count), int(horizon)
    )


def _canonical_scalar(value: Any) -> Any:
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    try:
        missing = pd.isna(value)
        if isinstance(missing, bool) and missing:
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (datetime, pd.Timestamp)):
        if not _aware_timestamp(value):
            raise LearningGateError("fingerprint_timestamp_must_be_timezone_aware")
        return {"type": "timestamp", "value": value.isoformat()}
    if isinstance(value, bool):
        return value
    if isinstance(value, Integral):
        return int(value)
    if isinstance(value, Real):
        numeric = float(value)
        if not math.isfinite(numeric):
            raise LearningGateError("fingerprint_contains_non_finite_value")
        return numeric
    if isinstance(value, str):
        return value
    raise LearningGateError("unsupported_fingerprint_value_type:" + type(value).__name__)


def dataset_fingerprint(
    frame: Any,
    dataset_id: str,
    source: str,
    schema_version: str = "nova.ohlcv.v1",
) -> str:
    validate_market_frame(frame)
    if not all(isinstance(value, str) and value.strip() for value in (dataset_id, source, schema_version)):
        raise LearningGateError("dataset_identity_source_and_schema_required")

    columns = sorted(str(column) for column in frame.columns)
    rows = []
    for row in frame[columns].itertuples(index=False, name=None):
        rows.append([_canonical_scalar(value) for value in row])
    payload = {
        "dataset_id": dataset_id,
        "source": source,
        "schema_version": schema_version,
        "columns": columns,
        "rows": rows,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class LearningOrchestrator:
    """Coordinates a real trainer/evaluator and records evidence, never mock metrics."""

    def __init__(self, model_name: str = "xgboost", seed: int = 42):
        if isinstance(seed, bool) or not isinstance(seed, Integral):
            raise LearningGateError("seed_must_be_integer")
        self.model_name = model_name
        self.seed = int(seed)
        self.last_run: Optional[Dict[str, Any]] = None

    def run(
        self,
        frame: Any,
        *,
        dataset_id: str,
        source: str,
        code_revision: str,
        trainer: Callable[[Any, ChronologicalSplit, int], Any],
        evaluator: Callable[[Any, Any, ChronologicalSplit], Dict[str, Any]],
        horizon: int = 5,
    ) -> Dict[str, Any]:
        if not all(isinstance(value, str) and value.strip() for value in (dataset_id, source, code_revision)):
            raise LearningGateError("dataset_source_and_code_revision_required")
        validate_market_frame(frame)
        fingerprint = dataset_fingerprint(frame, dataset_id, source)
        split = chronological_split(len(frame), horizon=horizon)
        model = trainer(frame, split, self.seed)
        metrics = evaluator(model, frame, split)
        if not isinstance(metrics, dict) or not metrics:
            raise LearningGateError("evaluator_returned_no_metrics")
        try:
            json.dumps(metrics, sort_keys=True, allow_nan=False)
        except (TypeError, ValueError):
            raise LearningGateError("metrics_must_be_complete_finite_json") from None
        if any(value is None for value in metrics.values()):
            raise LearningGateError("incomplete_metrics")

        self.last_run = {
            "status": "EVALUATED_REQUIRES_REVIEW",
            "model": self.model_name,
            "dataset_id": dataset_id,
            "dataset_sha256": fingerprint,
            "source": source,
            "code_revision": code_revision,
            "seed": self.seed,
            "split": asdict(split),
            "metrics": metrics,
            "live_trading_enabled": False,
            "orders_enabled": False,
            "execution_enabled": False,
            "promotion": "NOT_AUTOMATIC",
        }
        return self.last_run
