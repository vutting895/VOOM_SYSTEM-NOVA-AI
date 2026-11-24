"""Fail-closed, research-only Meta Decision Layer for heterogeneous model votes.

This module combines already-computed model outputs. It does not train models,
fetch market data, calibrate models, or submit broker orders. Calibration and
out-of-fold prediction history must be attached by a trusted evaluation service.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
import math
import re
from typing import Any

from .nova_ea_v182_strategy import STRATEGY_FAMILIES

MODEL_WEIGHTS = {"lstm": 0.20, "deep_learning": 0.20, "xgboost": 0.20, "vision": 0.20, "neural_network": 0.20}
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MIN_OOS_SAMPLES = 30
REDUNDANCY_CORRELATION = 0.90


class MetaDecisionInputError(ValueError):
    """Raised when model evidence or market context is invalid."""


def _finite_number(value: Any, label: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise MetaDecisionInputError(f"{label} must be numeric")
    result = float(value)
    if not math.isfinite(result) or not low <= result <= high:
        raise MetaDecisionInputError(f"{label} must be finite and in [{low}, {high}]")
    return result


def _correlation(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or len(left) < MIN_OOS_SAMPLES:
        raise MetaDecisionInputError("prediction histories must be aligned and contain at least 30 OOS observations")
    x = [_finite_number(v, "prediction_history", -1.0, 1.0) for v in left]
    y = [_finite_number(v, "prediction_history", -1.0, 1.0) for v in right]
    mx, my = sum(x) / len(x), sum(y) / len(y)
    dx, dy = [v - mx for v in x], [v - my for v in y]
    denom = math.sqrt(sum(v * v for v in dx) * sum(v * v for v in dy))
    if denom <= 1e-15:
        # Constant outputs are not evidence of independence.
        return 1.0
    return sum(a * b for a, b in zip(dx, dy)) / denom


def _validate_vote(name: str, vote: Any) -> dict[str, Any]:
    if name not in MODEL_WEIGHTS or not isinstance(vote, Mapping):
        raise MetaDecisionInputError(f"unsupported model vote: {name}")
    direction = vote.get("direction")
    if isinstance(direction, bool) or not isinstance(direction, int) or direction not in (-1, 0, 1):
        raise MetaDecisionInputError(f"{name}.direction must be -1, 0, or 1")
    score = _finite_number(vote.get("score"), f"{name}.score", 0.0, 1.0)
    reliability = _finite_number(vote.get("calibrated_reliability"), f"{name}.calibrated_reliability", 0.0, 1.0)
    calibration = vote.get("calibration")
    if not isinstance(calibration, Mapping):
        raise MetaDecisionInputError(f"{name} requires trusted calibration evidence")
    if calibration.get("status") != "PASS" or calibration.get("method") != "walk_forward_oos":
        raise MetaDecisionInputError(f"{name} calibration is not approved walk-forward OOS evidence")
    count = calibration.get("oos_samples")
    if isinstance(count, bool) or not isinstance(count, int) or count < MIN_OOS_SAMPLES:
        raise MetaDecisionInputError(f"{name} requires at least 30 OOS calibration samples")
    if not isinstance(calibration.get("dataset_sha256"), str) or not SHA256.fullmatch(calibration["dataset_sha256"]):
        raise MetaDecisionInputError(f"{name} calibration dataset SHA-256 is invalid")
    if not isinstance(calibration.get("evaluator_version"), str) or not calibration["evaluator_version"].strip():
        raise MetaDecisionInputError(f"{name} evaluator_version is required")
    if direction == 0 and score != 0:
        raise MetaDecisionInputError(f"{name} neutral vote must have score 0")
    if direction != 0 and score <= 0:
        raise MetaDecisionInputError(f"{name} directional vote must have score above 0")
    return {"direction": int(direction), "score": score, "reliability": reliability}


def _clusters(names: list[str], histories: Mapping[str, Sequence[float]], threshold: float) -> tuple[list[list[str]], dict[str, float]]:
    parent = {name: name for name in names}

    def find(item: str) -> str:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    correlations: dict[str, float] = {}
    for i, left in enumerate(names):
        for right in names[i + 1:]:
            corr = _correlation(histories[left], histories[right])
            correlations[f"{left}:{right}"] = round(corr, 6)
            if abs(corr) >= threshold:
                a, b = find(left), find(right)
                if a != b:
                    parent[b] = a
    grouped: dict[str, list[str]] = {}
    for name in names:
        grouped.setdefault(find(name), []).append(name)
    return list(grouped.values()), correlations


def evaluate_meta_decision(
    *,
    model_votes: Mapping[str, Any],
    prediction_history: Mapping[str, Sequence[float]],
    premium_discount: Mapping[str, Any],
    minimum_independent_clusters: int = 2,
    consensus_threshold: float = 0.60,
    max_conflict_ratio: float = 0.25,
    redundancy_correlation: float = REDUNDANCY_CORRELATION,
) -> dict[str, Any]:
    """Return a research candidate or abstain; never return an executable order."""
    if not isinstance(model_votes, Mapping) or not isinstance(prediction_history, Mapping):
        raise MetaDecisionInputError("model_votes and prediction_history must be objects")
    if not isinstance(premium_discount, Mapping):
        raise MetaDecisionInputError("premium_discount context is required")
    if isinstance(minimum_independent_clusters, bool) or not isinstance(minimum_independent_clusters, int) or not 2 <= minimum_independent_clusters <= 5:
        raise MetaDecisionInputError("minimum_independent_clusters must be an integer from 2 through 5")
    consensus_threshold = _finite_number(consensus_threshold, "consensus_threshold", 0.5, 1.0)
    max_conflict_ratio = _finite_number(max_conflict_ratio, "max_conflict_ratio", 0.0, 0.5)
    redundancy_correlation = _finite_number(redundancy_correlation, "redundancy_correlation", 0.5, 1.0)

    votes = {name: _validate_vote(name, vote) for name, vote in model_votes.items()}
    if not votes:
        raise MetaDecisionInputError("at least one model vote is required")
    histories: dict[str, Sequence[float]] = {}
    for name in votes:
        history = prediction_history.get(name)
        if not isinstance(history, Sequence) or isinstance(history, (str, bytes)) or len(history) < MIN_OOS_SAMPLES:
            raise MetaDecisionInputError(f"{name} requires aligned out-of-fold prediction history")
        histories[name] = history
    if set(prediction_history) != set(votes):
        raise MetaDecisionInputError("prediction_history must contain exactly the models that voted")

    clusters, correlations = _clusters(list(votes), histories, redundancy_correlation)
    cluster_rows = []
    for members in clusters:
        active = [name for name in members if votes[name]["direction"] != 0]
        if not active:
            continue
        raw_weights = {name: MODEL_WEIGHTS[name] * votes[name]["reliability"] for name in active}
        total = sum(raw_weights.values())
        if total <= 0:
            continue
        signed = sum(votes[name]["direction"] * votes[name]["score"] * raw_weights[name] for name in active) / total
        # A correlated cluster contributes no more than one model's base weight.
        cluster_weight = max(MODEL_WEIGHTS[name] * votes[name]["reliability"] for name in active)
        cluster_rows.append({"members": members, "signed_score": signed, "weight": cluster_weight})

    if len(cluster_rows) < minimum_independent_clusters:
        decision, reason = "NO_TRADE", "INSUFFICIENT_INDEPENDENT_MODEL_CLUSTERS"
        net_score, conflict_ratio = 0.0, 1.0
    else:
        positive = sum(row["weight"] * max(row["signed_score"], 0.0) for row in cluster_rows)
        negative = sum(row["weight"] * max(-row["signed_score"], 0.0) for row in cluster_rows)
        total = positive + negative
        conflict_ratio = min(positive, negative) / total if total else 1.0
        net_score = (positive - negative) / total if total else 0.0
        direction = 1 if net_score > 0 else -1 if net_score < 0 else 0
        pd_zone = premium_discount.get("zone")
        if pd_zone not in ("PREMIUM", "DISCOUNT", "EQUILIBRIUM"):
            raise MetaDecisionInputError("premium_discount.zone must be PREMIUM, DISCOUNT, or EQUILIBRIUM")
        zone_conflict = (direction > 0 and pd_zone == "PREMIUM") or (direction < 0 and pd_zone == "DISCOUNT")
        if total <= 0:
            decision, reason = "NO_TRADE", "NO_CALIBRATED_DIRECTIONAL_EVIDENCE"
        elif zone_conflict:
            decision, reason = "NO_TRADE", "PREMIUM_DISCOUNT_CONTEXT_CONFLICT"
        elif conflict_ratio > max_conflict_ratio:
            decision, reason = "NO_TRADE", "MODEL_CONFLICT_EXCEEDS_LIMIT"
        elif abs(net_score) < consensus_threshold:
            decision, reason = "NO_TRADE", "CONSENSUS_BELOW_THRESHOLD"
        else:
            decision, reason = "RESEARCH_CANDIDATE", "CONSENSUS_AND_CONTEXT_ALIGNED"

    return {
        "schema_version": "nova.meta-decision.v1",
        "decision": decision,
        "reason": reason,
        "direction": (1 if net_score > 0 else -1 if net_score < 0 else 0) if decision == "RESEARCH_CANDIDATE" else None,
        "consensus_strength": round(abs(net_score), 6),
        "conflict_ratio": round(conflict_ratio, 6),
        "independent_cluster_count": len(cluster_rows),
        "clusters": cluster_rows,
        "pairwise_prediction_correlations": correlations,
        "premium_discount_zone": premium_discount.get("zone"),
        "research_only": True,
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }


def _aware_datetime(value: Any, label: str) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        raw = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise MetaDecisionInputError(f"{label} must be an ISO timestamp") from exc
    else:
        raise MetaDecisionInputError(f"{label} must be an ISO timestamp")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise MetaDecisionInputError(f"{label} must include a timezone")
    return parsed


def evaluate_ea_strategy_consensus(
    *,
    strategy_candidates: Sequence[Mapping[str, Any]],
    symbol: str,
    timeframe: str,
    current_time: str | datetime,
    premium_discount: Mapping[str, Any],
    minimum_independent_families: int = 2,
    max_conflict_ratio: float = 0.25,
    max_signal_age_seconds: int = 3600,
) -> dict[str, Any]:
    """Arbitrate active EA v1.82 module candidates by independent strategy family.

    This is a research-only gate. It deliberately does not infer probability from
    RR, does not combine entry/stop prices from different modules, and does not
    submit or authorize broker orders.
    """
    if not isinstance(strategy_candidates, Sequence) or isinstance(strategy_candidates, (str, bytes)):
        raise MetaDecisionInputError("strategy_candidates must be a sequence")
    if not isinstance(symbol, str) or not symbol.strip():
        raise MetaDecisionInputError("symbol is required")
    if not isinstance(timeframe, str) or not timeframe.strip():
        raise MetaDecisionInputError("timeframe is required")
    if not isinstance(premium_discount, Mapping):
        raise MetaDecisionInputError("premium_discount context is required")
    zone = premium_discount.get("zone")
    if zone not in ("PREMIUM", "DISCOUNT", "EQUILIBRIUM"):
        raise MetaDecisionInputError("premium_discount.zone must be PREMIUM, DISCOUNT, or EQUILIBRIUM")
    if isinstance(minimum_independent_families, bool) or not isinstance(minimum_independent_families, int) or not 2 <= minimum_independent_families <= len(set(STRATEGY_FAMILIES.values())):
        raise MetaDecisionInputError("minimum_independent_families is outside the supported range")
    max_conflict_ratio = _finite_number(max_conflict_ratio, "max_conflict_ratio", 0.0, 0.5)
    if isinstance(max_signal_age_seconds, bool) or not isinstance(max_signal_age_seconds, int) or not 1 <= max_signal_age_seconds <= 86400:
        raise MetaDecisionInputError("max_signal_age_seconds must be an integer from 1 through 86400")

    now = _aware_datetime(current_time, "current_time")
    grouped: dict[str, list[dict[str, Any]]] = {}
    stale_count = 0
    candidate_count = 0
    for index, candidate in enumerate(strategy_candidates):
        if not isinstance(candidate, Mapping):
            raise MetaDecisionInputError(f"strategy_candidates[{index}] must be an object")
        if candidate.get("status") != "RESEARCH_CANDIDATE":
            continue
        candidate_count += 1
        source = candidate.get("source")
        version = candidate.get("source_ea_version")
        if source != "NOVA_EA_v1.82" or version != "1.82":
            raise MetaDecisionInputError(f"strategy_candidates[{index}] is not source-grounded EA v1.82 evidence")
        strategy_id = candidate.get("strategy_id")
        if isinstance(strategy_id, bool) or not isinstance(strategy_id, int) or strategy_id not in STRATEGY_FAMILIES:
            raise MetaDecisionInputError(f"strategy_candidates[{index}] has no active implemented EA v1.82 strategy ID")
        family = STRATEGY_FAMILIES[strategy_id]
        if candidate.get("strategy_family") != family:
            raise MetaDecisionInputError(f"strategy_candidates[{index}] family does not match its EA module ID")
        if candidate.get("symbol") != symbol or candidate.get("timeframe") != timeframe.upper():
            raise MetaDecisionInputError(f"strategy_candidates[{index}] symbol/timeframe does not match the arbitration context")

        direction = candidate.get("direction")
        if isinstance(direction, bool) or not isinstance(direction, int) or direction not in (-1, 1):
            raise MetaDecisionInputError(f"strategy_candidates[{index}].direction must be -1 or 1")
        signal_time = _aware_datetime(candidate.get("signal_time"), f"strategy_candidates[{index}].signal_time")
        age = (now - signal_time).total_seconds()
        if age < 0:
            raise MetaDecisionInputError(f"strategy_candidates[{index}] signal_time is in the future")
        if age > max_signal_age_seconds:
            stale_count += 1
            continue

        entry = _finite_number(candidate.get("entry_reference"), f"strategy_candidates[{index}].entry_reference", 1e-12, 1e15)
        stop = _finite_number(candidate.get("stop_reference"), f"strategy_candidates[{index}].stop_reference", 1e-12, 1e15)
        target = _finite_number(candidate.get("target_reference"), f"strategy_candidates[{index}].target_reference", 1e-12, 1e15)
        risk = direction * (entry - stop)
        reward = direction * (target - entry)
        if risk <= 0 or reward <= 0:
            raise MetaDecisionInputError(f"strategy_candidates[{index}] has invalid entry/stop/target geometry")
        calculated_rr = reward / risk
        declared_rr = _finite_number(candidate.get("rr"), f"strategy_candidates[{index}].rr", 0.1, 10.0)
        if abs(calculated_rr - declared_rr) > max(0.02, declared_rr * 0.02):
            raise MetaDecisionInputError(f"strategy_candidates[{index}] declared RR does not match its price geometry")

        grouped.setdefault(family, []).append({
            "strategy_id": strategy_id,
            "name": candidate.get("name", f"EA_v1.82_{strategy_id}"),
            "direction": direction,
            "entry_reference": entry,
            "stop_reference": stop,
            "target_reference": target,
            "rr": round(calculated_rr, 6),
            "signal_time": signal_time.isoformat(),
            "age_seconds": round(age, 3),
        })

    family_rows = []
    family_conflicts = []
    for family, rows in sorted(grouped.items()):
        directions = {row["direction"] for row in rows}
        if len(directions) != 1:
            family_conflicts.append(family)
            continue
        family_rows.append({
            "family": family,
            "direction": rows[0]["direction"],
            "module_ids": sorted({row["strategy_id"] for row in rows}),
            "candidate_count": len(rows),
            "candidates": rows,
        })

    long_families = sum(row["direction"] > 0 for row in family_rows)
    short_families = sum(row["direction"] < 0 for row in family_rows)
    directional_families = long_families + short_families
    conflict_ratio = min(long_families, short_families) / directional_families if directional_families else 1.0
    direction = 1 if long_families > short_families else -1 if short_families > long_families else 0

    if family_conflicts:
        decision, reason = "NO_TRADE", "INTRA_FAMILY_STRATEGY_CONFLICT"
    elif candidate_count == 0:
        decision, reason = "NO_TRADE", "NO_EA_STRATEGY_CANDIDATES"
    elif directional_families == 0 and stale_count:
        decision, reason = "NO_TRADE", "ALL_EA_CANDIDATES_STALE"
    elif directional_families < minimum_independent_families:
        decision, reason = "NO_TRADE", "INSUFFICIENT_INDEPENDENT_STRATEGY_FAMILIES"
    elif conflict_ratio > max_conflict_ratio:
        decision, reason = "NO_TRADE", "STRATEGY_CONFLICT_EXCEEDS_LIMIT"
    elif direction > 0 and zone == "PREMIUM" or direction < 0 and zone == "DISCOUNT":
        decision, reason = "NO_TRADE", "PREMIUM_DISCOUNT_CONTEXT_CONFLICT"
    elif direction == 0:
        decision, reason = "NO_TRADE", "NO_DIRECTIONAL_STRATEGY_CONSENSUS"
    else:
        decision, reason = "STRATEGY_CANDIDATE", "INDEPENDENT_EA_STRATEGY_FAMILIES_ALIGNED"

    return {
        "schema_version": "nova.ea-strategy-consensus.v1",
        "decision": decision,
        "reason": reason,
        "direction": direction if decision == "STRATEGY_CANDIDATE" else None,
        "symbol": symbol,
        "timeframe": timeframe.upper(),
        "premium_discount_zone": zone,
        "candidate_count": candidate_count,
        "fresh_candidate_count": sum(len(rows) for rows in grouped.values()),
        "stale_candidate_count": stale_count,
        "independent_family_count": directional_families,
        "long_family_count": long_families,
        "short_family_count": short_families,
        "family_conflict_count": len(family_conflicts),
        "family_conflicts": family_conflicts,
        "conflict_ratio": round(conflict_ratio, 6),
        "families": family_rows,
        "research_only": True,
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
        "risk_governor_required": True,
    }


def evaluate_hybrid_meta_decision(
    *,
    model_votes: Mapping[str, Any],
    prediction_history: Mapping[str, Sequence[float]],
    strategy_candidates: Sequence[Mapping[str, Any]],
    symbol: str,
    timeframe: str,
    current_time: str | datetime,
    premium_discount: Mapping[str, Any],
    minimum_independent_families: int = 2,
    minimum_independent_clusters: int = 2,
    consensus_threshold: float = 0.60,
    max_conflict_ratio: float = 0.25,
    max_signal_age_seconds: int = 3600,
    redundancy_correlation: float = REDUNDANCY_CORRELATION,
) -> dict[str, Any]:
    """Require both EA strategy-family consensus and calibrated ML consensus."""
    strategy = evaluate_ea_strategy_consensus(
        strategy_candidates=strategy_candidates,
        symbol=symbol,
        timeframe=timeframe,
        current_time=current_time,
        premium_discount=premium_discount,
        minimum_independent_families=minimum_independent_families,
        max_conflict_ratio=max_conflict_ratio,
        max_signal_age_seconds=max_signal_age_seconds,
    )
    if strategy["decision"] != "STRATEGY_CANDIDATE":
        return {
            "schema_version": "nova.hybrid-meta-decision.v1",
            "decision": "NO_TRADE",
            "reason": f"EA_STRATEGY_GATE_{strategy['reason']}",
            "direction": None,
            "strategy_evidence": strategy,
            "model_evidence": None,
            "research_only": True,
            "orders_submitted": False,
            "execution_enabled": False,
            "live_trading_enabled": False,
            "risk_governor_required": True,
        }

    model = evaluate_meta_decision(
        model_votes=model_votes,
        prediction_history=prediction_history,
        premium_discount=premium_discount,
        minimum_independent_clusters=minimum_independent_clusters,
        consensus_threshold=consensus_threshold,
        max_conflict_ratio=max_conflict_ratio,
        redundancy_correlation=redundancy_correlation,
    )
    if model["decision"] != "RESEARCH_CANDIDATE":
        decision, reason, direction = "NO_TRADE", f"MODEL_GATE_{model['reason']}", None
    elif model["direction"] != strategy["direction"]:
        decision, reason, direction = "NO_TRADE", "MODEL_STRATEGY_DIRECTION_CONFLICT", None
    else:
        decision, reason, direction = "RESEARCH_CANDIDATE", "EA_STRATEGY_AND_CALIBRATED_MODEL_CONSENSUS_ALIGNED", strategy["direction"]

    return {
        "schema_version": "nova.hybrid-meta-decision.v1",
        "decision": decision,
        "reason": reason,
        "direction": direction,
        "symbol": symbol,
        "timeframe": timeframe.upper(),
        "premium_discount_zone": premium_discount.get("zone"),
        "strategy_evidence": strategy,
        "model_evidence": model,
        "research_only": True,
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
        "risk_governor_required": True,
    }
