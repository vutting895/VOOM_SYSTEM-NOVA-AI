"""VOOM v6.2.6.3 Wave3 + SMC XGBoost / 60-bar LSTM research and backtest pipeline.
Research only: no broker execution or order-submission code. Features use closed bars;
BUY entries are considered no earlier than the next bar and all strategy gates must pass.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
import torch
from torch import nn
from torch.utils.data import DataLoader
from xgboost import XGBClassifier

HORIZON_BARS = 12
PIVOT_LEFT = 3
PIVOT_RIGHT = 3
STOP_ATR_MULTIPLE = 1.5  # Legacy synthetic-test path only; v6.2.6.3 uses a fixed $5 stop.
REWARD_RISK = 2.0  # Legacy synthetic-test path only; v6.2.6.3 uses 2.2R.
MAX_HOLD_BARS = 12
SLIPPAGE_PRICE_PER_SIDE = 0.02
COMMISSION_PER_LOT_PER_SIDE_USD = 0.0  # Assumption only; the small deal sample cannot verify account commission.
CONTRACT_SIZE = 100.0
PROBABILITY_THRESHOLD = 0.85  # Fixed v6.2.6.3 gate; auto-tuning may not change strategy thresholds.
AUTO_TUNING_TRIALS = 4
AUTO_TUNING_FOLDS = ((0.62, 0.75), (0.82, 0.95))
LSTM_TRAIN_BATCH_SIZE = 256
LSTM_BATCH_SIZE_FALLBACKS = (256, 128, 64)
PROBABILITY_MARGIN = 0.0
XGB_MIN_CONFIDENCE = 0.75
LSTM_MIN_CONFIDENCE = 0.80
ENSEMBLE_XGB_WEIGHT = 0.60
ENSEMBLE_LSTM_WEIGHT = 0.40
LSTM_SEQUENCE_LENGTH = 60
FIXED_STOP_DISTANCE_PRICE = 5.0  # The v6.2.6.3 example explicitly locks gold SL distance to $5.
FIXED_REWARD_RISK = 2.2
FIXED_TARGET_DISTANCE_PRICE = FIXED_STOP_DISTANCE_PRICE * FIXED_REWARD_RISK
FIXED_LOT_SIZE = 0.01  # Conservative interpretation of the explicit final lot lock.
MIN_WAVE1_SIZE_XAU = 10.0
MIN_WAVE1_SIZE_BTC = 500.0
XAU_MAX_SPREAD_PRICE = 0.35
BTC_MAX_SPREAD_PRICE = 50.0
MAX_DAILY_TRADES = 5
MAX_DAILY_LOSS_USD = 500.0
LABEL_NAMES = {0: "short", 1: "hold", 2: "long"}
SEED = 6263

torch.set_num_threads(2)
torch.manual_seed(SEED)

DEFAULT_DATA = "datasets/exness-demo/XAUUSDm_M15_2022-2026.csv"
DEFAULT_MODEL_DIR = "models/wave3_xgb_deep"
DEFAULT_REPORT = "reports/wave3_exness_xauusdm_m15_report.json"


def load_bars(path: str | Path) -> pd.DataFrame:
    """Read and validate the exported MT5 OHLCV/spread history."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"OHLCV dataset not found: {p}")
    frame = pd.read_csv(p)
    required = {"timestamp", "open", "high", "low", "close"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"missing required columns: {sorted(missing)}")
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True, errors="raise")
    frame = frame.sort_values("timestamp", kind="stable").drop_duplicates("timestamp", keep="last").reset_index(drop=True)
    if len(frame) < 3000:
        raise ValueError(f"not enough bars for chronological validation: {len(frame)}")
    for col in ("open", "high", "low", "close"):
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    if "spread_price" not in frame.columns:
        raise ValueError("dataset must include spread_price recorded by MT5")
    frame["spread_price"] = pd.to_numeric(frame["spread_price"], errors="coerce")
    if "tick_volume" in frame.columns:
        frame["volume"] = pd.to_numeric(frame["tick_volume"], errors="coerce")
    elif "volume" not in frame.columns:
        frame["volume"] = 0.0
    else:
        frame["volume"] = pd.to_numeric(frame["volume"], errors="coerce")
    numeric = frame[["open", "high", "low", "close", "spread_price", "volume"]].to_numpy(dtype=float)
    bad = (
        ~np.isfinite(numeric).all(axis=1)
        | (frame["low"].to_numpy() > frame["high"].to_numpy())
        | (frame["open"].to_numpy() < frame["low"].to_numpy())
        | (frame["open"].to_numpy() > frame["high"].to_numpy())
        | (frame["close"].to_numpy() < frame["low"].to_numpy())
        | (frame["close"].to_numpy() > frame["high"].to_numpy())
        | (frame["close"].to_numpy() <= 0)
        | (frame["spread_price"].to_numpy() < 0)
        | (frame["volume"].to_numpy() < 0)
    )
    if bad.any():
        raise ValueError(f"invalid OHLCV/spread rows: {int(bad.sum())}")
    if not frame["timestamp"].is_monotonic_increasing or frame["timestamp"].duplicated().any():
        raise ValueError("timestamps must be strictly chronological and unique")
    return frame


def _bullish_ob_state(close: float, low: float, high: float) -> dict[str, Any]:
    """A bullish OB remains valid until a candle close breaks its lower boundary."""
    distance = max(float(low) - float(close), 0.0, float(close) - float(high))
    valid = float(close) >= float(low)
    return {
        "valid": valid,
        "zone": valid and float(low) <= float(close) <= float(high),
        "within5": valid and distance <= 5.0,
        "distance": distance,
    }


def _bearish_ob_state(close: float, low: float, high: float) -> dict[str, Any]:
    """A bearish OB remains valid until a candle close breaks its upper boundary."""
    distance = max(float(low) - float(close), 0.0, float(close) - float(high))
    valid = float(close) <= float(high)
    return {
        "valid": valid,
        "zone": valid and float(low) <= float(close) <= float(high),
        "within5": valid and distance <= 5.0,
        "distance": distance,
    }


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).replace([np.inf, -np.inf], np.nan).fillna(50.0)


def build_causal_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Create indicators, Fibonacci Wave3 and SMC features available at each bar close."""
    o, h, l, c = (frame[k].astype(float) for k in ("open", "high", "low", "close"))
    n = len(frame)
    f = pd.DataFrame(index=frame.index)
    for lag in (1, 2, 3, 6, 12, 24, 48):
        f[f"return_{lag}"] = c.pct_change(lag)
    for span in (8, 12, 20, 21, 26, 50, 100):
        ema = c.ewm(span=span, adjust=False, min_periods=span).mean()
        f[f"ema_dist_{span}"] = c / ema - 1.0
    for window in (20, 50):
        f[f"sma_dist_{window}"] = c / c.rolling(window, min_periods=window).mean() - 1.0
    prev_close = c.shift(1)
    tr = pd.concat([h - l, (h - prev_close).abs(), (l - prev_close).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    f["atr_price"] = atr
    f["atr_pct"] = atr / c
    f["rsi_14"] = _rsi(c) / 100.0
    for window in (12, 24, 48):
        f[f"realized_vol_{window}"] = c.pct_change().rolling(window, min_periods=window).std()
    mean20 = c.rolling(20, min_periods=20).mean()
    std20 = c.rolling(20, min_periods=20).std().replace(0, np.nan)
    f["zscore_20"] = (c - mean20) / std20
    candle_range = (h - l).replace(0, np.nan)
    f["body_pct"] = (c - o) / c
    f["range_atr"] = (h - l) / atr.replace(0, np.nan)
    f["upper_wick_pct"] = (h - np.maximum(o, c)) / candle_range
    f["lower_wick_pct"] = (np.minimum(o, c) - l) / candle_range
    vol_mean = frame["volume"].rolling(48, min_periods=24).mean()
    vol_std = frame["volume"].rolling(48, min_periods=24).std().replace(0, np.nan)
    f["volume_z_48"] = (frame["volume"] - vol_mean) / vol_std
    f["log_volume"] = np.log1p(frame["volume"].clip(lower=0))
    spread = frame["spread_price"].astype(float)
    f["spread_price"] = spread
    f["spread_pct"] = spread / c
    f["spread_to_atr"] = spread / atr.replace(0, np.nan)
    ts = frame["timestamp"]
    minute_of_day = ts.dt.hour * 60 + ts.dt.minute
    f["hour_sin"] = np.sin(2 * np.pi * minute_of_day / 1440.0)
    f["hour_cos"] = np.cos(2 * np.pi * minute_of_day / 1440.0)
    f["weekday_sin"] = np.sin(2 * np.pi * ts.dt.dayofweek / 7.0)
    f["weekday_cos"] = np.cos(2 * np.pi * ts.dt.dayofweek / 7.0)

    # Swing at p is revealed only at p + PIVOT_RIGHT; historical rows are never revised.
    names = (
        "structure_bias", "bos_up", "bos_down", "choch_up", "choch_down",
        "buy_side_sweep", "sell_side_sweep", "bull_fvg", "bear_fvg",
        "bull_fvg_fill", "bear_fvg_fill", "bull_ob_recent", "bear_ob_recent",
        "bull_ob_zone", "bear_ob_zone", "bull_ob_within5", "bear_ob_within5",
        "bull_ob_age_bars", "bull_ob_distance_price", "bull_ob_range_pct",
        "choch_rule_up", "choch_rule_down", "dist_last_swing_high", "dist_last_swing_low",
        "fib_pullback_ratio", "wave1_size", "wave1_high", "wave2_low",
        "wave1_low_short", "wave2_high_short", "wave3_long_entry_price", "wave3_short_entry_price",
        "wave3_long_fib_score", "wave3_short_fib_score", "wave3_long_rule_breakout", "wave3_short_rule_breakout",
        "wave3_long_zone", "wave3_short_zone", "wave3_long_breakout", "wave3_short_breakout",
    )
    struct = {name: np.zeros(n, dtype=float) for name in names}
    trace_names = (
        "structure_break_pivot_index", "structure_break_pivot_confirmation_index", "structure_break_pivot_price",
        "higher_low_1_index", "higher_low_1_confirmation_index", "higher_low_1_price",
        "higher_low_2_index", "higher_low_2_confirmation_index", "higher_low_2_price",
        "higher_low_3_index", "higher_low_3_confirmation_index", "higher_low_3_price",
        "bull_ob_origin_index", "bull_ob_confirmation_index", "bull_ob_origin_low", "bull_ob_origin_high",
        "bull_ob_origin_range_pct", "bull_ob_age_from_origin_bars", "bull_ob_age_from_confirmation_bars",
        "bull_ob_distance_price_trace", "bull_ob_valid_trace", "bull_ob_zone_trace", "bull_ob_within5_trace",
        "bull_ob_invalidated_now", "bull_ob_candidate_count", "bull_ob_search_start_index",
        "bull_ob_search_end_exclusive_index",
        "bull_ob_last_invalidated_origin_index", "bull_ob_last_invalidated_confirmation_index",
        "bull_ob_last_invalidated_at_index", "bull_ob_last_invalidated_low", "bull_ob_last_invalidated_high",
        "bull_ob_last_invalidated_range_pct", "bull_ob_last_invalidated_distance_price",
        "bull_ob_last_invalidated_candidate_count", "bull_ob_last_invalidated_search_start_index",
        "bull_ob_last_invalidated_search_end_exclusive_index",
        "bull_fvg_active_origin_index", "bull_fvg_active_lower", "bull_fvg_active_upper", "bull_fvg_active_age_bars",
        "bull_fvg_fill_origin_index", "bull_fvg_fill_lower", "bull_fvg_fill_upper", "bull_fvg_fill_age_bars",
        "bull_fvg_first_fill_index", "bull_fvg_first_full_mitigation_index",
        "bull_fvg_fully_mitigated_now", "bull_fvg_created_now", "bull_fvg_created_origin_index",
        "bull_fvg_created_lower", "bull_fvg_created_upper",
    )
    trace = {name: np.full(n, np.nan, dtype=float) for name in trace_names}
    pivots: list[dict[str, Any]] = []
    confirmed_low_prices: list[float] = []
    confirmed_low_indices: list[int] = []
    confirmed_low_confirmation_indices: list[int] = []
    confirmed_high_prices: list[float] = []
    last_high = last_low = None
    broken: set[tuple[str, int]] = set()
    bias = 0
    bull_ob = bear_ob = None
    last_bull_ob_invalidated = None
    last_bull_gap = last_bear_gap = None
    last_bull_gap_first_fill_index = None
    last_bull_gap_first_full_mitigation_index = None

    for i in range(n):
        p = i - PIVOT_RIGHT
        if p >= PIVOT_LEFT:
            wh = h.iloc[p - PIVOT_LEFT:p + PIVOT_RIGHT + 1].to_numpy()
            wl = l.iloc[p - PIVOT_LEFT:p + PIVOT_RIGHT + 1].to_numpy()
            hp, lp = float(h.iloc[p]), float(l.iloc[p])
            candidates = []
            if hp == np.max(wh) and np.count_nonzero(wh == hp) == 1:
                candidates.append({"idx": p, "confirmed": i, "kind": "high", "price": hp})
            if lp == np.min(wl) and np.count_nonzero(wl == lp) == 1:
                candidates.append({"idx": p, "confirmed": i, "kind": "low", "price": lp})
            for point in candidates:
                if point["kind"] == "high":
                    last_high = point
                else:
                    last_low = point
                if pivots and pivots[-1]["kind"] == point["kind"]:
                    extreme = point["price"] > pivots[-1]["price"] if point["kind"] == "high" else point["price"] < pivots[-1]["price"]
                    if extreme:
                        pivots[-1] = point
                        if point["kind"] == "high":
                            confirmed_high_prices[-1] = float(point["price"])
                        else:
                            confirmed_low_prices[-1] = float(point["price"])
                            confirmed_low_indices[-1] = int(point["idx"])
                            confirmed_low_confirmation_indices[-1] = int(point["confirmed"])
                else:
                    pivots.append(point)
                    if point["kind"] == "high":
                        confirmed_high_prices.append(float(point["price"]))
                    else:
                        confirmed_low_prices.append(float(point["price"]))
                        confirmed_low_indices.append(int(point["idx"]))
                        confirmed_low_confirmation_indices.append(int(point["confirmed"]))

        if len(confirmed_low_prices) >= 3:
            for slot, offset in enumerate(range(-3, 0), start=1):
                trace[f"higher_low_{slot}_index"][i] = float(confirmed_low_indices[offset])
                trace[f"higher_low_{slot}_confirmation_index"][i] = float(confirmed_low_confirmation_indices[offset])
                trace[f"higher_low_{slot}_price"][i] = float(confirmed_low_prices[offset])

        close_i = float(c.iloc[i])
        prev_i = float(c.iloc[i - 1]) if i else close_i
        bos_up = bos_down = choch_up = choch_down = 0
        if last_high and last_high["idx"] < i:
            key = ("high", last_high["idx"])
            if key not in broken and prev_i <= last_high["price"] < close_i:
                broken.add(key)
                trace["structure_break_pivot_index"][i] = float(last_high["idx"])
                trace["structure_break_pivot_confirmation_index"][i] = float(last_high["confirmed"])
                trace["structure_break_pivot_price"][i] = float(last_high["price"])
                if bias == -1:
                    choch_up = 1
                else:
                    bos_up = 1
                bias = 1
                # Use the last confirmed swing-low to BOS interval, not an
                # arbitrary eight-bar lookback. OB size (>=0.3%) and $5 proximity
                # remain hard requirements; price invalidation governs OB validity.
                bullish_ob_start = max(0, int(last_low["idx"])) if last_low else max(0, i - 8)
                bullish_ob_candidates = []
                selected_bullish_ob = None
                for j in range(bullish_ob_start, i):
                    candle_size_pct = (float(h.iloc[j]) - float(l.iloc[j])) / max(float(c.iloc[j]), 1e-12)
                    if c.iloc[j] < o.iloc[j] and candle_size_pct >= 0.003:
                        bullish_ob_candidates.append(int(j))
                        selected_bullish_ob = (i, float(l.iloc[j]), float(h.iloc[j]), j, candle_size_pct)
                if selected_bullish_ob is not None:
                    bull_ob = (*selected_bullish_ob, len(bullish_ob_candidates), bullish_ob_start, i)
        if last_low and last_low["idx"] < i:
            key = ("low", last_low["idx"])
            if key not in broken and prev_i >= last_low["price"] > close_i:
                broken.add(key)
                trace["structure_break_pivot_index"][i] = float(last_low["idx"])
                trace["structure_break_pivot_confirmation_index"][i] = float(last_low["confirmed"])
                trace["structure_break_pivot_price"][i] = float(last_low["price"])
                if bias == 1:
                    choch_down = 1
                else:
                    bos_down = 1
                bias = -1
                for j in range(max(0, i - 8), i):
                    candle_size_pct = (float(h.iloc[j]) - float(l.iloc[j])) / max(float(c.iloc[j]), 1e-12)
                    if c.iloc[j] > o.iloc[j] and candle_size_pct >= 0.003:
                        bear_ob = (i, float(l.iloc[j]), float(h.iloc[j]))
        struct["structure_bias"][i] = bias
        struct["bos_up"][i], struct["bos_down"][i] = bos_up, bos_down
        struct["choch_up"][i], struct["choch_down"][i] = choch_up, choch_down
        if last_high:
            struct["dist_last_swing_high"][i] = (close_i - last_high["price"]) / close_i
            if float(h.iloc[i]) > last_high["price"] and close_i < last_high["price"]:
                struct["buy_side_sweep"][i] = 1
        if last_low:
            struct["dist_last_swing_low"][i] = (close_i - last_low["price"]) / close_i
            if float(l.iloc[i]) < last_low["price"] and close_i > last_low["price"]:
                struct["sell_side_sweep"][i] = 1
        if last_bull_gap and 0 < i - last_bull_gap[0] <= 48:
            gap_age = i - last_bull_gap[0]
            trace["bull_fvg_active_origin_index"][i] = float(last_bull_gap[0])
            trace["bull_fvg_active_lower"][i] = float(last_bull_gap[1])
            trace["bull_fvg_active_upper"][i] = float(last_bull_gap[2])
            trace["bull_fvg_active_age_bars"][i] = float(gap_age)
            gap_filled = float(l.iloc[i]) <= last_bull_gap[2] and float(h.iloc[i]) >= last_bull_gap[1]
            struct["bull_fvg_fill"][i] = float(gap_filled)
            if gap_filled:
                trace["bull_fvg_fill_origin_index"][i] = float(last_bull_gap[0])
                trace["bull_fvg_fill_lower"][i] = float(last_bull_gap[1])
                trace["bull_fvg_fill_upper"][i] = float(last_bull_gap[2])
                trace["bull_fvg_fill_age_bars"][i] = float(gap_age)
                if last_bull_gap_first_fill_index is None:
                    last_bull_gap_first_fill_index = i
            if last_bull_gap_first_fill_index is not None:
                trace["bull_fvg_first_fill_index"][i] = float(last_bull_gap_first_fill_index)
            # Diagnostic convention: a bullish gap is fully mitigated when price trades
            # through its lower boundary. This does not alter the existing overlap score.
            fully_mitigated_now = float(l.iloc[i]) <= last_bull_gap[1]
            trace["bull_fvg_fully_mitigated_now"][i] = float(fully_mitigated_now)
            if fully_mitigated_now and last_bull_gap_first_full_mitigation_index is None:
                last_bull_gap_first_full_mitigation_index = i
            if last_bull_gap_first_full_mitigation_index is not None:
                trace["bull_fvg_first_full_mitigation_index"][i] = float(last_bull_gap_first_full_mitigation_index)
        if last_bear_gap and 0 < i - last_bear_gap[0] <= 48:
            struct["bear_fvg_fill"][i] = float(h.iloc[i]) >= last_bear_gap[1] and float(l.iloc[i]) <= last_bear_gap[2]
        if i >= 2:
            struct["bull_fvg"][i] = float(l.iloc[i]) > float(h.iloc[i - 2])
            struct["bear_fvg"][i] = float(h.iloc[i]) < float(l.iloc[i - 2])
            if struct["bull_fvg"][i]:
                last_bull_gap = (i, float(h.iloc[i - 2]), float(l.iloc[i]))
                last_bull_gap_first_fill_index = None
                last_bull_gap_first_full_mitigation_index = None
                trace["bull_fvg_created_now"][i] = 1.0
                trace["bull_fvg_created_origin_index"][i] = float(i)
                trace["bull_fvg_created_lower"][i] = float(h.iloc[i - 2])
                trace["bull_fvg_created_upper"][i] = float(l.iloc[i])
            if struct["bear_fvg"][i]:
                last_bear_gap = (i, float(h.iloc[i]), float(l.iloc[i - 2]))
        if bull_ob:
            ob_age = i - bull_ob[0]
            state = _bullish_ob_state(close_i, bull_ob[1], bull_ob[2])
            struct["bull_ob_age_bars"][i] = float(ob_age)
            struct["bull_ob_distance_price"][i] = float(state["distance"])
            struct["bull_ob_range_pct"][i] = float(bull_ob[4]) if len(bull_ob) > 4 else 0.0
            trace["bull_ob_origin_index"][i] = float(bull_ob[3]) if len(bull_ob) > 3 else np.nan
            trace["bull_ob_confirmation_index"][i] = float(bull_ob[0])
            trace["bull_ob_origin_low"][i] = float(bull_ob[1])
            trace["bull_ob_origin_high"][i] = float(bull_ob[2])
            trace["bull_ob_origin_range_pct"][i] = float(bull_ob[4]) if len(bull_ob) > 4 else 0.0
            trace["bull_ob_age_from_origin_bars"][i] = float(i - bull_ob[3]) if len(bull_ob) > 3 else np.nan
            trace["bull_ob_age_from_confirmation_bars"][i] = float(ob_age)
            trace["bull_ob_distance_price_trace"][i] = float(state["distance"])
            trace["bull_ob_valid_trace"][i] = float(state["valid"])
            trace["bull_ob_zone_trace"][i] = float(state["zone"])
            trace["bull_ob_within5_trace"][i] = float(state["within5"])
            trace["bull_ob_invalidated_now"][i] = float(not state["valid"])
            trace["bull_ob_candidate_count"][i] = float(bull_ob[5]) if len(bull_ob) > 5 else 1.0
            trace["bull_ob_search_start_index"][i] = float(bull_ob[6]) if len(bull_ob) > 6 else np.nan
            trace["bull_ob_search_end_exclusive_index"][i] = float(bull_ob[7]) if len(bull_ob) > 7 else np.nan
            if ob_age <= 24:
                struct["bull_ob_recent"][i] = 1  # diagnostic only; not part of SMC scoring
            if state["valid"]:
                struct["bull_ob_zone"][i] = float(state["zone"])
                struct["bull_ob_within5"][i] = float(state["within5"])
            else:
                last_bull_ob_invalidated = {
                    "origin_index": int(bull_ob[3]) if len(bull_ob) > 3 else None,
                    "confirmation_index": int(bull_ob[0]),
                    "invalidated_at_index": int(i),
                    "low": float(bull_ob[1]),
                    "high": float(bull_ob[2]),
                    "range_pct": float(bull_ob[4]) if len(bull_ob) > 4 else None,
                    "distance_price": float(state["distance"]),
                    "candidate_count": int(bull_ob[5]) if len(bull_ob) > 5 else 1,
                    "search_start_index": int(bull_ob[6]) if len(bull_ob) > 6 else None,
                    "search_end_exclusive_index": int(bull_ob[7]) if len(bull_ob) > 7 else None,
                }
                bull_ob = None  # close below OB low invalidates the bullish block

        if last_bull_ob_invalidated is not None:
            trace["bull_ob_last_invalidated_origin_index"][i] = float(last_bull_ob_invalidated["origin_index"]) if last_bull_ob_invalidated["origin_index"] is not None else np.nan
            trace["bull_ob_last_invalidated_confirmation_index"][i] = float(last_bull_ob_invalidated["confirmation_index"])
            trace["bull_ob_last_invalidated_at_index"][i] = float(last_bull_ob_invalidated["invalidated_at_index"])
            trace["bull_ob_last_invalidated_low"][i] = float(last_bull_ob_invalidated["low"])
            trace["bull_ob_last_invalidated_high"][i] = float(last_bull_ob_invalidated["high"])
            trace["bull_ob_last_invalidated_range_pct"][i] = float(last_bull_ob_invalidated["range_pct"]) if last_bull_ob_invalidated["range_pct"] is not None else np.nan
            trace["bull_ob_last_invalidated_distance_price"][i] = float(last_bull_ob_invalidated["distance_price"])
            trace["bull_ob_last_invalidated_candidate_count"][i] = float(last_bull_ob_invalidated["candidate_count"])
            trace["bull_ob_last_invalidated_search_start_index"][i] = float(last_bull_ob_invalidated["search_start_index"]) if last_bull_ob_invalidated["search_start_index"] is not None else np.nan
            trace["bull_ob_last_invalidated_search_end_exclusive_index"][i] = float(last_bull_ob_invalidated["search_end_exclusive_index"]) if last_bull_ob_invalidated["search_end_exclusive_index"] is not None else np.nan

        if bear_ob:
            ob_age = i - bear_ob[0]
            state = _bearish_ob_state(close_i, bear_ob[1], bear_ob[2])
            if ob_age <= 24:
                struct["bear_ob_recent"][i] = 1
            if state["valid"]:
                struct["bear_ob_zone"][i] = float(state["zone"])
                struct["bear_ob_within5"][i] = float(state["within5"])
            else:
                bear_ob = None  # close above OB high invalidates the bearish block

        struct["choch_rule_up"][i] = (len(confirmed_low_prices) >= 3 and
            confirmed_low_prices[-3] < confirmed_low_prices[-2] < confirmed_low_prices[-1] and close_i > float(o.iloc[i]))
        struct["choch_rule_down"][i] = (len(confirmed_high_prices) >= 3 and
            confirmed_high_prices[-3] > confirmed_high_prices[-2] > confirmed_high_prices[-1] and close_i < float(o.iloc[i]))

        if len(pivots) >= 3:
            a, b, d = pivots[-3:]
            if a["kind"] == "low" and b["kind"] == "high" and d["kind"] == "low":
                impulse = b["price"] - a["price"]
                retrace = (b["price"] - d["price"]) / impulse if impulse > 0 else np.nan
                if d["price"] > a["price"] and 0 < retrace < 1:
                    struct["fib_pullback_ratio"][i] = retrace
                    struct["wave1_size"][i] = impulse
                    struct["wave1_high"][i] = b["price"]
                    struct["wave2_low"][i] = d["price"]
                    entry_price = b["price"] + 0.20 * impulse
                    struct["wave3_long_entry_price"][i] = entry_price
                    in_zone = 0.45 <= retrace <= 0.85
                    struct["wave3_long_zone"][i] = in_zone
                    struct["wave3_long_fib_score"][i] = 95.0 if 0.55 <= retrace <= 0.65 else (80.0 if in_zone else 0.0)
                    if i and in_zone and close_i > b["price"] and prev_i <= b["price"]:
                        struct["wave3_long_breakout"][i] = 1
                    if (i and impulse >= MIN_WAVE1_SIZE_XAU and in_zone and
                            struct["wave3_long_fib_score"][i] >= 80 and
                            close_i >= entry_price and prev_i < entry_price):
                        struct["wave3_long_rule_breakout"][i] = 1
            elif a["kind"] == "high" and b["kind"] == "low" and d["kind"] == "high":
                impulse = a["price"] - b["price"]
                retrace = (d["price"] - b["price"]) / impulse if impulse > 0 else np.nan
                if d["price"] < a["price"] and 0 < retrace < 1:
                    struct["fib_pullback_ratio"][i] = retrace
                    struct["wave1_size"][i] = impulse
                    struct["wave1_low_short"][i] = b["price"]
                    struct["wave2_high_short"][i] = d["price"]
                    entry_price = b["price"] - 0.20 * impulse
                    struct["wave3_short_entry_price"][i] = entry_price
                    in_zone = 0.45 <= retrace <= 0.85
                    struct["wave3_short_zone"][i] = in_zone
                    struct["wave3_short_fib_score"][i] = 95.0 if 0.55 <= retrace <= 0.65 else (80.0 if in_zone else 0.0)
                    if i and in_zone and close_i < b["price"] and prev_i >= b["price"]:
                        struct["wave3_short_breakout"][i] = 1
                    if (i and impulse >= MIN_WAVE1_SIZE_XAU and in_zone and
                            struct["wave3_short_fib_score"][i] >= 80 and
                            close_i <= entry_price and prev_i > entry_price):
                        struct["wave3_short_rule_breakout"][i] = 1
    for name, values in struct.items():
        f[name] = values
    for name, values in trace.items():
        f[name] = values

    # v6.2.6.3 BUY-side hard gates. All inputs are past/current closed-bar data.
    prior_20_high = h.shift(1).rolling(20, min_periods=20).max()
    prior_20_low = l.shift(1).rolling(20, min_periods=20).min()
    f["bos20_prior_20_high"] = prior_20_high
    f["bos20_up"] = (c > prior_20_high).astype(float)
    f["bos20_down"] = (c < prior_20_low).astype(float)
    f["momentum_5_positive"] = (c - c.shift(5) > 0).astype(float)
    f["volume_ema20"] = frame["volume"].ewm(span=20, adjust=False, min_periods=20).mean()
    f["volume_gate"] = (frame["volume"] > 0.8 * f["volume_ema20"]).astype(float)
    f["rsi_buy_gate"] = ((f["rsi_14"] >= 0.50) & (f["rsi_14"] <= 0.70)).astype(float)
    roll_high100 = h.rolling(100, min_periods=100).max()
    roll_low100 = l.rolling(100, min_periods=100).min()
    f["discount_zone"] = (c <= (roll_low100 + roll_high100) / 2.0).fillna(False).astype(float)
    ts_indexed = frame.set_index("timestamp")
    h1_close = ts_indexed["close"].resample("1h", label="right", closed="left").last().dropna()
    h1_ema21 = h1_close.ewm(span=21, adjust=False, min_periods=21).mean()
    h1_ema50 = h1_close.ewm(span=50, adjust=False, min_periods=50).mean()
    h1_trend = (h1_ema21 > h1_ema50).reindex(frame["timestamp"], method="ffill")
    f["h1_trend_up"] = h1_trend.astype("boolean").fillna(False).to_numpy(dtype=float)
    ema21 = c.ewm(span=21, adjust=False, min_periods=21).mean()
    ema50 = c.ewm(span=50, adjust=False, min_periods=50).mean()
    f["deep_trend_gate"] = ((c > ema21) & (ema21 > ema50)).astype(float)
    f["near_fib_618"] = (f["fib_pullback_ratio"].between(0.568, 0.668)).astype(float)
    f["atr_stop_gate"] = (1.5 * f["atr_price"] >= FIXED_STOP_DISTANCE_PRICE).astype(float)
    max_spread = BTC_MAX_SPREAD_PRICE if "BTC" in str(frame.attrs.get("symbol", "")).upper() else XAU_MAX_SPREAD_PRICE
    f["spread_gate"] = (frame["spread_price"] <= max_spread).astype(float)
    f["smc_score_long"] = (30 * f["bos20_up"] + 20 * f["choch_rule_up"] +
                           25 * f["bull_ob_within5"] + 25 * f["bull_fvg_fill"])
    f["smc_score_short"] = (30 * f["bos20_down"] + 20 * f["choch_rule_down"] +
                            25 * f["bear_ob_within5"] + 25 * f["bear_fvg_fill"])
    f["smc_buy_gate"] = (f["smc_score_long"] >= 85).astype(float)
    f["smc_sell_gate"] = (f["smc_score_short"] >= 85).astype(float)
    return f.replace([np.inf, -np.inf], np.nan)


def make_labeled_frame(frame: pd.DataFrame, features: pd.DataFrame | None = None):
    """Labels use a forward horizon but are never included in features."""
    features = features if features is not None else build_causal_features(frame)
    close = frame["close"].astype(float)
    future_move = (close.shift(-HORIZON_BARS) - close).to_numpy()
    atr = features["atr_price"].to_numpy()
    dynamic_move = np.maximum(
        2.0 * frame["spread_price"].astype(float).to_numpy(),
        0.35 * atr * math.sqrt(HORIZON_BARS),
    )
    labels = np.full(len(frame), -1, dtype=np.int8)
    valid_future = np.isfinite(future_move) & np.isfinite(dynamic_move)
    labels[valid_future] = 1
    labels[valid_future & (future_move < -dynamic_move)] = 0
    labels[valid_future & (future_move > dynamic_move)] = 2
    diagnostic_only = [
        "bull_ob_age_bars", "bull_ob_distance_price", "bull_ob_range_pct",
        "structure_break_pivot_index", "structure_break_pivot_confirmation_index", "structure_break_pivot_price",
        "higher_low_1_index", "higher_low_1_confirmation_index", "higher_low_1_price",
        "higher_low_2_index", "higher_low_2_confirmation_index", "higher_low_2_price",
        "higher_low_3_index", "higher_low_3_confirmation_index", "higher_low_3_price",
        "bull_ob_origin_index", "bull_ob_confirmation_index", "bull_ob_origin_low", "bull_ob_origin_high",
        "bull_ob_origin_range_pct", "bull_ob_age_from_origin_bars", "bull_ob_age_from_confirmation_bars",
        "bull_ob_distance_price_trace", "bull_ob_valid_trace", "bull_ob_zone_trace", "bull_ob_within5_trace",
        "bull_ob_invalidated_now", "bull_ob_candidate_count", "bull_ob_search_start_index",
        "bull_ob_search_end_exclusive_index", "bull_ob_last_invalidated_origin_index",
        "bull_ob_last_invalidated_confirmation_index", "bull_ob_last_invalidated_at_index",
        "bull_ob_last_invalidated_low", "bull_ob_last_invalidated_high", "bull_ob_last_invalidated_range_pct",
        "bull_ob_last_invalidated_distance_price", "bull_ob_last_invalidated_candidate_count",
        "bull_ob_last_invalidated_search_start_index", "bull_ob_last_invalidated_search_end_exclusive_index",
        "bull_fvg_active_origin_index", "bull_fvg_active_lower", "bull_fvg_active_upper", "bull_fvg_active_age_bars",
        "bull_fvg_fill_origin_index", "bull_fvg_fill_lower", "bull_fvg_fill_upper", "bull_fvg_fill_age_bars",
        "bull_fvg_first_fill_index", "bull_fvg_first_full_mitigation_index",
        "bull_fvg_fully_mitigated_now", "bull_fvg_created_now", "bull_fvg_created_origin_index",
        "bull_fvg_created_lower", "bull_fvg_created_upper", "bos20_prior_20_high",
    ]
    model_features = features.drop(columns=[name for name in diagnostic_only if name in features.columns])
    valid_features = np.isfinite(model_features.to_numpy()).all(axis=1)
    usable = valid_features & valid_future
    X = model_features.loc[usable].reset_index(drop=True)
    y = pd.Series(labels[usable], name="label", dtype=np.int8)
    meta = frame.loc[usable].reset_index(drop=True).copy()
    meta["source_index"] = np.flatnonzero(usable)
    meta["forward_return_price"] = future_move[usable]
    meta["label_threshold_price"] = dynamic_move[usable]
    return X, y, meta


class LSTMNet(nn.Module):
    """Small CPU-friendly LSTM classifier over the previous 60 closed M15 bars."""
    def __init__(self, input_size: int, hidden_size: int = 32):
        super().__init__()
        self.lstm = nn.LSTM(input_size=input_size, hidden_size=hidden_size, num_layers=2,
                            batch_first=True, dropout=0.10)
        self.head = nn.Sequential(nn.Linear(hidden_size, 32), nn.ReLU(), nn.Dropout(0.10), nn.Linear(32, 3))

    def forward(self, sequences):
        output, _ = self.lstm(sequences)
        return self.head(output[:, -1, :])


class _SequenceDataset(torch.utils.data.Dataset):
    def __init__(self, values: np.ndarray, labels: np.ndarray | None = None,
                 sequence_length: int = LSTM_SEQUENCE_LENGTH,
                 segment_ids: np.ndarray | None = None):
        self.values = np.asarray(values, dtype=np.float32)
        self.labels = None if labels is None else np.asarray(labels, dtype=np.int64)
        self.sequence_length = int(sequence_length)
        if self.labels is not None and len(self.labels) != len(self.values):
            raise ValueError("sequence labels and values must have equal lengths")
        if segment_ids is None:
            self.starts = np.arange(max(0, len(self.values) - self.sequence_length + 1), dtype=int)
        else:
            groups = np.asarray(segment_ids)
            if len(groups) != len(self.values):
                raise ValueError("sequence segment IDs and values must have equal lengths")
            # Never construct an LSTM window across the deliberately frozen OOS gap.
            self.starts = np.asarray([
                start for start in range(max(0, len(self.values) - self.sequence_length + 1))
                if np.all(groups[start:start + self.sequence_length] == groups[start])
            ], dtype=int)

    def __len__(self):
        return len(self.starts)

    def __getitem__(self, index):
        start = int(self.starts[index])
        end = start + self.sequence_length
        sequence = torch.from_numpy(self.values[start:end])
        if self.labels is None:
            return sequence
        return sequence, torch.tensor(self.labels[end - 1], dtype=torch.long)


def _align_probabilities(prob: np.ndarray, classes: np.ndarray) -> np.ndarray:
    aligned = np.zeros((len(prob), 3), dtype=float)
    for i, cls in enumerate(classes):
        aligned[:, int(cls)] = prob[:, i]
    return aligned



def _fit_xgb(X: pd.DataFrame, y: pd.Series, hyperparameters: dict[str, Any] | None = None):
    if set(np.unique(y)) != {0, 1, 2}:
        raise ValueError(f"training split must contain all labels; found={sorted(np.unique(y).tolist())}")
    params = {
        "n_estimators": 140, "max_depth": 4, "learning_rate": 0.04,
        "subsample": 0.85, "colsample_bytree": 0.85, "min_child_weight": 8,
        "reg_lambda": 5.0,
    }
    if hyperparameters:
        params.update(hyperparameters)
    model = XGBClassifier(
        **params, objective="multi:softprob", num_class=3, eval_metric="mlogloss",
        tree_method="hist", n_jobs=4, random_state=SEED, verbosity=0,
    )
    weights = compute_sample_weight(class_weight="balanced", y=y)
    model.fit(X, y, sample_weight=weights, verbose=False)
    return model, params


def _is_lstm_memory_error(error: BaseException) -> bool:
    message = str(error).lower()
    return (
        "not enough memory" in message
        or "out of memory" in message
        or "defaultcpuallocator" in message
    )


def _fit_lstm_once(dataset: _SequenceDataset, y: pd.Series, input_size: int,
                   batch_size: int) -> tuple[LSTMNet, list[float]]:
    """Train one seeded LSTM attempt; isolate locals so a failed attempt can be reclaimed."""
    torch.manual_seed(SEED)
    generator = torch.Generator().manual_seed(SEED)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0, generator=generator)
    lstm = LSTMNet(input_size=input_size)
    counts = np.bincount(y.to_numpy(dtype=int), minlength=3).astype(float)
    class_weights = len(y) / (3.0 * np.maximum(counts, 1.0))
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(class_weights, dtype=torch.float32))
    optimizer = torch.optim.AdamW(lstm.parameters(), lr=0.001, weight_decay=0.0005)
    losses = []
    for epoch in range(4):
        lstm.train()
        total_loss = total_rows = 0.0
        for batch_x, batch_y in loader:
            optimizer.zero_grad(set_to_none=True)
            logits = lstm(batch_x)
            loss = criterion(logits, batch_y)
            loss.backward()
            nn.utils.clip_grad_norm_(lstm.parameters(), max_norm=1.0)
            optimizer.step()
            total_loss += float(loss.detach()) * len(batch_y)
            total_rows += len(batch_y)
        losses.append(round(total_loss / max(total_rows, 1.0), 6))
    lstm.eval()
    return lstm, losses


def _fit_lstm(X: pd.DataFrame, y: pd.Series, segment_ids: np.ndarray | None = None):
    if set(np.unique(y)) != {0, 1, 2}:
        raise ValueError(f"LSTM training split must contain all labels; found={sorted(np.unique(y).tolist())}")
    scaler = StandardScaler()
    scaled = scaler.fit_transform(X).astype(np.float32)
    dataset = _SequenceDataset(scaled, y.to_numpy(dtype=np.int64), segment_ids=segment_ids)
    if len(dataset) < 200:
        raise ValueError(f"not enough sequences for {LSTM_SEQUENCE_LENGTH}-bar LSTM: {len(dataset)}")
    for attempt, batch_size in enumerate(LSTM_BATCH_SIZE_FALLBACKS):
        try:
            lstm, losses = _fit_lstm_once(dataset, y, scaled.shape[1], batch_size)
            setattr(lstm, "_training_losses", losses)
            setattr(lstm, "_training_batch_size", batch_size)
            return scaler, lstm
        except RuntimeError as exc:
            gc.collect()
            if not _is_lstm_memory_error(exc) or attempt == len(LSTM_BATCH_SIZE_FALLBACKS) - 1:
                raise
            next_batch_size = LSTM_BATCH_SIZE_FALLBACKS[attempt + 1]
            print(
                f"LSTM CPU memory pressure at batch_size={batch_size}; retrying "
                f"deterministically at batch_size={next_batch_size}",
                flush=True,
            )
    raise RuntimeError("LSTM training exhausted all CPU-memory batch-size fallbacks")


def _build_models(X: pd.DataFrame, y: pd.Series,
                  xgb_hyperparameters: dict[str, Any] | None = None,
                  segment_ids: np.ndarray | None = None):
    xgb, selected_params = _fit_xgb(X, y, xgb_hyperparameters)
    scaler, lstm = _fit_lstm(X, y, segment_ids=segment_ids)
    setattr(xgb, "_voom_hyperparameters", selected_params)
    return xgb, scaler, lstm


def _predict_lstm_probabilities(X: pd.DataFrame, scaler, lstm,
                                context_features: pd.DataFrame | None = None) -> np.ndarray:
    if context_features is not None and len(context_features):
        history = context_features.tail(LSTM_SEQUENCE_LENGTH - 1)
        combined = pd.concat([history, X], ignore_index=True)
        prediction_count = len(X)
    else:
        combined = X.reset_index(drop=True)
        prediction_count = max(0, len(combined) - LSTM_SEQUENCE_LENGTH + 1)
    scaled = scaler.transform(combined).astype(np.float32)
    dataset = _SequenceDataset(scaled, labels=None)
    loader = DataLoader(dataset, batch_size=512, shuffle=False, num_workers=0)
    lstm = lstm.eval()
    chunks = []
    with torch.no_grad():
        for batch_x in loader:
            chunks.append(torch.softmax(lstm(batch_x), dim=1).cpu().numpy())
    probabilities = np.concatenate(chunks, axis=0) if chunks else np.empty((0, 3), dtype=float)
    if context_features is not None and len(context_features):
        probabilities = probabilities[-prediction_count:]
        if len(probabilities) != len(X):
            raise RuntimeError(f"LSTM prediction rows mismatch: expected={len(X)} actual={len(probabilities)}")
    return probabilities


def predict_model_probabilities(X: pd.DataFrame, models, context_features: pd.DataFrame | None = None):
    """Return independent XGB/LSTM probabilities; context supplies preceding known bars for the LSTM."""
    xgb, scaler, lstm = models[:3]
    xgb_prob = _align_probabilities(xgb.predict_proba(X), np.asarray(xgb.classes_))
    lstm_prob = _predict_lstm_probabilities(X, scaler, lstm, context_features)
    if context_features is None or not len(context_features):
        xgb_prob = xgb_prob[-len(lstm_prob):]
    if len(xgb_prob) != len(lstm_prob):
        raise RuntimeError(f"XGB/LSTM prediction rows mismatch: xgb={len(xgb_prob)} lstm={len(lstm_prob)}")
    return xgb_prob, lstm_prob


def predict_ensemble(X: pd.DataFrame, models, context_features: pd.DataFrame | None = None) -> np.ndarray:
    xgb_prob, lstm_prob = predict_model_probabilities(X, models, context_features)
    return ENSEMBLE_XGB_WEIGHT * xgb_prob + ENSEMBLE_LSTM_WEIGHT * lstm_prob


def load_saved_models(model_dir: str | Path):
    """Reload the committed artifacts; return models and the exact feature schema."""
    root = Path(model_dir)
    xgb = XGBClassifier()
    xgb.load_model(str(root / "xgb_model.json"))
    bundle = torch.load(root / "deep_lstm.pt", map_location="cpu", weights_only=False)
    lstm = LSTMNet(input_size=int(bundle["input_size"]), hidden_size=int(bundle["hidden_size"]))
    lstm.load_state_dict(bundle["state_dict"])
    lstm.eval()
    return xgb, bundle["scaler"], lstm, list(bundle["feature_columns"])


def _classification_metrics(y: np.ndarray, pred: np.ndarray) -> dict[str, Any]:
    actual_counts = np.bincount(np.asarray(y, dtype=int), minlength=3)
    predicted_counts = np.bincount(np.asarray(pred, dtype=int), minlength=3)
    majority_baseline = float(actual_counts.max()) / len(y) if len(y) else 0.0
    always_hold_baseline = float(np.mean(np.asarray(y) == 1)) if len(y) else 0.0
    return {
        "samples": int(len(y)),
        "accuracy_pct": round(100 * float(accuracy_score(y, pred)), 4),
        "balanced_accuracy_pct": round(100 * float(balanced_accuracy_score(y, pred)), 4),
        "macro_f1_pct": round(100 * float(f1_score(y, pred, labels=[0, 1, 2], average="macro", zero_division=0)), 4),
        "majority_class_baseline_accuracy_pct": round(100 * majority_baseline, 4),
        "always_hold_baseline_accuracy_pct": round(100 * always_hold_baseline, 4),
        "beats_majority_baseline": bool(float(accuracy_score(y, pred)) > majority_baseline),
        "actual_class_distribution": {LABEL_NAMES[k]: int(actual_counts[k]) for k in LABEL_NAMES},
        "predicted_class_distribution": {LABEL_NAMES[k]: int(predicted_counts[k]) for k in LABEL_NAMES},
        "labels_order": ["short", "hold", "long"],
        "confusion_matrix_rows_actual_cols_predicted": confusion_matrix(y, pred, labels=[0, 1, 2]).tolist(),
        "per_class": classification_report(y, pred, labels=[0, 1, 2], target_names=["short", "hold", "long"],
                                           output_dict=True, zero_division=0),
    }


def load_news_calendar(path: str | Path | None, frame: pd.DataFrame) -> np.ndarray | None:
    """Return per-bar safe flags; missing/untimed high-impact events fail closed."""
    if path is None:
        return None
    news_path = Path(path)
    if not news_path.is_file():
        raise FileNotFoundError(f"news calendar not found: {news_path}")
    news = pd.read_csv(news_path)
    if "timestamp" not in news.columns or "impact" not in news.columns:
        raise ValueError("news calendar CSV must contain timestamp and impact columns")
    impact = news["impact"].astype(str).str.strip().str.lower()
    high = impact.isin({"high", "high impact", "critical", "red", "3", "3.0"})
    high_news = news.loc[high].copy()
    if high_news.empty:
        raise ValueError("news calendar contains no high-impact events; refusing to mark all bars safe")

    bars = pd.to_datetime(frame["timestamp"], utc=True)
    event_times = pd.to_datetime(high_news["timestamp"], utc=True, errors="raise")
    if event_times.isna().any():
        raise ValueError("high-impact news events must have non-missing timestamps")
    if event_times.isna().any():
        raise ValueError("high-impact news events must have non-missing timestamps")

    # MQL5 CalendarValueHistory uses the broker trade-server timezone. Exness
    # documents GMT+0, so exported event times are explicitly UTC. The export
    # repeats its requested coverage window to prevent partial calendars being
    # accepted as if they covered the whole backtest.
    coverage_columns = {"coverage_start_utc", "coverage_end_exclusive_utc"}
    if coverage_columns.issubset(high_news.columns):
        starts = pd.to_datetime(high_news["coverage_start_utc"], utc=True, errors="raise").dropna().unique()
        ends = pd.to_datetime(high_news["coverage_end_exclusive_utc"], utc=True, errors="raise").dropna().unique()
        if len(starts) != 1 or len(ends) != 1:
            raise ValueError("news calendar must declare one consistent UTC coverage window")
        coverage_start = pd.Timestamp(starts[0])
        coverage_end = pd.Timestamp(ends[0])
        if bars.min() < coverage_start or bars.max() >= coverage_end:
            raise ValueError(
                f"news calendar coverage {coverage_start}..{coverage_end} does not contain "
                f"market data {bars.min()}..{bars.max()}"
            )
    elif "calendar_source" in high_news.columns and high_news["calendar_source"].astype(str).str.contains(
        "MQL5 Economic Calendar", case=False, regex=False
    ).any():
        raise ValueError("MQL5 calendar export is missing its UTC coverage metadata")

    if "time_mode" in high_news.columns:
        modes = high_news["time_mode"].fillna("unknown").astype(str).str.strip().str.lower()
    else:
        # Legacy third-party CSVs are assumed to contain exact release times.
        modes = pd.Series("datetime", index=high_news.index)

    exact_mode = modes.eq("datetime")
    # Events with date-only, not-published, tentative or unknown times block
    # the complete UTC day. This is deliberately conservative, not a gate relaxation.
    full_day_mode = ~exact_mode
    unsafe_days = pd.DatetimeIndex(event_times.loc[full_day_mode].dt.normalize().unique())
    day_block = bars.dt.normalize().isin(unsafe_days).to_numpy()

    exact_events = event_times.loc[exact_mode]
    if len(exact_events):
        # Normalize both timestamp arrays to nanoseconds before integer comparison.
        # pandas can preserve microsecond resolution for parsed CSV timestamps while
        # market bars may use nanoseconds; mixing raw int64 values creates a 1000x
        # unit mismatch and can incorrectly blacklist every bar.
        events = exact_events.sort_values().dt.as_unit("ns").astype("int64").to_numpy()
        bar_ns = bars.dt.as_unit("ns").astype("int64").to_numpy()
        positions = np.searchsorted(events, bar_ns)
        before_idx = np.clip(positions - 1, 0, len(events) - 1)
        after_idx = np.clip(positions, 0, len(events) - 1)
        seconds = 30 * 60 * 1_000_000_000
        before_dist = np.abs(bar_ns - events[before_idx])
        after_dist = np.abs(bar_ns - events[after_idx])
        near_event = np.minimum(before_dist, after_dist) <= seconds
    else:
        near_event = np.zeros(len(frame), dtype=bool)
    return ~(day_block | near_event)


def _news_backtest_assumption(news_safe: np.ndarray | None) -> str:
    """Describe the actual news-filter state recorded in the model manifest."""
    if news_safe is None:
        return "no historical high-impact calendar supplied; entries fail closed"
    safe_count = int(np.asarray(news_safe, dtype=bool).sum())
    total_count = int(len(news_safe))
    return (
        "validated historical high-impact calendar applied; "
        f"{safe_count}/{total_count} market bars passed exact-time +/-30-minute "
        "and untimed-event full-day exclusions"
    )


def _news_calendar_manifest(path: str | Path | None,
                            news_safe: np.ndarray | None,
                            total_bars: int) -> dict[str, Any]:
    """Record the exact calendar source and the market-bar exclusion result."""
    total = int(total_bars)
    if path is None or news_safe is None:
        return {
            "provided": False,
            "path": None,
            "sha256": None,
            "event_rows": 0,
            "high_impact_event_rows": 0,
            "time_mode_counts": {},
            "calendar_source": [],
            "calendar_timezone": [],
            "coverage_start_utc": None,
            "coverage_end_exclusive_utc": None,
            "market_bars_total": total,
            "market_bars_news_safe": 0,
            "market_bars_blocked": total,
        }

    calendar_path = Path(path)
    calendar = pd.read_csv(calendar_path)
    impact = calendar.get("impact", pd.Series("", index=calendar.index)).astype(str).str.strip().str.lower()
    high = impact.isin({"high", "high impact", "critical", "red", "3", "3.0"})
    high_calendar = calendar.loc[high]
    if "time_mode" in high_calendar.columns:
        modes = high_calendar["time_mode"].fillna("unknown").astype(str).str.strip().str.lower()
    else:
        modes = pd.Series("datetime", index=high_calendar.index)
    safe_count = int(np.asarray(news_safe, dtype=bool).sum())
    source_values = sorted(high_calendar["calendar_source"].dropna().astype(str).unique().tolist()) if "calendar_source" in high_calendar.columns else []
    timezone_values = sorted(high_calendar["calendar_timezone"].dropna().astype(str).unique().tolist()) if "calendar_timezone" in high_calendar.columns else []
    starts = sorted(high_calendar["coverage_start_utc"].dropna().astype(str).unique().tolist()) if "coverage_start_utc" in high_calendar.columns else []
    ends = sorted(high_calendar["coverage_end_exclusive_utc"].dropna().astype(str).unique().tolist()) if "coverage_end_exclusive_utc" in high_calendar.columns else []
    return {
        "provided": True,
        "path": calendar_path.as_posix(),
        "sha256": hashlib.sha256(calendar_path.read_bytes()).hexdigest(),
        "event_rows": int(len(calendar)),
        "high_impact_event_rows": int(len(high_calendar)),
        "time_mode_counts": {str(key): int(value) for key, value in modes.value_counts(dropna=False).sort_index().items()},
        "calendar_source": source_values,
        "calendar_timezone": timezone_values,
        "coverage_start_utc": starts[0] if len(starts) == 1 else None,
        "coverage_end_exclusive_utc": ends[0] if len(ends) == 1 else None,
        "market_bars_total": total,
        "market_bars_news_safe": safe_count,
        "market_bars_blocked": max(total - safe_count, 0),
    }


def backtest_window(frame: pd.DataFrame, features: pd.DataFrame, source_indices: np.ndarray,
                    probabilities: np.ndarray, start_equity: float = 10000.0,
                    contract_size: float = CONTRACT_SIZE,
                    probability_threshold: float = PROBABILITY_THRESHOLD,
                    probability_margin: float = PROBABILITY_MARGIN,
                    xgb_probabilities: np.ndarray | None = None,
                    lstm_probabilities: np.ndarray | None = None,
                    news_safe: np.ndarray | None = None,
                    require_news_calendar: bool = True) -> dict[str, Any]:
    """Single-position, next-bar execution simulation over a strictly held-out window."""
    if len(source_indices) == 0:
        return {"trade_count": 0, "reason": "no valid prediction rows"}
    end_i = int(source_indices[-1])
    prob_by_index = {int(i): p for i, p in zip(source_indices, probabilities)}
    xgb_values = probabilities if xgb_probabilities is None else xgb_probabilities
    lstm_values = probabilities if lstm_probabilities is None else lstm_probabilities
    xgb_by_index = {int(i): p for i, p in zip(source_indices, xgb_values)}
    lstm_by_index = {int(i): p for i, p in zip(source_indices, lstm_values)}
    strict_rules = "wave3_long_rule_breakout" in features.columns
    equity = float(start_equity)
    peak = equity
    max_dd = 0.0
    trades: list[dict[str, Any]] = []
    daily_trade_count: dict[str, int] = {}
    daily_net_pnl: dict[str, float] = {}
    busy_until = -1
    for item in source_indices:
        i = int(item)
        if i <= busy_until or i + 1 > end_i or i + 1 >= len(frame):
            continue
        rowf = features.iloc[i]
        p = prob_by_index[i]
        p_xgb = xgb_by_index[i]
        p_lstm = lstm_by_index[i]
        entry_i = i + 1
        if entry_i > end_i or entry_i >= len(frame):
            continue
        entry_day = pd.Timestamp(frame["timestamp"].iloc[entry_i]).strftime("%Y-%m-%d")
        if daily_trade_count.get(entry_day, 0) >= MAX_DAILY_TRADES or daily_net_pnl.get(entry_day, 0.0) <= -MAX_DAILY_LOSS_USD:
            continue

        if strict_rules:
            required_technical = (
                "wave3_long_rule_breakout", "wave3_long_fib_score", "smc_score_long",
                "rsi_buy_gate", "momentum_5_positive", "volume_gate", "near_fib_618",
                "discount_zone", "h1_trend_up", "deep_trend_gate", "choch_rule_up",
                "atr_stop_gate", "spread_gate",
            )
            if any(name not in rowf.index for name in required_technical):
                raise RuntimeError("incomplete v6.2.6.3 feature schema; refusing to simulate entry")
            setup_long = bool(rowf["wave3_long_rule_breakout"] and rowf["wave3_long_fib_score"] >= 80
                              and rowf["smc_score_long"] >= 85)
            xgb_ok = int(np.argmax(p_xgb)) == 2 and p_xgb[2] >= XGB_MIN_CONFIDENCE
            lstm_ok = int(np.argmax(p_lstm)) == 2 and p_lstm[2] >= LSTM_MIN_CONFIDENCE
            ensemble_ok = int(np.argmax(p)) == 2 and p[2] >= PROBABILITY_THRESHOLD
            technical_ok = all(float(rowf[k]) >= 1.0 for k in (
                "rsi_buy_gate", "momentum_5_positive", "volume_gate", "near_fib_618",
                "discount_zone", "h1_trend_up", "deep_trend_gate", "choch_rule_up",
                "atr_stop_gate", "spread_gate",
            ))
            news_ok = (news_safe is not None and bool(news_safe[i]) and bool(news_safe[entry_i]))
            if not require_news_calendar and news_safe is None:
                news_ok = True
            long_signal = setup_long and xgb_ok and lstm_ok and ensemble_ok and technical_ok and news_ok
            # The user supplied BUY contract only; do not invent unapproved SELL rules.
            short_signal = False
        else:
            # Synthetic unit-test compatibility only; real pipeline data always uses strict rules.
            setup_long = bool(rowf.get("wave3_long_breakout", 0) and
                              (rowf.get("bos_up", 0) or rowf.get("choch_up", 0) or rowf.get("bull_fvg", 0) or
                               rowf.get("bull_ob_zone", 0) or rowf.get("sell_side_sweep", 0)))
            xgb_ok = int(np.argmax(p_xgb)) == 2 and p_xgb[2] >= XGB_MIN_CONFIDENCE
            lstm_ok = int(np.argmax(p_lstm)) == 2 and p_lstm[2] >= LSTM_MIN_CONFIDENCE
            ensemble_ok = int(np.argmax(p)) == 2 and p[2] >= probability_threshold
            long_signal = setup_long and xgb_ok and lstm_ok and ensemble_ok
            short_signal = False
        if not long_signal or short_signal:
            continue

        entry_spread = float(frame["spread_price"].iloc[entry_i])
        if strict_rules and entry_spread > XAU_MAX_SPREAD_PRICE:
            continue
        signal_atr = float(rowf["atr_price"])
        if not np.isfinite(signal_atr) or signal_atr <= 0:
            continue
        long = True
        if strict_rules:
            stop_dist = FIXED_STOP_DISTANCE_PRICE
            entry_level = float(rowf["wave3_long_entry_price"])
            if float(frame["high"].iloc[entry_i]) < entry_level:
                continue
            raw_entry = max(float(frame["open"].iloc[entry_i]), entry_level)
            entry = raw_entry + entry_spread + SLIPPAGE_PRICE_PER_SIDE
            lots = FIXED_LOT_SIZE
            stop, target = entry - FIXED_STOP_DISTANCE_PRICE, entry + FIXED_TARGET_DISTANCE_PRICE
        else:
            stop_dist = max(STOP_ATR_MULTIPLE * signal_atr, entry_spread * 2)
            entry = float(frame["open"].iloc[entry_i]) + entry_spread + SLIPPAGE_PRICE_PER_SIDE
            lots = FIXED_LOT_SIZE
            stop, target = entry - stop_dist, entry + stop_dist * REWARD_RISK
        trade_end = min(end_i, entry_i + MAX_HOLD_BARS)
        exit_i, exit_price, exit_reason = trade_end, None, "time_exit"
        for j in range(entry_i, trade_end + 1):
            spr = float(frame["spread_price"].iloc[j])
            if long:
                stop_hit = float(frame["low"].iloc[j]) <= stop
                target_hit = float(frame["high"].iloc[j]) >= target
            else:
                ask_high = float(frame["high"].iloc[j]) + spr
                ask_low = float(frame["low"].iloc[j]) + spr
                stop_hit, target_hit = ask_high >= stop, ask_low <= target
            # Conservative: stop first if both SL and TP touched in the same OHLC bar.
            if stop_hit:
                exit_i, exit_reason = j, "stop_loss"
                if long:
                    # A BUY stop crossed by an opening gap fills at the worse
                    # executable open, not at the stale stop barrier.
                    stop_fill = min(stop, float(frame["open"].iloc[j])) if j > entry_i else stop
                    exit_price = stop_fill - SLIPPAGE_PRICE_PER_SIDE
                else:
                    exit_price = stop + SLIPPAGE_PRICE_PER_SIDE
                break
            if target_hit:
                exit_i, exit_reason = j, "take_profit"
                exit_price = target - SLIPPAGE_PRICE_PER_SIDE if long else target + SLIPPAGE_PRICE_PER_SIDE
                break
        if exit_price is None:
            spr = float(frame["spread_price"].iloc[exit_i])
            mark = float(frame["close"].iloc[exit_i])
            exit_price = mark - SLIPPAGE_PRICE_PER_SIDE if long else mark + spr + SLIPPAGE_PRICE_PER_SIDE
        gross = ((exit_price - entry) if long else (entry - exit_price)) * lots * contract_size
        commission = 2 * lots * COMMISSION_PER_LOT_PER_SIDE_USD
        net = gross - commission
        equity += net
        peak = max(peak, equity)
        if peak > 0:
            max_dd = max(max_dd, (peak - equity) / peak)
        exit_day = pd.Timestamp(frame["timestamp"].iloc[exit_i]).strftime("%Y-%m-%d")
        daily_trade_count[entry_day] = daily_trade_count.get(entry_day, 0) + 1
        daily_net_pnl[exit_day] = daily_net_pnl.get(exit_day, 0.0) + net
        trades.append({
            "signal_timestamp": frame["timestamp"].iloc[i].isoformat(),
            "entry_timestamp": frame["timestamp"].iloc[entry_i].isoformat(),
            "exit_timestamp": frame["timestamp"].iloc[exit_i].isoformat(),
            "direction": "BUY",
            "p_xgb_buy": round(float(p_xgb[2]), 6), "p_lstm_buy": round(float(p_lstm[2]), 6),
            "p_ensemble_buy": round(float(p[2]), 6),
            "p_short": round(float(p[0]), 6), "p_hold": round(float(p[1]), 6), "p_long": round(float(p[2]), 6),
            "entry_price": round(entry, 5), "stop_price": round(stop, 5),
            "take_profit_price": round(target, 5), "exit_price": round(exit_price, 5),
            "exit_reason": exit_reason, "lots": lots, "gross_pnl_usd": round(gross, 4),
            "commission_usd": round(commission, 4), "net_pnl_usd": round(net, 4),
            "equity_after_usd": round(equity, 4), "bars_held": int(exit_i - entry_i),
        })
        busy_until = exit_i
    wins = [t for t in trades if t["net_pnl_usd"] > 0]
    losses = [t for t in trades if t["net_pnl_usd"] < 0]
    gross_win = sum(t["net_pnl_usd"] for t in wins)
    gross_loss_abs = abs(sum(t["net_pnl_usd"] for t in losses))
    net = sum(t["net_pnl_usd"] for t in trades)
    return {
        "trade_count": len(trades),
        "win_rate_pct": round(100 * len(wins) / len(trades), 4) if trades else None,
        "net_profit_usd": round(net, 4), "return_pct": round((equity / start_equity - 1) * 100, 4),
        "profit_factor": round(gross_win / gross_loss_abs, 4) if gross_loss_abs else (None if not gross_win else "undefined_no_losses"),
        "max_drawdown_closed_equity_pct": round(max_dd * 100, 4),
        "avg_trade_usd": round(net / len(trades), 4) if trades else None,
        "avg_win_usd": round(float(np.mean([t["net_pnl_usd"] for t in wins])), 4) if wins else None,
        "avg_loss_usd": round(float(np.mean([t["net_pnl_usd"] for t in losses])), 4) if losses else None,
        "final_equity_usd": round(equity, 4), "trades": trades,
    }


def _train_mask(meta: pd.DataFrame, test_start: pd.Timestamp) -> np.ndarray:
    """Purge by source-bar label endpoint, including market closures."""
    if not {"timestamp", "source_index"}.issubset(meta.columns):
        raise ValueError("training metadata requires timestamp and source_index")
    timestamps = pd.to_datetime(meta["timestamp"], utc=True)
    source_indices = pd.to_numeric(meta["source_index"], errors="raise").to_numpy(dtype=np.int64)
    test_start = pd.Timestamp(test_start)
    test_start = test_start.tz_localize("UTC") if test_start.tzinfo is None else test_start.tz_convert("UTC")
    test_rows = np.flatnonzero((timestamps >= test_start).to_numpy())
    if len(test_rows) == 0:
        raise ValueError("test_start_not_present_in_source_metadata")
    first_test_source_index = int(source_indices[test_rows[0]])
    # A training label at source index i reads close[i + HORIZON_BARS].
    # Its final source bar must be strictly before the first test source bar.
    return ((timestamps < test_start).to_numpy() &
            (source_indices + HORIZON_BARS < first_test_source_index))


def _rule_gate_diagnostics(features: pd.DataFrame, raw_indices: np.ndarray,
                           xgb_prob: np.ndarray, lstm_prob: np.ndarray, ensemble_prob: np.ndarray,
                           news_safe: np.ndarray | None) -> dict[str, Any]:
    """Count how many final-window rows survive each mandatory rule, in order."""
    selected = features.iloc[raw_indices]
    count = len(selected)
    mask = np.ones(count, dtype=bool)
    result: dict[str, Any] = {
        "rows_tested": count,
        "maximum_smc_score": float(selected["smc_score_long"].max()) if count else None,
        "maximum_smc_score_on_wave3_entry_rows": (
            float(selected.loc[selected["wave3_long_rule_breakout"].astype(bool), "smc_score_long"].max())
            if count and selected["wave3_long_rule_breakout"].astype(bool).any() else None
        ),
    }
    wave3_mask = selected["wave3_long_rule_breakout"].to_numpy(dtype=bool)
    result["wave3_entry_rows_with_bos20"] = int((wave3_mask & selected["bos20_up"].to_numpy(dtype=bool)).sum())
    result["wave3_entry_rows_with_choch"] = int((wave3_mask & selected["choch_rule_up"].to_numpy(dtype=bool)).sum())
    result["oos_rows_with_bull_ob_recent"] = int(selected["bull_ob_recent"].to_numpy(dtype=bool).sum())
    result["oos_rows_with_bull_ob_within5"] = int(selected["bull_ob_within5"].to_numpy(dtype=bool).sum())
    result["oos_rows_inside_bull_ob_zone"] = int(selected["bull_ob_zone"].to_numpy(dtype=bool).sum())
    result["wave3_entry_rows_with_bull_ob_recent"] = int((wave3_mask & selected["bull_ob_recent"].to_numpy(dtype=bool)).sum())
    result["wave3_entry_rows_with_ob_within5"] = int((wave3_mask & selected["bull_ob_within5"].to_numpy(dtype=bool)).sum())
    result["wave3_entry_rows_inside_bull_ob_zone"] = int((wave3_mask & selected["bull_ob_zone"].to_numpy(dtype=bool)).sum())
    result["wave3_entry_rows_with_fvg_fill"] = int((wave3_mask & selected["bull_fvg_fill"].to_numpy(dtype=bool)).sum())
    conditions = [
        ("wave3_entry_breakout", selected["wave3_long_rule_breakout"].to_numpy(dtype=bool)),
        ("fib_score_ge_80", (selected["wave3_long_fib_score"].to_numpy() >= 80)),
        ("smc_score_ge_85", (selected["smc_score_long"].to_numpy() >= 85)),
        ("xgb_buy_ge_75_and_agrees", (xgb_prob[:, 2] >= XGB_MIN_CONFIDENCE) & (xgb_prob.argmax(axis=1) == 2)),
        ("lstm_buy_ge_80_and_agrees", (lstm_prob[:, 2] >= LSTM_MIN_CONFIDENCE) & (lstm_prob.argmax(axis=1) == 2)),
        ("ensemble_buy_ge_85_and_agrees", (ensemble_prob[:, 2] >= PROBABILITY_THRESHOLD) & (ensemble_prob.argmax(axis=1) == 2)),
        ("rsi_50_70", selected["rsi_buy_gate"].to_numpy(dtype=bool)),
        ("momentum_5_positive", selected["momentum_5_positive"].to_numpy(dtype=bool)),
        ("volume_above_80pct_ema20", selected["volume_gate"].to_numpy(dtype=bool)),
        ("near_fib_618_assumed_plusminus_5pct", selected["near_fib_618"].to_numpy(dtype=bool)),
        ("discount_zone", selected["discount_zone"].to_numpy(dtype=bool)),
        ("h1_trend_up", selected["h1_trend_up"].to_numpy(dtype=bool)),
        ("close_ema21_ema50_and_higher_lows", (selected["deep_trend_gate"].to_numpy(dtype=bool) & selected["choch_rule_up"].to_numpy(dtype=bool))),
        ("sl_5_within_atr_1_5", selected["atr_stop_gate"].to_numpy(dtype=bool)),
        ("spread_at_or_below_0_35", selected["spread_gate"].to_numpy(dtype=bool)),
    ]
    for name, condition in conditions:
        mask &= np.asarray(condition, dtype=bool)
        result[name] = int(np.asarray(condition, dtype=bool).sum())
        result["surviving_after_" + name] = int(mask.sum())
    result["news_calendar_available"] = news_safe is not None
    if news_safe is None:
        result["news_safe_rows"] = 0
        result["all_mandatory_gates_passed"] = 0
    else:
        signal_safe = np.asarray(news_safe, dtype=bool)[raw_indices]
        entry_indices = np.minimum(raw_indices + 1, len(news_safe) - 1)
        news_pass = signal_safe & np.asarray(news_safe, dtype=bool)[entry_indices]
        result["news_safe_rows"] = int(news_pass.sum())
        mask &= news_pass
        result["surviving_after_news_30m"] = int(mask.sum())
        result["all_mandatory_gates_passed"] = int(mask.sum())
    result["note"] = "SELL rules not enabled: only a BUY-side checklist was specified. Missing news calendar is fail-closed."
    return result



def smc_candidate_trace(frame: pd.DataFrame, features: pd.DataFrame, raw_indices: np.ndarray) -> dict[str, Any]:
    """Return same-closed-bar causal traces for Wave3 BUY trigger rows; diagnostic only."""
    component_names = ("bos20_up", "choch_rule_up", "bull_ob_within5", "bull_fvg_fill")

    def number(row: pd.Series, name: str) -> float | None:
        value = row.get(name, np.nan)
        if pd.isna(value):
            return None
        return float(value)

    def integer(row: pd.Series, name: str) -> int | None:
        value = number(row, name)
        return int(value) if value is not None else None

    rows: list[dict[str, Any]] = []
    for item in raw_indices:
        i = int(item)
        if i < 0 or i >= len(frame) or not bool(features["wave3_long_rule_breakout"].iloc[i]):
            continue
        rowf = features.iloc[i]
        flags = {name: bool(float(rowf[name])) for name in component_names}
        missing = [name for name, passed in flags.items() if not passed]
        pivots = []
        for slot in (1, 2, 3):
            origin_index = integer(rowf, f"higher_low_{slot}_index")
            confirmation_index = integer(rowf, f"higher_low_{slot}_confirmation_index")
            price = number(rowf, f"higher_low_{slot}_price")
            if origin_index is not None and confirmation_index is not None and price is not None:
                pivots.append({
                    "origin_index": origin_index,
                    "origin_timestamp_utc": frame["timestamp"].iloc[origin_index].isoformat(),
                    "confirmation_index": confirmation_index,
                    "confirmation_timestamp_utc": frame["timestamp"].iloc[confirmation_index].isoformat(),
                    "price": price,
                })
        ob_origin = integer(rowf, "bull_ob_origin_index")
        ob_confirmation = integer(rowf, "bull_ob_confirmation_index")
        fvg_fill_origin = integer(rowf, "bull_fvg_fill_origin_index")
        fvg_first_fill = integer(rowf, "bull_fvg_first_fill_index")
        fvg_first_full_mitigation = integer(rowf, "bull_fvg_first_full_mitigation_index")
        rows.append({
            "signal_index": i,
            "signal_timestamp_utc": frame["timestamp"].iloc[i].isoformat(),
            "signal_close": float(frame["close"].iloc[i]),
            "signal_low": float(frame["low"].iloc[i]),
            "signal_high": float(frame["high"].iloc[i]),
            "previous_close": float(frame["close"].iloc[i - 1]) if i else float(frame["close"].iloc[i]),
            "wave3_entry_price": number(rowf, "wave3_long_entry_price"),
            "fib_pullback_ratio": number(rowf, "fib_pullback_ratio"),
            "fib_score": number(rowf, "wave3_long_fib_score"),
            "smc_score": number(rowf, "smc_score_long"),
            "smc_gate_pass": bool(float(rowf["smc_score_long"]) >= 85),
            "components_same_closed_signal_bar": flags,
            "missing_components": missing,
            "all_four_components_same_bar": not missing,
            "structural_events": {
                "bos_up": bool(float(rowf["bos_up"])),
                "choch_up": bool(float(rowf["choch_up"])),
                "bos_down": bool(float(rowf["bos_down"])),
                "choch_down": bool(float(rowf["choch_down"])),
                "break_pivot_index": integer(rowf, "structure_break_pivot_index"),
                "break_pivot_confirmation_index": integer(rowf, "structure_break_pivot_confirmation_index"),
                "break_pivot_price": number(rowf, "structure_break_pivot_price"),
            },
            "bos20": {
                "prior_20_bar_high": number(rowf, "bos20_prior_20_high"),
                "close_above_prior_20_bar_high": flags["bos20_up"],
            },
            "higher_lows_used_by_rule": pivots,
            "order_block": {
                "selected_origin_index": ob_origin,
                "selected_origin_timestamp_utc": frame["timestamp"].iloc[ob_origin].isoformat() if ob_origin is not None else None,
                "confirmation_index": ob_confirmation,
                "confirmation_timestamp_utc": frame["timestamp"].iloc[ob_confirmation].isoformat() if ob_confirmation is not None else None,
                "origin_low": number(rowf, "bull_ob_origin_low"),
                "origin_high": number(rowf, "bull_ob_origin_high"),
                "origin_range_pct": number(rowf, "bull_ob_origin_range_pct"),
                "candidate_count_at_confirmation": integer(rowf, "bull_ob_candidate_count"),
                "search_start_index": integer(rowf, "bull_ob_search_start_index"),
                "search_end_exclusive_index": integer(rowf, "bull_ob_search_end_exclusive_index"),
                "age_from_origin_bars": integer(rowf, "bull_ob_age_from_origin_bars"),
                "age_from_confirmation_bars": integer(rowf, "bull_ob_age_from_confirmation_bars"),
                "distance_price": number(rowf, "bull_ob_distance_price_trace"),
                "valid_on_signal_bar": bool(number(rowf, "bull_ob_valid_trace")) if number(rowf, "bull_ob_valid_trace") is not None else None,
                "inside_zone_on_signal_bar": bool(number(rowf, "bull_ob_zone_trace")) if number(rowf, "bull_ob_zone_trace") is not None else None,
                "within_5_on_signal_bar": bool(number(rowf, "bull_ob_within5_trace")) if number(rowf, "bull_ob_within5_trace") is not None else None,
                "invalidated_on_signal_bar": bool(number(rowf, "bull_ob_invalidated_now")) if number(rowf, "bull_ob_invalidated_now") is not None else None,
                "last_invalidated": {
                    "origin_index": integer(rowf, "bull_ob_last_invalidated_origin_index"),
                    "origin_timestamp_utc": frame["timestamp"].iloc[integer(rowf, "bull_ob_last_invalidated_origin_index")].isoformat() if integer(rowf, "bull_ob_last_invalidated_origin_index") is not None else None,
                    "confirmation_index": integer(rowf, "bull_ob_last_invalidated_confirmation_index"),
                    "invalidated_at_index": integer(rowf, "bull_ob_last_invalidated_at_index"),
                    "invalidated_at_timestamp_utc": frame["timestamp"].iloc[integer(rowf, "bull_ob_last_invalidated_at_index")].isoformat() if integer(rowf, "bull_ob_last_invalidated_at_index") is not None else None,
                    "low": number(rowf, "bull_ob_last_invalidated_low"),
                    "high": number(rowf, "bull_ob_last_invalidated_high"),
                    "range_pct": number(rowf, "bull_ob_last_invalidated_range_pct"),
                    "distance_price_at_invalidation": number(rowf, "bull_ob_last_invalidated_distance_price"),
                    "candidate_count": integer(rowf, "bull_ob_last_invalidated_candidate_count"),
                    "search_start_index": integer(rowf, "bull_ob_last_invalidated_search_start_index"),
                    "search_end_exclusive_index": integer(rowf, "bull_ob_last_invalidated_search_end_exclusive_index"),
                },
            },
            "fair_value_gap": {
                "active_origin_index": integer(rowf, "bull_fvg_active_origin_index"),
                "active_lower": number(rowf, "bull_fvg_active_lower"),
                "active_upper": number(rowf, "bull_fvg_active_upper"),
                "active_age_bars": integer(rowf, "bull_fvg_active_age_bars"),
                "refill_origin_index": fvg_fill_origin,
                "refill_origin_timestamp_utc": frame["timestamp"].iloc[fvg_fill_origin].isoformat() if fvg_fill_origin is not None else None,
                "refill_lower": number(rowf, "bull_fvg_fill_lower"),
                "refill_upper": number(rowf, "bull_fvg_fill_upper"),
                "refill_age_bars": integer(rowf, "bull_fvg_fill_age_bars"),
                "first_refill_index": fvg_first_fill,
                "first_refill_timestamp_utc": frame["timestamp"].iloc[fvg_first_fill].isoformat() if fvg_first_fill is not None else None,
                "bars_since_first_refill": i - fvg_first_fill if fvg_first_fill is not None else None,
                "first_full_mitigation_index": fvg_first_full_mitigation,
                "first_full_mitigation_timestamp_utc": frame["timestamp"].iloc[fvg_first_full_mitigation].isoformat() if fvg_first_full_mitigation is not None else None,
                "bars_since_first_full_mitigation": i - fvg_first_full_mitigation if fvg_first_full_mitigation is not None else None,
                "full_mitigation_touch_on_signal_bar": bool(number(rowf, "bull_fvg_fully_mitigated_now")) if number(rowf, "bull_fvg_fully_mitigated_now") is not None else None,
                "fully_mitigated_on_signal_bar": bool(number(rowf, "bull_fvg_fully_mitigated_now")) if number(rowf, "bull_fvg_fully_mitigated_now") is not None else None,
                "first_full_mitigation_on_signal_bar": fvg_first_full_mitigation is not None and fvg_first_full_mitigation == i,
                "full_mitigation_precedes_signal": fvg_first_full_mitigation is not None and fvg_first_full_mitigation < i,
                "overlap_is_retest_after_first_refill": flags["bull_fvg_fill"] and fvg_first_fill is not None and fvg_first_fill < i,
                "overlap_is_retest_after_full_mitigation": flags["bull_fvg_fill"] and fvg_first_full_mitigation is not None and fvg_first_full_mitigation < i,
                "created_on_signal_bar": bool(number(rowf, "bull_fvg_created_now")) if number(rowf, "bull_fvg_created_now") is not None else False,
                "created_origin_index": integer(rowf, "bull_fvg_created_origin_index"),
                "created_lower": number(rowf, "bull_fvg_created_lower"),
                "created_upper": number(rowf, "bull_fvg_created_upper"),
            },
            "same_closed_signal_bar": True,
        })

    pairwise = {}
    for left_index, left in enumerate(component_names):
        for right in component_names[left_index + 1:]:
            pairwise[f"{left}&{right}"] = sum(1 for row in rows if row["components_same_closed_signal_bar"][left] and row["components_same_closed_signal_bar"][right])
    patterns: dict[str, int] = {}
    for row in rows:
        key = ",".join(row["missing_components"]) if row["missing_components"] else "none"
        patterns[key] = patterns.get(key, 0) + 1
    summary = {
        "candidate_rows": len(rows),
        "component_counts": {name: sum(1 for row in rows if row["components_same_closed_signal_bar"][name]) for name in component_names},
        "pairwise_same_bar_intersections": pairwise,
        "all_four_components_same_bar": sum(1 for row in rows if row["all_four_components_same_bar"]),
        "smc_score_ge_85": sum(1 for row in rows if row["smc_gate_pass"]),
        "maximum_smc_score": max((row["smc_score"] for row in rows if row["smc_score"] is not None), default=None),
        "fvg_positive_rows_after_first_overlap": sum(1 for row in rows if row["components_same_closed_signal_bar"]["bull_fvg_fill"] and row["fair_value_gap"]["first_refill_index"] is not None and row["fair_value_gap"]["first_refill_index"] < row["signal_index"]),
        "fvg_positive_rows_after_full_mitigation": sum(1 for row in rows if row["fair_value_gap"]["overlap_is_retest_after_full_mitigation"]),
        "fvg_full_mitigation_on_signal_bar": sum(1 for row in rows if row["components_same_closed_signal_bar"]["bull_fvg_fill"] and row["fair_value_gap"]["first_full_mitigation_on_signal_bar"]),
        "fvg_full_mitigation_touch_on_signal_bar_all_candidates": sum(1 for row in rows if row["fair_value_gap"]["full_mitigation_touch_on_signal_bar"] is True),
        "fvg_positive_rows_with_full_mitigation_touch_on_signal_bar": sum(1 for row in rows if row["components_same_closed_signal_bar"]["bull_fvg_fill"] and row["fair_value_gap"]["full_mitigation_touch_on_signal_bar"] is True),
        "fvg_positive_rows_first_full_mitigation_precedes_signal": sum(1 for row in rows if row["components_same_closed_signal_bar"]["bull_fvg_fill"] and row["fair_value_gap"]["full_mitigation_precedes_signal"]),
        "fvg_mitigation_summary_note": "fvg_full_mitigation_on_signal_bar counts the first full mitigation occurring exactly on an FVG-positive signal bar; full_mitigation_touch_on_signal_bar records any current-bar touch, including later re-touches.",
        "missing_component_patterns": patterns,
    }
    return {"summary": summary, "rows": rows}



def build_inner_validation_splits(meta_train: pd.DataFrame) -> list[dict[str, Any]]:
    """Create strictly chronological inner validation windows with a 12-bar label purge."""
    if "timestamp" not in meta_train.columns:
        raise ValueError("inner tuning metadata requires timestamp")
    if "source_index" not in meta_train.columns:
        raise ValueError("inner tuning metadata requires source_index")
    timestamps = pd.to_datetime(meta_train["timestamp"], utc=True).reset_index(drop=True)
    source_indices = pd.to_numeric(meta_train["source_index"], errors="raise").to_numpy(dtype=np.int64)
    n = len(timestamps)
    splits: list[dict[str, Any]] = []
    for fold_number, (start_fraction, end_fraction) in enumerate(AUTO_TUNING_FOLDS, start=1):
        validation_start = min(n - 1, int(n * start_fraction))
        validation_end = min(n, max(validation_start + 1, int(n * end_fraction)))
        start_time = timestamps.iloc[validation_start]
        first_validation_source_index = int(source_indices[validation_start])
        train_indices = np.flatnonzero(
            (timestamps < start_time).to_numpy() &
            (source_indices + HORIZON_BARS < first_validation_source_index)
        )
        validation_indices = np.arange(validation_start, validation_end, dtype=int)
        if len(train_indices) < 5000 or len(validation_indices) < 300:
            continue
        splits.append({
            "fold": fold_number,
            "train_indices": train_indices,
            "validation_indices": validation_indices,
            "validation_start": start_time.isoformat(),
            "validation_end_exclusive": timestamps.iloc[validation_end - 1].isoformat(),
            "purge_bars": HORIZON_BARS,
            "train_rows": int(len(train_indices)),
            "validation_rows": int(len(validation_indices)),
        })
    return splits


def generate_xgb_tuning_candidates(n_trials: int = AUTO_TUNING_TRIALS) -> list[dict[str, Any]]:
    """Seeded, reproducible search. The baseline configuration is always included."""
    if not 1 <= int(n_trials) <= 12:
        raise ValueError("n_trials must be between 1 and 12")
    candidates = [{
        "n_estimators": 140, "max_depth": 4, "learning_rate": 0.04,
        "subsample": 0.85, "colsample_bytree": 0.85, "min_child_weight": 8,
        "reg_lambda": 5.0,
    }]
    rng = np.random.default_rng(SEED)
    seen = {tuple(sorted(candidates[0].items()))}
    while len(candidates) < int(n_trials):
        candidate = {
            "n_estimators": int(rng.choice([100, 120, 140, 160, 180])),
            "max_depth": int(rng.choice([3, 4, 5])),
            "learning_rate": float(rng.choice([0.025, 0.03, 0.04, 0.05, 0.06])),
            "subsample": float(rng.choice([0.75, 0.80, 0.85, 0.90, 0.95])),
            "colsample_bytree": float(rng.choice([0.75, 0.80, 0.85, 0.90, 0.95])),
            "min_child_weight": int(rng.choice([5, 8, 10, 12])),
            "reg_lambda": float(rng.choice([2.0, 3.0, 5.0, 8.0, 10.0])),
        }
        key = tuple(sorted(candidate.items()))
        if key not in seen:
            candidates.append(candidate)
            seen.add(key)
    return candidates


def auto_tune_xgb(X_train: pd.DataFrame, y_train: pd.Series, meta_train: pd.DataFrame,
                  n_trials: int = AUTO_TUNING_TRIALS, study_name: str = "training-window") -> dict[str, Any]:
    """Tune XGB on past-only inner windows; keep LSTM 60-bar and all v6.2.6.3 gates fixed."""
    splits = build_inner_validation_splits(meta_train.reset_index(drop=True))
    candidates = generate_xgb_tuning_candidates(n_trials)
    if not splits:
        return {
            "status": "skipped_insufficient_inner_rows", "study_name": study_name,
            "selected_parameters": candidates[0], "trials": [],
            "note": "No valid purged inner validation windows; use baseline XGB parameters.",
        }

    trial_scores: list[list[float]] = [[] for _ in candidates]
    trial_folds: list[list[dict[str, Any]]] = [[] for _ in candidates]
    for split in splits:
        train_indices = split["train_indices"]
        validation_indices = split["validation_indices"]
        X_fit, y_fit = X_train.iloc[train_indices], y_train.iloc[train_indices]
        X_validation, y_validation = X_train.iloc[validation_indices], y_train.iloc[validation_indices]
        context_start = max(0, int(validation_indices[0]) - LSTM_SEQUENCE_LENGTH + 1)
        sequence_context = X_train.iloc[context_start:int(validation_indices[0])]
        # Fit the deep model once per temporal fold; each XGB candidate is tested against
        # the identical LSTM probabilities to make candidate comparisons paired.
        lstm_scaler, lstm_model = _fit_lstm(X_fit, y_fit)
        lstm_prob = _predict_lstm_probabilities(X_validation, lstm_scaler, lstm_model, sequence_context)
        y_values = y_validation.to_numpy(dtype=int)
        one_hot = np.eye(3, dtype=float)[y_values]
        for trial_index, candidate in enumerate(candidates):
            xgb_model, _ = _fit_xgb(X_fit, y_fit, candidate)
            xgb_prob = _align_probabilities(xgb_model.predict_proba(X_validation), np.asarray(xgb_model.classes_))
            ensemble_prob = ENSEMBLE_XGB_WEIGHT * xgb_prob + ENSEMBLE_LSTM_WEIGHT * lstm_prob
            predicted = ensemble_prob.argmax(axis=1)
            balanced = float(balanced_accuracy_score(y_values, predicted))
            macro_f1 = float(f1_score(y_values, predicted, labels=[0, 1, 2], average="macro", zero_division=0))
            clipped = np.clip(ensemble_prob, 1e-8, 1.0)
            log_loss_value = float(-np.log(clipped[np.arange(len(y_values)), y_values]).mean())
            normalized_log_score = max(0.0, 1.0 - min(1.0, log_loss_value / math.log(3.0)))
            objective = 0.40 * balanced + 0.35 * macro_f1 + 0.25 * normalized_log_score
            trial_scores[trial_index].append(objective)
            trial_folds[trial_index].append({
                "inner_fold": split["fold"],
                "validation_start": split["validation_start"],
                "validation_end_exclusive": split["validation_end_exclusive"],
                "train_rows": split["train_rows"],
                "validation_rows": split["validation_rows"],
                "balanced_accuracy": round(balanced, 6),
                "macro_f1": round(macro_f1, 6),
                "log_loss": round(log_loss_value, 6),
                "composite_score": round(objective, 6),
            })

    trials = []
    for index, candidate in enumerate(candidates):
        scores = trial_scores[index]
        mean_score = float(np.mean(scores)) if scores else float("-inf")
        score_std = float(np.std(scores)) if scores else float("inf")
        robust_score = mean_score - 0.15 * score_std if scores else float("-inf")
        trials.append({
            "trial": index + 1, "parameters": candidate,
            "mean_composite_score": round(mean_score, 6) if np.isfinite(mean_score) else None,
            "score_std": round(score_std, 6) if np.isfinite(score_std) else None,
            "robust_score": round(robust_score, 6) if np.isfinite(robust_score) else None,
            "folds": trial_folds[index],
        })
    eligible = [trial for trial in trials if trial["robust_score"] is not None]
    if not eligible:
        selected = candidates[0]
        selected_trial = None
    else:
        selected_trial = max(eligible, key=lambda item: item["robust_score"])
        selected = selected_trial["parameters"]
    return {
        "status": "completed" if selected_trial else "fallback_baseline",
        "study_name": study_name,
        "search": "seeded_random_search",
        "trials_requested": int(n_trials),
        "trials_completed": len(eligible),
        "inner_validation_folds": len(splits),
        "objective": "0.40*balanced_accuracy + 0.35*macro_F1 + 0.25*(1-normalized_log_loss), minus 0.15*fold_score_std",
        "purge_bars": HORIZON_BARS,
        "selected_parameters": selected,
        "selected_robust_score": selected_trial["robust_score"] if selected_trial else None,
        "selected_trial": selected_trial["trial"] if selected_trial else None,
        "trials": trials,
        "strategy_gates_tuned": False,
        "final_oos_used_for_tuning": False,
    }


def _build_auto_tuning_history(
    tuning_trials: int,
    fold_results: list[dict[str, Any]],
    final_model: dict[str, Any] | None = None,
    status: str = "in_progress",
) -> dict[str, Any]:
    return {
        "status": status,
        "search": "seeded_random_search",
        "trials_per_window": int(tuning_trials),
        "windows_completed": sum(1 for item in fold_results if item.get("auto_tuning")),
        "final_oos_start": "2026-07-01T00:00:00+00:00",
        "final_oos_used_for_tuning": False,
        "final_model": final_model,
        "walk_forward_windows": [
            {"name": item.get("name"), "status": item.get("status"), "auto_tuning": item.get("auto_tuning")}
            for item in fold_results
        ],
        "fixed_strategy_gates": {
            "xgb_buy_minimum": XGB_MIN_CONFIDENCE,
            "lstm_buy_minimum": LSTM_MIN_CONFIDENCE,
            "ensemble_buy_minimum": PROBABILITY_THRESHOLD,
            "smc_minimum": 85,
            "wave3_fib_minimum": 80,
            "xgb_weight": ENSEMBLE_XGB_WEIGHT,
            "lstm_weight": ENSEMBLE_LSTM_WEIGHT,
        },
    }


def _write_auto_tuning_history(
    report_path: str | Path,
    tuning_trials: int,
    fold_results: list[dict[str, Any]],
    final_model: dict[str, Any] | None = None,
    status: str = "in_progress",
) -> Path:
    target = Path(report_path).with_name("wave3_auto_tuning_history.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    payload = _build_auto_tuning_history(tuning_trials, fold_results, final_model, status)
    temporary.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    temporary.replace(target)
    return target


def _fold_run(frame: pd.DataFrame, features: pd.DataFrame, X: pd.DataFrame, y: pd.Series,
              meta: pd.DataFrame, name: str, test_start: str, test_end: str,
              news_safe: np.ndarray | None, tuning_trials: int) -> dict[str, Any]:
    start = pd.Timestamp(test_start, tz="UTC")
    end = pd.Timestamp(test_end, tz="UTC")
    train_idx = np.flatnonzero(_train_mask(meta, start))
    test_end_purged = end - pd.Timedelta(minutes=15 * HORIZON_BARS)
    test_idx = np.flatnonzero(((meta["timestamp"] >= start) & (meta["timestamp"] < test_end_purged)).to_numpy())
    if len(train_idx) < 5000 or len(test_idx) < 500:
        return {"name": name, "status": "skipped_insufficient_rows", "train_rows": len(train_idx), "test_rows": len(test_idx)}
    X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
    X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]
    sequence_context = X.iloc[max(0, int(test_idx[0]) - LSTM_SEQUENCE_LENGTH + 1):int(test_idx[0])]
    tuning = auto_tune_xgb(X_train, y_train, meta.iloc[train_idx].reset_index(drop=True),
                           n_trials=tuning_trials, study_name=name)
    print(f"[{name}] train={len(train_idx)} test={len(test_idx)} auto_tuning={tuning['status']} "
          f"trials={tuning.get('trials_completed', 0)} fitting selected XGB + 60-bar LSTM...", flush=True)
    models = _build_models(X_train, y_train, tuning["selected_parameters"])
    xgb_prob, lstm_prob = predict_model_probabilities(X_test, models, sequence_context)
    prob = ENSEMBLE_XGB_WEIGHT * xgb_prob + ENSEMBLE_LSTM_WEIGHT * lstm_prob
    pred = prob.argmax(axis=1)
    raw_idx = meta["source_index"].iloc[test_idx].to_numpy(dtype=int)
    bt = backtest_window(frame, features, raw_idx, prob, xgb_probabilities=xgb_prob,
                         lstm_probabilities=lstm_prob, news_safe=news_safe)
    return {
        "name": name, "status": "completed",
        "train_first_timestamp": meta["timestamp"].iloc[train_idx[0]].isoformat(),
        "train_last_label_timestamp": meta["timestamp"].iloc[train_idx[-1]].isoformat(),
        "test_start": test_start, "test_end_exclusive": test_end,
        "train_rows": len(train_idx), "test_rows": len(test_idx),
        "class_distribution_train": {LABEL_NAMES[k]: int((y_train == k).sum()) for k in LABEL_NAMES},
        "classification": _classification_metrics(y_test.to_numpy(), pred),
        "backtest": {k: v for k, v in bt.items() if k != "trades"},
        "trades": bt.get("trades", []),
        "xgb_trees": int(models[0].n_estimators),
        "xgb_parameters": getattr(models[0], "_voom_hyperparameters", {}),
        "auto_tuning": tuning,
        "lstm_training_losses": getattr(models[2], "_training_losses", []),
    }


def run_experiment(data_path: str | Path, model_dir: str | Path, report_path: str | Path,
                   news_calendar_path: str | Path | None = None,
                   tuning_trials: int = AUTO_TUNING_TRIALS) -> dict[str, Any]:
    frame = load_bars(data_path)
    news_safe = load_news_calendar(news_calendar_path, frame)
    news_provenance = _news_calendar_manifest(news_calendar_path, news_safe, len(frame))
    raw_hash = hashlib.sha256(Path(data_path).read_bytes()).hexdigest()
    if news_safe is None:
        print("NEWS GUARD: no historical high-impact calendar provided; entries will fail closed", flush=True)
    else:
        print(f"NEWS GUARD: calendar loaded; {int(news_safe.sum())}/{len(news_safe)} bars are outside the +/-30 minute exclusion window", flush=True)
    print("building causal indicators / SMC / Wave3 features...", flush=True)
    features = build_causal_features(frame)
    X, y, meta = make_labeled_frame(frame, features)
    ts0, tsn = frame["timestamp"].iloc[0], frame["timestamp"].iloc[-1]
    print(f"bars={len(frame)} usable_labeled_rows={len(X)} first={ts0} last={tsn}", flush=True)
    print("label_distribution=" + json.dumps({LABEL_NAMES[k]: int((y == k).sum()) for k in LABEL_NAMES}), flush=True)

    folds = [
        ("wf_2024_H1", "2024-01-01", "2024-07-01"),
        ("wf_2024_H2", "2024-07-01", "2025-01-01"),
        ("wf_2025_H1", "2025-01-01", "2025-07-01"),
        ("wf_2025_H2", "2025-07-01", "2026-01-01"),
        ("wf_2026_H1", "2026-01-01", "2026-07-01"),
    ]
    fold_results = []
    for name, start, end in folds:
        fold_result = _fold_run(frame, features, X, y, meta, name, start, end, news_safe, tuning_trials)
        fold_results.append(fold_result)
        history_path = _write_auto_tuning_history(
            report_path, tuning_trials, fold_results, status="in_progress"
        )
        print(
            f"[AUTO_TUNING_CHECKPOINT] completed_windows="
            f"{sum(1 for item in fold_results if item.get('auto_tuning'))} "
            f"history={history_path}",
            flush=True,
        )

    final_start = pd.Timestamp("2026-07-01", tz="UTC")
    train_idx = np.flatnonzero(_train_mask(meta, final_start))
    test_idx = np.flatnonzero((meta["timestamp"] >= final_start).to_numpy())
    if len(train_idx) < 5000 or len(test_idx) < 500:
        raise ValueError(f"not enough final training/OOS data: train={len(train_idx)} test={len(test_idx)}")
    X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
    X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]
    sequence_context = X.iloc[max(0, int(test_idx[0]) - LSTM_SEQUENCE_LENGTH + 1):int(test_idx[0])]
    final_tuning = auto_tune_xgb(X_train, y_train, meta.iloc[train_idx].reset_index(drop=True),
                                 n_trials=tuning_trials, study_name="final_model_pre_2026_07_01")
    _write_auto_tuning_history(
        report_path, tuning_trials, fold_results, final_model=final_tuning,
        status="final_model_tuned_pre_oos",
    )
    print(f"[FINAL_OOS_2026_H2] train={len(train_idx)} test={len(test_idx)} "
          f"selected XGB from {final_tuning.get('trials_completed', 0)} auto-tuning trials; "
          "Final OOS is not used for tuning", flush=True)
    models = _build_models(X_train, y_train, final_tuning["selected_parameters"])
    xgb_prob, lstm_prob = predict_model_probabilities(X_test, models, sequence_context)
    prob = ENSEMBLE_XGB_WEIGHT * xgb_prob + ENSEMBLE_LSTM_WEIGHT * lstm_prob
    pred = prob.argmax(axis=1)
    raw_idx = meta["source_index"].iloc[test_idx].to_numpy(dtype=int)
    bt = backtest_window(frame, features, raw_idx, prob, xgb_probabilities=xgb_prob,
                         lstm_probabilities=lstm_prob, news_safe=news_safe)
    signal_diagnostics = _rule_gate_diagnostics(features, raw_idx, xgb_prob, lstm_prob, prob, news_safe)
    model_path = Path(model_dir)
    model_path.mkdir(parents=True, exist_ok=True)
    models[0].save_model(str(model_path / "xgb_model.json"))
    torch.save({
        "state_dict": models[2].state_dict(), "input_size": int(X.shape[1]), "hidden_size": 32,
        "scaler": models[1], "feature_columns": list(X.columns), "label_mapping": LABEL_NAMES,
        "sequence_length": LSTM_SEQUENCE_LENGTH, "seed": SEED,
        "training_batch_size": getattr(models[2], "_training_batch_size", LSTM_TRAIN_BATCH_SIZE),
    }, model_path / "deep_lstm.pt")
    reloaded = load_saved_models(model_path)
    if reloaded[3] != list(X.columns):
        raise RuntimeError("saved model feature schema differs from the training schema")
    check_count = min(256, len(X_test))
    check_xgb, check_lstm = predict_model_probabilities(X_test.iloc[:check_count], reloaded[:3], sequence_context)
    round_trip_prob = ENSEMBLE_XGB_WEIGHT * check_xgb + ENSEMBLE_LSTM_WEIGHT * check_lstm
    if not np.allclose(round_trip_prob, prob[:check_count], atol=1e-6):
        raise RuntimeError("saved XGB/LSTM artifacts do not reproduce in-memory ensemble probabilities")
    print(f"saved XGB/LSTM artifacts reloaded and verified on {check_count} held-out rows", flush=True)
    model_artifacts = {}
    for artifact_name in ("xgb_model.json", "deep_lstm.pt"):
        artifact_path = model_path / artifact_name
        model_artifacts[artifact_name] = {
            "path": artifact_path.as_posix(),
            "sha256": hashlib.sha256(artifact_path.read_bytes()).hexdigest(),
            "bytes": artifact_path.stat().st_size,
        }
    manifest = {
        "strategy": "VOOM v6.2.6.3 Wave3 + SMC XGB/60-bar LSTM BUY research", "version": "6.2.6.3-research",
        "model_artifacts": model_artifacts,
        "data_sha256": raw_hash, "symbol": "XAUUSDm", "timeframe": "M15", "timezone": "UTC",
        "news_calendar": news_provenance,
        "bar_count": len(frame), "usable_labeled_rows": len(X),
        "data_first_bar": ts0.isoformat(), "data_last_bar": tsn.isoformat(),
        "model_training_last_timestamp": meta["timestamp"].iloc[train_idx[-1]].isoformat(),
        "final_oos_start": "2026-07-01T00:00:00+00:00", "label_horizon_bars": HORIZON_BARS,
        "label_threshold": "max(2 * recorded bar spread, 0.35 * ATR14 * sqrt(horizon))",
        "feature_columns": list(X.columns), "label_mapping": LABEL_NAMES,
        "xgb_parameters": {**getattr(models[0], "_voom_hyperparameters", {}),
                           "tree_method": "hist", "seed": SEED},
        "auto_tuning": final_tuning,
        "deep_model": {"type": "PyTorch LSTMClassifier", "sequence_length_bars": LSTM_SEQUENCE_LENGTH,
                       "layers": [32, 32], "epochs": 4,
                       "training_batch_size": getattr(models[2], "_training_batch_size", LSTM_TRAIN_BATCH_SIZE),
                       "cpu_batch_size_fallbacks": list(LSTM_BATCH_SIZE_FALLBACKS),
                       "training_loss_by_epoch": getattr(models[2], "_training_losses", []),
                       "ensemble_weight": ENSEMBLE_LSTM_WEIGHT},
        "artifact_round_trip_verification": {"passed": True, "held_out_rows_compared": check_count,
                                             "feature_schema_matches": True, "max_probability_abs_tolerance": 1e-6},
        "v6_2_6_3_buy_contract": {
            "wave1_minimum_price_size": MIN_WAVE1_SIZE_XAU,
            "fib_accepted_pct": [45, 85], "fib_preferred_pct": [55, 65],
            "fib_score_rule": "95 in preferred zone, 80 in accepted zone, otherwise 0",
            "entry_rule": "Wave1 high + 20% of Wave1 size; BUY fills only if next bar reaches the trigger",
            "smc_score_weights": {"BOS20": 30, "three_higher_lows_and_green_candle": 20, "large_order_block_within_5": 25, "FVG_refill": 25},
            "minimum_smc_score": 85,
            "xgb_buy_minimum": XGB_MIN_CONFIDENCE, "lstm_buy_minimum": LSTM_MIN_CONFIDENCE,
            "ensemble": {"xgb_weight": ENSEMBLE_XGB_WEIGHT, "lstm_weight": ENSEMBLE_LSTM_WEIGHT, "buy_minimum": PROBABILITY_THRESHOLD},
            "rsi_buy_range": [50, 70], "momentum_bars": 5,
            "volume_minimum_fraction_of_ema20": 0.8, "fib_618_tolerance_assumption": 0.05,
            "buy_requires_discount_zone_100_bars": True, "requires_m15_and_completed_h1_uptrend": True,
            "spread_max_price_units": XAU_MAX_SPREAD_PRICE,
            "news_blackout_minutes_each_side": 30,
            "stop_distance_price_units": FIXED_STOP_DISTANCE_PRICE,
            "target_distance_price_units": FIXED_TARGET_DISTANCE_PRICE,
            "reward_risk": FIXED_REWARD_RISK, "fixed_lot": FIXED_LOT_SIZE,
            "max_open_positions": 1, "max_daily_trades": MAX_DAILY_TRADES, "max_daily_loss_usd": MAX_DAILY_LOSS_USD,
            "news_calendar_available": news_safe is not None,
            "sell_rules_implemented": False,
            "conflict_resolution": "Use fixed $5 SL and 2.2R target per explicit lock/example; SL = Wave2 Low - $5 conflicts with that example and is not used.",
        },
        "backtest_assumptions": {
            "starting_equity_usd": 10000.0, "contract_size": CONTRACT_SIZE,
            "fixed_lot": FIXED_LOT_SIZE, "max_hold_bars": MAX_HOLD_BARS,
            "slippage_price_per_side": SLIPPAGE_PRICE_PER_SIDE,
            "commission_per_lot_per_side_usd": COMMISSION_PER_LOT_PER_SIDE_USD,
            "swap": "omitted; maximum holding period is 12 M15 bars",
            "spread": "per-candle MT5 historical spread_price; XAU entry must be <= 0.35 price units",
            "fills": "BUY trigger checked on next bar; conservative stop-first when SL and TP touch the same OHLC bar",
            "news": _news_backtest_assumption(news_safe),
        },
        "safety": {"orders_submitted": False, "live_trading_enabled": False,
                   "market_data_access": "read-only MT5 history export"},
    }
    (model_path / "model_manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")

    final_result = {
        "name": "FINAL_OOS_2026_H2", "status": "completed",
        "test_start": "2026-07-01T00:00:00+00:00",
        "test_end_inclusive": meta["timestamp"].iloc[test_idx[-1]].isoformat(),
        "train_rows": len(train_idx), "test_rows": len(test_idx),
        "train_last_label_timestamp": meta["timestamp"].iloc[train_idx[-1]].isoformat(),
        "classification": _classification_metrics(y_test.to_numpy(), pred),
        "signal_diagnostics": signal_diagnostics,
        "backtest": {k: v for k, v in bt.items() if k != "trades"},
        "trades": bt.get("trades", []),
        "class_distribution_train": {LABEL_NAMES[k]: int((y_train == k).sum()) for k in LABEL_NAMES},
        "lstm_sequence_length_bars": LSTM_SEQUENCE_LENGTH,
        "lstm_training_losses": getattr(models[2], "_training_losses", []),
        "auto_tuning": final_tuning,
    }
    gate_blockers = []
    if news_safe is None:
        gate_blockers.append("historical high-impact news calendar was not provided; mandatory +/-30 minute news filter fails closed")
    if int(final_result["signal_diagnostics"].get("smc_score_ge_85", 0)) == 0:
        gate_blockers.append("no rows in final OOS reached the mandatory SMC score >=85 gate")
    if int(final_result["signal_diagnostics"].get("xgb_buy_ge_75_and_agrees", 0)) == 0:
        gate_blockers.append("no final OOS rows met the XGB BUY >=75% and BUY-agreement gate")
    if int(final_result["signal_diagnostics"].get("lstm_buy_ge_80_and_agrees", 0)) == 0:
        gate_blockers.append("no final OOS rows met the LSTM BUY >=80% and BUY-agreement gate")
    if int(final_result["signal_diagnostics"].get("ensemble_buy_ge_85_and_agrees", 0)) == 0:
        gate_blockers.append("no final OOS rows met the ensemble BUY >=85% and BUY-agreement gate")
    if int(final_result["backtest"].get("trade_count", 0)) < 30:
        gate_blockers.append("final OOS has fewer than 30 closed trades; edge cannot be assessed reliably")
    for fold in fold_results:
        fold_cls = fold.get("classification", {})
        if fold.get("status") == "completed" and not fold_cls.get("beats_majority_baseline", False):
            gate_blockers.append(f"{fold.get('name')} classification did not beat its majority-class baseline")
    if not final_result["classification"]["beats_majority_baseline"]:
        gate_blockers.append("classification accuracy does not beat the majority-class baseline")
    final_pf = final_result["backtest"].get("profit_factor")
    if not isinstance(final_pf, (int, float)) or final_pf <= 1.0:
        gate_blockers.append("final OOS profit factor is unavailable or not above 1.0")
    if float(final_result["backtest"].get("net_profit_usd", 0.0)) <= 0:
        gate_blockers.append("final OOS net profit is not positive")
    performance_gate = {
        "status": "passed" if not gate_blockers else "blocked",
        "passed": not gate_blockers,
        "minimum_oos_closed_trades": 30,
        "observed_oos_closed_trades": int(final_result["backtest"].get("trade_count", 0)),
        "blockers": gate_blockers,
        "production_eligible": False,
        "live_trading_enabled": False,
    }
    report = {
        "status": "completed_research_not_production_approval",
        "performance_gate": performance_gate,
        "generated_utc": pd.Timestamp.now(tz="UTC").isoformat(),
        "data": {"path": str(data_path), "sha256": raw_hash, "bar_count": len(frame),
                 "first_timestamp_utc": ts0.isoformat(), "last_timestamp_utc": tsn.isoformat(),
                 "usable_labeled_rows": len(X), "symbol": "XAUUSDm", "timeframe": "M15"},
        "methodology": {
            "auto_tuning": "Deterministic seeded XGB search with two inner chronological folds per outer training window; 12-bar label purge; XGB candidate is scored using the fixed 60/40 XGB+LSTM ensemble.",
            "auto_tuning_trials_per_window": int(tuning_trials),
            "strategy_entry_gates_are_fixed": True,
            "final_oos_used_for_tuning": False,
            "chronological_walk_forward_folds": len(fold_results),
            "purge": f"{HORIZON_BARS} bars before each test boundary",
            "final_holdout": "2026-07-01 through latest labeled bar; not used for model fitting",
            "models": ["XGBoostClassifier", "PyTorch two-layer LSTM on 60 M15 bars", "XGB 60% + LSTM 40%"],
            "signal_rule": "v6.2.6.3 BUY-only strict gates: Wave3/Fib, SMC >=85, XGB >=75%, LSTM >=80%, ensemble >=85%, RSI/volume/momentum/Fib61.8/discount/H1/ATR/spread, plus high-impact news blackout +/-30m",
            "historical_news_calendar_provided": news_safe is not None,
        },
        "news_calendar": news_provenance,
        "walk_forward": fold_results,
        "auto_tuning": _build_auto_tuning_history(
            tuning_trials, fold_results, final_model=final_tuning, status="completed"
        ),
        "final_out_of_sample": final_result,
        "model_files": [
            (model_path / "xgb_model.json").as_posix(),
            (model_path / "deep_lstm.pt").as_posix(),
            (model_path / "model_manifest.json").as_posix(),
        ],
        "limitations": [
            "Historical research only; no claim of future profitability.",
            "Commission is configured to zero because the available small MT5 deal sample does not verify commission per lot; confirm broker schedule before production use.",
            "Swap omitted because trade duration is capped at 12 M15 bars.",
            "Spread uses the recorded MT5 bar spread; slippage remains an assumption.",
            "Maximum drawdown uses closed-trade equity, not tick-level intratrade drawdown.",
            "The symbol available on this demo terminal is XAUUSDm; no symbol literally named XAUUSDM was found.",
            ("A validated historical high-impact news calendar was supplied and applied to this run; bars within +/-30 minutes are excluded." if news_safe is not None else "No historical high-impact news calendar was supplied; the +/-30 minute news guard fails closed and no entries are permitted."),
            "The requested rules contain an SL conflict (Wave2 Low - $5 versus a locked $5 entry distance); research uses the explicit fixed $5 stop and $11 target example.",
            "Only BUY rules were specified in the supplied checklist; SELL signal generation is deliberately disabled.",
            "The 61.8% Fib tolerance is not specified in the user rule; research assumes +/-5 percentage points and records that assumption.",
        ],
        "safety": {"orders_submitted": False, "live_trading_enabled": False},
    }
    report_file = Path(report_path)
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_file.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    tuning_file = report_file.with_name("wave3_auto_tuning_history.json")
    tuning_file.write_text(json.dumps(report["auto_tuning"], indent=2, default=str), encoding="utf-8")
    trade_columns = [
        "signal_timestamp", "entry_timestamp", "exit_timestamp", "direction",
        "p_xgb_buy", "p_lstm_buy", "p_ensemble_buy", "p_short", "p_hold", "p_long",
        "entry_price", "stop_price", "take_profit_price",
        "exit_price", "exit_reason", "lots", "gross_pnl_usd", "commission_usd",
        "net_pnl_usd", "equity_after_usd", "bars_held",
    ]
    pd.DataFrame(final_result.get("trades", []), columns=trade_columns).to_csv(
        report_file.with_name("wave3_final_oos_trades.csv"), index=False
    )
    compact = {
        "classification": {k: final_result["classification"][k] for k in (
            "samples", "accuracy_pct", "majority_class_baseline_accuracy_pct",
            "beats_majority_baseline", "balanced_accuracy_pct", "macro_f1_pct"
        )},
        "signal_diagnostics": final_result["signal_diagnostics"],
        "performance_gate": performance_gate,
        "backtest": final_result["backtest"],
        "folds": [{"name": r.get("name"), "status": r.get("status"),
                   "classification": {k: r.get("classification", {}).get(k) for k in ("samples", "accuracy_pct", "balanced_accuracy_pct", "macro_f1_pct")},
                   "backtest": r.get("backtest")} for r in fold_results],
        "report": str(report_file), "model_dir": str(model_path),
        "auto_tuning": {"trials_per_window": int(tuning_trials), "final_selected_parameters": final_tuning["selected_parameters"]},
    }
    print("[FINAL OOS RESULT]\n" + json.dumps(compact, indent=2, default=str), flush=True)
    return report



def _build_daily_candidate_features(
    frame: pd.DataFrame,
    frozen_oos_start: pd.Timestamp,
    live_data_start: pd.Timestamp,
) -> pd.DataFrame:
    """Build independent causal feature segments around the immutable historical OOS window."""
    timestamps = pd.to_datetime(frame["timestamp"], utc=True)
    old_positions = np.flatnonzero((timestamps < frozen_oos_start).to_numpy())
    live_positions = np.flatnonzero((timestamps >= live_data_start).to_numpy())
    if len(old_positions) < 3000 or len(live_positions) < 260:
        raise ValueError(
            "daily candidate needs >=3000 pre-OOS bars and >=260 fresh post-baseline M15 bars; "
            f"old={len(old_positions)} live={len(live_positions)}"
        )
    feature_parts = []
    for positions in (old_positions, live_positions):
        if not len(positions):
            continue
        segment = frame.iloc[positions].reset_index(drop=True)
        part = build_causal_features(segment)
        part.index = positions
        feature_parts.append(part)
    # The frozen OOS interval is intentionally left as NaN and removed by make_labeled_frame.
    features = pd.concat(feature_parts).sort_index()
    return features.reindex(frame.index)


def run_daily_candidate_experiment(
    data_path: str | Path,
    model_dir: str | Path,
    report_path: str | Path,
    news_calendar_path: str | Path,
    live_data_start_utc: str,
    tuning_trials: int = AUTO_TUNING_TRIALS,
) -> dict[str, Any]:
    """Train a non-promotable daily candidate without reading the frozen historical Final OOS."""
    if not news_calendar_path:
        raise ValueError("daily candidate training requires a current verified MT5 high-impact news export")
    if not 1 <= int(tuning_trials) <= 12:
        raise ValueError("tuning_trials must be between 1 and 12")
    frozen_oos_start = pd.Timestamp("2026-07-01T00:00:00Z")
    live_data_start = pd.Timestamp(live_data_start_utc)
    live_data_start = (
        live_data_start.tz_localize("UTC") if live_data_start.tzinfo is None
        else live_data_start.tz_convert("UTC")
    )
    if live_data_start <= frozen_oos_start:
        raise ValueError("daily live data boundary must be later than the frozen historical OOS start")

    frame = load_bars(data_path)
    news_safe = load_news_calendar(news_calendar_path, frame)
    news_provenance = _news_calendar_manifest(news_calendar_path, news_safe, len(frame))
    if news_safe is None:
        raise ValueError("daily candidate requires a valid current high-impact USD calendar")
    data_sha = hashlib.sha256(Path(data_path).read_bytes()).hexdigest()
    timestamps = pd.to_datetime(frame["timestamp"], utc=True)
    frozen_positions = np.flatnonzero((timestamps >= frozen_oos_start).to_numpy())
    live_positions = np.flatnonzero((timestamps >= live_data_start).to_numpy())
    if not len(frozen_positions) or not len(live_positions):
        raise ValueError("dataset must contain both the frozen OOS boundary and fresh post-baseline bars")
    first_frozen_source_index = int(frozen_positions[0])
    first_live_source_index = int(live_positions[0])

    print(
        "DAILY CANDIDATE: building independent feature histories; frozen 2026-07-01 OOS interval excluded",
        flush=True,
    )
    features = _build_daily_candidate_features(frame, frozen_oos_start, live_data_start)
    X, y, meta = make_labeled_frame(frame, features)
    source_indices = meta["source_index"].to_numpy(dtype=np.int64)
    meta_times = pd.to_datetime(meta["timestamp"], utc=True)
    # Pre-OOS labels whose 12-bar forward endpoint touches the frozen OOS interval are purged.
    pre_oos_mask = (
        (meta_times < frozen_oos_start).to_numpy()
        & (source_indices + HORIZON_BARS < first_frozen_source_index)
    )
    # Fresh bars are eligible only after their complete 12-bar label horizon has closed.
    live_mask = (
        (meta_times >= live_data_start).to_numpy()
        & (source_indices >= first_live_source_index)
        & (source_indices + HORIZON_BARS < len(frame))
    )
    training_mask = pre_oos_mask | live_mask
    train_indices = np.flatnonzero(training_mask)
    old_rows = int(pre_oos_mask.sum())
    live_rows = int(live_mask.sum())
    if old_rows < 5000 or live_rows < 96 or len(train_indices) < 5096:
        raise ValueError(
            "insufficient mature daily candidate rows; "
            f"pre_oos={old_rows} fresh_live={live_rows} total={len(train_indices)}"
        )

    X_train = X.iloc[train_indices].reset_index(drop=True)
    y_train = y.iloc[train_indices].reset_index(drop=True)
    meta_train = meta.iloc[train_indices].reset_index(drop=True)
    # Segment IDs stop the 60-bar LSTM sequence builder joining data across the frozen OOS gap.
    segment_ids = np.where(
        (pd.to_datetime(meta_train["timestamp"], utc=True) < frozen_oos_start).to_numpy(),
        0,
        1,
    ).astype(np.int8)
    if set(np.unique(segment_ids)) != {0, 1}:
        raise ValueError("daily candidate must contain both independent history segments")

    print(
        f"DAILY CANDIDATE rows={len(X_train)} pre_oos={old_rows} fresh_live={live_rows}; "
        "running inner-fold-only XGBoost tuning and XGBoost/LSTM fitting",
        flush=True,
    )
    # Tune hyperparameters only on the pre-OOS historical segment. The fresh
    # live segment is included in candidate fitting only after its labels mature;
    # it is never used to select hyperparameters on the same daily run.
    pre_oos_indices = np.flatnonzero(pre_oos_mask)
    tuning = auto_tune_xgb(
        X.iloc[pre_oos_indices].reset_index(drop=True),
        y.iloc[pre_oos_indices].reset_index(drop=True),
        meta.iloc[pre_oos_indices].reset_index(drop=True),
        n_trials=int(tuning_trials),
        study_name="daily_candidate_pre_oos_inner_folds_only",
    )
    if tuning.get("status") not in {"completed", "completed_with_fallback"}:
        raise RuntimeError(f"daily candidate inner-fold tuning did not complete: {tuning.get('status')}")
    models = _build_models(
        X_train,
        y_train,
        tuning["selected_parameters"],
        segment_ids=segment_ids,
    )

    model_path = Path(model_dir)
    model_path.mkdir(parents=True, exist_ok=True)
    models[0].save_model(str(model_path / "xgb_model.json"))
    torch.save(
        {
            "state_dict": models[2].state_dict(),
            "input_size": int(X_train.shape[1]),
            "hidden_size": 32,
            "scaler": models[1],
            "feature_columns": list(X_train.columns),
            "label_mapping": LABEL_NAMES,
            "sequence_length": LSTM_SEQUENCE_LENGTH,
            "seed": SEED,
            "training_batch_size": getattr(models[2], "_training_batch_size", LSTM_TRAIN_BATCH_SIZE),
            "training_segments": {"0": "pre_2026-07-01_historical", "1": "post_baseline_live_data"},
        },
        model_path / "deep_lstm.pt",
    )
    reloaded = load_saved_models(model_path)
    if reloaded[3] != list(X_train.columns):
        raise RuntimeError("daily candidate saved model feature schema differs from training schema")
    check_start = LSTM_SEQUENCE_LENGTH
    check_count = min(256, len(X_train) - check_start)
    if check_count < 1:
        raise RuntimeError("not enough rows for model artifact round-trip verification")
    check_X = X_train.iloc[check_start:check_start + check_count]
    context = X_train.iloc[:check_start]
    check_xgb, check_lstm = predict_model_probabilities(check_X, reloaded[:3], context)
    check_ensemble = ENSEMBLE_XGB_WEIGHT * check_xgb + ENSEMBLE_LSTM_WEIGHT * check_lstm
    in_memory_xgb, in_memory_lstm = predict_model_probabilities(check_X, models[:3], context)
    in_memory_ensemble = ENSEMBLE_XGB_WEIGHT * in_memory_xgb + ENSEMBLE_LSTM_WEIGHT * in_memory_lstm
    if not np.allclose(check_ensemble, in_memory_ensemble, atol=1e-6):
        raise RuntimeError("daily candidate serialized artifacts do not reproduce ensemble probabilities")

    artifacts = {}
    for name in ("xgb_model.json", "deep_lstm.pt"):
        artifact = model_path / name
        artifacts[name] = {
            "path": artifact.as_posix(),
            "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            "bytes": artifact.stat().st_size,
        }
    old_meta = meta_train.loc[segment_ids == 0, "timestamp"]
    live_meta = meta_train.loc[segment_ids == 1, "timestamp"]
    training_periods = {
        "pre_oos_historical": {
            "rows": old_rows,
            "first_timestamp_utc": pd.Timestamp(old_meta.min()).isoformat(),
            "last_label_timestamp_utc": pd.Timestamp(old_meta.max()).isoformat(),
            "label_endpoint_purged_before_source_index": first_frozen_source_index,
        },
        "fresh_post_baseline": {
            "rows": live_rows,
            "first_timestamp_utc": pd.Timestamp(live_meta.min()).isoformat(),
            "last_label_timestamp_utc": pd.Timestamp(live_meta.max()).isoformat(),
            "live_data_start_utc": live_data_start.isoformat(),
        },
    }
    manifest = {
        "strategy": "VOOM v6.2.6.3 Wave3 + SMC daily shadow candidate",
        "version": "6.2.6.3-daily-candidate",
        "candidate_only": True,
        "promotion_eligible": False,
        "production_eligible": False,
        "model_artifacts": artifacts,
        "data_sha256": data_sha,
        "bar_count": int(len(frame)),
        "data_first_bar_utc": pd.Timestamp(frame["timestamp"].iloc[0]).isoformat(),
        "data_last_closed_bar_utc": pd.Timestamp(frame["timestamp"].iloc[-1]).isoformat(),
        "symbol": "XAUUSDm",
        "timeframe": "M15",
        "timezone": "UTC",
        "news_calendar": news_provenance,
        "training_rows": int(len(train_indices)),
        "training_periods": training_periods,
        "excluded_historical_final_oos": {
            "start_utc": frozen_oos_start.isoformat(),
            "end_exclusive_utc": live_data_start.isoformat(),
            "rows_excluded": int(((meta_times >= frozen_oos_start) & (meta_times < live_data_start)).sum()),
            "used_for_fit": False,
            "used_for_tuning_or_calibration": False,
            "note": "The previously inspected 2026-07-01 through pre-live-baseline interval remains frozen and excluded.",
        },
        "label_horizon_bars": HORIZON_BARS,
        "pre_oos_label_purge_bars": HORIZON_BARS,
        "xgb_parameters": tuning.get("selected_parameters", {}),
        "inner_fold_tuning": tuning,
        "deep_model": {
            "type": "PyTorch two-layer LSTMClassifier",
            "sequence_length_bars": LSTM_SEQUENCE_LENGTH,
            "layers": [32, 32],
            "epochs": 4,
            "training_batch_size": getattr(models[2], "_training_batch_size", LSTM_TRAIN_BATCH_SIZE),
            "training_loss_by_epoch": getattr(models[2], "_training_losses", []),
            "segment_aware_sequences": True,
            "ensemble_weight": ENSEMBLE_LSTM_WEIGHT,
        },
        "ensemble": {"xgb_weight": ENSEMBLE_XGB_WEIGHT, "lstm_weight": ENSEMBLE_LSTM_WEIGHT},
        "v6_2_6_3_gates": {
            "unchanged": True,
            "smc_minimum": 85,
            "xgb_buy_minimum": XGB_MIN_CONFIDENCE,
            "lstm_buy_minimum": LSTM_MIN_CONFIDENCE,
            "ensemble_buy_minimum": PROBABILITY_THRESHOLD,
            "max_daily_trades": MAX_DAILY_TRADES,
            "max_daily_loss_usd": MAX_DAILY_LOSS_USD,
        },
        "artifact_round_trip_verification": {
            "passed": True,
            "held_out_training_rows_compared": int(check_count),
            "feature_schema_matches": True,
            "max_probability_abs_tolerance": 1e-6,
        },
        "safety": {
            "orders_submitted": False,
            "live_trading_enabled": False,
            "deployment_enabled": False,
            "candidate_only": True,
            "promotion_eligible": False,
            "market_data_access": "read-only MT5 bridge",
        },
    }
    (model_path / "model_manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    report = {
        "status": "completed_daily_candidate_not_performance_approval",
        "candidate_only": True,
        "promotion_eligible": False,
        "generated_utc": pd.Timestamp.now(tz="UTC").isoformat(),
        "data": {
            "path": str(data_path),
            "sha256": data_sha,
            "bar_count": int(len(frame)),
            "first_timestamp_utc": pd.Timestamp(frame["timestamp"].iloc[0]).isoformat(),
            "last_closed_bar_utc": pd.Timestamp(frame["timestamp"].iloc[-1]).isoformat(),
        },
        "training": {
            "rows": int(len(train_indices)),
            "class_distribution": {LABEL_NAMES[k]: int((y_train == k).sum()) for k in LABEL_NAMES},
            "periods": training_periods,
            "excluded_historical_final_oos": manifest["excluded_historical_final_oos"],
            "label_purge_bars": HORIZON_BARS,
            "inner_fold_tuning": tuning,
            "lstm_training_loss_by_epoch": getattr(models[2], "_training_losses", []),
        },
        "news_calendar": news_provenance,
        "artifacts": artifacts,
        "artifact_round_trip_verification": manifest["artifact_round_trip_verification"],
        "performance_gate": {
            "status": "not_evaluated",
            "passed": False,
            "production_eligible": False,
            "blockers": [
                "Daily candidate mode deliberately does not run or modify the frozen Final OOS.",
                "Candidate models are not promoted or deployed by the daily job.",
                "Commission/swap and independent forward OOS evidence remain separate acceptance requirements.",
            ],
        },
        "safety": {
            "orders_submitted": False,
            "live_trading_enabled": False,
            "deployment_enabled": False,
        },
    }
    report_file = Path(report_path)
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_file.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(
        "[DAILY CANDIDATE RESULT] "
        + json.dumps({
            "status": report["status"],
            "candidate_only": True,
            "training_rows": len(train_indices),
            "pre_oos_rows": old_rows,
            "fresh_live_rows": live_rows,
            "data_sha256": data_sha,
            "news_calendar_sha256": news_provenance.get("sha256"),
            "model_dir": str(model_path),
            "promotion_eligible": False,
        }, default=str),
        flush=True,
    )
    return report

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--model-dir", default=DEFAULT_MODEL_DIR)
    parser.add_argument("--report", default=DEFAULT_REPORT)
    parser.add_argument("--news-calendar", default=None,
                        help="CSV with UTC timestamp,impact columns; high impact events are excluded +/-30 minutes. Without it the backtest fails closed.")
    parser.add_argument("--tuning-trials", type=int, default=AUTO_TUNING_TRIALS,
                        help="Number of deterministic XGB hyperparameter candidates per nested tuning window (1-12; entry gates remain fixed).")
    parser.add_argument("--daily-candidate-only", action="store_true",
                        help="Train a non-promotable daily candidate; never run or modify the frozen 2026-07-01 Final OOS.")
    parser.add_argument("--candidate-live-start-utc", default="2026-10-29T17:00:00Z",
                        help="First bar allowed into daily candidate training after the verified baseline export.")
    args = parser.parse_args()
    if args.daily_candidate_only:
        if not args.news_calendar:
            parser.error("--daily-candidate-only requires --news-calendar with current MQL5 coverage")
        run_daily_candidate_experiment(
            args.data, args.model_dir, args.report, args.news_calendar,
            args.candidate_live_start_utc, args.tuning_trials,
        )
    else:
        run_experiment(args.data, args.model_dir, args.report, args.news_calendar, args.tuning_trials)


if __name__ == "__main__":
    main()
