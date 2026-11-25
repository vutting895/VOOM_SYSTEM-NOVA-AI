"""Fail-closed Hybrid Meta Decision contract (research-only).

SMC is the deterministic setup gate. XGBoost, LSTM, Vision, Mamba and Wave
are supporting predictive models. A candidate is emitted only when all five
supporting outputs carry same-dataset, point-in-time, calibrated OOF evidence
and at least three independent model clusters agree with SMC.

This module validates evidence metadata; it does not verify artifact storage,
train models, calculate risk, or authorize broker execution. The caller must
resolve and hash-check the referenced reports before constructing evidence.
"""
from __future__ import annotations

from datetime import datetime
from math import isfinite
import re
from typing import Any

MODEL_IDS = ("smc", "xgboost", "lstm", "vision", "mamba", "wave")
SUPPORTING_MODEL_IDS = MODEL_IDS[1:]
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_DIRECTIONS = {"BUY", "SELL", "HOLD"}
_REQUIRED_CONTEXT = {
    "mode", "symbol", "decision_timestamp_utc", "dataset_sha256",
    "data_quality_status", "closed_bars_only", "age_seconds", "max_age_seconds",
}
_COMMON_EVIDENCE = {
    "model_id", "kind", "version", "status", "direction", "dataset_sha256",
    "artifact_sha256", "feature_schema_sha256", "as_of_utc",
    "valid_until_utc", "evaluation_id",
}
_PREDICTIVE_EVIDENCE = _COMMON_EVIDENCE | {
    "independent_cluster", "calibrated", "oof_verified",
    "calibration_report_sha256", "oof_report_sha256",
}
_SMC_EVIDENCE = _COMMON_EVIDENCE | {"causal_verified", "research_only"}


class HybridDecisionInputError(ValueError):
    """Raised when an input cannot safely participate in a research decision."""


def _utc(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise HybridDecisionInputError(f"{field}: utc_timestamp_required")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HybridDecisionInputError(f"{field}: invalid_timestamp") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None or parsed.utcoffset().total_seconds() != 0:
        raise HybridDecisionInputError(f"{field}: timestamp_must_be_utc")
    return parsed


def _sha(value: Any, field: str) -> None:
    if not isinstance(value, str) or not _SHA256.fullmatch(value):
        raise HybridDecisionInputError(f"{field}: sha256_required")


def _validate_context(context: Any) -> tuple[datetime, str]:
    if not isinstance(context, dict) or set(context) != _REQUIRED_CONTEXT:
        raise HybridDecisionInputError("context: invalid_shape")
    if context["mode"] != "research":
        raise HybridDecisionInputError("context: research_mode_only")
    if not isinstance(context["symbol"], str) or not context["symbol"].strip():
        raise HybridDecisionInputError("context: symbol_required")
    if context["data_quality_status"] != "PASS" or context["closed_bars_only"] is not True:
        raise HybridDecisionInputError("context: data_quality_or_closed_bar_gate_failed")
    age, maximum = context["age_seconds"], context["max_age_seconds"]
    if (
        isinstance(age, bool) or not isinstance(age, (int, float))
        or isinstance(maximum, bool) or not isinstance(maximum, (int, float))
        or not isfinite(float(age)) or not isfinite(float(maximum))
        or age < 0 or maximum <= 0 or age > maximum
    ):
        raise HybridDecisionInputError("context: stale_or_invalid_data_age")
    _sha(context["dataset_sha256"], "context.dataset_sha256")
    return _utc(context["decision_timestamp_utc"], "context.decision_timestamp_utc"), context["dataset_sha256"]


def _validate_evidence(
    item: Any, *, expected_id: str, dataset_sha256: str, decision_at: datetime
) -> None:
    if not isinstance(item, dict):
        raise HybridDecisionInputError(f"{expected_id}: evidence_must_be_object")
    expected = _SMC_EVIDENCE if expected_id == "smc" else _PREDICTIVE_EVIDENCE
    if set(item) != expected:
        raise HybridDecisionInputError(f"{expected_id}: invalid_evidence_shape")
    if item["model_id"] != expected_id:
        raise HybridDecisionInputError(f"{expected_id}: model_id_mismatch")
    expected_kind = "deterministic_strategy" if expected_id == "smc" else "predictive_model"
    if item["kind"] != expected_kind:
        raise HybridDecisionInputError(f"{expected_id}: invalid_kind")
    for field in ("version", "evaluation_id"):
        if not isinstance(item[field], str) or not item[field].strip():
            raise HybridDecisionInputError(f"{expected_id}: {field}_required")
    if item["status"] != "PASS":
        raise HybridDecisionInputError(f"{expected_id}: evidence_not_passed")
    if not isinstance(item["direction"], str) or item["direction"] not in _DIRECTIONS:
        raise HybridDecisionInputError(f"{expected_id}: invalid_direction")
    if item["dataset_sha256"] != dataset_sha256:
        raise HybridDecisionInputError(f"{expected_id}: dataset_hash_mismatch")
    for field in ("artifact_sha256", "feature_schema_sha256"):
        _sha(item[field], f"{expected_id}.{field}")
    as_of = _utc(item["as_of_utc"], f"{expected_id}.as_of_utc")
    valid_until = _utc(item["valid_until_utc"], f"{expected_id}.valid_until_utc")
    if as_of > decision_at:
        raise HybridDecisionInputError(f"{expected_id}: future_evidence")
    if valid_until < decision_at or valid_until < as_of:
        raise HybridDecisionInputError(f"{expected_id}: expired_evidence")

    if expected_id == "smc":
        if item["causal_verified"] is not True or item["research_only"] is not True:
            raise HybridDecisionInputError("smc: causal_research_gate_failed")
    else:
        if item["calibrated"] is not True or item["oof_verified"] is not True:
            raise HybridDecisionInputError(f"{expected_id}: calibrated_oof_evidence_required")
        cluster = item["independent_cluster"]
        if not isinstance(cluster, str) or not cluster.strip():
            raise HybridDecisionInputError(f"{expected_id}: independent_cluster_required")
        _sha(item["calibration_report_sha256"], f"{expected_id}.calibration_report_sha256")
        _sha(item["oof_report_sha256"], f"{expected_id}.oof_report_sha256")


def evaluate_hybrid_decision(context: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any]:
    """Return a non-executable candidate only when the six evidence gates pass."""
    decision_at, dataset_sha256 = _validate_context(context)
    if not isinstance(evidence, list) or len(evidence) != len(MODEL_IDS):
        raise HybridDecisionInputError("evidence: exactly_six_model_records_required")
    by_id: dict[str, dict[str, Any]] = {}
    for item in evidence:
        if not isinstance(item, dict) or item.get("model_id") not in MODEL_IDS:
            raise HybridDecisionInputError("evidence: unknown_or_malformed_model")
        model_id = item["model_id"]
        if model_id in by_id:
            raise HybridDecisionInputError(f"{model_id}: duplicate_evidence")
        by_id[model_id] = item
    if set(by_id) != set(MODEL_IDS):
        raise HybridDecisionInputError("evidence: all_six_models_required")

    for model_id in MODEL_IDS:
        _validate_evidence(
            by_id[model_id], expected_id=model_id,
            dataset_sha256=dataset_sha256, decision_at=decision_at,
        )

    smc_direction = by_id["smc"]["direction"]
    votes = [
        item for model_id, item in by_id.items()
        if model_id != "smc" and item["direction"] == smc_direction and smc_direction != "HOLD"
    ]
    independent_clusters = {item["independent_cluster"] for item in votes}
    if smc_direction == "HOLD":
        decision, reason = "NO_TRADE", "smc_no_setup"
    elif len(votes) < 3:
        decision, reason = "NO_TRADE", "insufficient_model_consensus"
    elif len(independent_clusters) < 3:
        decision, reason = "NO_TRADE", "insufficient_independent_model_clusters"
    else:
        decision = "BUY_CANDIDATE" if smc_direction == "BUY" else "SELL_CANDIDATE"
        reason = "smc_and_calibrated_oof_consensus"

    return {
        "contract": "nova.hybrid-meta-decision.v1",
        "status": "RESEARCH_CANDIDATE" if decision != "NO_TRADE" else "ABSTAIN",
        "decision": decision,
        "reason_code": reason,
        "symbol": context["symbol"],
        "decision_timestamp_utc": context["decision_timestamp_utc"],
        "dataset_sha256": dataset_sha256,
        "smc_direction": smc_direction,
        "supporting_model_count": len(SUPPORTING_MODEL_IDS),
        "supporting_votes": len(votes),
        "independent_supporting_clusters": len(independent_clusters),
        "model_directions": {model_id: by_id[model_id]["direction"] for model_id in MODEL_IDS},
        "risk_budget_pct": None,
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
