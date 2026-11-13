"""Independent deterministic MT5 entry-risk gate.

This adapter matches the standalone MT5 AI Trading EA's local safety ceilings:
3% broker-day loss, 2% aggregate open risk, and at most 5 open positions/orders.
It only evaluates new-entry eligibility and never changes existing positions.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from typing import Any


POLICY_VERSION = "nova-mt5-risk.ea-compatible.v1"
DAILY_LOSS_ENTRY_LOCK_PCT = 3.0
MAX_AGGREGATE_OPEN_RISK_PCT = 2.0
MAX_OPEN_ORDERS = 5
MAX_SNAPSHOT_AGE_SECONDS = 60.0
MAX_FUTURE_SKEW_SECONDS = 5.0
QUANT_ENGINE = "MT5HeuristicConsensusAdapter"


def _number(snapshot: dict[str, Any], key: str) -> float:
    value = snapshot.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError(f"invalid_risk_snapshot:{key}")
    return float(value)


def _timestamp(value: Any, key: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"invalid_risk_snapshot:{key}")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"invalid_risk_snapshot:{key}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"risk_snapshot_timezone_required:{key}")
    return parsed.astimezone(timezone.utc)


def evaluate_mt5_risk(
    event: dict[str, Any],
    quant_engine_result: dict[str, Any],
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    if not isinstance(event, dict) or event.get("schema_version") != "nova.mt5-event.v2":
        raise ValueError("unsupported_mt5_event_contract")
    if (
        not isinstance(quant_engine_result, dict)
        or quant_engine_result.get("engine") != QUANT_ENGINE
        or quant_engine_result.get("evaluation_status") != "research_only"
        or quant_engine_result.get("execution_enabled") is not False
        or quant_engine_result.get("event_id") != event.get("event_id")
        or quant_engine_result.get("module_count") != 30
    ):
        raise ValueError("verified_mt5_heuristic_result_required")

    snapshot = event.get("risk_snapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("risk_snapshot_required")

    day_start_equity = _number(snapshot, "broker_day_start_equity")
    current_equity = _number(snapshot, "current_equity")
    aggregate_open_risk_money = _number(snapshot, "aggregate_open_risk_money")
    open_orders_count = snapshot.get("open_orders_count")
    market_open = snapshot.get("market_open")
    snapshot_at = _timestamp(snapshot.get("snapshot_at"), "snapshot_at")
    market_data_at = _timestamp(snapshot.get("market_data_at"), "market_data_at")
    broker_day_start_at = _timestamp(snapshot.get("broker_day_start_at"), "broker_day_start_at")

    if day_start_equity <= 0 or current_equity <= 0:
        raise ValueError("risk_snapshot_equity_must_be_positive")
    if aggregate_open_risk_money < 0:
        raise ValueError("risk_snapshot_open_risk_must_be_non_negative")
    if isinstance(open_orders_count, bool) or not isinstance(open_orders_count, int) or open_orders_count < 0:
        raise ValueError("risk_snapshot_open_orders_count_invalid")
    if not isinstance(market_open, bool):
        raise ValueError("risk_snapshot_market_open_invalid")
    if broker_day_start_at > snapshot_at:
        raise ValueError("broker_day_start_after_snapshot")

    evaluated_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    snapshot_age_seconds = (evaluated_at - snapshot_at).total_seconds()
    market_data_age_seconds = (evaluated_at - market_data_at).total_seconds()
    if snapshot_age_seconds < -MAX_FUTURE_SKEW_SECONDS or market_data_age_seconds < -MAX_FUTURE_SKEW_SECONDS:
        raise ValueError("risk_snapshot_from_future")

    daily_loss_pct = max(0.0, (day_start_equity - current_equity) / day_start_equity * 100.0)
    aggregate_open_risk_pct = aggregate_open_risk_money / current_equity * 100.0
    reasons: list[str] = []

    if daily_loss_pct >= DAILY_LOSS_ENTRY_LOCK_PCT:
        reasons.append("daily_loss_entry_lock")
    if aggregate_open_risk_pct > MAX_AGGREGATE_OPEN_RISK_PCT:
        reasons.append("aggregate_open_risk_limit")
    if open_orders_count >= MAX_OPEN_ORDERS:
        reasons.append("max_open_orders")
    if not market_open:
        reasons.append("market_closed")
    if snapshot_age_seconds > MAX_SNAPSHOT_AGE_SECONDS:
        reasons.append("stale_risk_snapshot")
    if market_data_age_seconds > MAX_SNAPSHOT_AGE_SECONDS:
        reasons.append("stale_market_data")

    entry_lock_only = daily_loss_pct >= DAILY_LOSS_ENTRY_LOCK_PCT
    passed = not reasons
    if entry_lock_only:
        action = "ENTRY_LOCK_ONLY"
    elif reasons:
        action = "REJECT_NEW_ENTRY"
    else:
        action = "ELIGIBLE_FOR_RESEARCH_REVIEW"

    return {
        "policy_version": POLICY_VERSION,
        "passed": passed,
        "action": action,
        "entry_lock_only": entry_lock_only,
        "reason_codes": reasons,
        "metrics": {
            "daily_loss_pct": round(daily_loss_pct, 6),
            "aggregate_open_risk_pct": round(aggregate_open_risk_pct, 6),
            "open_orders_count": open_orders_count,
            "risk_snapshot_age_seconds": round(max(0.0, snapshot_age_seconds), 3),
            "market_data_age_seconds": round(max(0.0, market_data_age_seconds), 3),
        },
        "limits": {
            "daily_loss_entry_lock_pct": DAILY_LOSS_ENTRY_LOCK_PCT,
            "max_aggregate_open_risk_pct": MAX_AGGREGATE_OPEN_RISK_PCT,
            "max_open_orders": MAX_OPEN_ORDERS,
            "max_snapshot_age_seconds": MAX_SNAPSHOT_AGE_SECONDS,
        },
        "existing_positions_action": "NO_CHANGE",
        "execution_authorized": False,
        "live_trading_enabled": False,
    }
