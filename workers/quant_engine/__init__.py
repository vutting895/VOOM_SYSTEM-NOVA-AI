"""Internal Quant Engine research primitives.

These helpers are deterministic and data-only. They do not connect to brokers
or submit orders. Heavy backtests and model training belong in an isolated worker.
"""

from .model_plugin import ModelInput, ModelOutput, ModelPluginError, ModelPluginRegistry, feature_schema_sha256
from .sequence_data import (FeatureNormalizer, SequenceDataError, SequencePartitions, SequenceSample, build_sequence_samples, chronological_sequence_split, fit_feature_normalizer)
from .training import TrainingError, TrainingResult, train_sequence_model, validate_training_inputs
from .xgboost_data import (FEATURE_NAMES as XGBOOST_FEATURE_NAMES, TabularPartitions, TabularSample, XGBoostDataError, build_xgboost_samples, fit_xgboost_classifier, split_xgboost_samples)
from .torch_models import build_lstm_model, build_temporal_cnn_model
from .identity import build_run_fingerprint
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
    "XGBOOST_FEATURE_NAMES",
    "TabularPartitions",
    "TabularSample",
    "XGBoostDataError",
    "build_xgboost_samples",
    "fit_xgboost_classifier",
    "split_xgboost_samples",
    "ChronologicalSplit",
    "build_lstm_model",
    "build_temporal_cnn_model",
    "TrainingError",
    "TrainingResult",
    "train_sequence_model",
    "validate_training_inputs",
    "FeatureNormalizer",
    "SequenceDataError",
    "SequencePartitions",
    "SequenceSample",
    "build_sequence_samples",
    "chronological_sequence_split",
    "fit_feature_normalizer",
    "ModelInput",
    "ModelOutput",
    "ModelPluginError",
    "ModelPluginRegistry",
    "feature_schema_sha256",
    "DatasetQualityReport",
    "DatasetValidationError",
    "ExperimentValidationError",
    "PurgePolicy",
    "WalkForwardWindow",
    "build_run_fingerprint",
    "canonical_dataset_sha256",
    "chronological_split",
    "derive_purge_policy",
    "validate_ohlcv",
    "validate_quant_experiment",
    "walk_forward_windows",
]
