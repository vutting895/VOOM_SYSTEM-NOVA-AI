"""Chronological, leakage-aware dataset partitions for research experiments."""
from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Sequence


@dataclass(frozen=True)
class ChronologicalSplit:
    train: tuple[Any, ...]
    validation: tuple[Any, ...]
    test: tuple[Any, ...]
    purged_indices: tuple[int, ...]


@dataclass(frozen=True)
class WalkForwardWindow:
    fold: int
    train_start: int
    train_end: int  # exclusive
    test_start: int
    test_end: int  # exclusive


@dataclass(frozen=True)
class PurgePolicy:
    """Recorded exclusion policy derived from all forward-label horizons."""

    label_horizons_bars: tuple[int, ...]
    max_label_horizon_bars: int
    embargo_bars: int
    purge_bars: int

    def to_manifest(self) -> dict[str, int | list[int]]:
        return {
            "label_horizons_bars": list(self.label_horizons_bars),
            "max_label_horizon_bars": self.max_label_horizon_bars,
            "embargo_bars": self.embargo_bars,
            "purge_bars": self.purge_bars,
        }


def derive_purge_policy(
    label_horizons_bars: Sequence[int],
    *,
    embargo_bars: int = 0,
) -> PurgePolicy:
    """Derive and record a conservative boundary gap from forward-label horizons.

    embargo_bars is an additional pre-holdout exclusion buffer for this
    strictly chronological splitter. It is not a post-test embargo for
    combinatorial/cross-validation folds; those designs need a separate policy.
    """
    if not isinstance(label_horizons_bars, Sequence) or isinstance(label_horizons_bars, (str, bytes)) or not label_horizons_bars:
        raise ValueError("label_horizons_bars must be a non-empty sequence of positive integers")
    if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in label_horizons_bars):
        raise ValueError("each label horizon must be a positive integer")
    if isinstance(embargo_bars, bool) or not isinstance(embargo_bars, int) or embargo_bars < 0:
        raise ValueError("embargo_bars must be a non-negative integer")

    horizons = tuple(label_horizons_bars)
    maximum = max(horizons)
    return PurgePolicy(
        label_horizons_bars=horizons,
        max_label_horizon_bars=maximum,
        embargo_bars=embargo_bars,
        purge_bars=maximum + embargo_bars,
    )


def chronological_split(
    rows: Sequence[Any],
    *,
    train_fraction: float = 0.70,
    validation_fraction: float = 0.15,
    purge_bars: int,
) -> ChronologicalSplit:
    """Split in timestamp order using an explicitly supplied boundary exclusion gap."""
    if len(rows) < 3:
        raise ValueError("at least three rows are required")
    for name, value in (("train_fraction", train_fraction), ("validation_fraction", validation_fraction)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{name} must be a finite number")
    if not (0 < train_fraction < 1 and 0 < validation_fraction < 1 and train_fraction + validation_fraction < 1):
        raise ValueError("train_fraction and validation_fraction must be positive and sum to less than one")
    if isinstance(purge_bars, bool) or not isinstance(purge_bars, int) or purge_bars < 0:
        raise ValueError("purge_bars must be a non-negative integer")

    train_end = int(len(rows) * train_fraction)
    validation_end = int(len(rows) * (train_fraction + validation_fraction))
    train_stop = train_end - purge_bars
    validation_stop = validation_end - purge_bars
    if train_stop <= 0 or validation_stop <= train_end or validation_end >= len(rows):
        raise ValueError("split fractions or purge_bars leave an empty partition")

    purged = tuple(range(train_stop, train_end)) + tuple(range(validation_stop, validation_end))
    return ChronologicalSplit(
        train=tuple(rows[:train_stop]),
        validation=tuple(rows[train_end:validation_stop]),
        test=tuple(rows[validation_end:]),
        purged_indices=purged,
    )


def walk_forward_windows(
    row_count: int,
    *,
    train_bars: int,
    test_bars: int,
    step_bars: int | None = None,
    purge_bars: int = 0,
    expanding: bool = True,
) -> tuple[WalkForwardWindow, ...]:
    """Create reproducible rolling or expanding train/test windows.

    Test windows are later than training windows and never overlap. The caller
    must supply an explicit purge gap derived from the maximum forward-label
    horizon (or explicitly set zero for a no-forward-label experiment).
    Incomplete trailing test windows are omitted. The function does not tune
    parameters or touch a reserved final OOS period.
    """
    step = test_bars if step_bars is None else step_bars
    if not isinstance(expanding, bool):
        raise ValueError("expanding must be a boolean")
    for name, value, minimum in (
        ("row_count", row_count, 1),
        ("train_bars", train_bars, 2),
        ("test_bars", test_bars, 1),
        ("step_bars", step, 1),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise ValueError(f"{name} must be an integer >= {minimum}")
    if step < test_bars:
        raise ValueError("step_bars must be >= test_bars; overlapping test folds are not supported")
    if isinstance(purge_bars, bool) or not isinstance(purge_bars, int) or purge_bars < 0:
        raise ValueError("purge_bars must be a non-negative integer")

    windows: list[WalkForwardWindow] = []
    first_test_start = train_bars + purge_bars
    fold = 0
    for test_start in range(first_test_start, row_count - test_bars + 1, step):
        train_end = test_start - purge_bars
        train_start = 0 if expanding else train_end - train_bars
        if train_start < 0 or train_end - train_start < 2:
            continue
        windows.append(WalkForwardWindow(
            fold=fold,
            train_start=train_start,
            train_end=train_end,
            test_start=test_start,
            test_end=test_start + test_bars,
        ))
        fold += 1
    if not windows:
        raise ValueError("not enough rows to construct a complete walk-forward window")
    return tuple(windows)
