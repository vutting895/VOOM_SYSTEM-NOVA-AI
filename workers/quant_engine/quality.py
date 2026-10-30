"""Strict OHLCV quality checks and deterministic dataset fingerprints."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
from typing import Any

REQUIRED_OHLCV_FIELDS = frozenset({"timestamp", "open", "high", "low", "close", "volume"})


class DatasetValidationError(ValueError):
    """Raised when a dataset cannot safely enter a quantitative experiment."""


@dataclass(frozen=True)
class DatasetQualityReport:
    row_count: int
    start_timestamp: str
    end_timestamp: str
    observed_gap_count: int
    warnings: tuple[str, ...]
    schema_version: str = "nova.ohlcv.v1"


def _parse_timestamp(value: Any, row_index: int) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise DatasetValidationError(f"row {row_index}: timestamp must be ISO-8601") from exc
    else:
        raise DatasetValidationError(f"row {row_index}: timestamp must be an ISO-8601 string or datetime")

    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise DatasetValidationError(f"row {row_index}: timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def _decimal(value: Any, field: str, row_index: int) -> Decimal:
    if isinstance(value, bool):
        raise DatasetValidationError(f"row {row_index}: {field} must be numeric, not boolean")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise DatasetValidationError(f"row {row_index}: {field} must be numeric") from exc
    if not result.is_finite():
        raise DatasetValidationError(f"row {row_index}: {field} must be finite")
    return result


def _canonical_decimal(value: Decimal) -> str:
    if value == 0:
        return "0"
    return format(value.normalize(), "f")


def _normalise_rows(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    normalised: list[dict[str, str]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise DatasetValidationError(f"row {index}: each candle must be a mapping")
        missing = REQUIRED_OHLCV_FIELDS.difference(row.keys())
        if missing:
            raise DatasetValidationError(f"row {index}: missing required fields: {', '.join(sorted(missing))}")

        timestamp = _parse_timestamp(row["timestamp"], index)
        values = {field: _decimal(row[field], field, index) for field in ("open", "high", "low", "close", "volume")}
        for field in ("open", "high", "low", "close"):
            if values[field] <= 0:
                raise DatasetValidationError(f"row {index}: {field} must be greater than zero")
        if values["volume"] < 0:
            raise DatasetValidationError(f"row {index}: volume cannot be negative")
        if values["high"] < max(values["open"], values["close"]):
            raise DatasetValidationError(f"row {index}: high must be >= open and close")
        if values["low"] > min(values["open"], values["close"]):
            raise DatasetValidationError(f"row {index}: low must be <= open and close")
        if values["high"] < values["low"]:
            raise DatasetValidationError(f"row {index}: high must be >= low")

        normalised.append({
            "timestamp": timestamp.isoformat(timespec="microseconds").replace("+00:00", "Z"),
            **{field: _canonical_decimal(values[field]) for field in ("open", "high", "low", "close", "volume")},
        })
    return normalised


def validate_ohlcv(
    rows: Sequence[Mapping[str, Any]],
    *,
    expected_interval_seconds: int | None = None,
    reject_gaps: bool = False,
) -> DatasetQualityReport:
    """Validate chronological OHLCV rows without silently sorting or filling gaps.

    A gap exceeds the supplied expected interval. Gaps are reported, not
    repaired; market closures and provider omissions need source-specific policy.
    """
    if not isinstance(rows, Sequence) or isinstance(rows, (str, bytes)) or not rows:
        raise DatasetValidationError("dataset must be a non-empty sequence of OHLCV rows")
    if expected_interval_seconds is not None and (
        isinstance(expected_interval_seconds, bool)
        or not isinstance(expected_interval_seconds, int)
        or expected_interval_seconds <= 0
    ):
        raise DatasetValidationError("expected_interval_seconds must be a positive integer")

    normalised = _normalise_rows(rows)
    timestamps = [datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) for item in normalised]
    gaps = 0
    for index in range(1, len(timestamps)):
        delta = (timestamps[index] - timestamps[index - 1]).total_seconds()
        if delta <= 0:
            raise DatasetValidationError(
                f"row {index}: timestamps must be strictly increasing; duplicates and out-of-order rows are rejected"
            )
        if expected_interval_seconds is not None and delta > expected_interval_seconds:
            gaps += max(1, int(delta // expected_interval_seconds) - 1)

    warnings: list[str] = []
    if gaps:
        warnings.append(f"{gaps} expected candle interval(s) appear to be missing; no rows were fabricated")
        if reject_gaps:
            raise DatasetValidationError(warnings[-1])

    return DatasetQualityReport(
        row_count=len(normalised),
        start_timestamp=normalised[0]["timestamp"],
        end_timestamp=normalised[-1]["timestamp"],
        observed_gap_count=gaps,
        warnings=tuple(warnings),
    )


def canonical_dataset_sha256(rows: Sequence[Mapping[str, Any]]) -> str:
    """Hash validated OHLCV content; provider metadata is deliberately excluded."""
    validate_ohlcv(rows)
    canonical = _normalise_rows(rows)
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
