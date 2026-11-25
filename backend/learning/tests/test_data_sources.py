"""Unit tests for integrity-gated market-data ingestion and purged splits."""
import csv
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from decimal import Decimal

import pytest

from backend.learning.data_sources import (
    BINANCE_5Y_DATASET_ID,
    EXNESS_H1_DATASET_ID,
    DataSourceError,
    DatasetEligibilityError,
    MarketBar,
    MarketDataset,
    chronological_splits,
    load_binance_btcusdt_h1,
    load_exness_xauusdm_h1,
    load_exness_xauusdm_m15,
    _segments,
    _is_bounded_market_closure,
    _classify_market_gap,
)


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _write_exness_fixture(root: Path) -> Path:
    folder = root / "datasets/exness/demo/xauusdm_m15"
    folder.mkdir(parents=True)
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(12):
        ts = (start + timedelta(minutes=15 * i)).isoformat()
        rows.append({
            "timestamp": ts, "open": str(2000 + i), "high": str(2002 + i),
            "low": str(1999 + i), "close": str(2001 + i), "volume": "10.5",
            "tick_volume": "100", "spread_points": "20", "spread_price": "0.020",
            "real_volume": "0",
        })
    csv_path = folder / "ohlcv.csv"
    columns = list(rows[0])
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    csv_bytes = csv_path.read_bytes()

    metadata = {
        "sha256": _digest(csv_bytes), "size_bytes": len(csv_bytes), "bar_count": len(rows),
        "symbol": "XAUUSDm", "timeframe": "M15", "account_mode": "DEMO",
        "account_identifier_stored": False,
        "first_bar_utc": rows[0]["timestamp"], "last_closed_bar_utc": rows[-1]["timestamp"],
    }
    metadata_bytes = json.dumps(metadata, sort_keys=True).encode()
    (folder / "metadata.json").write_bytes(metadata_bytes)
    manifest = {
        "dataset_id": "exness-test-dataset", "source": "test fixture",
        "symbol": "XAUUSDm", "timeframe": "M15", "benchmark_eligibility": "candidate_only",
        "csv_file": "ohlcv.csv", "csv_size_bytes": len(csv_bytes), "csv_sha256": _digest(csv_bytes),
        "metadata_file": "metadata.json", "source_metadata_size_bytes": len(metadata_bytes),
        "metadata_source_sha256": _digest(metadata_bytes), "row_count": len(rows),
        "first_bar_utc": rows[0]["timestamp"], "last_closed_bar_utc": rows[-1]["timestamp"],
    }
    (folder / "dataset_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return folder


def _write_exness_h1_fixture(
    root: Path,
    timestamps: list[str],
    *,
    training_eligible: bool = True,
    volumes: list[str] | None = None,
) -> Path:
    folder = root / "data/market/exness"
    folder.mkdir(parents=True)
    volumes = volumes or [str(100 + index) for index in range(len(timestamps))]
    rows = [
        {
            "timestamp_utc": stamp,
            "open": "2000.000",
            "high": "2002.000",
            "low": "1999.000",
            "close": "2001.000",
            "tick_volume": volume,
        }
        for stamp, volume in zip(timestamps, volumes, strict=True)
    ]
    csv_path = folder / "XAUUSDm_H1_3Y.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=[
            "timestamp_utc", "open", "high", "low", "close", "tick_volume"
        ])
        writer.writeheader()
        writer.writerows(rows)
    raw = csv_path.read_bytes()
    parsed = [
        datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        for stamp in timestamps
    ]
    classifications = [
        _classify_market_gap(
            previous, current, timedelta(hours=1), symbol="XAUUSDm"
        )
        for previous, current in zip(parsed[:-1], parsed[1:])
    ]
    hours = [
        (current - previous).total_seconds() / 3600
        for previous, current in zip(parsed[:-1], parsed[1:])
    ]
    unexplained_gaps = [
        {
            "from_utc": previous.isoformat().replace("+00:00", "Z"),
            "to_utc": current.isoformat().replace("+00:00", "Z"),
            "hours": gap_hours,
            "classification": "unexplained",
        }
        for previous, current, gap_hours, classification in zip(
            parsed[:-1], parsed[1:], hours, classifications
        )
        if classification == "unexplained"
    ]
    manifest = {
        "dataset": "Exness XAUUSD H1 historical OHLCV",
        "source": "Exness MT5 Demo synthetic test fixture",
        "account_environment": "Demo",
        "symbol": "XAUUSDm",
        "timeframe": "H1",
        "timezone": "UTC",
        "price_basis": "MT5 broker chart OHLC (Bid chart mode)",
        "rows": len(rows),
        "columns": ["timestamp_utc", "open", "high", "low", "close", "tick_volume"],
        "first_timestamp_utc": timestamps[0],
        "last_completed_bar_utc": timestamps[-1],
        "csv_bytes": len(raw),
        "sha256_csv": _digest(raw),
        "training_eligible": training_eligible,
        "completeness_status": "PASS" if training_eligible else "BLOCKED_MISSING_HISTORICAL_SEGMENT",
        "max_allowed_gap_hours_for_training": 96,
        "tick_volume_min": str(min(Decimal(value) for value in volumes)),
        "tick_volume_max": str(max(Decimal(value) for value in volumes)),
        "tick_volume_zero_rows": sum(Decimal(value) == 0 for value in volumes),
        "gap_audit": {
            "gap_count_over_1h": sum(
                classification != "contiguous" for classification in classifications
            ),
            "gap_count_over_96h": sum(gap > 96 for gap in hours),
            "largest_gap_hours": max(hours, default=0),
            "recognized_daily_rollover_count": classifications.count("daily_rollover"),
            "recognized_weekend_closure_count": classifications.count("weekend_closure"),
            "unexplained_gap_count": classifications.count("unexplained"),
            "unexplained_gaps": unexplained_gaps,
        },
    }
    (folder / "XAUUSDm_H1_3Y.manifest.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    return folder


def test_exness_h1_loader_requires_explicit_research_training_opt_in(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-03T00:00:00Z", "2025-11-03T01:00:00Z", "2025-11-03T02:00:00Z"],
    )
    with pytest.raises(DatasetEligibilityError):
        load_exness_xauusdm_h1(tmp_path)


def test_exness_h1_loader_verifies_manifest_and_preserves_mt5_tick_volume(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-03T00:00:00Z", "2025-11-03T01:00:00Z", "2025-11-03T02:00:00Z"],
    )
    dataset = load_exness_xauusdm_h1(tmp_path, allow_research_training=True)
    assert dataset.dataset_id == EXNESS_H1_DATASET_ID
    assert dataset.symbol == "XAUUSDm"
    assert dataset.timeframe == "H1"
    assert dataset.bars[0].volume == Decimal("100")
    assert dataset.bars[0].extras["tick_volume"] == "100"
    assert dataset.unexplained_gap_after_indices == ()
    assert dataset.benchmark_eligible is False
    assert dataset.live_feed is False


def test_exness_h1_loader_accepts_documented_daily_rollover_windows(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-03T21:00:00Z", "2025-11-03T23:00:00Z"],
    )
    dataset = load_exness_xauusdm_h1(tmp_path, allow_research_training=True)
    assert dataset.unexplained_gap_after_indices == ()
    assert len(_segments(dataset.bars, dataset.timeframe, symbol=dataset.symbol)) == 1


def test_exness_h1_loader_accepts_summer_rollover_window(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-03-10T20:00:00Z", "2025-03-10T22:00:00Z"],
    )
    dataset = load_exness_xauusdm_h1(tmp_path, allow_research_training=True)
    assert dataset.unexplained_gap_after_indices == ()


def test_exness_h1_loader_rejects_unrecognized_weekday_gap(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-03T19:00:00Z", "2025-11-03T23:00:00Z"],
    )
    with pytest.raises(DatasetEligibilityError, match="unexplained historical gaps"):
        load_exness_xauusdm_h1(tmp_path, allow_research_training=True)


def test_rollover_window_is_specific_to_exness_gold_symbol():
    previous = datetime.fromisoformat("2025-11-03T21:00:00+00:00")
    current = datetime.fromisoformat("2025-11-03T23:00:00+00:00")
    assert _is_bounded_market_closure(
        previous, current, timedelta(hours=1), symbol="XAUUSDm"
    )
    assert not _is_bounded_market_closure(
        previous, current, timedelta(hours=1), symbol="BTCUSDT"
    )


def test_exness_h1_loader_keeps_bounded_weekend_closure_in_one_segment(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-07T21:00:00Z", "2025-11-09T23:00:00Z"],
    )
    dataset = load_exness_xauusdm_h1(tmp_path, allow_research_training=True)
    assert dataset.gap_after_indices == (1,)
    assert dataset.unexplained_gap_after_indices == ()
    assert len(dataset.bars) == 2
    assert len(_segments(dataset.bars, dataset.timeframe, symbol=dataset.symbol)) == 1


def test_exness_h1_loader_blocks_manifest_incomplete_7419_hour_gap(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-12-31T21:00:00Z", "2026-11-06T00:00:00Z"],
        training_eligible=False,
    )
    with pytest.raises(DatasetEligibilityError, match="unexplained historical gaps"):
        load_exness_xauusdm_h1(tmp_path, allow_research_training=True)


def test_exness_h1_loader_rechecks_data_even_if_manifest_claims_training_eligible(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-12-31T21:00:00Z", "2026-11-06T00:00:00Z"],
        training_eligible=True,
    )
    with pytest.raises(DatasetEligibilityError, match="unexplained historical gaps"):
        load_exness_xauusdm_h1(tmp_path, allow_research_training=True)


def test_exness_h1_loader_rejects_manifest_gap_classification_count_mismatch(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-03T21:00:00Z", "2025-11-03T23:00:00Z"],
    )
    manifest_path = tmp_path / "data/market/exness/XAUUSDm_H1_3Y.manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["gap_audit"]["recognized_daily_rollover_count"] = 0
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(DataSourceError, match="gap classification/statistics"):
        load_exness_xauusdm_h1(tmp_path, allow_research_training=True)


def test_exness_h1_loader_requires_the_declared_96_hour_training_threshold(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-03T00:00:00Z", "2025-11-03T01:00:00Z"],
    )
    manifest_path = tmp_path / "data/market/exness/XAUUSDm_H1_3Y.manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["max_allowed_gap_hours_for_training"] = 72
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(DataSourceError, match="maximum allowed historical gap"):
        load_exness_xauusdm_h1(tmp_path, allow_research_training=True)


def test_exness_h1_loader_rejects_fractional_tick_volume(tmp_path):
    _write_exness_h1_fixture(
        tmp_path,
        ["2025-11-03T00:00:00Z", "2025-11-03T01:00:00Z"],
        volumes=["100.5", "101"],
    )
    with pytest.raises(DataSourceError, match="tick_volume must be a non-negative integer"):
        load_exness_xauusdm_h1(tmp_path, allow_research_training=True)


def test_exness_loader_requires_candidate_training_opt_in(tmp_path):
    _write_exness_fixture(tmp_path)
    with pytest.raises(DatasetEligibilityError):
        load_exness_xauusdm_m15(tmp_path)


def test_exness_loader_checks_csv_and_metadata_provenance(tmp_path):
    _write_exness_fixture(tmp_path)
    dataset = load_exness_xauusdm_m15(tmp_path, allow_research_training=True)
    assert len(dataset.bars) == 12
    assert dataset.symbol == "XAUUSDm"
    assert dataset.bars[0].volume == Decimal("100")
    assert dataset.bars[0].extras["tick_volume"] == "100"
    assert dataset.eligibility == "candidate_only"
    assert dataset.benchmark_eligible is False
    assert dataset.live_feed is False
    assert dataset.sha256

    metadata_path = tmp_path / "datasets/exness/demo/xauusdm_m15/metadata.json"
    metadata_path.write_text(metadata_path.read_text() + " ", encoding="utf-8")
    with pytest.raises(DataSourceError, match="metadata hash"):
        load_exness_xauusdm_m15(tmp_path, allow_research_training=True)


def test_binance_loader_preserves_decimal_tokens_and_detects_gaps(tmp_path):
    folder = tmp_path / "datasets/public/binance/btcusdt_h1"
    folder.mkdir(parents=True)
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    stamps = [start, start + timedelta(hours=1), start + timedelta(hours=3)]
    bars = []
    for stamp in stamps:
        bars.append({
            "timestamp": stamp.isoformat(),
            "close_timestamp": (stamp + timedelta(hours=1) - timedelta(milliseconds=1)).isoformat(),
            "is_closed": True, "open": 100.123456789, "high": 101.0, "low": 99.0,
            "close": 100.5, "volume": 5.25, "source": "binance_public",
        })
    payload = {"symbol": "BTCUSDT", "timeframe": "1h", "bars": bars}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    (folder / "snapshot.json").write_bytes(raw)
    manifest = {
        "symbol": "BTCUSDT", "timeframe": "1h", "source": "Binance public klines API",
        "five_year": {
            "file": "snapshot.json", "row_count": 3, "first_bar_utc": stamps[0].isoformat(),
            "last_bar_utc": stamps[-1].isoformat(), "bytes": len(raw), "sha256": _digest(raw),
        },
    }
    (folder / "dataset_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(DatasetEligibilityError):
        load_binance_btcusdt_h1(tmp_path)
    dataset = load_binance_btcusdt_h1(tmp_path, allow_research_training=True)
    assert dataset.bars[0].open == Decimal("100.123456789")
    assert dataset.missing_interval_count == 1
    assert dataset.gap_after_indices == (2,)


def test_chronological_split_purges_horizon_and_embargo_and_reserves_test():
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    bars = tuple(
        MarketBar(start + timedelta(hours=i), Decimal("10"), Decimal("11"),
                  Decimal("9"), Decimal("10"), Decimal("1"), {})
        for i in range(100)
    )
    dataset = MarketDataset(
        dataset_id=BINANCE_5Y_DATASET_ID, source="test", symbol="BTCUSDT",
        timeframe="1h", bars=bars, sha256="test", size_bytes=1,
        eligibility="historical_research_candidate", benchmark_eligible=False,
        live_feed=False, missing_interval_count=0, gap_after_indices=(),
    )
    splits = chronological_splits(
        dataset, label_horizon_bars=3, embargo_bars=2,
    )
    assert len(splits.train.bars) == 57
    assert len(splits.validation.bars) == 15
    assert len(splits.test.bars) == 18
    assert splits.train.bars[-1].timestamp < splits.validation.bars[0].timestamp
    assert splits.validation.bars[-1].timestamp < splits.test.bars[0].timestamp
    assert splits.test.name == "test_reserved"
    assert splits.test_reserved is True


def test_chronological_split_rejects_too_small_dataset():
    dataset = MarketDataset(
        dataset_id="small", source="test", symbol="XAUUSDm", timeframe="15m",
        bars=(), sha256="test", size_bytes=0, eligibility="candidate_only",
        benchmark_eligible=False, live_feed=False, missing_interval_count=0,
        gap_after_indices=(),
    )
    with pytest.raises(DataSourceError):
        chronological_splits(dataset, label_horizon_bars=1, embargo_bars=0)
