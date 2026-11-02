"""Isolated, research-only BUY first-hit labels. Never generates signals or orders."""
from __future__ import annotations
from collections.abc import Mapping
from datetime import datetime, timezone
import math

STOP = 5.0
TARGET = 11.0
MAX_HOLD = 12
LOTS = 0.01
CONTRACT = 100.0
SLIPPAGE = 0.02
MAX_DAILY_TRADES = 5
MAX_DAILY_LOSS_USD = 500.0


def _num(value, name):
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name}_must_be_finite_number") from exc
    if not math.isfinite(result):
        raise ValueError(f"{name}_must_be_finite_number")
    return result


def _utc(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name}_must_be_utc_iso8601")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{name}_must_be_utc_iso8601") from exc
    if result.tzinfo is None or result.utcoffset() != timezone.utc.utcoffset(result):
        raise ValueError(f"{name}_must_be_utc_iso8601")
    return result.astimezone(timezone.utc)


def _validate_bars(bars):
    if not bars:
        raise ValueError("bars_empty")
    out, previous = [], None
    for i, raw in enumerate(bars):
        if not isinstance(raw, Mapping):
            raise ValueError("bar_must_be_mapping")
        ts = _utc(raw.get("timestamp"), f"bar_{i}_timestamp")
        if previous is not None and ts <= previous:
            raise ValueError("bar_timestamps_must_be_strictly_increasing")
        previous = ts
        bar = {"timestamp": ts.isoformat().replace("+00:00", "Z"), "day": ts.date().isoformat()}
        for key in ("open", "high", "low", "close", "spread_price"):
            bar[key] = _num(raw.get(key), f"bar_{i}_{key}")
        if bar["spread_price"] < 0 or bar["low"] > bar["high"] or bar["low"] > min(bar["open"], bar["close"]) or bar["high"] < max(bar["open"], bar["close"]):
            raise ValueError("bar_ohlc_or_spread_invalid")
        out.append(bar)
    return out


def build_first_hit_labels(bars, signals, *, commission_per_lot_per_side_usd,
                           commission_source, commission_verified,
                           stop_distance=STOP, target_distance=TARGET,
                           max_hold_bars=MAX_HOLD, lots=LOTS,
                           contract_size=CONTRACT, slippage_per_side=SLIPPAGE,
                           max_daily_trades=MAX_DAILY_TRADES,
                           max_daily_loss_usd=MAX_DAILY_LOSS_USD):
    """Use only next-bar BUY fills; stop-first ties; censor incomplete horizons.

    OHLC is MT5 Bid: charge spread at BUY entry, then one-side slippage at each
    fill. Gap-through fills are not modeled. Commission must be verified.
    """
    if commission_verified is not True:
        raise ValueError("commission_schedule_unverified")
    if not isinstance(commission_source, str) or not commission_source.strip():
        raise ValueError("commission_source_required")
    commission = _num(commission_per_lot_per_side_usd, "commission_per_lot_per_side_usd")
    stop_distance, target_distance = _num(stop_distance, "stop_distance"), _num(target_distance, "target_distance")
    lots, contract_size = _num(lots, "lots"), _num(contract_size, "contract_size")
    slip, daily_loss = _num(slippage_per_side, "slippage_per_side"), _num(max_daily_loss_usd, "max_daily_loss_usd")
    if commission < 0 or slip < 0 or daily_loss < 0 or min(stop_distance, target_distance, lots, contract_size) <= 0:
        raise ValueError("trade_costs_or_dimensions_invalid")
    if type(max_hold_bars) is not int or max_hold_bars < 1 or type(max_daily_trades) is not int or max_daily_trades < 1:
        raise ValueError("bar_horizon_or_daily_limit_invalid")
    market = _validate_bars(bars)
    ordered, last = [], -1
    for signal in signals:
        if not isinstance(signal, Mapping):
            raise ValueError("signal_must_be_mapping")
        i = signal.get("signal_index")
        if type(i) is not int or not 0 <= i < len(market):
            raise ValueError("signal_index_out_of_range")
        if i <= last:
            raise ValueError("signals_must_be_unique_and_chronological")
        last = i
        trigger = _num(signal.get("entry_trigger_price"), "entry_trigger_price")
        if trigger <= 0:
            raise ValueError("entry_trigger_price_must_be_positive")
        sid = signal.get("signal_id")
        if sid is not None and not isinstance(sid, str):
            raise ValueError("signal_id_must_be_string")
        ordered.append((i, trigger, sid))

    out, busy = [], -1
    daily_count, daily_net = {}, {}
    risk = stop_distance * lots * contract_size
    commission_trade = 2 * lots * commission
    for i, trigger, sid in ordered:
        signal_bar = market[i]
        base = {"signal_id": sid, "signal_index": i, "signal_timestamp_utc": signal_bar["timestamp"],
                "entry_trigger_price": trigger, "direction": "BUY", "commission_per_lot_per_side_usd": commission,
                "commission_source": commission_source, "commission_verified": True, "training_eligible": False}
        if i <= busy:
            out.append({**base, "status": "blocked_overlap", "outcome_class": None}); continue
        day = signal_bar["day"]
        if daily_count.get(day, 0) >= max_daily_trades or daily_net.get(day, 0.0) <= -daily_loss:
            out.append({**base, "status": "blocked_daily_risk_limit", "outcome_class": None}); continue
        entry_i = i + 1
        if entry_i >= len(market):
            out.append({**base, "status": "no_next_bar", "outcome_class": None}); continue
        eb = market[entry_i]
        if eb["high"] < trigger:
            out.append({**base, "status": "trigger_not_reached_next_bar", "outcome_class": None}); continue
        raw_entry = max(eb["open"], trigger)
        spread = eb["spread_price"]
        entry = raw_entry + spread + slip
        stop, target = entry - stop_distance, entry + target_distance
        end = entry_i + max_hold_bars
        complete = end < len(market)
        scan_end = end if complete else len(market) - 1
        exit_i = exit_price = outcome = None
        ambiguous = False
        for j in range(entry_i, scan_end + 1):
            bar = market[j]
            sl, tp = bar["low"] <= stop, bar["high"] >= target
            if sl and tp:
                ambiguous, exit_i, exit_price, outcome = True, j, stop - slip, "stop_first"; break
            if sl:
                exit_i, exit_price, outcome = j, stop - slip, "stop_first"; break
            if tp:
                exit_i, exit_price, outcome = j, target - slip, "target_first"; break
        path_end = scan_end if exit_i is None else exit_i
        path = market[entry_i:path_end + 1]
        spread_cost = spread * lots * contract_size
        if exit_i is None and not complete:
            out.append({**base, "status": "censored_end_of_data", "outcome_class": None,
                "entry_index": entry_i, "entry_timestamp_utc": eb["timestamp"], "raw_entry_price": raw_entry,
                "entry_spread_price": spread, "entry_slippage_price": slip, "entry_price": entry,
                "stop_price": stop, "target_price": target, "exit_index": None, "exit_timestamp_utc": None,
                "exit_price": None, "gross_pnl_usd": None, "commission_usd": None, "net_pnl_usd": None,
                "gross_r_multiple": None, "net_r_multiple": None,
                "mae_price": min(x["low"] for x in path) - entry, "mfe_price": max(x["high"] for x in path) - entry,
                "bars_held": None, "ambiguous_stop_and_target_same_bar": False, "spread_cost_usd": spread_cost,
                "slippage_cost_usd": None, "risk_usd_before_costs": risk, "exit_reason": None})
            break
        if exit_i is None:
            exit_i, outcome = end, "time_exit"
            exit_price = market[end]["close"] - slip
        xb = market[exit_i]
        gross = (exit_price - entry) * lots * contract_size
        net = gross - commission_trade
        out.append({**base, "status": "closed", "outcome_class": outcome, "entry_index": entry_i,
            "entry_timestamp_utc": eb["timestamp"], "raw_entry_price": raw_entry, "entry_spread_price": spread,
            "entry_slippage_price": slip, "entry_price": entry, "stop_price": stop, "target_price": target,
            "exit_index": exit_i, "exit_timestamp_utc": xb["timestamp"], "exit_price": exit_price,
            "gross_pnl_usd": gross, "commission_usd": commission_trade, "net_pnl_usd": net,
            "gross_r_multiple": gross / risk, "net_r_multiple": net / risk,
            "mae_price": min(x["low"] for x in path) - entry, "mfe_price": max(x["high"] for x in path) - entry,
            "bars_held": exit_i - entry_i, "ambiguous_stop_and_target_same_bar": ambiguous,
            "spread_cost_usd": spread_cost, "slippage_cost_usd": 2 * slip * lots * contract_size,
            "risk_usd_before_costs": risk, "exit_reason": outcome,
            "spread_model": "MT5 Bid OHLC; spread charged at BUY entry only",
            "gap_fill_model": "barrier-price fill plus slippage; gap-through execution not modeled",
            "training_eligible": True})
        daily_count[day] = daily_count.get(day, 0) + 1
        daily_net[xb["day"]] = daily_net.get(xb["day"], 0.0) + net
        busy = exit_i
    return out


def purge_training_indices(labels, candidate_signal_indices, *, validation_start_index,
                           validation_end_index, purge_bars=MAX_HOLD, embargo_bars=MAX_HOLD):
    """Drop label intervals intersecting [validation_start-purge, validation_end+embargo]."""
    vals = (validation_start_index, validation_end_index, purge_bars, embargo_bars)
    if any(type(x) is not int or x < 0 for x in vals) or validation_end_index < validation_start_index:
        raise ValueError("validation_range_or_purge_invalid")
    by_signal = {}
    for row in labels:
        i = row.get("signal_index")
        if type(i) is int:
            if i in by_signal: raise ValueError("duplicate_label_signal_index")
            by_signal[i] = row
    lo, hi, kept = validation_start_index - purge_bars, validation_end_index + embargo_bars, []
    for i in candidate_signal_indices:
        if type(i) is not int or i < 0: raise ValueError("candidate_signal_index_invalid")
        row = by_signal.get(i)
        if not row or row.get("status") != "closed" or row.get("training_eligible") is not True: continue
        end = row.get("exit_index")
        if type(end) is int and end >= i and not (i <= hi and end >= lo): kept.append(i)
    return sorted(set(kept))
