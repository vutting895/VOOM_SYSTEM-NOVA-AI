"""Versioned, fail-closed research decision envelope for NOVA adapters."""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import re
from collections.abc import Mapping
from typing import Any

SCHEMA_VERSION = "nova.mtraders.decision.v1"
_ALLOWED_TIMEFRAMES = {"M1", "M5", "M15", "M30", "H1", "H4", "D1"}
_ALLOWED_DECISIONS = {"LONG_CANDIDATE", "SHORT_CANDIDATE", "NO_TRADE",
                      "DATA_QUALITY_BLOCKED", "INSUFFICIENT_DATA"}


class DecisionContractError(ValueError):
    """Raised when a research result cannot be represented safely."""


def build_research_decision_contract(
    result: Mapping[str, Any], *, symbol: str, timeframe: str, bar_time_utc: str
) -> dict[str, Any]:
    """Build a deterministic research-only envelope; never an execution instruction."""
    if not isinstance(result, Mapping):
        raise DecisionContractError("result must be a mapping")
    if not isinstance(symbol, str) or not re.fullmatch(r"[A-Z0-9._-]{1,32}", symbol):
        raise DecisionContractError("symbol must be a canonical uppercase broker symbol")
    if timeframe not in _ALLOWED_TIMEFRAMES:
        raise DecisionContractError("unsupported timeframe")
    if not isinstance(bar_time_utc, str) or not bar_time_utc.endswith("Z"):
        raise DecisionContractError("bar_time_utc must be an ISO-8601 UTC timestamp ending in Z")
    try:
        parsed_time = datetime.fromisoformat(bar_time_utc[:-1] + "+00:00")
    except ValueError as exc:
        raise DecisionContractError("invalid bar_time_utc") from exc
    if parsed_time.utcoffset() != timezone.utc.utcoffset(parsed_time):
        raise DecisionContractError("bar_time_utc must be UTC")

    decision = result.get("decision")
    signal = result.get("signal")
    if decision not in _ALLOWED_DECISIONS:
        raise DecisionContractError("unsupported decision")
    if signal not in (None, -1, 1) or isinstance(signal, bool):
        raise DecisionContractError("signal must be -1, 1, or null")
    expected_signal = 1 if decision == "LONG_CANDIDATE" else -1 if decision == "SHORT_CANDIDATE" else None
    if signal != expected_signal:
        raise DecisionContractError("decision and signal are inconsistent")
    if result.get("orders_submitted") is not False or result.get("execution_enabled") is not False or result.get("live_trading_enabled") is not False:
        raise DecisionContractError("research result contains unsafe execution flags")

    score = result.get("ensemble_score", 0.0)
    if isinstance(score, bool) or not isinstance(score, (int, float)) or not -1.0 <= float(score) <= 1.0:
        raise DecisionContractError("ensemble_score must be in [-1, 1]")
    if signal == 1 and score <= 0 or signal == -1 and score >= 0:
        raise DecisionContractError("ensemble_score conflicts with signal")

    families = result.get("selected_families", [])
    modules = result.get("selected_modules", [])
    if not isinstance(families, list) or not isinstance(modules, list):
        raise DecisionContractError("selected modules and families must be arrays")
    family_ids = [x.get("family_id") for x in families if isinstance(x, Mapping)]
    if len(family_ids) != len(families) or len(set(family_ids)) != len(family_ids) or len(families) > 8:
        raise DecisionContractError("family votes must be unique and limited to eight")
    if result.get("strategy_vote_count", len(families)) != len(families):
        raise DecisionContractError("strategy_vote_count does not match selected families")
    if result.get("module_vote_count", len(modules)) != len(modules):
        raise DecisionContractError("module_vote_count does not match selected modules")

    receipt = result.get("dataset_receipt")
    if decision not in {"DATA_QUALITY_BLOCKED", "INSUFFICIENT_DATA"}:
        if not isinstance(receipt, Mapping) or receipt.get("status") != "PASS":
            raise DecisionContractError("a verified PASS dataset receipt is required")
        for key in ("dataset_id", "quality_report_id", "dataset_sha256"):
            if not isinstance(receipt.get(key), str) or not receipt[key]:
                raise DecisionContractError(f"dataset receipt missing {key}")

    body = {
        "schema_version": SCHEMA_VERSION,
        "strategy": "MTRADERS_HYBRID",
        "symbol": symbol,
        "timeframe": timeframe,
        "bar_time_utc": bar_time_utc,
        "decision": decision,
        "signal": signal,
        "ensemble_score": round(float(score), 6),
        "regime": result.get("regime", {}).get("regime") if isinstance(result.get("regime"), Mapping) else None,
        "module_vote_count": len(modules),
        "strategy_vote_count": len(families),
        "selected_families": families,
        "conflicted_families": result.get("conflicted_families", []),
        "dataset_receipt": receipt,
        "research_only": True,
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return {**body, "decision_id": sha256(canonical.encode("utf-8")).hexdigest()}
