"""Stable public entry points for NOVA native MTRADERS research strategies."""
from .mtraders_native import MTRADERS_STRATEGY_NAMES, StrategyInputError, evaluate_all_mtraders_modules, evaluate_mtraders_strategy
from .mtraders_hybrid import detect_market_regime, evaluate_hybrid_strategy

__all__ = ["MTRADERS_STRATEGY_NAMES", "StrategyInputError", "evaluate_all_mtraders_modules",
           "evaluate_mtraders_strategy", "detect_market_regime", "evaluate_hybrid_strategy"]
