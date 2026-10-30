"""Internal Quant Engine research primitives.

These helpers are deterministic and data-only. They do not connect to brokers
or submit orders. Heavy backtests and model training belong in an isolated worker.
"""

from .identity import build_run_fingerprint
from .quality import DatasetQualityReport, DatasetValidationError, canonical_dataset_sha256, validate_ohlcv
from .splits import (
    ChronologicalSplit,
    PurgePolicy,
    WalkForwardWindow,
    chronological_split,
    derive_purge_policy,
    walk_forward_windows,
)

__all__ = [
    "ChronologicalSplit",
    "DatasetQualityReport",
    "DatasetValidationError",
    "PurgePolicy",
    "WalkForwardWindow",
    "build_run_fingerprint",
    "canonical_dataset_sha256",
    "chronological_split",
    "derive_purge_policy",
    "validate_ohlcv",
    "walk_forward_windows",
]
