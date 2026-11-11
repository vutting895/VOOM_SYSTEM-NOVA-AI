"""Deterministic multi-timeframe market-structure research analyzer.

Consumes only completed, timestamped OHLC bars. It produces context and
hypotheses for downstream explanation; it never emits a trading signal or
submits broker actions. Source provenance must be verified separately.
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Any

from workers.feature.smc_wave.smc_strategy import _validate, analyze_smc

TIMEFRAME_SECONDS = {
    "D1": 86_400,
    "H4": 14_400,
    "H1": 3_600,
    "M15": 900,
    "M5": 300,
}
TIMEFRAME_ORDER = ("D1", "H4", "H1", "M15", "M5")
REQUIRED_TIMEFRAMES = ("D1", "H4")
MAX_BARS_PER_TIMEFRAME = 500
DIRECTIONAL_BIASES = {"bullish", "bearish"}


def _parse_aware_utc(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be an ISO-8601 timestamp with timezone")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"{field} must be a valid ISO-8601 timestamp") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field} must include an explicit timezone")
    return parsed.astimezone(timezone.utc)


def _validate_timeframe_bars(
    timeframe: str, candles: list[dict[str, Any]], as_of: datetime
) -> list[datetime]:
    if not isinstance(candles, list) or not 10 <= len(candles) <= MAX_BARS_PER_TIMEFRAME:
        raise ValueError(
            f"{timeframe} must contain between 10 and {MAX_BARS_PER_TIMEFRAME} bars"
        )

    duration = timedelta(seconds=TIMEFRAME_SECONDS[timeframe])
    timestamps: list[datetime] = []
    previous: datetime | None = None
    for index, candle in enumerate(candles):
        if not isinstance(candle, dict):
            raise ValueError(f"{timeframe} candle {index} must be an object")
        timestamp = _parse_aware_utc(candle.get("timestamp"), f"{timeframe} candle {index} timestamp")
        if previous is not None and timestamp <= previous:
            raise ValueError(f"{timeframe} timestamps must be strictly increasing and unique")
        if timestamp + duration > as_of:
            raise ValueError(f"{timeframe} candle {index} is not complete at as_of_utc")
        timestamps.append(timestamp)
        previous = timestamp

    # Reuse the canonical OHLC validator without running the full SMC engine twice.
    _validate(candles)
    return timestamps


def _summarize_h4_222(
    candles: list[dict[str, Any]], timestamps: list[datetime]
) -> dict[str, Any]:
    if len(candles) < 6:
        return {
            "status": "INSUFFICIENT_BARS",
            "hypothesis_id": "NOVA-MTF-001-H4-2-2-2",
            "calendar_anchor_known": False,
            "groups": [],
        }

    last_six = candles[-6:]
    last_times = timestamps[-6:]
    contiguous = all(
        last_times[index + 1] - last_times[index] == timedelta(seconds=14_400)
        for index in range(5)
    )
    if not contiguous:
        return {
            "status": "NOT_COMPUTED_NONCONTIGUOUS_BARS",
            "hypothesis_id": "NOVA-MTF-001-H4-2-2-2",
            "calendar_anchor_known": False,
            "groups": [],
        }

    groups = []
    for position in range(3):
        start = position * 2
        pair = last_six[start:start + 2]
        pair_high = max(float(bar["high"]) for bar in pair)
        pair_low = min(float(bar["low"]) for bar in pair)
        first_close = float(pair[0]["close"])
        last_close = float(pair[-1]["close"])
        groups.append({
            "sequence_position": position + 1,
            "bar_count": 2,
            "start_utc": last_times[start].isoformat().replace("+00:00", "Z"),
            "end_utc": (last_times[start + 1] + timedelta(seconds=14_400)).isoformat().replace("+00:00", "Z"),
            "high": pair_high,
            "low": pair_low,
            "range": pair_high - pair_low,
            "net_close_change": last_close - first_close,
        })

    return {
        "status": "DESCRIPTIVE_SEQUENCE_ONLY",
        "hypothesis_id": "NOVA-MTF-001-H4-2-2-2",
        "calendar_anchor_known": False,
        "interpretation": None,
        "groups": groups,
        "limitations": [
            "Groups are the latest six contiguous observed H4 bars, not a broker-day/session alignment.",
            "Sequence positions are descriptive only; formation/base/expansion labels are not inferred.",
            "The 2-2-2 timing hypothesis is unvalidated and does not produce a directional signal.",
        ],
    }


def analyze_multi_timeframe(
    candles_by_timeframe: Mapping[str, list[dict[str, Any]]],
    as_of_utc: str,
    symbol: str,
) -> dict[str, Any]:
    """Build an auditable D1→H4→H1→M15→M5 context from completed OHLC bars."""
    if not isinstance(candles_by_timeframe, Mapping):
        raise ValueError("candles_by_timeframe must be an object")
    if not isinstance(symbol, str) or not symbol.strip() or len(symbol.strip()) > 64:
        raise ValueError("symbol must be a non-empty string of at most 64 characters")

    unknown = sorted(set(candles_by_timeframe) - set(TIMEFRAME_ORDER))
    if unknown:
        raise ValueError(f"unsupported timeframes: {', '.join(unknown)}")
    missing = [tf for tf in REQUIRED_TIMEFRAMES if tf not in candles_by_timeframe]
    if missing:
        raise ValueError(f"required timeframes missing: {', '.join(missing)}")

    as_of = _parse_aware_utc(as_of_utc, "as_of_utc")
    analyses: dict[str, dict[str, Any]] = {}
    timestamps_by_tf: dict[str, list[datetime]] = {}
    context: dict[str, dict[str, Any]] = {}

    for timeframe in TIMEFRAME_ORDER:
        candles = candles_by_timeframe.get(timeframe)
        if candles is None:
            continue
        timestamps = _validate_timeframe_bars(timeframe, candles, as_of)
        analysis = analyze_smc(candles)
        analyses[timeframe] = analysis
        timestamps_by_tf[timeframe] = timestamps
        latest_open = timestamps[-1]
        latest_close = latest_open + timedelta(seconds=TIMEFRAME_SECONDS[timeframe])
        context[timeframe] = {
            "bars_analyzed": len(candles),
            "first_bar_open_utc": timestamps[0].isoformat().replace("+00:00", "Z"),
            "latest_bar_open_utc": latest_open.isoformat().replace("+00:00", "Z"),
            "latest_bar_close_utc": latest_close.isoformat().replace("+00:00", "Z"),
            "structure_bias": analysis["structure_bias"],
            "latest_structure_event": analysis["latest_structure_event"],
            "confluence_count": analysis["confluence_count"],
        }

    d1_bias = analyses["D1"]["structure_bias"]
    h4_bias = analyses["H4"]["structure_bias"]
    h1_bias = analyses.get("H1", {}).get("structure_bias")
    relations: dict[str, str] = {}
    for timeframe, analysis in analyses.items():
        bias = analysis["structure_bias"]
        if bias not in DIRECTIONAL_BIASES:
            relations[timeframe] = "NEUTRAL_OR_UNCLASSIFIED"
        elif bias == d1_bias:
            relations[timeframe] = "ALIGNED_WITH_D1"
        else:
            relations[timeframe] = "COUNTER_TO_D1"

    market_state = "UNCLASSIFIED"
    state_evidence: list[str] = []
    if d1_bias in DIRECTIONAL_BIASES and h4_bias == d1_bias:
        market_state = "TREND_CONTINUATION_CANDIDATE"
        state_evidence.extend([
            f"D1 and H4 both report {d1_bias} SMC structure bias.",
            "Alignment is a research candidate, not a validated continuation forecast.",
        ])
    elif d1_bias in DIRECTIONAL_BIASES and h4_bias in DIRECTIONAL_BIASES:
        h1_event = analyses.get("H1", {}).get("latest_structure_event")
        if h1_bias == d1_bias:
            market_state = "PULLBACK_CANDIDATE"
            state_evidence.extend([
                f"D1 reports {d1_bias} while H4 reports {h4_bias}.",
                f"H1 has returned to the D1 direction ({d1_bias}); the pullback interpretation is unconfirmed.",
            ])
        elif (
            h1_bias == h4_bias
            and isinstance(h1_event, dict)
            and h1_event.get("type") == "CHoCH"
            and h1_event.get("direction") == h4_bias
        ):
            market_state = "REVERSAL_CANDIDATE"
            state_evidence.extend([
                f"D1 reports {d1_bias} while H4 and H1 report {h4_bias}.",
                "The latest H1 structure event is a CHoCH in the counter-D1 direction; D1 reversal is not confirmed.",
            ])
        else:
            state_evidence.append("D1 and H4 directional structure disagree without sufficient lower-timeframe confirmation.")

    h4_222 = _summarize_h4_222(
        candles_by_timeframe["H4"], timestamps_by_tf["H4"]
    )
    return {
        "ok": True,
        "knowledge_id": "NOVA-MTF-001",
        "analyzer": "nova_mtf_structure_v1",
        "symbol": symbol.strip(),
        "as_of_utc": as_of.isoformat().replace("+00:00", "Z"),
        "data_status": "STRUCTURALLY_VALID_SOURCE_UNVERIFIED",
        "timeframe_order": list(TIMEFRAME_ORDER),
        "timeframe_context": context,
        "relations_to_d1": relations,
        "market_state": market_state,
        "state_evidence": state_evidence,
        "hypotheses": [
            {
                "id": "NOVA-MTF-001-H4-2-2-2",
                "status": h4_222["status"],
                "evidence": "Descriptive statistics for the latest six contiguous H4 bars only.",
            }
        ],
        "h4_2_2_2": h4_222,
        "confidence": None,
        "signal": None,
        "decision": "RESEARCH_ONLY",
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
        "limitations": [
            "OHLC and timestamp structure are checked; broker/source provenance is not verified by this analyzer.",
            "D1/H4/H1 labels are deterministic SMC heuristics, not human-reviewed ground truth.",
            "PULLBACK_CANDIDATE and REVERSAL_CANDIDATE are hypotheses, not confirmed market states.",
            "Support/resistance zones, consolidation and breakout acceptance are not implemented in this version.",
            "No confidence score is emitted until calibration against labelled out-of-sample data is complete.",
            "The H4 2-2-2 grouping is not aligned to a broker-day anchor and is not a trading rule.",
        ],
    }
