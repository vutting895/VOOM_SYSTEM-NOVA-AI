"""Internal Quant Engine research primitives."""
from .identity import build_run_fingerprint
from .experiment import ExperimentValidationError, validate_quant_experiment
from .quality import DatasetQualityReport, DatasetValidationError, canonical_dataset_sha256, validate_ohlcv
from .splits import ChronologicalSplit, PurgePolicy, WalkForwardWindow, chronological_split, derive_purge_policy, walk_forward_windows
from .mtraders_native import MTRADERS_STRATEGY_NAMES, StrategyInputError, evaluate_all_mtraders_modules, evaluate_mtraders_strategy
from .mtraders_hybrid import detect_market_regime, evaluate_hybrid_strategy
from .mtraders_contract import DecisionContractError, build_research_decision_contract

__all__ = ["ChronologicalSplit", "DatasetQualityReport", "DatasetValidationError", "ExperimentValidationError",
           "MTRADERS_STRATEGY_NAMES", "DecisionContractError", "PurgePolicy", "StrategyInputError", "WalkForwardWindow",
           "build_research_decision_contract", "build_run_fingerprint", "canonical_dataset_sha256", "chronological_split", "derive_purge_policy",
           "detect_market_regime", "evaluate_all_mtraders_modules", "evaluate_hybrid_strategy",
           "evaluate_mtraders_strategy", "validate_ohlcv", "validate_quant_experiment", "walk_forward_windows"]
