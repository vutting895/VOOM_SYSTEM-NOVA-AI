"""Regression tests for candidate training boundaries and reserved OOS isolation."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from backend.learning import train_price_model as trainer
from backend.learning.data_sources import MarketBar, MarketDataset, chronological_splits
from backend.learning.price_features import PriceFeatureSet, TARGET_COLUMN


class FakeBooster:
    def save_model(self, path: str) -> None:
        Path(path).write_text("unit-test-model", encoding="utf-8")

    def feature_importance(self, importance_type: str = "gain") -> np.ndarray:
        return np.asarray([1.0], dtype=float)


class RecordingEstimator:
    fit_indices: list[pd.Timestamp] = []
    predict_indices: list[pd.Timestamp] = []

    def __init__(self) -> None:
        self.n_estimators = 10
        self.best_iteration_ = 10
        self.booster_ = FakeBooster()

    def fit(self, x, y, eval_set=None, callbacks=None):
        self.fit_indices.extend(pd.Timestamp(value) for value in x.index)
        return self

    def predict(self, x):
        self.predict_indices.extend(pd.Timestamp(value) for value in x.index)
        # Equal-to-zero predictions must fail the strict baseline-improvement gate.
        return np.zeros(len(x), dtype=float)


def make_dataset(
    *,
    start_utc: datetime | None = None,
    benchmark_eligible: bool = False,
    live_feed: bool = False,
    unexplained_gap_after_indices: tuple[int, ...] = (),
) -> MarketDataset:
    start = start_utc or datetime(2024, 1, 1, tzinfo=timezone.utc)
    bars = tuple(
        MarketBar(
            timestamp=start + timedelta(hours=index),
            open=Decimal("2000"),
            high=Decimal("2001"),
            low=Decimal("1999"),
            close=Decimal("2000"),
            volume=Decimal("100"),
            extras={},
        )
        for index in range(1000)
    )
    return MarketDataset(
        dataset_id="synthetic-training-test",
        source="synthetic unit-test fixture",
        symbol="XAUUSDm",
        timeframe="1h",
        bars=bars,
        sha256="synthetic-fixture-only",
        size_bytes=0,
        eligibility="benchmark" if benchmark_eligible else "candidate_only",
        benchmark_eligible=benchmark_eligible,
        live_feed=live_feed,
        missing_interval_count=0,
        gap_after_indices=(),
        unexplained_gap_after_indices=unexplained_gap_after_indices,
    )


def make_features(dataset: MarketDataset) -> PriceFeatureSet:
    index = pd.DatetimeIndex([bar.timestamp for bar in dataset.bars])
    frame = pd.DataFrame(
        {
            "signal": np.linspace(-1.0, 1.0, len(index)),
            TARGET_COLUMN: 0.0005 + 0.0002 * np.sin(np.arange(len(index)) / 11.0),
        },
        index=index,
    )
    return PriceFeatureSet(frame=frame, feature_columns=("signal",))



def test_trainer_blocks_unexplained_dataset_gap_before_feature_build(tmp_path, monkeypatch):
    dataset = make_dataset(unexplained_gap_after_indices=(500,))
    monkeypatch.setattr(trainer, "load_market_dataset", lambda *args, **kwargs: dataset)

    def unexpected_feature_build(_dataset):
        raise AssertionError("features must not be built while unexplained gaps exist")

    monkeypatch.setattr(trainer, "build_price_features", unexpected_feature_build)
    with pytest.raises(ValueError, match="unexplained historical gaps"):
        trainer.train(
            repo_root=tmp_path,
            dataset_id=dataset.dataset_id,
            output_root=tmp_path / "blocked-artifacts",
        )
    assert not (tmp_path / "blocked-artifacts").exists()


def test_trainer_seals_calendar_final_oos_before_feature_build_and_fit(tmp_path, monkeypatch):
    dataset = make_dataset(start_utc=datetime(2026, 6, 1, tzinfo=timezone.utc))
    built_dataset_bars = []
    RecordingEstimator.fit_indices = []
    RecordingEstimator.predict_indices = []
    monkeypatch.setattr(trainer, "load_market_dataset", lambda *args, **kwargs: dataset)

    def build_features(pre_oos_dataset):
        built_dataset_bars.extend(bar.timestamp for bar in pre_oos_dataset.bars)
        return make_features(pre_oos_dataset)

    monkeypatch.setattr(trainer, "build_price_features", build_features)
    monkeypatch.setattr(trainer, "_model", lambda rounds, seed: RecordingEstimator())
    monkeypatch.setattr(trainer, "_git_sha", lambda _root: "unit-test-commit")

    result = trainer.train(
        repo_root=tmp_path,
        dataset_id=dataset.dataset_id,
        output_root=tmp_path / "sealed-oos-artifacts",
        min_validation_samples=30,
        upload_to_hf=False,
        training_approved=True,
        approved_dataset_sha256=dataset.sha256,
        approved_code_sha="unit-test-commit",
    )

    cutoff = pd.Timestamp("2026-07-01T00:00:00Z")
    assert built_dataset_bars
    assert all(pd.Timestamp(value) < cutoff for value in built_dataset_bars)
    assert all(value < cutoff for value in RecordingEstimator.fit_indices)
    assert all(value < cutoff for value in RecordingEstimator.predict_indices)
    run_dir = tmp_path / "sealed-oos-artifacts" / result["run_id"]
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["final_oos_touched"] is False
    assert manifest["final_oos_start_utc"] == "2026-07-01T00:00:00+00:00"
    assert manifest["training_data_end_exclusive_utc"] == "2026-07-01T00:00:00+00:00"


def test_trainer_never_fits_or_predicts_on_reserved_final_test(tmp_path, monkeypatch):
    dataset = make_dataset()
    features = make_features(dataset)
    splits = chronological_splits(dataset, label_horizon_bars=1, embargo_bars=1)
    reserved_test = {pd.Timestamp(bar.timestamp) for bar in splits.test.bars}

    RecordingEstimator.fit_indices = []
    RecordingEstimator.predict_indices = []
    monkeypatch.setattr(trainer, "load_market_dataset", lambda *args, **kwargs: dataset)
    monkeypatch.setattr(trainer, "build_price_features", lambda _dataset: features)
    monkeypatch.setattr(trainer, "_model", lambda rounds, seed: RecordingEstimator())
    monkeypatch.setattr(trainer, "_git_sha", lambda _root: "unit-test-commit")

    result = trainer.train(
        repo_root=tmp_path,
        dataset_id=dataset.dataset_id,
        output_root=tmp_path / "candidate-artifacts",
        min_validation_samples=100,
        upload_to_hf=False,
        training_approved=True,
        approved_dataset_sha256=dataset.sha256,
        approved_code_sha="unit-test-commit",
    )

    assert reserved_test
    assert reserved_test.isdisjoint(RecordingEstimator.fit_indices)
    assert reserved_test.isdisjoint(RecordingEstimator.predict_indices)
    run_dir = tmp_path / "candidate-artifacts" / result["run_id"]
    metrics = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    assert metrics["reserved_test_evaluated"] is False
    assert metrics["reserved_test_rows_available"] == len(splits.test.bars)
    assert manifest["final_oos_touched"] is False
    assert manifest["auto_promoted"] is False
    assert manifest["live_trading_enabled"] is False
    assert result["candidate_status"] == "rejected"


@pytest.mark.parametrize(
    ("benchmark_eligible", "live_feed"),
    [(True, False), (False, True)],
)
def test_trainer_rejects_benchmark_or_live_feed_before_feature_build(
    tmp_path, monkeypatch, benchmark_eligible, live_feed
):
    dataset = make_dataset(
        benchmark_eligible=benchmark_eligible,
        live_feed=live_feed,
    )
    monkeypatch.setattr(trainer, "load_market_dataset", lambda *args, **kwargs: dataset)

    def unexpected_feature_build(_dataset):
        raise AssertionError("features must not be built for a disallowed dataset")

    monkeypatch.setattr(trainer, "build_price_features", unexpected_feature_build)

    with pytest.raises(ValueError, match="Only historical research-candidate datasets"):
        trainer.train(
            repo_root=tmp_path,
            dataset_id=dataset.dataset_id,
            output_root=tmp_path / "rejected-artifacts",
        )

    assert not (tmp_path / "rejected-artifacts").exists()


def test_trainer_requires_explicit_human_approval_before_feature_build(tmp_path, monkeypatch):
    dataset = make_dataset()
    monkeypatch.setattr(trainer, "load_market_dataset", lambda *args, **kwargs: dataset)
    monkeypatch.setattr(trainer, "_git_sha", lambda _root: "unit-test-commit")

    def unexpected_feature_build(_dataset):
        raise AssertionError("features must not be built without human approval")

    monkeypatch.setattr(trainer, "build_price_features", unexpected_feature_build)
    with pytest.raises(PermissionError, match="explicit human approval"):
        trainer.train(
            repo_root=tmp_path,
            dataset_id=dataset.dataset_id,
            output_root=tmp_path / "unapproved",
            approved_dataset_sha256=dataset.sha256,
            approved_code_sha="unit-test-commit",
        )
    assert not (tmp_path / "unapproved").exists()


def test_trainer_rejects_stale_dataset_or_code_approval(tmp_path, monkeypatch):
    dataset = make_dataset()
    monkeypatch.setattr(trainer, "load_market_dataset", lambda *args, **kwargs: dataset)
    monkeypatch.setattr(trainer, "_git_sha", lambda _root: "unit-test-commit")

    with pytest.raises(PermissionError, match="dataset SHA-256"):
        trainer.train(
            repo_root=tmp_path,
            dataset_id=dataset.dataset_id,
            output_root=tmp_path / "stale-dataset",
            training_approved=True,
            approved_dataset_sha256="0" * 64,
            approved_code_sha="unit-test-commit",
        )
    with pytest.raises(PermissionError, match="source SHA"):
        trainer.train(
            repo_root=tmp_path,
            dataset_id=dataset.dataset_id,
            output_root=tmp_path / "stale-code",
            training_approved=True,
            approved_dataset_sha256=dataset.sha256,
            approved_code_sha="0" * 40,
        )
    assert not (tmp_path / "stale-dataset").exists()
    assert not (tmp_path / "stale-code").exists()
