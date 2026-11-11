"""Tests for leakage-free features and missing-data boundaries."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import math

import pandas as pd
import pytest

from backend.learning.price_features import TARGET_COLUMN, build_price_features


@dataclass(frozen=True)
class Bar:
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal


@dataclass(frozen=True)
class Dataset:
    bars: tuple[Bar, ...]
    gap_after_indices: tuple[int, ...]
    unexplained_gap_after_indices: tuple[int, ...] = ()


def make_dataset(count=160, gap_after=(), gap_extra_hours=3):
    start, price, bars = datetime(2025, 1, 1, tzinfo=timezone.utc), 100.0, []
    for i in range(count):
        price *= 1 + 0.0005 + 0.001 * ((i % 5) - 2)
        stamp = start + timedelta(hours=i + sum(gap_extra_hours for g in gap_after if i >= g))
        bars.append(Bar(
            stamp, Decimal(str(price * .999)), Decimal(str(price * 1.002)),
            Decimal(str(price * .997)), Decimal(str(price)), Decimal(str(100 + i)),
        ))
    return Dataset(tuple(bars), tuple(gap_after), tuple(gap_after))


def test_target_is_next_bar_log_return_and_lags_exist():
    dataset = make_dataset()
    result = build_price_features(dataset)
    assert TARGET_COLUMN in result.frame
    assert "log_return_lag_1" in result.feature_columns
    assert "close_vs_ma_60" in result.feature_columns
    assert result.frame.index.is_monotonic_increasing and result.frame.index.is_unique
    first = result.frame.index[0]
    current = next(b for b in dataset.bars if b.timestamp == first)
    following = next(b for b in dataset.bars if b.timestamp > first)
    assert result.frame.loc[first, TARGET_COLUMN] == pytest.approx(
        math.log(float(following.close) / float(current.close))
    )


def test_future_bar_change_does_not_change_earlier_features():
    original = make_dataset()
    changed = list(original.bars)
    last = changed[-1]
    changed[-1] = Bar(last.timestamp, last.open, last.high * 10, last.low,
                      last.close * 10, last.volume)
    before = build_price_features(original).frame
    after = build_price_features(Dataset(tuple(changed), ())).frame
    earlier = before.index.intersection(after.index)
    earlier = earlier[earlier < last.timestamp]
    pd.testing.assert_frame_equal(
        before.loc[earlier].drop(columns=[TARGET_COLUMN]),
        after.loc[earlier].drop(columns=[TARGET_COLUMN]),
    )


def test_no_rolling_or_target_crosses_missing_bar_gap():
    dataset = make_dataset(count=220, gap_after=(110,))
    result = build_price_features(dataset)
    assert dataset.bars[109].timestamp not in result.frame.index
    second_start = dataset.bars[110].timestamp
    later = result.frame.loc[result.frame.index >= second_start]
    assert later.index.min() > second_start + timedelta(hours=59)



def test_bounded_weekend_closure_does_not_restart_rolling_warmup():
    # A Friday-to-Monday closure is explicitly classified as bounded, so it
    # may preserve the historical rolling window instead of discarding 60 bars.
    dataset = make_dataset(count=220, gap_after=(110,), gap_extra_hours=73)
    dataset = Dataset(dataset.bars, dataset.gap_after_indices, unexplained_gap_after_indices=())
    result = build_price_features(dataset)

    assert dataset.unexplained_gap_after_indices == ()
    assert dataset.bars[109].timestamp in result.frame.index
    assert dataset.bars[110].timestamp in result.frame.index
    assert result.frame.loc[dataset.bars[110].timestamp, TARGET_COLUMN] == pytest.approx(
        math.log(float(dataset.bars[111].close) / float(dataset.bars[110].close))
    )


def test_unexplained_gap_restarts_rolling_warmup():
    dataset = make_dataset(count=220, gap_after=(110,), gap_extra_hours=120)
    dataset = Dataset(
        dataset.bars,
        dataset.gap_after_indices,
        unexplained_gap_after_indices=(110,),
    )
    result = build_price_features(dataset)
    assert dataset.bars[109].timestamp not in result.frame.index
    second_start = dataset.bars[110].timestamp
    later = result.frame.loc[result.frame.index >= second_start]
    assert later.index.min() > second_start + timedelta(hours=59)

def test_non_positive_prices_are_rejected():
    bars = list(make_dataset().bars)
    item = bars[10]
    bars[10] = Bar(item.timestamp, item.open, item.high, item.low,
                   Decimal("0"), item.volume)
    with pytest.raises(ValueError, match="positive"):
        build_price_features(Dataset(tuple(bars), ()))
