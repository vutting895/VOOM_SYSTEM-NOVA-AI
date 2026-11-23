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
    "SuperTrend", "KeltnerBreak", "GoldenCross", "RocSurge", "Alligator",
    "Ichimoku", "AwesomeOsc", "HeikinPower", "PsarDot", "VwapBand",
    "FlowMatrix", "HourBias", "PivotWheel", "SessionHeat", "StructureMap",
    "TrendRadar", "VolRegime-Batch", "EffortResult", "ExpertQEXSweep", "FootprintLite",
    "LiquidityPools", "NeuralPilot", "KillZoneBreak", "QEX-LiqSweep", "QEX-VolST",
    "RangeSniper", "SessionBox", "TrendPilot", "VolRegime-QEX", "WyckoffPhase",
]
# Explicitly disabled in the v1.82 source comments.
DISABLED_IDS = {0, 12, 18, 24, 25}
# These IDs are still dispatched by EvaluateClosedModule / SignalSATMA in v1.82.
ACTIVE_DISPATCH_IDS = {0, 10, 13, 14, 16, 20, 21, 23, 24, 25, 26, 27, 29}
IMPLEMENTED_IDS = {14, 20, 26, 27, 29}


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


def _atr(bars: list[dict[str, Any]], period: int = 14) -> float:
    tr = []
    for i in range(len(bars) - period, len(bars)):
        prev_close = bars[i - 1]["close"]
        tr.append(max(
            bars[i]["high"] - bars[i]["low"],
            abs(bars[i]["high"] - prev_close),
            abs(bars[i]["low"] - prev_close),
        ))
    value = sum(tr) / len(tr)
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
        return {"strategy_id": 27, "name": STRATEGY_NAMES[27], "direction": 0, "status": "NO_SIGNAL", "reason": "trendpilot_conditions_not_met"}
    atr = _atr(bars)
    return _candidate(direction, closes[i], closes[i] - direction * 1.5 * atr, 2.5, 27, bars[i]["time"], "EA_v1.82_TrendPilot_EMA50_200_RSI45_55")


def _liquidity_pools(bars: list[dict[str, Any]]) -> dict[str, Any]:
    atr = _atr(bars)
    last = bars[-1]
    highs = _confirmed_pivots(bars[:-1], "high")
    lows = _confirmed_pivots(bars[:-1], "low")
    tolerance, pierce = 0.25 * atr, 0.02 * atr
    for pivots, side in ((lows, "low"), (highs, "high")):
        for index, level in pivots:
            touches = [price for _, price in pivots if abs(price - level) <= tolerance]
            if len(touches) < 2:
                continue
            pool = sum(touches) / len(touches)
            if side == "low" and last["low"] < pool - pierce and last["close"] > pool and last["close"] > last["open"]:
                return _candidate(1, last["close"], last["low"] - 0.3 * atr, 2.0, 20, last["time"], "EA_v1.82_LiquidityPools_cluster_sweep_reclaim")
            if side == "high" and last["high"] > pool + pierce and last["close"] < pool and last["close"] < last["open"]:
                return _candidate(-1, last["close"], last["high"] + 0.3 * atr, 2.0, 20, last["time"], "EA_v1.82_LiquidityPools_cluster_sweep_reclaim")
    return {"strategy_id": 20, "name": STRATEGY_NAMES[20], "direction": 0, "status": "NO_SIGNAL", "reason": "no_confirmed_liquidity_cluster_sweep"}


def _smc_full(bars: list[dict[str, Any]], state: Mapping[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any]]:
    state_out = dict(state or {})
    atr = _atr(bars)
    last = bars[-1]
    highs = _confirmed_pivots(bars[:-1], "high")
    lows = _confirmed_pivots(bars[:-1], "low")
    if len(highs) < 2 or len(lows) < 2:
        return ({"strategy_id": 14, "name": STRATEGY_NAMES[14], "direction": 0, "status": "NO_SIGNAL", "reason": "insufficient_confirmed_swings"}, state_out)
    range_high = max(highs[-1][1], highs[-2][1])
    range_low = min(lows[-1][1], lows[-2][1])
    recent = bars[-100:]
    eq = (max(x["high"] for x in recent) + min(x["low"] for x in recent)) / 2.0
    phase = int(state_out.get("phase", 0))
    if phase == 0:
        direction = 1 if last["close"] > highs[-1][1] and last["close"] > last["open"] else -1 if last["close"] < lows[-1][1] and last["close"] < last["open"] else 0
        if not direction:
            return ({"strategy_id": 14, "name": STRATEGY_NAMES[14], "direction": 0, "status": "NO_SIGNAL", "reason": "waiting_for_confirmed_bos"}, state_out)
        prior = bars[-21:-1]
        opposing = next((b for b in reversed(prior) if (b["close"] < b["open"] if direction > 0 else b["close"] > b["open"])), prior[-1])
        fvg = None
        for j in range(len(prior)-1, 1, -1):
            newer, older = prior[j], prior[j-2]
            if direction > 0 and newer["low"] > older["high"]:
                fvg = (older["high"], newer["low"]); break
            if direction < 0 and newer["high"] < older["low"]:
                fvg = (newer["high"], older["low"]); break
        state_out = {
            "phase": direction, "anchor_index": len(bars)-1, "ob_high": opposing["high"],
            "ob_low": opposing["low"], "fvg_low": fvg[0] if fvg else 0.0,
            "fvg_high": fvg[1] if fvg else 0.0, "equilibrium": eq,
            "range_high": range_high, "range_low": range_low,
        }
        return ({"strategy_id": 14, "name": STRATEGY_NAMES[14], "direction": 0, "status": "SETUP_ARMED", "reason": "EA_v1.82_SMC_BOS_wait_retrace"}, state_out)
    age = len(bars) - 1 - int(state_out.get("anchor_index", -1000))
    if age > 30 or (phase > 0 and last["close"] < float(state_out["range_low"]) - 0.2*atr) or (phase < 0 and last["close"] > float(state_out["range_high"]) + 0.2*atr):
        return ({"strategy_id": 14, "name": STRATEGY_NAMES[14], "direction": 0, "status": "SETUP_RESET", "reason": "SMC_setup_expired_or_invalidated"}, {"phase": 0})
    ob_hi, ob_lo = float(state_out["ob_high"]), float(state_out["ob_low"])
    fvg_lo, fvg_hi = float(state_out["fvg_low"]), float(state_out["fvg_high"])
    if phase > 0:
        location = last["close"] <= float(state_out["equilibrium"])
        in_ob = last["low"] <= ob_hi and last["close"] >= ob_lo
        in_fvg = fvg_hi > fvg_lo and last["low"] <= fvg_hi and last["close"] >= fvg_lo
        wick = min(last["open"], last["close"]) - last["low"]
        wick_ok = wick >= 1.5*max(abs(last["open"]-last["close"]), 0.1*atr) and wick >= 0.4*atr
        if location and (in_ob or in_fvg) and wick_ok:
            stop_base = fvg_lo if in_fvg and not in_ob else min(ob_lo, fvg_lo if fvg_hi > fvg_lo else ob_lo)
            signal = _candidate(1, last["close"], stop_base - 0.2*atr, 2.5, 14, last["time"], "EA_v1.82_SMC_BOS_OB_FVG_Discount_Wick")
            return signal, {"phase": 0}
    else:
        location = last["close"] >= float(state_out["equilibrium"])
        in_ob = last["high"] >= ob_lo and last["close"] <= ob_hi
        in_fvg = fvg_hi > fvg_lo and last["high"] >= fvg_lo and last["close"] <= fvg_hi
        wick = last["high"] - max(last["open"], last["close"])
        wick_ok = wick >= 1.5*max(abs(last["open"]-last["close"]), 0.1*atr) and wick >= 0.4*atr
        if location and (in_ob or in_fvg) and wick_ok:
            stop_base = fvg_hi if in_fvg and not in_ob else max(ob_hi, fvg_hi if fvg_hi > fvg_lo else ob_hi)
            signal = _candidate(-1, last["close"], stop_base + 0.2*atr, 2.5, 14, last["time"], "EA_v1.82_SMC_BOS_OB_FVG_Premium_Wick")
            return signal, {"phase": 0}
    return ({"strategy_id": 14, "name": STRATEGY_NAMES[14], "direction": 0, "status": "SETUP_WAITING", "reason": "SMC_retrace_or_rejection_not_confirmed"}, state_out)


def _session_box(bars: list[dict[str, Any]], data: Mapping[str, Any]) -> dict[str, Any]:
    offset = data.get("server_utc_offset_minutes")
    bar_seconds = data.get("bar_seconds")
    if isinstance(offset, bool) or not isinstance(offset, int) or not -720 <= offset <= 840:
        raise StrategyInputError("SessionBox requires server_utc_offset_minutes in [-720, 840]")
    if isinstance(bar_seconds, bool) or not isinstance(bar_seconds, int) or bar_seconds <= 0:
        raise StrategyInputError("SessionBox requires positive bar_seconds")
    last = bars[-1]
    server_time = last["time"] + timedelta(seconds=bar_seconds, minutes=offset)
    day = server_time.date()
    atr = _atr(bars)
    for start_hour, end_hour, tag in ((9, 15, "LONDON"), (15, 20, "NEW_YORK")):
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
        return _candidate(direction, last["close"], stop, 2.0, 26, last["time"], f"EA_v1.82_SessionBox_{tag}_breakout")
    return {"strategy_id": 26, "name": STRATEGY_NAMES[26], "direction": 0, "status": "NO_SIGNAL", "reason": "no_completed_session_box_breakout"}


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
        if len(window) < 24: return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"NO_SIGNAL","reason":"insufficient_wyckoff_history"}, out)
        hi=max(b["high"] for b in window); lo=min(b["low"] for b in window)
        trend=bars[-25]["close"]-bars[-45]["close"]
        if not 1.2*atr <= hi-lo <= 6*atr or abs(trend)<1.5*atr:
            return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"NO_SIGNAL","reason":"no_wyckoff_range"}, out)
        out={"phase":1,"age":0,"hi":hi,"lo":lo,"bias":1 if trend<0 else -1}
        return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"SETUP_ARMED","reason":"Wyckoff_range_armed"}, out)
    out["age"]=int(out.get("age",0))+1
    hi=float(out["hi"]); lo=float(out["lo"]); bias=int(out["bias"])
    if phase == 1:
        if last["close"] < lo-0.1*atr or last["close"] > hi+0.1*atr: return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"SETUP_RESET","reason":"range_invalidated"}, {})
        if bias>0 and last["low"]<lo-0.1*atr and last["close"]>lo and last["volume"]<=avg_volume:
            out.update(phase=2,extreme=last["low"],age=0)
        elif bias<0 and last["high"]>hi+0.1*atr and last["close"]<hi and last["volume"]<=avg_volume:
            out.update(phase=3,extreme=last["high"],age=0)
    elif phase == 2:
        if last["close"]<float(out["extreme"])-0.1*atr: return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"SETUP_RESET","reason":"spring_invalidated"}, {})
        if last["close"]>hi and last["volume"]>=1.5*avg_volume: out.update(phase=4,age=0)
    elif phase == 3:
        if last["close"]>float(out["extreme"])+0.1*atr: return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"SETUP_RESET","reason":"upthrust_invalidated"}, {})
        if last["close"]<lo and last["volume"]>=1.5*avg_volume: out.update(phase=5,age=0)
    elif phase in (4,5):
        direction=1 if phase==4 else -1
        if (direction>0 and last["close"]<float(out["extreme"])-0.1*atr) or (direction<0 and last["close"]>float(out["extreme"])+0.1*atr):
            return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"SETUP_RESET","reason":"wyckoff_extreme_invalidated"}, {})
        lps = (last["low"]<=hi+0.8*atr and last["close"]>hi) if direction>0 else (last["high"]>=lo-0.8*atr and last["close"]<lo)
        if lps:
            entry=last["close"]; stop=float(out["extreme"])-direction*0.3*atr
            target=entry+direction*1.5*(hi-lo)
            risk=direction*(entry-stop)
            if risk>0 and direction*(target-entry)>0:
                signal={"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":direction,"entry_reference":entry,"stop_reference":stop,"target_reference":target,"risk_distance":risk,"rr":abs(target-entry)/risk,"signal_time":last["time"].isoformat(),"status":"RESEARCH_CANDIDATE","reason":"EA_v1.82_Wyckoff_Spring_UTAD_LPS","research_only":True,"orders_submitted":False,"execution_enabled":False,"live_trading_enabled":False}
                return signal, {}
    return ({"strategy_id":29,"name":STRATEGY_NAMES[29],"direction":0,"status":"SETUP_WAITING","reason":"Wyckoff_phase_not_complete"}, out)


def evaluate_nova_ea_v182_strategy(strategy_id: int, market_data: Mapping[str, Any], state: Mapping[str, Any] | None = None) -> dict[str, Any]:
    if isinstance(strategy_id, bool) or not isinstance(strategy_id, int) or not 0 <= strategy_id < len(STRATEGY_NAMES):
        raise StrategyInputError("strategy_id must be an integer from 0 through 29")
    if not isinstance(market_data, Mapping):
        raise StrategyInputError("market_data must be an object")
    if strategy_id in DISABLED_IDS:
        return {"strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id], "direction": 0, "status": "DISABLED_IN_EA_V1_82", "reason": "source_flag_disabled"}
    if strategy_id not in IMPLEMENTED_IDS:
        status = "NOT_PORTED" if strategy_id in ACTIVE_DISPATCH_IDS else "RETIRED_OR_NOT_DISPATCHED"
        return {"strategy_id": strategy_id, "name": STRATEGY_NAMES[strategy_id], "direction": 0, "status": status, "reason": "no_signal_emitted_until_source_parity_is_implemented"}
    bars = _bars(market_data, minimum=210 if strategy_id == 27 else 110)
    if strategy_id == 14:
        result, next_state = _smc_full(bars, state)
        result["state"] = next_state
        return result
    if strategy_id == 20:
        return _liquidity_pools(bars)
    if strategy_id == 26:
        return _session_box(bars, market_data)
    if strategy_id == 27:
        return _trend_pilot(bars)
    if strategy_id == 29:
        result, next_state = _wyckoff(bars, state)
        result["state"] = next_state
        return result
    raise StrategyInputError("strategy implementation dispatch is inconsistent")


def evaluate_all_nova_ea_v182_strategies(market_data: Mapping[str, Any], states: Mapping[int, Mapping[str, Any]] | None = None) -> list[dict[str, Any]]:
    states = states or {}
    return [evaluate_nova_ea_v182_strategy(i, market_data, states.get(i)) for i in range(30)]
