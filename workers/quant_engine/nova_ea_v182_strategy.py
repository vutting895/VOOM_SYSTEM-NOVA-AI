"""Point-in-time signal port of the active NOVA EA v1.82 strategy modules.

Input bars must be chronological (oldest first) and contain completed candles only.
This module emits research candidates; it never sizes positions or submits orders.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
from collections.abc import Mapping, Sequence
from typing import Any

STRATEGY_NAMES = [
    "SuperTrend", "TrendPilot", "VolRegime-QEX", "QEX-VolST", "LiquidityPools",
    "QEX-LiqSweep", "WyckoffPhase", "RangeSniper", "SessionHeat", "SessionBox",
    "FlowMatrix", "SATMAFlow", "WickReject", "SMC_Full", "ZigZag_BreakPull",
    "Martingale_Avg", "Trend_Trail", "Intraday_VolBreak", "Trend_Adding", "GOLD_Breakout",
]
# Original v1.82 source: 20 modules, 14 kept and 6 disabled/removed.
KEPT_IDS = {1, 2, 4, 6, 8, 9, 10, 11, 13, 14, 15, 17, 18, 19}
DISABLED_IDS = {0, 3, 5, 7, 12, 16}
IMPLEMENTED_IDS = {1, 2, 4, 6, 8, 9, 10, 13}
DORMANT_IDS = {11, 14, 15, 17, 18, 19}
STRATEGY_FAMILIES = {
    1: "trend",
    2: "volatility",
    4: "liquidity",
    6: "structure",
    8: "session",
    9: "session",
    10: "flow",
    13: "structure",
}


class StrategyInputError(ValueError):
    """Raised for malformed or incomplete market data."""


def _number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise StrategyInputError(f"{label} must be numeric")
    value = float(value)
    if not math.isfinite(value):
        raise StrategyInputError(f"{label} must be finite")
    return value


def _bars(data: Mapping[str, Any], minimum: int = 110) -> list[dict[str, Any]]:
    raw = data.get("bars")
    if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)) or len(raw) < minimum:
        raise StrategyInputError(f"bars must contain at least {minimum} completed candles")
    result = []
    previous_time = None
    for index, row in enumerate(raw):
        if not isinstance(row, Mapping):
            raise StrategyInputError(f"bars[{index}] must be an object")
        bar = {key: _number(row.get(key), f"bars[{index}].{key}") for key in ("open", "high", "low", "close")}
        if bar["high"] < max(bar["open"], bar["close"], bar["low"]) or bar["low"] > min(bar["open"], bar["close"], bar["high"]):
            raise StrategyInputError(f"bars[{index}] has invalid OHLC bounds")
        stamp = row.get("time")
        if not isinstance(stamp, str):
            raise StrategyInputError(f"bars[{index}].time must be an ISO timestamp")
        try:
            parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except ValueError as exc:
            raise StrategyInputError(f"bars[{index}].time is invalid") from exc
        if parsed.tzinfo is None:
            raise StrategyInputError(f"bars[{index}].time must include a timezone")
        if previous_time is not None and parsed <= previous_time:
            raise StrategyInputError("bars must be strictly chronological")
        previous_time = parsed
        bar["time"] = parsed
        bar["volume"] = _number(row.get("tick_volume", row.get("volume", 0)), f"bars[{index}].volume")
        if bar["volume"] < 0:
            raise StrategyInputError("volume cannot be negative")
        result.append(bar)
    return result


def _atr_series(bars: list[dict[str, Any]], period: int = 14) -> list[float]:
    if period < 1 or len(bars) < period + 3:
        raise StrategyInputError("insufficient bars for Wilder ATR")
    true_ranges = [0.0] * len(bars)
    for i in range(1, len(bars)):
        prev_close = bars[i-1]["close"]
        true_ranges[i] = max(
            bars[i]["high"] - bars[i]["low"],
            abs(bars[i]["high"] - prev_close),
            abs(bars[i]["low"] - prev_close),
        )
    out = [0.0] * len(bars)
    value = sum(true_ranges[1:period+1]) / period
    out[period] = value
    for i in range(period+1, len(bars)):
        value = (value * (period-1) + true_ranges[i]) / period
        out[i] = value
    return out


def _atr(bars: list[dict[str, Any]], period: int = 14) -> float:
    value = _atr_series(bars, period)[-1]
    if value <= 0:
        raise StrategyInputError("ATR must be positive")
    return value


def _ema(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        raise StrategyInputError("insufficient values for EMA")
    out = [0.0] * len(values)
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    alpha = 2.0 / (period + 1.0)
    for i in range(period, len(values)):
        out[i] = alpha * values[i] + (1.0 - alpha) * out[i - 1]
    return out


def _rsi(values: list[float], period: int = 14) -> list[float]:
    if len(values) <= period + 1:
        raise StrategyInputError("insufficient values for RSI")
    gains = [max(values[i] - values[i - 1], 0.0) for i in range(1, len(values))]
    losses = [max(values[i - 1] - values[i], 0.0) for i in range(1, len(values))]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    result = [50.0] * len(values)
    def calc(g: float, l: float) -> float:
        if l <= 1e-15:
            return 100.0 if g > 1e-15 else 50.0
        return 100.0 - 100.0 / (1.0 + g / l)
    result[period] = calc(avg_gain, avg_loss)
    for i in range(period + 1, len(values)):
        avg_gain = (avg_gain * (period - 1) + gains[i - 1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i - 1]) / period
        result[i] = calc(avg_gain, avg_loss)
    return result


def _confirmed_pivots(bars: list[dict[str, Any]], side: str, left: int = 5, right: int = 3) -> list[tuple[int, float]]:
    values = [bar["high" if side == "high" else "low"] for bar in bars]
    found = []
    # A pivot is visible only after its three right-hand confirmation bars exist.
    for i in range(left, len(values) - right):
        window_left = values[i-left:i]
        window_right = values[i+1:i+right+1]
        if side == "high" and values[i] > max(window_left + window_right):
            found.append((i, values[i]))
        elif side == "low" and values[i] < min(window_left + window_right):
            found.append((i, values[i]))
    return found


def _candidate(direction: int, entry: float, stop: float, rr: float, strategy_id: int, stamp: datetime, reason: str) -> dict[str, Any]:
    risk = direction * (entry - stop)
    if direction not in (-1, 1) or risk <= 0:
        return {"strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id], "direction": 0, "status": "NO_SIGNAL", "reason": "invalid_stop_geometry"}
    return {
        "strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id],
        "direction": direction, "entry_reference": entry, "stop_reference": stop,
        "target_reference": entry + direction * rr * risk, "risk_distance": risk,
        "rr": rr, "signal_time": stamp.isoformat(), "status": "RESEARCH_CANDIDATE",
        "reason": reason, "research_only": True, "orders_submitted": False,
        "execution_enabled": False, "live_trading_enabled": False,
    }


def _bb_width(bars: list[dict[str, Any]], end_index: int, period: int = 20) -> float:
    if end_index + 1 < period:
        return 0.0
    values = [bar["close"] for bar in bars[end_index-period+1:end_index+1]]
    mean = sum(values) / period
    if mean <= 0:
        return 0.0
    variance = sum((value-mean)**2 for value in values) / period
    return 4.0 * math.sqrt(variance) / mean


def _bars_since(bars: list[dict[str, Any]], timestamp: Any) -> int:
    if not timestamp:
        return 1_000_000
    try:
        parsed = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
    except ValueError as exc:
        raise StrategyInputError("state timestamp must be ISO formatted") from exc
    if parsed.tzinfo is None:
        raise StrategyInputError("state timestamp must include timezone")
    found = next((i for i, bar in enumerate(bars) if bar["time"] == parsed), None)
    if found is not None:
        return len(bars)-1-found
    interval = (bars[-1]["time"]-bars[-2]["time"]).total_seconds()
    return int((bars[-1]["time"]-parsed).total_seconds()/interval) if interval > 0 else 1_000_000


def _vol_qex(bars: list[dict[str, Any]], state: Mapping[str, Any] | None) -> dict[str, Any]:
    state_out = dict(state or {})
    atrs = _atr_series(bars, 14)
    current_atr = atrs[-1]
    prior_atrs = [value for value in atrs[-201:-1] if value > 0]
    percentile = 100.0 * sum(value < current_atr for value in prior_atrs) / len(prior_atrs) if len(prior_atrs) >= 20 else -1.0
    current_width = _bb_width(bars, len(bars)-1)
    widths = [_bb_width(bars, i) for i in range(max(19, len(bars)-100), len(bars))]
    valid_widths = [value for value in widths if value > 0]
    average_width = sum(valid_widths)/len(valid_widths) if len(valid_widths) >= 20 else 0.0
    squeeze = (0 <= percentile <= 30) or (average_width > 0 and current_width > 0 and current_width < 0.7*average_width)
    phase = int(state_out.get("phase", 0))
    if squeeze:
        if phase != 1:
            state_out = {"phase": 1, "hi": bars[-1]["close"], "lo": bars[-1]["close"], "flags": 0, "anchor_time": bars[-1]["time"].isoformat()}
        else:
            state_out["hi"] = max(float(state_out["hi"]), bars[-1]["close"])
            state_out["lo"] = min(float(state_out["lo"]), bars[-1]["close"])
        return {"strategy_id": 2, "name": STRATEGY_NAMES[2], "direction": 0, "status": "SQUEEZE_BUILDING", "reason": "EA_v1.82_QEX_ATR_percentile_or_BBWidth_squeeze", "state": state_out}
    if phase == 1:
        phase = 2
        state_out["phase"] = 2
    if phase != 2 or int(state_out.get("flags", 0)) != 0 or float(state_out.get("lo", 0)) <= 0:
        return {"strategy_id": 2, "name": STRATEGY_NAMES[2], "direction": 0, "status": "NO_SIGNAL", "reason": "QEX_not_armed_or_already_consumed", "state": state_out}
    last = bars[-1]
    upper = float(state_out["hi"]) + 0.1*current_atr
    lower = float(state_out["lo"]) - 0.1*current_atr
    direction = 1 if last["close"] > upper else -1 if last["close"] < lower else 0
    if not direction:
        return {"strategy_id": 2, "name": STRATEGY_NAMES[2], "direction": 0, "status": "SETUP_WAITING", "reason": "QEX_waiting_for_range_breakout", "state": state_out}
    state_out["flags"] = 1
    if _bars_since(bars, state_out.get("last_entry_time")) < 15:
        return {"strategy_id": 2, "name": STRATEGY_NAMES[2], "direction": 0, "status": "COOLDOWN", "reason": "EA_v1.82_QEX_15_bar_entry_cooldown", "state": state_out}
    stop = float(state_out["lo"]) if direction > 0 else float(state_out["hi"])
    entry = last["close"]
    if direction*(entry-stop) > 1.5*current_atr:
        stop = (entry+stop)/2.0
    result = _candidate(direction, entry, stop, 2.0, 2, last["time"], "EA_v1.82_VolRegime_QEX_squeeze_breakout")
    result["state"] = state_out
    return result


def _flow_matrix(bars: list[dict[str, Any]], data: Mapping[str, Any]) -> dict[str, Any]:
    symbol = data.get("symbol")
    symbol_bars = data.get("symbol_bars")
    if not isinstance(symbol, str) or not isinstance(symbol_bars, Mapping) or symbol not in symbol_bars:
        return {"strategy_id": 10, "name": STRATEGY_NAMES[10], "direction": 0, "status": "DATA_REQUIRED", "reason": "FlowMatrix_requires_symbol_bars_for_current_symbol_and_universe"}
    flows: dict[str, float] = {}
    for name, rows in symbol_bars.items():
        try:
            history = _bars({"bars": rows}, minimum=210)
        except StrategyInputError:
            continue
        sample = history[-20:]
        volume = sum(bar["volume"] for bar in sample)
        if volume <= 0:
            flows[str(name)] = 0.0
            continue
        delta = 0.0
        for bar in sample:
            span = bar["high"]-bar["low"]
            if span > 0 and bar["volume"] > 0:
                bounded = max(-1.0, min(1.0, (2*bar["close"]-bar["high"]-bar["low"])/span))
                delta += bar["volume"]*bounded
        flows[str(name)] = delta/volume
    if symbol not in flows:
        return {"strategy_id": 10, "name": STRATEGY_NAMES[10], "direction": 0, "status": "DATA_REQUIRED", "reason": "current_symbol_flow_unavailable"}
    total = sum(abs(value) for value in flows.values())
    current = flows[symbol]
    share = 100.0*abs(current)/total if total > 0 else 0.0
    closes = [bar["close"] for bar in bars]
    ema50, ema200 = _ema(closes, 50), _ema(closes, 200)
    direction = 1 if current > 0 else -1 if current < 0 else 0
    aligned = (direction > 0 and ema50[-1] > ema200[-1]) or (direction < 0 and ema50[-1] < ema200[-1])
    if share >= 80.0 and aligned:
        atr = _atr(bars)
        result = _candidate(direction, closes[-1], closes[-1]-direction*2.0*atr, 1.5, 10, bars[-1]["time"], "EA_v1.82_FlowMatrix_80pct_share_EMA_alignment")
        result["flow_share_pct"] = round(share, 6)
        result["symbol_flows"] = flows
        return result
    return {"strategy_id": 10, "name": STRATEGY_NAMES[10], "direction": 0, "status": "NO_SIGNAL", "reason": "FlowMatrix_share_or_EMA_gate_not_met", "flow_share_pct": round(share, 6), "symbol_flows": flows}


def _session_heat(data: Mapping[str, Any], state: Mapping[str, Any] | None) -> dict[str, Any]:
    state_out = dict(state or {})
    raw_h1 = data.get("h1_bars")
    if not isinstance(raw_h1, Sequence) or isinstance(raw_h1, (str, bytes)):
        return {"strategy_id": 8, "name": STRATEGY_NAMES[8], "direction": 0, "status": "DATA_REQUIRED", "reason": "SessionHeat_requires_H1_history"}
    h1 = _bars({"bars": raw_h1}, minimum=22)
    server_time_raw = data.get("server_time")
    current_bid = _number(data.get("current_bid"), "current_bid")
    current_ask = _number(data.get("current_ask"), "current_ask")
    if current_ask < current_bid:
        raise StrategyInputError("SessionHeat current_ask cannot be below current_bid")
    if not isinstance(server_time_raw, str):
        raise StrategyInputError("SessionHeat requires timezone-aware server_time")
    try:
        server_time = datetime.fromisoformat(server_time_raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise StrategyInputError("SessionHeat server_time is invalid") from exc
    if server_time.tzinfo is None:
        raise StrategyInputError("SessionHeat server_time must include timezone")
    hour = server_time.hour
    heat_start = server_time - timedelta(days=30)
    sample = [bar for bar in h1 if heat_start <= bar["time"] <= server_time and bar["time"].hour == hour]
    count = len(sample)
    if count < 5:
        return {"strategy_id": 8, "name": STRATEGY_NAMES[8], "direction": 0, "status": "DATA_INSUFFICIENT", "reason": "SessionHeat_needs_five_H1_samples_for_server_hour", "state": state_out}
    up_pct = 100.0*sum(bar["close"] > bar["open"] for bar in sample)/count
    previous_h1 = h1[-1]
    slot = server_time.replace(minute=0, second=0, microsecond=0).isoformat()
    if state_out.get("consumed_key") == slot:
        return {"strategy_id": 8, "name": STRATEGY_NAMES[8], "direction": 0, "status": "SLOT_CONSUMED", "reason": "SessionHeat_one_signal_per_server_hour", "state": state_out}
    flags = state_out.get("flags", 0)
    if isinstance(flags, bool) or not isinstance(flags, int):
        raise StrategyInputError("SessionHeat state.flags must be an integer bitmask")
    direction = 1 if not (flags & 1) and current_bid > previous_h1["high"] and up_pct >= 60.0 else -1 if not (flags & 2) and current_bid < previous_h1["low"] and up_pct <= 40.0 else 0
    if not direction:
        return {"strategy_id": 8, "name": STRATEGY_NAMES[8], "direction": 0, "status": "NO_SIGNAL", "reason": "SessionHeat_hour_bias_or_H1_breakout_not_met", "hour_up_pct": round(up_pct, 4), "state": state_out}
    atr = _atr(h1)
    entry = current_ask if direction > 0 else current_bid
    result = _candidate(direction, entry, entry-direction*1.5*atr, 2.0, 8, server_time, "EA_v1.82_SessionHeat_30day_hour_stats_H1_breakout")
    result["candidate_slot_key"] = slot
    result["candidate_flag"] = 1 if direction > 0 else 2
    result["hour_up_pct"] = round(up_pct, 4)
    result["state"] = state_out
    return result


def _trend_pilot(bars: list[dict[str, Any]]) -> dict[str, Any]:
    closes = [bar["close"] for bar in bars]
    e50, e200, rsi = _ema(closes, 50), _ema(closes, 200), _rsi(closes, 14)
    i = len(bars) - 1
    direction = 0
    if e50[i] > e200[i] and closes[i] > e200[i] and rsi[i-1] < 45 <= rsi[i]:
        direction = 1
    elif e50[i] < e200[i] and closes[i] < e200[i] and rsi[i-1] > 55 >= rsi[i]:
        direction = -1
    if not direction:
        return {"strategy_id": 1, "name": STRATEGY_NAMES[1], "direction": 0, "status": "NO_SIGNAL", "reason": "trendpilot_conditions_not_met"}
    atr = _atr(bars)
    return _candidate(direction, closes[i], closes[i] - direction * 1.5 * atr, 2.5, 1, bars[i]["time"], "EA_v1.82_TrendPilot_EMA50_200_RSI45_55")


def _liquidity_pools(bars: list[dict[str, Any]], state: Mapping[str, Any] | None) -> dict[str, Any]:
    state_out = dict(state or {})
    atr = _atr(bars)
    last = bars[-1]
    interval = (bars[-1]["time"] - bars[-2]["time"]).total_seconds()
    if interval <= 0:
        raise StrategyInputError("LiquidityPools requires increasing bar timestamps")
    last_entry = state_out.get("last_entry_time")
    if last_entry:
        try:
            last_entry_dt = datetime.fromisoformat(str(last_entry).replace("Z", "+00:00"))
        except ValueError as exc:
            raise StrategyInputError("state.last_entry_time must be ISO timestamp") from exc
        if last_entry_dt.tzinfo is None:
            raise StrategyInputError("state.last_entry_time must include timezone")
        prior_index = next((i for i, bar in enumerate(bars) if bar["time"] == last_entry_dt), None)
        bars_since = len(bars) - 1 - prior_index if prior_index is not None else int((last["time"] - last_entry_dt).total_seconds() / interval)
        if bars_since < 10:
            return {"strategy_id": 4, "name": STRATEGY_NAMES[4], "direction": 0, "status": "COOLDOWN", "reason": "EA_v1.82_LiquidityPools_10_bar_entry_cooldown", "state": state_out}
    tolerance, pierce = 0.25 * atr, 0.02 * atr
    for side, key in (("low", "pool_buy_used"), ("high", "pool_sell_used")):
        pivots = list(reversed(_confirmed_pivots(bars[:-1], side)))
        used_time = state_out.get(key)
        if used_time:
            try:
                used_dt = datetime.fromisoformat(str(used_time).replace("Z", "+00:00"))
            except ValueError as exc:
                raise StrategyInputError(f"state.{key} must be ISO timestamp") from exc
            if used_dt.tzinfo is None:
                raise StrategyInputError(f"state.{key} must include timezone")
        else:
            used_dt = None
        consumed = [False] * len(pivots)
        for i, (pivot_index, level) in enumerate(pivots):
            if consumed[i]:
                continue
            cluster = [(pivot_index, level)]
            consumed[i] = True
            for j in range(i + 1, len(pivots)):
                if not consumed[j] and abs(pivots[j][1] - level) <= tolerance:
                    consumed[j] = True
                    cluster.append(pivots[j])
            if len(cluster) < 2:
                continue
            pool = sum(price for _, price in cluster) / len(cluster)
            oldest_time = min(bars[index]["time"] for index, _ in cluster)
            if used_dt is not None and oldest_time <= used_dt:
                continue
            if side == "low" and last["low"] < pool - pierce and last["close"] > pool and last["close"] > last["open"]:
                result = _candidate(1, last["close"], last["low"] - 0.3 * atr, 2.0, 4, last["time"], "EA_v1.82_LiquidityPools_cluster_sweep_reclaim")
                result["candidate_pool_key"] = oldest_time.isoformat()
                result["state"] = state_out
                return result
            if side == "high" and last["high"] > pool + pierce and last["close"] < pool and last["close"] < last["open"]:
                result = _candidate(-1, last["close"], last["high"] + 0.3 * atr, 2.0, 4, last["time"], "EA_v1.82_LiquidityPools_cluster_sweep_reclaim")
                result["candidate_pool_key"] = oldest_time.isoformat()
                result["state"] = state_out
                return result
    return {"strategy_id": 4, "name": STRATEGY_NAMES[4], "direction": 0, "status": "NO_SIGNAL", "reason": "no_confirmed_liquidity_cluster_sweep", "state": state_out}



def _smc_full(bars: list[dict[str, Any]], state: Mapping[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any]]:
    state_out = dict(state or {})
    atr = _atr(bars)
    last = bars[-1]
    phase = state_out.get("phase", 0)
    if isinstance(phase, bool) or not isinstance(phase, int) or phase not in (-1, 0, 1):
        return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "SETUP_RESET", "reason": "invalid_SMC_state_phase"}, {"phase": 0})

    if phase == 0:
        highs = _confirmed_pivots(bars, "high")
        lows = _confirmed_pivots(bars, "low")
        if len(highs) < 2 or len(lows) < 2:
            return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "NO_SIGNAL", "reason": "insufficient_confirmed_swings"}, state_out)
        last_sh, prev_sh = highs[-1][1], highs[-2][1]
        last_sl, prev_sl = lows[-1][1], lows[-2][1]
        range_high = max(last_sh, prev_sh)
        range_low = min(last_sl, prev_sl)
        recent = bars[-100:]
        hi100 = max(range_high, max(x["high"] for x in recent))
        lo100 = min(range_low, min(x["low"] for x in recent))
        equilibrium = (hi100 + lo100) / 2.0
        direction = 1 if last["close"] > last_sh and last["close"] > last["open"] else -1 if last["close"] < last_sl and last["close"] < last["open"] else 0
        if not direction:
            return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "NO_SIGNAL", "reason": "waiting_for_confirmed_bos"}, state_out)
        prior = bars[-21:-1]
        opposing = next((b for b in reversed(prior) if (b["close"] < b["open"] if direction > 0 else b["close"] > b["open"])), prior[-1])
        state_out = {
            "phase": direction, "anchor_time": last["time"].isoformat(), "ob_high": opposing["high"],
            "ob_low": opposing["low"], "equilibrium": equilibrium,
            "range_high": range_high, "range_low": range_low,
        }
        return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "SETUP_ARMED", "reason": "EA_v1.82_SMC_BOS_wait_retrace"}, state_out)

    age = _bars_since(bars, state_out.get("anchor_time"))
    max_retrace = state_out.get("max_retrace_bars", 30)
    if isinstance(max_retrace, bool) or not isinstance(max_retrace, int) or max_retrace < 1:
        return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "SETUP_RESET", "reason": "invalid_SMC_retrace_limit"}, {"phase": 0})
    required = ("range_low", "range_high", "ob_low", "ob_high", "equilibrium")
    if any(key not in state_out for key in required):
        return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "SETUP_RESET", "reason": "incomplete_SMC_setup_state"}, {"phase": 0})
    range_low = _number(state_out["range_low"], "state.range_low")
    range_high = _number(state_out["range_high"], "state.range_high")
    ob_lo = _number(state_out["ob_low"], "state.ob_low")
    ob_hi = _number(state_out["ob_high"], "state.ob_high")
    eq = _number(state_out["equilibrium"], "state.equilibrium")
    if age > max_retrace or (phase > 0 and last["close"] < range_low - 0.2*atr) or (phase < 0 and last["close"] > range_high + 0.2*atr):
        return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "SETUP_RESET", "reason": "SMC_setup_expired_or_invalidated"}, {"phase": 0})

    # EA v1.82 recomputes the nearest FVG from the latest 20 completed bars on every retrace bar.
    prior = bars[-21:-1]
    fvg_low = fvg_high = 0.0
    for j in range(len(prior)-1, 1, -1):
        newer, older = prior[j], prior[j-2]
        if phase > 0 and newer["low"] > older["high"]:
            fvg_low, fvg_high = older["high"], newer["low"]
            break
        if phase < 0 and newer["high"] < older["low"]:
            fvg_low, fvg_high = newer["high"], older["low"]
            break
    if phase > 0:
        location = last["close"] <= eq
        in_ob = last["low"] <= ob_hi and last["close"] >= ob_lo
        in_fvg = fvg_high > 0 and last["low"] <= fvg_high and last["close"] >= fvg_low
        wick = min(last["open"], last["close"]) - last["low"]
        body = abs(last["open"] - last["close"])
        wick_ok = wick >= 1.5*max(body, 0.1*atr) and wick >= 0.4*atr
        if location and (in_ob or in_fvg) and wick_ok:
            stop = min(ob_lo, fvg_low if fvg_high > 0 else ob_lo) - 0.2*atr
            if in_fvg and not in_ob:
                stop = fvg_low - 0.2*atr
            return _candidate(1, last["close"], stop, 2.5, 13, last["time"], "EA_v1.82_SMC_BOS_OB_FVG_Discount_Wick"), {"phase": 0}
    else:
        location = last["close"] >= eq
        in_ob = last["high"] >= ob_lo and last["close"] <= ob_hi
        in_fvg = fvg_high > 0 and last["high"] >= fvg_low and last["close"] <= fvg_high
        wick = last["high"] - max(last["open"], last["close"])
        body = abs(last["open"] - last["close"])
        wick_ok = wick >= 1.5*max(body, 0.1*atr) and wick >= 0.4*atr
        if location and (in_ob or in_fvg) and wick_ok:
            stop = max(ob_hi, fvg_high if fvg_high > 0 else ob_hi) + 0.2*atr
            if in_fvg and not in_ob:
                stop = fvg_high + 0.2*atr
            return _candidate(-1, last["close"], stop, 2.5, 13, last["time"], "EA_v1.82_SMC_BOS_OB_FVG_Premium_Wick"), {"phase": 0}
    return ({"strategy_id": 13, "name": STRATEGY_NAMES[13], "direction": 0, "status": "SETUP_WAITING", "reason": "SMC_retrace_or_rejection_not_confirmed"}, state_out)


def _session_box(bars: list[dict[str, Any]], data: Mapping[str, Any], state: Mapping[str, Any] | None) -> dict[str, Any]:
    state_out = dict(state or {})
    offset = data.get("server_utc_offset_minutes")
    bar_seconds = data.get("bar_seconds")
    missing_context = [
        key for key, value in (
            ("server_utc_offset_minutes", offset),
            ("bar_seconds", bar_seconds),
        ) if value is None
    ]
    if missing_context:
        return {
            "strategy_id": 9,
            "name": STRATEGY_NAMES[9],
            "direction": 0,
            "status": "DATA_REQUIRED",
            "reason": "SessionBox_requires_explicit_broker_server_timezone_and_bar_duration",
            "missing_fields": missing_context,
            "state": state_out,
        }
    if isinstance(offset, bool) or not isinstance(offset, int) or not -720 <= offset <= 840:
        raise StrategyInputError("SessionBox requires server_utc_offset_minutes in [-720, 840]")
    if isinstance(bar_seconds, bool) or not isinstance(bar_seconds, int) or bar_seconds <= 0:
        raise StrategyInputError("SessionBox requires positive bar_seconds")
    raw_flags = state_out.get("session_flags", [])
    if not isinstance(raw_flags, list) or any(not isinstance(x, str) for x in raw_flags):
        raise StrategyInputError("state.session_flags must be a list of session keys")
    flags = set(raw_flags)
    last = bars[-1]
    server_time = last["time"] + timedelta(seconds=bar_seconds, minutes=offset)
    day = server_time.date()
    atr = _atr(bars)
    for start_hour, end_hour, tag in ((9, 15, "LONDON"), (15, 20, "NEW_YORK")):
        session_key = f"{day.isoformat()}:{tag}"
        if session_key in flags:
            continue
        start = datetime.combine(day, datetime.min.time(), tzinfo=server_time.tzinfo) + timedelta(hours=start_hour)
        end = datetime.combine(day, datetime.min.time(), tzinfo=server_time.tzinfo) + timedelta(hours=end_hour)
        if not end <= server_time:
            continue
        session_bars = [b for b in bars[:-1] if start <= b["time"] + timedelta(minutes=offset) and b["time"] + timedelta(minutes=offset) + timedelta(seconds=bar_seconds) <= end]
        min_bars = min(6, int((end-start).total_seconds() / bar_seconds))
        if len(session_bars) < min_bars:
            continue
        hi = max(b["high"] for b in session_bars); lo = min(b["low"] for b in session_bars)
        if hi-lo < 0.8*atr:
            continue
        direction = 1 if last["close"] > hi + 0.05*atr else -1 if last["close"] < lo - 0.05*atr else 0
        if not direction:
            continue
        stop = lo if direction > 0 else hi
        if direction*(last["close"]-stop) > 3*atr:
            stop = (last["close"]+stop)/2
        result = _candidate(direction, last["close"], stop, 2.0, 9, last["time"], f"EA_v1.82_SessionBox_{tag}_breakout")
        result["candidate_session_key"] = session_key
        result["state"] = state_out
        return result
    return {"strategy_id": 9, "name": STRATEGY_NAMES[9], "direction": 0, "status": "NO_SIGNAL", "reason": "no_completed_session_box_breakout", "state": state_out}



def _wyckoff(bars: list[dict[str, Any]], state: Mapping[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any]]:
    out = dict(state or {})
    last = bars[-1]; atr = _atr(bars)
    volumes = [b["volume"] for b in bars[-21:-1]]
    avg_volume = sum(volumes)/len(volumes) if volumes else 0.0
    phase = int(out.get("phase", 0))
    if phase != 0 and int(out.get("age", 0)) + 1 > 40:
        phase = 0; out = {}
    if phase == 0:
        window = bars[-24:]
        if len(window) < 24: return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"NO_SIGNAL","reason":"insufficient_wyckoff_history"}, out)
        hi=max(b["high"] for b in window); lo=min(b["low"] for b in window)
        trend=bars[-25]["close"]-bars[-45]["close"]
        if not 1.2*atr <= hi-lo <= 6*atr or abs(trend)<1.5*atr:
            return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"NO_SIGNAL","reason":"no_wyckoff_range"}, out)
        out={"phase":1,"age":0,"hi":hi,"lo":lo,"bias":1 if trend<0 else -1}
        return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"SETUP_ARMED","reason":"Wyckoff_range_armed"}, out)
    out["age"]=int(out.get("age",0))+1
    hi=float(out["hi"]); lo=float(out["lo"]); bias=int(out["bias"])
    if phase == 1:
        if last["close"] < lo-0.1*atr or last["close"] > hi+0.1*atr: return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"SETUP_RESET","reason":"range_invalidated"}, {})
        if bias>0 and last["low"]<lo-0.1*atr and last["close"]>lo and last["volume"]<=avg_volume:
            out.update(phase=2,extreme=last["low"],age=0)
        elif bias<0 and last["high"]>hi+0.1*atr and last["close"]<hi and last["volume"]<=avg_volume:
            out.update(phase=3,extreme=last["high"],age=0)
    elif phase == 2:
        if last["close"]<float(out["extreme"])-0.1*atr: return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"SETUP_RESET","reason":"spring_invalidated"}, {})
        if last["close"]>hi and last["volume"]>=1.5*avg_volume: out.update(phase=4,age=0)
    elif phase == 3:
        if last["close"]>float(out["extreme"])+0.1*atr: return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"SETUP_RESET","reason":"upthrust_invalidated"}, {})
        if last["close"]<lo and last["volume"]>=1.5*avg_volume: out.update(phase=5,age=0)
    elif phase in (4,5):
        direction=1 if phase==4 else -1
        if (direction>0 and last["close"]<float(out["extreme"])-0.1*atr) or (direction<0 and last["close"]>float(out["extreme"])+0.1*atr):
            return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"SETUP_RESET","reason":"wyckoff_extreme_invalidated"}, {})
        lps = (last["low"]<=hi+0.8*atr and last["close"]>hi) if direction>0 else (last["high"]>=lo-0.8*atr and last["close"]<lo)
        if lps:
            entry=last["close"]; stop=float(out["extreme"])-direction*0.3*atr
            target=entry+direction*1.5*(hi-lo)
            risk=direction*(entry-stop)
            if risk>0 and direction*(target-entry)>0:
                signal={"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":direction,"entry_reference":entry,"stop_reference":stop,"target_reference":target,"risk_distance":risk,"rr":abs(target-entry)/risk,"signal_time":last["time"].isoformat(),"status":"RESEARCH_CANDIDATE","reason":"EA_v1.82_Wyckoff_Spring_UTAD_LPS","research_only":True,"orders_submitted":False,"execution_enabled":False,"live_trading_enabled":False}
                return signal, {}
    return ({"strategy_id":6,"name":STRATEGY_NAMES[6],"direction":0,"status":"SETUP_WAITING","reason":"Wyckoff_phase_not_complete"}, out)


def _with_source_metadata(result: dict[str, Any], market_data: Mapping[str, Any], strategy_id: int) -> dict[str, Any]:
    result = dict(result)
    result["source"] = "NOVA_EA_v1.82"
    result["source_ea_version"] = "1.82"
    family = STRATEGY_FAMILIES.get(strategy_id)
    if family:
        result["strategy_family"] = family
    symbol = market_data.get("symbol")
    timeframe = market_data.get("timeframe")
    if isinstance(symbol, str) and symbol.strip():
        result["symbol"] = symbol.strip()
    if isinstance(timeframe, str) and timeframe.strip():
        result["timeframe"] = timeframe.strip().upper()
    as_of = result.get("signal_time") or market_data.get("server_time")
    if not isinstance(as_of, str):
        raw_bars = market_data.get("bars")
        if isinstance(raw_bars, Sequence) and not isinstance(raw_bars, (str, bytes)) and raw_bars:
            last_bar = raw_bars[-1]
            if isinstance(last_bar, Mapping):
                as_of = last_bar.get("time")
    if isinstance(as_of, str):
        result["as_of_timestamp"] = as_of
    return result


def evaluate_nova_ea_v182_strategy(strategy_id: int, market_data: Mapping[str, Any], state: Mapping[str, Any] | None = None) -> dict[str, Any]:
    if isinstance(strategy_id, bool) or not isinstance(strategy_id, int) or not 0 <= strategy_id < len(STRATEGY_NAMES):
        raise StrategyInputError("strategy_id must be an integer from 0 through 19")
    if not isinstance(market_data, Mapping):
        raise StrategyInputError("market_data must be an object")
    if strategy_id in DISABLED_IDS:
        return _with_source_metadata({"strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id], "direction": 0, "status": "DISABLED_IN_EA_V1_82", "reason": "source_v122_disabled_module"}, market_data, strategy_id)
    if strategy_id not in KEPT_IDS:
        return _with_source_metadata({"strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id], "direction": 0, "status": "REMOVED_FROM_KEPT_MODULE_SET", "reason": "not_in_v122_kept_modules"}, market_data, strategy_id)
    if strategy_id in DORMANT_IDS:
        return _with_source_metadata({"strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id], "direction": 0, "status": "DORMANT_NOT_DISPATCHED", "reason": "registry_entry_has_no_active_signal_dispatch_in_v1_82"}, market_data, strategy_id)
    if strategy_id not in IMPLEMENTED_IDS:
        return _with_source_metadata({"strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id], "direction": 0, "status": "NOT_PORTED", "reason": "active_source_signal_parity_not_yet_implemented"}, market_data, strategy_id)
    if strategy_id == 8:
        return _with_source_metadata(_session_heat(market_data, state), market_data, strategy_id)
    bars = _bars(market_data, minimum=220 if strategy_id == 2 else 210 if strategy_id in {1, 10} else 110)
    if strategy_id == 2:
        return _with_source_metadata(_vol_qex(bars, state), market_data, strategy_id)
    if strategy_id == 10:
        return _with_source_metadata(_flow_matrix(bars, market_data), market_data, strategy_id)
    if strategy_id == 13:
        result, next_state = _smc_full(bars, state)
        result["state"] = next_state
        return _with_source_metadata(result, market_data, strategy_id)
    if strategy_id == 4:
        return _with_source_metadata(_liquidity_pools(bars, state), market_data, strategy_id)
    if strategy_id == 9:
        return _with_source_metadata(_session_box(bars, market_data, state), market_data, strategy_id)
    if strategy_id == 1:
        return _with_source_metadata(_trend_pilot(bars), market_data, strategy_id)
    if strategy_id == 6:
        result, next_state = _wyckoff(bars, state)
        result["state"] = next_state
        return _with_source_metadata(result, market_data, strategy_id)
    raise StrategyInputError("strategy implementation dispatch is inconsistent")


def evaluate_all_nova_ea_v182_strategies(market_data: Mapping[str, Any], states: Mapping[int, Mapping[str, Any]] | None = None) -> list[dict[str, Any]]:
    states = states or {}
    return [evaluate_nova_ea_v182_strategy(i, market_data, states.get(i)) for i in range(20)]
