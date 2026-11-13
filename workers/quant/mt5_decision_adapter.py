"""Research-only adapter for the exact MT5 AI Trading EA v1 signal contract.

The EA supplies 30 heuristic BUY/SELL/NEUTRAL votes, not the OHLC/ATR/RSI
feature vector required by NOVA's HybridQuantumQuantEngine. Never fabricate
those features or relabel heuristic consensus as an ML prediction.
"""
from __future__ import annotations

from typing import Any


ENGINE_NAME = "MT5HeuristicConsensusAdapter"
MODULE_IDS = tuple(f"M{i:02d}" for i in range(1, 31))
VALID_VOTES = {"BUY", "SELL", "NEUTRAL"}


def evaluate_mt5_event(event: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(event, dict) or event.get("schema_version") != "nova.mt5-event.v2":
        raise ValueError("unsupported_mt5_event_contract")

    votes = event.get("module_votes")
    if not isinstance(votes, list) or len(votes) != 30:
        raise ValueError("exactly_30_module_votes_required")

    seen: set[str] = set()
    counts = {"BUY": 0, "SELL": 0, "NEUTRAL": 0}
    for item in votes:
        if not isinstance(item, dict):
            raise ValueError("invalid_module_vote")
        module_id = item.get("module_id")
        vote = item.get("vote")
        if not isinstance(module_id, str) or module_id not in MODULE_IDS or module_id in seen:
            raise ValueError("invalid_or_duplicate_module_id")
        if not isinstance(vote, str) or vote not in VALID_VOTES:
            raise ValueError("invalid_module_vote_value")
        seen.add(module_id)
        counts[vote] += 1

    if seen != set(MODULE_IDS):
        raise ValueError("incomplete_module_inventory")

    supplied_counts = event.get("vote_counts")
    if supplied_counts != {
        "buy": counts["BUY"],
        "sell": counts["SELL"],
        "neutral": counts["NEUTRAL"],
    }:
        raise ValueError("module_vote_totals_mismatch")

    directional_difference = counts["BUY"] - counts["SELL"]
    if directional_difference > 0:
        bias = "BUY"
    elif directional_difference < 0:
        bias = "SELL"
    else:
        bias = "NEUTRAL"

    return {
        "engine": ENGINE_NAME,
        "engine_version": "1.0",
        "event_id": event.get("event_id"),
        "symbol": event.get("symbol"),
        "timeframe": event.get("timeframe"),
        "module_count": len(votes),
        "vote_counts": {
            "buy": counts["BUY"],
            "sell": counts["SELL"],
            "neutral": counts["NEUTRAL"],
        },
        "directional_bias": bias,
        "consensus_strength": round(abs(directional_difference) / 30.0, 6),
        "participation_ratio": round((counts["BUY"] + counts["SELL"]) / 30.0, 6),
        "evaluation_status": "research_only",
        "signal_source": "mt5_ea_heuristic_modules",
        "trained_model": False,
        "score_calibration": "not_applicable",
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
