"""Isolated candidate sizing policy for NOVA MT5 research validation.

This module is deliberately not wired into the EA, Controller, Bridge request
path, Decision API, or any broker execution path. It only derives a stop price
from an explicit structure-invalidation level plus an explicitly supplied ATR
buffer multiplier, then sizes a hypothetical volume with MT5's read-only
order_calc_profit function.

The multiplier has no default because the owner-approved policy does not yet
specify its numeric value. Callers must supply and record it explicitly.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_FLOOR
from math import isfinite
from typing import Any

POLICY_VERSION = "nova-candidate-risk.v1"
MAX_CANDIDATE_RISK_PCT_CURRENT_EQUITY = 1.0
STOP_LOSS_MODEL = "structure_invalidation_plus_atr_buffer"


def _finite_number(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        return False
    try:
        return isfinite(float(value))
    except (OverflowError, TypeError, ValueError):
        return False


def _decimal(value: Any) -> Decimal | None:
    if not _finite_number(value):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return result if result.is_finite() else None


def _blocked(reason: str, **details: Any) -> dict[str, Any]:
    return {
        "complete": False,
        "reason": reason,
        "policy_version": POLICY_VERSION,
        "stop_loss_model": STOP_LOSS_MODEL,
        "mode": "isolated_validation_only",
        "execution_authorized": False,
        **details,
    }


def build_structure_atr_stop(
    *,
    side: str,
    entry_price: float,
    structure_invalidation_price: float,
    atr_value: float,
    atr_buffer_multiplier: float,
    tick_size: float,
) -> dict[str, Any]:
    """Build a tick-aligned SL beyond structural invalidation.

    BUY:  structure invalidation - (ATR * multiplier), rounded down to tick.
    SELL: structure invalidation + (ATR * multiplier), rounded up to tick.

    All prices and ATR must use the same instrument price units. The caller is
    responsible for supplying a fresh, provenance-backed structure level and
    ATR value from the intended timeframe. No multiplier is assumed here.
    """
    if side not in {"BUY", "SELL"}:
        return _blocked("candidate_side_invalid")
    values = (entry_price, structure_invalidation_price, atr_value,
              atr_buffer_multiplier, tick_size)
    if not all(_finite_number(value) for value in values):
        return _blocked("structure_atr_inputs_invalid")
    entry = _decimal(entry_price)
    structure = _decimal(structure_invalidation_price)
    atr = _decimal(atr_value)
    multiplier = _decimal(atr_buffer_multiplier)
    tick = _decimal(tick_size)
    if any(value is None for value in (entry, structure, atr, multiplier, tick)):
        return _blocked("structure_atr_inputs_invalid")
    if entry <= 0 or structure <= 0 or atr <= 0 or multiplier <= 0 or tick <= 0:
        return _blocked("structure_atr_inputs_must_be_positive")
    if side == "BUY" and structure >= entry:
        return _blocked("buy_structure_invalidation_must_be_below_entry")
    if side == "SELL" and structure <= entry:
        return _blocked("sell_structure_invalidation_must_be_above_entry")

    buffer = atr * multiplier
    raw_stop = structure - buffer if side == "BUY" else structure + buffer
    rounding = ROUND_FLOOR if side == "BUY" else ROUND_CEILING
    tick_units = (raw_stop / tick).to_integral_value(rounding=rounding)
    stop = tick_units * tick
    if stop <= 0:
        return _blocked("structure_atr_stop_not_positive")
    if side == "BUY" and stop >= entry:
        return _blocked("buy_stop_loss_geometry_invalid_after_tick_rounding")
    if side == "SELL" and stop <= entry:
        return _blocked("sell_stop_loss_geometry_invalid_after_tick_rounding")

    return {
        "complete": True,
        "reason": None,
        "policy_version": POLICY_VERSION,
        "stop_loss_model": STOP_LOSS_MODEL,
        "side": side,
        "entry_price": float(entry),
        "structure_invalidation_price": float(structure),
        "atr_value": float(atr),
        "atr_buffer_multiplier": float(multiplier),
        "atr_buffer_price": float(buffer),
        "raw_stop_loss_price": float(raw_stop),
        "stop_loss_price": float(stop),
        "tick_size": float(tick),
        "execution_authorized": False,
        "mode": "isolated_validation_only",
    }


def size_candidate_to_risk_cap(
    mt5: Any,
    *,
    symbol: str,
    side: str,
    entry_price: float,
    stop_loss_price: float,
    current_equity: float,
    account_currency: str,
) -> dict[str, Any]:
    """Choose the largest broker-valid volume whose gross SL loss is <= 1% equity.

    Risk money and current equity stay in the authenticated broker account
    currency returned by MT5. order_calc_profit is read-only. Commission, swap,
    spread, slippage and gap costs are not included, so this result is not an
    all-in loss guarantee and is not runtime authorization.
    """
    if side not in {"BUY", "SELL"}:
        return _blocked("candidate_side_invalid")
    if not isinstance(symbol, str) or not symbol.strip() or len(symbol) > 40:
        return _blocked("candidate_symbol_invalid")
    if (not isinstance(account_currency, str) or
            not (3 <= len(account_currency) <= 8) or
            not account_currency.isalpha() or account_currency != account_currency.upper()):
        return _blocked("candidate_account_currency_invalid")
    if not all(_finite_number(value) for value in
               (entry_price, stop_loss_price, current_equity)):
        return _blocked("candidate_sizing_inputs_invalid")
    entry = _decimal(entry_price)
    stop = _decimal(stop_loss_price)
    equity = _decimal(current_equity)
    if entry is None or stop is None or equity is None or entry <= 0 or stop <= 0 or equity <= 0:
        return _blocked("candidate_sizing_inputs_must_be_positive")
    if (side == "BUY" and stop >= entry) or (side == "SELL" and stop <= entry):
        return _blocked("candidate_stop_loss_geometry_invalid")

    order_type_name = "ORDER_TYPE_BUY" if side == "BUY" else "ORDER_TYPE_SELL"
    order_type = getattr(mt5, order_type_name, None)
    symbol_info_fn = getattr(mt5, "symbol_info", None)
    calc_profit_fn = getattr(mt5, "order_calc_profit", None)
    if order_type is None or not callable(symbol_info_fn) or not callable(calc_profit_fn):
        return _blocked("broker_read_only_calculation_unavailable")
    try:
        info = symbol_info_fn(symbol)
    except Exception:
        info = None
    if info is None:
        return _blocked("candidate_symbol_unavailable")

    minimum = _decimal(getattr(info, "volume_min", None))
    maximum = _decimal(getattr(info, "volume_max", None))
    step = _decimal(getattr(info, "volume_step", None))
    if (minimum is None or maximum is None or step is None or
            minimum <= 0 or maximum < minimum or step <= 0):
        return _blocked("candidate_volume_spec_unavailable")

    step_count_decimal = ((maximum - minimum) / step).to_integral_value(rounding=ROUND_FLOOR)
    max_steps = int(step_count_decimal)
    budget = equity * Decimal(str(MAX_CANDIDATE_RISK_PCT_CURRENT_EQUITY)) / Decimal("100")
    observed: dict[int, Decimal] = {}

    def risk_at(steps: int) -> tuple[Decimal | None, str | None]:
        volume = minimum + step * steps
        try:
            profit = calc_profit_fn(order_type, symbol, float(volume), float(entry), float(stop))
        except Exception:
            return None, "candidate_broker_calculation_failed"
        if not _finite_number(profit):
            return None, "candidate_broker_calculation_failed"
        if float(profit) >= 0:
            return None, "candidate_stop_loss_not_loss_making"
        risk = Decimal(str(-float(profit)))
        for known_steps, known_risk in observed.items():
            if ((steps < known_steps and risk > known_risk) or
                    (steps > known_steps and risk < known_risk)):
                return None, "candidate_broker_risk_not_monotonic"
        observed[steps] = risk
        return risk, None

    minimum_risk, error = risk_at(0)
    if error:
        return _blocked(error)
    if minimum_risk > budget:
        return _blocked(
            "broker_minimum_volume_exceeds_candidate_risk_cap",
            risk_budget_money=float(budget),
            minimum_volume=float(minimum),
            minimum_volume_risk_money=float(minimum_risk),
            account_currency=account_currency,
        )

    maximum_risk, error = risk_at(max_steps)
    if error:
        return _blocked(error)
    if maximum_risk <= budget:
        selected_steps = max_steps
    else:
        low, high = 0, max_steps
        while low < high:
            middle = (low + high + 1) // 2
            middle_risk, error = risk_at(middle)
            if error:
                return _blocked(error)
            if middle_risk <= budget:
                low = middle
            else:
                high = middle - 1
        selected_steps = low

    selected_volume = minimum + step * selected_steps
    selected_risk, error = risk_at(selected_steps)
    if error:
        return _blocked(error)
    if selected_risk > budget:
        return _blocked("candidate_risk_cap_verification_failed")

    next_step_within_cap = False
    if selected_steps < max_steps:
        next_risk, next_error = risk_at(selected_steps + 1)
        if next_error:
            return _blocked(next_error)
        next_step_within_cap = next_risk <= budget

    return {
        "complete": True,
        "reason": None,
        "policy_version": POLICY_VERSION,
        "stop_loss_model": STOP_LOSS_MODEL,
        "risk_budget_pct_current_equity": MAX_CANDIDATE_RISK_PCT_CURRENT_EQUITY,
        "risk_budget_money": float(budget),
        "risk_money": float(selected_risk),
        "risk_pct_current_equity": float(selected_risk / equity * Decimal("100")),
        "current_equity": float(equity),
        "account_currency": account_currency,
        "symbol": symbol,
        "side": side,
        "entry_price": float(entry),
        "stop_loss_price": float(stop),
        "volume": float(selected_volume),
        "volume_min": float(minimum),
        "volume_max": float(maximum),
        "volume_step": float(step),
        "next_volume_step_within_cap": next_step_within_cap,
        "calculation_basis": "mt5_order_calc_profit_to_initial_stop_loss",
        "commission_included": False,
        "swap_included": False,
        "spread_slippage_gap_costs_included": False,
        "all_in_loss_cap_verified": False,
        "execution_authorized": False,
        "mode": "isolated_validation_only",
    }
