"""Verified read-only market dataset loaders for NOVA Learning Engine.

The loaders consume versioned files under the repository datasets/ directory.
They never download data, connect to brokers, or synthesize candles.
"""
from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Mapping, Sequence


class DataSourceError(ValueError):
    """Dataset missing, corrupt, inconsistent, or outside its declared contract."""


class DatasetEligibilityError(DataSourceError):
    """Dataset is candidate-only and requires explicit research-training opt-in."""


@dataclass(frozen=True)
class MarketBar:
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    extras: Mapping[str, str]


@dataclass(frozen=True)
class MarketDataset:
    dataset_id: str
    source: str
    symbol: str
    timeframe: str
    bars: tuple[MarketBar, ...]
    sha256: str
    size_bytes: int
    eligibility: str
    benchmark_eligible: bool
    live_feed: bool
    missing_interval_count: int
    gap_after_indices: tuple[int, ...]


@dataclass(frozen=True)
class DataPartition:
    name: str
    bars: tuple[MarketBar, ...]
    segments: tuple[tuple[MarketBar, ...], ...]


@dataclass(frozen=True)
class ChronologicalSplits:
    train: DataPartition
    validation: DataPartition
    test: DataPartition
    label_horizon_bars: int
    embargo_bars: int
    test_reserved: bool = True


EXNESS_DATASET_ID = "exness_xauusdm_m15"
BINANCE_5Y_DATASET_ID = "binance_btcusdt_h1_5y"
BINANCE_500_DATASET_ID = "binance_btcusdt_h1_500"


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
    except FileNotFoundError as exc:
        raise DataSourceError(f"Dataset file not found: {path}") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DataSourceError(f"Invalid JSON dataset file: {path}") from exc


def _parse_utc(value: Any) -> datetime:
    if not isinstance(value, str):
        raise DataSourceError(f"Timestamp must be an ISO string, got {value!r}")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DataSourceError(f"Invalid ISO timestamp: {value!r}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise DataSourceError(f"Timestamp must include a timezone: {value!r}")
    if parsed.utcoffset() != timedelta(0):
        raise DataSourceError(f"Timestamp must be expressed in UTC: {value!r}")
    return parsed.astimezone(timezone.utc)


def _decimal(record: Mapping[str, Any], key: str) -> Decimal:
    try:
        value = record[key]
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    except (KeyError, InvalidOperation, TypeError, ValueError) as exc:
        raise DataSourceError(f"Invalid or missing numeric field {key!r}") from exc
    if not parsed.is_finite():
        raise DataSourceError(f"Non-finite numeric field {key!r}")
    return parsed


def _timeframe_delta(timeframe: str) -> timedelta:
    normalized = timeframe.strip().lower()
    try:
        if normalized.endswith("m"):
            return timedelta(minutes=int(normalized[:-1]))
        if normalized.endswith("h"):
            return timedelta(hours=int(normalized[:-1]))
        if normalized.endswith("d"):
            return timedelta(days=int(normalized[:-1]))
    except ValueError as exc:
        raise DataSourceError(f"Unsupported timeframe: {timeframe}") from exc
    raise DataSourceError(f"Unsupported timeframe: {timeframe}")


def _check_ohlcv(bar: MarketBar) -> None:
    if min(bar.open, bar.high, bar.low, bar.close) <= 0:
        raise DataSourceError(f"Non-positive OHLC value at {bar.timestamp.isoformat()}")
    if bar.volume < 0:
        raise DataSourceError(f"Negative volume at {bar.timestamp.isoformat()}")
    if bar.high < max(bar.open, bar.close) or bar.low > min(bar.open, bar.close):
        raise DataSourceError(f"Invalid OHLC envelope at {bar.timestamp.isoformat()}")
    if bar.high < bar.low:
        raise DataSourceError(f"High is below low at {bar.timestamp.isoformat()}")


def _audit_timeline(
    bars: Sequence[MarketBar], timeframe: str
) -> tuple[int, tuple[int, ...]]:
    if not bars:
        raise DataSourceError("Dataset contains no bars")
    interval = _timeframe_delta(timeframe)
    missing = 0
    gaps: list[int] = []
    previous = bars[0].timestamp
    for index, bar in enumerate(bars):
        if index:
            delta = bar.timestamp - previous
            if delta <= timedelta(0):
                raise DataSourceError("Timestamps are duplicate or not strictly ascending")
            if delta.total_seconds() % interval.total_seconds() != 0:
                raise DataSourceError("Timestamp is not aligned to the declared timeframe")
            if delta > interval:
                missing_count = int(delta.total_seconds() // interval.total_seconds()) - 1
                missing += missing_count
                gaps.append(index)
        previous = bar.timestamp
    return missing, tuple(gaps)


def _segments(bars: Sequence[MarketBar], timeframe: str) -> tuple[tuple[MarketBar, ...], ...]:
    if not bars:
        return ()
    interval = _timeframe_delta(timeframe)
    result: list[tuple[MarketBar, ...]] = []
    current: list[MarketBar] = [bars[0]]
    for bar in bars[1:]:
        if bar.timestamp - current[-1].timestamp != interval:
            result.append(tuple(current))
            current = [bar]
        else:
            current.append(bar)
    result.append(tuple(current))
    return tuple(result)


def _partition(name: str, bars: Sequence[MarketBar], timeframe: str) -> DataPartition:
    frozen = tuple(bars)
    return DataPartition(name=name, bars=frozen, segments=_segments(frozen, timeframe))


def load_exness_xauusdm_m15(
    repo_root: str | Path,
    *,
    allow_research_training: bool = False,
) -> MarketDataset:
    """Load the Exness Demo XAUUSDm M15 candidate dataset after byte verification.

    The dataset is candidate_only and is not the separately frozen Wave3
    benchmark. Training use requires allow_research_training=True.
    """
    if not allow_research_training:
        raise DatasetEligibilityError(
            "Exness dataset is candidate_only; set allow_research_training=True "
            "for explicitly labelled exploratory training"
        )
    data_dir = Path(repo_root) / "datasets/exness/demo/xauusdm_m15"
    manifest_path = data_dir / "dataset_manifest.json"
    manifest = _read_json(manifest_path)
    csv_name = str(manifest.get("csv_file", ""))
    metadata_name = str(manifest.get("metadata_file", "source_metadata.json"))
    if Path(csv_name).name != csv_name or Path(metadata_name).name != metadata_name:
        raise DataSourceError("Manifest file paths must be local basenames")
    csv_path, metadata_path = data_dir / csv_name, data_dir / metadata_name

    try:
        csv_bytes = csv_path.read_bytes()
        metadata_bytes = metadata_path.read_bytes()
    except FileNotFoundError as exc:
        raise DataSourceError(f"Required Exness dataset artifact is missing: {exc.filename}") from exc

    csv_hash = _sha256_bytes(csv_bytes)
    metadata_hash = _sha256_bytes(metadata_bytes)
    if len(csv_bytes) != int(manifest["csv_size_bytes"]) or csv_hash != manifest["csv_sha256"]:
        raise DataSourceError("Exness CSV size/hash does not match dataset manifest")
    if len(metadata_bytes) != int(manifest["source_metadata_size_bytes"]):
        raise DataSourceError("Exness source metadata size does not match manifest")
    if metadata_hash != manifest["metadata_source_sha256"]:
        raise DataSourceError("Exness source metadata hash does not match manifest")

    try:
        metadata = json.loads(metadata_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DataSourceError("Exness source metadata is invalid JSON") from exc
    if metadata.get("sha256") != csv_hash or metadata.get("size_bytes") != len(csv_bytes):
        raise DataSourceError("Exness source metadata does not describe the verified CSV")
    if metadata.get("account_mode") != "DEMO" or metadata.get("account_identifier_stored") is not False:
        raise DataSourceError("Exness source metadata fails account-safety checks")
    for key in ("symbol", "timeframe", "bar_count", "first_bar_utc", "last_closed_bar_utc"):
        manifest_key = "row_count" if key == "bar_count" else key
        if metadata.get(key) != manifest.get(manifest_key):
            raise DataSourceError(f"Exness metadata/manifest mismatch: {key}")

    bars: list[MarketBar] = []
    try:
        import io
        stream = io.StringIO(csv_bytes.decode("utf-8-sig"), newline="")
        reader = csv.DictReader(stream)
        required = {
            "timestamp", "open", "high", "low", "close", "volume",
            "tick_volume", "spread_points", "spread_price", "real_volume",
        }
        if set(reader.fieldnames or ()) != required:
            raise DataSourceError("Unexpected Exness CSV columns")
        for row in reader:
            bar = MarketBar(
                timestamp=_parse_utc(row["timestamp"]),
                open=_decimal(row, "open"),
                high=_decimal(row, "high"),
                low=_decimal(row, "low"),
                close=_decimal(row, "close"),
                volume=_decimal(row, "tick_volume"),
                extras={
                    key: row[key]
                    for key in ("tick_volume", "spread_points", "spread_price", "real_volume")
                },
            )
            _check_ohlcv(bar)
            bars.append(bar)
    except UnicodeDecodeError as exc:
        raise DataSourceError("Exness CSV is not valid UTF-8") from exc

    if len(bars) != int(manifest["row_count"]):
        raise DataSourceError("Exness CSV row count does not match manifest")
    if not bars:
        raise DataSourceError("Exness CSV is empty")
    if bars[0].timestamp != _parse_utc(manifest["first_bar_utc"]):
        raise DataSourceError("Exness first timestamp does not match manifest")
    if bars[-1].timestamp != _parse_utc(manifest["last_closed_bar_utc"]):
        raise DataSourceError("Exness last timestamp does not match manifest")
    missing, gaps = _audit_timeline(bars, manifest["timeframe"])
    return MarketDataset(
        dataset_id=str(manifest["dataset_id"]),
        source=str(manifest["source"]),
        symbol=str(manifest["symbol"]),
        timeframe=str(manifest["timeframe"]),
        bars=tuple(bars),
        sha256=csv_hash,
        size_bytes=len(csv_bytes),
        eligibility=str(manifest.get("benchmark_eligibility", "candidate_only")),
        benchmark_eligible=False,
        live_feed=False,
        missing_interval_count=missing,
        gap_after_indices=gaps,
    )


def load_binance_btcusdt_h1(
    repo_root: str | Path,
    *,
    snapshot: str = "five_year",
    allow_research_training: bool = False,
) -> MarketDataset:
    """Load a Binance historical snapshot, preserving stored JSON decimals."""
    if not allow_research_training:
        raise DatasetEligibilityError(
            "Binance snapshot is a historical research candidate; "
            "set allow_research_training=True for exploratory training"
        )
    if snapshot not in {"five_year", "recent_500"}:
        raise DataSourceError("snapshot must be 'five_year' or 'recent_500'")
    data_dir = Path(repo_root) / "datasets/public/binance/btcusdt_h1"
    manifest = _read_json(data_dir / "dataset_manifest.json")
    entry = manifest["five_year"] if snapshot == "five_year" else manifest["recent_500"]
    filename = str(entry.get("file", ""))
    if Path(filename).name != filename:
        raise DataSourceError("Binance manifest file path must be a local basename")
    data_path = data_dir / filename
    try:
        raw = data_path.read_bytes()
    except FileNotFoundError as exc:
        raise DataSourceError(f"Required Binance snapshot is missing: {exc.filename}") from exc
    digest = _sha256_bytes(raw)
    if len(raw) != int(entry["bytes"]) or digest != entry["sha256"]:
        raise DataSourceError("Binance snapshot size/hash does not match dataset manifest")
    try:
        payload = json.loads(raw.decode("utf-8"), parse_float=Decimal)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DataSourceError("Binance snapshot is not valid JSON") from exc
    if payload.get("symbol") != manifest["symbol"] or payload.get("timeframe") != manifest["timeframe"]:
        raise DataSourceError("Binance snapshot symbol/timeframe differs from manifest")
    raw_bars = payload.get("bars")
    if not isinstance(raw_bars, list) or len(raw_bars) != int(entry["row_count"]):
        raise DataSourceError("Binance snapshot row count differs from manifest")

    bars: list[MarketBar] = []
    for item in raw_bars:
        if item.get("is_closed") is not True:
            raise DataSourceError("Binance snapshot contains an unclosed candle")
        bar = MarketBar(
            timestamp=_parse_utc(item.get("timestamp")),
            open=_decimal(item, "open"),
            high=_decimal(item, "high"),
            low=_decimal(item, "low"),
            close=_decimal(item, "close"),
            volume=_decimal(item, "volume"),
            extras={"source": str(item.get("source", "unknown"))},
        )
        _check_ohlcv(bar)
        close_timestamp = _parse_utc(item.get("close_timestamp"))
        if close_timestamp < bar.timestamp or close_timestamp >= bar.timestamp + _timeframe_delta(manifest["timeframe"]):
            raise DataSourceError("Binance close timestamp is outside its candle interval")
        bars.append(bar)

    missing, gaps = _audit_timeline(bars, manifest["timeframe"])
    if bars[0].timestamp != _parse_utc(entry["first_bar_utc"]):
        raise DataSourceError("Binance first timestamp differs from manifest")
    if bars[-1].timestamp != _parse_utc(entry["last_bar_utc"]):
        raise DataSourceError("Binance last timestamp differs from manifest")
    return MarketDataset(
        dataset_id=f"binance_btcusdt_h1_{snapshot}",
        source=str(manifest["source"]),
        symbol=str(manifest["symbol"]),
        timeframe=str(manifest["timeframe"]),
        bars=tuple(bars),
        sha256=digest,
        size_bytes=len(raw),
        eligibility="historical_research_candidate",
        benchmark_eligible=False,
        live_feed=False,
        missing_interval_count=missing,
        gap_after_indices=gaps,
    )


def load_market_dataset(
    repo_root: str | Path,
    dataset_id: str,
    *,
    allow_research_training: bool = False,
) -> MarketDataset:
    if dataset_id == EXNESS_DATASET_ID:
        return load_exness_xauusdm_m15(repo_root, allow_research_training=allow_research_training)
    if dataset_id == BINANCE_5Y_DATASET_ID:
        return load_binance_btcusdt_h1(
            repo_root, snapshot="five_year", allow_research_training=allow_research_training
        )
    if dataset_id == BINANCE_500_DATASET_ID:
        return load_binance_btcusdt_h1(
            repo_root, snapshot="recent_500", allow_research_training=allow_research_training
        )
    raise DataSourceError(f"Unknown NOVA market dataset id: {dataset_id}")


def chronological_splits(
    dataset: MarketDataset,
    *,
    label_horizon_bars: int,
    embargo_bars: int,
    train_ratio: float = 0.60,
    validation_ratio: float = 0.20,
) -> ChronologicalSplits:
    """Create ordered train/validation/reserved-test partitions with purge/embargo.

    The final test partition is returned for one final evaluation only. It must
    not be used for feature selection, hyperparameter tuning, or model promotion.
    """
    if label_horizon_bars < 1 or embargo_bars < 0:
        raise DataSourceError("label_horizon_bars must be >= 1 and embargo_bars >= 0")
    if not 0 < train_ratio < 1 or not 0 < validation_ratio < 1:
        raise DataSourceError("split ratios must be between zero and one")
    if train_ratio + validation_ratio >= 1:
        raise DataSourceError("train_ratio + validation_ratio must be below one")
    bars = dataset.bars
    n = len(bars)
    train_boundary = int(n * train_ratio)
    validation_boundary = int(n * (train_ratio + validation_ratio))

    train_end = train_boundary - label_horizon_bars
    validation_start = train_boundary + embargo_bars
    validation_end = validation_boundary - label_horizon_bars
    test_start = validation_boundary + embargo_bars
    if train_end <= 0 or validation_end <= validation_start or test_start >= n:
        raise DataSourceError("Not enough bars for the requested purge/embargo split")

    train_bars = bars[:train_end]
    validation_bars = bars[validation_start:validation_end]
    test_bars = bars[test_start:]
    return ChronologicalSplits(
        train=_partition("train", train_bars, dataset.timeframe),
        validation=_partition("validation", validation_bars, dataset.timeframe),
        test=_partition("test_reserved", test_bars, dataset.timeframe),
        label_horizon_bars=label_horizon_bars,
        embargo_bars=embargo_bars,
        test_reserved=True,
    )
