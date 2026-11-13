"""Durable broker-day baseline and broker-calculated candidate risk.

The baseline is captured only immediately after a broker D1 bar opens.
If the Bridge first observes a day too late, it fails closed rather than
pretending the current equity was the day's starting equity.
"""
from __future__ import annotations

import sqlite3
import time
from datetime import datetime, timezone
from math import isfinite
from pathlib import Path
from typing import Any

CAPTURE_WINDOW_SECONDS = 30


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(float(value))


def broker_day_start(mt5: Any, symbol: str) -> int | None:
    if not symbol:
        return None
    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, 1)
    if rates is None or len(rates) != 1:
        return None
    value = int(rates[0]["time"])
    return value if value > 0 else None


def load_or_capture_broker_day_baseline(
    *,
    db_path: str | Path,
    tenant_id: str,
    account: Any,
    day_start_epoch: int | None,
    now_epoch: int | None = None,
    capture_window_seconds: int = CAPTURE_WINDOW_SECONDS,
) -> dict[str, Any]:
    """Return a persisted opening-equity baseline; never silently reset it."""
    now = int(time.time() if now_epoch is None else now_epoch)
    login = str(getattr(account, "login", "") or "")
    server = str(getattr(account, "server", "") or "")
    equity = getattr(account, "equity", None)
    currency = str(getattr(account, "currency", "") or "")
    if (not tenant_id or not login or not server or not currency or
            not _number(equity) or equity <= 0 or
            not isinstance(day_start_epoch, int) or day_start_epoch <= 0):
        return {"available": False, "reason": "broker_day_baseline_inputs_invalid"}

    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=FULL")
        connection.execute("PRAGMA busy_timeout=10000")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS broker_day_baselines (
                tenant_id TEXT NOT NULL,
                account_login TEXT NOT NULL,
                broker_server TEXT NOT NULL,
                day_start_epoch INTEGER NOT NULL,
                starting_equity REAL NOT NULL,
                account_currency TEXT NOT NULL,
                captured_at_epoch INTEGER NOT NULL,
                PRIMARY KEY (tenant_id, account_login, broker_server, day_start_epoch)
            )
        """)
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("""
            SELECT starting_equity, account_currency, captured_at_epoch
            FROM broker_day_baselines
            WHERE tenant_id=? AND account_login=? AND broker_server=? AND day_start_epoch=?
        """, (tenant_id, login, server, day_start_epoch)).fetchone()
        if row is None:
            delay = now - day_start_epoch
            if delay < 0 or delay > capture_window_seconds:
                connection.execute("ROLLBACK")
                return {
                    "available": False,
                    "reason": "broker_day_baseline_not_observed_at_rollover",
                    "broker_day_start_at": datetime.fromtimestamp(day_start_epoch, timezone.utc).isoformat(),
                    "capture_window_seconds": capture_window_seconds,
                    "observed_delay_seconds": delay,
                }
            connection.execute("""
                INSERT INTO broker_day_baselines
                (tenant_id, account_login, broker_server, day_start_epoch,
                 starting_equity, account_currency, captured_at_epoch)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (tenant_id, login, server, day_start_epoch, float(equity), currency, now))
            row = (float(equity), currency, now)
        connection.execute("COMMIT")
        start_equity, stored_currency, captured_at = row
        if stored_currency != currency:
            return {"available": False, "reason": "broker_day_account_currency_changed"}
        return {
            "available": True,
            "broker_day_start_equity": float(start_equity),
            "broker_day_start_at": datetime.fromtimestamp(day_start_epoch, timezone.utc).isoformat(),
            "broker_day_baseline_captured_at": datetime.fromtimestamp(captured_at, timezone.utc).isoformat(),
            "broker_day_baseline_capture_delay_seconds": captured_at - day_start_epoch,
            "broker_day_baseline_source": "durable_sqlite_first_equity_observation_after_broker_d1_open",
            "broker_day_baseline_capture_window_seconds": capture_window_seconds,
        }
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()


def calculate_candidate_risk(mt5: Any, candidate: dict[str, Any] | None) -> dict[str, Any]:
    """Recalculate hypothetical candidate loss in broker account currency."""
    if not isinstance(candidate, dict):
        return {"complete": False, "reason": "candidate_trade_plan_missing", "risk_money": None}
    side_name = candidate.get("side")
    side_map = {"BUY": getattr(mt5, "ORDER_TYPE_BUY", None), "SELL": getattr(mt5, "ORDER_TYPE_SELL", None)}
    side = side_map.get(side_name)
    symbol = candidate.get("symbol")
    volume, entry, stop = candidate.get("volume"), candidate.get("entry_price"), candidate.get("stop_loss")
    if (side is None or not isinstance(symbol, str) or not symbol or len(symbol) > 40 or
            not all(_number(v) for v in (volume, entry, stop)) or
            volume <= 0 or entry <= 0 or stop <= 0):
        return {"complete": False, "reason": "candidate_fields_invalid", "risk_money": None}
    if (side_name == "BUY" and stop >= entry) or (side_name == "SELL" and stop <= entry):
        return {"complete": False, "reason": "candidate_stop_loss_geometry_invalid", "risk_money": None}

    info = mt5.symbol_info(symbol)
    if info is None:
        return {"complete": False, "reason": "candidate_symbol_unavailable", "risk_money": None}
    minimum = getattr(info, "volume_min", None)
    maximum = getattr(info, "volume_max", None)
    step = getattr(info, "volume_step", None)
    if not all(_number(v) for v in (minimum, maximum, step)) or minimum <= 0 or maximum < minimum or step <= 0:
        return {"complete": False, "reason": "candidate_volume_spec_unavailable", "risk_money": None}
    if volume < minimum or volume > maximum:
        return {"complete": False, "reason": "candidate_volume_out_of_broker_bounds", "risk_money": None}
    step_units = (float(volume) - float(minimum)) / float(step)
    if abs(step_units - round(step_units)) > 1e-7:
        return {"complete": False, "reason": "candidate_volume_step_invalid", "risk_money": None}

    try:
        profit = mt5.order_calc_profit(side, symbol, float(volume), float(entry), float(stop))
    except Exception:
        profit = None
    if not _number(profit):
        return {"complete": False, "reason": "candidate_broker_calculation_failed", "risk_money": None}
    if float(profit) >= 0:
        return {"complete": False, "reason": "candidate_stop_loss_not_loss_making", "risk_money": None}
    risk = round(-float(profit), 2)
    return {
        "complete": True,
        "reason": None,
        "risk_money": risk,
        "side": side_name,
        "symbol": symbol,
        "volume": float(volume),
        "entry_price": float(entry),
        "stop_loss": float(stop),
        "calculation_basis": "mt5_order_calc_profit_to_candidate_stop_loss",
        "includes_commission": False,
        "includes_slippage_or_gap_buffer": False,
    }
