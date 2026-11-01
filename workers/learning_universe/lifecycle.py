"""Fail-closed state transitions for the NOVA Auto-Learning Loop.

The lifecycle is a contract/state-machine primitive only. Trusted callers must
supply owner-scoped context and human-review identity through the NOVA Hub.
No model output can grant approval or trading authority.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from enum import Enum
import re
from typing import Any, Mapping


CONTRACT_ID = "nova.learning-cycle.v1"
_HEX_64 = re.compile(r"^[0-9a-f]{64}$")
_GIT_REVISION = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
_CYCLE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SENSITIVE_KEY_PARTS = (
    "secret",
    "token",
    "password",
    "credential",
    "broker",
    "account",
    "position",
    "order",
)

_ALLOWED_EVIDENCE_KEYS = {
    "dataset_manifest_id", "dataset_sha256", "quality_report_id", "data_quality_passed",
    "feature_contract_id", "feature_contract_version", "feature_contract_approved",
    "label_contract_id", "label_contract_version", "label_contract_approved",
    "code_revision", "evaluation_plan_id", "cost_model_id", "baseline_id",
    "purge_bars", "embargo_bars", "seed", "final_oos_reserved",
    "evaluation_report_id", "evaluation_report_sha256", "reproducibility_receipt_id",
    "out_of_sample_windows", "final_oos_untouched", "cost_sensitivity_passed",
    "baseline_comparison_passed", "risk_guardrails_passed",
    "candidate_report_id", "review_packet_sha256", "human_review_id",
    "review_rationale", "approval_scope", "shadow_plan_id",
}


class LearningLifecycleError(ValueError):
    """Raised when a learning-cycle transition violates its contract."""


class LearningState(str, Enum):
    DRAFT = "DRAFT"
    DATA_VALIDATED = "DATA_VALIDATED"
    EXPERIMENT_READY = "EXPERIMENT_READY"
    EVALUATED = "EVALUATED"
    REVIEW_PENDING = "REVIEW_PENDING"
    APPROVED_FOR_SHADOW = "APPROVED_FOR_SHADOW"
    REJECTED = "REJECTED"


_ALLOWED_TRANSITIONS = {
    LearningState.DRAFT: {LearningState.DATA_VALIDATED},
    LearningState.DATA_VALIDATED: {LearningState.EXPERIMENT_READY},
    LearningState.EXPERIMENT_READY: {LearningState.EVALUATED},
    LearningState.EVALUATED: {LearningState.REVIEW_PENDING},
    LearningState.REVIEW_PENDING: {
        LearningState.APPROVED_FOR_SHADOW,
        LearningState.REJECTED,
    },
    LearningState.APPROVED_FOR_SHADOW: set(),
    LearningState.REJECTED: set(),
}


def _nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_true(value: Any) -> bool:
    return value is True


def _is_nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and bool(_HEX_64.fullmatch(value))


def _is_git_revision(value: Any) -> bool:
    return isinstance(value, str) and bool(_GIT_REVISION.fullmatch(value))


def _is_aware_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.utcoffset() is not None


def _require_fields(evidence: Mapping[str, Any], rules: Mapping[str, Any]) -> None:
    missing = sorted(key for key in rules if key not in evidence)
    if missing:
        raise LearningLifecycleError(
            "Missing required evidence: " + ", ".join(missing)
        )

    invalid = sorted(key for key, validator in rules.items() if not validator(evidence[key]))
    if invalid:
        raise LearningLifecycleError(
            "Invalid or failed evidence: " + ", ".join(invalid)
        )


def _validate_evidence_keys(evidence: Mapping[str, Any]) -> None:
    if len(evidence) > len(_ALLOWED_EVIDENCE_KEYS):
        raise LearningLifecycleError("Evidence contains too many fields")
    for key, value in evidence.items():
        if not isinstance(key, str) or not key.strip():
            raise LearningLifecycleError("Evidence keys must be non-empty strings")
        normalized = key.lower()
        if any(part in normalized for part in _SENSITIVE_KEY_PARTS):
            raise LearningLifecycleError(
                "Sensitive broker, account, credential, or execution fields are not allowed"
            )
        if key not in _ALLOWED_EVIDENCE_KEYS:
            raise LearningLifecycleError("Unexpected evidence field: " + key)
        if isinstance(value, str):
            if not value.strip() or len(value) > 1024:
                raise LearningLifecycleError("Evidence strings must be non-empty and at most 1024 characters")
        elif isinstance(value, bool):
            continue
        elif isinstance(value, int):
            if abs(value) > 1_000_000_000:
                raise LearningLifecycleError("Evidence integer is outside the supported range")
        else:
            raise LearningLifecycleError("Evidence values must be bounded strings, integers, or booleans")


def _parse_state(value: Any) -> LearningState:
    try:
        return LearningState(value)
    except (TypeError, ValueError) as exc:
        raise LearningLifecycleError("Unknown lifecycle state") from exc


def create_cycle(cycle_id: str, occurred_at: str) -> dict[str, Any]:
    """Create a new DRAFT cycle with an auditable initial event."""
    if not isinstance(cycle_id, str) or not _CYCLE_ID.fullmatch(cycle_id):
        raise LearningLifecycleError("cycle_id is invalid")
    if not _is_aware_timestamp(occurred_at):
        raise LearningLifecycleError("occurred_at must be an ISO-8601 timestamp with timezone")

    return {
        "contract": CONTRACT_ID,
        "cycle_id": cycle_id,
        "state": LearningState.DRAFT.value,
        "revision": 1,
        "evidence": {},
        "history": [
            {
                "from": None,
                "to": LearningState.DRAFT.value,
                "actor_type": "system",
                "actor_id": "learning-universe",
                "occurred_at": occurred_at,
            }
        ],
        "research_only": True,
        "trade_authorized": False,
        "order_submission_enabled": False,
        "live_trading_enabled": False,
    }


def transition_cycle(
    cycle: Mapping[str, Any],
    target_state: str | LearningState,
    evidence: Mapping[str, Any],
    *,
    actor_type: str,
    actor_id: str,
    occurred_at: str,
) -> dict[str, Any]:
    """Return a new cycle revision after validating all required gate evidence.

    Approval and rejection require a human reviewer. The only approval scope
    accepted is paper/shadow research; there is deliberately no production or
    trading-enabled state in this contract.
    """
    if not isinstance(cycle, Mapping) or cycle.get("contract") != CONTRACT_ID:
        raise LearningLifecycleError("Unsupported learning-cycle contract")
    if not isinstance(cycle.get("cycle_id"), str) or not _CYCLE_ID.fullmatch(cycle["cycle_id"]):
        raise LearningLifecycleError("cycle_id is invalid")
    if not _is_positive_int(cycle.get("revision")):
        raise LearningLifecycleError("cycle revision must be a positive integer")
    if cycle.get("research_only") is not True:
        raise LearningLifecycleError("Research-only invariant is missing")
    for safety_flag in ("trade_authorized", "order_submission_enabled", "live_trading_enabled"):
        if cycle.get(safety_flag) is not False:
            raise LearningLifecycleError("Execution safety invariant is not disabled")
    if not isinstance(cycle.get("history"), list) or len(cycle["history"]) > 1000:
        raise LearningLifecycleError("Cycle history must be a bounded list")
    if not isinstance(cycle.get("evidence"), Mapping):
        raise LearningLifecycleError("Existing cycle evidence must be a mapping")
    current = _parse_state(cycle.get("state"))
    target = _parse_state(target_state.value if isinstance(target_state, LearningState) else target_state)

    if target not in _ALLOWED_TRANSITIONS[current]:
        raise LearningLifecycleError(
            f"Transition not allowed: {current.value} -> {target.value}"
        )
    if not isinstance(actor_type, str) or actor_type not in {"system", "service", "human"}:
        raise LearningLifecycleError("actor_type must be system, service, or human")
    if not _nonempty_string(actor_id) or len(actor_id) > 128:
        raise LearningLifecycleError("actor_id is required and must be at most 128 characters")
    if not _is_aware_timestamp(occurred_at):
        raise LearningLifecycleError("occurred_at must be an ISO-8601 timestamp with timezone")
    if not isinstance(evidence, Mapping):
        raise LearningLifecycleError("evidence must be a mapping")

    incoming = dict(evidence)
    _validate_evidence_keys(incoming)
    merged_evidence = dict(cycle["evidence"])
    merged_evidence.update(incoming)
    _validate_evidence_keys(merged_evidence)

    gates = {
        LearningState.DATA_VALIDATED: {
            "dataset_manifest_id": _nonempty_string,
            "dataset_sha256": _is_sha256,
            "quality_report_id": _nonempty_string,
            "data_quality_passed": _is_true,
        },
        LearningState.EXPERIMENT_READY: {
            "feature_contract_id": _nonempty_string,
            "feature_contract_version": _nonempty_string,
            "feature_contract_approved": _is_true,
            "label_contract_id": _nonempty_string,
            "label_contract_version": _nonempty_string,
            "label_contract_approved": _is_true,
            "code_revision": _is_git_revision,
            "evaluation_plan_id": _nonempty_string,
            "cost_model_id": _nonempty_string,
            "baseline_id": _nonempty_string,
            "purge_bars": _is_nonnegative_int,
            "embargo_bars": _is_nonnegative_int,
            "seed": _is_nonnegative_int,
            "final_oos_reserved": _is_true,
        },
        LearningState.EVALUATED: {
            "evaluation_report_id": _nonempty_string,
            "evaluation_report_sha256": _is_sha256,
            "reproducibility_receipt_id": _nonempty_string,
            "out_of_sample_windows": _is_positive_int,
            "final_oos_untouched": _is_true,
            "cost_sensitivity_passed": _is_true,
            "baseline_comparison_passed": _is_true,
            "risk_guardrails_passed": _is_true,
        },
        LearningState.REVIEW_PENDING: {
            "candidate_report_id": _nonempty_string,
            "review_packet_sha256": _is_sha256,
        },
    }

    if target in gates:
        _require_fields(merged_evidence, gates[target])

    if target in {LearningState.APPROVED_FOR_SHADOW, LearningState.REJECTED}:
        if actor_type != "human":
            raise LearningLifecycleError("Candidate decisions require a human reviewer")
        decision_rules = {
            "human_review_id": _nonempty_string,
            "review_rationale": _nonempty_string,
        }
        if target is LearningState.APPROVED_FOR_SHADOW:
            decision_rules.update(
                {
                    "approval_scope": lambda value: value == "paper_shadow_only",
                    "shadow_plan_id": _nonempty_string,
                }
            )
        _require_fields(merged_evidence, decision_rules)

    history = list(cycle.get("history") or [])
    history.append(
        {
            "from": current.value,
            "to": target.value,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "occurred_at": occurred_at,
            "evidence_keys": sorted(incoming),
        }
    )

    updated = deepcopy(dict(cycle))
    updated.update(
        {
            "state": target.value,
            "revision": int(cycle.get("revision", 0)) + 1,
            "evidence": merged_evidence,
            "history": history,
            "research_only": True,
            "trade_authorized": False,
            "order_submission_enabled": False,
            "live_trading_enabled": False,
        }
    )
    return updated
