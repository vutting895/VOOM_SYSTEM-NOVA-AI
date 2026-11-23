"""Internal Quant Engine research primitives.

These helpers are deterministic and data-only. They do not connect to brokers
or submit orders. Heavy backtests and model training belong in an isolated worker.
"""

from .identity import build_run_fingerprint
from .nova_ea_v182_strategy import (
    StrategyInputError,
    evaluate_all_nova_ea_v182_strategies,
    evaluate_nova_ea_v182_strategy,
)
from .experiment import ExperimentValidationError, validate_quant_experiment
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
    "ExperimentValidationError",
    "PurgePolicy",
    "StrategyInputError",
    "WalkForwardWindow",
    "build_run_fingerprint",
    "canonical_dataset_sha256",
    "chronological_split",
    "derive_purge_policy",
    "evaluate_all_nova_ea_v182_strategies",
    "evaluate_nova_ea_v182_strategy",
    "validate_ohlcv",
    "validate_quant_experiment",
    "walk_forward_windows",
]
