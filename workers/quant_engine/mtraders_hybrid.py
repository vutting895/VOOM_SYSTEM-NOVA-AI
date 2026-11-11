"""Regime-aware, fail-closed Hybrid selector for NOVA MTRADERS strategies."""
from __future__ import annotations

from collections.abc import Mapping
from math import isfinite
import re
from typing import Any

from .mtraders_native import _bars, _atr, evaluate_all_mtraders_modules

REGIME_STRATEGIES = {
    "TREND": (0, 2, 4, 5, 6, 7, 8, 14, 15, 21, 27),
    "RANGE": (9, 10, 12, 17, 19, 20, 25, 29),
    "BREAKOUT": (1, 3, 13, 16, 18, 22, 23, 24, 26, 28),
    "HIGH_VOLATILITY": (0, 8, 14, 18, 20, 23, 24, 25, 29),
    "MIXED": tuple(range(30)),
}
MODEL_WEIGHTS = {"wave3": 0.15, "xgboost": 0.15, "lstm": 0.15, "smc": 0.20}
STRATEGY_FAMILY_NAMES = (
    "TREND", "MOMENTUM", "BREAKOUT", "VOLATILITY",
    "LIQUIDITY", "FLOW_VOLUME", "SESSION", "REVERSAL",
)
STRATEGY_FAMILY_BY_ID = {
    **{sid: 0 for sid in (0, 2, 4, 5, 8, 15, 27)},
    **{sid: 1 for sid in (3, 6, 7, 21)},
    **{sid: 2 for sid in (1, 12, 14, 22, 26)},
    **{sid: 3 for sid in (16, 24, 28)},
    **{sid: 4 for sid in (18, 20, 23, 29)},
    **{sid: 5 for sid in (9, 10, 17, 19)},
    **{sid: 6 for sid in (11, 13)},
    25: 7,
}


def detect_market_regime(candles: Any) -> dict[str, Any]:
    b = _bars(candles)
    if len(b) < 55:
        return {"regime": "INSUFFICIENT_DATA", "bars": len(b)}
    c = [x["close"] for x in b]
    a14, a50 = _atr(b, 14)[-1], _atr(b, 50)[-1]
    path = sum(abs(c[i] - c[i - 1]) for i in range(len(c) - 20, len(c)))
    efficiency = abs(c[-1] - c[-21]) / path if path else 0.0
    vol = a14 / c[-1]
    expansion = a14 / max(a50, 1e-12)
    regime = "HIGH_VOLATILITY" if vol >= 0.012 else "TREND" if efficiency >= 0.42 and expansion < 1.55 else "BREAKOUT" if expansion >= 1.35 and efficiency >= 0.22 else "RANGE" if efficiency <= 0.25 else "MIXED"
    return {"regime": regime, "bars": len(b), "efficiency_ratio_20": round(efficiency, 6),
            "atr14_over_price": round(vol, 6), "atr14_over_atr50": round(expansion, 6),
            "method": "deterministic_ohlcv_heuristic_v1"}


def _receipt(data: Mapping[str, Any]) -> dict[str, str] | None:
    value = data.get("quality_receipt")
    if not isinstance(value, Mapping) or value.get("status") != "PASS":
        return None
    dataset_id, report_id, digest = value.get("dataset_id"), value.get("quality_report_id"), value.get("dataset_sha256")
    if not isinstance(dataset_id, str) or not dataset_id.strip() or len(dataset_id) > 128:
        return None
    if not isinstance(report_id, str) or not report_id.strip() or len(report_id) > 128:
        return None
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        return None
    return {"status": "PASS", "dataset_id": dataset_id, "quality_report_id": report_id, "dataset_sha256": digest}


def evaluate_hybrid_strategy(market_data: Mapping[str, Any], *, model_votes: Mapping[str, Any] | None = None,
                             performance_weights: Mapping[str, Any] | None = None,
                             minimum_strategy_score: float = 0.20, consensus_threshold: float = 0.22,
                             minimum_strategy_votes: int = 2) -> dict[str, Any]:
    if not isinstance(market_data, Mapping):
        raise ValueError("market_data must be a mapping")
    for name, x in (("minimum_strategy_score", minimum_strategy_score), ("consensus_threshold", consensus_threshold)):
        if isinstance(x, bool) or not isinstance(x, (int, float)) or not isfinite(float(x)) or not 0 <= x <= 1:
            raise ValueError(f"{name} must be finite and in [0, 1]")
    if isinstance(minimum_strategy_votes, bool) or not isinstance(minimum_strategy_votes, int) or not 1 <= minimum_strategy_votes <= len(STRATEGY_FAMILY_NAMES):
        raise ValueError("minimum_strategy_votes must be 1..8 independent families")
    if performance_weights is not None:
        if not isinstance(performance_weights, Mapping):
            raise ValueError("performance_weights must be a mapping")
        for key, factor in performance_weights.items():
            if not isinstance(key, str) or not key.isdigit() or str(int(key)) != key or not 0 <= int(key) < 30:
                raise ValueError(f"invalid strategy id in performance_weights: {key!r}")
            if isinstance(factor, bool) or not isinstance(factor, (int, float)) or not isfinite(float(factor)) or not 0.75 <= factor <= 1.25:
                raise ValueError(f"validation weight for strategy {key} must be in [0.75, 1.25]")
    b = _bars(market_data.get("candles"))
    modules = evaluate_all_mtraders_modules({"candles": b})
    regime = detect_market_regime(b)
    receipt = _receipt(market_data)
    base = {"ok": True, "strategy": "MTRADERS_HYBRID", "version": "1.0.0-research",
            "regime": regime, "module_count": 30, "evaluated_module_count": 30, "module_results": modules,
            "orders_submitted": False, "execution_enabled": False, "live_trading_enabled": False}
    if receipt is None:
        return {**base, "decision": "DATA_QUALITY_BLOCKED", "signal": None, "reason": "server_attached_dataset_quality_receipt_required",
                "dataset_receipt": None, "selected_modules": [], "selected_families": [], "model_votes_used": [], "ensemble_score": 0.0}
    if regime["regime"] == "INSUFFICIENT_DATA":
        return {**base, "decision": "INSUFFICIENT_DATA", "signal": None, "reason": "at_least_55_completed_bars_required",
                "dataset_receipt": receipt, "selected_modules": [], "selected_families": [], "model_votes_used": [], "ensemble_score": 0.0}
    eligible_ids = REGIME_STRATEGIES[regime["regime"]]
    selected = [x for x in modules if x["strategy_id"] in eligible_ids and x["signal"] and abs(x["score"]) >= minimum_strategy_score]
    votes = []
    by_family: dict[int, dict[str, list[dict[str, Any]]]] = {}
    for x in selected:
        sid = x["strategy_id"]
        weight = max(0.25, abs(x["score"]))
        if performance_weights is not None:
            weight *= performance_weights.get(str(sid), 1.0)
        family_id = STRATEGY_FAMILY_BY_ID[sid]
        family_bucket = by_family.setdefault(family_id, {"long": [], "short": []})
        direction_key = "long" if x["signal"] > 0 else "short"
        vote = {"strategy_id": sid, "name": x["name"], "direction": x["signal"],
                "score": x["score"], "weight": round(weight, 6), "reason": x["reason"],
                "family": STRATEGY_FAMILY_NAMES[family_id]}
        votes.append(vote)
        family_bucket[direction_key].append(vote)

    family_votes = []
    conflicted_families = []
    for family_id, bucket in sorted(by_family.items()):
        longs, shorts = bucket["long"], bucket["short"]
        # A family with internal disagreement contributes no independent vote.
        if longs and shorts:
            conflicted_families.append(STRATEGY_FAMILY_NAMES[family_id])
            continue
        candidates = longs or shorts
        if not candidates:
            continue
        strongest = max(candidates, key=lambda item: (item["weight"], -item["strategy_id"]))
        family_votes.append({
            "family": STRATEGY_FAMILY_NAMES[family_id],
            "family_id": family_id,
            "direction": strongest["direction"],
            "score": strongest["score"],
            "weight": strongest["weight"],
            "selected_strategy_id": strongest["strategy_id"],
            "supporting_module_ids": [item["strategy_id"] for item in candidates],
        })

    long = sum(item["weight"] for item in family_votes if item["direction"] > 0)
    short = sum(item["weight"] for item in family_votes if item["direction"] < 0)
    total = long + short
    strategy_score = (long - short) / total if total else 0.0
    if model_votes is not None and not isinstance(model_votes, Mapping):
        raise ValueError("model_votes must be a mapping")
    model_total = model_weight = 0.0
    model_used = []
    for source, item in (model_votes or {}).items():
        if source not in MODEL_WEIGHTS or not isinstance(item, Mapping):
            raise ValueError(f"unsupported model vote: {source}")
        direction, score = item.get("direction"), item.get("score")
        if isinstance(direction, bool) or not isinstance(direction, int) or direction not in (-1, 0, 1):
            raise ValueError(f"{source} direction must be -1, 0, or 1")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not isfinite(float(score)) or not -1 <= score <= 1:
            raise ValueError(f"{source} score must be finite and in [-1, 1]")
        if (direction == 0 and score != 0) or (direction != 0 and (score == 0 or score * direction < 0)):
            raise ValueError(f"{source} score conflicts with direction")
        if direction:
            model_total += score * MODEL_WEIGHTS[source]
            model_weight += MODEL_WEIGHTS[source]
            model_used.append({"source": source, "direction": direction, "score": score, "weight": MODEL_WEIGHTS[source]})
    # Missing model families contribute zero weight rather than letting one available model
    # occupy the entire model sleeve. Total configured model weight is 0.65.
    model_score = model_total / sum(MODEL_WEIGHTS.values()) if model_weight else 0.0
    ensemble = 0.8 * strategy_score + 0.2 * model_score if model_weight and votes else strategy_score
    conflict = min(long, short) / max(long + short, 1e-12)
    direction = 1 if ensemble >= consensus_threshold else -1 if ensemble <= -consensus_threshold else 0
    reason = "regime_compatible_strategy_consensus"
    if len(family_votes) < minimum_strategy_votes:
        direction, reason = 0, "insufficient_independent_strategy_families"
    elif conflict >= 0.45:
        direction, reason = 0, "material_strategy_conflict"
    elif not direction:
        reason = "consensus_below_threshold"
    return {**base, "dataset_receipt": receipt, "eligible_module_ids": list(eligible_ids),
            "selected_modules": votes, "selected_families": family_votes, "conflicted_families": conflicted_families,
            "module_vote_count": len(votes), "strategy_vote_count": len(family_votes), "strategy_score": round(strategy_score, 6),
            "model_votes_used": model_used, "model_score": round(model_score, 6), "ensemble_score": round(ensemble, 6),
            "opposing_weight_share": round(conflict, 6), "signal": direction or None,
            "decision": "LONG_CANDIDATE" if direction > 0 else "SHORT_CANDIDATE" if direction < 0 else "NO_TRADE",
            "reason": reason, "research_only": True}
