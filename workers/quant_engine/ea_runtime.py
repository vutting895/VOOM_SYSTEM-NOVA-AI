"""Read-only orchestration for source-grounded NOVA EA v1.82 analysis.

This module evaluates completed-bar market data and arbitrates EA strategy
families. It deliberately withholds a final trade decision until calibrated
ML evidence and the independent Shared Risk Governor are connected.
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from .meta_decision import MetaDecisionInputError, evaluate_ea_strategy_consensus
from .nova_ea_v182_strategy import (
    StrategyInputError,
    evaluate_all_nova_ea_v182_strategies,
)


def _aware_time(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}_must_be_timezone_aware_iso_timestamp")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label}_must_be_timezone_aware_iso_timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{label}_must_be_timezone_aware_iso_timestamp")
    return parsed


def analyze_nova_ea_v182(
    *,
    market_data: Mapping[str, Any],
    current_time: str,
    premium_discount: Mapping[str, Any],
    states: Mapping[int, Mapping[str, Any]] | None = None,
    max_signal_age_seconds: int = 3600,
) -> dict[str, Any]:
    """Evaluate EA modules and return a fail-closed, research-only result."""
    if not isinstance(market_data, Mapping):
        raise ValueError("market_data_must_be_object")
    symbol = market_data.get("symbol")
    timeframe = market_data.get("timeframe")
    bars = market_data.get("bars")
    if not isinstance(symbol, str) or not symbol.strip():
        raise ValueError("market_data_symbol_required")
    if not isinstance(timeframe, str) or not timeframe.strip():
        raise ValueError("market_data_timeframe_required")
    if not isinstance(bars, list) or len(bars) < 110:
        raise ValueError("at_least_110_completed_bars_required")
    now = _aware_time(current_time, "current_time")
    last_bar = bars[-1] if isinstance(bars[-1], Mapping) else None
    last_bar_time = _aware_time(
        (last_bar.get("bar_close_time") or last_bar.get("time")) if last_bar else None,
        "last_completed_bar_time",
    )
    if last_bar_time > now:
        raise ValueError("last_completed_bar_is_in_the_future")
    age = (now - last_bar_time).total_seconds()
    # A closed-bar dataset that is more than two expected periods old is stale.
    timeframe_seconds = {
        "M1": 60, "M5": 300, "M15": 900, "M30": 1800,
        "H1": 3600, "H4": 14400, "D1": 86400,
    }.get(timeframe.upper())
    if timeframe_seconds is None:
        raise ValueError("unsupported_runtime_timeframe")
    if age > max(timeframe_seconds * 2, 120):
        return {
            "schema_version": "nova.ea-v182-analysis.v1",
            "decision": "NO_TRADE",
            "reason": "STALE_COMPLETED_BAR_DATA",
            "symbol": symbol,
            "timeframe": timeframe.upper(),
            "last_completed_bar_time": last_bar_time.isoformat(),
            "data_age_seconds": round(age, 3),
            "strategy_results": [],
            "strategy_evidence": None,
            "next_states": {},
            "final_decision": "NO_TRADE",
            "final_decision_blockers": ["STALE_MARKET_DATA", "ML_CALIBRATION_NOT_CONNECTED", "SHARED_RISK_GOVERNOR_NOT_CONNECTED"],
            "research_only": True,
            "orders_submitted": False,
            "execution_enabled": False,
            "live_trading_enabled": False,
        }

    state_map = states or {}
    if not isinstance(state_map, Mapping):
        raise ValueError("states_must_be_object")
    try:
        results = evaluate_all_nova_ea_v182_strategies(market_data, state_map)
    except StrategyInputError as exc:
        raise ValueError(f"market_data_rejected:{exc}") from exc

    candidates = [row for row in results if row.get("status") == "RESEARCH_CANDIDATE"]
    next_states = {
        str(row["strategy_id"]): row["state"]
        for row in results
        if isinstance(row.get("state"), Mapping)
    }
    try:
        arbitration = evaluate_ea_strategy_consensus(
            strategy_candidates=candidates,
            symbol=symbol,
            timeframe=timeframe,
            current_time=now.isoformat(),
            premium_discount=premium_discount,
            max_signal_age_seconds=max_signal_age_seconds,
        )
    except MetaDecisionInputError as exc:
        raise ValueError(f"decision_context_rejected:{exc}") from exc

    blockers = []
    if arbitration["decision"] != "STRATEGY_CANDIDATE":
        blockers.append(f"EA_STRATEGY_GATE:{arbitration['reason']}")
    blockers.extend(["ML_CALIBRATION_NOT_CONNECTED", "SHARED_RISK_GOVERNOR_NOT_CONNECTED"])
    return {
        "schema_version": "nova.ea-v182-analysis.v1",
        "decision": "NO_TRADE",
        "reason": "RESEARCH_ONLY_UNTIL_ALL_DECISION_GATES_ARE_CONNECTED",
        "symbol": symbol,
        "timeframe": timeframe.upper(),
        "last_completed_bar_time": last_bar_time.isoformat(),
        "data_age_seconds": round(age, 3),
        "strategy_results": results,
        "strategy_evidence": arbitration,
        "next_states": next_states,
        "final_decision": "NO_TRADE",
        "final_decision_blockers": blockers,
        "research_only": True,
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
