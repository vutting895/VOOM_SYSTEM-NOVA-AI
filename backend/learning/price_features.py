"""Leakage-safe, gap-aware tabular features for next-bar return forecasting."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd

from .data_sources import MarketDataset, MarketBar


RETURN_LAGS = (1, 3, 7, 14, 30)
ROLLING_WINDOWS = (7, 14, 30, 45, 60)
TARGET_COLUMN = "target_next_log_return"


@dataclass(frozen=True)
class PriceFeatureSet:
    frame: pd.DataFrame
    feature_columns: tuple[str, ...]
    target_column: str = TARGET_COLUMN


def _bar_frame(bars: Sequence[MarketBar]) -> pd.DataFrame:
    rows = [
        {
            "timestamp": bar.timestamp,
            "open": float(bar.open),
            "high": float(bar.high),
            "low": float(bar.low),
            "close": float(bar.close),
            "volume": float(bar.volume),
        }
        for bar in bars
    ]
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame = frame.set_index("timestamp").sort_index()
    if frame.index.has_duplicates or not frame.index.is_monotonic_increasing:
        raise ValueError("Bars must have unique, ascending timestamps")
    values = frame[["open", "high", "low", "close", "volume"]].to_numpy(dtype=float)
    if not np.isfinite(values).all():
        raise ValueError("OHLCV features contain non-finite values")
    if (frame[["open", "high", "low", "close"]] <= 0).any().any():
        raise ValueError("OHLC prices must be positive")
    if (frame["volume"] < 0).any():
        raise ValueError("Volume cannot be negative")
    return frame


def _features_for_contiguous_segment(bars: Sequence[MarketBar]) -> pd.DataFrame:
    raw = _bar_frame(bars)
    if len(raw) <= max(ROLLING_WINDOWS):
        return pd.DataFrame(index=raw.index)

    log_close = np.log(raw["close"])
    one_bar_return = log_close.diff()
    features = pd.DataFrame(index=raw.index)

    # Current-bar and lagged returns are observable after the current candle closes.
    for lag in RETURN_LAGS:
        features[f"log_return_lag_{lag}"] = one_bar_return.shift(lag - 1)

    for window in ROLLING_WINDOWS:
        rolling_mean = raw["close"].rolling(window=window, min_periods=window).mean()
        features[f"close_vs_ma_{window}"] = raw["close"] / rolling_mean - 1.0
        features[f"return_mean_{window}"] = one_bar_return.rolling(
            window=window, min_periods=window
        ).mean()
        features[f"return_std_{window}"] = one_bar_return.rolling(
            window=window, min_periods=window
        ).std(ddof=0)

    # Scale-free candle and volume features.
    features["intrabar_range_pct"] = (raw["high"] - raw["low"]) / raw["close"]
    features["candle_body_pct"] = (raw["close"] - raw["open"]) / raw["open"]
    features["upper_wick_pct"] = (
        raw["high"] - raw[["open", "close"]].max(axis=1)
    ) / raw["close"]
    features["lower_wick_pct"] = (
        raw[["open", "close"]].min(axis=1) - raw["low"]
    ) / raw["close"]
    log_volume = np.log1p(raw["volume"])
    features["log_volume_change"] = log_volume.diff()
    volume_mean = log_volume.rolling(window=30, min_periods=30).mean()
    volume_std = log_volume.rolling(window=30, min_periods=30).std(ddof=0)
    features["volume_zscore_30"] = (log_volume - volume_mean) / volume_std.replace(0, np.nan)

    # Calendar features are derived only from the candle timestamp.
    utc = raw.index.tz_convert("UTC") if raw.index.tz is not None else raw.index.tz_localize("UTC")
    hour = utc.hour + utc.minute / 60.0
    weekday = utc.dayofweek
    features["hour_sin"] = np.sin(2.0 * np.pi * hour / 24.0)
    features["hour_cos"] = np.cos(2.0 * np.pi * hour / 24.0)
    features["weekday_sin"] = np.sin(2.0 * np.pi * weekday / 7.0)
    features["weekday_cos"] = np.cos(2.0 * np.pi * weekday / 7.0)
    features["month_sin"] = np.sin(2.0 * np.pi * (utc.month - 1) / 12.0)
    features["month_cos"] = np.cos(2.0 * np.pi * (utc.month - 1) / 12.0)

    # At timestamp t, features use data available through candle t; label is t -> t+1.
    features[TARGET_COLUMN] = log_close.shift(-1) - log_close
    features = features.replace([np.inf, -np.inf], np.nan).dropna()
    return features


def build_price_features(dataset: MarketDataset) -> PriceFeatureSet:
    """Create features independently within each contiguous data segment.

    The loader records the index at which each new segment begins after a gap.
    Rolling windows and next-bar labels are never allowed to cross such a gap.
    """
    bars = dataset.bars
    if not bars:
        raise ValueError("Dataset contains no bars")

    # Only unexplained gaps reset rolling windows. Bounded weekend/market
    # closures are continuous tradable history and must not discard warm-up bars.
    split_indices = getattr(
        dataset, "unexplained_gap_after_indices", dataset.gap_after_indices
    )
    starts = [0, *split_indices, len(bars)]
    frames: list[pd.DataFrame] = []
    for start, stop in zip(starts[:-1], starts[1:]):
        if stop <= start:
            continue
        segment = _features_for_contiguous_segment(bars[start:stop])
        if not segment.empty:
            frames.append(segment)
    if not frames:
        raise ValueError("No rows remain after feature warm-up and gap-safe labeling")

    frame = pd.concat(frames).sort_index()
    if frame.index.has_duplicates:
        raise ValueError("Feature timestamps are not unique")
    feature_columns = tuple(column for column in frame.columns if column != TARGET_COLUMN)
    if not feature_columns:
        raise ValueError("No model features were generated")
    return PriceFeatureSet(frame=frame, feature_columns=feature_columns)
