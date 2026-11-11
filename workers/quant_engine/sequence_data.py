"""Leakage-aware sequence dataset construction for time-series model research.

This module is dependency-free. It creates forward-return targets, removes
rows without a complete future horizon, and fits normalization on training
samples only. It does not train models or access broker/execution APIs.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import math
from typing import Mapping, Sequence


class SequenceDataError(ValueError):
    """Invalid sequence data or split configuration."""


@dataclass(frozen=True)
class SequenceSample:
    decision_timestamp: str
    features: tuple[tuple[float, ...], ...]
    forward_return: float
    direction: int
    source_end_index: int


@dataclass(frozen=True)
class SequencePartitions:
    train: tuple[SequenceSample, ...]
    validation: tuple[SequenceSample, ...]
    test: tuple[SequenceSample, ...]
    purged_sample_indices: tuple[int, ...]
    label_horizon_bars: int


@dataclass(frozen=True)
class FeatureNormalizer:
    feature_names: tuple[str, ...]
    means: tuple[float, ...]
    scales: tuple[float, ...]

    def transform_sequence(self, sequence: Sequence[Sequence[float]]) -> tuple[tuple[float, ...], ...]:
        if len(self.means) != len(self.feature_names) or len(self.scales) != len(self.feature_names):
            raise SequenceDataError("normalizer schema is inconsistent")
        transformed = []
        for row in sequence:
            if len(row) != len(self.feature_names):
                raise SequenceDataError("feature row does not match normalizer schema")
            values = []
            for index, raw in enumerate(row):
                value = _finite(raw, f"feature[{index}]")
                values.append((value - self.means[index]) / self.scales[index])
            transformed.append(tuple(values))
        return tuple(transformed)


def _finite(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise SequenceDataError(f"{label} must be finite numeric data")
    return float(value)


def _timestamp(value: object, label: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise SequenceDataError(f"{label} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SequenceDataError(f"{label} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise SequenceDataError(f"{label} must include a timezone")
    return parsed


def build_sequence_samples(
    rows: Sequence[Mapping[str, object]],
    *,
    feature_names: Sequence[str],
    sequence_length: int,
    label_horizon_bars: int,
    deadband_return: float = 0.0,
) -> tuple[SequenceSample, ...]:
    """Build endpoint-timestamped sequences and future-return labels.

    Sample at endpoint i uses features [i-sequence_length+1, i] and target
    close[i+horizon]/close[i]-1. The final horizon rows are never labeled.
    """
    if not isinstance(feature_names, Sequence) or isinstance(feature_names, (str, bytes)) or not feature_names:
        raise SequenceDataError("feature_names must be a non-empty sequence")
    names = tuple(feature_names)
    if any(not isinstance(name, str) or not name or name == "close" for name in names):
        raise SequenceDataError("feature_names must be non-empty; close is reserved for target construction")
    if len(set(names)) != len(names):
        raise SequenceDataError("feature_names must be unique")
    for name, value, minimum in (
        ("sequence_length", sequence_length, 2),
        ("label_horizon_bars", label_horizon_bars, 1),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise SequenceDataError(f"{name} must be an integer >= {minimum}")
    deadband = _finite(deadband_return, "deadband_return")
    if deadband < 0:
        raise SequenceDataError("deadband_return must be non-negative")
    if not isinstance(rows, Sequence) or len(rows) < sequence_length + label_horizon_bars:
        raise SequenceDataError("not enough rows for sequence and complete label horizon")

    times = []
    closes = []
    feature_rows = []
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise SequenceDataError(f"row {index} must be a mapping")
        times.append(_timestamp(row.get("timestamp"), f"row {index} timestamp"))
        closes.append(_finite(row.get("close"), f"row {index} close"))
        if closes[-1] <= 0:
            raise SequenceDataError(f"row {index} close must be positive")
        feature_rows.append(tuple(_finite(row.get(name), f"row {index} {name}") for name in names))
    if any(times[index] <= times[index - 1] for index in range(1, len(times))):
        raise SequenceDataError("timestamps must be strictly increasing")

    samples = []
    last_endpoint = len(rows) - label_horizon_bars - 1
    for endpoint in range(sequence_length - 1, last_endpoint + 1):
        future_return = closes[endpoint + label_horizon_bars] / closes[endpoint] - 1.0
        direction = 1 if future_return > deadband else (-1 if future_return < -deadband else 0)
        samples.append(SequenceSample(
            decision_timestamp=rows[endpoint]["timestamp"],  # type: ignore[index]
            features=tuple(feature_rows[endpoint - sequence_length + 1:endpoint + 1]),
            forward_return=future_return,
            direction=direction,
            source_end_index=endpoint,
        ))
    if not samples:
        raise SequenceDataError("no complete sequence samples were produced")
    return tuple(samples)


def chronological_sequence_split(
    samples: Sequence[SequenceSample],
    *,
    train_fraction: float = 0.70,
    validation_fraction: float = 0.15,
    purge_bars: int,
    label_horizon_bars: int,
) -> SequencePartitions:
    """Chronologically partition samples and purge label-overlap at boundaries."""
    for name, value in (("train_fraction", train_fraction), ("validation_fraction", validation_fraction)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise SequenceDataError(f"{name} must be finite")
    if not (0 < train_fraction < 1 and 0 < validation_fraction < 1 and train_fraction + validation_fraction < 1):
        raise SequenceDataError("fractions must be positive and sum to less than one")
    for name, value, minimum in (("purge_bars", purge_bars, 0), ("label_horizon_bars", label_horizon_bars, 1)):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise SequenceDataError(f"{name} must be an integer >= {minimum}")
    required_purge = label_horizon_bars
    if purge_bars < required_purge:
        raise SequenceDataError("purge_bars must be at least label_horizon_bars")
    if len(samples) < 10:
        raise SequenceDataError("at least 10 samples are required for chronological partitioning")
    train_end = int(len(samples) * train_fraction)
    validation_end = int(len(samples) * (train_fraction + validation_fraction))
    train_stop = train_end - purge_bars
    validation_stop = validation_end - purge_bars
    if train_stop < 2 or validation_stop <= train_end or validation_end >= len(samples):
        raise SequenceDataError("fractions and purge leave an empty partition")
    purged = tuple(range(train_stop, train_end)) + tuple(range(validation_stop, validation_end))
    return SequencePartitions(
        train=tuple(samples[:train_stop]),
        validation=tuple(samples[train_end:validation_stop]),
        test=tuple(samples[validation_end:]),
        purged_sample_indices=purged,
        label_horizon_bars=label_horizon_bars,
    )


def fit_feature_normalizer(
    training_samples: Sequence[SequenceSample],
    *,
    feature_names: Sequence[str],
) -> FeatureNormalizer:
    """Fit population mean/std using training partition only."""
    names = tuple(feature_names)
    if not training_samples or not names:
        raise SequenceDataError("training_samples and feature_names must be non-empty")
    columns: list[list[float]] = [[] for _ in names]
    for sample in training_samples:
        for row in sample.features:
            if len(row) != len(names):
                raise SequenceDataError("training sample feature width mismatch")
            for index, value in enumerate(row):
                columns[index].append(_finite(value, f"training feature {names[index]}"))
    means = tuple(sum(column) / len(column) for column in columns)
    scales = []
    for column, mean in zip(columns, means):
        variance = sum((value - mean) ** 2 for value in column) / len(column)
        scale = math.sqrt(variance)
        scales.append(scale if scale > 1e-12 else 1.0)
    return FeatureNormalizer(names, means, tuple(scales))
