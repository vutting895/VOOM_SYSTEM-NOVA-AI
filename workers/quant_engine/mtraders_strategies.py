"""Compatibility facade for the source-grounded NOVA EA v1.82 strategy port.

Legacy callers keep their function names, but unsupported strategies abstain
instead of receiving fabricated direction/confidence scores.
"""
from collections.abc import Mapping
from typing import Any

from .nova_ea_v182_strategy import (
    STRATEGY_NAMES as MTRADERS_STRATEGY_NAMES,
    StrategyInputError,
    evaluate_nova_ea_v182_strategy,
    evaluate_all_nova_ea_v182_strategies,
)


def evaluate_mtraders_strategy(
    strategy_id: int,
    market_data: Mapping[str, Any],
    state: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    return evaluate_nova_ea_v182_strategy(strategy_id, market_data, state)


def evaluate_all_mtraders_modules(
    market_data: Mapping[str, Any],
    states: Mapping[int, Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    return evaluate_all_nova_ea_v182_strategies(market_data, states)
