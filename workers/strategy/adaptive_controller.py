"""Fail-closed, research-only adaptive strategy selection.

This controller selects an eligible research adapter from validated metadata.
It does not calculate trading signals, optimize weights, size positions, or
connect to a broker. Regime labels must come from a separately validated
feature pipeline; this module does not infer them from raw prices.
"""
from __future__ import annotations

import math
import re
from typing import Any

from .catalog import load_strategy_catalog, validate_strategy_catalog

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_ALLOWED_REGIMES = {"trend", "range", "transition", "high-volatility", "unknown"}
_REQUIRED_CONTEXT = {"mode", "symbol", "timeframes", "regime", "data_quality"}
_REQUIRED_QUALITY = {
    "status", "sha256", "closed_bars_only", "age_seconds", "max_age_seconds"
}


class ControllerInputError(ValueError):
    """Raised when the research context is incomplete or unsafe."""


def _validate_context(context: Any) -> None:
    if not isinstance(context, dict) or set(context) != _REQUIRED_CONTEXT:
        raise ControllerInputError("context has an invalid shape")
    if context["mode"] != "research":
        raise ControllerInputError("only research mode is permitted")
    if not isinstance(context["symbol"], str) or not context["symbol"]:
        raise ControllerInputError("symbol is required")
    if not isinstance(context["timeframes"], dict) or not context["timeframes"]:
        raise ControllerInputError("timeframes are required")
    if any(
        not isinstance(key, str) or not isinstance(value, str) or not value
        for key, value in context["timeframes"].items()
    ):
        raise ControllerInputError("timeframes must be string pairs")
    if context["regime"] not in _ALLOWED_REGIMES:
        raise ControllerInputError("unsupported regime label")

    quality = context["data_quality"]
    if not isinstance(quality, dict) or set(quality) != _REQUIRED_QUALITY:
        raise ControllerInputError("data_quality has an invalid shape")
    if quality["status"] != "PASS":
        raise ControllerInputError("market data quality gate did not pass")
    if not isinstance(quality["sha256"], str) or not _SHA256.fullmatch(quality["sha256"]):
        raise ControllerInputError("data SHA-256 is invalid")
    if quality["closed_bars_only"] is not True:
        raise ControllerInputError("forming or unconfirmed bars are not allowed")
    age, maximum = quality["age_seconds"], quality["max_age_seconds"]
    if (
        isinstance(age, bool) or not isinstance(age, (int, float))
        or not math.isfinite(age) or age < 0
        or isinstance(maximum, bool) or not isinstance(maximum, (int, float))
        or not math.isfinite(maximum) or maximum <= 0 or age > maximum
    ):
        raise ControllerInputError("market data is stale or freshness metadata is invalid")


def select_research_strategy(
    context: dict[str, Any],
    *,
    catalog: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a deterministic research candidate or abstain.

    No performance score or model probability is used until independently
    calibrated OOS evidence is registered. Candidate priority is a stable
    tie-break only, not a profitability ranking.
    """
    _validate_context(context)
    registry = catalog if catalog is not None else load_strategy_catalog()
    validate_strategy_catalog(registry)

    eligible: list[dict[str, Any]] = []
    rejected: list[dict[str, str]] = []
    for strategy in registry["strategies"]:
        reason = None
        if strategy["status"] != "research-only":
            reason = f"lifecycle:{strategy['status']}"
        elif "analyze" not in strategy["operations"]:
            reason = "operation:not-supported"
        elif context["symbol"] not in strategy["markets"]:
            reason = "market:not-supported"
        elif any(
            context["timeframes"].get(key) != value
            for key, value in strategy["timeframes"].items()
        ):
            reason = "timeframe:mismatch"
        elif context["regime"] not in strategy["regimes"]:
            reason = "regime:not-supported"
        if reason:
            rejected.append({"strategy_id": strategy["id"], "reason": reason})
        else:
            eligible.append(strategy)

    eligible.sort(key=lambda item: (item["priority"], item["id"]))
    selected = eligible[0] if eligible else None
    models = {
        model["id"]: {
            "status": model["status"],
            "signal_vote_enabled": False,
            "probability_calibration": model["probability_calibration"],
        }
        for model in registry["supporting_models"]
    }
    return {
        "schema_version": "nova.adaptive-selection.v1",
        "policy_version": "rule-based-regime-eligibility.v1",
        "status": "RESEARCH_CANDIDATE_SELECTED" if selected else "NO_ELIGIBLE_STRATEGY",
        "selected_strategy_id": selected["id"] if selected else None,
        "selection_reason": (
            "eligible research adapter matched market, timeframes and supplied regime"
            if selected else "no registered strategy passed all eligibility gates"
        ),
        "eligible_candidates": [item["id"] for item in eligible],
        "rejected_candidates": rejected,
        "supporting_models": models,
        "signal": None,
        "risk_budget_pct": None,
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
