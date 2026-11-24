"""Internal Quant Engine research primitives.

These helpers are deterministic and data-only. They do not connect to brokers
or submit orders. Heavy backtests and model training belong in an isolated worker.
"""

from .identity import build_run_fingerprint
from .experiment import ExperimentValidationError, validate_quant_experiment
from .quality import DatasetQualityReport, DatasetValidationError, canonical_dataset_sha256, canonical_ohlcv_payload, validate_ohlcv
from .dataset_registry import DatasetRegistryError, build_dataset_manifest, register_dataset_snapshot
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
    "DatasetRegistryError",
    "ExperimentValidationError",
    "PurgePolicy",
    "WalkForwardWindow",
    "build_run_fingerprint",
    "canonical_dataset_sha256",
    "canonical_ohlcv_payload",
    "build_dataset_manifest",
    "register_dataset_snapshot",
    "chronological_split",
    "derive_purge_policy",
    "validate_ohlcv",
    "validate_quant_experiment",
    "walk_forward_windows",
]
