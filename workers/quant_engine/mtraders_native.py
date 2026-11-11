"""Deterministic, research-only native implementations of 30 MTRADERS strategy concepts.

The checked-in EA currently exposes module names but not its original module signal
logic. These are newly authored NOVA baselines, not claimed source decompilations.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from math import isfinite
from typing import Any

MTRADERS_STRATEGY_NAMES = (
    "SuperTrend", "KeltnerBreak", "GoldenCross", "RocSurge", "Alligator",
    "Ichimoku", "AwesomeOsc", "HeikinPower", "PsarDot", "VwapBand",
    "FlowMatrix", "HourBias", "PivotWheel", "SessionHeat", "StructureMap",
    "TrendRadar", "VolRegime-Batch", "EffortResult", "ExpertQEXSweep", "FootprintLite",
    "LiquidityPools", "NeuralPilot", "KillZoneBreak", "QEX-LiqSweep", "QEX-VolST",
    "RangeSniper", "SessionBox", "TrendPilot", "VolRegime-QEX", "WyckoffPhase",
)


class StrategyInputError(ValueError):
    """Invalid or unsafe OHLCV input."""


def _bars(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)) or not value:
        raise StrategyInputError("candles must be a non-empty sequence")
    if len(value) > 100_000:
        raise StrategyInputError("candles exceeds the 100000-bar processing limit")
    result: list[dict[str, Any]] = []
    previous = None
    for i, row in enumerate(value):
        if not isinstance(row, Mapping):
            raise StrategyInputError(f"bar {i} must be a mapping")
        item: dict[str, Any] = {}
        for key in ("open", "high", "low", "close"):
            raw = row.get(key)
            if isinstance(raw, bool):
                raise StrategyInputError(f"bar {i}: {key} must be numeric")
            try:
                number = float(raw)
            except (TypeError, ValueError, OverflowError):
                raise StrategyInputError(f"bar {i}: {key} must be numeric") from None
            if not isfinite(number) or number <= 0:
                raise StrategyInputError(f"bar {i}: {key} must be finite and positive")
            item[key] = number
        raw_volume = row.get("volume", 0.0)
        if isinstance(raw_volume, bool):
            raise StrategyInputError(f"bar {i}: volume must be numeric")
        try:
            volume = float(raw_volume)
        except (TypeError, ValueError, OverflowError):
            raise StrategyInputError(f"bar {i}: volume must be numeric") from None
        if not isfinite(volume) or volume < 0:
            raise StrategyInputError(f"bar {i}: volume must be finite and non-negative")
        item["volume"] = volume
        if item["high"] < max(item["open"], item["close"]) or item["low"] > min(item["open"], item["close"]) or item["high"] < item["low"]:
            raise StrategyInputError(f"bar {i}: invalid OHLC bounds")
        stamp = row.get("timestamp")
        if stamp is not None:
            if isinstance(stamp, str):
                raw_stamp = stamp[:-1] + "+00:00" if stamp.endswith("Z") else stamp
                try:
                    stamp = datetime.fromisoformat(raw_stamp)
                except ValueError:
                    raise StrategyInputError(f"bar {i}: invalid ISO-8601 timestamp") from None
            if not isinstance(stamp, datetime) or stamp.tzinfo is None or stamp.utcoffset() is None:
                raise StrategyInputError(f"bar {i}: timestamp must be timezone-aware")
            stamp = stamp.astimezone(timezone.utc)
            if previous is not None and stamp <= previous:
                raise StrategyInputError("timestamps must be strictly increasing")
            previous = stamp
        item["timestamp"] = stamp
        result.append(item)
    return result


def _ema(x: Sequence[float], n: int) -> list[float]:
    a = 2.0 / (n + 1.0)
    out = [float(x[0])]
    for value in x[1:]:
        out.append(a * float(value) + (1.0 - a) * out[-1])
    return out


def _sma(x: Sequence[float], n: int) -> list[float]:
    return [sum(x[max(0, i - n + 1):i + 1]) / min(i + 1, n) for i in range(len(x))]


def _atr(b: list[dict[str, Any]], n: int = 14) -> list[float]:
    c = [x["close"] for x in b]
    tr = [max(x["high"] - x["low"], abs(x["high"] - (c[i - 1] if i else c[i])), abs(x["low"] - (c[i - 1] if i else c[i]))) for i, x in enumerate(b)]
    return _sma(tr, n)


def _rsi(c: Sequence[float], n: int = 14) -> float:
    d = [c[i] - c[i - 1] for i in range(1, len(c))][-n:]
    gain = sum(max(v, 0.0) for v in d) / n
    loss = sum(max(-v, 0.0) for v in d) / n
    return 100.0 if loss == 0 and gain > 0 else 50.0 if loss == 0 else 100.0 - 100.0 / (1.0 + gain / loss)


def _emit(i: int, direction: int, score: float, reason: str, **metrics: Any) -> dict[str, Any]:
    if direction not in (-1, 0, 1):
        raise ValueError("signal direction must be -1, 0, or 1")
    signed = direction * min(1.0, max(0.0, abs(float(score)))) if direction else 0.0
    return {
        "strategy_id": i, "name": MTRADERS_STRATEGY_NAMES[i], "signal": direction,
        "score": round(signed, 6), "status": "RESEARCH_CANDIDATE" if direction else "NO_CANDIDATE",
        "reason": reason, "metrics": metrics, "research_only": True,
        "orders_submitted": False, "execution_enabled": False, "live_trading_enabled": False,
    }


def _evaluate(i: int, b: list[dict[str, Any]]) -> dict[str, Any]:
    c = [x["close"] for x in b]
    h = [x["high"] for x in b]
    l = [x["low"] for x in b]
    v = [x["volume"] for x in b]
    n = len(b)
    a14 = _atr(b, 14)[-1]
    e10, e20, e50 = _ema(c, 10)[-1], _ema(c, 20)[-1], _ema(c, 50)[-1]
    direction = 0
    score = 0.0
    reason = "conditions_not_met"
    metrics: dict[str, Any] = {}

    if i == 0:  # SuperTrend baseline
        direction = 1 if c[-1] > e20 else -1 if c[-1] < e20 else 0
        score = abs(c[-1] - e20) / max(a14 * 2.5, 1e-12)
        reason = "ATR-normalized EMA trend state"
        metrics = {"trend_line_proxy": e20, "atr14": a14}
    elif i == 1:  # KeltnerBreak
        e = _ema(c, 20); a = _atr(b, 20)
        up, dn = e[-1] + 2 * a[-1], e[-1] - 2 * a[-1]
        direction = 1 if c[-1] > up and c[-2] <= e[-2] + 2 * a[-2] else -1 if c[-1] < dn and c[-2] >= e[-2] - 2 * a[-2] else 0
        score = abs(c[-1] - (up if direction > 0 else dn)) / max(a[-1], 1e-12)
        reason = "fresh EMA/ATR channel breakout"
        metrics = {"upper": up, "lower": dn}
    elif i == 2:  # GoldenCross
        f, s = _ema(c, 20), _ema(c, 50)
        direction = 1 if f[-1] > s[-1] else -1 if f[-1] < s[-1] else 0
        score = abs(f[-1] - s[-1]) / max(c[-1] * 0.004, 1e-12)
        reason = "EMA 20/50 crossover-alignment baseline"
        metrics = {"ema20": f[-1], "ema50": s[-1]}
    elif i == 3:  # ROC
        change = c[-1] / c[-11] - 1.0
        direction = 1 if change > 0.002 else -1 if change < -0.002 else 0
        score = abs(change) / 0.02
        reason = "10-bar rate-of-change threshold"
        metrics = {"roc10": change}
    elif i == 4:  # Alligator
        m = [(x["high"] + x["low"]) / 2 for x in b]
        jaw, teeth, lips = _ema(m, 13)[-1], _ema(m, 8)[-1], _ema(m, 5)[-1]
        direction = 1 if lips > teeth > jaw else -1 if lips < teeth < jaw else 0
        score = abs(lips - jaw) / max(c[-1] * 0.01, 1e-12)
        reason = "EMA proxy for jaw/teeth/lips alignment"
        metrics = {"jaw": jaw, "teeth": teeth, "lips": lips}
    elif i == 5:  # Ichimoku, unshifted current-bar cloud
        def mid(k: int) -> float:
            return (max(h[-k:]) + min(l[-k:])) / 2
        conv, base, span_b = mid(9), mid(26), mid(52)
        span_a = (conv + base) / 2
        direction = 1 if c[-1] > max(span_a, span_b) and conv > base else -1 if c[-1] < min(span_a, span_b) and conv < base else 0
        score = abs(conv - base) / max(c[-1] * 0.005, 1e-12)
        reason = "Ichimoku conversion/base and current-cloud alignment"
        metrics = {"conversion": conv, "base": base, "cloud_a": span_a, "cloud_b": span_b}
    elif i == 6:  # Awesome Oscillator
        m = [(x["high"] + x["low"]) / 2 for x in b]
        ao = _sma(m, 5)[-1] - _sma(m, 34)[-1]
        direction = 1 if ao > 0 else -1 if ao < 0 else 0
        score = abs(ao) / max(c[-1] * 0.004, 1e-12)
        reason = "SMA 5/34 median-price oscillator"
        metrics = {"awesome": ao}
    elif i == 7:  # HeikinPower
        hc = [(x["open"] + x["high"] + x["low"] + x["close"]) / 4 for x in b]
        ho = [(b[0]["open"] + b[0]["close"]) / 2]
        for k in range(1, n):
            ho.append((ho[-1] + hc[k - 1]) / 2)
        direction = 1 if hc[-1] > ho[-1] and hc[-2] > ho[-2] else -1 if hc[-1] < ho[-1] and hc[-2] < ho[-2] else 0
        score = abs(hc[-1] - ho[-1]) / max(c[-1] * 0.005, 1e-12)
        reason = "two completed Heikin-Ashi bars agree"
        metrics = {"ha_open": ho[-1], "ha_close": hc[-1]}
    elif i == 8:  # PSAR trend-state approximation
        direction = 1 if e10 > e20 and c[-1] > e10 else -1 if e10 < e20 and c[-1] < e10 else 0
        score = abs(c[-1] - e10) / max(a14, 1e-12)
        reason = "PSAR-family trend-state approximation"
        metrics = {"sar_proxy": e10, "limitation": "EMA proxy; not exact Parabolic SAR"}
    elif i == 9:  # VWAP
        w = b[-20:]; total = sum(x["volume"] for x in w)
        if total > 0:
            vw = sum(((x["high"] + x["low"] + x["close"]) / 3) * x["volume"] for x in w) / total
            direction = 1 if c[-1] > vw else -1 if c[-1] < vw else 0
            score = abs(c[-1] - vw) / max(c[-1] * 0.01, 1e-12)
            metrics = {"vwap20": vw}
        reason = "rolling 20-bar volume-weighted price"
    elif i == 10:  # FlowMatrix
        w = b[-20:]; total = sum(x["volume"] for x in w)
        flow = sum((((x["close"] - x["low"]) - (x["high"] - x["close"])) / max(x["high"] - x["low"], 1e-12)) * x["volume"] for x in w)
        cmf = flow / total if total else 0.0
        direction = 1 if cmf > 0.05 else -1 if cmf < -0.05 else 0
        score = abs(cmf) / 0.25
        reason = "close-location money-flow baseline"
        metrics = {"cmf20": cmf}
    elif i in (11, 13, 22):  # UTC activity modules
        stamp = b[-1].get("timestamp")
        if isinstance(stamp, datetime):
            hour = stamp.hour
            active = (6 <= hour < 11 or 12 <= hour < 17) if i != 22 else (6 <= hour < 10 or 12 <= hour < 16)
            if active:
                lookback = 3 if i == 11 else 4 if i == 13 else 12
                ret = c[-1] / c[-lookback - 1] - 1
                vr = v[-1] / max(sum(v[-20:]) / min(20, n), 1e-12)
                if i != 13 or vr >= 1.2:
                    if i == 22:
                        top, bottom = max(h[-13:-1]), min(l[-13:-1])
                        direction = 1 if c[-1] > top else -1 if c[-1] < bottom else 0
                    else:
                        direction = 1 if ret > 0.001 else -1 if ret < -0.001 else 0
                    score = abs(ret) / 0.01 if i != 13 else min(1.0, vr / 2) * abs(ret) / 0.01
                    metrics = {"utc_hour": hour, "return": ret, "volume_ratio": vr}
        reason = "UTC activity-window momentum/volume heuristic"
    elif i == 12:  # PivotWheel
        w = b[-21:-1]; top, bottom, prior = max(x["high"] for x in w), min(x["low"] for x in w), w[-1]["close"]
        pivot = (top + bottom + prior) / 3
        r1, s1 = 2 * pivot - bottom, 2 * pivot - top
        direction = 1 if c[-1] > r1 else -1 if c[-1] < s1 else 0
        score = abs(c[-1] - pivot) / max(c[-1] * 0.015, 1e-12)
        reason = "rolling prior-range pivot breakout"
        metrics = {"pivot": pivot, "r1": r1, "s1": s1}
    elif i == 14:  # StructureMap, confirmed two-sided pivot
        highs, lows = [], []
        for k in range(2, n - 2):
            if h[k] == max(h[k - 2:k + 3]) and h[k - 2:k + 3].count(h[k]) == 1:
                highs.append(h[k])
            if l[k] == min(l[k - 2:k + 3]) and l[k - 2:k + 3].count(l[k]) == 1:
                lows.append(l[k])
        if highs and c[-1] > highs[-1] and c[-2] <= highs[-1]:
            direction = 1
        elif lows and c[-1] < lows[-1] and c[-2] >= lows[-1]:
            direction = -1
        score = 0.5 if direction else 0.0
        reason = "break of a pivot confirmed by two right-side bars"
        metrics = {"last_confirmed_high": highs[-1] if highs else None, "last_confirmed_low": lows[-1] if lows else None}
    elif i == 15:  # TrendRadar
        e10s, e20s, e50s = _ema(c, 10), _ema(c, 20), _ema(c, 50)
        slope = (e20s[-1] - e20s[-6]) / c[-1]
        direction = 1 if e10s[-1] > e20s[-1] > e50s[-1] and slope > 0 else -1 if e10s[-1] < e20s[-1] < e50s[-1] and slope < 0 else 0
        score = abs(slope) / 0.01
        reason = "EMA 10/20/50 stack and slope"
        metrics = {"slope5": slope}
    elif i == 16:  # VolRegime-Batch
        a5, a20 = _atr(b, 5)[-1], _atr(b, 20)[-1]
        top, bottom = max(h[-20:-1]), min(l[-20:-1])
        direction = 1 if a5 > 1.25 * a20 and c[-1] > top else -1 if a5 > 1.25 * a20 and c[-1] < bottom else 0
        score = abs(a5 / max(a20, 1e-12) - 1)
        reason = "ATR expansion plus prior-range break"
        metrics = {"atr5_over_atr20": a5 / max(a20, 1e-12)}
    elif i in (17, 18, 19, 20, 23, 29):  # volume/liquidity family
        w = b[-20:]; avgv = sum(v[-20:]) / min(20, n); vr = v[-1] / max(avgv, 1e-12)
        top, bottom = max(h[-21:-1]), min(l[-21:-1])
        span = max(h[-1] - l[-1], 1e-12)
        body = abs(c[-1] - b[-1]["open"]) / span
        if i == 17:
            direction = 1 if vr > 1.5 and c[-1] > b[-1]["open"] and body > 0.55 else -1 if vr > 1.5 and c[-1] < b[-1]["open"] and body > 0.55 else 0
            reason = "high relative volume and directional candle effort"
        elif i == 18:
            direction = 1 if l[-1] < bottom and c[-1] > bottom and vr > 1.1 else -1 if h[-1] > top and c[-1] < top and vr > 1.1 else 0
            reason = "prior 20-bar liquidity sweep/reclaim"
        elif i == 19:
            buy = sum(x["volume"] * (x["close"] - x["low"]) / max(x["high"] - x["low"], 1e-12) for x in w)
            total = sum(v[-20:])
            imbalance = (2 * buy - total) / total if total else 0.0
            direction = 1 if imbalance > 0.15 else -1 if imbalance < -0.15 else 0
            score = abs(imbalance)
            reason = "OHLCV close-location volume proxy, not bid/ask footprint"
            metrics = {"imbalance": imbalance, "data_limitation": "NOT_TRUE_BID_ASK_FOOTPRINT"}
        elif i == 20:
            nearh = sum(abs(x - top) <= max(a14 * 0.15, c[-1] * 0.0001) for x in h[-21:-1])
            nearl = sum(abs(x - bottom) <= max(a14 * 0.15, c[-1] * 0.0001) for x in l[-21:-1])
            direction = 1 if nearl >= 2 and l[-1] < bottom and c[-1] > bottom else -1 if nearh >= 2 and h[-1] > top and c[-1] < top else 0
            reason = "repeated-extreme liquidity pool sweep"
            metrics = {"near_equal_highs": nearh, "near_equal_lows": nearl}
        elif i == 23:
            direction = 1 if l[-1] < bottom and c[-1] > bottom and c[-1] > b[-1]["open"] and vr > 1.25 else -1 if h[-1] > top and c[-1] < top and c[-1] < b[-1]["open"] and vr > 1.25 else 0
            reason = "QEX sweep/reclaim with volume and body confirmation"
        else:
            direction = 1 if l[-1] < bottom and c[-1] > bottom and vr > 1.1 else -1 if h[-1] > top and c[-1] < top and vr > 1.1 else 0
            reason = "Wyckoff spring/upthrust heuristic"
        if i not in (19, 20):
            score = abs(vr - 1) / 1.5
        metrics = {**metrics, "volume_ratio": vr}
    elif i == 21:  # NeuralPilot disclosed linear proxy
        mom = c[-1] / c[-6] - 1
        spread = (e20 - e50) / c[-1]
        value = 40 * mom + 25 * spread + 0.004 * ((_rsi(c) - 50) / 50)
        direction = 1 if value > 0.0008 else -1 if value < -0.0008 else 0
        score = abs(value) / 0.01
        reason = "fixed linear proxy; no neural weights or trained model"
        metrics = {"linear_score": value, "model_type": "LINEAR_PROXY_NOT_NEURAL_MODEL"}
    elif i == 24:  # QEX-VolST
        a10, a50 = _atr(b, 10)[-1], _atr(b, 50)[-1]
        mult = 2.0 if a10 > 1.2 * a50 else 3.0 if a10 < 0.85 * a50 else 2.5
        line = e20
        direction = 1 if c[-1] > line else -1 if c[-1] < line else 0
        score = abs(c[-1] - line) / max(a14 * mult, 1e-12)
        reason = "volatility-conditioned SuperTrend-family state"
        metrics = {"atr10_over_atr50": a10 / max(a50, 1e-12), "multiplier": mult}
    elif i == 25:  # RangeSniper
        top, bottom = max(h[-21:-1]), min(l[-21:-1]); loc = (c[-1] - bottom) / max(top - bottom, 1e-12); rsi = _rsi(c)
        direction = 1 if loc < 0.12 and rsi < 35 and c[-1] > c[-2] else -1 if loc > 0.88 and rsi > 65 and c[-1] < c[-2] else 0
        score = abs(0.5 - loc) / 0.5
        reason = "range extreme with RSI and reversal confirmation"
        metrics = {"range_location": loc, "rsi": rsi}
    elif i == 26:  # SessionBox, UTC 00-03 range
        stamp = b[-1].get("timestamp")
        if isinstance(stamp, datetime) and stamp.hour >= 3:
            opening = [x for x in b if x.get("timestamp") and x["timestamp"].date() == stamp.date() and x["timestamp"].hour < 3]
            if len(opening) >= 2:
                top, bottom = max(x["high"] for x in opening), min(x["low"] for x in opening)
                direction = 1 if c[-1] > top else -1 if c[-1] < bottom else 0
                score = abs(c[-1] - (top if direction > 0 else bottom)) / max(a14 * 2, 1e-12)
                metrics = {"box_high": top, "box_low": bottom, "timezone": "UTC"}
        reason = "UTC 00:00-03:00 opening-box breakout"
    elif i == 27:  # TrendPilot
        es20, es50 = _ema(c, 20), _ema(c, 50)
        tol = max(a14 * 0.35, c[-1] * 0.0002)
        up = es20[-1] > es50[-1] and es20[-1] > es20[-4]
        dn = es20[-1] < es50[-1] and es20[-1] < es20[-4]
        direction = 1 if up and abs(c[-2] - es20[-2]) <= tol and c[-1] > es20[-1] else -1 if dn and abs(c[-2] - es20[-2]) <= tol and c[-1] < es20[-1] else 0
        score = abs(es20[-1] - es50[-1]) / max(c[-1] * 0.01, 1e-12)
        reason = "EMA trend alignment with pullback and reclaim"
    elif i == 28:  # VolRegime-QEX
        a10, a50 = _atr(b, 10), _atr(b, 50)
        squeeze, expand = a10[-3] / max(a50[-3], 1e-12), a10[-1] / max(a50[-1], 1e-12)
        top, bottom = max(h[-21:-1]), min(l[-21:-1])
        direction = 1 if squeeze < 0.8 and expand > 1.2 and c[-1] > top else -1 if squeeze < 0.8 and expand > 1.2 and c[-1] < bottom else 0
        score = abs(expand - 1)
        reason = "volatility squeeze-to-expansion and range break"
        metrics = {"compression": squeeze, "expansion": expand}
    return _emit(i, direction, score, reason, **metrics)


def evaluate_mtraders_strategy(strategy_id: int, market_data: Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(strategy_id, bool) or not isinstance(strategy_id, int) or not 0 <= strategy_id < 30:
        raise ValueError("strategy_id must be an integer from 0 through 29")
    if not isinstance(market_data, Mapping):
        raise StrategyInputError("market_data must be a mapping")
    b = _bars(market_data.get("candles"))
    required = {1: 22, 2: 52, 5: 52, 6: 36, 14: 12, 15: 55, 16: 30, 21: 55, 24: 55, 27: 55, 28: 65}.get(strategy_id, 22)
    if len(b) < required:
        return _emit(strategy_id, 0, 0, "insufficient_bars", required=required, provided=len(b))
    if strategy_id in (11, 13, 22, 26) and b[-1].get("timestamp") is None:
        return _emit(strategy_id, 0, 0, "timezone_aware_timestamp_required")
    return _evaluate(strategy_id, b)


def evaluate_all_mtraders_modules(market_data: Mapping[str, Any]) -> list[dict[str, Any]]:
    b = _bars(market_data.get("candles") if isinstance(market_data, Mapping) else None)
    return [evaluate_mtraders_strategy(i, {"candles": b}) for i in range(30)]
