"""Leakage-aware Wave3 + SMC XGBoost / MLP training and backtest pipeline.
Research only: no broker execution or order-submission code. Features use closed bars;
signals enter no earlier than the next bar open.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import warnings
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

HORIZON_BARS = 12
PIVOT_LEFT = 3
PIVOT_RIGHT = 3
RISK_FRACTION = 0.0025
STOP_ATR_MULTIPLE = 1.5
REWARD_RISK = 2.0
MAX_HOLD_BARS = 12
SLIPPAGE_PRICE_PER_SIDE = 0.02
COMMISSION_PER_LOT_PER_SIDE_USD = 0.0  # Assumption only; the small deal sample cannot verify account commission.
CONTRACT_SIZE = 100.0
VOLUME_MIN = 0.01
VOLUME_MAX = 200.0
VOLUME_STEP = 0.01
PROBABILITY_THRESHOLD = 0.55
PROBABILITY_MARGIN = 0.10
LABEL_NAMES = {0: "short", 1: "hold", 2: "long"}
SEED = 6263

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
    for span in (8, 12, 20, 26, 50, 100):
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
        "bull_ob_recent", "bear_ob_recent", "bull_ob_zone", "bear_ob_zone",
        "dist_last_swing_high", "dist_last_swing_low", "fib_pullback_ratio",
        "wave3_long_zone", "wave3_short_zone", "wave3_long_breakout", "wave3_short_breakout",
    )
    struct = {name: np.zeros(n, dtype=float) for name in names}
    pivots: list[dict[str, Any]] = []
    last_high = last_low = None
    broken: set[tuple[str, int]] = set()
    bias = 0
    bull_ob = bear_ob = None

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
                else:
                    pivots.append(point)

        close_i = float(c.iloc[i])
        prev_i = float(c.iloc[i - 1]) if i else close_i
        bos_up = bos_down = choch_up = choch_down = 0
        if last_high and last_high["idx"] < i:
            key = ("high", last_high["idx"])
            if key not in broken and prev_i <= last_high["price"] < close_i:
                broken.add(key)
                if bias == -1:
                    choch_up = 1
                else:
                    bos_up = 1
                bias = 1
                for j in range(max(0, i - 8), i):
                    if c.iloc[j] < o.iloc[j]:
                        bull_ob = (i, float(l.iloc[j]), float(h.iloc[j]))
        if last_low and last_low["idx"] < i:
            key = ("low", last_low["idx"])
            if key not in broken and prev_i >= last_low["price"] > close_i:
                broken.add(key)
                if bias == 1:
                    choch_down = 1
                else:
                    bos_down = 1
                bias = -1
                for j in range(max(0, i - 8), i):
                    if c.iloc[j] > o.iloc[j]:
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
        if i >= 2:
            struct["bull_fvg"][i] = float(l.iloc[i]) > float(h.iloc[i - 2])
            struct["bear_fvg"][i] = float(h.iloc[i]) < float(l.iloc[i - 2])
        if bull_ob and i - bull_ob[0] <= 24:
            struct["bull_ob_recent"][i] = 1
            struct["bull_ob_zone"][i] = bull_ob[1] <= close_i <= bull_ob[2]
        if bear_ob and i - bear_ob[0] <= 24:
            struct["bear_ob_recent"][i] = 1
            struct["bear_ob_zone"][i] = bear_ob[1] <= close_i <= bear_ob[2]

        if len(pivots) >= 3:
            a, b, d = pivots[-3:]
            if a["kind"] == "low" and b["kind"] == "high" and d["kind"] == "low":
                impulse = b["price"] - a["price"]
                retrace = (b["price"] - d["price"]) / impulse if impulse > 0 else np.nan
                if d["price"] > a["price"] and 0 < retrace < 1:
                    struct["fib_pullback_ratio"][i] = retrace
                    in_zone = 0.45 <= retrace <= 0.85
                    struct["wave3_long_zone"][i] = in_zone
                    if i and in_zone and close_i > b["price"] and prev_i <= b["price"]:
                        struct["wave3_long_breakout"][i] = 1
            elif a["kind"] == "high" and b["kind"] == "low" and d["kind"] == "high":
                impulse = a["price"] - b["price"]
                retrace = (d["price"] - b["price"]) / impulse if impulse > 0 else np.nan
                if d["price"] < a["price"] and 0 < retrace < 1:
                    struct["fib_pullback_ratio"][i] = retrace
                    in_zone = 0.45 <= retrace <= 0.85
                    struct["wave3_short_zone"][i] = in_zone
                    if i and in_zone and close_i < b["price"] and prev_i >= b["price"]:
                        struct["wave3_short_breakout"][i] = 1
    for name, values in struct.items():
        f[name] = values
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
    valid_features = np.isfinite(features.to_numpy()).all(axis=1)
    usable = valid_features & valid_future
    X = features.loc[usable].reset_index(drop=True)
    y = pd.Series(labels[usable], name="label", dtype=np.int8)
    meta = frame.loc[usable].reset_index(drop=True).copy()
    meta["source_index"] = np.flatnonzero(usable)
    meta["forward_return_price"] = future_move[usable]
    meta["label_threshold_price"] = dynamic_move[usable]
    return X, y, meta


def _build_models(X: pd.DataFrame, y: pd.Series):
    if set(np.unique(y)) != {0, 1, 2}:
        raise ValueError(f"training split must contain all labels; found={sorted(np.unique(y).tolist())}")
    weights = compute_sample_weight(class_weight="balanced", y=y)
    xgb = XGBClassifier(
        n_estimators=140, max_depth=4, learning_rate=0.04, subsample=0.85,
        colsample_bytree=0.85, min_child_weight=8, reg_lambda=5.0,
        objective="multi:softprob", num_class=3, eval_metric="mlogloss",
        tree_method="hist", n_jobs=4, random_state=SEED, verbosity=0,
    )
    xgb.fit(X, y, sample_weight=weights, verbose=False)
    scaler = StandardScaler()
    scaled = scaler.fit_transform(X)
    deep = MLPClassifier(
        hidden_layer_sizes=(64, 32), activation="relu", solver="adam",
        alpha=0.002, batch_size=512, learning_rate_init=0.0008,
        max_iter=24, early_stopping=False, n_iter_no_change=6, tol=1e-4,
        random_state=SEED, verbose=False,
    )
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        deep.fit(scaled, y, sample_weight=weights)
    setattr(deep, "_training_warnings", [str(w.message) for w in caught if "converg" in str(w.message).lower()])
    return xgb, scaler, deep


def predict_ensemble(X: pd.DataFrame, models) -> np.ndarray:
    xgb, scaler, deep = models
    def align(prob, classes):
        out = np.zeros((len(prob), 3), dtype=float)
        for i, cls in enumerate(classes):
            out[:, int(cls)] = prob[:, i]
        return out
    return (align(xgb.predict_proba(X), np.asarray(xgb.classes_)) +
            align(deep.predict_proba(scaler.transform(X)), np.asarray(deep.classes_))) / 2.0


def load_saved_models(model_dir: str | Path):
    """Reload the committed artifacts; return models and the exact feature schema."""
    root = Path(model_dir)
    xgb = XGBClassifier()
    xgb.load_model(str(root / "xgb_model.json"))
    deep_bundle = joblib.load(root / "deep_mlp.joblib")
    return xgb, deep_bundle["scaler"], deep_bundle["mlp"], list(deep_bundle["feature_columns"])


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


def _lot_size(equity: float, stop_distance: float, spread: float,
              contract_size: float = CONTRACT_SIZE) -> float:
    risk_cash = equity * RISK_FRACTION
    cost_per_lot = contract_size * (spread + 2 * SLIPPAGE_PRICE_PER_SIDE) + 2 * COMMISSION_PER_LOT_PER_SIDE_USD
    loss_per_lot = stop_distance * contract_size + cost_per_lot
    if loss_per_lot <= 0:
        return 0.0
    raw = min(VOLUME_MAX, risk_cash / loss_per_lot)
    lots = math.floor((raw + 1e-12) / VOLUME_STEP) * VOLUME_STEP
    return round(lots, 4) if lots >= VOLUME_MIN else 0.0


def backtest_window(frame: pd.DataFrame, features: pd.DataFrame, source_indices: np.ndarray,
                    probabilities: np.ndarray, start_equity: float = 10000.0,
                    contract_size: float = CONTRACT_SIZE) -> dict[str, Any]:
    """Single-position, next-bar execution simulation over a strictly held-out window."""
    if len(source_indices) == 0:
        return {"trade_count": 0, "reason": "no valid prediction rows"}
    end_i = int(source_indices[-1])
    prob_by_index = {int(i): p for i, p in zip(source_indices, probabilities)}
    equity = float(start_equity)
    peak = equity
    max_dd = 0.0
    trades: list[dict[str, Any]] = []
    busy_until = -1
    for item in source_indices:
        i = int(item)
        if i <= busy_until or i + 1 > end_i or i + 1 >= len(frame):
            continue
        rowf = features.iloc[i]
        p = prob_by_index[i]
        setup_long = bool(rowf["wave3_long_breakout"] and
                          (rowf["bos_up"] or rowf["choch_up"] or rowf["bull_fvg"] or
                           rowf["bull_ob_zone"] or rowf["sell_side_sweep"]))
        setup_short = bool(rowf["wave3_short_breakout"] and
                           (rowf["bos_down"] or rowf["choch_down"] or rowf["bear_fvg"] or
                            rowf["bear_ob_zone"] or rowf["buy_side_sweep"]))
        long_signal = setup_long and p[2] >= PROBABILITY_THRESHOLD and p[2] - p[0] >= PROBABILITY_MARGIN
        short_signal = setup_short and p[0] >= PROBABILITY_THRESHOLD and p[0] - p[2] >= PROBABILITY_MARGIN
        if long_signal == short_signal:
            continue
        entry_i = i + 1
        entry_spread = float(frame["spread_price"].iloc[entry_i])
        signal_atr = float(rowf["atr_price"])
        if not np.isfinite(signal_atr) or signal_atr <= 0:
            continue
        stop_dist = max(STOP_ATR_MULTIPLE * signal_atr, entry_spread * 2)
        lots = _lot_size(equity, stop_dist, entry_spread, contract_size)
        if lots <= 0:
            continue
        long = long_signal
        if long:
            entry = float(frame["open"].iloc[entry_i]) + entry_spread + SLIPPAGE_PRICE_PER_SIDE
            stop, target = entry - stop_dist, entry + stop_dist * REWARD_RISK
        else:
            entry = float(frame["open"].iloc[entry_i]) - SLIPPAGE_PRICE_PER_SIDE
            stop, target = entry + stop_dist, entry - stop_dist * REWARD_RISK
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
                exit_price = stop - SLIPPAGE_PRICE_PER_SIDE if long else stop + SLIPPAGE_PRICE_PER_SIDE
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
        trades.append({
            "signal_timestamp": frame["timestamp"].iloc[i].isoformat(),
            "entry_timestamp": frame["timestamp"].iloc[entry_i].isoformat(),
            "exit_timestamp": frame["timestamp"].iloc[exit_i].isoformat(),
            "direction": "long" if long else "short",
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
        "avg_trade_usd": round(net / len(trades), 4) if trades else 0.0,
        "avg_win_usd": round(float(np.mean([t["net_pnl_usd"] for t in wins])), 4) if wins else 0.0,
        "avg_loss_usd": round(float(np.mean([t["net_pnl_usd"] for t in losses])), 4) if losses else 0.0,
        "final_equity_usd": round(equity, 4), "trades": trades,
    }


def _train_mask(meta: pd.DataFrame, test_start: pd.Timestamp) -> np.ndarray:
    cutoff = test_start - pd.Timedelta(minutes=15 * HORIZON_BARS)
    return (meta["timestamp"] < cutoff).to_numpy()


def _fold_run(frame: pd.DataFrame, features: pd.DataFrame, X: pd.DataFrame, y: pd.Series,
              meta: pd.DataFrame, name: str, test_start: str, test_end: str) -> dict[str, Any]:
    start = pd.Timestamp(test_start, tz="UTC")
    end = pd.Timestamp(test_end, tz="UTC")
    train_idx = np.flatnonzero(_train_mask(meta, start))
    test_end_purged = end - pd.Timedelta(minutes=15 * HORIZON_BARS)
    test_idx = np.flatnonzero(((meta["timestamp"] >= start) & (meta["timestamp"] < test_end_purged)).to_numpy())
    if len(train_idx) < 5000 or len(test_idx) < 500:
        return {"name": name, "status": "skipped_insufficient_rows", "train_rows": len(train_idx), "test_rows": len(test_idx)}
    X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
    X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]
    print(f"[{name}] train={len(train_idx)} test={len(test_idx)} fitting XGB + MLP...", flush=True)
    models = _build_models(X_train, y_train)
    prob = predict_ensemble(X_test, models)
    pred = prob.argmax(axis=1)
    raw_idx = meta["source_index"].iloc[test_idx].to_numpy(dtype=int)
    bt = backtest_window(frame, features, raw_idx, prob)
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
        "xgb_trees": int(models[0].n_estimators), "mlp_iterations": int(models[2].n_iter_),
        "mlp_convergence_warnings": getattr(models[2], "_training_warnings", []),
    }


def run_experiment(data_path: str | Path, model_dir: str | Path, report_path: str | Path) -> dict[str, Any]:
    frame = load_bars(data_path)
    raw_hash = hashlib.sha256(Path(data_path).read_bytes()).hexdigest()
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
        fold_results.append(_fold_run(frame, features, X, y, meta, name, start, end))

    final_start = pd.Timestamp("2026-07-01", tz="UTC")
    train_idx = np.flatnonzero(_train_mask(meta, final_start))
    test_idx = np.flatnonzero((meta["timestamp"] >= final_start).to_numpy())
    if len(train_idx) < 5000 or len(test_idx) < 500:
        raise ValueError(f"not enough final training/OOS data: train={len(train_idx)} test={len(test_idx)}")
    X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
    X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]
    print(f"[FINAL_OOS_2026_H2] train={len(train_idx)} test={len(test_idx)} fitting final artifacts...", flush=True)
    models = _build_models(X_train, y_train)
    prob = predict_ensemble(X_test, models)
    pred = prob.argmax(axis=1)
    raw_idx = meta["source_index"].iloc[test_idx].to_numpy(dtype=int)
    bt = backtest_window(frame, features, raw_idx, prob)
    oos_features = features.iloc[raw_idx]
    long_setup = oos_features["wave3_long_breakout"].astype(bool) & (
        oos_features["bos_up"].astype(bool) | oos_features["choch_up"].astype(bool) |
        oos_features["bull_fvg"].astype(bool) | oos_features["bull_ob_zone"].astype(bool) |
        oos_features["sell_side_sweep"].astype(bool)
    )
    short_setup = oos_features["wave3_short_breakout"].astype(bool) & (
        oos_features["bos_down"].astype(bool) | oos_features["choch_down"].astype(bool) |
        oos_features["bear_fvg"].astype(bool) | oos_features["bear_ob_zone"].astype(bool) |
        oos_features["buy_side_sweep"].astype(bool)
    )
    signal_diagnostics = {
        "wave3_long_breakouts": int(oos_features["wave3_long_breakout"].sum()),
        "wave3_short_breakouts": int(oos_features["wave3_short_breakout"].sum()),
        "long_with_smc_confluence": int(long_setup.sum()),
        "short_with_smc_confluence": int(short_setup.sum()),
        "long_passing_model_confidence": int((long_setup.to_numpy() & (prob[:, 2] >= PROBABILITY_THRESHOLD) &
                                                ((prob[:, 2] - prob[:, 0]) >= PROBABILITY_MARGIN)).sum()),
        "short_passing_model_confidence": int((short_setup.to_numpy() & (prob[:, 0] >= PROBABILITY_THRESHOLD) &
                                                 ((prob[:, 0] - prob[:, 2]) >= PROBABILITY_MARGIN)).sum()),
    }

    model_path = Path(model_dir)
    model_path.mkdir(parents=True, exist_ok=True)
    models[0].save_model(str(model_path / "xgb_model.json"))
    joblib.dump({"scaler": models[1], "mlp": models[2], "feature_columns": list(X.columns),
                 "label_mapping": LABEL_NAMES, "seed": SEED},
                model_path / "deep_mlp.joblib", compress=3)
    reloaded = load_saved_models(model_path)
    if reloaded[3] != list(X.columns):
        raise RuntimeError("saved model feature schema differs from the training schema")
    check_count = min(256, len(X_test))
    if not np.allclose(predict_ensemble(X_test.iloc[:check_count], reloaded[:3]), prob[:check_count], atol=1e-6):
        raise RuntimeError("saved model round-trip predictions do not match in-memory predictions")
    print(f"saved artifacts reloaded and verified on {check_count} held-out rows", flush=True)
    manifest = {
        "strategy": "VOOM Wave3 + SMC XGB/MLP ensemble", "version": "1.0.0-research",
        "data_sha256": raw_hash, "symbol": "XAUUSDm", "timeframe": "M15", "timezone": "UTC",
        "bar_count": len(frame), "usable_labeled_rows": len(X),
        "data_first_bar": ts0.isoformat(), "data_last_bar": tsn.isoformat(),
        "model_training_last_timestamp": meta["timestamp"].iloc[train_idx[-1]].isoformat(),
        "final_oos_start": "2026-07-01T00:00:00+00:00", "label_horizon_bars": HORIZON_BARS,
        "label_threshold": "max(2 * recorded bar spread, 0.35 * ATR14 * sqrt(horizon))",
        "feature_columns": list(X.columns), "label_mapping": LABEL_NAMES,
        "xgb_parameters": {"n_estimators": 140, "max_depth": 4, "learning_rate": 0.04,
                           "subsample": 0.85, "colsample_bytree": 0.85, "min_child_weight": 8,
                           "reg_lambda": 5.0, "tree_method": "hist", "seed": SEED},
        "deep_model": {"type": "scikit-learn MLPClassifier", "layers": [64, 32], "max_iter": 24,
                       "iterations_completed": int(models[2].n_iter_),
                       "convergence_warnings": getattr(models[2], "_training_warnings", [])},
        "artifact_round_trip_verification": {"passed": True, "held_out_rows_compared": check_count,
                                             "feature_schema_matches": True, "max_probability_abs_tolerance": 1e-6},
        "backtest_assumptions": {
            "starting_equity_usd": 10000.0, "risk_fraction_per_trade": RISK_FRACTION,
            "stop_atr_multiple": STOP_ATR_MULTIPLE, "reward_risk": REWARD_RISK,
            "max_hold_bars": MAX_HOLD_BARS, "contract_size": CONTRACT_SIZE,
            "volume_min": VOLUME_MIN, "volume_max": VOLUME_MAX, "volume_step": VOLUME_STEP,
            "slippage_price_per_side": SLIPPAGE_PRICE_PER_SIDE,
            "commission_per_lot_per_side_usd": COMMISSION_PER_LOT_PER_SIDE_USD,
            "swap": "omitted; maximum holding period is 12 M15 bars",
            "spread": "per-candle MT5 historical spread_price",
            "fills": "next-bar open; conservative stop-first when SL and TP touch the same OHLC bar",
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
        "mlp_iterations": int(models[2].n_iter_),
        "mlp_convergence_warnings": getattr(models[2], "_training_warnings", []),
    }
    gate_blockers = []
    if int(final_result["backtest"].get("trade_count", 0)) < 30:
        gate_blockers.append("final OOS has fewer than 30 closed trades; edge cannot be assessed reliably")
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
            "chronological_walk_forward_folds": len(fold_results),
            "purge": f"{HORIZON_BARS} bars before each test boundary",
            "final_holdout": "2026-07-01 through latest labeled bar; not used for model fitting",
            "models": ["XGBoostClassifier", "StandardScaler + MLPClassifier", "probabilities averaged 50/50"],
            "signal_rule": f"Wave3 retracement 45-85% breakout + SMC confluence + probability >= {PROBABILITY_THRESHOLD} and margin >= {PROBABILITY_MARGIN}",
        },
        "walk_forward": fold_results,
        "final_out_of_sample": final_result,
        "model_files": ["models/wave3_xgb_deep/xgb_model.json",
                        "models/wave3_xgb_deep/deep_mlp.joblib",
                        "models/wave3_xgb_deep/model_manifest.json"],
        "limitations": [
            "Historical research only; no claim of future profitability.",
            "Commission is configured to zero because the available small MT5 deal sample does not verify commission per lot; confirm broker schedule before production use.",
            "Swap omitted because trade duration is capped at 12 M15 bars.",
            "Spread uses the recorded MT5 bar spread; slippage remains an assumption.",
            "Maximum drawdown uses closed-trade equity, not tick-level intratrade drawdown.",
            "The symbol available on this demo terminal is XAUUSDm; no symbol literally named XAUUSDM was found.",
        ],
        "safety": {"orders_submitted": False, "live_trading_enabled": False},
    }
    report_file = Path(report_path)
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_file.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    trade_columns = [
        "signal_timestamp", "entry_timestamp", "exit_timestamp", "direction",
        "p_short", "p_hold", "p_long", "entry_price", "stop_price", "take_profit_price",
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
    }
    print("[FINAL OOS RESULT]\n" + json.dumps(compact, indent=2, default=str), flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--model-dir", default=DEFAULT_MODEL_DIR)
    parser.add_argument("--report", default=DEFAULT_REPORT)
    args = parser.parse_args()
    run_experiment(args.data, args.model_dir, args.report)


if __name__ == "__main__":
    main()
