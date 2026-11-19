"""Pure read-only MT5 exposure snapshot helpers.

Risk is measured to the broker-reported stop loss in account currency.
Missing stop-loss or broker calculation data makes the aggregate incomplete;
callers must not substitute zero or infer a safe exposure.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from typing import Any


def _value(item: Any, name: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(float(value))


def _risk_money(mt5: Any, symbol: str, side: int, volume: float, entry: float, stop: float) -> float | None:
    if not all(_finite_number(v) for v in (volume, entry, stop)) or volume <= 0 or entry <= 0 or stop <= 0:
        return None
    result = mt5.order_calc_profit(side, symbol, float(volume), float(entry), float(stop))
    if not _finite_number(result):
        return None
    return round(max(0.0, -float(result)), 2)


def _side_for_position(mt5: Any, item: Any) -> int | None:
    kind = _value(item, "type")
    if kind == getattr(mt5, "POSITION_TYPE_BUY", object()):
        return getattr(mt5, "ORDER_TYPE_BUY", None)
    if kind == getattr(mt5, "POSITION_TYPE_SELL", object()):
        return getattr(mt5, "ORDER_TYPE_SELL", None)
    return None


def _side_for_pending(mt5: Any, item: Any) -> int | None:
    kind = _value(item, "type")
    buy_types = ("ORDER_TYPE_BUY_LIMIT", "ORDER_TYPE_BUY_STOP", "ORDER_TYPE_BUY_STOP_LIMIT")
    sell_types = ("ORDER_TYPE_SELL_LIMIT", "ORDER_TYPE_SELL_STOP", "ORDER_TYPE_SELL_STOP_LIMIT")
    if any(kind == getattr(mt5, name, object()) for name in buy_types):
        return getattr(mt5, "ORDER_TYPE_BUY", None)
    if any(kind == getattr(mt5, name, object()) for name in sell_types):
        return getattr(mt5, "ORDER_TYPE_SELL", None)
    return None


def build_exposure_snapshot(
    mt5: Any, account: Any, positions: list[Any], pending_orders: list[Any],
    broker_day_baseline: dict[str, Any] | None = None,
    candidate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build one consistent, caller-locked snapshot; no MT5 write methods are used."""
    captured_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    complete = True
    position_risk = 0.0
    pending_risk = 0.0

    for kind, items in (("position", positions), ("pending_order", pending_orders)):
        for item in items:
            symbol = str(_value(item, "symbol", "") or "")
            volume = _value(item, "volume_current", _value(item, "volume", None))
            entry = (_value(item, "price_current", _value(item, "price_open", None)) if kind == "position" else _value(item, "price_open", _value(item, "price_current", _value(item, "price", None))))
            stop = _value(item, "sl", 0.0)
            side = _side_for_position(mt5, item) if kind == "position" else _side_for_pending(mt5, item)
            risk = None if side is None else _risk_money(mt5, symbol, side, volume, entry, stop)
            if risk is None:
                complete = False
            elif kind == "position":
                position_risk += risk
            else:
                pending_risk += risk

            rows.append({
                "kind": kind,
                "ticket": int(_value(item, "ticket", 0) or 0),
                "symbol": symbol,
                "type": int(_value(item, "type", -1)),
                "volume": float(volume) if _finite_number(volume) else None,
                "entry_price": float(entry) if _finite_number(entry) else None,
                "stop_loss": float(stop) if _finite_number(stop) else None,
                "take_profit": float(_value(item, "tp", 0.0) or 0.0),
                "risk_money": risk,
                "risk_status": "calculated_to_stop_loss" if risk is not None else "unknown_fail_closed",
            })

    total_risk = round(position_risk + pending_risk, 2) if complete else None
    equity = _value(account, "equity", None)
    risk_pct = round(total_risk / float(equity) * 100.0, 6) if complete and _finite_number(equity) and equity > 0 else None
    if not _finite_number(equity) or equity <= 0:
        complete = False
        total_risk = None
        risk_pct = None

    from risk_state import calculate_candidate_risk
    candidate_result = calculate_candidate_risk(mt5, candidate)
    baseline = broker_day_baseline or {"available": False, "reason": "broker_day_baseline_unavailable"}

    return {
        "snapshot_at": captured_at,
        "account_login": str(_value(account, "login", "") or ""),
        "broker_server": str(_value(account, "server", "") or ""),
        "account_currency": str(_value(account, "currency", "") or ""),
        "current_equity": float(equity) if _finite_number(equity) else None,
        "positions": [row for row in rows if row["kind"] == "position"],
        "pending_orders": [row for row in rows if row["kind"] == "pending_order"],
        "open_positions_count": len(positions),
        "pending_orders_count": len(pending_orders),
        "open_orders_count": len(positions) + len(pending_orders),
        "aggregate_position_risk_money": round(position_risk, 2) if complete else None,
        "aggregate_pending_risk_money": round(pending_risk, 2) if complete else None,
        "aggregate_open_risk_money": total_risk,
        "aggregate_open_risk_pct_current_equity": risk_pct,
        "risk_calculation_complete": complete,
        "broker_day_baseline_available": baseline.get("available") is True,
        "broker_day_baseline_reason": baseline.get("reason"),
        "candidate_risk_complete": candidate_result.get("complete") is True,
        "candidate_risk_reason": candidate_result.get("reason"),
        "candidate_risk_money": candidate_result.get("risk_money"),
        "proposed_entry_risk_money": candidate_result.get("risk_money"),
        "candidate_risk": candidate_result,
        "risk_calculation_basis": "broker_order_calc_profit_to_each_stop_loss_account_currency",
        **{key: value for key, value in baseline.items() if key not in {"available", "reason"}},
        "policy_attestation": {
            "status": "not_attested",
            "policy_version": None,
            "reason": "Bridge cannot infer or certify the EA's active risk inputs or installed binary policy.",
        },
        "mode": "read-only",
        "order_submission_enabled": False,
    }
